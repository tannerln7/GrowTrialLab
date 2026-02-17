from __future__ import annotations

from dataclasses import dataclass

from django.db.models import Count

from .models import Plant, TrayPlant


@dataclass(frozen=True)
class TrayPlacementInfo:
    tray_id: str
    tray_name: str
    tray_code: str
    tray_capacity: int
    tray_current_count: int
    slot_id: str | None
    slot_code: str | None
    slot_label: str | None
    shelf_index: int | None
    slot_index: int | None
    tent_id: str | None
    tent_code: str | None
    tent_name: str | None


def plant_tray_placement(plant: Plant) -> TrayPlant | None:
    return TrayPlant.objects.filter(plant=plant).select_related("tray__slot__tent").first()


def experiment_tray_placements(experiment_id) -> dict[str, TrayPlant]:
    placements = TrayPlant.objects.filter(tray__experiment_id=experiment_id).select_related(
        "tray__slot__tent", "plant"
    )
    return {str(item.plant.id): item for item in placements}


def experiment_tray_current_counts(experiment_id) -> dict[str, int]:
    counts = (
        TrayPlant.objects.filter(tray__experiment_id=experiment_id)
        .values("tray_id")
        .annotate(total=Count("id"))
    )
    return {str(item["tray_id"]): int(item["total"]) for item in counts}


def placement_info(
    tray_placement: TrayPlant | None,
    *,
    tray_current_count: int | None = None,
) -> TrayPlacementInfo | None:
    if tray_placement is None:
        return None
    tray = tray_placement.tray
    slot = tray.slot
    tent = slot.tent if slot else None
    current_count = tray_current_count if tray_current_count is not None else tray.tray_plants.count()
    return TrayPlacementInfo(
        tray_id=str(tray.id),
        tray_name=tray.name,
        tray_code=tray.name,
        tray_capacity=tray.capacity,
        tray_current_count=current_count,
        slot_id=str(slot.id) if slot else None,
        slot_code=slot.code if slot else None,
        slot_label=slot.label if slot else None,
        shelf_index=slot.shelf_index if slot else None,
        slot_index=slot.slot_index if slot else None,
        tent_id=str(tent.id) if tent else None,
        tent_code=tent.code if tent else None,
        tent_name=tent.name if tent else None,
    )


def build_location(
    tray_placement: TrayPlant | None,
    *,
    tray_current_count: int | None = None,
) -> dict:
    placement = placement_info(tray_placement, tray_current_count=tray_current_count)
    if not placement:
        return {
            "status": "unplaced",
            "tent": None,
            "slot": None,
            "tray": None,
        }

    return {
        "status": "placed",
        "tent": {
            "id": placement.tent_id,
            "code": placement.tent_code,
            "name": placement.tent_name,
        },
        "slot": {
            "id": placement.slot_id,
            "code": placement.slot_code,
            "label": placement.slot_label,
            "shelf_index": placement.shelf_index,
            "slot_index": placement.slot_index,
        },
        "tray": {
            "id": placement.tray_id,
            "code": placement.tray_code,
            "name": placement.tray_name,
            "capacity": placement.tray_capacity,
            "current_count": placement.tray_current_count,
        },
    }
