from __future__ import annotations

import pytest

from api.models import Recipe, Tray

pytestmark = pytest.mark.django_db


def test_overview_cockpit_feeding_use_nested_location(
    api_client,
    experiment,
    make_slot,
    make_plant,
):
    slot = make_slot(1, 1)
    recipe = Recipe.objects.create(experiment=experiment, code="R0", name="Control")
    tray = Tray.objects.create(
        experiment=experiment,
        name="TR1",
        slot=slot,
        capacity=4,
    )
    plant = make_plant("NP-100", grade="A", assigned_recipe=recipe)
    tray.plants.add(plant)

    overview = api_client.get(f"/api/v1/experiments/{experiment.id}/overview/plants")
    assert overview.status_code == 200
    overview_item = overview.json()["plants"]["results"][0]
    assert "location" in overview_item
    assert overview_item["location"]["status"] == "placed"
    assert overview_item["assigned_recipe"]["code"] == "R0"
    assert "tent_id" not in overview_item

    cockpit = api_client.get(f"/api/v1/plants/{plant.id}/cockpit")
    assert cockpit.status_code == 200
    cockpit_payload = cockpit.json()
    cockpit_location = cockpit_payload["derived"]["location"]
    assert cockpit_location["status"] == "placed"
    assert cockpit_payload["derived"]["assigned_recipe"]["code"] == "R0"

    feeding = api_client.get(f"/api/v1/experiments/{experiment.id}/feeding/queue")
    assert feeding.status_code == 200
    feed_item = feeding.json()["plants"]["results"][0]
    assert "location" in feed_item
    assert feed_item["assigned_recipe"]["code"] == "R0"

    placement = api_client.get(f"/api/v1/experiments/{experiment.id}/placement/summary")
    assert placement.status_code == 200
    placement_tray = placement.json()["trays"]["results"][0]
    assert "location" in placement_tray
    assert "assigned_recipe" not in placement_tray
    assert placement_tray["plants"][0]["assigned_recipe"]["code"] == "R0"

    rotation = api_client.get(f"/api/v1/experiments/{experiment.id}/rotation/summary")
    assert rotation.status_code == 200
    rotation_tray = rotation.json()["trays"]["results"][0]
    assert "location" in rotation_tray
    assert "assigned_recipe" not in rotation_tray
