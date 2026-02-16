from django.utils import timezone

from .models import AppUser


class TestAppUserMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user, _ = AppUser.objects.get_or_create(
            email="test@example.com",
            defaults={
                "role": AppUser.Role.ADMIN,
                "status": AppUser.Status.ACTIVE,
            },
        )
        user.last_seen_at = timezone.now()
        user.save(update_fields=["last_seen_at"])
        request.app_user = user
        return self.get_response(request)
