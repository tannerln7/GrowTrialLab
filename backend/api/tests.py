from unittest.mock import patch

from django.test import TestCase, override_settings

from api.models import AppUser, Block, Experiment, ExperimentSetupState
from api.setup_packets import PACKET_ENVIRONMENT, PACKET_PLANTS


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
        self.assertEqual(state.current_packet, PACKET_ENVIRONMENT)

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
