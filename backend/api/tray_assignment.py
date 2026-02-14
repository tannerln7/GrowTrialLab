from __future__ import annotations

from dataclasses import dataclass

from django.db.models import Count

from .models import Plant, Recipe, TrayPlant


@dataclass(frozen=True)
class TrayPlacementInfo:
    tray_id: str
    tray_name: str
    tray_code: str
    tray_capacity: int
    tray_current_count: int
    block_id: str | None
    block_name: str | None
    tent_id: str | None
    tent_code: str | None
    tent_name: str | None


def plant_tray_placement(plant: Plant) -> TrayPlant | None:
    return (
        TrayPlant.objects.filter(plant=plant)
        .select_related("tray__assigned_recipe", "tray__block__tent")
        .first()
    )


def experiment_tray_placements(experiment_id) -> dict[str, TrayPlant]:
    placements = (
        TrayPlant.objects.filter(tray__experiment_id=experiment_id)
        .select_related("tray__assigned_recipe", "tray__block__tent", "plant")
    )
    return {str(item.plant.id): item for item in placements}


def experiment_tray_current_counts(experiment_id) -> dict[str, int]:
    counts = (
        TrayPlant.objects.filter(tray__experiment_id=experiment_id)
        .values("tray_id")
        .annotate(total=Count("id"))
    )
    return {str(item["tray_id"]): int(item["total"]) for item in counts}


def resolved_assigned_recipe(
    plant: Plant,
    tray_placement: TrayPlant | None,
    *,
    allow_fallback: bool = True,
) -> Recipe | None:
    if tray_placement is not None:
        return tray_placement.tray.assigned_recipe
    if allow_fallback:
        return plant.assigned_recipe
    return None


def placement_info(
    tray_placement: TrayPlant | None,
    *,
    tray_current_count: int | None = None,
) -> TrayPlacementInfo | None:
    if tray_placement is None:
        return None
    tray = tray_placement.tray
    block = tray.block
    tent = block.tent if block else None
    current_count = (
        tray_current_count
        if tray_current_count is not None
        else tray.tray_plants.count()
    )
    return TrayPlacementInfo(
        tray_id=str(tray.id),
        tray_name=tray.name,
        tray_code=tray.name,
        tray_capacity=tray.capacity,
        tray_current_count=current_count,
        block_id=str(block.id) if block else None,
        block_name=block.name if block else None,
        tent_id=str(tent.id) if tent else None,
        tent_code=tent.code if tent else None,
        tent_name=tent.name if tent else None,
    )


def feeding_block_reason(plant: Plant, tray_placement: TrayPlant | None) -> str | None:
    if tray_placement is None:
        return "Unplaced"
    if tray_placement.tray.assigned_recipe is None:
        return "Needs tray recipe"
    return None
