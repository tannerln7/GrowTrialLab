from rest_framework import serializers

from .models import (
    AdverseEvent,
    BatchLot,
    Block,
    Experiment,
    ExperimentSetupState,
    FeedingEvent,
    MetricTemplate,
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
from .setup_packets import STEP_LABELS, STEP_ORDER, normalize_step_ids


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
        completed = set(normalize_step_ids(obj.completed_packets or []))
        locked = set(normalize_step_ids(obj.locked_packets or []))
        current_packet = obj.current_packet if obj.current_packet in STEP_ORDER else STEP_ORDER[0]
        progress = []
        for packet_id in STEP_ORDER:
            if packet_id in completed:
                status = "done"
            elif packet_id == current_packet:
                status = "current"
            else:
                status = "todo"
            progress.append(
                {
                    "id": packet_id,
                    "name": STEP_LABELS[packet_id],
                    "status": status,
                    "locked": packet_id in locked,
                }
            )
        return progress


class SetupStateUpdateSerializer(serializers.Serializer):
    current_packet = serializers.ChoiceField(choices=STEP_ORDER, required=False)
    completed_packets = serializers.ListField(
        child=serializers.ChoiceField(choices=STEP_ORDER),
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


class PlantDetailSpeciesSerializer(serializers.ModelSerializer):
    class Meta:
        model = Species
        fields = ["id", "name", "category"]


class PlantDetailExperimentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Experiment
        fields = ["id", "name"]


class PlantDetailRecipeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Recipe
        fields = ["id", "code", "name"]


class PlantDetailSerializer(serializers.ModelSerializer):
    uuid = serializers.UUIDField(source="id", read_only=True)
    species = PlantDetailSpeciesSerializer(read_only=True)
    experiment = PlantDetailExperimentSerializer(read_only=True)
    assigned_recipe = PlantDetailRecipeSerializer(read_only=True)

    class Meta:
        model = Plant
        fields = [
            "uuid",
            "plant_id",
            "species",
            "cultivar",
            "status",
            "baseline_notes",
            "experiment",
            "assigned_recipe",
            "created_at",
            "updated_at",
        ]


class ExperimentPlantSerializer(serializers.ModelSerializer):
    species_name = serializers.CharField(source="species.name", read_only=True)
    species_category = serializers.CharField(source="species.category", read_only=True)

    class Meta:
        model = Plant
        fields = [
            "id",
            "experiment",
            "species",
            "species_name",
            "species_category",
            "plant_id",
            "bin",
            "cultivar",
            "status",
            "baseline_notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class ExperimentPlantCreateSerializer(serializers.Serializer):
    species = serializers.UUIDField(required=False)
    species_name = serializers.CharField(required=False, allow_blank=False)
    category = serializers.CharField(required=False, allow_blank=True)
    plant_id = serializers.CharField(required=False, allow_blank=True)
    cultivar = serializers.CharField(required=False, allow_blank=True)
    status = serializers.ChoiceField(choices=Plant.Status.choices, required=False)
    baseline_notes = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if not attrs.get("species") and not attrs.get("species_name"):
            raise serializers.ValidationError("Either 'species' or 'species_name' is required.")
        return attrs


class PlantsPacketSerializer(serializers.Serializer):
    id_format_notes = serializers.CharField(required=False, allow_blank=True)


class BaselinePacketSerializer(serializers.Serializer):
    template_id = serializers.UUIDField(required=False)
    template_version = serializers.IntegerField(required=False, min_value=1)
    notes = serializers.CharField(required=False, allow_blank=True)


class GroupRecipeCreateSerializer(serializers.Serializer):
    code = serializers.RegexField(regex=r"^R\d+$")
    name = serializers.CharField(required=True, allow_blank=False)
    notes = serializers.CharField(required=False, allow_blank=True)


class GroupRecipeUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(required=False, allow_blank=False)
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("At least one field is required.")
        return attrs


class GroupsPreviewSerializer(serializers.Serializer):
    seed = serializers.IntegerField(required=False, min_value=1, max_value=2_147_483_647)


class GroupsApplySerializer(serializers.Serializer):
    seed = serializers.IntegerField(required=True, min_value=1, max_value=2_147_483_647)


class GroupsPacketSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True)


class PlantBaselineSaveSerializer(serializers.Serializer):
    metrics = serializers.JSONField(required=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    bin = serializers.ChoiceField(choices=Plant.Bin.choices, required=False)


class MetricTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MetricTemplate
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
