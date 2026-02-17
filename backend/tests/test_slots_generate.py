from __future__ import annotations

import pytest

from api.models import Experiment, Tray

pytestmark = pytest.mark.django_db


def test_slots_generate_supports_safe_reshape(api_client, experiment, tent, make_slot):
    slot = make_slot(1, 1)
    tray = Tray.objects.create(experiment=experiment, name="TR1", slot=slot, capacity=2)

    safe_response = api_client.post(
        f"/api/v1/tents/{tent.id}/slots/generate",
        {
            "layout": {
                "schema_version": 1,
                "shelves": [
                    {"index": 1, "tray_count": 2},
                ],
            }
        },
        format="json",
    )
    assert safe_response.status_code == 200
    tray.refresh_from_db()
    assert tray.slot is not None
    assert tray.slot.shelf_index == 1
    assert tray.slot.slot_index == 1

    unsafe_response = api_client.post(
        f"/api/v1/tents/{tent.id}/slots/generate",
        {
            "layout": {
                "schema_version": 1,
                "shelves": [
                    {"index": 1, "tray_count": 0},
                ],
            }
        },
        format="json",
    )
    assert unsafe_response.status_code == 409
    diagnostics = unsafe_response.json().get("diagnostics", {})
    assert "would_orphan_trays" in diagnostics
    assert len(diagnostics["would_orphan_trays"]) == 1


def test_slots_generate_blocks_while_running_with_diagnostics(
    api_client,
    experiment,
    tent,
    now_utc,
):
    experiment.lifecycle_state = Experiment.LifecycleState.RUNNING
    experiment.started_at = now_utc
    experiment.save(update_fields=["lifecycle_state", "started_at", "updated_at"])

    response = api_client.post(
        f"/api/v1/tents/{tent.id}/slots/generate",
        {"layout": {"schema_version": 1, "shelves": [{"index": 1, "tray_count": 1}]}},
        format="json",
    )
    assert response.status_code == 409
    payload = response.json()
    assert "diagnostics" in payload
    assert payload["diagnostics"]["reason_counts"]["running"] == 1


def test_slot_coordinates_are_immutable(api_client, make_slot):
    slot = make_slot(1, 1)
    response = api_client.patch(
        f"/api/v1/slots/{slot.id}",
        {"shelf_index": 2},
        format="json",
    )
    assert response.status_code == 400
    assert "immutable" in response.json().get("detail", "").lower()
