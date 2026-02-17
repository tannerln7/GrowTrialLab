from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field
from uuid import UUID

from django.db import transaction
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .baseline import BASELINE_WEEK_NUMBER
from .contracts import error_with_diagnostics, list_envelope
from .models import Experiment, Plant, PlantWeeklyMetric, Recipe, Slot, Tent, Tray, TrayPlant
from .tent_restrictions import tent_allows_species
from .tray_placement import build_location, experiment_tray_placements

AUTOPLACE_REASON_NO_COMPATIBLE_TRAYS = "no_compatible_trays"
AUTOPLACE_REASON_COMPATIBLE_TRAYS_FULL = "compatible_trays_full"
AUTOPLACE_REASON_RESTRICTION_CONFLICT = "restriction_conflict"
AUTOPLACE_REASON_NO_TENTED_SLOTS = "no_tented_slots"

PLACEMENT_LOCK_MESSAGE = (
    "Placement cannot be edited while the experiment is running. Stop the experiment to change placement."
)


@dataclass
class TrayAutoState:
    tray: Tray
    species_ids: set[str]
    current_count: int
    next_order: int
    new_plants: list[Plant] = field(default_factory=list)



def _require_app_user(request):
    app_user = getattr(request, "app_user", None)
    if app_user is None:
        return Response({"detail": "Not authenticated."}, status=403)
    return None


def _get_experiment(experiment_id: UUID):
    return Experiment.objects.filter(id=experiment_id).first()


def _placement_locked_response() -> Response:
    return error_with_diagnostics(
        PLACEMENT_LOCK_MESSAGE,
        diagnostics={"reason_counts": {"running": 1}},
    )


def _is_running(experiment: Experiment) -> bool:
    return experiment.lifecycle_state == Experiment.LifecycleState.RUNNING


def _plant_sort_key(plant: Plant) -> tuple[str, str, str, str]:
    return (
        (plant.grade or "").upper(),
        (plant.plant_id or "").lower(),
        plant.created_at.isoformat(),
        str(plant.id),
    )


def _recipe_summary(recipe: Recipe | None) -> dict | None:
    if recipe is None:
        return None
    return {
        "id": str(recipe.id),
        "code": recipe.code,
        "name": recipe.name,
    }


def _tray_remaining_capacity(state: TrayAutoState) -> int:
    return state.tray.capacity - (state.current_count + len(state.new_plants))


