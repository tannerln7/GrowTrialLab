from __future__ import annotations

from uuid import UUID

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .groups import (
    GROUP_ASSIGNMENT_ALGORITHM,
    baseline_packet_complete,
    generate_seed,
    get_or_create_setup_state,
    groups_locked,
    groups_packet_payload,
    recipe_sort_key,
    sorted_recipe_codes,
    stratified_assignments,
    summarize_assignments,
    validate_groups_inputs,
)
from .models import Experiment, Plant, Recipe
from .serializers import (
    ExperimentSetupStateSerializer,
    GroupRecipeCreateSerializer,
    GroupRecipeUpdateSerializer,
    GroupsApplySerializer,
    GroupsPacketSerializer,
    GroupsPreviewSerializer,
)
from .setup_packets import PACKET_GROUPS, normalize_packet_ids, next_incomplete_packet


def _require_app_user(request):
    app_user = getattr(request, "app_user", None)
    if app_user is None:
        return Response({"detail": "Not authenticated."}, status=403)
    return None


def _get_experiment(experiment_id: UUID):
    return Experiment.objects.filter(id=experiment_id).first()


def _serialize_recipe(recipe: Recipe) -> dict:
    return {
        "id": str(recipe.id),
        "code": recipe.code,
        "name": recipe.name,
        "notes": recipe.notes,
    }


def _validation_error_payload(validation) -> dict:
    payload = {
        "detail": "Groups randomization requirements are not met.",
        "errors": validation.errors,
    }
    if validation.missing_bin_plants:
        payload["missing_bin_count"] = len(validation.missing_bin_plants)
        payload["missing_bin_plants"] = [
            {
                "plant_uuid": str(plant.id),
                "plant_id": plant.plant_id,
                "species_name": plant.species.name,
            }
            for plant in validation.missing_bin_plants
        ]
    return payload


def _status_payload(experiment: Experiment, setup_state) -> dict:
    recipes = sorted(
        list(Recipe.objects.filter(experiment=experiment)),
        key=recipe_sort_key,
    )
    recipe_codes = sorted_recipe_codes(recipes)
    active_plants = list(
        Plant.objects.filter(experiment=experiment, status=Plant.Status.ACTIVE)
        .select_related("species", "assigned_recipe")
        .order_by("id")
    )
    assigned_codes = {
        str(plant.id): plant.assigned_recipe.code if plant.assigned_recipe else None
        for plant in active_plants
    }
    summary = summarize_assignments(active_plants, recipe_codes, assigned_codes)
    bins_assigned = sum(1 for plant in active_plants if plant.bin in {"A", "B", "C"})
    return {
        "baseline_packet_complete": baseline_packet_complete(setup_state),
        "bins_assigned": bins_assigned,
        "total_active_plants": len(active_plants),
        "groups_locked": groups_locked(setup_state),
        "packet_complete": PACKET_GROUPS in normalize_packet_ids(setup_state.completed_packets or []),
        "recipes": [_serialize_recipe(recipe) for recipe in recipes],
        "summary": summary,
        "packet_data": groups_packet_payload(setup_state),
    }


