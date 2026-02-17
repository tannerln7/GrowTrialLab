from __future__ import annotations

import pytest

from api.models import Experiment

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
