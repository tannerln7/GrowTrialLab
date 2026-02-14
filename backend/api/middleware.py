from django.conf import settings
from django.http import JsonResponse
from django.utils import timezone

from .cloudflare_access import CloudflareJWTError, CloudflareJWTVerifier
from .models import AppUser


class CloudflareAccessMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        self.exempt_paths = {"/healthz"}
        self.verifier = None

        if settings.CF_ACCESS_TEAM_DOMAIN and settings.CF_ACCESS_AUD:
            self.verifier = CloudflareJWTVerifier(
                settings.CF_ACCESS_TEAM_DOMAIN, settings.CF_ACCESS_AUD
            )

    def _reject(self, detail: str):
        return JsonResponse({"detail": detail}, status=403)

    def __call__(self, request):
        request.app_user = None

        if request.path in self.exempt_paths:
            return self.get_response(request)

        if self.verifier is None:
            return self._reject("Access verifier is not configured.")

        token = request.headers.get("Cf-Access-Jwt-Assertion")
        if not token:
            return self._reject("Missing Cf-Access-Jwt-Assertion header.")

        try:
            payload = self.verifier.verify(token)
        except CloudflareJWTError as exc:
            return self._reject(str(exc))

        email = (
            payload.get("email")
            or request.headers.get("Cf-Access-Authenticated-User-Email")
            or ""
        ).strip().lower()
        if not email:
            return self._reject("Authenticated email is required.")

        admin_email = settings.ADMIN_EMAIL.strip().lower()
        user = AppUser.objects.filter(email=email).first()
        if user is None:
            if settings.AUTH_MODE == "invite_only" and email != admin_email:
                return self._reject("User is not invited.")
            user = AppUser.objects.create(
                email=email,
                role=AppUser.Role.ADMIN if email == admin_email else AppUser.Role.USER,
                status=AppUser.Status.ACTIVE,
            )

        if user.status == AppUser.Status.DISABLED:
            return self._reject("User is disabled.")

        if email == admin_email and user.role != AppUser.Role.ADMIN:
            user.role = AppUser.Role.ADMIN
            user.save(update_fields=["role"])

        user.last_seen_at = timezone.now()
        user.save(update_fields=["last_seen_at"])
        request.app_user = user

        return self.get_response(request)
