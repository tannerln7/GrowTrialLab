from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from uuid import UUID

from django.utils import timezone

from .contracts import list_envelope
from .models import (
    Experiment,
    Plant,
    ScheduleAction,
    ScheduleRule,
    ScheduleScope,
    Tent,
    Tray,
    TrayPlant,
)
from .tray_placement import experiment_tray_placements

WEEKDAY_ORDER = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
WEEKDAY_INDEX = {value: idx for idx, value in enumerate(WEEKDAY_ORDER)}
WEEKDAY_NAME = {
    "MON": "Mon",
    "TUE": "Tue",
    "WED": "Wed",
    "THU": "Thu",
    "FRI": "Fri",
    "SAT": "Sat",
    "SUN": "Sun",
}

TIMEFRAME_ORDER = {
    ScheduleRule.Timeframe.MORNING: 0,
    ScheduleRule.Timeframe.AFTERNOON: 1,
    ScheduleRule.Timeframe.EVENING: 2,
    ScheduleRule.Timeframe.NIGHT: 3,
}

BLOCKED_EXPERIMENT_NOT_RUNNING = "Blocked: Experiment not running"
BLOCKED_NEEDS_RECIPE_ASSIGNMENT = "Blocked: Needs plant recipe"
BLOCKED_UNPLACED = "Blocked: Unplaced"


def normalize_weekdays(raw_weekdays: list[str] | None) -> list[str]:
    if not raw_weekdays:
        return []
    values = {str(item).strip().upper() for item in raw_weekdays if str(item).strip()}
    return [weekday for weekday in WEEKDAY_ORDER if weekday in values]


def rule_start_date(rule: ScheduleRule, experiment: Experiment) -> date:
    if rule.start_date:
        return rule.start_date
    if experiment.started_at:
        return timezone.localtime(experiment.started_at).date()
    return timezone.localdate()


def rule_matches_date(rule: ScheduleRule, experiment: Experiment, current_date: date) -> bool:
    start = rule_start_date(rule, experiment)
    if current_date < start:
        return False
    if rule.end_date and current_date > rule.end_date:
        return False

    if rule.rule_type == ScheduleRule.RuleType.DAILY:
        return True
    if rule.rule_type == ScheduleRule.RuleType.WEEKLY:
        weekdays = normalize_weekdays(rule.weekdays)
        weekday_code = WEEKDAY_ORDER[current_date.weekday()]
        return weekday_code in weekdays
    if rule.rule_type == ScheduleRule.RuleType.CUSTOM_DAYS_INTERVAL:
        interval = int(rule.interval_days or 0)
        if interval < 1:
            return False
        delta_days = (current_date - start).days
        return delta_days % interval == 0
    return False


@dataclass
class ScopeContext:
    tents: dict[str, Tent]
    trays: dict[str, Tray]
    plants: dict[str, Plant]
    active_placements: dict[str, TrayPlant]
    active_plants_by_tray: dict[str, set[str]]
    active_plants_by_tent: dict[str, set[str]]


def build_scope_context(experiment: Experiment) -> ScopeContext:
    tents = {str(item.id): item for item in Tent.objects.filter(experiment=experiment).order_by("name")}
    trays = {
        str(item.id): item
        for item in Tray.objects.filter(experiment=experiment)
        .select_related("slot__tent")
        .order_by("name")
    }
    plants = {
        str(item.id): item
        for item in Plant.objects.filter(experiment=experiment)
        .select_related("species", "assigned_recipe")
        .order_by("plant_id", "id")
    }
    active_ids = {
        str(item.id)
        for item in Plant.objects.filter(experiment=experiment, status=Plant.Status.ACTIVE).only("id")
    }
    placements = experiment_tray_placements(experiment.id)
    active_placements: dict[str, TrayPlant] = {}
    active_plants_by_tray: dict[str, set[str]] = defaultdict(set)
    active_plants_by_tent: dict[str, set[str]] = defaultdict(set)

    for plant_id, placement in placements.items():
        if plant_id not in active_ids:
            continue
        active_placements[plant_id] = placement
        tray_id = str(placement.tray.id)
        active_plants_by_tray[tray_id].add(plant_id)
        if placement.tray.slot and placement.tray.slot.tent:
            active_plants_by_tent[str(placement.tray.slot.tent.id)].add(plant_id)

    return ScopeContext(
        tents=tents,
        trays=trays,
        plants=plants,
        active_placements=active_placements,
        active_plants_by_tray=active_plants_by_tray,
        active_plants_by_tent=active_plants_by_tent,
    )


