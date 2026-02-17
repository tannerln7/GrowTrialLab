from __future__ import annotations

from uuid import UUID

from rest_framework.decorators import api_view
from rest_framework.response import Response

from .baseline import BASELINE_WEEK_NUMBER
from .models import Experiment, Plant, PlantWeeklyMetric
from .tray_placement import (
    build_location,
    experiment_tray_current_counts,
    experiment_tray_placements,
)



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
    tray_placements = experiment_tray_placements(experiment.id)
    tray_current_counts = experiment_tray_current_counts(experiment.id)
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
    needs_grade_count = 0
    needs_placement_count = 0
    needs_plant_recipe_count = 0
    needs_assignment_count = 0

    for plant in plants:
        tray_placement = tray_placements.get(str(plant.id))
        location = build_location(
            tray_placement,
            tray_current_count=tray_current_counts.get(str(tray_placement.tray.id)) if tray_placement else None,
        )
        assigned_recipe = plant.assigned_recipe
        has_baseline = str(plant.id) in baseline_plant_ids
        is_active = plant.status == Plant.Status.ACTIVE
        if is_active:
            active_count += 1
            if not has_baseline:
                needs_baseline_count += 1
            if not plant.grade:
                needs_grade_count += 1
            if tray_placement is None:
                needs_placement_count += 1
            if assigned_recipe is None:
                needs_plant_recipe_count += 1
            if tray_placement is None or assigned_recipe is None:
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
                "grade": plant.grade,
                "assigned_recipe": {
                    "id": str(assigned_recipe.id),
                    "code": assigned_recipe.code,
                    "name": assigned_recipe.name,
                }
                if assigned_recipe
                else None,
                "location": location,
                "has_baseline": has_baseline,
                "replaced_by_uuid": str(plant.replaced_by.id) if plant.replaced_by else None,
            }
        )

    return Response(
        {
            "counts": {
                "total": len(payload_plants),
                "active": active_count,
                "removed": removed_count,
                "needs_baseline": needs_baseline_count,
                "needs_grade": needs_grade_count,
                "needs_assignment": needs_assignment_count,
                "needs_placement": needs_placement_count,
                "needs_plant_recipe": needs_plant_recipe_count,
            },
            "plants": {
                "count": len(payload_plants),
                "results": payload_plants,
                "meta": {},
            },
        }
    )
