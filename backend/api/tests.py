from unittest.mock import patch

from django.test import TestCase, override_settings

from api.models import AppUser


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
