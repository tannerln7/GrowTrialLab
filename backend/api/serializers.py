from __future__ import annotations

from rest_framework import serializers

from .models import (
    AdverseEvent,
    BatchLot,
    Experiment,
    FeedingEvent,
    MetricTemplate,
    Photo,
    Plant,
    PlantWeeklyMetric,
    Recipe,
    RotationLog,
    ScheduleAction,
    ScheduleRule,
    ScheduleScope,
    Slot,
    Species,
    Tent,
    Tray,
    TrayPlant,
    WeeklySession,
)
from .tent_restrictions import first_disallowed_plant, tent_allows_species


class SpeciesSerializer(serializers.ModelSerializer):
    class Meta:
        model = Species
        fields = "__all__"


class ExperimentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Experiment
        fields = "__all__"


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
            "grade",
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
            "grade",
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


class PlantBaselineSaveSerializer(serializers.Serializer):
    metrics = serializers.JSONField(required=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    grade = serializers.ChoiceField(choices=Plant.Grade.choices, required=False)


class PlantReplaceSerializer(serializers.Serializer):
    new_plant_id = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    copy_identity_fields = serializers.BooleanField(required=False, default=True)
    inherit_assignment = serializers.BooleanField(required=False, default=True)
    inherit_grade = serializers.BooleanField(required=False, default=False)
    mark_original_removed = serializers.BooleanField(required=False, default=True)
    removed_reason = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    removed_at = serializers.DateTimeField(required=False, allow_null=True)


class ScheduleRuleInputSerializer(serializers.Serializer):
    rule_type = serializers.ChoiceField(choices=ScheduleRule.RuleType.choices)
    interval_days = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    weekdays = serializers.ListField(
        child=serializers.ChoiceField(
            choices=["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
        ),
        required=False,
        allow_empty=True,
    )
    timeframe = serializers.ChoiceField(choices=ScheduleRule.Timeframe.choices)
    exact_time = serializers.TimeField(required=False, allow_null=True)
    start_date = serializers.DateField(required=False, allow_null=True)
    end_date = serializers.DateField(required=False, allow_null=True)

    def validate(self, attrs):
        rule_type = attrs.get("rule_type")
        interval_days = attrs.get("interval_days")
        weekdays = attrs.get("weekdays", [])
        start_date = attrs.get("start_date")
        end_date = attrs.get("end_date")

        if rule_type == ScheduleRule.RuleType.WEEKLY and not weekdays:
            raise serializers.ValidationError("weekdays is required for WEEKLY rules.")
        if rule_type == ScheduleRule.RuleType.CUSTOM_DAYS_INTERVAL and not interval_days:
            raise serializers.ValidationError("interval_days is required for CUSTOM_DAYS_INTERVAL rules.")
        if rule_type in {ScheduleRule.RuleType.DAILY, ScheduleRule.RuleType.WEEKLY}:
            attrs["interval_days"] = None
        if rule_type != ScheduleRule.RuleType.WEEKLY:
            attrs["weekdays"] = []
        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError("end_date must be on or after start_date.")
        return attrs


class ScheduleScopeInputSerializer(serializers.Serializer):
    scope_type = serializers.ChoiceField(choices=ScheduleScope.ScopeType.choices)
    scope_id = serializers.UUIDField()


class ScheduleActionCreateSerializer(serializers.Serializer):
    title = serializers.CharField(required=True, allow_blank=False, max_length=255)
    action_type = serializers.ChoiceField(choices=ScheduleAction.ActionType.choices)
    description = serializers.CharField(required=False, allow_blank=True)
    enabled = serializers.BooleanField(required=False, default=True)
    rules = ScheduleRuleInputSerializer(many=True)
    scopes = ScheduleScopeInputSerializer(many=True)

    def validate(self, attrs):
        if len(attrs.get("rules", [])) == 0:
            raise serializers.ValidationError("rules cannot be empty.")
        if len(attrs.get("scopes", [])) == 0:
            raise serializers.ValidationError("scopes cannot be empty.")
        return attrs


class ScheduleActionUpdateSerializer(serializers.Serializer):
    title = serializers.CharField(required=False, allow_blank=False, max_length=255)
    action_type = serializers.ChoiceField(choices=ScheduleAction.ActionType.choices, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    enabled = serializers.BooleanField(required=False)
    rules = ScheduleRuleInputSerializer(many=True, required=False)
    scopes = ScheduleScopeInputSerializer(many=True, required=False)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("At least one field is required.")
        if "rules" in attrs and len(attrs["rules"]) == 0:
            raise serializers.ValidationError("rules cannot be empty.")
        if "scopes" in attrs and len(attrs["scopes"]) == 0:
            raise serializers.ValidationError("scopes cannot be empty.")
        return attrs


class MetricTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MetricTemplate
        fields = "__all__"


class TraySerializer(serializers.ModelSerializer):
    def to_internal_value(self, data):
        if isinstance(data, dict):
            mutable = dict(data)
            if "slot" not in mutable and "slot_id" in mutable:
                mutable["slot"] = mutable.get("slot_id")
            data = mutable
        return super().to_internal_value(data)

    def validate(self, attrs):
        experiment = attrs.get("experiment") or (self.instance.experiment if self.instance else None)
        slot = attrs.get("slot") if "slot" in attrs else (self.instance.slot if self.instance else None)
        assigned_recipe = attrs.get("assigned_recipe") if "assigned_recipe" in attrs else (
            self.instance.assigned_recipe if self.instance else None
        )
        capacity = attrs.get("capacity")
        if capacity is None and self.instance is not None:
            capacity = self.instance.capacity
        if capacity is not None and capacity < 1:
            raise serializers.ValidationError("capacity must be at least 1.")
        if experiment and slot and slot.tent.experiment_id != experiment.id:
            raise serializers.ValidationError("Slot must belong to the same experiment as tray.")
        if experiment and assigned_recipe and assigned_recipe.experiment_id != experiment.id:
            raise serializers.ValidationError("Recipe must belong to the same experiment as tray.")
        if self.instance is not None:
            current_count = self.instance.tray_plants.count()
            if capacity is not None and current_count > capacity:
                raise serializers.ValidationError(
                    f"Tray currently has {current_count} plants; capacity cannot be set below that."
                )
            if slot and slot.tent:
                tray_plants = list(self.instance.tray_plants.select_related("plant__species").all())
                violating = first_disallowed_plant(slot.tent, [item.plant for item in tray_plants])
                if violating:
                    raise serializers.ValidationError(
                        (
                            f"Tray move blocked: tent '{slot.tent.name}' does not allow "
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
            if plant and tray.slot and tray.slot.tent and not tent_allows_species(tray.slot.tent, plant.species_id):
                raise serializers.ValidationError(
                    f"Plant species '{plant.species.name}' is not allowed in tent '{tray.slot.tent.name}'."
                )
        return attrs

    class Meta:
        model = TrayPlant
        fields = "__all__"


class SlotSerializer(serializers.ModelSerializer):
    class Meta:
        model = Slot
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
