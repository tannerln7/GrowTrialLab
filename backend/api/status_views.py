from __future__ import annotations

from uuid import UUID

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
