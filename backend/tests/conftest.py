from __future__ import annotations

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from api.baseline import BASELINE_WEEK_NUMBER
from api.models import (
    Experiment,
    Plant,
    PlantWeeklyMetric,
    Recipe,
    Slot,
    Species,
    Tent,
    Tray,
)


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def species() -> Species:
    return Species.objects.create(name="Nepenthes ventricosa", category="nepenthes")


@pytest.fixture
def other_species() -> Species:
    return Species.objects.create(name="Drosera capensis", category="drosera")


@pytest.fixture
def experiment() -> Experiment:
    return Experiment.objects.create(name="Contract Experiment")


@pytest.fixture
def tent(experiment: Experiment) -> Tent:
    return Tent.objects.get(experiment=experiment, code="TN1")


@pytest.fixture
def make_slot(tent: Tent):
    def _make_slot(shelf: int = 1, position: int = 1) -> Slot:
        return Slot.objects.create(tent=tent, shelf_index=shelf, slot_index=position)

    return _make_slot


@pytest.fixture
def make_plant(experiment: Experiment, species: Species):
    def _make_plant(
        plant_id: str,
        *,
        grade: str | None = None,
        selected_species: Species | None = None,
    ) -> Plant:
        return Plant.objects.create(
            experiment=experiment,
            species=selected_species or species,
            plant_id=plant_id,
            grade=grade,
            status=Plant.Status.ACTIVE,
        )

    return _make_plant


@pytest.fixture
def mark_baseline(experiment: Experiment):
    def _mark_baseline(plant: Plant):
        PlantWeeklyMetric.objects.update_or_create(
            experiment=experiment,
            plant=plant,
            week_number=BASELINE_WEEK_NUMBER,
            defaults={"metrics": {"height_cm": 4}, "notes": "seeded"},
        )

    return _mark_baseline


@pytest.fixture
def ready_to_start(experiment: Experiment, make_slot, make_plant, mark_baseline):
    def _ready_to_start() -> Plant:
        slot = make_slot(1, 1)
        Recipe.objects.create(experiment=experiment, code="R0", name="Control")
        recipe = Recipe.objects.create(experiment=experiment, code="R1", name="Treatment")
        plant = make_plant("NP-READY-001", grade="A")
        mark_baseline(plant)
        tray = Tray.objects.create(
            experiment=experiment,
            name="TR-READY-1",
            slot=slot,
            assigned_recipe=recipe,
            capacity=4,
        )
        tray.plants.add(plant)
        return plant

    return _ready_to_start


@pytest.fixture
def assert_envelope():
    def _assert_envelope(payload: dict):
        assert set(payload.keys()) == {"count", "results", "meta"}

    return _assert_envelope


@pytest.fixture
def assert_blocked_diagnostics():
    def _assert_blocked_diagnostics(payload: dict, *, reason_key: str | None = None):
        assert "detail" in payload
        assert "diagnostics" in payload
        diagnostics = payload["diagnostics"]
        assert "reason_counts" in diagnostics
        if reason_key:
            assert reason_key in diagnostics["reason_counts"]

    return _assert_blocked_diagnostics


@pytest.fixture
def now_utc():
    return timezone.now()
