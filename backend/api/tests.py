from __future__ import annotations

from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from api.baseline import BASELINE_WEEK_NUMBER
from api.models import (
    Experiment,
    Plant,
    PlantWeeklyMetric,
    Recipe,
    ScheduleAction,
    ScheduleRule,
    ScheduleScope,
    Slot,
    Species,
    Tent,
    Tray,
)


@override_settings(
    MIDDLEWARE=[
        "django.middleware.security.SecurityMiddleware",
        "django.contrib.sessions.middleware.SessionMiddleware",
        "django.middleware.common.CommonMiddleware",
        "django.middleware.csrf.CsrfViewMiddleware",
        "django.contrib.auth.middleware.AuthenticationMiddleware",
        "django.contrib.messages.middleware.MessageMiddleware",
        "django.middleware.clickjacking.XFrameOptionsMiddleware",
        "api.test_middleware.TestAppUserMiddleware",
    ]
)
class CanonicalApiContractTests(APITestCase):
    def setUp(self):
        self.species = Species.objects.create(name="Nepenthes ventricosa", category="nepenthes")
        self.other_species = Species.objects.create(name="Drosera capensis", category="drosera")
        self.experiment = Experiment.objects.create(name="Contract Experiment")
        self.tent = Tent.objects.get(experiment=self.experiment, code="TN1")

    def _create_slot(self, shelf: int = 1, position: int = 1) -> Slot:
        return Slot.objects.create(tent=self.tent, shelf_index=shelf, slot_index=position)

    def _create_plant(self, plant_id: str, *, grade: str | None = None, species: Species | None = None) -> Plant:
        return Plant.objects.create(
            experiment=self.experiment,
            species=species or self.species,
            plant_id=plant_id,
            grade=grade,
            status=Plant.Status.ACTIVE,
        )

    def test_list_endpoints_use_envelope_shape(self):
        self._create_plant("NP-001")

        plants = self.client.get(f"/api/v1/experiments/{self.experiment.id}/plants/")
        self.assertEqual(plants.status_code, 200)
        self.assertEqual(set(plants.json().keys()), {"count", "results", "meta"})

        tents = self.client.get(f"/api/v1/experiments/{self.experiment.id}/tents")
        self.assertEqual(tents.status_code, 200)
        self.assertEqual(set(tents.json().keys()), {"count", "results", "meta"})

    def test_baseline_queue_uses_envelope(self):
        self._create_plant("NP-001")
        response = self.client.get(f"/api/v1/experiments/{self.experiment.id}/baseline/queue")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("plants", payload)
        self.assertEqual(set(payload["plants"].keys()), {"count", "results", "meta"})

    def test_slots_generate_supports_safe_reshape(self):
        slot = self._create_slot(1, 1)
        tray = Tray.objects.create(experiment=self.experiment, name="TR1", slot=slot, capacity=2)

        safe_response = self.client.post(
            f"/api/v1/tents/{self.tent.id}/slots/generate",
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
        self.assertEqual(safe_response.status_code, 200)
        tray.refresh_from_db()
        self.assertIsNotNone(tray.slot)
        self.assertEqual(tray.slot.shelf_index, 1)
        self.assertEqual(tray.slot.slot_index, 1)

        unsafe_response = self.client.post(
            f"/api/v1/tents/{self.tent.id}/slots/generate",
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
        self.assertEqual(unsafe_response.status_code, 409)
        diagnostics = unsafe_response.json().get("diagnostics", {})
        self.assertIn("would_orphan_trays", diagnostics)
        self.assertEqual(len(diagnostics["would_orphan_trays"]), 1)

    def test_slots_generate_blocks_while_running_with_diagnostics(self):
        self.experiment.lifecycle_state = Experiment.LifecycleState.RUNNING
        self.experiment.started_at = timezone.now()
        self.experiment.save(update_fields=["lifecycle_state", "started_at", "updated_at"])

        response = self.client.post(
            f"/api/v1/tents/{self.tent.id}/slots/generate",
            {"layout": {"schema_version": 1, "shelves": [{"index": 1, "tray_count": 1}]}} ,
            format="json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertIn("diagnostics", response.json())
        self.assertEqual(response.json()["diagnostics"]["reason_counts"]["running"], 1)

    def test_slot_coordinates_are_immutable(self):
        slot = self._create_slot(1, 1)
        response = self.client.patch(
            f"/api/v1/slots/{slot.id}",
            {"shelf_index": 2},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("immutable", response.json().get("detail", "").lower())

    def test_overview_cockpit_feeding_use_nested_location(self):
        slot = self._create_slot(1, 1)
        recipe = Recipe.objects.create(experiment=self.experiment, code="R0", name="Control")
        tray = Tray.objects.create(experiment=self.experiment, name="TR1", slot=slot, assigned_recipe=recipe, capacity=4)
        plant = self._create_plant("NP-100", grade="A")
        tray.plants.add(plant)

        overview = self.client.get(f"/api/v1/experiments/{self.experiment.id}/overview/plants")
        self.assertEqual(overview.status_code, 200)
        overview_item = overview.json()["plants"]["results"][0]
        self.assertIn("location", overview_item)
        self.assertEqual(overview_item["location"]["status"], "placed")
        self.assertNotIn("tent_id", overview_item)

        cockpit = self.client.get(f"/api/v1/plants/{plant.id}/cockpit")
        self.assertEqual(cockpit.status_code, 200)
        cockpit_location = cockpit.json()["derived"]["location"]
        self.assertEqual(cockpit_location["status"], "placed")

        feeding = self.client.get(f"/api/v1/experiments/{self.experiment.id}/feeding/queue")
        self.assertEqual(feeding.status_code, 200)
        feed_item = feeding.json()["plants"]["results"][0]
        self.assertIn("location", feed_item)

        placement = self.client.get(f"/api/v1/experiments/{self.experiment.id}/placement/summary")
        self.assertEqual(placement.status_code, 200)
        self.assertIn("location", placement.json()["trays"]["results"][0])

        rotation = self.client.get(f"/api/v1/experiments/{self.experiment.id}/rotation/summary")
        self.assertEqual(rotation.status_code, 200)
        self.assertIn("location", rotation.json()["trays"]["results"][0])

    def test_blocked_start_includes_diagnostics(self):
        response = self.client.post(f"/api/v1/experiments/{self.experiment.id}/start")
        self.assertEqual(response.status_code, 409)
        payload = response.json()
        self.assertIn("detail", payload)
        self.assertIn("diagnostics", payload)
        self.assertIn("setup", payload["diagnostics"])

    def test_feed_blocked_when_not_running_includes_diagnostics(self):
        plant = self._create_plant("NP-200", grade="A")
        response = self.client.post(f"/api/v1/plants/{plant.id}/feed", {"amount_text": "1 mL"}, format="json")
        self.assertEqual(response.status_code, 409)
        payload = response.json()
        self.assertIn("diagnostics", payload)
        self.assertEqual(payload["diagnostics"]["reason_counts"]["experiment_not_running"], 1)

    def test_auto_place_blocked_includes_diagnostics(self):
        self._create_plant("NP-300", grade=None)
        response = self.client.post(
            f"/api/v1/experiments/{self.experiment.id}/placement/auto",
            {"clear_existing": True},
            format="json",
        )
        self.assertEqual(response.status_code, 409)
        payload = response.json()
        self.assertIn("diagnostics", payload)
        self.assertIn("reason_counts", payload["diagnostics"])

    def test_grade_roundtrip_in_baseline_and_overview(self):
        plant = self._create_plant("NP-400")

        save_response = self.client.post(
            f"/api/v1/plants/{plant.id}/baseline",
            {"metrics": {"height_cm": 4}, "grade": "A", "notes": "ok"},
            format="json",
        )
        self.assertEqual(save_response.status_code, 200)
        plant.refresh_from_db()
        self.assertEqual(plant.grade, "A")

        get_response = self.client.get(f"/api/v1/plants/{plant.id}/baseline")
        self.assertEqual(get_response.status_code, 200)
        self.assertEqual(get_response.json()["grade"], "A")

        weekly_exists = PlantWeeklyMetric.objects.filter(
            experiment=self.experiment,
            plant=plant,
            week_number=BASELINE_WEEK_NUMBER,
        ).exists()
        self.assertTrue(weekly_exists)

        overview = self.client.get(f"/api/v1/experiments/{self.experiment.id}/overview/plants")
        self.assertEqual(overview.status_code, 200)
        row = overview.json()["plants"]["results"][0]
        self.assertEqual(row["grade"], "A")

    def test_schedule_plan_is_grouped_and_enveloped(self):
        slot = self._create_slot(1, 1)
        tray = Tray.objects.create(experiment=self.experiment, name="TR1", slot=slot, capacity=4)
        plant = self._create_plant("NP-500", grade="A")
        tray.plants.add(plant)

        first = ScheduleAction.objects.create(
            experiment=self.experiment,
            title="Feed tent",
            action_type=ScheduleAction.ActionType.FEED,
            enabled=True,
        )
        second = ScheduleAction.objects.create(
            experiment=self.experiment,
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
                scope_id=self.tent.id,
            )

        response = self.client.get(f"/api/v1/experiments/{self.experiment.id}/schedules/plan?days=7")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(set(payload["slots"].keys()), {"count", "results", "meta"})
        self.assertGreater(payload["slots"]["count"], 0)
        first_slot = payload["slots"]["results"][0]
        self.assertGreaterEqual(len(first_slot["actions"]), 2)
        action_titles = [item["title"] for item in first_slot["actions"]]
        self.assertEqual(action_titles, sorted(action_titles))
