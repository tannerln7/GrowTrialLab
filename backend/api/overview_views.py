from __future__ import annotations

from uuid import UUID

from rest_framework.decorators import api_view
from rest_framework.response import Response

from .baseline import BASELINE_WEEK_NUMBER
from .models import Experiment, Plant, PlantWeeklyMetric


def _require_app_user(request):
    app_user = getattr(request, "app_user", None)
    if app_user is None:
        return Response({"detail": "Not authenticated."}, status=403)
    return None


def _get_experiment(experiment_id: UUID):
    return Experiment.objects.filter(id=experiment_id).first()


@api_view(["GET"])
def experiment_overview_plants(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    plants = list(
        Plant.objects.filter(experiment=experiment)
        .select_related("species", "assigned_recipe")
        .order_by("plant_id", "created_at")
    )
    baseline_plant_ids = {
        str(item)
        for item in PlantWeeklyMetric.objects.filter(
            experiment=experiment,
            week_number=BASELINE_WEEK_NUMBER,
        ).values_list("plant_id", flat=True)
    }

    payload_plants: list[dict] = []
    active_count = 0
    removed_count = 0
    needs_baseline_count = 0
    needs_bin_count = 0
    needs_assignment_count = 0

    for plant in plants:
        has_baseline = str(plant.id) in baseline_plant_ids
        is_active = plant.status == Plant.Status.ACTIVE
        if is_active:
            active_count += 1
            if not has_baseline:
                needs_baseline_count += 1
            if not plant.bin:
                needs_bin_count += 1
            if plant.assigned_recipe is None:
                needs_assignment_count += 1
        else:
            removed_count += 1

        payload_plants.append(
            {
                "uuid": str(plant.id),
                "plant_id": plant.plant_id,
                "species_name": plant.species.name,
                "species_category": plant.species.category,
                "cultivar": plant.cultivar,
                "status": plant.status,
                "bin": plant.bin,
                "assigned_recipe_code": plant.assigned_recipe.code if plant.assigned_recipe else None,
                "has_baseline": has_baseline,
                "replaced_by_uuid": str(plant.replaced_by_id) if plant.replaced_by_id else None,
            }
        )

    return Response(
        {
            "counts": {
                "total": len(payload_plants),
                "active": active_count,
                "removed": removed_count,
                "needs_baseline": needs_baseline_count,
                "needs_bin": needs_bin_count,
                "needs_assignment": needs_assignment_count,
            },
            "plants": payload_plants,
        }
    )
