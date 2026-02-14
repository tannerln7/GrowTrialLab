from rest_framework import serializers

from .models import (
    AdverseEvent,
    BatchLot,
    Block,
    Experiment,
    ExperimentSetupState,
    FeedingEvent,
    Photo,
    Plant,
    PlantWeeklyMetric,
    Recipe,
    RotationLog,
    Species,
    Tray,
    TrayPlant,
    WeeklySession,
)
from .setup_packets import PACKET_LABELS, PACKET_ORDER, normalize_packet_ids


class SpeciesSerializer(serializers.ModelSerializer):
    class Meta:
        model = Species
        fields = "__all__"


class ExperimentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Experiment
        fields = "__all__"


class ExperimentSetupStateSerializer(serializers.ModelSerializer):
    packet_progress = serializers.SerializerMethodField()

    class Meta:
        model = ExperimentSetupState
        fields = [
            "experiment",
            "current_packet",
            "completed_packets",
            "locked_packets",
            "packet_data",
            "updated_at",
            "packet_progress",
        ]

    def get_packet_progress(self, obj: ExperimentSetupState):
        completed = set(normalize_packet_ids(obj.completed_packets or []))
        locked = set(normalize_packet_ids(obj.locked_packets or []))
        current_packet = obj.current_packet if obj.current_packet in PACKET_ORDER else PACKET_ORDER[0]
        progress = []
        for packet_id in PACKET_ORDER:
            if packet_id in completed:
                status = "done"
            elif packet_id == current_packet:
                status = "current"
            else:
                status = "todo"
            progress.append(
                {
                    "id": packet_id,
                    "name": PACKET_LABELS[packet_id],
                    "status": status,
                    "locked": packet_id in locked,
                }
            )
        return progress


class SetupStateUpdateSerializer(serializers.Serializer):
    current_packet = serializers.ChoiceField(choices=PACKET_ORDER, required=False)
    completed_packets = serializers.ListField(
        child=serializers.ChoiceField(choices=PACKET_ORDER),
        required=False,
    )


class EnvironmentPacketSerializer(serializers.Serializer):
    tent_name = serializers.CharField(required=False, allow_blank=True)
    light_schedule = serializers.CharField(required=False, allow_blank=True)
    light_height_notes = serializers.CharField(required=False, allow_blank=True)
    ventilation_notes = serializers.CharField(required=False, allow_blank=True)
    water_source = serializers.CharField(required=False, allow_blank=True)
    run_in_days = serializers.IntegerField(required=False, min_value=1, default=14)
    notes = serializers.CharField(required=False, allow_blank=True)


class RecipeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Recipe
        fields = "__all__"


class BatchLotSerializer(serializers.ModelSerializer):
    class Meta:
        model = BatchLot
        fields = "__all__"


class PlantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Plant
        fields = "__all__"


class TraySerializer(serializers.ModelSerializer):
    class Meta:
        model = Tray
        fields = "__all__"


class TrayPlantSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrayPlant
        fields = "__all__"


class BlockSerializer(serializers.ModelSerializer):
    class Meta:
        model = Block
        fields = "__all__"


class RotationLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = RotationLog
        fields = "__all__"


class WeeklySessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = WeeklySession
        fields = "__all__"


class PlantWeeklyMetricSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlantWeeklyMetric
        fields = "__all__"


class FeedingEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = FeedingEvent
        fields = "__all__"


class AdverseEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = AdverseEvent
        fields = "__all__"


class PhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Photo
        fields = "__all__"
