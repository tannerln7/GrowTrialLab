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
    Tent,
    Tray,
    TrayPlant,
    WeeklySession,
)
from .setup_packets import STEP_LABELS, STEP_ORDER, normalize_step_ids
from .tent_restrictions import first_disallowed_plant, tent_allows_species


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
            "removed_at",
            "removed_reason",
            "replaced_by",
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


class PlantReplaceSerializer(serializers.Serializer):
    new_plant_id = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    copy_identity_fields = serializers.BooleanField(required=False, default=True)
    inherit_assignment = serializers.BooleanField(required=False, default=True)
    inherit_bin = serializers.BooleanField(required=False, default=False)
    mark_original_removed = serializers.BooleanField(required=False, default=True)
    removed_reason = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    removed_at = serializers.DateTimeField(required=False, allow_null=True)


class MetricTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MetricTemplate
        fields = "__all__"


class TraySerializer(serializers.ModelSerializer):
    def to_internal_value(self, data):
        if isinstance(data, dict):
            mutable = dict(data)
            if "assigned_recipe" not in mutable:
                if "recipe_id" in mutable:
                    mutable["assigned_recipe"] = mutable.get("recipe_id")
                elif "recipe" in mutable:
                    mutable["assigned_recipe"] = mutable.get("recipe")
            if "block" not in mutable and "block_id" in mutable:
                mutable["block"] = mutable.get("block_id")
            data = mutable
        return super().to_internal_value(data)

    def validate(self, attrs):
        experiment = attrs.get("experiment") or (self.instance.experiment if self.instance else None)
        block = attrs.get("block") or (self.instance.block if self.instance else None)
        assigned_recipe = attrs.get("assigned_recipe") or (
            self.instance.assigned_recipe if self.instance else None
        )
        capacity = attrs.get("capacity")
        if capacity is None and self.instance is not None:
            capacity = self.instance.capacity
        if capacity is not None and capacity < 1:
            raise serializers.ValidationError("capacity must be at least 1.")
        if experiment and block and block.tent.experiment_id != experiment.id:
            raise serializers.ValidationError("Block must belong to the same experiment as tray.")
        if block and not block.tent_id:
            raise serializers.ValidationError("Block must be assigned to a tent before placing trays.")
        if experiment and assigned_recipe and assigned_recipe.experiment_id != experiment.id:
            raise serializers.ValidationError("Recipe must belong to the same experiment as tray.")
        if self.instance is not None:
            current_count = self.instance.tray_plants.count()
            if capacity is not None and current_count > capacity:
                raise serializers.ValidationError(
                    f"Tray currently has {current_count} plants; capacity cannot be set below that."
                )
            if block and block.tent:
                tray_plants = list(self.instance.tray_plants.select_related("plant__species").all())
                violating = first_disallowed_plant(block.tent, [item.plant for item in tray_plants])
                if violating:
                    raise serializers.ValidationError(
                        (
                            f"Tray move blocked: tent '{block.tent.name}' does not allow "
                            f"plant '{violating.plant_id or violating.id}' ({violating.species.name})."
                        )
                    )
        return attrs

    class Meta:
        model = Tray
        fields = "__all__"


class TrayPlantSerializer(serializers.ModelSerializer):
    def validate(self, attrs):
        tray = attrs.get("tray") or (self.instance.tray if self.instance else None)
        plant = attrs.get("plant") or (self.instance.plant if self.instance else None)
        if tray and plant and tray.experiment_id != plant.experiment_id:
            raise serializers.ValidationError("Plant and tray must belong to the same experiment.")
        if plant and plant.status == Plant.Status.REMOVED:
            raise serializers.ValidationError("Removed plants cannot be placed in trays.")

        if plant:
            existing_qs = TrayPlant.objects.filter(plant=plant)
            if self.instance:
                existing_qs = existing_qs.exclude(id=self.instance.id)
            if existing_qs.exists():
                raise serializers.ValidationError("Plant is already placed in another tray.")
        if tray:
            occupancy_qs = tray.tray_plants.all()
            if self.instance:
                occupancy_qs = occupancy_qs.exclude(id=self.instance.id)
            if occupancy_qs.count() >= tray.capacity:
                raise serializers.ValidationError(f"Tray is full (capacity {tray.capacity}).")
            if plant and tray.block and tray.block.tent and not tent_allows_species(tray.block.tent, plant.species_id):
                raise serializers.ValidationError(
                    f"Plant species '{plant.species.name}' is not allowed in tent '{tray.block.tent.name}'."
                )
        return attrs

    class Meta:
        model = TrayPlant
        fields = "__all__"


class BlockSerializer(serializers.ModelSerializer):
    def validate(self, attrs):
        experiment = attrs.get("experiment") or (self.instance.experiment if self.instance else None)
        tent = attrs.get("tent") or (self.instance.tent if self.instance else None)
        if experiment and tent and tent.experiment_id != experiment.id:
            raise serializers.ValidationError("Tent must belong to the same experiment as block.")
        return attrs

    class Meta:
        model = Block
        fields = "__all__"


class TentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tent
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
