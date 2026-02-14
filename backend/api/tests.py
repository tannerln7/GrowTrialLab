from unittest.mock import patch
from datetime import timedelta

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone

from api.baseline import BASELINE_WEEK_NUMBER
from api.models import (
    AppUser,
    Block,
    Experiment,
    ExperimentSetupState,
    FeedingEvent,
    MetricTemplate,
    Photo,
    Plant,
    PlantWeeklyMetric,
    Recipe,
    RotationLog,
    Species,
    Tent,
    Tray,
    TrayPlant,
)
from api.setup_packets import (
    PACKET_BASELINE,
    PACKET_ENVIRONMENT,
    PACKET_GROUPS,
    PACKET_PLANTS,
    PACKET_TRAYS,
)


class AuthFlowTests(TestCase):
    def test_healthz_is_public(self):
        response = self.client.get("/healthz")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    @override_settings(
        DEBUG=True,
        CF_ACCESS_TEAM_DOMAIN="your-team.cloudflareaccess.com",
        CF_ACCESS_AUD="REPLACE_ME",
        ADMIN_EMAIL="admin@example.com",
        DEV_EMAIL="admin@example.com",
        AUTH_MODE="invite_only",
    )
    def test_me_works_in_dev_bypass_mode(self):
        response = self.client.get("/api/me")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["email"], "admin@example.com")
        self.assertEqual(payload["role"], "admin")
        self.assertEqual(payload["status"], "active")

    @override_settings(
        DEBUG=False,
        CF_ACCESS_TEAM_DOMAIN="tannerln7.cloudflareaccess.com",
        CF_ACCESS_AUD="real-aud",
        ADMIN_EMAIL="admin@example.com",
        AUTH_MODE="invite_only",
    )
    @patch(
        "api.cloudflare_access.CloudflareJWTVerifier.verify",
        return_value={"email": "invited@example.com", "aud": ["real-aud"], "exp": 9999999999},
    )
    def test_me_requires_invited_user_with_mocked_jwt(self, _mock_verify):
        AppUser.objects.create(email="invited@example.com", role="user", status="active")
        response = self.client.get("/api/me", HTTP_CF_ACCESS_JWT_ASSERTION="mock.jwt.token")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["email"], "invited@example.com")
        self.assertEqual(payload["role"], "user")

    @override_settings(
        DEBUG=False,
        CF_ACCESS_TEAM_DOMAIN="tannerln7.cloudflareaccess.com",
        CF_ACCESS_AUD="real-aud",
        ADMIN_EMAIL="admin@example.com",
        AUTH_MODE="invite_only",
    )
    @patch(
        "api.cloudflare_access.CloudflareJWTVerifier.verify",
        return_value={"email": "not-invited@example.com", "aud": ["real-aud"], "exp": 9999999999},
    )
    def test_me_rejects_unknown_user_when_invite_only(self, _mock_verify):
        response = self.client.get("/api/me", HTTP_CF_ACCESS_JWT_ASSERTION="mock.jwt.token")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["detail"], "User is not invited.")


@override_settings(
    DEBUG=True,
    CF_ACCESS_TEAM_DOMAIN="your-team.cloudflareaccess.com",
    CF_ACCESS_AUD="REPLACE_ME",
    ADMIN_EMAIL="admin@example.com",
    DEV_EMAIL="admin@example.com",
    AUTH_MODE="invite_only",
)
class ExperimentSetupTests(TestCase):
    def test_setup_state_is_auto_created_with_experiment(self):
        experiment = Experiment.objects.create(name="Setup Test")
        self.assertTrue(ExperimentSetupState.objects.filter(experiment=experiment).exists())
        state = ExperimentSetupState.objects.get(experiment=experiment)
        self.assertEqual(state.current_packet, PACKET_PLANTS)

    def test_default_tent_created_with_experiment(self):
        experiment = Experiment.objects.create(name="Default Tent")
        tents = Tent.objects.filter(experiment=experiment)
        self.assertEqual(tents.count(), 1)
        default_tent = tents.first()
        if default_tent is None:
            self.fail("Expected default tent to exist.")
        self.assertEqual(default_tent.name, "Tent 1")
        self.assertEqual(default_tent.code, "T1")

    def test_legacy_block_create_without_tent_uses_default_tent(self):
        experiment = Experiment.objects.create(name="Legacy Block Tent")
        block = Block.objects.create(experiment=experiment, name="B1", description="slot")
        self.assertEqual(block.tent.experiment.id, experiment.id)
        self.assertEqual(block.tent.code, "T1")

    def test_environment_payload_can_be_saved(self):
        experiment = Experiment.objects.create(name="Env Save")
        response = self.client.put(
            f"/api/v1/experiments/{experiment.id}/packets/environment/",
            data={
                "tent_name": "Tent A",
                "light_schedule": "16/8",
                "run_in_days": 14,
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        state = ExperimentSetupState.objects.get(experiment=experiment)
        payload = state.packet_data.get(PACKET_ENVIRONMENT)
        self.assertEqual(payload["tent_name"], "Tent A")
        self.assertEqual(payload["light_schedule"], "16/8")
        self.assertEqual(payload["run_in_days"], 14)

    def test_completing_packet_1_marks_done_and_advances(self):
        experiment = Experiment.objects.create(name="Complete Packet")
        self.client.put(
            f"/api/v1/experiments/{experiment.id}/packets/environment/",
            data={"tent_name": "Tent B", "light_schedule": "14/10"},
            content_type="application/json",
        )
        Block.objects.create(experiment=experiment, name="B1", description="One")
        Block.objects.create(experiment=experiment, name="B2", description="Two")

        response = self.client.post(
            f"/api/v1/experiments/{experiment.id}/packets/environment/complete/"
        )
        self.assertEqual(response.status_code, 200)
        state = ExperimentSetupState.objects.get(experiment=experiment)
        self.assertIn(PACKET_ENVIRONMENT, state.completed_packets)
        self.assertEqual(state.current_packet, PACKET_PLANTS)

    def test_blocks_get_returns_empty_without_side_effects(self):
        experiment = Experiment.objects.create(name="Blocks Defaults")
        response = self.client.get(f"/api/v1/experiments/{experiment.id}/blocks/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])
        self.assertEqual(Block.objects.filter(experiment=experiment).count(), 0)

    def test_blocks_defaults_endpoint_creates_defaults(self):
        experiment = Experiment.objects.create(name="Blocks Defaults")
        response = self.client.post(f"/api/v1/experiments/{experiment.id}/blocks/defaults")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["created_count"], 4)
        names = [item["name"] for item in payload["blocks"]]
        self.assertEqual(names, ["B1", "B2", "B3", "B4"])
        self.assertEqual(Block.objects.filter(experiment=experiment).count(), 4)

    def test_blocks_defaults_endpoint_is_idempotent(self):
        experiment = Experiment.objects.create(name="Blocks Idempotent")

        first_response = self.client.post(f"/api/v1/experiments/{experiment.id}/blocks/defaults")
        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(first_response.json()["created_count"], 4)

        second_response = self.client.post(f"/api/v1/experiments/{experiment.id}/blocks/defaults")
        self.assertEqual(second_response.status_code, 200)
        second_payload = second_response.json()
        self.assertEqual(second_payload["created_count"], 0)
        names = [item["name"] for item in second_payload["blocks"]]
        self.assertEqual(names, ["B1", "B2", "B3", "B4"])
        self.assertEqual(Block.objects.filter(experiment=experiment).count(), 4)


@override_settings(
    DEBUG=True,
    CF_ACCESS_TEAM_DOMAIN="your-team.cloudflareaccess.com",
    CF_ACCESS_AUD="REPLACE_ME",
    ADMIN_EMAIL="admin@example.com",
    DEV_EMAIL="admin@example.com",
    AUTH_MODE="invite_only",
)
class Packet2PlantsTests(TestCase):
    def test_bulk_import_creates_species_and_plants(self):
        experiment = Experiment.objects.create(name="Bulk Import")
        csv_text = (
            "species_name,category,cultivar,quantity,baseline_notes\n"
            "Nepenthes alata,nepenthes,,2,batch A\n"
            "Drosera capensis,drosera,,1,batch B\n"
        )
        response = self.client.post(
            f"/api/v1/experiments/{experiment.id}/plants/bulk-import/",
            data={"csv_text": csv_text},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["created_count"], 3)
        self.assertEqual(Plant.objects.filter(experiment=experiment).count(), 3)
        self.assertTrue(Species.objects.filter(name__iexact="Nepenthes alata").exists())
        self.assertTrue(Species.objects.filter(name__iexact="Drosera capensis").exists())

    def test_generate_ids_assigns_unique_ids(self):
        experiment = Experiment.objects.create(name="Generate IDs")
        species = Species.objects.create(name="Nepenthes ventricosa", category="nepenthes")
        Plant.objects.create(experiment=experiment, species=species, plant_id="NP-001")
        missing_one = Plant.objects.create(experiment=experiment, species=species, plant_id="")
        missing_two = Plant.objects.create(experiment=experiment, species=species, plant_id="")

        response = self.client.post(f"/api/v1/experiments/{experiment.id}/plants/generate-ids/")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["updated_count"], 2)

        missing_one.refresh_from_db()
        missing_two.refresh_from_db()
        self.assertTrue(missing_one.plant_id.startswith("NP-"))
        self.assertTrue(missing_two.plant_id.startswith("NP-"))
        self.assertNotEqual(missing_one.plant_id, missing_two.plant_id)
        self.assertNotEqual(missing_one.plant_id, "NP-001")
        self.assertNotEqual(missing_two.plant_id, "NP-001")

    def test_labels_pdf_endpoint_returns_pdf(self):
        experiment = Experiment.objects.create(name="Labels PDF")
        species = Species.objects.create(name="Sarracenia purpurea", category="sarracenia")
        Plant.objects.create(experiment=experiment, species=species, plant_id="SA-001")
        Plant.objects.create(experiment=experiment, species=species, plant_id="SA-002")

        response = self.client.get(f"/api/v1/experiments/{experiment.id}/plants/labels.pdf?mode=all")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertTrue(response.content.startswith(b"%PDF"))
        self.assertGreater(len(response.content), 1200)

    @override_settings(PUBLIC_BASE_URL="https://growtriallab.example.com")
    def test_labels_pdf_encodes_public_base_url(self):
        experiment = Experiment.objects.create(name="Labels URL")
        species = Species.objects.create(name="Nepenthes alata", category="nepenthes")
        plant = Plant.objects.create(experiment=experiment, species=species, plant_id="NP-001")

        response = self.client.get(f"/api/v1/experiments/{experiment.id}/plants/labels.pdf?mode=all")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"https://growtriallab.example.com/p/", response.content)
        self.assertIn(str(plant.id).encode("utf-8"), response.content)

    def test_labels_pdf_prints_plant_id_text(self):
        experiment = Experiment.objects.create(name="Labels Text")
        species = Species.objects.create(name="Drosera capensis", category="drosera")
        Plant.objects.create(experiment=experiment, species=species, plant_id="NP-001")

        response = self.client.get(f"/api/v1/experiments/{experiment.id}/plants/labels.pdf?mode=all")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"NP-001", response.content)

    def test_packet_2_complete_requires_plants(self):
        experiment = Experiment.objects.create(name="Packet 2")
        fail_response = self.client.post(
            f"/api/v1/experiments/{experiment.id}/packets/plants/complete/"
        )
        self.assertEqual(fail_response.status_code, 400)
        self.assertIn("At least 1 plant is required", fail_response.json()["errors"][0])

        species = Species.objects.create(name="Pinguicula moranensis", category="pinguicula")
        Plant.objects.create(experiment=experiment, species=species, plant_id="PG-001")
        success_response = self.client.post(
            f"/api/v1/experiments/{experiment.id}/packets/plants/complete/"
        )
        self.assertEqual(success_response.status_code, 200)
        payload = success_response.json()
        self.assertIn(PACKET_PLANTS, payload["completed_packets"])

    def test_plant_detail_route_returns_nested_payload(self):
        experiment = Experiment.objects.create(name="Plant Detail")
        species = Species.objects.create(name="Pinguicula gigantea", category="pinguicula")
        plant = Plant.objects.create(
            experiment=experiment,
            species=species,
            plant_id="PG-010",
            cultivar="Giant Form",
            baseline_notes="Healthy baseline",
        )

        response = self.client.get(f"/api/v1/plants/{plant.id}/")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["uuid"], str(plant.id))
        self.assertEqual(payload["plant_id"], "PG-010")
        self.assertEqual(payload["species"]["name"], "Pinguicula gigantea")
        self.assertEqual(payload["species"]["category"], "pinguicula")
        self.assertEqual(payload["experiment"]["id"], str(experiment.id))
        self.assertEqual(payload["experiment"]["name"], "Plant Detail")


