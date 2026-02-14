from __future__ import annotations

from uuid import UUID

from django.db import transaction
from django.db.models import Max
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Block, Experiment, Plant, Tray, TrayPlant


def _require_app_user(request):
    app_user = getattr(request, "app_user", None)
    if app_user is None:
        return Response({"detail": "Not authenticated."}, status=403)
    return None


def _get_experiment(experiment_id: UUID):
    return Experiment.objects.filter(id=experiment_id).first()


@api_view(["GET"])
def experiment_placement_summary(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    trays = list(
        Tray.objects.filter(experiment=experiment)
        .select_related("block")
        .prefetch_related("tray_plants__plant__species", "tray_plants__plant__assigned_recipe")
        .order_by("name")
    )
    placed_plant_ids = set(
        TrayPlant.objects.filter(tray__experiment=experiment).values_list("plant_id", flat=True)
    )

    unplaced_active_qs = (
        Plant.objects.filter(experiment=experiment, status=Plant.Status.ACTIVE)
        .exclude(id__in=placed_plant_ids)
        .select_related("species", "assigned_recipe")
        .order_by("plant_id", "created_at", "id")
    )
    unplaced_active_count = unplaced_active_qs.count()
    unplaced_active = list(unplaced_active_qs[:50])

    return Response(
        {
            "trays": [
                {
                    "tray_id": str(tray.id),
                    "name": tray.name,
                    "block_id": str(tray.block_id) if tray.block_id else None,
                    "block_name": tray.block.name if tray.block else None,
                    "plant_count": tray.tray_plants.count(),
                    "plants": [
                        {
                            "tray_plant_id": str(tray_plant.id),
                            "uuid": str(tray_plant.plant.id),
                            "plant_id": tray_plant.plant.plant_id,
                            "species_name": tray_plant.plant.species.name,
                            "bin": tray_plant.plant.bin,
                            "assigned_recipe_code": (
                                tray_plant.plant.assigned_recipe.code
                                if tray_plant.plant.assigned_recipe
                                else None
                            ),
                        }
                        for tray_plant in tray.tray_plants.order_by("order_index", "id")
                    ],
                }
                for tray in trays
            ],
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

    name = (request.data.get("name") or "").strip()
    if not name:
        return Response({"detail": "Tray name is required."}, status=400)
    block_id = request.data.get("block_id")
    notes = (request.data.get("notes") or "").strip()

    block = None
    if block_id:
        block = Block.objects.filter(id=block_id, experiment=experiment).first()
        if block is None:
            return Response({"detail": "Block not found for this experiment."}, status=400)

    tray = Tray.objects.create(
        experiment=experiment,
        name=name,
        block=block,
        notes=notes,
    )
    return Response(
        {
            "id": str(tray.id),
            "experiment": str(experiment.id),
            "name": tray.name,
            "block": str(tray.block_id) if tray.block_id else None,
            "notes": tray.notes,
        },
        status=201,
    )


@api_view(["POST"])
def tray_add_plant(request, tray_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    tray = Tray.objects.filter(id=tray_id).select_related("experiment").first()
    if tray is None:
        return Response({"detail": "Tray not found."}, status=404)

    plant_id = request.data.get("plant_id")
    if not plant_id:
        return Response({"detail": "plant_id is required."}, status=400)

    plant = Plant.objects.filter(id=plant_id).select_related("species", "assigned_recipe").first()
    if plant is None:
        return Response({"detail": "Plant not found."}, status=404)
    if plant.experiment_id != tray.experiment_id:
        return Response({"detail": "Plant and tray must belong to the same experiment."}, status=400)
    if plant.status == Plant.Status.REMOVED:
        return Response({"detail": "Removed plants cannot be placed in trays."}, status=400)
    if TrayPlant.objects.filter(plant=plant).exists():
        return Response({"detail": "Plant is already placed in another tray."}, status=400)

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
            "assigned_recipe_code": plant.assigned_recipe.code if plant.assigned_recipe else None,
            "bin": plant.bin,
        },
        status=201,
    )


@api_view(["DELETE"])
def tray_remove_plant(request, tray_id: UUID, tray_plant_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    tray_plant = TrayPlant.objects.filter(id=tray_plant_id, tray_id=tray_id).first()
    if tray_plant is None:
        return Response({"detail": "Tray placement not found."}, status=404)
    tray_plant.delete()
    return Response(status=204)
