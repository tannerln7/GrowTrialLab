from __future__ import annotations

from uuid import UUID

from django.db import transaction
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Block, Experiment, RotationLog, Tray, TrayPlant


def _require_app_user(request):
    app_user = getattr(request, "app_user", None)
    if app_user is None:
        return Response({"detail": "Not authenticated."}, status=403)
    return None


def _get_experiment(experiment_id: UUID):
    return Experiment.objects.filter(id=experiment_id).first()


@api_view(["GET"])
def experiment_rotation_summary(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    trays = list(
        Tray.objects.filter(experiment=experiment)
        .select_related("block")
        .order_by("name")
    )
    recent_logs = list(
        RotationLog.objects.filter(experiment=experiment)
        .select_related("tray", "from_block", "to_block")
        .order_by("-occurred_at")[:25]
    )

    return Response(
        {
            "trays": [
                {
                    "tray_id": str(tray.id),
                    "tray_name": tray.name,
                    "current_block_id": str(tray.block.id) if tray.block else None,
                    "current_block_name": tray.block.name if tray.block else None,
                    "plant_count": TrayPlant.objects.filter(tray=tray).count(),
                }
                for tray in trays
            ],
            "recent_logs": [
                {
                    "id": str(log.id),
                    "tray_name": log.tray.name,
                    "from_block_name": log.from_block.name if log.from_block else None,
                    "to_block_name": log.to_block.name if log.to_block else None,
                    "occurred_at": log.occurred_at.isoformat(),
                    "note": log.note,
                }
                for log in recent_logs
            ],
            "unplaced_trays_count": sum(1 for tray in trays if tray.block is None),
        }
    )


@api_view(["POST"])
def experiment_rotation_log(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)
    if experiment.lifecycle_state != Experiment.LifecycleState.RUNNING:
        return Response(
            {"detail": "Rotation logs are intended for running experiments. Start the experiment first."},
            status=409,
        )

    tray_id = request.data.get("tray_id")
    if not tray_id:
        return Response({"detail": "tray_id is required."}, status=400)

    tray = Tray.objects.filter(id=tray_id, experiment=experiment).select_related("block").first()
    if tray is None:
        return Response({"detail": "Tray not found for this experiment."}, status=404)

    to_block_id = request.data.get("to_block_id")
    to_block: Block | None = None
    if to_block_id:
        to_block = Block.objects.filter(id=to_block_id, experiment=experiment).first()
        if to_block is None:
            return Response({"detail": "Destination block not found for this experiment."}, status=400)

    note = (request.data.get("note") or "").strip()
    occurred_at = timezone.now()
    from_block = tray.block

    with transaction.atomic():
        log = RotationLog.objects.create(
            experiment=experiment,
            tray=tray,
            from_block=from_block,
            to_block=to_block,
            occurred_at=occurred_at,
            note=note,
            created_by_email=(request.app_user.email or ""),
        )
        tray.block = to_block
        tray.save(update_fields=["block"])

    return Response(
        {
            "id": str(log.id),
            "tray_name": tray.name,
            "from_block_name": from_block.name if from_block else None,
            "to_block_name": to_block.name if to_block else None,
            "occurred_at": log.occurred_at.isoformat(),
            "note": log.note,
        },
        status=201,
    )
