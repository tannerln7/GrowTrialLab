from __future__ import annotations

import pytest

from api.models import Experiment, Recipe, Tray

pytestmark = pytest.mark.django_db


def test_blocked_start_includes_diagnostics(
    api_client,
    experiment,
    assert_blocked_diagnostics,
):
    response = api_client.post(f"/api/v1/experiments/{experiment.id}/start")
    assert response.status_code == 409
    payload = response.json()
    assert_blocked_diagnostics(payload)
    assert "setup" in payload["diagnostics"]
    assert "ready_to_start" in payload["diagnostics"]
    assert "counts" in payload["diagnostics"]


def test_feed_blocked_when_not_running_includes_diagnostics(
    api_client,
    make_plant,
    assert_blocked_diagnostics,
):
    plant = make_plant("NP-200", grade="A")
    response = api_client.post(f"/api/v1/plants/{plant.id}/feed", {"amount_text": "1 mL"}, format="json")
    assert response.status_code == 409
    payload = response.json()
    assert_blocked_diagnostics(payload, reason_key="experiment_not_running")
    assert payload["diagnostics"]["reason_counts"]["experiment_not_running"] == 1


def test_feed_blocked_when_plant_recipe_missing_includes_diagnostics(
    api_client,
    experiment,
    make_slot,
    make_plant,
    now_utc,
    assert_blocked_diagnostics,
):
    slot = make_slot(1, 1)
    tray = Tray.objects.create(experiment=experiment, name="TR-201", slot=slot, capacity=2)
    plant = make_plant("NP-201", grade="A")
    tray.plants.add(plant)
    experiment.lifecycle_state = Experiment.LifecycleState.RUNNING
    experiment.started_at = now_utc
    experiment.save(update_fields=["lifecycle_state", "started_at", "updated_at"])

    response = api_client.post(f"/api/v1/plants/{plant.id}/feed", {"amount_text": "1 mL"}, format="json")
    assert response.status_code == 409
    payload = response.json()
    assert_blocked_diagnostics(payload, reason_key="plant_recipe_missing")
    assert payload["diagnostics"]["reason_counts"]["plant_recipe_missing"] == 1


def test_auto_place_blocked_includes_diagnostics(
    api_client,
    experiment,
    make_plant,
    assert_blocked_diagnostics,
):
    make_plant("NP-300", grade=None)
    response = api_client.post(
        f"/api/v1/experiments/{experiment.id}/placement/auto",
        {"clear_existing": True},
        format="json",
    )
    assert response.status_code == 409
    payload = response.json()
    assert_blocked_diagnostics(payload)


def test_start_blocked_when_plant_recipe_missing(
    api_client,
    experiment,
    make_slot,
    make_plant,
    mark_baseline,
    assert_blocked_diagnostics,
):
    slot = make_slot(1, 1)
    Recipe.objects.create(experiment=experiment, code="R0", name="Control")
    Recipe.objects.create(experiment=experiment, code="R1", name="Treatment")
    plant = make_plant("NP-READY-002", grade="A")
    mark_baseline(plant)
    tray = Tray.objects.create(experiment=experiment, name="TR-READY-2", slot=slot, capacity=2)
    tray.plants.add(plant)

    summary = api_client.get(f"/api/v1/experiments/{experiment.id}/status/summary")
    assert summary.status_code == 200
    summary_payload = summary.json()
    assert summary_payload["readiness"]["counts"]["needs_plant_recipe"] == 1
    assert summary_payload["readiness"]["ready_to_start"] is False

    response = api_client.post(f"/api/v1/experiments/{experiment.id}/start")
    assert response.status_code == 409
    payload = response.json()
    assert_blocked_diagnostics(payload, reason_key="needs_plant_recipe")


def test_feed_event_stores_recipe_snapshot_when_plant_recipe_changes(
    api_client,
    experiment,
    make_slot,
    make_plant,
    now_utc,
):
    slot = make_slot(1, 1)
    recipe_initial = Recipe.objects.create(experiment=experiment, code="R0", name="Control")
    recipe_next = Recipe.objects.create(experiment=experiment, code="R1", name="Treatment")
    plant = make_plant("NP-READY-003", grade="A", assigned_recipe=recipe_initial)
    tray = Tray.objects.create(experiment=experiment, name="TR-READY-3", slot=slot, capacity=2)
    tray.plants.add(plant)

    experiment.lifecycle_state = Experiment.LifecycleState.RUNNING
    experiment.started_at = now_utc
    experiment.save(update_fields=["lifecycle_state", "started_at", "updated_at"])

    feed_response = api_client.post(
        f"/api/v1/plants/{plant.id}/feed",
        {"amount_text": "2 mL"},
        format="json",
    )
    assert feed_response.status_code == 201
    feed_payload = feed_response.json()
    assert feed_payload["recipe_id"] == str(recipe_initial.id)

    plant.assigned_recipe = recipe_next
    plant.save(update_fields=["assigned_recipe", "updated_at"])

    recent_response = api_client.get(f"/api/v1/plants/{plant.id}/feeding/recent")
    assert recent_response.status_code == 200
    recent_payload = recent_response.json()
    assert recent_payload["events"]["count"] == 1
    assert recent_payload["events"]["results"][0]["recipe_id"] == str(recipe_initial.id)


def test_lifecycle_start_stop_roundtrip_for_ready_experiment(api_client, experiment, ready_to_start):
    ready_to_start()

    before = api_client.get(f"/api/v1/experiments/{experiment.id}/status/summary")
    assert before.status_code == 200
    assert before.json()["readiness"]["ready_to_start"] is True
    assert before.json()["lifecycle"]["state"] == Experiment.LifecycleState.DRAFT

    started = api_client.post(f"/api/v1/experiments/{experiment.id}/start")
    assert started.status_code == 200
    started_payload = started.json()
    assert started_payload["lifecycle"]["state"] == Experiment.LifecycleState.RUNNING
    assert started_payload["lifecycle"]["started_at"] is not None
    assert started_payload["lifecycle"]["stopped_at"] is None

    stopped = api_client.post(f"/api/v1/experiments/{experiment.id}/stop")
    assert stopped.status_code == 200
    stopped_payload = stopped.json()
    assert stopped_payload["lifecycle"]["state"] == Experiment.LifecycleState.STOPPED
    assert stopped_payload["lifecycle"]["started_at"] is not None
    assert stopped_payload["lifecycle"]["stopped_at"] is not None
