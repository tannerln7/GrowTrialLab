from __future__ import annotations

from dataclasses import dataclass

from .baseline import BASELINE_WEEK_NUMBER
from .models import Block, Experiment, Plant, PlantWeeklyMetric, Recipe


@dataclass(frozen=True)
class SetupStatus:
    is_complete: bool
    missing_plants: bool
    missing_blocks: bool
    missing_recipes: bool


def compute_setup_status(experiment: Experiment) -> SetupStatus:
    has_plants = Plant.objects.filter(experiment=experiment).exists()
    has_blocks = Block.objects.filter(experiment=experiment).exists()
    recipes = Recipe.objects.filter(experiment=experiment).only("code")
    has_r0 = recipes.filter(code="R0").exists()
    recipe_count = recipes.count()
    has_required_recipes = has_r0 and recipe_count >= 2

    return SetupStatus(
        is_complete=has_plants and has_blocks and has_required_recipes,
        missing_plants=not has_plants,
        missing_blocks=not has_blocks,
        missing_recipes=not has_required_recipes,
    )


def experiment_status_summary_payload(experiment: Experiment) -> dict:
    setup = compute_setup_status(experiment)
    active_plants = list(
        Plant.objects.filter(experiment=experiment, status=Plant.Status.ACTIVE)
        .only("id", "bin", "assigned_recipe_id")
        .order_by("id")
    )
    baseline_plant_ids = {
        str(item)
        for item in PlantWeeklyMetric.objects.filter(
            experiment=experiment,
            week_number=BASELINE_WEEK_NUMBER,
        ).values_list("plant_id", flat=True)
    }

    needs_baseline = 0
    needs_assignment = 0
    for plant in active_plants:
        if str(plant.id) not in baseline_plant_ids or not plant.bin:
            needs_baseline += 1
        if plant.assigned_recipe_id is None:
            needs_assignment += 1

    readiness_ready = setup.is_complete and needs_baseline == 0 and needs_assignment == 0
    return {
        "setup": {
            "is_complete": setup.is_complete,
            "missing": {
                "plants": setup.missing_plants,
                "blocks": setup.missing_blocks,
                "recipes": setup.missing_recipes,
            },
        },
        "readiness": {
            "is_ready": readiness_ready,
            "counts": {
                "active_plants": len(active_plants),
                "needs_baseline": needs_baseline,
                "needs_assignment": needs_assignment,
            },
        },
    }
