from rest_framework import serializers

from .models import (
    AdverseEvent,
    BatchLot,
    Block,
    Experiment,
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
