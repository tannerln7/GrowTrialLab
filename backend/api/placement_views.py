from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field
from uuid import UUID

from django.db import transaction
from django.db.models import Max
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .baseline import BASELINE_WEEK_NUMBER
from .models import Block, Experiment, Plant, PlantWeeklyMetric, Recipe, Tent, Tray, TrayPlant
from .tent_restrictions import tent_allows_species
from .tray_assignment import experiment_tray_placements

AUTOPLACE_REASON_NO_COMPATIBLE_TRAYS = "no_compatible_trays"
AUTOPLACE_REASON_COMPATIBLE_TRAYS_FULL = "compatible_trays_full"
AUTOPLACE_REASON_RESTRICTION_CONFLICT = "restriction_conflict"
AUTOPLACE_REASON_NO_TENTED_BLOCKS = "no_tented_blocks"


@dataclass
class TrayAutoState:
    tray: Tray
    species_ids: set[str]
    current_count: int
    next_order: int
    new_plants: list[Plant] = field(default_factory=list)
    planned_block: Block | None = None


def _require_app_user(request):
    app_user = getattr(request, "app_user", None)
    if app_user is None:
        return Response({"detail": "Not authenticated."}, status=403)
    return None


def _get_experiment(experiment_id: UUID):
    return Experiment.objects.filter(id=experiment_id).first()


PLACEMENT_LOCK_MESSAGE = (
    "Placement cannot be edited while the experiment is running. Stop the experiment to change placement."
)


def _placement_locked_response() -> Response:
    return Response({"detail": PLACEMENT_LOCK_MESSAGE}, status=409)


def _is_running(experiment: Experiment) -> bool:
    return experiment.lifecycle_state == Experiment.LifecycleState.RUNNING


def _plant_sort_key(plant: Plant) -> tuple[str, str, str, str]:
    return (
        (plant.bin or "").upper(),
        (plant.plant_id or "").lower(),
        plant.created_at.isoformat(),
        str(plant.id),
    )


def _tent_allowed_species_map(experiment: Experiment) -> dict[str, set[str] | None]:
    allowed_map: dict[str, set[str] | None] = {}
    tents = list(Tent.objects.filter(experiment=experiment).prefetch_related("allowed_species"))
    for tent in tents:
        allowed_ids = {str(species_id) for species_id in tent.allowed_species.values_list("id", flat=True)}
        allowed_map[str(tent.id)] = allowed_ids if allowed_ids else None
    return allowed_map


def _compatible_blocks_for_species(
    species_ids: set[str],
    blocks: list[Block],
    tent_allowed_map: dict[str, set[str] | None],
    cache: dict[frozenset[str], list[Block]],
) -> list[Block]:
    key = frozenset(species_ids)
    cached = cache.get(key)
    if cached is not None:
        return cached

    compatible: list[Block] = []
    for block in blocks:
        tent_key = str(block.tent.id)
        allowed_ids = tent_allowed_map.get(tent_key)
        if allowed_ids is None or species_ids.issubset(allowed_ids):
            compatible.append(block)

    cache[key] = compatible
    return compatible


def _diagnose_unplaceable_reason(
    plant: Plant,
    tray_states: list[TrayAutoState],
    blocks: list[Block],
    tent_allowed_map: dict[str, set[str] | None],
    cache: dict[frozenset[str], list[Block]],
) -> str:
    if not blocks:
        return AUTOPLACE_REASON_NO_TENTED_BLOCKS
    if not tray_states:
        return AUTOPLACE_REASON_NO_COMPATIBLE_TRAYS

    has_restriction_compatible_tray = False
    has_capacity = False
    for state in tray_states:
        species_after = set(state.species_ids)
        species_after.add(str(plant.species.id))
        compatible_blocks = _compatible_blocks_for_species(
            species_after,
            blocks,
            tent_allowed_map,
            cache,
        )
        if not compatible_blocks:
            continue
        has_restriction_compatible_tray = True
        used = state.current_count + len(state.new_plants)
        if used < state.tray.capacity:
            has_capacity = True
            break

    if has_capacity:
        return AUTOPLACE_REASON_NO_COMPATIBLE_TRAYS
    if has_restriction_compatible_tray:
        return AUTOPLACE_REASON_COMPATIBLE_TRAYS_FULL
    return AUTOPLACE_REASON_RESTRICTION_CONFLICT


