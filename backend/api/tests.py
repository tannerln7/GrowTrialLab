from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from api.baseline import BASELINE_WEEK_NUMBER
from api.models import (
    AppUser,
    Block,
    Experiment,
    ExperimentSetupState,
    MetricTemplate,
    Photo,
    Plant,
    PlantWeeklyMetric,
    Recipe,
    Species,
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

    def test_blocks_endpoint_creates_defaults_when_empty(self):
        experiment = Experiment.objects.create(name="Blocks Defaults")
        response = self.client.get(f"/api/v1/experiments/{experiment.id}/blocks/")
        self.assertEqual(response.status_code, 200)
        names = [item["name"] for item in response.json()]
        self.assertEqual(names, ["B1", "B2", "B3", "B4"])


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
        self.assertEqual(payload["counts"]["needs_assignment"], 1)

        uuids = {item["uuid"] for item in payload["plants"]}
        self.assertIn(str(plant_ready.id), uuids)
        self.assertIn(str(plant_needs_all.id), uuids)
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

        response = self.client.get(f"/api/v1/plants/{plant.id}/cockpit")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["derived"]["has_baseline"])
        self.assertEqual(payload["derived"]["assigned_recipe_code"], "R1")
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
        self.assertIsNone(payload["derived"]["assigned_recipe_code"])
        self.assertEqual(payload["recent_photos"], [])


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

        setup_state = ExperimentSetupState.objects.get(experiment=experiment)
        groups_payload = setup_state.packet_data.get(PACKET_GROUPS, {})
        self.assertEqual(groups_payload.get("algorithm"), "stratified_v1")
        self.assertEqual(groups_payload.get("seed"), seed)
        self.assertIn("applied_at", groups_payload)
        self.assertEqual(groups_payload.get("locked"), False)

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