@api_view(["GET"])
def experiment_groups_status(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    setup_state = get_or_create_setup_state(experiment)
    return Response(_status_payload(experiment, setup_state))


@api_view(["POST"])
def experiment_groups_recipes(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    serializer = GroupRecipeCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    code = serializer.validated_data["code"]
    recipe = Recipe(
        experiment=experiment,
        code=code,
        name=serializer.validated_data["name"],
        notes=serializer.validated_data.get("notes", ""),
    )
    try:
        recipe.save()
    except IntegrityError:
        return Response({"detail": f"Recipe code '{code}' already exists in this experiment."}, status=400)
    return Response(_serialize_recipe(recipe), status=201)


@api_view(["PATCH"])
def experiment_groups_recipe_update(request, experiment_id: UUID, recipe_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    recipe = Recipe.objects.filter(id=recipe_id, experiment=experiment).first()
    if recipe is None:
        return Response({"detail": "Recipe not found."}, status=404)
    if "code" in request.data:
        return Response({"detail": "Recipe code is immutable."}, status=400)

    serializer = GroupRecipeUpdateSerializer(data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    if "name" in serializer.validated_data:
        recipe.name = serializer.validated_data["name"]
    if "notes" in serializer.validated_data:
        recipe.notes = serializer.validated_data["notes"]
    recipe.save(update_fields=["name", "notes"])
    return Response(_serialize_recipe(recipe))


@api_view(["POST"])
def experiment_groups_preview(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    serializer = GroupsPreviewSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    validation = validate_groups_inputs(experiment)
    if validation.errors:
        return Response(_validation_error_payload(validation), status=400)

    seed = serializer.validated_data.get("seed") or generate_seed()
    recipe_codes = sorted_recipe_codes(validation.recipes)
    assignments = stratified_assignments(validation.active_plants, recipe_codes, seed)
    summary = summarize_assignments(validation.active_plants, recipe_codes, assignments)
    proposed = [
        {"plant_uuid": plant_uuid, "proposed_recipe_code": recipe_code}
        for plant_uuid, recipe_code in sorted(assignments.items())
    ]
    return Response(
        {
            "seed": seed,
            "algorithm": GROUP_ASSIGNMENT_ALGORITHM,
            "proposed_assignments": proposed,
            "summary": summary,
        }
    )


@api_view(["POST"])
def experiment_groups_apply(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    serializer = GroupsApplySerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    validation = validate_groups_inputs(experiment)
    if validation.errors:
        return Response(_validation_error_payload(validation), status=400)

    seed = serializer.validated_data["seed"]
    recipe_codes = sorted_recipe_codes(validation.recipes)
    recipe_by_code = {recipe.code: recipe for recipe in validation.recipes}
    assignments = stratified_assignments(validation.active_plants, recipe_codes, seed)

    now = timezone.now()
    with transaction.atomic():
        for plant in validation.active_plants:
            recipe_code = assignments[str(plant.id)]
            plant.assigned_recipe = recipe_by_code[recipe_code]
            plant.updated_at = now
        Plant.objects.bulk_update(validation.active_plants, ["assigned_recipe", "updated_at"])

        setup_state = get_or_create_setup_state(experiment)
        packet_data = dict(setup_state.packet_data or {})
        groups_payload = packet_data.get(PACKET_GROUPS)
        if not isinstance(groups_payload, dict):
            groups_payload = {}
        groups_payload["algorithm"] = GROUP_ASSIGNMENT_ALGORITHM
        groups_payload["seed"] = seed
        groups_payload["applied_at"] = now.isoformat()
        groups_payload["recipe_codes"] = recipe_codes
        groups_payload["locked"] = False
        packet_data[PACKET_GROUPS] = groups_payload
        setup_state.packet_data = packet_data
        setup_state.save(update_fields=["packet_data", "updated_at"])

    summary = summarize_assignments(validation.active_plants, recipe_codes, assignments)
    return Response(
        {
            "seed": seed,
            "algorithm": GROUP_ASSIGNMENT_ALGORITHM,
            "summary": summary,
            "packet_data": groups_payload,
        }
    )


@api_view(["PUT"])
def experiment_groups_packet(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    serializer = GroupsPacketSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    setup_state = get_or_create_setup_state(experiment)
    packet_data = dict(setup_state.packet_data or {})
    groups_payload = packet_data.get(PACKET_GROUPS)
    if not isinstance(groups_payload, dict):
        groups_payload = {}
    if "notes" in serializer.validated_data:
        groups_payload["notes"] = serializer.validated_data["notes"]
    packet_data[PACKET_GROUPS] = groups_payload
    setup_state.packet_data = packet_data
    setup_state.save(update_fields=["packet_data", "updated_at"])
    return Response({"packet": PACKET_GROUPS, "data": groups_payload})


@api_view(["POST"])
def complete_groups_packet(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    active_plants = Plant.objects.filter(experiment=experiment, status=Plant.Status.ACTIVE)
    total_active = active_plants.count()
    unassigned = active_plants.filter(assigned_recipe__isnull=True).count()
    errors: list[str] = []
    if total_active < 1:
        errors.append("At least 1 active plant is required before completing Packet 4.")
    if unassigned > 0:
        errors.append("All active plants must have an assigned group before completing Packet 4.")
    if errors:
        return Response({"detail": "Packet 4 cannot be completed.", "errors": errors}, status=400)

    setup_state = get_or_create_setup_state(experiment)
    completed = normalize_packet_ids([*setup_state.completed_packets, PACKET_GROUPS])
    setup_state.completed_packets = completed
    setup_state.current_packet = next_incomplete_packet(completed)

    packet_data = dict(setup_state.packet_data or {})
    groups_payload = packet_data.get(PACKET_GROUPS)
    if not isinstance(groups_payload, dict):
        groups_payload = {}
    groups_payload["locked"] = True
    packet_data[PACKET_GROUPS] = groups_payload
    setup_state.packet_data = packet_data
    setup_state.save(update_fields=["completed_packets", "current_packet", "packet_data", "updated_at"])

    return Response(ExperimentSetupStateSerializer(setup_state).data)
