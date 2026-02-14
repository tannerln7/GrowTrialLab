from django.conf import settings
from django.core.management.base import BaseCommand

from api.models import AppUser


class Command(BaseCommand):
    help = "Ensure ADMIN_EMAIL exists as an active admin AppUser."

    def handle(self, *args, **options):
        admin_email = settings.ADMIN_EMAIL.strip().lower()
        if not admin_email:
            self.stdout.write(self.style.WARNING("ADMIN_EMAIL is empty; skipping bootstrap."))
            return

        app_user, created = AppUser.objects.get_or_create(
            email=admin_email,
            defaults={"role": AppUser.Role.ADMIN, "status": AppUser.Status.ACTIVE},
        )

        changed = False
        if app_user.role != AppUser.Role.ADMIN:
            app_user.role = AppUser.Role.ADMIN
            changed = True
        if app_user.status != AppUser.Status.ACTIVE:
            app_user.status = AppUser.Status.ACTIVE
            changed = True
        if changed:
            app_user.save(update_fields=["role", "status"])

        if created:
            self.stdout.write(self.style.SUCCESS(f"Created bootstrap admin: {admin_email}"))
        elif changed:
            self.stdout.write(self.style.SUCCESS(f"Updated bootstrap admin: {admin_email}"))
        else:
            self.stdout.write(f"Bootstrap admin already configured: {admin_email}")