def _can_tray_host_species(
    state: TrayAutoState,
    species_id: str,
    compatible_slot_exists_by_species: dict[str, bool],
) -> bool:
    combined_species = set(state.species_ids)
    combined_species.add(species_id)

    if state.tray.slot and state.tray.slot.tent:
        return all(tent_allows_species(state.tray.slot.tent, sid) for sid in combined_species)

    if not combined_species:
        return True
    return all(compatible_slot_exists_by_species.get(sid, False) for sid in combined_species)


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
    slots = list(
        Slot.objects.filter(tent__experiment=experiment)
        .select_related("tent")
        .order_by("tent__name", "shelf_index", "slot_index", "id")
    )
    trays = list(
        Tray.objects.filter(experiment=experiment)
        .select_related("slot__tent")
        .order_by("name")
    )
    tray_items_by_tray_id: dict[str, list[TrayPlant]] = {}
    for item in TrayPlant.objects.filter(tray__in=trays).select_related(
        "plant__species",
        "plant__assigned_recipe",
    ).order_by(
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
    unplaced_active = list(unplaced_active_qs[:50])

    tents_payload = []
    for tent in tents:
        tent_slots = [slot for slot in slots if slot.tent.id == tent.id]
        tents_payload.append(
            {
                "tent_id": str(tent.id),
                "name": tent.name,
                "code": tent.code,
                "layout": tent.layout,
                "allowed_species_count": tent.allowed_species.count(),
                "allowed_species": [
                    {
                        "id": str(species.id),
                        "name": species.name,
                        "category": species.category,
                    }
                    for species in tent.allowed_species.all().order_by("name")
                ],
                "slots": [
                    {
                        "slot_id": str(slot.id),
                        "code": slot.code,
                        "label": slot.label,
                        "shelf_index": slot.shelf_index,
                        "slot_index": slot.slot_index,
                        "tray_count": 1 if any((tray.slot and tray.slot.id == slot.id) for tray in trays) else 0,
                    }
                    for slot in tent_slots
                ],
            }
        )

    tray_payload = []
    for tray in trays:
        tray_items = tray_items_by_tray_id.get(str(tray.id), [])
        location = build_location(
            next((item for item in placement_map.values() if item.tray.id == tray.id), None),
            tray_current_count=len(tray_items),
        )
        tray_payload.append(
            {
                "tray_id": str(tray.id),
                "name": tray.name,
                "capacity": tray.capacity,
                "current_count": len(tray_items),
                "location": location,
                "plants": [
                    {
                        "tray_plant_id": str(tray_plant.id),
                        "uuid": str(tray_plant.plant.id),
                        "plant_id": tray_plant.plant.plant_id,
                        "species_id": str(tray_plant.plant.species.id),
                        "species_name": tray_plant.plant.species.name,
                        "species_category": tray_plant.plant.species.category,
                        "grade": tray_plant.plant.grade,
                        "status": tray_plant.plant.status,
                        "assigned_recipe": _recipe_summary(tray_plant.plant.assigned_recipe),
                    }
                    for tray_plant in tray_items
                ],
            }
        )

    return Response(
        {
            "tents": list_envelope(tents_payload),
            "trays": list_envelope(tray_payload),
            "unplaced_plants": list_envelope(
                [
                    {
                        "uuid": str(plant.id),
                        "plant_id": plant.plant_id,
                        "species_id": str(plant.species.id),
                        "species_name": plant.species.name,
                        "species_category": plant.species.category,
                        "grade": plant.grade,
                        "status": plant.status,
                        "assigned_recipe": _recipe_summary(plant.assigned_recipe),
                    }
                    for plant in unplaced_active
                ],
                meta={
                    "remaining_count": unplaced_active_qs.count(),
                },
            ),
            "unplaced_trays": list_envelope(
                [
                    {
                        "tray_id": str(tray.id),
                        "tray_name": tray.name,
                        "capacity": tray.capacity,
                        "current_count": len(tray_items_by_tray_id.get(str(tray.id), [])),
                    }
                    for tray in trays
                    if tray.slot is None
                ]
            ),
            "meta": {
                "slot_count": len(slots),
                "tray_count": len(trays),
            },
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

    slot = None
    slot_id = request.data.get("slot_id")
    if slot_id:
        slot = Slot.objects.filter(id=slot_id, tent__experiment=experiment).select_related("tent").first()
        if slot is None:
            return Response({"detail": "Slot not found for this experiment."}, status=400)
        if Tray.objects.filter(experiment=experiment, slot=slot).exists():
            return error_with_diagnostics(
                "Slot already has a tray. Each slot can contain only one tray.",
                diagnostics={"reason_counts": {"slot_occupied": 1}, "slot_id": str(slot.id)},
            )

    try:
        capacity = int(request.data.get("capacity") or 1)
    except (TypeError, ValueError):
        return Response({"detail": "capacity must be an integer."}, status=400)
    if capacity < 1:
        return Response({"detail": "capacity must be at least 1."}, status=400)

    if Tray.objects.filter(experiment=experiment, name=name).exists():
        pattern = re.compile(r"^([A-Za-z]+)(\d+)$")
        match = pattern.match(name)
        prefix = (match.group(1) if match else "TR").upper()
        highest = 0
        for existing in Tray.objects.filter(experiment=experiment).values_list("name", flat=True):
            item = pattern.match(existing)
            if item and item.group(1).upper() == prefix:
                highest = max(highest, int(item.group(2)))
        return Response(
            {
                "detail": "Tray name already exists in this experiment.",
                "suggested_name": f"{prefix}{highest + 1}",
            },
            status=409,
        )

    tray = Tray.objects.create(
        experiment=experiment,
        name=name,
        slot=slot,
        capacity=capacity,
        notes=(request.data.get("notes") or "").strip(),
    )

    return Response(
        {
            "tray_id": str(tray.id),
            "name": tray.name,
            "capacity": tray.capacity,
            "location": {
                "status": "placed" if slot else "unplaced",
                "tent": {
                    "id": str(slot.tent.id),
                    "code": slot.tent.code,
                    "name": slot.tent.name,
                }
                if slot
                else None,
                "slot": {
                    "id": str(slot.id),
                    "code": slot.code,
                    "label": slot.label,
                    "shelf_index": slot.shelf_index,
                    "slot_index": slot.slot_index,
                }
                if slot
                else None,
                "tray": {
                    "id": str(tray.id),
                    "code": tray.name,
                    "name": tray.name,
                    "capacity": tray.capacity,
                    "current_count": 0,
                },
            },
        },
        status=201,
    )


@api_view(["POST"])
def tray_add_plant(request, tray_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    tray = Tray.objects.filter(id=tray_id).select_related("experiment", "slot__tent").first()
    if tray is None:
        return Response({"detail": "Tray not found."}, status=404)
    if _is_running(tray.experiment):
        return _placement_locked_response()

    plant_id = request.data.get("plant_id")
    if not plant_id:
        return Response({"detail": "plant_id is required."}, status=400)

    plant = Plant.objects.filter(id=plant_id, experiment=tray.experiment).select_related("species").first()
    if plant is None:
        return Response({"detail": "Plant not found for this experiment."}, status=404)
    if plant.status == Plant.Status.REMOVED:
        return error_with_diagnostics(
            "Removed plants cannot be placed in trays.",
            diagnostics={"reason_counts": {"removed_plant": 1}, "plant_id": str(plant.id)},
        )

    if TrayPlant.objects.filter(plant=plant).exists():
        return error_with_diagnostics(
            "Plant is already placed in a tray.",
            diagnostics={"reason_counts": {"already_placed": 1}, "plant_id": str(plant.id)},
        )

    if TrayPlant.objects.filter(tray=tray).count() >= tray.capacity:
        return error_with_diagnostics(
            f"Tray is full (capacity {tray.capacity}).",
            diagnostics={"reason_counts": {"tray_full": 1}, "tray_id": str(tray.id)},
        )

    if tray.slot and tray.slot.tent and not tent_allows_species(tray.slot.tent, plant.species.id):
        return error_with_diagnostics(
            (
                f"Plant species '{plant.species.name}' is not allowed in tent '{tray.slot.tent.name}'."
            ),
            diagnostics={
                "reason_counts": {"restriction_conflict": 1},
                "tray_id": str(tray.id),
                "plant_id": str(plant.id),
            },
        )

    next_index = (
        TrayPlant.objects.filter(tray=tray).order_by("-order_index").values_list("order_index", flat=True).first()
        or 0
    ) + 1
    tray_plant = TrayPlant.objects.create(
        tray=tray,
        plant=plant,
        order_index=next_index,
    )

    return Response(
        {
            "id": str(tray_plant.id),
            "tray": str(tray.id),
            "plant": str(plant.id),
            "order_index": tray_plant.order_index,
        },
        status=201,
    )


@api_view(["DELETE"])
def tray_remove_plant(request, tray_id: UUID, tray_plant_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    tray = Tray.objects.filter(id=tray_id).select_related("experiment").first()
    if tray is None:
        return Response({"detail": "Tray not found."}, status=404)
    if _is_running(tray.experiment):
        return _placement_locked_response()

    tray_plant = TrayPlant.objects.filter(id=tray_plant_id, tray=tray).first()
    if tray_plant is None:
        return Response({"detail": "Tray plant placement not found."}, status=404)

    tray_plant.delete()
    return Response(status=204)


@api_view(["POST"])
def tray_apply_recipe(request, tray_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    tray = Tray.objects.filter(id=tray_id).select_related("experiment").first()
    if tray is None:
        return error_with_diagnostics(
            "Tray not found.",
            status_code=404,
            diagnostics={"reason_counts": {"tray_not_found": 1}},
        )

    recipe_id = request.data.get("recipe_id")
    if not recipe_id:
        return error_with_diagnostics(
            "recipe_id is required.",
            status_code=400,
            diagnostics={"reason_counts": {"missing_recipe_id": 1}},
        )

    recipe = Recipe.objects.filter(id=recipe_id, experiment=tray.experiment).first()
    if recipe is None:
        return error_with_diagnostics(
            "Recipe not found for this experiment.",
            status_code=400,
            diagnostics={"reason_counts": {"recipe_not_found": 1}},
        )

    active_plant_ids = list(
        TrayPlant.objects.filter(tray=tray, plant__status=Plant.Status.ACTIVE).values_list("plant_id", flat=True)
    )
    if not active_plant_ids:
        return Response(
            {
                "tray_id": str(tray.id),
                "recipe": _recipe_summary(recipe),
                "updated_count": 0,
                "plants": list_envelope([]),
            }
        )

    with transaction.atomic():
        plants_to_update = Plant.objects.filter(id__in=active_plant_ids).exclude(assigned_recipe=recipe)
        changed_plant_ids = list(plants_to_update.values_list("id", flat=True))
        updated_count = plants_to_update.update(assigned_recipe=recipe)

    updated_plants = list(
        Plant.objects.filter(id__in=changed_plant_ids)
        .select_related("species", "assigned_recipe")
        .order_by("plant_id", "created_at", "id")
    )

    return Response(
        {
            "tray_id": str(tray.id),
            "recipe": _recipe_summary(recipe),
            "updated_count": int(updated_count),
            "plants": list_envelope(
                [
                    {
                        "uuid": str(plant.id),
                        "plant_id": plant.plant_id,
                        "species_name": plant.species.name,
                        "species_category": plant.species.category,
                        "status": plant.status,
                        "assigned_recipe": _recipe_summary(plant.assigned_recipe),
                    }
                    for plant in updated_plants
                ]
            ),
        }
    )


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

    active_plants = list(
        Plant.objects.filter(experiment=experiment, status=Plant.Status.ACTIVE)
        .select_related("species")
        .order_by("plant_id", "created_at", "id")
    )
    if not active_plants:
        return Response({"updated_count": 0, "detail": "No active plants to place."})

    baseline_plant_ids = {
        str(item)
        for item in PlantWeeklyMetric.objects.filter(
            experiment=experiment,
            week_number=BASELINE_WEEK_NUMBER,
        ).values_list("plant_id", flat=True)
    }
    missing_baseline_or_grade = [
        plant
        for plant in active_plants
        if str(plant.id) not in baseline_plant_ids or not plant.grade
    ]
    if missing_baseline_or_grade:
        return error_with_diagnostics(
            "Auto placement requires baseline week 0 and grade assignment for all active plants.",
            diagnostics={
                "reason_counts": {"needs_baseline_or_grade": len(missing_baseline_or_grade)},
                "remaining_unplaced_plants": len(missing_baseline_or_grade),
                "unplaceable_plants": [
                    {
                        "uuid": str(plant.id),
                        "plant_id": plant.plant_id,
                        "species_name": plant.species.name,
                        "species_category": plant.species.category,
                        "reason": "needs_baseline_or_grade",
                    }
                    for plant in missing_baseline_or_grade[:10]
                ],
            },
        )

    raw_tray_ids = request.data.get("tray_ids")
    tray_queryset = Tray.objects.filter(experiment=experiment).select_related("slot__tent")
    if isinstance(raw_tray_ids, list) and raw_tray_ids:
        tray_queryset = tray_queryset.filter(id__in=raw_tray_ids)
    trays = list(tray_queryset.order_by("name", "id"))

    if not trays:
        return error_with_diagnostics(
            "Auto placement requires at least one tray.",
            diagnostics={"reason_counts": {AUTOPLACE_REASON_NO_COMPATIBLE_TRAYS: len(active_plants)}},
        )

    slots = list(
        Slot.objects.filter(tent__experiment=experiment)
        .select_related("tent")
        .order_by("tent__name", "shelf_index", "slot_index", "id")
    )

    if not slots:
        return error_with_diagnostics(
            "Auto placement requires at least one tent slot.",
            diagnostics={"reason_counts": {AUTOPLACE_REASON_NO_TENTED_SLOTS: len(active_plants)}},
        )

    clear_existing = bool(request.data.get("clear_existing", True))
    if clear_existing:
        TrayPlant.objects.filter(tray__experiment=experiment, plant__status=Plant.Status.ACTIVE).delete()

    tray_items = list(
        TrayPlant.objects.filter(tray__in=trays)
        .select_related("plant__species", "tray")
        .order_by("tray_id", "order_index", "id")
    )

    current_species_by_tray: dict[str, set[str]] = {str(tray.id): set() for tray in trays}
    current_count_by_tray: dict[str, int] = {str(tray.id): 0 for tray in trays}
    max_order_by_tray: dict[str, int] = {str(tray.id): 0 for tray in trays}
    for item in tray_items:
        tray_key = str(item.tray.id)
        current_species_by_tray[tray_key].add(str(item.plant.species.id))
        current_count_by_tray[tray_key] += 1
        max_order_by_tray[tray_key] = max(max_order_by_tray[tray_key], item.order_index)

    compatible_slot_exists_by_species: dict[str, bool] = {}
    for plant in active_plants:
        species_id = str(plant.species.id)
        if species_id in compatible_slot_exists_by_species:
            continue
        compatible_slot_exists_by_species[species_id] = any(
            tent_allows_species(slot.tent, plant.species.id) for slot in slots
        )

    tray_states: list[TrayAutoState] = []
    for tray in trays:
        tray_states.append(
            TrayAutoState(
                tray=tray,
                species_ids=set(current_species_by_tray.get(str(tray.id), set())),
                current_count=current_count_by_tray.get(str(tray.id), 0),
                next_order=max_order_by_tray.get(str(tray.id), 0) + 1,
            )
        )

    unplaceable: list[dict[str, str]] = []

    plants_by_grade: dict[str, list[Plant]] = {}
    for plant in active_plants:
        plants_by_grade.setdefault(plant.grade or "", []).append(plant)

    for grade_key in sorted(plants_by_grade.keys()):
        remaining = sorted(plants_by_grade[grade_key], key=_plant_sort_key)
        for plant in remaining:
            species_id = str(plant.species.id)
            candidates = [
                state
                for state in tray_states
                if _tray_remaining_capacity(state) > 0
                and _can_tray_host_species(state, species_id, compatible_slot_exists_by_species)
            ]
            if not candidates:
                reason = AUTOPLACE_REASON_NO_COMPATIBLE_TRAYS
                if not compatible_slot_exists_by_species.get(species_id, False):
                    reason = AUTOPLACE_REASON_RESTRICTION_CONFLICT
                elif any(_can_tray_host_species(state, species_id, compatible_slot_exists_by_species) for state in tray_states):
                    reason = AUTOPLACE_REASON_COMPATIBLE_TRAYS_FULL
                unplaceable.append(
                    {
                        "uuid": str(plant.id),
                        "plant_id": plant.plant_id,
                        "species_name": plant.species.name,
                        "species_category": plant.species.category,
                        "reason": reason,
                    }
                )
                continue

            candidates.sort(
                key=lambda state: (
                    -_tray_remaining_capacity(state),
                    (state.current_count + len(state.new_plants)) / max(1, state.tray.capacity),
                    state.tray.name.lower(),
                    str(state.tray.id),
                )
            )
            selected = candidates[0]
            selected.new_plants.append(plant)
            selected.species_ids.add(species_id)

    if unplaceable:
        reason_counts = Counter(item["reason"] for item in unplaceable)
        return error_with_diagnostics(
            "Could not auto-place all active plants.",
            diagnostics={
                "reason_counts": dict(reason_counts),
                "remaining_unplaced_plants": len(unplaceable),
                "unplaceable_plants": unplaceable,
            },
        )

    occupied_slot_ids = {
        str(tray.slot.id)
        for tray in trays
        if tray.slot
    }

    free_slots = [slot for slot in slots if str(slot.id) not in occupied_slot_ids]

    trays_without_compatible_slot: list[TrayAutoState] = []
    for state in tray_states:
        if state.tray.slot and all(
            tent_allows_species(state.tray.slot.tent, species_id) for species_id in state.species_ids
        ):
            continue

        compatible_free_slots = [
            slot
            for slot in free_slots
            if all(tent_allows_species(slot.tent, species_id) for species_id in state.species_ids)
        ]
        if not compatible_free_slots:
            trays_without_compatible_slot.append(state)
            continue
        chosen_slot = compatible_free_slots[0]
        state.tray.slot = chosen_slot
        free_slots = [slot for slot in free_slots if slot.id != chosen_slot.id]

    if trays_without_compatible_slot:
        blocked_plants: list[dict[str, str]] = []
        for state in trays_without_compatible_slot:
            tray_plants = [
                item.plant
                for item in tray_items
                if item.tray.id == state.tray.id and item.plant.status == Plant.Status.ACTIVE
            ] + state.new_plants
            for plant in tray_plants:
                blocked_plants.append(
                    {
                        "uuid": str(plant.id),
                        "plant_id": plant.plant_id,
                        "species_name": plant.species.name,
                        "species_category": plant.species.category,
                        "reason": AUTOPLACE_REASON_RESTRICTION_CONFLICT,
                    }
                )
        return error_with_diagnostics(
            "Could not auto-place all active plants due to slot restriction conflicts.",
            diagnostics={
                "reason_counts": {AUTOPLACE_REASON_RESTRICTION_CONFLICT: len(blocked_plants)},
                "remaining_unplaced_plants": len(blocked_plants),
                "unplaceable_plants": blocked_plants[:50],
            },
        )

    with transaction.atomic():
        for state in tray_states:
            if state.new_plants:
                new_items = []
                for plant in state.new_plants:
                    new_items.append(
                        TrayPlant(
                            tray=state.tray,
                            plant=plant,
                            order_index=state.next_order,
                        )
                    )
                    state.next_order += 1
                TrayPlant.objects.bulk_create(new_items)
            if state.tray.slot:
                state.tray.save(update_fields=["slot"])

    return Response(
        {
            "detail": "Auto placement complete.",
            "updated_count": len(active_plants),
        }
    )
