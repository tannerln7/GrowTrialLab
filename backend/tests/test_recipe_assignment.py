from __future__ import annotations

from uuid import uuid4

import pytest

from api.models import Experiment, Plant, Recipe, Tray, TrayPlant

pytestmark = pytest.mark.django_db


def test_plant_patch_supports_assigned_recipe_id_set_and_clear(api_client, experiment, make_plant):
    recipe = Recipe.objects.create(experiment=experiment, code="R0", name="Control")
    plant = make_plant("NP-700", grade="A")

    assign_response = api_client.patch(
        f"/api/v1/plants/{plant.id}/",
        {"assigned_recipe_id": str(recipe.id)},
        format="json",
    )
    assert assign_response.status_code == 200
    plant.refresh_from_db()
    assert plant.assigned_recipe_id == recipe.id

    clear_response = api_client.patch(
        f"/api/v1/plants/{plant.id}/",
        {"assigned_recipe_id": None},
        format="json",
    )
    assert clear_response.status_code == 200
    plant.refresh_from_db()
    assert plant.assigned_recipe is None


def test_experiment_batch_recipe_patch_updates_multiple_plants_with_envelope(
    api_client,
    experiment,
    make_plant,
    assert_envelope,
):
    recipe_a = Recipe.objects.create(experiment=experiment, code="R0", name="Control")
    recipe_b = Recipe.objects.create(experiment=experiment, code="R1", name="Treatment")
    plant_1 = make_plant("NP-710", grade="A", assigned_recipe=recipe_a)
    plant_2 = make_plant("NP-711", grade="A")

    response = api_client.patch(
        f"/api/v1/experiments/{experiment.id}/plants/recipes",
        {
            "updates": [
                {"plant_id": str(plant_1.id), "assigned_recipe_id": str(recipe_a.id)},
                {"plant_id": str(plant_2.id), "assigned_recipe_id": str(recipe_b.id)},
                {"plant_id": str(plant_1.id), "assigned_recipe_id": None},
            ]
        },
        format="json",
    )
    assert response.status_code == 200
    payload = response.json()
    assert_envelope(payload)
    assert payload["count"] == 3
    assert payload["results"][0]["status"] == "noop"
    assert payload["results"][1]["status"] == "updated"
    assert payload["results"][2]["status"] == "updated"
    assert payload["results"][2]["assigned_recipe_id"] is None

    plant_1.refresh_from_db()
    plant_2.refresh_from_db()
    assert plant_1.assigned_recipe is None
    assert plant_2.assigned_recipe_id == recipe_b.id


def test_experiment_batch_recipe_patch_rejects_not_in_experiment_with_diagnostics(
    api_client,
    experiment,
    make_plant,
):
    recipe = Recipe.objects.create(experiment=experiment, code="R2", name="Bloom")
    plant_in_experiment = make_plant("NP-712", grade="A")
    foreign_experiment = Experiment.objects.create(name="Foreign Experiment")
    foreign_plant = Plant.objects.create(
        experiment=foreign_experiment,
        species=plant_in_experiment.species,
        plant_id="NP-FOREIGN",
        grade="A",
        status=Plant.Status.ACTIVE,
    )

    response = api_client.patch(
        f"/api/v1/experiments/{experiment.id}/plants/recipes",
        {
            "updates": [
                {"plant_id": str(plant_in_experiment.id), "assigned_recipe_id": str(recipe.id)},
                {"plant_id": str(foreign_plant.id), "assigned_recipe_id": str(recipe.id)},
            ]
        },
        format="json",
    )
    assert response.status_code == 409
    payload = response.json()
    assert "diagnostics" in payload
    assert payload["diagnostics"]["reason_counts"]["invalid_updates"] == 1
    assert payload["diagnostics"]["invalid_updates"][0]["plant_id"] == str(foreign_plant.id)
    assert payload["diagnostics"]["invalid_updates"][0]["reason"] == "not_in_experiment"


