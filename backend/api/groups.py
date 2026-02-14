from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
import random
import re
import secrets
from typing import Iterable, Mapping

from django.utils import timezone

from .models import Experiment, ExperimentSetupState, Plant, Recipe
from .setup_packets import PACKET_BASELINE, PACKET_GROUPS, normalize_packet_ids

GROUP_CODE_PATTERN = re.compile(r"^R\d+$")
GROUP_ASSIGNMENT_ALGORITHM = "stratified_v1"


@dataclass
class GroupValidationResult:
    recipes: list[Recipe]
    active_plants: list[Plant]
    missing_bin_plants: list[Plant]
    errors: list[str]


def get_or_create_setup_state(experiment: Experiment) -> ExperimentSetupState:
    setup_state, _ = ExperimentSetupState.objects.get_or_create(experiment=experiment)
    return setup_state


def recipe_sort_key(recipe: Recipe) -> tuple[int, str]:
    suffix = recipe.code[1:]
    if suffix.isdigit():
        return (int(suffix), recipe.code)
    return (10**9, recipe.code)


def sorted_recipe_codes(recipes: Iterable[Recipe]) -> list[str]:
    return [recipe.code for recipe in sorted(recipes, key=recipe_sort_key)]


def groups_packet_payload(setup_state: ExperimentSetupState) -> dict:
    payload = setup_state.packet_data.get(PACKET_GROUPS)
    if isinstance(payload, dict):
        return dict(payload)
    return {}


def baseline_packet_complete(setup_state: ExperimentSetupState) -> bool:
    completed = set(normalize_packet_ids(setup_state.completed_packets or []))
    return PACKET_BASELINE in completed


def groups_locked(setup_state: ExperimentSetupState) -> bool:
    payload = groups_packet_payload(setup_state)
    return bool(payload.get("locked"))


def generate_seed() -> int:
    return secrets.randbelow(2_147_483_647) + 1


def validate_groups_inputs(experiment: Experiment) -> GroupValidationResult:
    recipes = sorted(
        list(Recipe.objects.filter(experiment=experiment)),
        key=recipe_sort_key,
    )
    active_plants = list(
        Plant.objects.filter(experiment=experiment, status=Plant.Status.ACTIVE)
        .select_related("species", "assigned_recipe")
        .order_by("id")
    )
    missing_bin_plants = [plant for plant in active_plants if plant.bin not in {"A", "B", "C"}]
    errors: list[str] = []
    recipe_codes = {recipe.code for recipe in recipes}
    if len(recipes) < 2:
        errors.append("At least 2 recipes are required before randomization.")
    if "R0" not in recipe_codes:
        errors.append("Recipe code 'R0' (control) is required before randomization.")
    if not active_plants:
        errors.append("At least 1 active plant is required before randomization.")
    if missing_bin_plants:
        errors.append("All active plants must have bin assignment before randomization.")
    return GroupValidationResult(
        recipes=recipes,
        active_plants=active_plants,
        missing_bin_plants=missing_bin_plants,
        errors=errors,
    )


def stratified_assignments(
    plants: list[Plant],
    recipe_codes: list[str],
    seed: int,
) -> dict[str, str]:
    rng = random.Random(seed)
    strata: dict[tuple[str, str], list[Plant]] = defaultdict(list)
    for plant in plants:
        category = (plant.species.category or "").strip().lower() or "uncategorized"
        strata[(plant.bin or "", category)].append(plant)

    assignments: dict[str, str] = {}
    for stratum_key in sorted(strata.keys()):
        bucket = sorted(strata[stratum_key], key=lambda plant: str(plant.id))
        rng.shuffle(bucket)
        for index, plant in enumerate(bucket):
            assignments[str(plant.id)] = recipe_codes[index % len(recipe_codes)]
    return assignments


def summarize_assignments(
    plants: list[Plant],
    recipe_codes: list[str],
    assigned_codes: Mapping[str, str | None],
) -> dict:
    counts_by_recipe_code: dict[str, int] = {code: 0 for code in recipe_codes}
    counts_by_bin: dict[str, dict[str, int]] = {}
    counts_by_category: dict[str, dict[str, int]] = {}
    assigned = 0

    for plant in plants:
        plant_key = str(plant.id)
        recipe_code = assigned_codes.get(plant_key)
        if recipe_code:
            assigned += 1
            if recipe_code not in counts_by_recipe_code:
                counts_by_recipe_code[recipe_code] = 0
            counts_by_recipe_code[recipe_code] += 1

            bin_key = plant.bin or "unassigned"
            if bin_key not in counts_by_bin:
                counts_by_bin[bin_key] = {code: 0 for code in counts_by_recipe_code}
            if recipe_code not in counts_by_bin[bin_key]:
                counts_by_bin[bin_key][recipe_code] = 0
            counts_by_bin[bin_key][recipe_code] += 1

            category_key = (plant.species.category or "").strip().lower() or "uncategorized"
            if category_key not in counts_by_category:
                counts_by_category[category_key] = {code: 0 for code in counts_by_recipe_code}
            if recipe_code not in counts_by_category[category_key]:
                counts_by_category[category_key][recipe_code] = 0
            counts_by_category[category_key][recipe_code] += 1

    # Keep zero-count recipe keys present in each nested summary for UI consistency.
    for per_bin in counts_by_bin.values():
        for code in counts_by_recipe_code:
            per_bin.setdefault(code, 0)
    for per_category in counts_by_category.values():
        for code in counts_by_recipe_code:
            per_category.setdefault(code, 0)

    total_plants = len(plants)
    return {
        "total_plants": total_plants,
        "assigned": assigned,
        "unassigned": max(total_plants - assigned, 0),
        "counts_by_recipe_code": counts_by_recipe_code,
        "counts_by_bin": counts_by_bin,
        "counts_by_category": counts_by_category,
    }


def applied_timestamp() -> str:
    return timezone.now().isoformat()
