from __future__ import annotations

from uuid import UUID

from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Experiment
from .status_summary import experiment_status_summary_payload


def _require_app_user(request):
    app_user = getattr(request, "app_user", None)
    if app_user is None:
        return Response({"detail": "Not authenticated."}, status=403)
    return None


@api_view(["GET"])
def experiment_status_summary(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = Experiment.objects.filter(id=experiment_id).first()
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    return Response(experiment_status_summary_payload(experiment))


@api_view(["POST"])
def experiment_start(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = Experiment.objects.filter(id=experiment_id).first()
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    summary = experiment_status_summary_payload(experiment)
    if not summary["setup"]["is_complete"] or not summary["readiness"]["ready_to_start"]:
        return Response(
            {
                "detail": "Experiment is not ready to start.",
                "counts": summary["readiness"]["counts"],
                "setup": summary["setup"],
                "ready_to_start": summary["readiness"]["ready_to_start"],
            },
            status=409,
        )

    now = timezone.now()
    experiment.lifecycle_state = Experiment.LifecycleState.RUNNING
    experiment.started_at = now
    experiment.stopped_at = None
    experiment.save(update_fields=["lifecycle_state", "started_at", "stopped_at", "updated_at"])
    return Response(experiment_status_summary_payload(experiment))


@api_view(["POST"])
def experiment_stop(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = Experiment.objects.filter(id=experiment_id).first()
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    experiment.lifecycle_state = Experiment.LifecycleState.STOPPED
    experiment.stopped_at = timezone.now()
    experiment.save(update_fields=["lifecycle_state", "stopped_at", "updated_at"])
    return Response(experiment_status_summary_payload(experiment))
