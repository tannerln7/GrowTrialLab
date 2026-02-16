from __future__ import annotations

from uuid import UUID

from rest_framework.decorators import api_view
from rest_framework.response import Response

from .baseline import BASELINE_WEEK_NUMBER
from .models import FeedingEvent, Photo, Plant, PlantWeeklyMetric
from .schedules import plan_for_experiment
from .status_summary import compute_setup_status
from .tray_assignment import build_location, plant_tray_placement, resolved_assigned_recipe



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
    location = build_location(tray_placement)
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
    schedule_plan = plan_for_experiment(plant.experiment, days=3, plant_id=str(plant.id))
    scheduled_upcoming = []
    for slot in schedule_plan["slots"]["results"]:
        for item in slot["actions"]:
            scheduled_upcoming.append(
                {
                    "date": slot["date"],
                    "timeframe": slot["timeframe"],
                    "exact_time": slot["exact_time"],
                    "title": item["title"],
                    "action_type": item["action_type"],
                    "blocked_reasons": item["blocked_reasons"],
                }
            )
            if len(scheduled_upcoming) >= 3:
                break
        if len(scheduled_upcoming) >= 3:
            break

    return Response(
        {
            "plant": {
                "uuid": str(plant.id),
                "plant_id": plant.plant_id,
                "cultivar": plant.cultivar,
                "status": plant.status,
                "grade": plant.grade,
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
                "location": location,
                "last_fed_at": last_fed_at.isoformat() if last_fed_at else None,
                "replaced_by_uuid": replaced_by_uuid,
                "replaces_uuid": replaces_uuid,
                "chain_label": chain_label,
                "scheduled_upcoming": scheduled_upcoming,
            },
            "links": {
                "experiment_home": experiment_home,
                "experiment_overview": f"/experiments/{plant.experiment.id}/overview",
                "baseline_capture": f"/experiments/{plant.experiment.id}/baseline?plant={plant.id}",
                "placement": f"/experiments/{plant.experiment.id}/placement",
                "schedule": f"/experiments/{plant.experiment.id}/schedule?plant={plant.id}",
                "feeding": f"/experiments/{plant.experiment.id}/feeding?plant={plant.id}",
            },
            "recent_photos": {
                "count": len(recent_photos),
                "results": [
                    {
                        "id": str(photo.id),
                        "url": _photo_url(request, photo),
                        "created_at": photo.created_at.isoformat(),
                        "tag": photo.tag,
                        "week_number": photo.week_number,
                    }
                    for photo in recent_photos
                ],
                "meta": {},
            },
        }
    )
