from __future__ import annotations

import pytest

from api.models import Experiment, ScheduleAction, ScheduleRule, ScheduleScope, Tray

pytestmark = pytest.mark.django_db


def test_schedule_plan_is_grouped_and_enveloped(
    api_client,
    experiment,
    tent,
    make_slot,
    make_plant,
    assert_envelope,
):
    slot = make_slot(1, 1)
    tray = Tray.objects.create(experiment=experiment, name="TR1", slot=slot, capacity=4)
    plant = make_plant("NP-500", grade="A")
    tray.plants.add(plant)

    first = ScheduleAction.objects.create(
        experiment=experiment,
        title="Feed tent",
        action_type=ScheduleAction.ActionType.FEED,
        enabled=True,
    )
    second = ScheduleAction.objects.create(
        experiment=experiment,
        title="Photo tent",
        action_type=ScheduleAction.ActionType.PHOTO,
        enabled=True,
    )
    for action in [first, second]:
        ScheduleRule.objects.create(
            schedule_action=action,
            rule_type=ScheduleRule.RuleType.DAILY,
            timeframe=ScheduleRule.Timeframe.MORNING,
        )
        ScheduleScope.objects.create(
            schedule_action=action,
            scope_type=ScheduleScope.ScopeType.TENT,
            scope_id=tent.id,
        )

    response = api_client.get(f"/api/v1/experiments/{experiment.id}/schedules/plan?days=7")
    assert response.status_code == 200
    payload = response.json()
    assert_envelope(payload["slots"])
    assert payload["slots"]["count"] > 0
    first_slot = payload["slots"]["results"][0]
    assert len(first_slot["actions"]) >= 2
    action_titles = [item["title"] for item in first_slot["actions"]]
    assert action_titles == sorted(action_titles)


def test_schedule_feed_blocker_uses_plant_recipe_reason(
    api_client,
    experiment,
    tent,
    make_slot,
    make_plant,
    now_utc,
):
    slot = make_slot(1, 1)
    tray = Tray.objects.create(experiment=experiment, name="TR2", slot=slot, capacity=4)
    plant = make_plant("NP-501", grade="A")
    tray.plants.add(plant)
    experiment.lifecycle_state = Experiment.LifecycleState.RUNNING
    experiment.started_at = now_utc
    experiment.save(update_fields=["lifecycle_state", "started_at", "updated_at"])

    action = ScheduleAction.objects.create(
        experiment=experiment,
        title="Feed tent",
        action_type=ScheduleAction.ActionType.FEED,
        enabled=True,
    )
    ScheduleRule.objects.create(
        schedule_action=action,
        rule_type=ScheduleRule.RuleType.DAILY,
        timeframe=ScheduleRule.Timeframe.MORNING,
    )
    ScheduleScope.objects.create(
        schedule_action=action,
        scope_type=ScheduleScope.ScopeType.TENT,
        scope_id=tent.id,
    )

    response = api_client.get(f"/api/v1/experiments/{experiment.id}/schedules/plan?days=1")
    assert response.status_code == 200
    payload = response.json()
    first_slot = payload["slots"]["results"][0]
    first_action = first_slot["actions"][0]
    assert "Blocked: Needs plant recipe" in first_action["blocked_reasons"]