def _serialize_unplaceable_plant(plant: Plant, reason: str) -> dict[str, str]:
    return {
        "uuid": str(plant.id),
        "plant_id": plant.plant_id,
        "species_name": plant.species.name,
        "species_category": plant.species.category,
        "reason": reason,
    }


def _suggest_next_tray_name(experiment: Experiment, requested_name: str) -> str:
    match = re.match(r"^([A-Za-z]+)", requested_name)
    prefix = (match.group(1) if match else "TR").upper()
    pattern = re.compile(rf"^{re.escape(prefix)}(\d+)$", flags=re.IGNORECASE)
    highest = 0
    for name in Tray.objects.filter(experiment=experiment).values_list("name", flat=True):
        candidate = str(name).strip()
        found = pattern.match(candidate)
        if found:
            highest = max(highest, int(found.group(1)))
    return f"{prefix}{highest + 1}"


@api_view(["GET"])
def experiment_placement_summary(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    tents = list(
        Tent.objects.filter(experiment=experiment)
        .prefetch_related("allowed_species")
        .order_by("name", "id")
    )
    blocks = list(
        Block.objects.filter(tent__experiment=experiment)
        .select_related("tent")
        .order_by("tent__name", "name", "id")
    )
    trays = list(
        Tray.objects.filter(experiment=experiment)
        .select_related("block__tent", "assigned_recipe")
        .order_by("name")
    )
    tray_items_by_tray_id: dict[str, list[TrayPlant]] = {}
    for item in TrayPlant.objects.filter(tray__in=trays).select_related("plant__species").order_by(
        "order_index",
        "id",
    ):
        tray_items_by_tray_id.setdefault(str(item.tray.id), []).append(item)
    placement_map = experiment_tray_placements(experiment.id)
    placed_plant_ids = set(placement_map.keys())

    unplaced_active_qs = (
        Plant.objects.filter(experiment=experiment, status=Plant.Status.ACTIVE)
        .exclude(id__in=placed_plant_ids)
        .select_related("species", "assigned_recipe")
        .order_by("plant_id", "created_at", "id")
    )
    unplaced_active_count = unplaced_active_qs.count()
    unplaced_active = list(unplaced_active_qs[:50])
    unplaced_trays = [tray for tray in trays if tray.block is None]

    tray_counts_by_block: dict[str, int] = {}
    for tray in trays:
        if tray.block:
            block_key = str(tray.block.id)
            tray_counts_by_block[block_key] = tray_counts_by_block.get(block_key, 0) + 1

    tents_payload: list[dict] = []
    for tent in tents:
        tent_blocks = [block for block in blocks if block.tent.id == tent.id]
        tents_payload.append(
            {
                "tent_id": str(tent.id),
                "name": tent.name,
                "code": tent.code,
                "allowed_species_count": tent.allowed_species.count(),
                "allowed_species": [
                    {
                        "id": str(species.id),
                        "name": species.name,
                        "category": species.category,
                    }
                    for species in tent.allowed_species.all().order_by("name")
                ],
                "blocks": [
                    {
                        "block_id": str(block.id),
                        "name": block.name,
                        "description": block.description,
                        "tray_count": tray_counts_by_block.get(str(block.id), 0),
                    }
                    for block in tent_blocks
                ],
            }
        )

    tray_payload: list[dict] = []
    for tray in trays:
        tray_items = tray_items_by_tray_id.get(str(tray.id), [])
        active_items = [item for item in tray_items if item.plant.status == Plant.Status.ACTIVE]
        tray_payload.append(
            {
                "tray_id": str(tray.id),
                "name": tray.name,
                "tray_name": tray.name,
                "block_id": str(tray.block.id) if tray.block else None,
                "block_name": tray.block.name if tray.block else None,
                "tent_id": str(tray.block.tent.id) if tray.block else None,
                "tent_name": tray.block.tent.name if tray.block else None,
                "assigned_recipe_id": str(tray.assigned_recipe.id) if tray.assigned_recipe else None,
                "assigned_recipe_code": tray.assigned_recipe.code if tray.assigned_recipe else None,
                "assigned_recipe_name": tray.assigned_recipe.name if tray.assigned_recipe else None,
                # Compatibility aliases
                "recipe_id": str(tray.assigned_recipe.id) if tray.assigned_recipe else None,
                "recipe_code": tray.assigned_recipe.code if tray.assigned_recipe else None,
                "recipe_name": tray.assigned_recipe.name if tray.assigned_recipe else None,
                "capacity": tray.capacity,
                "current_count": len(tray_items),
                "plant_count": len(active_items),
                "placed_count": len(active_items),
                "plants": [
                    {
                        "tray_plant_id": str(tray_plant.id),
                        "uuid": str(tray_plant.plant.id),
                        "plant_id": tray_plant.plant.plant_id,
                        "species_id": str(tray_plant.plant.species.id),
                        "species_name": tray_plant.plant.species.name,
                        "species_category": tray_plant.plant.species.category,
                        "bin": tray_plant.plant.bin,
                        "status": tray_plant.plant.status,
                        "assigned_recipe_id": str(tray.assigned_recipe.id) if tray.assigned_recipe else None,
                        "assigned_recipe_code": tray.assigned_recipe.code if tray.assigned_recipe else None,
                        "assigned_recipe_name": tray.assigned_recipe.name if tray.assigned_recipe else None,
                    }
                    for tray_plant in tray_items
                ],
            }
        )

    return Response(
        {
            "tents": tents_payload,
            "trays": tray_payload,
            "unplaced_plants_count": unplaced_active_count,
            "unplaced_plants": [
                {
                    "uuid": str(plant.id),
                    "plant_id": plant.plant_id,
                    "species_id": str(plant.species.id),
                    "species_name": plant.species.name,
                    "species_category": plant.species.category,
                    "bin": plant.bin,
                    "status": plant.status,
                }
                for plant in unplaced_active
            ],
            "unplaced_trays": [
                {
                    "tray_id": str(tray.id),
                    "tray_name": tray.name,
                    "capacity": tray.capacity,
                    "current_count": len(tray_items_by_tray_id.get(str(tray.id), [])),
                    "assigned_recipe_id": str(tray.assigned_recipe.id) if tray.assigned_recipe else None,
                    "assigned_recipe_code": tray.assigned_recipe.code if tray.assigned_recipe else None,
                }
                for tray in unplaced_trays
            ],
            # Backward-compatible keys for existing clients.
            "unplaced_active_plants_count": unplaced_active_count,
            "unplaced_active_plants": [
                {
                    "uuid": str(plant.id),
                    "plant_id": plant.plant_id,
                    "species_name": plant.species.name,
                    "bin": plant.bin,
                    "assigned_recipe_code": plant.assigned_recipe.code if plant.assigned_recipe else None,
                }
                for plant in unplaced_active
            ],
        }
    )


@api_view(["POST"])
def experiment_trays(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)
    if _is_running(experiment):
        return _placement_locked_response()

    name = (request.data.get("name") or "").strip()
    if not name:
        return Response({"detail": "Tray name is required."}, status=400)

    if Tray.objects.filter(experiment=experiment, name=name).exists():
        return Response(
            {
                "detail": "Tray name already exists in this experiment.",
                "suggested_name": _suggest_next_tray_name(experiment, name),
            },
            status=409,
        )

    raw_capacity = request.data.get("capacity", 1)
    try:
        capacity = int(raw_capacity)
    except (TypeError, ValueError):
        return Response({"detail": "capacity must be an integer."}, status=400)
    if capacity < 1:
        return Response({"detail": "capacity must be at least 1."}, status=400)

    block_id = request.data.get("block_id")
    notes = (request.data.get("notes") or "").strip()

    block = None
    if block_id:
        block = Block.objects.filter(id=block_id, tent__experiment=experiment).first()
        if block is None:
            return Response({"detail": "Block not found for this experiment."}, status=400)

    assigned_recipe_id = request.data.get("assigned_recipe_id") or request.data.get("recipe_id")
    assigned_recipe = None
    if assigned_recipe_id:
        assigned_recipe = Recipe.objects.filter(id=assigned_recipe_id, experiment=experiment).first()
        if assigned_recipe is None:
            return Response({"detail": "Recipe not found for this experiment."}, status=400)

    tray = Tray.objects.create(
        experiment=experiment,
        name=name,
        block=block,
        assigned_recipe=assigned_recipe,
        capacity=capacity,
        notes=notes,
    )
    return Response(
        {
            "id": str(tray.id),
            "experiment": str(experiment.id),
            "name": tray.name,
            "block": str(tray.block.id) if tray.block else None,
            "assigned_recipe": str(tray.assigned_recipe.id) if tray.assigned_recipe else None,
            "recipe": str(tray.assigned_recipe.id) if tray.assigned_recipe else None,
            "capacity": tray.capacity,
            "current_count": 0,
            "notes": tray.notes,
        },
        status=201,
    )


@api_view(["POST"])
def tray_add_plant(request, tray_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    tray = Tray.objects.filter(id=tray_id).select_related("experiment", "block__tent", "assigned_recipe").first()
    if tray is None:
        return Response({"detail": "Tray not found."}, status=404)
    if _is_running(tray.experiment):
        return _placement_locked_response()

    plant_id = request.data.get("plant_id")
    if not plant_id:
        return Response({"detail": "plant_id is required."}, status=400)

    plant = Plant.objects.filter(id=plant_id).select_related("species", "assigned_recipe").first()
    if plant is None:
        return Response({"detail": "Plant not found."}, status=404)
    if plant.experiment.id != tray.experiment.id:
        return Response({"detail": "Plant and tray must belong to the same experiment."}, status=400)
    if plant.status == Plant.Status.REMOVED:
        return Response({"detail": "Removed plants cannot be placed in trays."}, status=400)
    if TrayPlant.objects.filter(plant=plant).exists():
        return Response({"detail": "Plant is already placed in another tray."}, status=400)

    current_count = TrayPlant.objects.filter(tray=tray).count()
    if current_count >= tray.capacity:
        return Response({"detail": f"Tray is full (capacity {tray.capacity})."}, status=409)

    if tray.block and tray.block.tent:
        tent = tray.block.tent
        if not tent_allows_species(tent, plant.species.id):
            return Response(
                {
                    "detail": (
                        f"Plant species '{plant.species.name}' is not allowed in tent "
                        f"'{tent.name}'."
                    )
                },
                status=409,
            )

    with transaction.atomic():
        max_order = TrayPlant.objects.filter(tray=tray).aggregate(max_order=Max("order_index"))["max_order"]
        next_order = 0 if max_order is None else max_order + 1
        tray_plant = TrayPlant.objects.create(
            tray=tray,
            plant=plant,
            order_index=next_order,
        )

    return Response(
        {
            "id": str(tray_plant.id),
            "tray": str(tray.id),
            "plant": str(plant.id),
            "order_index": tray_plant.order_index,
            "plant_id": plant.plant_id,
            "species_name": plant.species.name,
            "assigned_recipe_code": tray.assigned_recipe.code if tray.assigned_recipe else None,
            "bin": plant.bin,
            "tray_capacity": tray.capacity,
            "tray_current_count": current_count + 1,
        },
        status=201,
    )


@api_view(["DELETE"])
def tray_remove_plant(request, tray_id: UUID, tray_plant_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    tray_plant = (
        TrayPlant.objects.filter(id=tray_plant_id, tray_id=tray_id)
        .select_related("tray__experiment")
        .first()
    )
    if tray_plant is None:
        return Response({"detail": "Tray placement not found."}, status=404)
    if _is_running(tray_plant.tray.experiment):
        return _placement_locked_response()
    tray_plant.delete()
    return Response(status=204)


@api_view(["POST"])
def experiment_placement_auto(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)
    if _is_running(experiment):
        return _placement_locked_response()

    mode = (request.data.get("mode") or "bin_balance_v1").strip()
    if mode != "bin_balance_v1":
        return Response({"detail": "Unsupported auto placement mode."}, status=400)
    clear_existing = request.data.get("clear_existing")
    clear_existing = True if clear_existing is None else bool(clear_existing)

    tray_ids = request.data.get("tray_ids") or []
    if tray_ids and not isinstance(tray_ids, list):
        return Response({"detail": "tray_ids must be an array when provided."}, status=400)

    tray_queryset = Tray.objects.filter(experiment=experiment).select_related("assigned_recipe", "block__tent")
    if tray_ids:
        unique_ids = {str(item) for item in tray_ids}
        trays = list(
            tray_queryset.filter(id__in=unique_ids).order_by("name", "id")
        )
        if len(trays) != len(unique_ids):
            return Response({"detail": "One or more tray_ids are invalid for this experiment."}, status=400)
    else:
        trays = list(
            tray_queryset.filter(assigned_recipe__isnull=False)
            .order_by("name", "id")
        )

    if not trays:
        return Response({"detail": "At least one tray with a recipe is required for auto placement."}, status=409)
    if any(tray.assigned_recipe is None for tray in trays):
        return Response({"detail": "All selected trays must have a recipe assigned."}, status=409)

    active_plants = list(
        Plant.objects.filter(experiment=experiment, status=Plant.Status.ACTIVE)
        .select_related("species")
        .order_by("id")
    )
    baseline_plant_ids = {
        str(item)
        for item in PlantWeeklyMetric.objects.filter(
            experiment=experiment,
            week_number=BASELINE_WEEK_NUMBER,
        ).values_list("plant_id", flat=True)
    }
    missing_baseline_or_bin = [
        plant
        for plant in active_plants
        if str(plant.id) not in baseline_plant_ids or not plant.bin
    ]
    if missing_baseline_or_bin:
        return Response(
            {
                "detail": "Auto placement requires baseline week 0 and bin assignment for all active plants.",
                "missing_count": len(missing_baseline_or_bin),
            },
            status=409,
        )

    blocks = list(
        Block.objects.filter(tent__experiment=experiment)
        .select_related("tent")
        .order_by("tent__name", "name", "id")
    )

    existing_active_placements = {
        str(item)
        for item in TrayPlant.objects.filter(
            tray__experiment=experiment,
            plant__status=Plant.Status.ACTIVE,
        ).values_list("plant_id", flat=True)
    }

    candidate_plants = [
        plant
        for plant in active_plants
        if clear_existing or str(plant.id) not in existing_active_placements
    ]

    if not blocks and candidate_plants:
        diagnostics = [_serialize_unplaceable_plant(plant, AUTOPLACE_REASON_NO_TENTED_BLOCKS) for plant in candidate_plants]
        return Response(
            {
                "detail": "Could not auto-place all plants.",
                "remaining_unplaced_plants": len(diagnostics),
                "unplaceable_plants": diagnostics,
                "reason_counts": {AUTOPLACE_REASON_NO_TENTED_BLOCKS: len(diagnostics)},
            },
            status=409,
        )

    tent_allowed_map = _tent_allowed_species_map(experiment)
    compatibility_cache: dict[frozenset[str], list[Block]] = {}

    tray_items_by_tray_id: dict[str, list[TrayPlant]] = {}
    for item in TrayPlant.objects.filter(tray__in=trays).select_related("plant__species").order_by(
        "order_index",
        "id",
    ):
        tray_items_by_tray_id.setdefault(str(item.tray.id), []).append(item)

    tray_states: list[TrayAutoState] = []
    for tray in trays:
        tray_items = tray_items_by_tray_id.get(str(tray.id), [])
        retained_items = [
            item
            for item in tray_items
            if not (clear_existing and item.plant.status == Plant.Status.ACTIVE)
        ]
        retained_count = len(retained_items)
        if retained_count > tray.capacity:
            return Response(
                {
                    "detail": (
                        f"Tray '{tray.name}' has {retained_count} plants but capacity is {tray.capacity}. "
                        "Increase tray capacity or remove plants before auto-placement."
                    )
                },
                status=409,
            )

        next_order = (
            max((item.order_index for item in retained_items), default=-1) + 1
        )
        tray_states.append(
            TrayAutoState(
                tray=tray,
                species_ids={str(item.plant.species.id) for item in retained_items},
                current_count=retained_count,
                next_order=next_order,
            )
        )

    unplaceable_plants: list[dict[str, str]] = []
    plants_by_bin: dict[str, list[Plant]] = {}
    for plant in candidate_plants:
        plants_by_bin.setdefault(plant.bin or "", []).append(plant)

    for bin_key in sorted(plants_by_bin.keys()):
        remaining = sorted(plants_by_bin[bin_key], key=_plant_sort_key)
        while remaining:
            options_by_plant: dict[str, list[tuple[TrayAutoState, int, float, int]]] = {}
            reasons_by_plant: dict[str, str] = {}

            for plant in remaining:
                options: list[tuple[TrayAutoState, int, float, int]] = []
                for state in tray_states:
                    species_after = set(state.species_ids)
                    species_after.add(str(plant.species.id))
                    compatible_blocks = _compatible_blocks_for_species(
                        species_after,
                        blocks,
                        tent_allowed_map,
                        compatibility_cache,
                    )
                    if not compatible_blocks:
                        continue

                    used = state.current_count + len(state.new_plants)
                    remaining_capacity = state.tray.capacity - used
                    if remaining_capacity <= 0:
                        continue

                    fill_ratio = used / state.tray.capacity
                    options.append((state, remaining_capacity, fill_ratio, len(compatible_blocks)))

                if options:
                    options.sort(
                        key=lambda item: (
                            item[3],
                            -item[1],
                            item[2],
                            (item[0].tray.name.lower(), str(item[0].tray.id)),
                        )
                    )
                    options_by_plant[str(plant.id)] = options
                else:
                    reasons_by_plant[str(plant.id)] = _diagnose_unplaceable_reason(
                        plant,
                        tray_states,
                        blocks,
                        tent_allowed_map,
                        compatibility_cache,
                    )

            impossible = [plant for plant in remaining if str(plant.id) not in options_by_plant]
            for plant in impossible:
                reason = reasons_by_plant.get(str(plant.id), AUTOPLACE_REASON_NO_COMPATIBLE_TRAYS)
                unplaceable_plants.append(_serialize_unplaceable_plant(plant, reason))
            remaining = [plant for plant in remaining if str(plant.id) in options_by_plant]
            remaining_candidates: list[Plant] = list(remaining)

            if not remaining_candidates:
                break

            chosen = min(
                remaining_candidates,
                key=lambda plant: (
                    len(options_by_plant[str(plant.id)]),
                    _plant_sort_key(plant),
                ),
            )
            best_option = options_by_plant[str(chosen.id)][0]
            chosen_state = best_option[0]
            chosen_state.new_plants.append(chosen)
            chosen_state.species_ids.add(str(chosen.species.id))
            remaining = [plant for plant in remaining if plant.id != chosen.id]

    if unplaceable_plants:
        reason_counts = Counter(item["reason"] for item in unplaceable_plants)
        return Response(
            {
                "detail": "Could not auto-place all plants.",
                "remaining_unplaced_plants": len(unplaceable_plants),
                "unplaceable_plants": unplaceable_plants,
                "reason_counts": dict(reason_counts),
            },
            status=409,
        )

    selected_tray_ids = {state.tray.id for state in tray_states}
    block_load = Counter(
        str(item)
        for item in Tray.objects.filter(experiment=experiment)
        .exclude(id__in=selected_tray_ids)
        .exclude(block__isnull=True)
        .values_list("block_id", flat=True)
    )

    for state in sorted(
        tray_states,
        key=lambda item: (item.tray.name.lower(), str(item.tray.id)),
    ):
        total_count = state.current_count + len(state.new_plants)
        if total_count == 0:
            continue

        compatible_blocks = _compatible_blocks_for_species(
            set(state.species_ids),
            blocks,
            tent_allowed_map,
            compatibility_cache,
        )
        if not compatible_blocks:
            reason_counts = Counter(
                item["reason"] for item in unplaceable_plants
            )
            return Response(
                {
                    "detail": "Could not auto-place all plants.",
                    "remaining_unplaced_plants": len(unplaceable_plants),
                    "unplaceable_plants": unplaceable_plants,
                    "reason_counts": dict(reason_counts),
                },
                status=409,
            )

        compatible_blocks.sort(
            key=lambda block: (
                block_load.get(str(block.id), 0),
                0 if state.tray.block and state.tray.block.id == block.id else 1,
                block.tent.name.lower(),
                block.name.lower(),
                str(block.id),
            )
        )
        planned_block = compatible_blocks[0]
        state.planned_block = planned_block
        block_load[str(planned_block.id)] += 1

    with transaction.atomic():
        if clear_existing:
            TrayPlant.objects.filter(
                tray__experiment=experiment,
                plant__status=Plant.Status.ACTIVE,
            ).delete()

        trays_to_update: list[Tray] = []
        to_create: list[TrayPlant] = []

        for state in tray_states:
            tray = state.tray
            planned_block = state.planned_block
            if planned_block and (tray.block is None or tray.block.id != planned_block.id):
                tray.block = planned_block
                trays_to_update.append(tray)

            next_order = state.next_order
            for plant in state.new_plants:
                to_create.append(
                    TrayPlant(
                        tray=tray,
                        plant=plant,
                        order_index=next_order,
                    )
                )
                next_order += 1

        if trays_to_update:
            Tray.objects.bulk_update(trays_to_update, ["block"])
        if to_create:
            TrayPlant.objects.bulk_create(to_create)

    return Response(
        {
            "mode": mode,
            "clear_existing": clear_existing,
            "placed_count": len(to_create),
            "tray_count": len(trays),
            "moved_tray_count": len(trays_to_update),
            "remaining_unplaced_plants": 0,
        }
    )