@override_settings(
    DEBUG=True,
    CF_ACCESS_TEAM_DOMAIN="your-team.cloudflareaccess.com",
    CF_ACCESS_AUD="REPLACE_ME",
    ADMIN_EMAIL="admin@example.com",
    DEV_EMAIL="admin@example.com",
    AUTH_MODE="invite_only",
)
class ExperimentOverviewTests(TestCase):
    def test_overview_endpoint_returns_expected_counts(self):
        experiment = Experiment.objects.create(name="Overview Counts")
        other_experiment = Experiment.objects.create(name="Other")
        species = Species.objects.create(name="Nepenthes rafflesiana", category="nepenthes")
        recipe = Recipe.objects.create(experiment=experiment, code="R0", name="Control")

        plant_ready = Plant.objects.create(
            experiment=experiment,
            species=species,
            plant_id="NP-100",
            status=Plant.Status.ACTIVE,
            bin="A",
            assigned_recipe=recipe,
        )
        plant_needs_all = Plant.objects.create(
            experiment=experiment,
            species=species,
            plant_id="NP-101",
            status=Plant.Status.ACTIVE,
            bin=None,
        )
        Plant.objects.create(
            experiment=experiment,
            species=species,
            plant_id="NP-102",
            status=Plant.Status.INACTIVE,
            bin=None,
        )
        Plant.objects.create(
            experiment=experiment,
            species=species,
            plant_id="NP-103",
            status=Plant.Status.DEAD,
            bin="B",
        )
        Plant.objects.create(
            experiment=other_experiment,
            species=species,
            plant_id="NP-999",
            status=Plant.Status.ACTIVE,
            bin="A",
        )

        PlantWeeklyMetric.objects.create(
            experiment=experiment,
            plant=plant_ready,
            week_number=BASELINE_WEEK_NUMBER,
            metrics={"health_score": 4},
        )

        response = self.client.get(f"/api/v1/experiments/{experiment.id}/overview/plants")
        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual(payload["counts"]["total"], 4)
        self.assertEqual(payload["counts"]["active"], 2)
        self.assertEqual(payload["counts"]["removed"], 2)
        self.assertEqual(payload["counts"]["needs_baseline"], 1)
        self.assertEqual(payload["counts"]["needs_bin"], 1)
        self.assertEqual(payload["counts"]["needs_assignment"], 2)

        uuids = {item["uuid"] for item in payload["plants"]}
        self.assertIn(str(plant_ready.id), uuids)
        self.assertIn(str(plant_needs_all.id), uuids)
        ready_payload = next(item for item in payload["plants"] if item["uuid"] == str(plant_ready.id))
        self.assertEqual(ready_payload["assigned_recipe_id"], str(recipe.id))
        self.assertEqual(ready_payload["assigned_recipe_code"], "R0")
        self.assertEqual(ready_payload["assigned_recipe_name"], "Control")
        self.assertNotIn(
            str(
                Plant.objects.get(
                    experiment=other_experiment,
                    plant_id="NP-999",
                ).id
            ),
            uuids,
        )

    def test_overview_endpoint_computes_has_baseline_per_plant(self):
        experiment = Experiment.objects.create(name="Overview Baseline")
        species = Species.objects.create(name="Drosera adelae", category="drosera")
        with_baseline = Plant.objects.create(
            experiment=experiment,
            species=species,
            plant_id="DR-201",
            status=Plant.Status.ACTIVE,
            bin="A",
        )
        without_baseline = Plant.objects.create(
            experiment=experiment,
            species=species,
            plant_id="DR-202",
            status=Plant.Status.ACTIVE,
            bin="B",
        )

        PlantWeeklyMetric.objects.create(
            experiment=experiment,
            plant=with_baseline,
            week_number=BASELINE_WEEK_NUMBER,
            metrics={"health_score": 5},
        )

        response = self.client.get(f"/api/v1/experiments/{experiment.id}/overview/plants")
        self.assertEqual(response.status_code, 200)
        plants_by_uuid = {item["uuid"]: item for item in response.json()["plants"]}
        self.assertTrue(plants_by_uuid[str(with_baseline.id)]["has_baseline"])
        self.assertFalse(plants_by_uuid[str(without_baseline.id)]["has_baseline"])


