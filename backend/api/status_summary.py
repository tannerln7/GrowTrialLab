from __future__ import annotations

from dataclasses import dataclass

from .baseline import BASELINE_WEEK_NUMBER
from .models import Experiment, Plant, PlantWeeklyMetric, Recipe, Slot, Tent
from .schedules import plan_for_experiment
from .tent_restrictions import tent_allows_species
from .tray_placement import experiment_tray_placements


@dataclass(frozen=True)
class SetupStatus:
    is_complete: bool
    missing_plants: bool
    missing_tents: bool
    missing_slots: bool
    missing_recipes: bool


@dataclass(frozen=True)
class ReadinessCounts:
    active_plants: int
    needs_baseline: int
    needs_assignment: int
    needs_placement: int
    needs_plant_recipe: int
    needs_tent_restriction: int

    @property
    def ready_to_start(self) -> bool:
        return (
            self.needs_baseline == 0
            and self.needs_placement == 0
            and self.needs_plant_recipe == 0
            and self.needs_tent_restriction == 0
        )



def compute_setup_status(experiment: Experiment) -> SetupStatus:
    has_plants = Plant.objects.filter(experiment=experiment).exists()
    has_tents = Tent.objects.filter(experiment=experiment).exists()
    has_slots = Slot.objects.filter(tent__experiment=experiment).exists()
    recipes = Recipe.objects.filter(experiment=experiment).only("code")
    has_r0 = recipes.filter(code="R0").exists()
    recipe_count = recipes.count()
    has_required_recipes = has_r0 and recipe_count >= 2

    return SetupStatus(
        is_complete=has_plants and has_tents and has_slots and has_required_recipes,
        missing_plants=not has_plants,
        missing_tents=not has_tents,
        missing_slots=not has_slots,
        missing_recipes=not has_required_recipes,
    )


def compute_readiness_counts(experiment: Experiment) -> ReadinessCounts:
    active_plants = list(
        Plant.objects.filter(experiment=experiment, status=Plant.Status.ACTIVE)
        .select_related("species", "assigned_recipe")
        .only("id", "grade", "species", "assigned_recipe")
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
    needs_placement = 0
    needs_plant_recipe = 0
    needs_tent_restriction = 0
    tray_placements = experiment_tray_placements(experiment.id)

    for plant in active_plants:
        if str(plant.id) not in baseline_plant_ids or not plant.grade:
            needs_baseline += 1

        tray_placement = tray_placements.get(str(plant.id))
        if tray_placement is None:
            needs_placement += 1
        elif tray_placement.tray.slot and tray_placement.tray.slot.tent and not tent_allows_species(
            tray_placement.tray.slot.tent, plant.species.id
        ):
            needs_tent_restriction += 1
        if plant.assigned_recipe is None:
            needs_plant_recipe += 1
        if tray_placement is None or plant.assigned_recipe is None:
            needs_assignment += 1

    return ReadinessCounts(
        active_plants=len(active_plants),
        needs_baseline=needs_baseline,
        needs_assignment=needs_assignment,
        needs_placement=needs_placement,
        needs_plant_recipe=needs_plant_recipe,
        needs_tent_restriction=needs_tent_restriction,
    )


def readiness_diagnostics(counts: ReadinessCounts, setup: SetupStatus) -> dict:
    reason_counts: dict[str, int] = {}
    if counts.needs_baseline:
        reason_counts["needs_baseline"] = counts.needs_baseline
    if counts.needs_placement:
        reason_counts["needs_placement"] = counts.needs_placement
    if counts.needs_plant_recipe:
        reason_counts["needs_plant_recipe"] = counts.needs_plant_recipe
    if counts.needs_tent_restriction:
        reason_counts["needs_tent_restriction"] = counts.needs_tent_restriction

    missing_setup: list[str] = []
    if setup.missing_plants:
        missing_setup.append("plants")
    if setup.missing_tents:
        missing_setup.append("tents")
    if setup.missing_slots:
        missing_setup.append("slots")
    if setup.missing_recipes:
        missing_setup.append("recipes")

    return {
        "reason_counts": reason_counts,
        "missing_setup": missing_setup,
    }


def experiment_status_summary_payload(experiment: Experiment) -> dict:
    setup = compute_setup_status(experiment)
    readiness_counts = compute_readiness_counts(experiment)
    readiness_ready = setup.is_complete and readiness_counts.ready_to_start
    schedule_plan = plan_for_experiment(experiment, days=14)

    return {
        "setup": {
            "is_complete": setup.is_complete,
            "missing": {
                "plants": setup.missing_plants,
                "tents": setup.missing_tents,
                "slots": setup.missing_slots,
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
                "active_plants": readiness_counts.active_plants,
                "needs_baseline": readiness_counts.needs_baseline,
                "needs_assignment": readiness_counts.needs_assignment,
                "needs_placement": readiness_counts.needs_placement,
                "needs_plant_recipe": readiness_counts.needs_plant_recipe,
                "needs_tent_restriction": readiness_counts.needs_tent_restriction,
            },
            "meta": readiness_diagnostics(readiness_counts, setup),
        },
        "schedule": {
            "next_scheduled_slot": schedule_plan["next_slot"],
            "due_counts_today": schedule_plan["due_counts_today"],
        },
    }
