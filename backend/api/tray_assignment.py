from __future__ import annotations

from dataclasses import dataclass

from .models import Plant, Recipe, TrayPlant


@dataclass(frozen=True)
class TrayPlacementInfo:
    tray_id: str
    tray_name: str
    block_id: str | None
    block_name: str | None


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


def placement_info(tray_placement: TrayPlant | None) -> TrayPlacementInfo | None:
    if tray_placement is None:
        return None
    tray = tray_placement.tray
    return TrayPlacementInfo(
        tray_id=str(tray.id),
        tray_name=tray.name,
        block_id=str(tray.block.id) if tray.block else None,
        block_name=tray.block.name if tray.block else None,
    )


def feeding_block_reason(plant: Plant, tray_placement: TrayPlant | None) -> str | None:
    if tray_placement is None:
        return "Unplaced"
    if tray_placement.tray.assigned_recipe is None:
        return "Needs tray recipe"
    return None
