from __future__ import annotations

import pytest

pytestmark = pytest.mark.django_db


def test_list_endpoints_use_envelope_shape(
    api_client,
    experiment,
    make_plant,
    assert_envelope,
    django_assert_max_num_queries,
):
    make_plant("NP-001")

    with django_assert_max_num_queries(20):
        plants = api_client.get(f"/api/v1/experiments/{experiment.id}/plants/")
    assert plants.status_code == 200
    assert_envelope(plants.json())

    tents = api_client.get(f"/api/v1/experiments/{experiment.id}/tents")
    assert tents.status_code == 200
    assert_envelope(tents.json())


def test_baseline_queue_uses_envelope(api_client, experiment, make_plant, assert_envelope):
    make_plant("NP-001")
    response = api_client.get(f"/api/v1/experiments/{experiment.id}/baseline/queue")
    assert response.status_code == 200
    payload = response.json()
    assert "plants" in payload
    assert_envelope(payload["plants"])


def test_status_summary_uses_current_schema_shape(api_client, experiment):
    response = api_client.get(f"/api/v1/experiments/{experiment.id}/status/summary")
    assert response.status_code == 200
    payload = response.json()

    assert set(payload.keys()) == {"setup", "lifecycle", "readiness", "schedule"}
    assert "is_complete" in payload["setup"]
    assert "missing" in payload["setup"]
    assert "state" in payload["lifecycle"]
    assert "ready_to_start" in payload["readiness"]
    assert "counts" in payload["readiness"]
    assert "meta" in payload["readiness"]
    assert "next_scheduled_slot" in payload["schedule"]
    assert "due_counts_today" in payload["schedule"]
    assert "needs_tent_restriction" in payload["readiness"]["counts"]
