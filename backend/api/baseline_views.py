from __future__ import annotations

from uuid import UUID

from rest_framework.decorators import api_view
from rest_framework.response import Response

from .baseline import (
    BASELINE_WEEK_NUMBER,
    get_metric_template_for_category,
    is_baseline_locked,
    lock_baseline,
    validate_metrics_against_template,
)
from .contracts import list_envelope
from .models import Experiment, Plant, PlantWeeklyMetric
from .serializers import PlantBaselineSaveSerializer


def _require_app_user(request):
    app_user = getattr(request, "app_user", None)
    if app_user is None:
        return Response({"detail": "Not authenticated."}, status=403)
    return None


def _get_experiment(experiment_id: UUID):
    return Experiment.objects.filter(id=experiment_id).first()


@api_view(["GET"])
def experiment_baseline_status(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    plants = list(
        Plant.objects.filter(experiment=experiment, status=Plant.Status.ACTIVE)
        .only("id", "grade")
        .order_by("plant_id", "created_at", "id")
    )
    baseline_plant_ids = {
        str(item)
        for item in PlantWeeklyMetric.objects.filter(
            experiment=experiment,
            week_number=BASELINE_WEEK_NUMBER,
        ).values_list("plant_id", flat=True)
    }

    captured_count = sum(1 for plant in plants if str(plant.id) in baseline_plant_ids)
    grades_assigned = sum(1 for plant in plants if bool(plant.grade))

    return Response(
        {
            "experiment_id": str(experiment.id),
            "active_count": len(plants),
            "captured_count": captured_count,
            "grades_assigned": grades_assigned,
            "remaining_count": sum(
                1 for plant in plants if str(plant.id) not in baseline_plant_ids or not plant.grade
            ),
            "baseline_locked": is_baseline_locked(experiment),
        }
    )


@api_view(["GET"])
def experiment_baseline_queue(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    plants = list(
        Plant.objects.filter(experiment=experiment, status=Plant.Status.ACTIVE)
        .select_related("species")
        .order_by("plant_id", "created_at", "id")
    )
    baseline_plant_ids = {
        str(item)
        for item in PlantWeeklyMetric.objects.filter(
            experiment=experiment,
            week_number=BASELINE_WEEK_NUMBER,
        ).values_list("plant_id", flat=True)
    }

    def has_baseline(plant: Plant) -> bool:
        return str(plant.id) in baseline_plant_ids

    def has_grade(plant: Plant) -> bool:
        return bool(plant.grade)

    def needs_baseline(plant: Plant) -> bool:
        return not has_baseline(plant) or not has_grade(plant)

    ordered = sorted(
        plants,
        key=lambda plant: (
            0 if needs_baseline(plant) else 1,
            (plant.plant_id or "").lower(),
            plant.created_at,
            str(plant.id),
        ),
    )

    return Response(
        {
            "remaining_count": sum(1 for plant in plants if needs_baseline(plant)),
            "baseline_locked": is_baseline_locked(experiment),
            "plants": list_envelope(
                [
                    {
                        "uuid": str(plant.id),
                        "plant_id": plant.plant_id,
                        "species_name": plant.species.name,
                        "species_category": plant.species.category,
                        "cultivar": plant.cultivar,
                        "status": plant.status,
                        "has_baseline": has_baseline(plant),
                        "has_grade": has_grade(plant),
                    }
                    for plant in ordered[:50]
                ]
            ),
        }
    )


@api_view(["GET", "POST"])
def plant_baseline(request, plant_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    plant = Plant.objects.filter(id=plant_id).select_related("species", "experiment").first()
    if plant is None:
        return Response({"detail": "Plant not found."}, status=404)

    if request.method == "GET":
        weekly_metric = PlantWeeklyMetric.objects.filter(
            plant=plant,
            experiment=plant.experiment,
            week_number=BASELINE_WEEK_NUMBER,
        ).first()
        return Response(
            {
                "plant_id": str(plant.id),
                "experiment_id": str(plant.experiment.id),
                "grade": plant.grade,
                "has_baseline": weekly_metric is not None,
                "metrics": weekly_metric.metrics if weekly_metric else {},
                "notes": weekly_metric.notes if weekly_metric else "",
                "baseline_locked": is_baseline_locked(plant.experiment),
            }
        )

    serializer = PlantBaselineSaveSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    template = get_metric_template_for_category(plant.species.category)
    validate_metrics_against_template(serializer.validated_data["metrics"], template)

    weekly_metric, _ = PlantWeeklyMetric.objects.update_or_create(
        plant=plant,
        experiment=plant.experiment,
        week_number=BASELINE_WEEK_NUMBER,
        defaults={
            "metrics": serializer.validated_data["metrics"],
            "notes": serializer.validated_data.get("notes", ""),
        },
    )

    if "grade" in serializer.validated_data:
        plant.grade = serializer.validated_data["grade"]
        plant.save(update_fields=["grade", "updated_at"])

    return Response(
        {
            "plant_id": str(plant.id),
            "grade": plant.grade,
            "has_baseline": True,
            "metrics": weekly_metric.metrics,
            "notes": weekly_metric.notes,
            "baseline_locked": is_baseline_locked(plant.experiment),
        }
    )


@api_view(["POST"])
def experiment_baseline_lock(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    lock_baseline(experiment)
    return Response(
        {
            "experiment_id": str(experiment.id),
            "baseline_locked": True,
        }
    )
