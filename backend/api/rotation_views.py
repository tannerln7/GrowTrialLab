from __future__ import annotations

from uuid import UUID

from django.db.models import Count
from django.db import transaction
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .contracts import error_with_diagnostics
from .models import Experiment, RotationLog, Slot, Tray, TrayPlant
from .tent_restrictions import first_disallowed_plant



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
        .select_related("slot__tent")
        .order_by("name")
    )
    tray_counts = {
        str(item["tray_id"]): int(item["total"])
        for item in TrayPlant.objects.filter(tray__in=trays)
        .values("tray_id")
        .annotate(total=Count("id"))
    }
    recent_logs = list(
        RotationLog.objects.filter(experiment=experiment)
        .select_related("tray", "from_slot__tent", "to_slot__tent")
        .order_by("-occurred_at")[:25]
    )

    return Response(
        {
            "trays": {
                "count": len(trays),
                "results": [
                    {
                        "tray_id": str(tray.id),
                        "tray_name": tray.name,
                        "location": {
                            "status": "placed" if tray.slot else "unplaced",
                            "tent": {
                                "id": str(tray.slot.tent.id),
                                "code": tray.slot.tent.code,
                                "name": tray.slot.tent.name,
                            }
                            if tray.slot
                            else None,
                            "slot": {
                                "id": str(tray.slot.id),
                                "code": tray.slot.code,
                                "label": tray.slot.label,
                                "shelf_index": tray.slot.shelf_index,
                                "slot_index": tray.slot.slot_index,
                            }
                            if tray.slot
                            else None,
                            "tray": {
                                "id": str(tray.id),
                                "code": tray.name,
                                "name": tray.name,
                                "capacity": tray.capacity,
                                "current_count": tray_counts.get(str(tray.id), 0),
                            },
                        },
                        "plant_count": tray_counts.get(str(tray.id), 0),
                    }
                    for tray in trays
                ],
                "meta": {},
            },
            "recent_logs": {
                "count": len(recent_logs),
                "results": [
                    {
                        "id": str(log.id),
                        "tray_name": log.tray.name,
                        "from_slot": {
                            "id": str(log.from_slot.id),
                            "code": log.from_slot.code,
                            "label": log.from_slot.label,
                            "tent_name": log.from_slot.tent.name,
                        }
                        if log.from_slot
                        else None,
                        "to_slot": {
                            "id": str(log.to_slot.id),
                            "code": log.to_slot.code,
                            "label": log.to_slot.label,
                            "tent_name": log.to_slot.tent.name,
                        }
                        if log.to_slot
                        else None,
                        "occurred_at": log.occurred_at.isoformat(),
                        "note": log.note,
                    }
                    for log in recent_logs
                ],
                "meta": {},
            },
            "unplaced_trays_count": sum(1 for tray in trays if tray.slot is None),
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
        return error_with_diagnostics(
            "Rotation logs are intended for running experiments. Start the experiment first.",
            diagnostics={"reason_counts": {"experiment_not_running": 1}},
        )

    tray_id = request.data.get("tray_id")
    if not tray_id:
        return Response({"detail": "tray_id is required."}, status=400)

    tray = Tray.objects.filter(id=tray_id, experiment=experiment).select_related("slot__tent").first()
    if tray is None:
        return Response({"detail": "Tray not found for this experiment."}, status=404)

    to_slot_id = request.data.get("to_slot_id")
    to_slot: Slot | None = None
    if to_slot_id:
        to_slot = Slot.objects.filter(id=to_slot_id, tent__experiment=experiment).select_related("tent").first()
        if to_slot is None:
            return Response({"detail": "Destination slot not found for this experiment."}, status=400)

    if to_slot and to_slot.tent:
        tray_plants = (
            TrayPlant.objects.filter(tray=tray)
            .select_related("plant__species")
            .order_by("order_index", "id")
        )
        violating = first_disallowed_plant(
            to_slot.tent,
            [item.plant for item in tray_plants],
        )
        if violating:
            return error_with_diagnostics(
                (
                    f"Tray move blocked: tent '{to_slot.tent.name}' does not allow "
                    f"plant '{violating.plant_id or violating.id}' ({violating.species.name})."
                ),
                diagnostics={
                    "reason_counts": {"restriction_conflict": 1},
                    "tent": {
                        "id": str(to_slot.tent.id),
                        "name": to_slot.tent.name,
                        "code": to_slot.tent.code,
                    },
                    "first_violating_plant": {
                        "id": str(violating.id),
                        "plant_id": violating.plant_id,
                        "species_name": violating.species.name,
                    },
                },
            )

    note = (request.data.get("note") or "").strip()
    occurred_at = timezone.now()
    from_slot = tray.slot

    with transaction.atomic():
        log = RotationLog.objects.create(
            experiment=experiment,
            tray=tray,
            from_slot=from_slot,
            to_slot=to_slot,
            occurred_at=occurred_at,
            note=note,
            created_by_email=(request.app_user.email or ""),
        )
        tray.slot = to_slot
        tray.save(update_fields=["slot"])

    return Response(
        {
            "id": str(log.id),
            "tray_name": tray.name,
            "from_slot": {
                "id": str(from_slot.id),
                "code": from_slot.code,
                "label": from_slot.label,
            }
            if from_slot
            else None,
            "to_slot": {
                "id": str(to_slot.id),
                "code": to_slot.code,
                "label": to_slot.label,
            }
            if to_slot
            else None,
            "occurred_at": log.occurred_at.isoformat(),
            "note": log.note,
        },
        status=201,
    )