def scope_label(scope: ScheduleScope, context: ScopeContext) -> str:
    scope_id = str(scope.scope_id)
    if scope.scope_type == ScheduleScope.ScopeType.TENT:
        tent = context.tents.get(scope_id)
        if tent is None:
            return "Tent (missing)"
        tent_key = tent.code or tent.name
        return f"Tent {tent_key}"
    if scope.scope_type == ScheduleScope.ScopeType.TRAY:
        tray = context.trays.get(scope_id)
        if tray is None:
            return "Tray (missing)"
        return f"Tray {tray.name}"
    plant = context.plants.get(scope_id)
    if plant is None:
        return "Plant (missing)"
    return f"Plant {plant.plant_id or str(plant.id)}"


def scope_target_active_plants(scope: ScheduleScope, context: ScopeContext) -> set[str]:
    scope_id = str(scope.scope_id)
    if scope.scope_type == ScheduleScope.ScopeType.TENT:
        return set(context.active_plants_by_tent.get(scope_id, set()))
    if scope.scope_type == ScheduleScope.ScopeType.TRAY:
        return set(context.active_plants_by_tray.get(scope_id, set()))
    plant = context.plants.get(scope_id)
    if plant and plant.status == Plant.Status.ACTIVE:
        return {scope_id}
    return set()


def action_target_active_plants(action: ScheduleAction, context: ScopeContext) -> set[str]:
    targets: set[str] = set()
    for scope in ScheduleScope.objects.filter(schedule_action=action).order_by("scope_type", "id"):
        targets.update(scope_target_active_plants(scope, context))
    return targets


def action_blockers(
    action: ScheduleAction,
    experiment: Experiment,
    context: ScopeContext,
) -> list[str]:
    blockers: list[str] = []
    targets = action_target_active_plants(action, context)

    if (
        action.action_type in {ScheduleAction.ActionType.FEED, ScheduleAction.ActionType.ROTATE}
        and experiment.lifecycle_state != Experiment.LifecycleState.RUNNING
    ):
        blockers.append(BLOCKED_EXPERIMENT_NOT_RUNNING)

    if action.action_type == ScheduleAction.ActionType.FEED:
        has_unplaced = False
        has_missing_recipe = False
        for plant_id in targets:
            placement = context.active_placements.get(plant_id)
            if placement is None:
                has_unplaced = True
                continue
            plant = context.plants.get(plant_id)
            if plant is not None and plant.assigned_recipe is None:
                has_missing_recipe = True
        if has_unplaced:
            blockers.append(BLOCKED_UNPLACED)
        if has_missing_recipe:
            blockers.append(BLOCKED_NEEDS_RECIPE_ASSIGNMENT)

    return blockers


def validate_scope_membership(
    experiment: Experiment,
    scope_type: str,
    scope_id: UUID,
) -> bool:
    if scope_type == ScheduleScope.ScopeType.TENT:
        return Tent.objects.filter(id=scope_id, experiment=experiment).exists()
    if scope_type == ScheduleScope.ScopeType.TRAY:
        return Tray.objects.filter(id=scope_id, experiment=experiment).exists()
    if scope_type == ScheduleScope.ScopeType.PLANT:
        return Plant.objects.filter(id=scope_id, experiment=experiment).exists()
    return False


