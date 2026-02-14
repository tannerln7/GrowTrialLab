from __future__ import annotations

from dataclasses import dataclass

from .baseline import BASELINE_WEEK_NUMBER
from .models import Block, Experiment, Plant, PlantWeeklyMetric, Recipe, Tent
from .schedules import plan_for_experiment
from .tent_restrictions import tent_allows_species
from .tray_assignment import experiment_tray_placements


@dataclass(frozen=True)
class SetupStatus:
    is_complete: bool
    missing_plants: bool
    missing_tents: bool
    missing_blocks: bool
    missing_recipes: bool


def compute_setup_status(experiment: Experiment) -> SetupStatus:
    has_plants = Plant.objects.filter(experiment=experiment).exists()
    has_tents = Tent.objects.filter(experiment=experiment).exists()
    has_blocks = Block.objects.filter(tent__experiment=experiment).exists()
    recipes = Recipe.objects.filter(experiment=experiment).only("code")
    has_r0 = recipes.filter(code="R0").exists()
    recipe_count = recipes.count()
    has_required_recipes = has_r0 and recipe_count >= 2

    return SetupStatus(
        is_complete=has_plants and has_tents and has_blocks and has_required_recipes,
        missing_plants=not has_plants,
        missing_tents=not has_tents,
        missing_blocks=not has_blocks,
        missing_recipes=not has_required_recipes,
    )


def experiment_status_summary_payload(experiment: Experiment) -> dict:
    setup = compute_setup_status(experiment)
    active_plants = list(
        Plant.objects.filter(experiment=experiment, status=Plant.Status.ACTIVE)
        .select_related("assigned_recipe")
        .only("id", "bin", "assigned_recipe", "species")
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
    needs_placement = 0
    needs_tray_recipe = 0
    needs_tent_restriction = 0
    tray_placements = experiment_tray_placements(experiment.id)
    for plant in active_plants:
        if str(plant.id) not in baseline_plant_ids or not plant.bin:
            needs_baseline += 1
        tray_placement = tray_placements.get(str(plant.id))
        if tray_placement is None:
            needs_placement += 1
        elif tray_placement.tray.assigned_recipe is None:
            needs_tray_recipe += 1
        elif tray_placement.tray.block and tray_placement.tray.block.tent:
            if not tent_allows_species(tray_placement.tray.block.tent, plant.species.id):
                needs_tent_restriction += 1

    needs_assignment = needs_placement + needs_tray_recipe
    readiness_ready = (
        setup.is_complete
        and needs_baseline == 0
        and needs_placement == 0
        and needs_tray_recipe == 0
        and needs_tent_restriction == 0
    )
    schedule_plan = plan_for_experiment(experiment, days=14)

    return {
        "setup": {
            "is_complete": setup.is_complete,
            "missing": {
                "plants": setup.missing_plants,
                "tents": setup.missing_tents,
                "blocks": setup.missing_blocks,
                "recipes": setup.missing_recipes,
            },
        },
        "lifecycle": {
            "state": experiment.lifecycle_state,
            "started_at": experiment.started_at.isoformat() if experiment.started_at else None,
            "stopped_at": experiment.stopped_at.isoformat() if experiment.stopped_at else None,
        },
        "readiness": {
            "is_ready": readiness_ready,
            "ready_to_start": readiness_ready,
            "counts": {
                "active_plants": len(active_plants),
                "needs_baseline": needs_baseline,
                "needs_assignment": needs_assignment,
                "needs_placement": needs_placement,
                "needs_tray_recipe": needs_tray_recipe,
                "needs_tent_restriction": needs_tent_restriction,
            },
        },
        "schedule": {
            "next_scheduled_slot": schedule_plan["next_slot"],
            "due_counts_today": schedule_plan["due_counts_today"],
        },
    }