def test_experiment_batch_recipe_patch_rejects_unknown_recipe_with_diagnostics(
    api_client,
    experiment,
    make_plant,
):
    plant = make_plant("NP-713", grade="A")

    response = api_client.patch(
        f"/api/v1/experiments/{experiment.id}/plants/recipes",
        {
            "updates": [
                {"plant_id": str(plant.id), "assigned_recipe_id": str(uuid4())},
            ]
        },
        format="json",
    )
    assert response.status_code == 409
    payload = response.json()
    assert payload["diagnostics"]["reason_counts"]["invalid_updates"] == 1
    assert payload["diagnostics"]["invalid_updates"][0]["plant_id"] == str(plant.id)
    assert payload["diagnostics"]["invalid_updates"][0]["reason"] == "recipe_not_found"


def test_tray_apply_recipe_updates_active_plants_only(api_client, experiment, make_slot, make_plant, assert_envelope):
    slot = make_slot(1, 1)
    recipe = Recipe.objects.create(experiment=experiment, code="R1", name="Treatment")
    tray = Tray.objects.create(experiment=experiment, name="TR-APPLY-1", slot=slot, capacity=8)

    active_to_update = make_plant("NP-701", grade="A")
    active_already_assigned = make_plant("NP-702", grade="A", assigned_recipe=recipe)
    removed_plant = make_plant("NP-703", grade="A")
    removed_plant.status = Plant.Status.REMOVED
    removed_plant.save(update_fields=["status", "updated_at"])

    TrayPlant.objects.create(tray=tray, plant=active_to_update, order_index=1)
    TrayPlant.objects.create(tray=tray, plant=active_already_assigned, order_index=2)
    TrayPlant.objects.create(tray=tray, plant=removed_plant, order_index=3)

    response = api_client.post(
        f"/api/v1/trays/{tray.id}/plants/apply-recipe",
        {"recipe_id": str(recipe.id)},
        format="json",
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["updated_count"] == 1
    assert payload["tray_id"] == str(tray.id)
    assert payload["recipe"]["id"] == str(recipe.id)
    assert_envelope(payload["plants"])
    assert payload["plants"]["count"] == 1
    assert payload["plants"]["results"][0]["uuid"] == str(active_to_update.id)
    assert payload["plants"]["results"][0]["assigned_recipe"]["id"] == str(recipe.id)

    active_to_update.refresh_from_db()
    active_already_assigned.refresh_from_db()
    removed_plant.refresh_from_db()
    assert active_to_update.assigned_recipe_id == recipe.id
    assert active_already_assigned.assigned_recipe_id == recipe.id
    assert removed_plant.assigned_recipe is None


def test_tray_apply_recipe_requires_recipe_id_with_diagnostics(
    api_client,
    experiment,
    make_slot,
):
    slot = make_slot(1, 1)
    tray = Tray.objects.create(experiment=experiment, name="TR-APPLY-2", slot=slot, capacity=8)

    response = api_client.post(
        f"/api/v1/trays/{tray.id}/plants/apply-recipe",
        {},
        format="json",
    )
    assert response.status_code == 400
    payload = response.json()
    assert "diagnostics" in payload
    assert payload["diagnostics"]["reason_counts"]["missing_recipe_id"] == 1


def test_plant_patch_rejects_recipe_from_other_experiment_with_diagnostics(
    api_client,
    make_plant,
):
    second_experiment = Experiment.objects.create(name="Second Experiment")
    foreign_recipe = Recipe.objects.create(experiment=second_experiment, code="R9", name="Foreign")
    plant = make_plant("NP-704", grade="A")

    response = api_client.patch(
        f"/api/v1/plants/{plant.id}/",
        {"assigned_recipe_id": str(foreign_recipe.id)},
        format="json",
    )
    assert response.status_code == 400
    payload = response.json()
    assert "diagnostics" in payload
    assert payload["diagnostics"]["reason_counts"]["recipe_experiment_mismatch"] == 1
