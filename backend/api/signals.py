from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Experiment, ExperimentSetupState, Tent
from .setup_packets import PACKET_PLANTS


@receiver(post_save, sender=Experiment)
def create_experiment_setup_state(sender, instance: Experiment, created: bool, **kwargs):
    if created:
        ExperimentSetupState.objects.get_or_create(
            experiment=instance,
            defaults={"current_packet": PACKET_PLANTS},
        )
        Tent.objects.get_or_create(
            experiment=instance,
            code="T1",
            defaults={"name": "Tent 1"},
        )