def rule_slot_key(rule: ScheduleRule) -> tuple[str | None, str | None]:
    if rule.exact_time:
        return (rule.exact_time.strftime("%H:%M:%S"), None)
    return (None, rule.timeframe)


def timeframe_title(value: str | None) -> str:
    if value is None:
        return "Time"
    return value.replace("_", " ").title()


def plan_for_experiment(
    experiment: Experiment,
    *,
    days: int = 14,
    plant_id: str | None = None,
) -> dict:
    normalized_days = max(1, min(28, int(days)))
    start = timezone.localdate()
    end = start + timedelta(days=normalized_days - 1)
    context = build_scope_context(experiment)
    actions = list(
        ScheduleAction.objects.filter(experiment=experiment, enabled=True)
        .select_related("experiment")
        .order_by("action_type", "title", "id")
    )

    slots: dict[tuple[str, str | None, str | None], dict] = {}
    seen_action_slot: set[tuple[str, str]] = set()
    plant_filter = str(plant_id) if plant_id else None

    for action in actions:
        action_scopes = list(
            ScheduleScope.objects.filter(schedule_action=action).order_by("scope_type", "created_at", "id")
        )
        scope_labels = [scope_label(item, context) for item in action_scopes]
        targets = action_target_active_plants(action, context)
        if plant_filter and plant_filter not in targets:
            continue
        blockers = action_blockers(action, experiment, context)
        scope_summary = ", ".join(scope_labels[:3])
        if len(scope_labels) > 3:
            scope_summary = f"{scope_summary} +{len(scope_labels) - 3} more"

        for rule in ScheduleRule.objects.filter(schedule_action=action).order_by("created_at", "id"):
            current_date = start
            while current_date <= end:
                if rule_matches_date(rule, experiment, current_date):
                    exact_time, timeframe = rule_slot_key(rule)
                    slot_key = (current_date.isoformat(), exact_time, timeframe)
                    dedupe_key = (f"{slot_key[0]}|{slot_key[1]}|{slot_key[2]}", str(action.id))
                    if dedupe_key in seen_action_slot:
                        current_date += timedelta(days=1)
                        continue
                    seen_action_slot.add(dedupe_key)
                    slot = slots.setdefault(
                        slot_key,
                        {
                            "date": slot_key[0],
                            "timeframe": timeframe,
                            "exact_time": exact_time,
                            "slot_label": (
                                exact_time if exact_time else timeframe_title(timeframe)
                            ),
                            "actions": [],
                        },
                    )
                    slot["actions"].append(
                        {
                            "schedule_id": str(action.id),
                            "title": action.title,
                            "action_type": action.action_type,
                            "description": action.description,
                            "scope_summary": scope_summary,
                            "scope_labels": scope_labels,
                            "blocked_reasons": blockers,
                        }
                    )
                current_date += timedelta(days=1)

    sorted_slots = sorted(
        slots.values(),
        key=lambda slot: (
            slot["date"],
            0 if slot["exact_time"] is not None else 1,
            slot["exact_time"] or "",
            TIMEFRAME_ORDER.get(slot["timeframe"], 99),
            slot["timeframe"] or "",
        ),
    )
    for slot in sorted_slots:
        slot["actions"].sort(
            key=lambda item: (item["action_type"], item["title"].lower(), item["schedule_id"])
        )

    next_slot = sorted_slots[0] if sorted_slots else None
    due_today = sum(
        len(slot["actions"]) for slot in sorted_slots if slot["date"] == start.isoformat()
    )

    return {
        "days": normalized_days,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "slots": list_envelope(sorted_slots),
        "next_slot": {
            "date": next_slot["date"],
            "timeframe": next_slot["timeframe"],
            "exact_time": next_slot["exact_time"],
            "actions_count": len(next_slot["actions"]),
        }
        if next_slot
        else None,
        "due_counts_today": due_today,
    }