@override_settings(
    DEBUG=True,
    CF_ACCESS_TEAM_DOMAIN="your-team.cloudflareaccess.com",
    CF_ACCESS_AUD="REPLACE_ME",
    ADMIN_EMAIL="admin@example.com",
    DEV_EMAIL="admin@example.com",
    AUTH_MODE="invite_only",
)
class ExperimentStatusSummaryTests(TestCase):
    def test_status_summary_marks_setup_incomplete_without_plants_blocks_recipes(self):
        experiment = Experiment.objects.create(name="Setup Missing")

        response = self.client.get(f"/api/v1/experiments/{experiment.id}/status/summary")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["setup"]["is_complete"])
        self.assertTrue(payload["setup"]["missing"]["plants"])
        self.assertFalse(payload["setup"]["missing"]["tents"])
        self.assertTrue(payload["setup"]["missing"]["blocks"])
        self.assertTrue(payload["setup"]["missing"]["recipes"])
        self.assertFalse(payload["readiness"]["is_ready"])
        self.assertFalse(payload["readiness"]["ready_to_start"])
        self.assertEqual(payload["lifecycle"]["state"], Experiment.LifecycleState.DRAFT)
        self.assertIsNone(payload["lifecycle"]["started_at"])
        self.assertIsNone(payload["lifecycle"]["stopped_at"])

    def test_status_summary_marks_setup_complete_with_plants_blocks_and_valid_recipes(self):
        experiment = Experiment.objects.create(name="Setup Complete")
        species = Species.objects.create(name="Nepenthes ampullaria x", category="nepenthes")
        Plant.objects.create(experiment=experiment, species=species, plant_id="NP-123")
        Block.objects.create(experiment=experiment, name="B1", description="Front-left")
        Recipe.objects.create(experiment=experiment, code="R0", name="Control")
        Recipe.objects.create(experiment=experiment, code="R1", name="Treatment 1")

        response = self.client.get(f"/api/v1/experiments/{experiment.id}/status/summary")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["setup"]["is_complete"])
        self.assertFalse(payload["setup"]["missing"]["plants"])
        self.assertFalse(payload["setup"]["missing"]["blocks"])
        self.assertFalse(payload["setup"]["missing"]["recipes"])

    def test_status_summary_computes_readiness_counts(self):
        experiment = Experiment.objects.create(name="Readiness Counts")
        species = Species.objects.create(name="Nepenthes mirabilis", category="nepenthes")
        block = Block.objects.create(experiment=experiment, name="B1", description="slot")
        Recipe.objects.create(experiment=experiment, code="R0", name="Control")
        assigned_recipe = Recipe.objects.create(experiment=experiment, code="R1", name="Treatment 1")
        self.assertIsNotNone(block.id)

        ready_plant = Plant.objects.create(
            experiment=experiment,
            species=species,
            plant_id="NP-001",
            bin="A",
            assigned_recipe=assigned_recipe,
        )
        no_baseline_no_assignment = Plant.objects.create(
            experiment=experiment,
            species=species,
            plant_id="NP-002",
            bin=None,
            assigned_recipe=None,
        )
        baseline_without_bin = Plant.objects.create(
            experiment=experiment,
            species=species,
            plant_id="NP-003",
            bin=None,
            assigned_recipe=None,
        )
        Plant.objects.create(
            experiment=experiment,
            species=species,
            plant_id="NP-004",
            status=Plant.Status.DEAD,
            bin=None,
            assigned_recipe=None,
        )

        PlantWeeklyMetric.objects.create(
            experiment=experiment,
            plant=ready_plant,
            week_number=BASELINE_WEEK_NUMBER,
            metrics={"health_score": 4},
        )
        PlantWeeklyMetric.objects.create(
            experiment=experiment,
            plant=baseline_without_bin,
            week_number=BASELINE_WEEK_NUMBER,
            metrics={"health_score": 3},
        )
        tray = Tray.objects.create(
            experiment=experiment,
            name="T1",
            block=block,
            recipe=assigned_recipe,
        )
        TrayPlant.objects.create(tray=tray, plant=ready_plant, order_index=0)

        response = self.client.get(f"/api/v1/experiments/{experiment.id}/status/summary")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["setup"]["is_complete"])
        self.assertFalse(payload["readiness"]["is_ready"])
        self.assertFalse(payload["readiness"]["ready_to_start"])
        self.assertEqual(payload["readiness"]["counts"]["active_plants"], 3)
        self.assertEqual(payload["readiness"]["counts"]["needs_baseline"], 2)
        self.assertEqual(payload["readiness"]["counts"]["needs_assignment"], 2)
        self.assertEqual(payload["readiness"]["counts"]["needs_placement"], 2)
        self.assertEqual(payload["readiness"]["counts"]["needs_tray_recipe"], 0)

    def test_status_summary_needs_assignment_maps_to_placement_and_tray_recipe(self):
        experiment = Experiment.objects.create(name="Readiness Placement Mapping")
        species = Species.objects.create(name="Nepenthes veitchii", category="nepenthes")
        block = Block.objects.create(experiment=experiment, name="B1", description="slot")
        recipe0 = Recipe.objects.create(experiment=experiment, code="R0", name="Control")
        recipe1 = Recipe.objects.create(experiment=experiment, code="R1", name="Treatment 1")

        placed_with_recipe = Plant.objects.create(
            experiment=experiment,
            species=species,
            plant_id="NP-101",
            bin="A",
            assigned_recipe=recipe0,
        )
        placed_without_recipe = Plant.objects.create(
            experiment=experiment,
            species=species,
            plant_id="NP-102",
            bin="B",
            assigned_recipe=recipe1,
        )
        unplaced = Plant.objects.create(
            experiment=experiment,
            species=species,
            plant_id="NP-103",
            bin="C",
            assigned_recipe=recipe1,
        )
        tray_with_recipe = Tray.objects.create(
            experiment=experiment,
            name="T1",
            block=block,
            recipe=recipe0,
        )
        tray_without_recipe = Tray.objects.create(
            experiment=experiment,
            name="T2",
            block=block,
            recipe=None,
        )
        TrayPlant.objects.create(tray=tray_with_recipe, plant=placed_with_recipe, order_index=0)
        TrayPlant.objects.create(tray=tray_without_recipe, plant=placed_without_recipe, order_index=0)
        self.assertIsNotNone(unplaced.id)

        response = self.client.get(f"/api/v1/experiments/{experiment.id}/status/summary")
        self.assertEqual(response.status_code, 200)
        counts = response.json()["readiness"]["counts"]
        self.assertEqual(counts["needs_placement"], 1)
        self.assertEqual(counts["needs_tray_recipe"], 1)
        self.assertEqual(counts["needs_assignment"], 2)

    def test_status_summary_reports_tent_restriction_violation(self):
        experiment = Experiment.objects.create(name="Restriction Readiness")
        allowed = Species.objects.create(name="Allowed Species", category="nepenthes")
        disallowed = Species.objects.create(name="Disallowed Species", category="drosera")
        tent = Tent.objects.get(experiment=experiment, code="T1")
        tent.allowed_species.set([allowed])
        block = Block.objects.create(experiment=experiment, tent=tent, name="B1", description="slot")
        recipe = Recipe.objects.create(experiment=experiment, code="R0", name="Control")
        Recipe.objects.create(experiment=experiment, code="R1", name="Treatment")
        plant = Plant.objects.create(
            experiment=experiment,
            species=disallowed,
            plant_id="PL-001",
            status=Plant.Status.ACTIVE,
            bin="A",
        )
        PlantWeeklyMetric.objects.create(
            experiment=experiment,
            plant=plant,
            week_number=BASELINE_WEEK_NUMBER,
            metrics={"health_score": 4},
        )
        tray = Tray.objects.create(experiment=experiment, name="T1", block=block, recipe=recipe)
        TrayPlant.objects.create(tray=tray, plant=plant, order_index=0)

        response = self.client.get(f"/api/v1/experiments/{experiment.id}/status/summary")
        self.assertEqual(response.status_code, 200)
        counts = response.json()["readiness"]["counts"]
        self.assertEqual(counts["needs_placement"], 0)
        self.assertEqual(counts["needs_tray_recipe"], 0)
        self.assertEqual(counts["needs_tent_restriction"], 1)
        self.assertFalse(response.json()["readiness"]["ready_to_start"])


@override_settings(
    DEBUG=True,
    CF_ACCESS_TEAM_DOMAIN="your-team.cloudflareaccess.com",
    CF_ACCESS_AUD="REPLACE_ME",
    ADMIN_EMAIL="admin@example.com",
    DEV_EMAIL="admin@example.com",
    AUTH_MODE="invite_only",
)
class ExperimentLifecycleTests(TestCase):
    def test_experiment_defaults_to_draft_lifecycle(self):
        experiment = Experiment.objects.create(name="Lifecycle Draft")
        self.assertEqual(experiment.lifecycle_state, Experiment.LifecycleState.DRAFT)
        self.assertIsNone(experiment.started_at)
        self.assertIsNone(experiment.stopped_at)

    def test_start_fails_when_not_ready(self):
        experiment = Experiment.objects.create(name="Lifecycle Start Fail")
        species = Species.objects.create(name="Nepenthes ampullaria green", category="nepenthes")
        Block.objects.create(experiment=experiment, name="B1", description="slot")
        Recipe.objects.create(experiment=experiment, code="R0", name="Control")
        Recipe.objects.create(experiment=experiment, code="R1", name="Treatment")
        Plant.objects.create(experiment=experiment, species=species, plant_id="NP-001", bin=None)

        response = self.client.post(f"/api/v1/experiments/{experiment.id}/start")
        self.assertEqual(response.status_code, 409)
        payload = response.json()
        self.assertEqual(payload["detail"], "Experiment is not ready to start.")
        self.assertFalse(payload["ready_to_start"])
        self.assertEqual(payload["counts"]["needs_baseline"], 1)
        self.assertEqual(payload["counts"]["needs_assignment"], 1)

        experiment.refresh_from_db()
        self.assertEqual(experiment.lifecycle_state, Experiment.LifecycleState.DRAFT)
        self.assertIsNone(experiment.started_at)

    def test_start_fails_when_tray_recipe_missing(self):
        experiment = Experiment.objects.create(name="Lifecycle Missing Tray Recipe")
        species = Species.objects.create(name="Drosera tray recipe", category="drosera")
        Recipe.objects.create(experiment=experiment, code="R0", name="Control")
        Recipe.objects.create(experiment=experiment, code="R1", name="Treatment")
        block = Block.objects.create(experiment=experiment, name="B1", description="slot")
        plant = Plant.objects.create(
            experiment=experiment,
            species=species,
            plant_id="DR-010",
            bin="A",
            status=Plant.Status.ACTIVE,
        )
        PlantWeeklyMetric.objects.create(
            experiment=experiment,
            plant=plant,
            week_number=BASELINE_WEEK_NUMBER,
            metrics={"health_score": 5},
        )
        tray = Tray.objects.create(experiment=experiment, name="T1", block=block, recipe=None)
        TrayPlant.objects.create(tray=tray, plant=plant, order_index=0)

        response = self.client.post(f"/api/v1/experiments/{experiment.id}/start")
        self.assertEqual(response.status_code, 409)
        payload = response.json()
        self.assertEqual(payload["counts"]["needs_placement"], 0)
        self.assertEqual(payload["counts"]["needs_tray_recipe"], 1)
        self.assertFalse(payload["ready_to_start"])

    def test_start_succeeds_when_ready(self):
        experiment = Experiment.objects.create(name="Lifecycle Start Success")
        species = Species.objects.create(name="Drosera adelae green", category="drosera")
        recipe0 = Recipe.objects.create(experiment=experiment, code="R0", name="Control")
        Recipe.objects.create(experiment=experiment, code="R1", name="Treatment")
        block = Block.objects.create(experiment=experiment, name="B1", description="slot")
        plant = Plant.objects.create(
            experiment=experiment,
            species=species,
            plant_id="DR-001",
            bin="A",
            assigned_recipe=recipe0,
            status=Plant.Status.ACTIVE,
        )
        PlantWeeklyMetric.objects.create(
            experiment=experiment,
            plant=plant,
            week_number=BASELINE_WEEK_NUMBER,
            metrics={"health_score": 4},
        )
        tray = Tray.objects.create(experiment=experiment, name="T1", block=block, recipe=recipe0)
        TrayPlant.objects.create(tray=tray, plant=plant, order_index=0)

        response = self.client.post(f"/api/v1/experiments/{experiment.id}/start")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["readiness"]["ready_to_start"])
        self.assertEqual(payload["lifecycle"]["state"], Experiment.LifecycleState.RUNNING)
        self.assertIsNotNone(payload["lifecycle"]["started_at"])
        self.assertIsNone(payload["lifecycle"]["stopped_at"])

        experiment.refresh_from_db()
        self.assertEqual(experiment.lifecycle_state, Experiment.LifecycleState.RUNNING)
        self.assertIsNotNone(experiment.started_at)
        self.assertIsNone(experiment.stopped_at)

    def test_stop_sets_stopped_state(self):
        experiment = Experiment.objects.create(
            name="Lifecycle Stop",
            lifecycle_state=Experiment.LifecycleState.RUNNING,
        )
        species = Species.objects.create(name="Pinguicula esseriana x", category="pinguicula")
        Plant.objects.create(experiment=experiment, species=species, plant_id="PG-001")

        response = self.client.post(f"/api/v1/experiments/{experiment.id}/stop")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["lifecycle"]["state"], Experiment.LifecycleState.STOPPED)
        self.assertIsNotNone(payload["lifecycle"]["stopped_at"])

        experiment.refresh_from_db()
        self.assertEqual(experiment.lifecycle_state, Experiment.LifecycleState.STOPPED)
        self.assertIsNotNone(experiment.stopped_at)


