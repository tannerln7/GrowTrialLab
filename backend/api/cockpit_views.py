from __future__ import annotations

from uuid import UUID

from rest_framework.decorators import api_view
from rest_framework.response import Response

from .baseline import BASELINE_WEEK_NUMBER
from .models import FeedingEvent, Photo, Plant, PlantWeeklyMetric
from .status_summary import compute_setup_status
from .tray_assignment import placement_info, plant_tray_placement, resolved_assigned_recipe


def _require_app_user(request):
    app_user = getattr(request, "app_user", None)
    if app_user is None:
        return Response({"detail": "Not authenticated."}, status=403)
    return None


def _photo_url(request, photo: Photo) -> str:
    url = photo.file.url
    if url.startswith(("http://", "https://")):
        return url
    return request.build_absolute_uri(url)


def _replaces_plant(plant: Plant) -> Plant | None:
    return Plant.objects.filter(replaced_by=plant).only("id", "plant_id").first()


@api_view(["GET"])
def plant_cockpit(request, plant_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    plant = (
        Plant.objects.filter(id=plant_id)
        .select_related("species", "experiment", "assigned_recipe")
        .first()
    )
    if plant is None:
        return Response({"detail": "Plant not found."}, status=404)

    has_baseline = PlantWeeklyMetric.objects.filter(
        experiment=plant.experiment,
        plant=plant,
        week_number=BASELINE_WEEK_NUMBER,
    ).exists()
    recent_photos = list(
        Photo.objects.filter(experiment=plant.experiment, plant=plant)
        .order_by("-created_at")[:6]
    )
    setup_status = compute_setup_status(plant.experiment)
    experiment_home = (
        f"/experiments/{plant.experiment.id}/overview"
        if setup_status.is_complete
        else f"/experiments/{plant.experiment.id}/setup"
    )
    replaces = _replaces_plant(plant)
    replaced_by = plant.replaced_by
    replaced_by_uuid = str(replaced_by.id) if replaced_by else None
    replaces_uuid = str(replaces.id) if replaces else None
    tray_placement = plant_tray_placement(plant)
    placement = placement_info(tray_placement)
    assigned_recipe = resolved_assigned_recipe(plant, tray_placement, allow_fallback=True)
    latest_feeding_event = (
        FeedingEvent.objects.filter(plant=plant)
        .only("occurred_at")
        .order_by("-occurred_at")
        .first()
    )
    last_fed_at = latest_feeding_event.occurred_at if latest_feeding_event else None
    chain_label = None
    if replaces:
        chain_label = f"Replacement of {replaces.plant_id or str(replaces.id)}"
    elif replaced_by:
        chain_label = "Has replacement"

    return Response(
        {
            "plant": {
                "uuid": str(plant.id),
                "plant_id": plant.plant_id,
                "cultivar": plant.cultivar,
                "status": plant.status,
                "bin": plant.bin,
                "removed_at": plant.removed_at.isoformat() if plant.removed_at else None,
                "removed_reason": plant.removed_reason,
                "species": {
                    "id": str(plant.species.id),
                    "name": plant.species.name,
                    "category": plant.species.category,
                },
                "experiment": {
                    "id": str(plant.experiment.id),
                    "name": plant.experiment.name,
                },
            },
            "derived": {
                "has_baseline": has_baseline,
                "assigned_recipe_id": str(assigned_recipe.id) if assigned_recipe else None,
                "assigned_recipe_code": assigned_recipe.code if assigned_recipe else None,
                "assigned_recipe_name": assigned_recipe.name if assigned_recipe else None,
                "placed_tray_id": placement.tray_id if placement else None,
                "placed_tray_name": placement.tray_name if placement else None,
                "placed_block_id": placement.block_id if placement else None,
                "placed_block_name": placement.block_name if placement else None,
                "last_fed_at": last_fed_at.isoformat() if last_fed_at else None,
                "replaced_by_uuid": replaced_by_uuid,
                "replaces_uuid": replaces_uuid,
                "chain_label": chain_label,
            },
            "links": {
                "experiment_home": experiment_home,
                "experiment_overview": f"/experiments/{plant.experiment.id}/overview",
                "setup_assignment": f"/experiments/{plant.experiment.id}/assignment",
                "baseline_capture": f"/experiments/{plant.experiment.id}/baseline?plant={plant.id}",
                "placement": f"/experiments/{plant.experiment.id}/placement",
            },
            "recent_photos": [
                {
                    "id": str(photo.id),
                    "url": _photo_url(request, photo),
                    "created_at": photo.created_at.isoformat(),
                    "tag": photo.tag,
                    "week_number": photo.week_number,
                }
                for photo in recent_photos
            ],
        }
    )
