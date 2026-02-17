from __future__ import annotations

from uuid import UUID

from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .baseline import (
    BASELINE_WEEK_NUMBER,
    is_baseline_locked,
    lock_baseline,
)
from .baseline_grade import (
    GRADE_SOURCE_AUTO,
    compute_auto_baseline_grade,
    default_baseline_v1_metrics,
    extract_baseline_v1_metrics,
    merge_baseline_v1_metrics,
    read_baseline_captured_at,
    read_grade_source,
)
from .contracts import list_envelope
from .models import Experiment, Photo, Plant, PlantWeeklyMetric
from .serializers import PlantBaselineSaveSerializer


def _require_app_user(request):
    app_user = getattr(request, "app_user", None)
    if app_user is None:
        return Response({"detail": "Not authenticated."}, status=403)
    return None


def _get_experiment(experiment_id: UUID):
    return Experiment.objects.filter(id=experiment_id).first()


def _photo_url(request, photo: Photo) -> str:
    url = photo.file.url
    if url.startswith("http://") or url.startswith("https://"):
        return url
    return request.build_absolute_uri(url)


def _serialize_baseline_photo(request, photo: Photo | None) -> dict | None:
    if photo is None:
        return None
    return {
        "id": str(photo.id),
        "plant": str(photo.plant.id) if photo.plant else None,
        "week_number": photo.week_number,
        "tag": photo.tag,
        "file": photo.file.url,
        "url": _photo_url(request, photo),
        "created_at": photo.created_at.isoformat(),
    }


def _latest_baseline_photo_by_plant(experiment: Experiment) -> dict[str, Photo]:
    latest_by_plant: dict[str, Photo] = {}
    photos = (
        Photo.objects.filter(
            experiment=experiment,
            tag=Photo.Tag.BASELINE,
            plant_id__isnull=False,
        )
        .select_related("plant")
        .order_by("plant_id", "-created_at", "-id")
    )
    for photo in photos:
        if photo.plant is None:
            continue
        plant_id = str(photo.plant.id)
        if plant_id not in latest_by_plant:
            latest_by_plant[plant_id] = photo
    return latest_by_plant


def _latest_baseline_photo_for_plant(experiment: Experiment, plant: Plant) -> Photo | None:
    return (
        Photo.objects.filter(
            experiment=experiment,
            plant=plant,
            tag=Photo.Tag.BASELINE,
        )
        .order_by("-created_at", "-id")
        .first()
    )


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
    baseline_weekly_metrics = list(
        PlantWeeklyMetric.objects.filter(
            experiment=experiment,
            week_number=BASELINE_WEEK_NUMBER,
        )
        .select_related("plant")
        .only("plant__id", "metrics", "recorded_at")
    )
    baseline_plant_ids = {str(item.plant.id) for item in baseline_weekly_metrics}
    baseline_captured_at_by_plant = {
        str(item.plant.id): read_baseline_captured_at(item.metrics) or item.recorded_at.isoformat()
        for item in baseline_weekly_metrics
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
    latest_photo_by_plant = _latest_baseline_photo_by_plant(experiment)

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
                        "baseline_captured_at": baseline_captured_at_by_plant.get(str(plant.id)),
                        "baseline_photo": _serialize_baseline_photo(
                            request,
                            latest_photo_by_plant.get(str(plant.id)),
                        ),
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
        latest_baseline_photo = _latest_baseline_photo_for_plant(plant.experiment, plant)
        raw_metrics = weekly_metric.metrics if weekly_metric else {}
        baseline_v1 = extract_baseline_v1_metrics(raw_metrics)
        grade_source = read_grade_source(raw_metrics)
        response_metrics = dict(raw_metrics) if isinstance(raw_metrics, dict) else {}
        response_metrics["baseline_v1"] = {
            **default_baseline_v1_metrics(),
            **baseline_v1,
            "grade_source": grade_source,
            **(
                {"captured_at": read_baseline_captured_at(raw_metrics)}
                if read_baseline_captured_at(raw_metrics)
                else {}
            ),
        }
        baseline_captured_at = read_baseline_captured_at(raw_metrics) or (
            weekly_metric.recorded_at.isoformat() if weekly_metric else None
        )
        return Response(
            {
                "plant_id": str(plant.id),
                "experiment_id": str(plant.experiment.id),
                "species_name": plant.species.name,
                "species_category": plant.species.category,
                "grade": plant.grade,
                "grade_source": grade_source,
                "has_baseline": weekly_metric is not None,
                "metrics": response_metrics,
                "notes": weekly_metric.notes if weekly_metric else "",
                "baseline_captured_at": baseline_captured_at,
                "baseline_photo": _serialize_baseline_photo(request, latest_baseline_photo),
                "baseline_locked": is_baseline_locked(plant.experiment),
            }
        )

    serializer = PlantBaselineSaveSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    baseline_v1 = serializer.validated_data["baseline_v1"]
    grade_source = serializer.validated_data.get("grade_source", GRADE_SOURCE_AUTO)
    effective_grade = (
        compute_auto_baseline_grade(baseline_v1)
        if grade_source == GRADE_SOURCE_AUTO
        else serializer.validated_data.get("grade")
    )

    existing_weekly_metric = PlantWeeklyMetric.objects.filter(
        plant=plant,
        experiment=plant.experiment,
        week_number=BASELINE_WEEK_NUMBER,
    ).first()
    captured_at = timezone.now().isoformat()
    merged_metrics = merge_baseline_v1_metrics(
        existing_weekly_metric.metrics if existing_weekly_metric else {},
        baseline_v1,
        grade_source=grade_source,
        captured_at=captured_at,
    )

    weekly_metric, _ = PlantWeeklyMetric.objects.update_or_create(
        plant=plant,
        experiment=plant.experiment,
        week_number=BASELINE_WEEK_NUMBER,
        defaults={
            "metrics": merged_metrics,
            "notes": serializer.validated_data.get("notes", ""),
        },
    )

    plant.grade = effective_grade
    plant.save(update_fields=["grade", "updated_at"])

    response_metrics = dict(weekly_metric.metrics) if isinstance(weekly_metric.metrics, dict) else {}
    response_metrics["baseline_v1"] = {
        **default_baseline_v1_metrics(),
        **extract_baseline_v1_metrics(response_metrics),
        "grade_source": read_grade_source(response_metrics),
        **(
            {"captured_at": read_baseline_captured_at(response_metrics)}
            if read_baseline_captured_at(response_metrics)
            else {}
        ),
    }
    latest_baseline_photo = _latest_baseline_photo_for_plant(plant.experiment, plant)
    baseline_captured_at = read_baseline_captured_at(response_metrics) or captured_at

    return Response(
        {
            "plant_id": str(plant.id),
            "grade": plant.grade,
            "grade_source": grade_source,
            "has_baseline": True,
            "metrics": response_metrics,
            "notes": weekly_metric.notes,
            "baseline_captured_at": baseline_captured_at,
            "baseline_photo": _serialize_baseline_photo(request, latest_baseline_photo),
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