@override_settings(
    DEBUG=True,
    CF_ACCESS_TEAM_DOMAIN="your-team.cloudflareaccess.com",
    CF_ACCESS_AUD="REPLACE_ME",
    ADMIN_EMAIL="admin@example.com",
    DEV_EMAIL="admin@example.com",
    AUTH_MODE="invite_only",
)
class PlacementApiTests(TestCase):
    def test_placement_summary_returns_unplaced_count(self):
        experiment = Experiment.objects.create(name="Placement Summary")
        species = Species.objects.create(name="Sarracenia flava", category="sarracenia")
        recipe = Recipe.objects.create(experiment=experiment, code="R0", name="Control")
        tray = Tray.objects.create(experiment=experiment, name="T1", recipe=recipe)
        placed = Plant.objects.create(
            experiment=experiment,
            species=species,
            plant_id="SA-001",
            status=Plant.Status.ACTIVE,
            assigned_recipe=recipe,
        )
        Plant.objects.create(
            experiment=experiment,
            species=species,
            plant_id="SA-002",
            status=Plant.Status.ACTIVE,
            assigned_recipe=recipe,
        )
        TrayPlant.objects.create(tray=tray, plant=placed, order_index=0)

        response = self.client.get(f"/api/v1/experiments/{experiment.id}/placement/summary")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["unplaced_plants_count"], 1)
        self.assertEqual(len(payload["trays"]), 1)
        self.assertEqual(payload["trays"][0]["placed_count"], 1)
        self.assertEqual(payload["trays"][0]["recipe_code"], "R0")

    def test_add_plant_to_tray_reduces_unplaced(self):
        experiment = Experiment.objects.create(name="Placement Add")
        species = Species.objects.create(name="Nepenthes jacquelineae", category="nepenthes")
        plant = Plant.objects.create(
            experiment=experiment,
            species=species,
            plant_id="NP-010",
            status=Plant.Status.ACTIVE,
        )
        tray_response = self.client.post(
            f"/api/v1/experiments/{experiment.id}/trays",
            data={"name": "T1"},
            content_type="application/json",
        )
        self.assertEqual(tray_response.status_code, 201)
        tray_id = tray_response.json()["id"]

        add_response = self.client.post(
            f"/api/v1/trays/{tray_id}/plants",
            data={"plant_id": str(plant.id)},
            content_type="application/json",
        )
        self.assertEqual(add_response.status_code, 201)

        summary_response = self.client.get(f"/api/v1/experiments/{experiment.id}/placement/summary")
        self.assertEqual(summary_response.status_code, 200)
        self.assertEqual(summary_response.json()["unplaced_plants_count"], 0)

    def test_add_plant_to_tray_rejects_species_not_allowed_in_tent(self):
        experiment = Experiment.objects.create(name="Placement Restriction")
        allowed = Species.objects.create(name="Allowed Placement", category="nepenthes")
        disallowed = Species.objects.create(name="Blocked Placement", category="drosera")
        tent = Tent.objects.get(experiment=experiment, code="T1")
        tent.allowed_species.set([allowed])
        block = Block.objects.create(experiment=experiment, tent=tent, name="B1", description="slot")
        tray = Tray.objects.create(experiment=experiment, name="T1", block=block)
        plant = Plant.objects.create(
            experiment=experiment,
            species=disallowed,
            plant_id="DR-777",
            status=Plant.Status.ACTIVE,
        )

        response = self.client.post(
            f"/api/v1/trays/{tray.id}/plants",
            data={"plant_id": str(plant.id)},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertIn("is not allowed in tent", response.json()["detail"])

    def test_add_plant_to_unplaced_tray_ignores_tent_restrictions(self):
        experiment = Experiment.objects.create(name="Placement Unplaced Tray")
        allowed = Species.objects.create(name="Allowed Unplaced", category="nepenthes")
        disallowed = Species.objects.create(name="Disallowed Unplaced", category="drosera")
        tent = Tent.objects.get(experiment=experiment, code="T1")
        tent.allowed_species.set([allowed])
        Block.objects.create(experiment=experiment, tent=tent, name="B1", description="slot")
        tray = Tray.objects.create(experiment=experiment, name="T1", block=None)
        plant = Plant.objects.create(
            experiment=experiment,
            species=disallowed,
            plant_id="DR-778",
            status=Plant.Status.ACTIVE,
        )

        response = self.client.post(
            f"/api/v1/trays/{tray.id}/plants",
            data={"plant_id": str(plant.id)},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)

    def test_cannot_place_same_plant_in_two_trays(self):
        experiment = Experiment.objects.create(name="Placement Duplicate")
        species = Species.objects.create(name="Drosera regia", category="drosera")
        plant = Plant.objects.create(
            experiment=experiment,
            species=species,
            plant_id="DR-301",
            status=Plant.Status.ACTIVE,
        )
        tray_one = Tray.objects.create(experiment=experiment, name="T1")
        tray_two = Tray.objects.create(experiment=experiment, name="T2")

        first_response = self.client.post(
            f"/api/v1/trays/{tray_one.id}/plants",
            data={"plant_id": str(plant.id)},
            content_type="application/json",
        )
        self.assertEqual(first_response.status_code, 201)

        second_response = self.client.post(
            f"/api/v1/trays/{tray_two.id}/plants",
            data={"plant_id": str(plant.id)},
            content_type="application/json",
        )
        self.assertEqual(second_response.status_code, 400)
        self.assertEqual(
            second_response.json()["detail"],
            "Plant is already placed in another tray.",
        )

    def test_removed_plant_cannot_be_placed(self):
        experiment = Experiment.objects.create(name="Placement Removed")
        species = Species.objects.create(name="Flytrap Typical Clone", category="flytrap")
        removed_plant = Plant.objects.create(
            experiment=experiment,
            species=species,
            plant_id="VF-400",
            status=Plant.Status.REMOVED,
        )
        tray = Tray.objects.create(experiment=experiment, name="T1")

        response = self.client.post(
            f"/api/v1/trays/{tray.id}/plants",
            data={"plant_id": str(removed_plant.id)},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["detail"],
            "Removed plants cannot be placed in trays.",
        )

    def test_setting_tray_recipe_blocked_while_running(self):
        experiment = Experiment.objects.create(
            name="Placement Running Lock",
            lifecycle_state=Experiment.LifecycleState.RUNNING,
        )
        recipe = Recipe.objects.create(experiment=experiment, code="R0", name="Control")
        tray = Tray.objects.create(experiment=experiment, name="T1")

        response = self.client.patch(
            f"/api/v1/trays/{tray.id}/",
            data={"recipe": str(recipe.id)},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.json()["detail"],
            "Placement cannot be edited while the experiment is running. Stop the experiment to change placement.",
        )

    def test_auto_place_rejected_when_running(self):
        experiment = Experiment.objects.create(
            name="Placement Auto Running",
            lifecycle_state=Experiment.LifecycleState.RUNNING,
        )

        response = self.client.post(
            f"/api/v1/experiments/{experiment.id}/placement/auto",
            data={"mode": "bin_balance_v1"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)

    def test_auto_place_requires_baseline_and_bin(self):
        experiment = Experiment.objects.create(name="Placement Auto Baseline")
        species = Species.objects.create(name="Nepenthes auto", category="nepenthes")
        block = Block.objects.create(experiment=experiment, name="B1", description="slot")
        recipe = Recipe.objects.create(experiment=experiment, code="R0", name="Control")
        Tray.objects.create(experiment=experiment, name="T1", block=block, recipe=recipe)
        Plant.objects.create(experiment=experiment, species=species, plant_id="NP-401", bin="A")

        response = self.client.post(
            f"/api/v1/experiments/{experiment.id}/placement/auto",
            data={"mode": "bin_balance_v1"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertIn("requires baseline week 0", response.json()["detail"])

    def test_auto_place_balances_bins_and_ignores_removed_plants(self):
        experiment = Experiment.objects.create(name="Placement Auto Balance")
        species = Species.objects.create(name="Drosera auto", category="drosera")
        block = Block.objects.create(experiment=experiment, name="B1", description="slot")
        recipe = Recipe.objects.create(experiment=experiment, code="R0", name="Control")
        tray_a = Tray.objects.create(experiment=experiment, name="T1", block=block, recipe=recipe)
        tray_b = Tray.objects.create(experiment=experiment, name="T2", block=block, recipe=recipe)

        plants: list[Plant] = []
        for idx in range(6):
            plant = Plant.objects.create(
                experiment=experiment,
                species=species,
                plant_id=f"DR-{idx+1:03d}",
                bin="A" if idx < 4 else "B",
                status=Plant.Status.ACTIVE,
            )
            plants.append(plant)
            PlantWeeklyMetric.objects.create(
                experiment=experiment,
                plant=plant,
                week_number=BASELINE_WEEK_NUMBER,
                metrics={"health_score": 4},
            )
        removed = Plant.objects.create(
            experiment=experiment,
            species=species,
            plant_id="DR-999",
            bin="A",
            status=Plant.Status.REMOVED,
        )

        response = self.client.post(
            f"/api/v1/experiments/{experiment.id}/placement/auto",
            data={"mode": "bin_balance_v1", "clear_existing": True},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["placed_count"], len(plants))
        self.assertEqual(TrayPlant.objects.filter(plant__status=Plant.Status.ACTIVE).count(), len(plants))
        self.assertFalse(TrayPlant.objects.filter(plant=removed).exists())

        placed_on_a = TrayPlant.objects.filter(tray=tray_a, plant__status=Plant.Status.ACTIVE).count()
        placed_on_b = TrayPlant.objects.filter(tray=tray_b, plant__status=Plant.Status.ACTIVE).count()
        self.assertLessEqual(abs(placed_on_a - placed_on_b), 1)


@override_settings(
    DEBUG=True,
    CF_ACCESS_TEAM_DOMAIN="your-team.cloudflareaccess.com",
    CF_ACCESS_AUD="REPLACE_ME",
    ADMIN_EMAIL="admin@example.com",
    DEV_EMAIL="admin@example.com",
    AUTH_MODE="invite_only",
)
class RotationApiTests(TestCase):
    def test_rotation_summary_returns_trays_and_recent_logs(self):
        experiment = Experiment.objects.create(
            name="Rotation Summary",
            lifecycle_state=Experiment.LifecycleState.RUNNING,
        )
        block_a = Block.objects.create(experiment=experiment, name="B1", description="Front")
        block_b = Block.objects.create(experiment=experiment, name="B2", description="Back")
        tray = Tray.objects.create(experiment=experiment, name="T1", block=block_a)
        species = Species.objects.create(name="Nepenthes veitchii stripe", category="nepenthes")
        plant = Plant.objects.create(experiment=experiment, species=species, plant_id="NP-801")
        TrayPlant.objects.create(tray=tray, plant=plant, order_index=0)
        RotationLog.objects.create(
            experiment=experiment,
            tray=tray,
            from_block=block_a,
            to_block=block_b,
            note="Rotate clockwise",
            created_by_email="admin@example.com",
        )

        response = self.client.get(f"/api/v1/experiments/{experiment.id}/rotation/summary")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload["trays"]), 1)
        self.assertEqual(payload["trays"][0]["tray_name"], "T1")
        self.assertEqual(payload["trays"][0]["plant_count"], 1)
        self.assertEqual(len(payload["recent_logs"]), 1)
        self.assertEqual(payload["recent_logs"][0]["tray_name"], "T1")
        self.assertEqual(payload["recent_logs"][0]["from_block_name"], "B1")
        self.assertEqual(payload["recent_logs"][0]["to_block_name"], "B2")

    def test_rotation_log_updates_tray_block_and_appears_in_summary(self):
        experiment = Experiment.objects.create(
            name="Rotation Log",
            lifecycle_state=Experiment.LifecycleState.RUNNING,
        )
        block_a = Block.objects.create(experiment=experiment, name="B1", description="Front")
        block_b = Block.objects.create(experiment=experiment, name="B2", description="Back")
        tray = Tray.objects.create(experiment=experiment, name="T1", block=block_a)

        post_response = self.client.post(
            f"/api/v1/experiments/{experiment.id}/rotation/log",
            data={"tray_id": str(tray.id), "to_block_id": str(block_b.id), "note": "move to back"},
            content_type="application/json",
        )
        self.assertEqual(post_response.status_code, 201)
        tray.refresh_from_db()
        self.assertEqual(tray.block.id, block_b.id)

        summary_response = self.client.get(f"/api/v1/experiments/{experiment.id}/rotation/summary")
        self.assertEqual(summary_response.status_code, 200)
        recent_logs = summary_response.json()["recent_logs"]
        self.assertGreaterEqual(len(recent_logs), 1)
        self.assertEqual(recent_logs[0]["from_block_name"], "B1")
        self.assertEqual(recent_logs[0]["to_block_name"], "B2")
        self.assertEqual(recent_logs[0]["note"], "move to back")

    def test_rotation_log_rejected_when_not_running(self):
        experiment = Experiment.objects.create(
            name="Rotation Not Running",
            lifecycle_state=Experiment.LifecycleState.DRAFT,
        )
        tray = Tray.objects.create(experiment=experiment, name="T1")

        response = self.client.post(
            f"/api/v1/experiments/{experiment.id}/rotation/log",
            data={"tray_id": str(tray.id)},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.json()["detail"],
            "Rotation logs are intended for running experiments. Start the experiment first.",
        )

    def test_rotation_log_rejects_move_into_restricted_tent(self):
        experiment = Experiment.objects.create(
            name="Rotation Restriction",
            lifecycle_state=Experiment.LifecycleState.RUNNING,
        )
        allowed = Species.objects.create(name="Rotation Allowed", category="nepenthes")
        disallowed = Species.objects.create(name="Rotation Blocked", category="drosera")
        default_tent = Tent.objects.get(experiment=experiment, code="T1")
        default_tent.allowed_species.clear()
        source_block = Block.objects.create(
            experiment=experiment,
            tent=default_tent,
            name="B1",
            description="source",
        )
        restricted_tent = Tent.objects.create(experiment=experiment, name="Tent 2", code="T2")
        restricted_tent.allowed_species.set([allowed])
        target_block = Block.objects.create(
            experiment=experiment,
            tent=restricted_tent,
            name="B1",
            description="target",
        )
        tray = Tray.objects.create(experiment=experiment, name="T1", block=source_block)
        plant = Plant.objects.create(
            experiment=experiment,
            species=disallowed,
            plant_id="DR-820",
            status=Plant.Status.ACTIVE,
        )
        TrayPlant.objects.create(tray=tray, plant=plant, order_index=0)

        response = self.client.post(
            f"/api/v1/experiments/{experiment.id}/rotation/log",
            data={"tray_id": str(tray.id), "to_block_id": str(target_block.id)},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertIn("Tray move blocked", response.json()["detail"])


@override_settings(
    DEBUG=True,
    CF_ACCESS_TEAM_DOMAIN="your-team.cloudflareaccess.com",
    CF_ACCESS_AUD="REPLACE_ME",
    ADMIN_EMAIL="admin@example.com",
    DEV_EMAIL="admin@example.com",
    AUTH_MODE="invite_only",
)
class FeedingApiTests(TestCase):
    def test_feed_rejected_when_experiment_not_running(self):
        experiment = Experiment.objects.create(
            name="Feed Not Running",
            lifecycle_state=Experiment.LifecycleState.DRAFT,
        )
        species = Species.objects.create(name="Nepenthes lowii red", category="nepenthes")
        plant = Plant.objects.create(experiment=experiment, species=species, plant_id="NP-701")

        response = self.client.post(
            f"/api/v1/plants/{plant.id}/feed",
            data={"amount_text": "3 drops"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.json()["detail"],
            "Feeding is available only while an experiment is running.",
        )

    def test_feed_creates_event_and_recent_endpoint_lists_it(self):
        experiment = Experiment.objects.create(
            name="Feed Recent",
            lifecycle_state=Experiment.LifecycleState.RUNNING,
        )
        species = Species.objects.create(name="Drosera alba", category="drosera")
        block = Block.objects.create(experiment=experiment, name="B1", description="slot")
        recipe = Recipe.objects.create(experiment=experiment, code="R0", name="Control")
        plant = Plant.objects.create(
            experiment=experiment,
            species=species,
            plant_id="DR-711",
            assigned_recipe=recipe,
        )
        tray = Tray.objects.create(experiment=experiment, name="T1", block=block, recipe=recipe)
        TrayPlant.objects.create(tray=tray, plant=plant, order_index=0)

        feed_response = self.client.post(
            f"/api/v1/plants/{plant.id}/feed",
            data={"amount_text": "1 mL", "note": "manual test"},
            content_type="application/json",
        )
        self.assertEqual(feed_response.status_code, 201)
        self.assertEqual(feed_response.json()["amount_text"], "1 mL")
        self.assertEqual(feed_response.json()["recipe_id"], str(recipe.id))
        self.assertEqual(feed_response.json()["recipe_code"], "R0")
        self.assertEqual(feed_response.json()["recipe_name"], "Control")

        recent_response = self.client.get(f"/api/v1/plants/{plant.id}/feeding/recent")
        self.assertEqual(recent_response.status_code, 200)
        events = recent_response.json()["events"]
        self.assertGreaterEqual(len(events), 1)
        self.assertEqual(events[0]["amount_text"], "1 mL")
        self.assertEqual(events[0]["recipe_code"], "R0")

    def test_feed_rejected_when_plant_unassigned(self):
        experiment = Experiment.objects.create(
            name="Feed Unassigned",
            lifecycle_state=Experiment.LifecycleState.RUNNING,
        )
        species = Species.objects.create(name="Drosera unassigned", category="drosera")
        plant = Plant.objects.create(experiment=experiment, species=species, plant_id="DR-799")

        response = self.client.post(
            f"/api/v1/plants/{plant.id}/feed",
            data={"amount_text": "1 mL"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.json()["detail"],
            "Plant has no assigned recipe (tray recipe missing).",
        )

    def test_feed_rejected_when_recipe_mismatch(self):
        experiment = Experiment.objects.create(
            name="Feed Recipe Mismatch",
            lifecycle_state=Experiment.LifecycleState.RUNNING,
        )
        species = Species.objects.create(name="Drosera mismatch", category="drosera")
        block = Block.objects.create(experiment=experiment, name="B1", description="slot")
        assigned = Recipe.objects.create(experiment=experiment, code="R0", name="Control")
        other = Recipe.objects.create(experiment=experiment, code="R1", name="Treatment 1")
        plant = Plant.objects.create(
            experiment=experiment,
            species=species,
            plant_id="DR-712",
            assigned_recipe=assigned,
        )
        tray = Tray.objects.create(experiment=experiment, name="T1", block=block, recipe=assigned)
        TrayPlant.objects.create(tray=tray, plant=plant, order_index=0)

        response = self.client.post(
            f"/api/v1/plants/{plant.id}/feed",
            data={"recipe_id": str(other.id), "amount_text": "2 drops"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.json()["detail"],
            "Feeding must use the plant's assigned recipe.",
        )

    def test_feeding_queue_remaining_and_ordering(self):
        experiment = Experiment.objects.create(
            name="Feed Queue",
            lifecycle_state=Experiment.LifecycleState.RUNNING,
        )
        species = Species.objects.create(name="Pinguicula x", category="pinguicula")
        block = Block.objects.create(experiment=experiment, name="B1", description="slot")
        r0 = Recipe.objects.create(experiment=experiment, code="R0", name="Control")
        r1 = Recipe.objects.create(experiment=experiment, code="R1", name="Treatment 1")
        p1 = Plant.objects.create(
            experiment=experiment, species=species, plant_id="PG-001", assigned_recipe=r0
        )
        p2 = Plant.objects.create(
            experiment=experiment, species=species, plant_id="PG-002", assigned_recipe=r1
        )
        p3 = Plant.objects.create(
            experiment=experiment, species=species, plant_id="PG-003", assigned_recipe=r1
        )
        p4 = Plant.objects.create(
            experiment=experiment, species=species, plant_id="PG-004", assigned_recipe=r0
        )
        Plant.objects.create(
            experiment=experiment,
            species=species,
            plant_id="PG-999",
            status=Plant.Status.DEAD,
        )
        tray_one = Tray.objects.create(experiment=experiment, name="T1", block=block, recipe=r1)
        tray_two = Tray.objects.create(experiment=experiment, name="T2", block=block, recipe=None)
        TrayPlant.objects.create(tray=tray_one, plant=p1, order_index=0)
        TrayPlant.objects.create(tray=tray_two, plant=p2, order_index=0)
        TrayPlant.objects.create(tray=tray_one, plant=p3, order_index=1)

        old_20_days = timezone.now() - timedelta(days=20)
        old_10_days = timezone.now() - timedelta(days=10)
        recent_1_day = timezone.now() - timedelta(days=1)

        FeedingEvent.objects.create(
            experiment=experiment,
            plant=p4,
            amount_text="2 drops",
            occurred_at=old_20_days,
            created_by_email="admin@example.com",
        )
        FeedingEvent.objects.create(
            experiment=experiment,
            plant=p1,
            amount_text="2 drops",
            occurred_at=old_10_days,
            created_by_email="admin@example.com",
        )
        FeedingEvent.objects.create(
            experiment=experiment,
            plant=p3,
            amount_text="2 drops",
            occurred_at=recent_1_day,
            created_by_email="admin@example.com",
        )

        response = self.client.get(f"/api/v1/experiments/{experiment.id}/feeding/queue")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["remaining_count"], 1)
        self.assertEqual(payload["window_days"], 7)
        blocked = {item["plant_id"]: item["blocked_reason"] for item in payload["plants"]}
        self.assertEqual(blocked["PG-001"], None)
        self.assertEqual(blocked["PG-002"], "Needs tray recipe")
        self.assertEqual(blocked["PG-004"], "Unplaced")
        self.assertEqual(payload["plants"][0]["assigned_recipe_code"], "R1")
        self.assertEqual(payload["plants"][0]["assigned_recipe_name"], "Treatment 1")
        self.assertEqual(payload["plants"][0]["assigned_recipe_id"], str(r1.id))
        self.assertEqual(payload["plants"][0]["placed_tray_id"], str(tray_one.id))
        self.assertEqual(payload["plants"][0]["placed_tray_name"], "T1")

        plant_ids = [item["plant_id"] for item in payload["plants"]]
        self.assertEqual(plant_ids[:4], ["PG-001", "PG-002", "PG-004", "PG-003"])


@override_settings(
    DEBUG=True,
    CF_ACCESS_TEAM_DOMAIN="your-team.cloudflareaccess.com",
    CF_ACCESS_AUD="REPLACE_ME",
    ADMIN_EMAIL="admin@example.com",
    DEV_EMAIL="admin@example.com",
    AUTH_MODE="invite_only",
    MEDIA_ROOT="/tmp/growtriallab-test-media",
)
class PlantCockpitTests(TestCase):
    def test_cockpit_endpoint_returns_derived_fields(self):
        experiment = Experiment.objects.create(name="Cockpit Derived")
        species = Species.objects.create(name="Nepenthes truncata", category="nepenthes")
        recipe = Recipe.objects.create(experiment=experiment, code="R1", name="Treatment 1")
        plant = Plant.objects.create(
            experiment=experiment,
            species=species,
            plant_id="NP-301",
            bin="A",
            assigned_recipe=recipe,
        )
        PlantWeeklyMetric.objects.create(
            experiment=experiment,
            plant=plant,
            week_number=BASELINE_WEEK_NUMBER,
            metrics={"health_score": 4},
        )
        last_fed_at = timezone.now() - timedelta(days=2)
        FeedingEvent.objects.create(
            experiment=experiment,
            plant=plant,
            recipe=recipe,
            amount_text="2 drops",
            occurred_at=last_fed_at,
            created_by_email="admin@example.com",
        )

        response = self.client.get(f"/api/v1/plants/{plant.id}/cockpit")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["derived"]["has_baseline"])
        self.assertEqual(payload["derived"]["assigned_recipe_id"], str(recipe.id))
        self.assertEqual(payload["derived"]["assigned_recipe_code"], "R1")
        self.assertEqual(payload["derived"]["assigned_recipe_name"], "Treatment 1")
        self.assertEqual(payload["derived"]["last_fed_at"], last_fed_at.isoformat())
        self.assertEqual(payload["plant"]["plant_id"], "NP-301")
        self.assertEqual(
            payload["links"]["baseline_capture"],
            f"/experiments/{experiment.id}/baseline?plant={plant.id}",
        )

    def test_cockpit_endpoint_returns_recent_photos(self):
        experiment = Experiment.objects.create(name="Cockpit Photos")
        species = Species.objects.create(name="Drosera slackii", category="drosera")
        plant = Plant.objects.create(experiment=experiment, species=species, plant_id="DR-501")
        Photo.objects.create(
            experiment=experiment,
            plant=plant,
            tag=Photo.Tag.BASELINE,
            week_number=0,
            file=SimpleUploadedFile("one.jpg", b"one", content_type="image/jpeg"),
        )
        Photo.objects.create(
            experiment=experiment,
            plant=plant,
            tag=Photo.Tag.WEEKLY,
            week_number=1,
            file=SimpleUploadedFile("two.jpg", b"two", content_type="image/jpeg"),
        )

        response = self.client.get(f"/api/v1/plants/{plant.id}/cockpit")
        self.assertEqual(response.status_code, 200)
        photos = response.json()["recent_photos"]
        self.assertEqual(len(photos), 2)
        self.assertTrue(photos[0]["url"].startswith("http://testserver/media/"))
        self.assertIn(photos[0]["tag"], {Photo.Tag.BASELINE, Photo.Tag.WEEKLY})

    def test_cockpit_endpoint_allows_empty_recent_photos(self):
        experiment = Experiment.objects.create(name="Cockpit Empty Photos")
        species = Species.objects.create(name="Pinguicula moranensis", category="pinguicula")
        plant = Plant.objects.create(experiment=experiment, species=species, plant_id="")

        response = self.client.get(f"/api/v1/plants/{plant.id}/cockpit")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["derived"]["has_baseline"])
        self.assertIsNone(payload["derived"]["assigned_recipe_id"])
        self.assertIsNone(payload["derived"]["assigned_recipe_code"])
        self.assertIsNone(payload["derived"]["assigned_recipe_name"])
        self.assertEqual(payload["recent_photos"], [])


@override_settings(
    DEBUG=True,
    CF_ACCESS_TEAM_DOMAIN="your-team.cloudflareaccess.com",
    CF_ACCESS_AUD="REPLACE_ME",
    ADMIN_EMAIL="admin@example.com",
    DEV_EMAIL="admin@example.com",
    AUTH_MODE="invite_only",
)
class PlantReplacementTests(TestCase):
    def test_replace_marks_original_removed_and_creates_chain(self):
        experiment = Experiment.objects.create(name="Replace Chain")
        species = Species.objects.create(name="Nepenthes hamata", category="nepenthes")
        recipe = Recipe.objects.create(experiment=experiment, code="R1", name="Treatment 1")
        original = Plant.objects.create(
            experiment=experiment,
            species=species,
            plant_id="NP-001",
            assigned_recipe=recipe,
            bin="A",
            status=Plant.Status.ACTIVE,
        )
        PlantWeeklyMetric.objects.create(
            experiment=experiment,
            plant=original,
            week_number=BASELINE_WEEK_NUMBER,
            metrics={"health_score": 4},
        )

        response = self.client.post(
            f"/api/v1/plants/{original.id}/replace",
            data={"removed_reason": "Leaf collapse"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        payload = response.json()
        replacement_uuid = payload["replacement"]["uuid"]

        original.refresh_from_db()
        replacement = Plant.objects.get(id=replacement_uuid)

        self.assertEqual(original.status, Plant.Status.REMOVED)
        self.assertEqual(original.removed_reason, "Leaf collapse")
        self.assertEqual(str(original.replaced_by.id), replacement_uuid)
        self.assertEqual(replacement.status, Plant.Status.ACTIVE)
        self.assertEqual(replacement.assigned_recipe.id, recipe.id)
        self.assertIsNone(replacement.bin)
        self.assertNotEqual(replacement.plant_id, original.plant_id)
        self.assertFalse(
            PlantWeeklyMetric.objects.filter(
                experiment=experiment,
                plant=replacement,
                week_number=BASELINE_WEEK_NUMBER,
            ).exists()
        )
        replacement_source = Plant.objects.filter(replaced_by=replacement).first()
        self.assertIsNotNone(replacement_source)
        assert replacement_source is not None
        self.assertEqual(replacement_source.id, original.id)

    def test_replacement_updates_readiness_and_baseline_queue(self):
        experiment = Experiment.objects.create(name="Replace Readiness")
        species = Species.objects.create(name="Drosera capensis red", category="drosera")
        Block.objects.create(experiment=experiment, name="B1", description="slot")
        Recipe.objects.create(experiment=experiment, code="R0", name="Control")
        recipe = Recipe.objects.create(experiment=experiment, code="R1", name="Treatment 1")
        original = Plant.objects.create(
            experiment=experiment,
            species=species,
            plant_id="DR-001",
            assigned_recipe=recipe,
            bin="B",
            status=Plant.Status.ACTIVE,
        )
        PlantWeeklyMetric.objects.create(
            experiment=experiment,
            plant=original,
            week_number=BASELINE_WEEK_NUMBER,
            metrics={"health_score": 5, "coloration_score": 4, "pest_signs": False},
        )

        replace_response = self.client.post(
            f"/api/v1/plants/{original.id}/replace",
            data={"removed_reason": "Root rot"},
            content_type="application/json",
        )
        self.assertEqual(replace_response.status_code, 201)
        replacement_uuid = replace_response.json()["replacement"]["uuid"]

        summary_response = self.client.get(f"/api/v1/experiments/{experiment.id}/status/summary")
        self.assertEqual(summary_response.status_code, 200)
        summary_payload = summary_response.json()["readiness"]["counts"]
        self.assertEqual(summary_payload["active_plants"], 1)
        self.assertEqual(summary_payload["needs_baseline"], 1)
        self.assertEqual(summary_payload["needs_assignment"], 1)

        queue_response = self.client.get(f"/api/v1/experiments/{experiment.id}/baseline/queue")
        self.assertEqual(queue_response.status_code, 200)
        queued_ids = [item["uuid"] for item in queue_response.json()["plants"]]
        self.assertIn(replacement_uuid, queued_ids)
        self.assertNotIn(str(original.id), queued_ids)

    def test_replace_blocks_double_replacement(self):
        experiment = Experiment.objects.create(name="Replace Twice")
        species = Species.objects.create(name="Flytrap Typical", category="flytrap")
        original = Plant.objects.create(experiment=experiment, species=species, plant_id="VF-001")

        first_response = self.client.post(f"/api/v1/plants/{original.id}/replace", data={})
        self.assertEqual(first_response.status_code, 201)

        second_response = self.client.post(f"/api/v1/plants/{original.id}/replace", data={})
        self.assertEqual(second_response.status_code, 400)
        self.assertEqual(
            second_response.json()["detail"],
            "This plant already has a replacement.",
        )

    def test_cockpit_includes_replacement_chain_info(self):
        experiment = Experiment.objects.create(name="Cockpit Chain")
        species = Species.objects.create(name="Pinguicula emarginata", category="pinguicula")
        original = Plant.objects.create(experiment=experiment, species=species, plant_id="PG-001")

        replace_response = self.client.post(
            f"/api/v1/plants/{original.id}/replace",
            data={"removed_reason": "Trial replacement"},
            content_type="application/json",
        )
        self.assertEqual(replace_response.status_code, 201)
        replacement_uuid = replace_response.json()["replacement"]["uuid"]

        original_cockpit = self.client.get(f"/api/v1/plants/{original.id}/cockpit")
        self.assertEqual(original_cockpit.status_code, 200)
        self.assertEqual(
            original_cockpit.json()["derived"]["replaced_by_uuid"],
            replacement_uuid,
        )

        replacement_cockpit = self.client.get(f"/api/v1/plants/{replacement_uuid}/cockpit")
        self.assertEqual(replacement_cockpit.status_code, 200)
        replacement_payload = replacement_cockpit.json()
        self.assertEqual(
            replacement_payload["derived"]["replaces_uuid"],
            str(original.id),
        )
        self.assertIn("Replacement of", replacement_payload["derived"]["chain_label"])


@override_settings(
    DEBUG=True,
    CF_ACCESS_TEAM_DOMAIN="your-team.cloudflareaccess.com",
    CF_ACCESS_AUD="REPLACE_ME",
    ADMIN_EMAIL="admin@example.com",
    DEV_EMAIL="admin@example.com",
    AUTH_MODE="invite_only",
)
class Packet3BaselineTests(TestCase):
    def test_default_metric_templates_seeded(self):
        categories = set(MetricTemplate.objects.values_list("category", flat=True))
        self.assertTrue({"nepenthes", "flytrap", "drosera"}.issubset(categories))

    def test_baseline_save_writes_week_zero_metric_and_bin(self):
        experiment = Experiment.objects.create(name="Baseline Save")
        species = Species.objects.create(name="Nepenthes ventricosa", category="nepenthes")
        plant = Plant.objects.create(experiment=experiment, species=species, plant_id="NP-050")

        response = self.client.post(
            f"/api/v1/plants/{plant.id}/baseline",
            data={
                "metrics": {
                    "health_score": 4,
                    "coloration_score": 3,
                    "growth_notes": "Stable",
                    "pest_signs": False,
                },
                "notes": "Week zero entry",
                "bin": "A",
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)

        metric = PlantWeeklyMetric.objects.get(plant=plant, week_number=BASELINE_WEEK_NUMBER)
        self.assertEqual(metric.metrics["health_score"], 4)
        self.assertEqual(metric.notes, "Week zero entry")
        plant.refresh_from_db()
        self.assertEqual(plant.bin, "A")

    def test_baseline_save_validates_required_template_fields(self):
        experiment = Experiment.objects.create(name="Baseline Validate")
        species = Species.objects.create(name="Drosera capensis", category="drosera")
        plant = Plant.objects.create(experiment=experiment, species=species, plant_id="DR-010")

        response = self.client.post(
            f"/api/v1/plants/{plant.id}/baseline",
            data={"metrics": {"growth_notes": "Missing required scores"}},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("health_score is required.", str(response.json()))

    def test_complete_baseline_packet_locks_and_advances(self):
        experiment = Experiment.objects.create(name="Baseline Complete")
        species = Species.objects.create(name="Flytrap A", category="flytrap")
        plant = Plant.objects.create(experiment=experiment, species=species, plant_id="VF-001", bin="B")
        PlantWeeklyMetric.objects.create(
            experiment=experiment,
            plant=plant,
            week_number=BASELINE_WEEK_NUMBER,
            metrics={"health_score": 5, "coloration_score": 4, "pest_signs": False},
        )

        setup_state = ExperimentSetupState.objects.get(experiment=experiment)
        setup_state.completed_packets = [PACKET_ENVIRONMENT, PACKET_PLANTS]
        setup_state.current_packet = PACKET_BASELINE
        setup_state.save(update_fields=["completed_packets", "current_packet", "updated_at"])

        response = self.client.post(
            f"/api/v1/experiments/{experiment.id}/packets/baseline/complete/"
        )
        self.assertEqual(response.status_code, 200)

        setup_state.refresh_from_db()
        self.assertIn(PACKET_BASELINE, setup_state.completed_packets)
        self.assertEqual(setup_state.current_packet, PACKET_GROUPS)
        self.assertIn(PACKET_BASELINE, setup_state.locked_packets)
        self.assertTrue(setup_state.packet_data.get(PACKET_BASELINE, {}).get("locked"))


@override_settings(
    DEBUG=True,
    CF_ACCESS_TEAM_DOMAIN="your-team.cloudflareaccess.com",
    CF_ACCESS_AUD="REPLACE_ME",
    ADMIN_EMAIL="admin@example.com",
    DEV_EMAIL="admin@example.com",
    AUTH_MODE="invite_only",
)
class BaselineQueueTests(TestCase):
    def test_queue_returns_remaining_count_for_active_plants(self):
        experiment = Experiment.objects.create(name="Baseline Queue Count")
        species = Species.objects.create(name="Nepenthes ampullaria", category="nepenthes")
        complete = Plant.objects.create(experiment=experiment, species=species, plant_id="NP-001", bin="A")
        needs_metric = Plant.objects.create(experiment=experiment, species=species, plant_id="NP-002", bin="B")
        needs_bin = Plant.objects.create(experiment=experiment, species=species, plant_id="NP-003", bin=None)
        PlantWeeklyMetric.objects.create(
            experiment=experiment,
            plant=complete,
            week_number=BASELINE_WEEK_NUMBER,
            metrics={"health_score": 4, "coloration_score": 4, "pest_signs": False},
        )
        PlantWeeklyMetric.objects.create(
            experiment=experiment,
            plant=needs_bin,
            week_number=BASELINE_WEEK_NUMBER,
            metrics={"health_score": 4, "coloration_score": 3, "pest_signs": False},
        )

        response = self.client.get(f"/api/v1/experiments/{experiment.id}/baseline/queue")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["remaining_count"], 2)
        returned_ids = {item["uuid"] for item in payload["plants"]}
        self.assertEqual(returned_ids, {str(complete.id), str(needs_metric.id), str(needs_bin.id)})

    def test_queue_orders_missing_baseline_or_bin_first(self):
        experiment = Experiment.objects.create(name="Baseline Queue Order Needs")
        species = Species.objects.create(name="Drosera capensis", category="drosera")
        missing = Plant.objects.create(experiment=experiment, species=species, plant_id="DR-010", bin="A")
        complete = Plant.objects.create(experiment=experiment, species=species, plant_id="DR-001", bin="B")
        PlantWeeklyMetric.objects.create(
            experiment=experiment,
            plant=complete,
            week_number=BASELINE_WEEK_NUMBER,
            metrics={"health_score": 4, "coloration_score": 4, "pest_signs": False},
        )

        response = self.client.get(f"/api/v1/experiments/{experiment.id}/baseline/queue")
        self.assertEqual(response.status_code, 200)
        queue = response.json()["plants"]
        self.assertGreaterEqual(len(queue), 2)
        self.assertEqual(queue[0]["uuid"], str(missing.id))
        self.assertEqual(queue[1]["uuid"], str(complete.id))

    def test_queue_excludes_non_active_plants(self):
        experiment = Experiment.objects.create(name="Baseline Queue Active Only")
        species = Species.objects.create(name="Flytrap B52", category="flytrap")
        active = Plant.objects.create(experiment=experiment, species=species, plant_id="VF-001", bin=None)
        inactive = Plant.objects.create(
            experiment=experiment,
            species=species,
            plant_id="VF-002",
            bin=None,
            status=Plant.Status.INACTIVE,
        )
        dead = Plant.objects.create(
            experiment=experiment,
            species=species,
            plant_id="VF-003",
            bin=None,
            status=Plant.Status.DEAD,
        )

        response = self.client.get(f"/api/v1/experiments/{experiment.id}/baseline/queue")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["remaining_count"], 1)
        returned_ids = [item["uuid"] for item in payload["plants"]]
        self.assertEqual(returned_ids, [str(active.id)])
        self.assertNotIn(str(inactive.id), returned_ids)
        self.assertNotIn(str(dead.id), returned_ids)

    def test_queue_orders_by_plant_id_when_present(self):
        experiment = Experiment.objects.create(name="Baseline Queue Plant ID Sort")
        species = Species.objects.create(name="Pinguicula gigantea", category="pinguicula")
        Plant.objects.create(experiment=experiment, species=species, plant_id="PG-010", bin="A")
        Plant.objects.create(experiment=experiment, species=species, plant_id="PG-002", bin="A")
        Plant.objects.create(experiment=experiment, species=species, plant_id="PG-001", bin="A")

        response = self.client.get(f"/api/v1/experiments/{experiment.id}/baseline/queue")
        self.assertEqual(response.status_code, 200)
        returned_ids = [item["plant_id"] for item in response.json()["plants"]]
        self.assertEqual(returned_ids, ["PG-001", "PG-002", "PG-010"])


class Packet3BaselineLockTests(TestCase):
    @override_settings(
        DEBUG=True,
        CF_ACCESS_TEAM_DOMAIN="your-team.cloudflareaccess.com",
        CF_ACCESS_AUD="REPLACE_ME",
        ADMIN_EMAIL="admin@example.com",
        DEV_EMAIL="admin@example.com",
        AUTH_MODE="invite_only",
    )
    def test_lock_does_not_block_baseline_edits(self):
        experiment = Experiment.objects.create(name="Baseline Lock User")
        species = Species.objects.create(name="Nepenthes lowii", category="nepenthes")
        plant = Plant.objects.create(experiment=experiment, species=species, plant_id="NP-777")

        lock_response = self.client.post(f"/api/v1/experiments/{experiment.id}/baseline/lock")
        self.assertEqual(lock_response.status_code, 200)

        update_response = self.client.post(
            f"/api/v1/plants/{plant.id}/baseline",
            data={
                "metrics": {
                    "health_score": 5,
                    "coloration_score": 5,
                    "pest_signs": False,
                },
                "bin": "C",
            },
            content_type="application/json",
        )
        self.assertEqual(update_response.status_code, 200)

        metric = PlantWeeklyMetric.objects.get(plant=plant, week_number=BASELINE_WEEK_NUMBER)
        self.assertEqual(metric.metrics["health_score"], 5)
        plant.refresh_from_db()
        self.assertEqual(plant.bin, "C")


@override_settings(
    DEBUG=True,
    CF_ACCESS_TEAM_DOMAIN="your-team.cloudflareaccess.com",
    CF_ACCESS_AUD="REPLACE_ME",
    ADMIN_EMAIL="admin@example.com",
    DEV_EMAIL="admin@example.com",
    AUTH_MODE="invite_only",
)
class Packet4GroupsTests(TestCase):
    def _create_binned_plants(self, experiment: Experiment):
        nepenthes = Species.objects.create(name="Nepenthes ampullaria", category="nepenthes")
        drosera = Species.objects.create(name="Drosera capensis alba", category="drosera")
        p1 = Plant.objects.create(experiment=experiment, species=nepenthes, plant_id="NP-001", bin="A")
        p2 = Plant.objects.create(experiment=experiment, species=nepenthes, plant_id="NP-002", bin="A")
        p3 = Plant.objects.create(experiment=experiment, species=drosera, plant_id="DR-001", bin="B")
        p4 = Plant.objects.create(experiment=experiment, species=drosera, plant_id="DR-002", bin="B")
        return [p1, p2, p3, p4]

    def test_preview_and_apply_require_r0_and_at_least_two_recipes(self):
        experiment = Experiment.objects.create(name="Groups Recipe Validation")
        self._create_binned_plants(experiment)
        Recipe.objects.create(experiment=experiment, code="R1", name="Treatment 1")

        preview_response = self.client.post(
            f"/api/v1/experiments/{experiment.id}/groups/preview",
            data={"seed": 77},
            content_type="application/json",
        )
        self.assertEqual(preview_response.status_code, 400)
        self.assertIn("At least 2 recipes are required", str(preview_response.json()))
        self.assertIn("Recipe code 'R0' (control) is required", str(preview_response.json()))

        apply_response = self.client.post(
            f"/api/v1/experiments/{experiment.id}/groups/apply",
            data={"seed": 77},
            content_type="application/json",
        )
        self.assertEqual(apply_response.status_code, 400)

    def test_preview_and_apply_require_bins_for_all_active_plants(self):
        experiment = Experiment.objects.create(name="Groups Bin Validation")
        species = Species.objects.create(name="Nepenthes maxima", category="nepenthes")
        Plant.objects.create(experiment=experiment, species=species, plant_id="NP-010", bin="A")
        Plant.objects.create(experiment=experiment, species=species, plant_id="NP-011", bin=None)
        Recipe.objects.create(experiment=experiment, code="R0", name="Control")
        Recipe.objects.create(experiment=experiment, code="R1", name="Treatment 1")

        preview_response = self.client.post(
            f"/api/v1/experiments/{experiment.id}/groups/preview",
            data={},
            content_type="application/json",
        )
        self.assertEqual(preview_response.status_code, 400)
        self.assertEqual(preview_response.json().get("missing_bin_count"), 1)

        apply_response = self.client.post(
            f"/api/v1/experiments/{experiment.id}/groups/apply",
            data={"seed": 11},
            content_type="application/json",
        )
        self.assertEqual(apply_response.status_code, 400)

    def test_preview_generates_seed_and_does_not_persist_assignments(self):
        experiment = Experiment.objects.create(name="Groups Preview")
        plants = self._create_binned_plants(experiment)
        Recipe.objects.create(experiment=experiment, code="R0", name="Control")
        Recipe.objects.create(experiment=experiment, code="R1", name="Treatment 1")

        response = self.client.post(
            f"/api/v1/experiments/{experiment.id}/groups/preview",
            data={},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIsInstance(payload.get("seed"), int)
        self.assertGreater(payload["seed"], 0)
        self.assertEqual(payload["algorithm"], "stratified_v1")
        self.assertEqual(len(payload["proposed_assignments"]), len(plants))

        self.assertEqual(
            Plant.objects.filter(experiment=experiment, assigned_recipe__isnull=False).count(),
            0,
        )

    def test_apply_persists_assignments_and_records_seed_metadata(self):
        experiment = Experiment.objects.create(name="Groups Apply")
        plants = self._create_binned_plants(experiment)
        Recipe.objects.create(experiment=experiment, code="R0", name="Control")
        Recipe.objects.create(experiment=experiment, code="R1", name="Treatment 1")
        seed = 12345

        response = self.client.post(
            f"/api/v1/experiments/{experiment.id}/groups/apply",
            data={"seed": seed},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)

        assigned_count = Plant.objects.filter(
            id__in=[plant.id for plant in plants],
            assigned_recipe__isnull=False,
        ).count()
        self.assertEqual(assigned_count, len(plants))
        assigned_recipes = list(
            Plant.objects.filter(id__in=[plant.id for plant in plants]).values_list(
                "assigned_recipe__code", flat=True
            )
        )
        self.assertTrue(all(code in {"R0", "R1"} for code in assigned_recipes))
        self.assertTrue(any(code == "R0" for code in assigned_recipes))
        self.assertTrue(any(code == "R1" for code in assigned_recipes))

        setup_state = ExperimentSetupState.objects.get(experiment=experiment)
        groups_payload = setup_state.packet_data.get(PACKET_GROUPS, {})
        self.assertEqual(groups_payload.get("algorithm"), "stratified_v1")
        self.assertEqual(groups_payload.get("seed"), seed)
        self.assertIn("applied_at", groups_payload)
        self.assertEqual(groups_payload.get("locked"), False)

    def test_apply_excludes_removed_plants_from_assignment(self):
        experiment = Experiment.objects.create(name="Groups Apply Active Only")
        active_plants = self._create_binned_plants(experiment)
        removed = Plant.objects.create(
            experiment=experiment,
            species=active_plants[0].species,
            plant_id="NP-999",
            bin="A",
            status=Plant.Status.REMOVED,
        )
        Recipe.objects.create(experiment=experiment, code="R0", name="Control")
        Recipe.objects.create(experiment=experiment, code="R1", name="Treatment 1")

        response = self.client.post(
            f"/api/v1/experiments/{experiment.id}/groups/apply",
            data={"seed": 99},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            Plant.objects.filter(id__in=[plant.id for plant in active_plants], assigned_recipe__isnull=False).count(),
            len(active_plants),
        )
        removed.refresh_from_db()
        self.assertIsNone(removed.assigned_recipe)

    def test_complete_groups_packet_requires_assignments_and_locks_ui_state(self):
        experiment = Experiment.objects.create(name="Groups Complete")
        species = Species.objects.create(name="Pinguicula esseriana", category="pinguicula")
        recipe = Recipe.objects.create(experiment=experiment, code="R0", name="Control")
        Plant.objects.create(experiment=experiment, species=species, plant_id="PG-001", bin="A")

        setup_state = ExperimentSetupState.objects.get(experiment=experiment)
        setup_state.completed_packets = [PACKET_ENVIRONMENT, PACKET_PLANTS, PACKET_BASELINE]
        setup_state.current_packet = PACKET_GROUPS
        setup_state.save(update_fields=["completed_packets", "current_packet", "updated_at"])

        fail_response = self.client.post(
            f"/api/v1/experiments/{experiment.id}/packets/groups/complete/"
        )
        self.assertEqual(fail_response.status_code, 400)

        Plant.objects.filter(experiment=experiment).update(assigned_recipe=recipe)
        success_response = self.client.post(
            f"/api/v1/experiments/{experiment.id}/packets/groups/complete/"
        )
        self.assertEqual(success_response.status_code, 200)

        setup_state.refresh_from_db()
        self.assertIn(PACKET_GROUPS, setup_state.completed_packets)
        self.assertEqual(setup_state.current_packet, PACKET_TRAYS)
        self.assertTrue(setup_state.packet_data.get(PACKET_GROUPS, {}).get("locked"))
