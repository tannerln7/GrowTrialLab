from __future__ import annotations

from uuid import UUID

from django.db import transaction
from django.db.models import Max
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .baseline import BASELINE_WEEK_NUMBER
from .models import Block, Experiment, Plant, PlantWeeklyMetric, Recipe, Tent, Tray, TrayPlant
from .tent_restrictions import tent_allows_species
from .tray_assignment import experiment_tray_placements


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
        .prefetch_related("tray_plants__plant__species", "tray_plants__plant")
        .order_by("name")
    )
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

    return Response(
        {
            "tents": tents_payload,
            "trays": [
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
                    "plant_count": TrayPlant.objects.filter(
                        tray=tray,
                        plant__status=Plant.Status.ACTIVE,
                    ).count(),
                    "placed_count": TrayPlant.objects.filter(
                        tray=tray,
                        plant__status=Plant.Status.ACTIVE,
                    ).count(),
                    "plants": [
                        {
                            "tray_plant_id": str(tray_plant.id),
                            "uuid": str(tray_plant.plant.id),
                            "plant_id": tray_plant.plant.plant_id,
                            "species_name": tray_plant.plant.species.name,
                            "bin": tray_plant.plant.bin,
                            "status": tray_plant.plant.status,
                            "assigned_recipe_id": str(tray.assigned_recipe.id) if tray.assigned_recipe else None,
                            "assigned_recipe_code": tray.assigned_recipe.code if tray.assigned_recipe else None,
                            "assigned_recipe_name": tray.assigned_recipe.name if tray.assigned_recipe else None,
                        }
                        for tray_plant in TrayPlant.objects.filter(tray=tray)
                        .select_related("plant__species")
                        .order_by("order_index", "id")
                    ],
                }
                for tray in trays
            ],
            "unplaced_plants_count": unplaced_active_count,
            "unplaced_plants": [
                {
                    "uuid": str(plant.id),
                    "plant_id": plant.plant_id,
                    "species_name": plant.species.name,
                    "bin": plant.bin,
                    "status": plant.status,
                }
                for plant in unplaced_active
            ],
            "unplaced_trays": [
                {
                    "tray_id": str(tray.id),
                    "tray_name": tray.name,
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

    if tray_ids:
        trays = list(
            Tray.objects.filter(experiment=experiment, id__in=tray_ids)
            .select_related("assigned_recipe", "block__tent")
            .order_by("name", "id")
        )
        if len(trays) != len(set(tray_ids)):
            return Response({"detail": "One or more tray_ids are invalid for this experiment."}, status=400)
    else:
        trays = list(
            Tray.objects.filter(experiment=experiment, assigned_recipe__isnull=False)
            .select_related("assigned_recipe", "block__tent")
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

    with transaction.atomic():
        if clear_existing:
            TrayPlant.objects.filter(
                tray__experiment=experiment,
                plant__status=Plant.Status.ACTIVE,
            ).delete()

        existing_placements = {
            str(item)
            for item in TrayPlant.objects.filter(
                tray__experiment=experiment,
                plant__status=Plant.Status.ACTIVE,
            ).values_list("plant_id", flat=True)
        }
        candidates = [plant for plant in active_plants if str(plant.id) not in existing_placements]

        plants_by_bin: dict[str, list[Plant]] = {}
        for plant in candidates:
            plants_by_bin.setdefault(plant.bin or "", []).append(plant)

        tray_order = list(trays)
        next_order_by_tray: dict[str, int] = {}
        for tray in tray_order:
            max_order = TrayPlant.objects.filter(tray=tray).aggregate(max_order=Max("order_index"))["max_order"]
            next_order_by_tray[str(tray.id)] = 0 if max_order is None else max_order + 1

        to_create: list[TrayPlant] = []
        for bin_key in sorted(plants_by_bin.keys()):
            bin_plants = sorted(
                plants_by_bin[bin_key],
                key=lambda plant: ((plant.plant_id or "").lower(), plant.created_at, str(plant.id)),
            )
            for idx, plant in enumerate(bin_plants):
                tray = tray_order[idx % len(tray_order)]
                if tray.block and tray.block.tent and not tent_allows_species(
                    tray.block.tent, plant.species.id
                ):
                    return Response(
                        {
                            "detail": (
                                f"Auto placement blocked: plant '{plant.plant_id or plant.id}' "
                                f"({plant.species.name}) is not allowed in tent "
                                f"'{tray.block.tent.name}'."
                            )
                        },
                        status=409,
                    )
                tray_key = str(tray.id)
                to_create.append(
                    TrayPlant(
                        tray=tray,
                        plant=plant,
                        order_index=next_order_by_tray[tray_key],
                    )
                )
                next_order_by_tray[tray_key] += 1

        if to_create:
            TrayPlant.objects.bulk_create(to_create)

    return Response(
        {
            "mode": mode,
            "clear_existing": clear_existing,
            "placed_count": len(to_create),
            "tray_count": len(trays),
        }
    )
