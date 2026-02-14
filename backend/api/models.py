from django.db import models


class AppUser(models.Model):
    class Role(models.TextChoices):
        ADMIN = "admin", "admin"
        USER = "user", "user"

    class Status(models.TextChoices):
        ACTIVE = "active", "active"
        DISABLED = "disabled", "disabled"

    email = models.EmailField(unique=True)
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.USER)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        if self.email:
            self.email = self.email.strip().lower()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.email} ({self.role})"
