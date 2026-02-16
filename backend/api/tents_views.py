from __future__ import annotations

import re
from uuid import UUID

from django.db import IntegrityError, transaction
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .contracts import error_with_diagnostics, list_envelope
from .models import Experiment, Slot, Species, Tent, Tray



def _suggest_next_code(existing_values: list[str], prefix: str) -> str:
    pattern = re.compile(rf"^{re.escape(prefix)}(\d+)$", flags=re.IGNORECASE)
    highest = 0
    for value in existing_values:
        match = pattern.match((value or "").strip())
        if match:
            highest = max(highest, int(match.group(1)))
    return f"{prefix}{highest + 1}"



def _suggest_next_tent_code(experiment: Experiment) -> str:
    existing_codes = list(Tent.objects.filter(experiment=experiment).values_list("code", flat=True))
    return _suggest_next_code(existing_codes, "TN")



def _suggest_next_tent_name(experiment: Experiment) -> str:
    existing_names = list(Tent.objects.filter(experiment=experiment).values_list("name", flat=True))
    return _suggest_next_code(existing_names, "Tent ")



def _parse_allowed_species_ids(raw_ids) -> tuple[list[Species], Response | None]:
    if raw_ids is None:
        return [], None
    if not isinstance(raw_ids, list):
        return [], Response({"detail": "allowed_species must be an array of species IDs."}, status=400)
    species_ids = [str(item) for item in raw_ids if str(item).strip()]
    species = list(Species.objects.filter(id__in=species_ids))
    if len(species) != len(set(species_ids)):
        return [], Response({"detail": "One or more allowed_species IDs are invalid."}, status=400)
    return species, None



def _serialize_tent(tent: Tent, *, include_slots: bool = False) -> dict:
    allowed = list(tent.allowed_species.all().order_by("name"))
    payload = {
        "id": str(tent.id),
        "experiment": str(tent.experiment.id),
        "name": tent.name,
        "code": tent.code,
        "notes": tent.notes,
        "layout": tent.layout,
        "allowed_species": [
            {
                "id": str(species.id),
                "name": species.name,
                "category": species.category,
            }
            for species in allowed
        ],
        "allowed_species_count": len(allowed),
        "created_at": tent.created_at.isoformat(),
        "updated_at": tent.updated_at.isoformat(),
    }
    if include_slots:
        payload["slots"] = [
            {
                "id": str(slot.id),
                "tent": str(slot.tent.id),
                "shelf_index": slot.shelf_index,
                "slot_index": slot.slot_index,
                "code": slot.code,
                "label": slot.label,
                "notes": slot.notes,
            }
            for slot in Slot.objects.filter(tent=tent).order_by("shelf_index", "slot_index", "id")
        ]
    return payload



def _normalize_layout(raw_layout) -> tuple[dict | None, Response | None]:
    if not isinstance(raw_layout, dict):
        return None, Response({"detail": "layout must be an object."}, status=400)

    schema_version = raw_layout.get("schema_version")
    if schema_version != 1:
        return None, Response({"detail": "layout.schema_version must be 1."}, status=400)

    raw_shelves = raw_layout.get("shelves")
    if not isinstance(raw_shelves, list):
        return None, Response({"detail": "layout.shelves must be an array."}, status=400)

    shelves: list[dict] = []
    expected_index = 1
    for raw_shelf in raw_shelves:
        if not isinstance(raw_shelf, dict):
            return None, Response({"detail": "Each shelf must be an object."}, status=400)
        index = raw_shelf.get("index")
        tray_count = raw_shelf.get("tray_count")
        if not isinstance(index, int) or index != expected_index:
            return None, Response({"detail": "Shelf indexes must be sequential starting at 1."}, status=400)
        if not isinstance(tray_count, int) or tray_count < 0:
            return None, Response({"detail": "tray_count must be an integer >= 0."}, status=400)
        shelves.append({"index": index, "tray_count": tray_count})
        expected_index += 1

    return {"schema_version": 1, "shelves": shelves}, None



def _require_app_user(request):
    app_user = getattr(request, "app_user", None)
    if app_user is None:
        return Response({"detail": "Not authenticated."}, status=403)
    return None


