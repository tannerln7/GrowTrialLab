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
        assigned_recipe=recipe,
        capacity=4,
    )
    plant = make_plant("NP-100", grade="A")
    tray.plants.add(plant)

    overview = api_client.get(f"/api/v1/experiments/{experiment.id}/overview/plants")
    assert overview.status_code == 200
    overview_item = overview.json()["plants"]["results"][0]
    assert "location" in overview_item
    assert overview_item["location"]["status"] == "placed"
    assert "tent_id" not in overview_item

    cockpit = api_client.get(f"/api/v1/plants/{plant.id}/cockpit")
    assert cockpit.status_code == 200
    cockpit_location = cockpit.json()["derived"]["location"]
    assert cockpit_location["status"] == "placed"

    feeding = api_client.get(f"/api/v1/experiments/{experiment.id}/feeding/queue")
    assert feeding.status_code == 200
    feed_item = feeding.json()["plants"]["results"][0]
    assert "location" in feed_item

    placement = api_client.get(f"/api/v1/experiments/{experiment.id}/placement/summary")
    assert placement.status_code == 200
    assert "location" in placement.json()["trays"]["results"][0]

    rotation = api_client.get(f"/api/v1/experiments/{experiment.id}/rotation/summary")
    assert rotation.status_code == 200
    assert "location" in rotation.json()["trays"]["results"][0]
