from __future__ import annotations

from uuid import UUID

from rest_framework.decorators import api_view
from rest_framework.response import Response

from .baseline import BASELINE_WEEK_NUMBER
from .models import Photo, Plant, PlantWeeklyMetric
from .status_summary import compute_setup_status


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

    return Response(
        {
            "plant": {
                "uuid": str(plant.id),
                "plant_id": plant.plant_id,
                "cultivar": plant.cultivar,
                "status": plant.status,
                "bin": plant.bin,
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
                "assigned_recipe_code": plant.assigned_recipe.code if plant.assigned_recipe else None,
            },
            "links": {
                "experiment_home": experiment_home,
                "experiment_overview": f"/experiments/{plant.experiment.id}/overview",
                "setup_assignment": f"/experiments/{plant.experiment.id}/assignment",
                "baseline_capture": f"/experiments/{plant.experiment.id}/baseline?plant={plant.id}",
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
