from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Experiment, Tent


@receiver(post_save, sender=Experiment)
def create_default_tent(sender, instance: Experiment, created: bool, **kwargs):
    if not created:
        return
    Tent.objects.get_or_create(
        experiment=instance,
        code="TN1",
        defaults={"name": "Tent 1"},
    )
