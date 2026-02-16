from __future__ import annotations

import re
from uuid import UUID

from rest_framework.decorators import api_view
from rest_framework.response import Response

from .contracts import error_with_diagnostics, list_envelope
from .models import Experiment, Recipe

RECIPE_CODE_PATTERN = re.compile(r"^R\d+$")



def _require_app_user(request):
    app_user = getattr(request, "app_user", None)
    if app_user is None:
        return Response({"detail": "Not authenticated."}, status=403)
    return None


@api_view(["GET", "POST"])
def experiment_recipes(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = Experiment.objects.filter(id=experiment_id).first()
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    if request.method == "GET":
        recipes = list(
            Recipe.objects.filter(experiment=experiment).order_by("code", "name", "id")
        )
        return Response(
            list_envelope(
                [
                    {
                        "id": str(recipe.id),
                        "experiment": str(recipe.experiment.id),
                        "code": recipe.code,
                        "name": recipe.name,
                        "notes": recipe.notes,
                    }
                    for recipe in recipes
                ]
            )
        )

    code = (request.data.get("code") or "").strip().upper()
    name = (request.data.get("name") or "").strip()
    notes = (request.data.get("notes") or "").strip()

    if not code or not RECIPE_CODE_PATTERN.match(code):
        return Response({"detail": "code must match R0, R1, R2 ..."}, status=400)
    if not name:
        return Response({"detail": "name is required."}, status=400)
    if Recipe.objects.filter(experiment=experiment, code=code).exists():
        return Response({"detail": "Recipe code already exists in this experiment."}, status=409)

    recipe = Recipe.objects.create(
        experiment=experiment,
        code=code,
        name=name,
        notes=notes,
    )
    return Response(
        {
            "id": str(recipe.id),
            "experiment": str(recipe.experiment.id),
            "code": recipe.code,
            "name": recipe.name,
            "notes": recipe.notes,
        },
        status=201,
    )


@api_view(["PATCH", "DELETE"])
def recipe_detail(request, recipe_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    recipe = Recipe.objects.filter(id=recipe_id).select_related("experiment").first()
    if recipe is None:
        return Response({"detail": "Recipe not found."}, status=404)

    if request.method == "DELETE":
        if recipe.experiment.lifecycle_state == Experiment.LifecycleState.RUNNING:
            return error_with_diagnostics(
                "Recipes cannot be deleted while the experiment is running.",
                diagnostics={"reason_counts": {"running": 1}},
            )
        recipe.delete()
        return Response(status=204)

    if "code" in request.data:
        return Response({"detail": "code is immutable."}, status=400)

    if "name" in request.data:
        name = (request.data.get("name") or "").strip()
        if not name:
            return Response({"detail": "name cannot be blank."}, status=400)
        recipe.name = name
    if "notes" in request.data:
        recipe.notes = (request.data.get("notes") or "").strip()

    recipe.save(update_fields=["name", "notes"])
    return Response(
        {
            "id": str(recipe.id),
            "experiment": str(recipe.experiment.id),
            "code": recipe.code,
            "name": recipe.name,
            "notes": recipe.notes,
        }
    )