@api_view(["GET", "POST"])
def experiment_tents(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = Experiment.objects.filter(id=experiment_id).first()
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    if request.method == "GET":
        tents = Tent.objects.filter(experiment=experiment).order_by("name", "id")
        return Response(list_envelope([_serialize_tent(tent, include_slots=True) for tent in tents]))

    name = (request.data.get("name") or "").strip()
    code = (request.data.get("code") or "").strip()
    notes = (request.data.get("notes") or "").strip()
    if not name:
        return Response({"detail": "Tent name is required."}, status=400)
    if Tent.objects.filter(experiment=experiment, name=name).exists():
        return Response(
            {
                "detail": "Tent name already exists in this experiment.",
                "suggested_name": _suggest_next_tent_name(experiment),
            },
            status=409,
        )
    if code and Tent.objects.filter(experiment=experiment, code=code).exists():
        return Response(
            {
                "detail": "Tent code already exists in this experiment.",
                "suggested_code": _suggest_next_tent_code(experiment),
            },
            status=409,
        )

    allowed_species, error_response = _parse_allowed_species_ids(request.data.get("allowed_species"))
    if error_response:
        return error_response

    try:
        tent = Tent.objects.create(
            experiment=experiment,
            name=name,
            code=code,
            notes=notes,
            layout={"schema_version": 1, "shelves": []},
        )
    except IntegrityError:
        return Response(
            {
                "detail": "Tent values conflict with existing records in this experiment.",
                "suggested_name": _suggest_next_tent_name(experiment),
                "suggested_code": _suggest_next_tent_code(experiment),
            },
            status=409,
        )
    if allowed_species:
        tent.allowed_species.set(allowed_species)
    return Response(_serialize_tent(tent, include_slots=True), status=201)


@api_view(["PATCH", "DELETE"])
def tent_detail(request, tent_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    tent = Tent.objects.filter(id=tent_id).first()
    if tent is None:
        return Response({"detail": "Tent not found."}, status=404)

    if request.method == "DELETE":
        if Slot.objects.filter(tent=tent).exists():
            return Response(
                {"detail": "Tent cannot be deleted while it still has slots."},
                status=409,
            )
        tent.delete()
        return Response(status=204)

    if "name" in request.data:
        name = (request.data.get("name") or "").strip()
        if not name:
            return Response({"detail": "Tent name cannot be blank."}, status=400)
        if Tent.objects.filter(experiment=tent.experiment, name=name).exclude(id=tent.id).exists():
            return Response(
                {
                    "detail": "Tent name already exists in this experiment.",
                    "suggested_name": _suggest_next_tent_name(tent.experiment),
                },
                status=409,
            )
        tent.name = name
    if "code" in request.data:
        code = (request.data.get("code") or "").strip()
        if code and Tent.objects.filter(experiment=tent.experiment, code=code).exclude(id=tent.id).exists():
            return Response(
                {
                    "detail": "Tent code already exists in this experiment.",
                    "suggested_code": _suggest_next_tent_code(tent.experiment),
                },
                status=409,
            )
        tent.code = code
    if "notes" in request.data:
        tent.notes = (request.data.get("notes") or "").strip()

    if "allowed_species" in request.data:
        allowed_species, error_response = _parse_allowed_species_ids(request.data.get("allowed_species"))
        if error_response:
            return error_response
        tent.save()
        tent.allowed_species.set(allowed_species)
        return Response(_serialize_tent(tent, include_slots=True))

    try:
        tent.save()
    except IntegrityError:
        return Response(
            {
                "detail": "Tent values conflict with existing records in this experiment.",
                "suggested_name": _suggest_next_tent_name(tent.experiment),
                "suggested_code": _suggest_next_tent_code(tent.experiment),
            },
            status=409,
        )
    return Response(_serialize_tent(tent, include_slots=True))


@api_view(["GET", "POST"])
def tent_slots(request, tent_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    tent = Tent.objects.filter(id=tent_id).select_related("experiment").first()
    if tent is None:
        return Response({"detail": "Tent not found."}, status=404)

    if request.method == "GET":
        slots = Slot.objects.filter(tent=tent).order_by("shelf_index", "slot_index", "id")
        return Response(
            list_envelope(
                [
                    {
                        "id": str(slot.id),
                        "tent": str(slot.tent.id),
                        "shelf_index": slot.shelf_index,
                        "slot_index": slot.slot_index,
                        "code": slot.code,
                        "label": slot.label,
                        "notes": slot.notes,
                    }
                    for slot in slots
                ]
            )
        )

    if tent.experiment.lifecycle_state == Experiment.LifecycleState.RUNNING:
        return error_with_diagnostics(
            "Cannot change tent slot layout while experiment is running.",
            diagnostics={"reason_counts": {"running": 1}},
        )

    try:
        shelf_index = int(request.data.get("shelf_index"))
        slot_index = int(request.data.get("slot_index"))
    except (TypeError, ValueError):
        return Response({"detail": "shelf_index and slot_index must be integers."}, status=400)
    if shelf_index < 1 or slot_index < 1:
        return Response({"detail": "shelf_index and slot_index must be >= 1."}, status=400)

    slot = Slot.objects.create(
        tent=tent,
        shelf_index=shelf_index,
        slot_index=slot_index,
        label=(request.data.get("label") or "").strip(),
        notes=(request.data.get("notes") or "").strip(),
    )
    return Response(
        {
            "id": str(slot.id),
            "tent": str(slot.tent.id),
            "shelf_index": slot.shelf_index,
            "slot_index": slot.slot_index,
            "code": slot.code,
            "label": slot.label,
            "notes": slot.notes,
        },
        status=201,
    )


@api_view(["POST"])
def tent_slots_generate(request, tent_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    tent = Tent.objects.filter(id=tent_id).select_related("experiment").first()
    if tent is None:
        return Response({"detail": "Tent not found."}, status=404)

    if tent.experiment.lifecycle_state == Experiment.LifecycleState.RUNNING:
        return error_with_diagnostics(
            "Cannot change tent slot layout while experiment is running.",
            diagnostics={"reason_counts": {"running": 1}},
        )

    layout, error_response = _normalize_layout(request.data.get("layout"))
    if error_response:
        return error_response
    assert layout is not None

    desired_coords: set[tuple[int, int]] = set()
    for shelf in layout["shelves"]:
        shelf_index = shelf["index"]
        tray_count = shelf["tray_count"]
        for slot_index in range(1, tray_count + 1):
            desired_coords.add((shelf_index, slot_index))

    occupied_trays = list(
        Tray.objects.filter(slot__tent=tent)
        .select_related("slot")
        .order_by("name", "id")
    )
    would_orphan: list[dict] = []
    tray_coords: dict[str, tuple[int, int]] = {}
    for tray in occupied_trays:
        if tray.slot is None:
            continue
        coord = (tray.slot.shelf_index, tray.slot.slot_index)
        tray_coords[str(tray.id)] = coord
        if coord not in desired_coords:
            would_orphan.append(
                {
                    "tray_id": str(tray.id),
                    "tray_code": tray.name,
                    "slot_shelf_index": coord[0],
                    "slot_index": coord[1],
                }
            )

    if would_orphan:
        return error_with_diagnostics(
            "Regeneration would orphan occupied trays. Keep occupied slot coordinates or move trays first.",
            diagnostics={
                "reason_counts": {"would_orphan_trays": len(would_orphan)},
                "would_orphan_trays": would_orphan,
            },
        )

    with transaction.atomic():
        Slot.objects.filter(tent=tent).delete()
        new_slots = []
        for shelf in layout["shelves"]:
            for slot_index in range(1, shelf["tray_count"] + 1):
                new_slots.append(
                    Slot(
                        tent=tent,
                        shelf_index=shelf["index"],
                        slot_index=slot_index,
                    )
                )
        Slot.objects.bulk_create(new_slots)
        recreated = list(Slot.objects.filter(tent=tent).order_by("shelf_index", "slot_index", "id"))
        by_coord = {(slot.shelf_index, slot.slot_index): slot for slot in recreated}

        for tray in occupied_trays:
            coord = tray_coords.get(str(tray.id))
            if not coord:
                continue
            tray.slot = by_coord.get(coord)
        Tray.objects.bulk_update(occupied_trays, ["slot"])

        tent.layout = layout
        tent.save(update_fields=["layout", "updated_at"])

    return Response(
        {
            "tent": _serialize_tent(tent, include_slots=False),
            "slots": list_envelope(
                [
                    {
                        "id": str(slot.id),
                        "tent": str(slot.tent.id),
                        "shelf_index": slot.shelf_index,
                        "slot_index": slot.slot_index,
                        "code": slot.code,
                        "label": slot.label,
                        "notes": slot.notes,
                    }
                    for slot in Slot.objects.filter(tent=tent).order_by("shelf_index", "slot_index", "id")
                ]
            ),
        }
    )


@api_view(["PATCH", "DELETE"])
def slot_detail(request, slot_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    slot = Slot.objects.filter(id=slot_id).select_related("tent__experiment").first()
    if slot is None:
        return Response({"detail": "Slot not found."}, status=404)

    if request.method == "DELETE":
        if Tray.objects.filter(slot=slot).exists():
            return Response(
                {"detail": "Slot cannot be deleted while a tray is placed in it."},
                status=409,
            )
        slot.delete()
        return Response(status=204)

    if slot.tent.experiment.lifecycle_state == Experiment.LifecycleState.RUNNING:
        return error_with_diagnostics(
            "Cannot edit slot metadata while experiment is running.",
            diagnostics={"reason_counts": {"running": 1}},
        )

    if "shelf_index" in request.data or "slot_index" in request.data:
        return Response(
            {"detail": "Slot coordinates are immutable. Regenerate slots to change coordinates."},
            status=400,
        )

    if "code" in request.data:
        return Response({"detail": "Slot code is derived from coordinates and cannot be edited."}, status=400)

    if "label" in request.data:
        slot.label = (request.data.get("label") or "").strip() or slot.label
    if "notes" in request.data:
        slot.notes = (request.data.get("notes") or "").strip()
    slot.save(update_fields=["label", "notes", "updated_at"])

    return Response(
        {
            "id": str(slot.id),
            "tent": str(slot.tent.id),
            "shelf_index": slot.shelf_index,
            "slot_index": slot.slot_index,
            "code": slot.code,
            "label": slot.label,
            "notes": slot.notes,
        }
    )
