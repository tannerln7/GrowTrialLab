from __future__ import annotations

from datetime import datetime, timedelta, timezone as dt_timezone
from uuid import UUID

from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Experiment, FeedingEvent, Plant, Recipe

FEEDING_QUEUE_WINDOW_DAYS = 7
_MIN_DATETIME = datetime.min.replace(tzinfo=dt_timezone.utc)


def _require_app_user(request):
    app_user = getattr(request, "app_user", None)
    if app_user is None:
        return Response({"detail": "Not authenticated."}, status=403)
    return None


def _last_fed_map(experiment: Experiment) -> dict[str, datetime]:
    last_fed_by_plant: dict[str, datetime] = {}
    events = (
        FeedingEvent.objects.filter(experiment=experiment)
        .order_by("plant_id", "-occurred_at")
        .only("plant", "occurred_at")
    )
    for event in events:
        plant_key = str(event.plant.id)
        if plant_key not in last_fed_by_plant:
            last_fed_by_plant[plant_key] = event.occurred_at
    return last_fed_by_plant


def _needs_feeding(last_fed_at: datetime | None) -> bool:
    if last_fed_at is None:
        return True
    cutoff = timezone.now() - timedelta(days=FEEDING_QUEUE_WINDOW_DAYS)
    return last_fed_at < cutoff


def _queue_payload_item(plant: Plant, last_fed_at: datetime | None) -> dict[str, object]:
    return {
        "uuid": str(plant.id),
        "plant_id": plant.plant_id,
        "species_name": plant.species.name,
        "species_category": plant.species.category,
        "cultivar": plant.cultivar,
        "assigned_recipe_code": plant.assigned_recipe.code if plant.assigned_recipe else None,
        "last_fed_at": last_fed_at.isoformat() if last_fed_at else None,
        "needs_feeding": _needs_feeding(last_fed_at),
    }


@api_view(["GET"])
def experiment_feeding_queue(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = Experiment.objects.filter(id=experiment_id).first()
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    plants = list(
        Plant.objects.filter(experiment=experiment, status=Plant.Status.ACTIVE)
        .select_related("species", "assigned_recipe")
        .order_by("id")
    )
    last_fed_by_plant = _last_fed_map(experiment)

    def plant_last_fed(plant: Plant) -> datetime | None:
        return last_fed_by_plant.get(str(plant.id))

    def sort_key(plant: Plant):
        last_fed_at = plant_last_fed(plant)
        has_plant_id = bool((plant.plant_id or "").strip())
        return (
            0 if _needs_feeding(last_fed_at) else 1,
            last_fed_at if last_fed_at is not None else _MIN_DATETIME,
            0 if has_plant_id else 1,
            (plant.plant_id or "").lower(),
            plant.created_at,
        )

    ordered_plants = sorted(plants, key=sort_key)
    remaining_count = sum(1 for plant in plants if _needs_feeding(plant_last_fed(plant)))

    return Response(
        {
            "remaining_count": remaining_count,
            "window_days": FEEDING_QUEUE_WINDOW_DAYS,
            "plants": [
                _queue_payload_item(plant, plant_last_fed(plant))
                for plant in ordered_plants[:50]
            ],
        }
    )


@api_view(["POST"])
def plant_feed(request, plant_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    plant = (
        Plant.objects.filter(id=plant_id)
        .select_related("experiment", "assigned_recipe")
        .first()
    )
    if plant is None:
        return Response({"detail": "Plant not found."}, status=404)
    if plant.experiment.lifecycle_state != Experiment.LifecycleState.RUNNING:
        return Response(
            {"detail": "Feeding is available only while an experiment is running."},
            status=409,
        )

    recipe = None
    recipe_id = request.data.get("recipe_id")
    if recipe_id:
        recipe = Recipe.objects.filter(id=recipe_id, experiment=plant.experiment).first()
        if recipe is None:
            return Response({"detail": "Recipe not found for this experiment."}, status=400)

    occurred_at = request.data.get("occurred_at")
    if occurred_at:
        try:
            parsed = datetime.fromisoformat(str(occurred_at).replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
            occurred_at_value = parsed
        except ValueError:
            return Response({"detail": "occurred_at must be valid ISO datetime."}, status=400)
    else:
        occurred_at_value = timezone.now()

    amount_text = str(request.data.get("amount_text") or "").strip()
    note = str(request.data.get("note") or "").strip()

    event = FeedingEvent.objects.create(
        experiment=plant.experiment,
        plant=plant,
        recipe=recipe,
        amount_text=amount_text,
        note=note,
        notes=note,
        occurred_at=occurred_at_value,
        created_by_email=(request.app_user.email or ""),
    )

    return Response(
        {
            "id": str(event.id),
            "experiment_id": str(event.experiment.id),
            "plant_id": str(event.plant.id),
            "recipe_id": str(event.recipe.id) if event.recipe else None,
            "amount_text": event.amount_text,
            "note": event.note,
            "occurred_at": event.occurred_at.isoformat(),
            "last_fed_at": event.occurred_at.isoformat(),
        },
        status=201,
    )


@api_view(["GET"])
def plant_feeding_recent(request, plant_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    plant = (
        Plant.objects.filter(id=plant_id)
        .select_related("experiment", "species")
        .first()
    )
    if plant is None:
        return Response({"detail": "Plant not found."}, status=404)

    recent_events = list(
        FeedingEvent.objects.filter(plant=plant)
        .select_related("recipe")
        .order_by("-occurred_at")[:10]
    )
    return Response(
        {
            "plant_id": str(plant.id),
            "events": [
                {
                    "id": str(event.id),
                    "occurred_at": event.occurred_at.isoformat(),
                    "recipe_id": str(event.recipe.id) if event.recipe else None,
                    "recipe_code": event.recipe.code if event.recipe else None,
                    "amount_text": event.amount_text,
                    "note": event.note or event.notes,
                    "created_by_email": event.created_by_email,
                }
                for event in recent_events
            ],
        }
    )
