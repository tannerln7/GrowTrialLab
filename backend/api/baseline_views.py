from __future__ import annotations

from uuid import UUID

from django.db import transaction
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .baseline import (
    BASELINE_WEEK_NUMBER,
    get_metric_template_for_category,
    get_or_create_setup_state,
    is_baseline_locked,
    lock_baseline,
    validate_metrics_against_template,
)
from .models import Experiment, MetricTemplate, Photo, Plant, PlantWeeklyMetric
from .serializers import (
    BaselinePacketSerializer,
    ExperimentSetupStateSerializer,
    PlantBaselineSaveSerializer,
    PlantWeeklyMetricSerializer,
)
from .setup_packets import PACKET_BASELINE, normalize_packet_ids, next_incomplete_packet


def _require_app_user(request):
    app_user = getattr(request, "app_user", None)
    if app_user is None:
        return Response({"detail": "Not authenticated."}, status=403)
    return None


def _get_experiment(experiment_id: UUID):
    return Experiment.objects.filter(id=experiment_id).first()


def _serialize_template(template: MetricTemplate | None):
    if template is None:
        return None
    return {
        "id": str(template.id),
        "category": template.category,
        "version": template.version,
        "fields": template.fields,
    }


@api_view(["GET"])
def experiment_baseline_status(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    plants = list(
        Plant.objects.filter(experiment=experiment)
        .select_related("species")
        .order_by("plant_id", "created_at")
    )
    baseline_plant_ids = set(
        PlantWeeklyMetric.objects.filter(
            experiment=experiment,
            week_number=BASELINE_WEEK_NUMBER,
        ).values_list("plant_id", flat=True)
    )
    baseline_plant_id_strings = {str(item) for item in baseline_plant_ids}

    total_plants = len(plants)
    baseline_completed = len(baseline_plant_ids)
    bins_assigned = sum(1 for plant in plants if bool(plant.bin))
    photos_count = Photo.objects.filter(
        experiment=experiment,
        week_number=BASELINE_WEEK_NUMBER,
        tag=Photo.Tag.BASELINE,
    ).count()

    payload = {
        "total_plants": total_plants,
        "baseline_completed": baseline_completed,
        "bins_assigned": bins_assigned,
        "photos_count": photos_count,
        "baseline_locked": is_baseline_locked(experiment),
        "plants": [
            {
                "id": str(plant.id),
                "plant_id": plant.plant_id,
                "species_name": plant.species.name,
                "species_category": plant.species.category,
                "bin": plant.bin,
                "baseline_done": str(plant.id) in baseline_plant_id_strings,
            }
            for plant in plants
        ],
    }
    return Response(payload)


@api_view(["GET", "POST"])
def plant_baseline(request, plant_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    plant = Plant.objects.filter(id=plant_id).select_related("species", "experiment").first()
    if plant is None:
        return Response({"detail": "Plant not found."}, status=404)

    template = get_metric_template_for_category(plant.species.category)

    if request.method == "GET":
        baseline_metric = PlantWeeklyMetric.objects.filter(
            experiment=plant.experiment,
            plant=plant,
            week_number=BASELINE_WEEK_NUMBER,
        ).first()
        return Response(
            {
                "plant_id": str(plant.id),
                "experiment_id": str(plant.experiment.id),
                "bin": plant.bin,
                "baseline_locked": is_baseline_locked(plant.experiment),
                "template": _serialize_template(template),
                "baseline": PlantWeeklyMetricSerializer(baseline_metric).data if baseline_metric else None,
            }
        )

    serializer = PlantBaselineSaveSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    metrics = serializer.validated_data["metrics"]
    validate_metrics_against_template(metrics, template)

    with transaction.atomic():
        baseline_metric, _ = PlantWeeklyMetric.objects.update_or_create(
            experiment=plant.experiment,
            plant=plant,
            week_number=BASELINE_WEEK_NUMBER,
            defaults={
                "metrics": metrics,
                "notes": serializer.validated_data.get("notes", ""),
            },
        )

        if "bin" in serializer.validated_data:
            plant.bin = serializer.validated_data["bin"]
            plant.save(update_fields=["bin", "updated_at"])

    return Response(
        {
            "plant_id": str(plant.id),
            "bin": plant.bin,
            "baseline_locked": is_baseline_locked(plant.experiment),
            "template": _serialize_template(template),
            "baseline": PlantWeeklyMetricSerializer(baseline_metric).data,
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

    setup_state = get_or_create_setup_state(experiment)
    lock_baseline(setup_state)
    setup_state.save(update_fields=["locked_packets", "packet_data", "updated_at"])
    return Response(ExperimentSetupStateSerializer(setup_state).data)


@api_view(["PUT"])
def experiment_baseline_packet(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    serializer = BaselinePacketSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    template_id = serializer.validated_data.get("template_id")
    template = None
    if template_id:
        template = MetricTemplate.objects.filter(id=template_id).first()
        if template is None:
            return Response({"detail": "Metric template not found."}, status=404)

    setup_state = get_or_create_setup_state(experiment)
    baseline_payload = setup_state.packet_data.get(PACKET_BASELINE)
    if not isinstance(baseline_payload, dict):
        baseline_payload = {}

    if template:
        baseline_payload["template_id"] = str(template.id)
        baseline_payload["template_version"] = template.version
    if "template_version" in serializer.validated_data:
        baseline_payload["template_version"] = serializer.validated_data["template_version"]
    if "notes" in serializer.validated_data:
        baseline_payload["notes"] = serializer.validated_data.get("notes", "")

    setup_state.packet_data[PACKET_BASELINE] = baseline_payload
    setup_state.save(update_fields=["packet_data", "updated_at"])
    return Response({"packet": PACKET_BASELINE, "data": baseline_payload})


@api_view(["POST"])
def complete_baseline_packet(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    total_plants = Plant.objects.filter(experiment=experiment).count()
    baseline_completed = PlantWeeklyMetric.objects.filter(
        experiment=experiment,
        week_number=BASELINE_WEEK_NUMBER,
    ).values("plant_id").distinct().count()
    bins_assigned = Plant.objects.filter(experiment=experiment, bin__isnull=False).count()

    errors: list[str] = []
    if total_plants < 1:
        errors.append("At least 1 plant is required before completing the Baseline step.")
    if baseline_completed < 1:
        errors.append("At least 1 baseline capture is required before completing the Baseline step.")
    if bins_assigned < total_plants:
        errors.append("All plants must have a bin assignment before completing the Baseline step.")

    if errors:
        return Response({"detail": "Baseline step cannot be completed.", "errors": errors}, status=400)

    setup_state = get_or_create_setup_state(experiment)
    completed = normalize_packet_ids([*setup_state.completed_packets, PACKET_BASELINE])
    setup_state.completed_packets = completed
    setup_state.current_packet = next_incomplete_packet(completed)
    lock_baseline(setup_state)
    setup_state.save(
        update_fields=["completed_packets", "current_packet", "locked_packets", "packet_data", "updated_at"]
    )
    return Response(ExperimentSetupStateSerializer(setup_state).data)
