from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied

from .baseline import BASELINE_WEEK_NUMBER, is_baseline_locked, is_unlock_request
from .models import (
    AdverseEvent,
    BatchLot,
    Block,
    Experiment,
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
from .permissions import HasAdminAppUserPermission, HasAppUserPermission
from .serializers import (
    AdverseEventSerializer,
    BatchLotSerializer,
    BlockSerializer,
    ExperimentSerializer,
    FeedingEventSerializer,
    MetricTemplateSerializer,
    PhotoSerializer,
    PlantDetailSerializer,
    PlantSerializer,
    PlantWeeklyMetricSerializer,
    RecipeSerializer,
    RotationLogSerializer,
    SpeciesSerializer,
    TrayPlantSerializer,
    TraySerializer,
    WeeklySessionSerializer,
)


class ExperimentFilteredViewSet(viewsets.ModelViewSet):
    permission_classes = [HasAppUserPermission]
    experiment_filter_field = "experiment_id"

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == "list" and self.experiment_filter_field:
            experiment_id = self.request.query_params.get("experiment")
            if experiment_id:
                queryset = queryset.filter(**{self.experiment_filter_field: experiment_id})
        return queryset


class SpeciesViewSet(ExperimentFilteredViewSet):
    queryset = Species.objects.all().order_by("name")
    serializer_class = SpeciesSerializer
    experiment_filter_field = None


class MetricTemplateViewSet(viewsets.ModelViewSet):
    queryset = MetricTemplate.objects.all().order_by("category", "-version", "-created_at")
    serializer_class = MetricTemplateSerializer
    permission_classes = [HasAppUserPermission]

    def get_queryset(self):
        queryset = super().get_queryset()
        category = (self.request.query_params.get("category") or "").strip().lower()
        if category:
            queryset = queryset.filter(category=category)
        return queryset

    def get_permissions(self):
        if self.action in {"create", "update", "partial_update", "destroy"}:
            return [HasAdminAppUserPermission()]
        return [HasAppUserPermission()]


class ExperimentViewSet(ExperimentFilteredViewSet):
    queryset = Experiment.objects.all().order_by("-created_at")
    serializer_class = ExperimentSerializer
    experiment_filter_field = "id"


class RecipeViewSet(ExperimentFilteredViewSet):
    queryset = Recipe.objects.all().order_by("code")
    serializer_class = RecipeSerializer


class BatchLotViewSet(ExperimentFilteredViewSet):
    queryset = BatchLot.objects.all().order_by("-created_at")
    serializer_class = BatchLotSerializer


class PlantViewSet(ExperimentFilteredViewSet):
    queryset = Plant.objects.all().order_by("plant_id")
    serializer_class = PlantSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == "retrieve":
            queryset = queryset.select_related("species", "experiment")
        return queryset

    def get_serializer_class(self):
        if self.action == "retrieve":
            return PlantDetailSerializer
        return super().get_serializer_class()

    def perform_update(self, serializer):
        instance = serializer.instance
        new_bin = serializer.validated_data.get("bin")
        bin_change_requested = "bin" in serializer.validated_data and new_bin != instance.bin
        if (
            bin_change_requested
            and is_baseline_locked(instance.experiment)
            and not is_unlock_request(self.request)
        ):
            raise PermissionDenied("Baseline is locked. Admin unlock is required.")
        serializer.save()


class TrayViewSet(ExperimentFilteredViewSet):
    queryset = Tray.objects.all().order_by("name")
    serializer_class = TraySerializer


class TrayPlantViewSet(ExperimentFilteredViewSet):
    queryset = TrayPlant.objects.all().order_by("tray_id", "order_index")
    serializer_class = TrayPlantSerializer
    experiment_filter_field = "tray__experiment_id"


class BlockViewSet(ExperimentFilteredViewSet):
    queryset = Block.objects.all().order_by("name")
    serializer_class = BlockSerializer


class RotationLogViewSet(ExperimentFilteredViewSet):
    queryset = RotationLog.objects.all().order_by("week_number", "tray_id")
    serializer_class = RotationLogSerializer


class WeeklySessionViewSet(ExperimentFilteredViewSet):
    queryset = WeeklySession.objects.all().order_by("week_number")
    serializer_class = WeeklySessionSerializer


class PlantWeeklyMetricViewSet(ExperimentFilteredViewSet):
    queryset = PlantWeeklyMetric.objects.all().order_by("week_number", "plant_id")
    serializer_class = PlantWeeklyMetricSerializer

    def _assert_unlocked(self, experiment, week_number):
        if week_number == BASELINE_WEEK_NUMBER and is_baseline_locked(experiment) and not is_unlock_request(
            self.request
        ):
            raise PermissionDenied("Baseline is locked. Admin unlock is required.")

    def perform_create(self, serializer):
        experiment = serializer.validated_data["experiment"]
        week_number = serializer.validated_data.get("week_number")
        self._assert_unlocked(experiment, week_number)
        serializer.save()

    def perform_update(self, serializer):
        instance = serializer.instance
        experiment = serializer.validated_data.get("experiment", instance.experiment)
        week_number = serializer.validated_data.get("week_number", instance.week_number)
        self._assert_unlocked(experiment, week_number)
        serializer.save()


class FeedingEventViewSet(ExperimentFilteredViewSet):
    queryset = FeedingEvent.objects.all().order_by("-recorded_at")
    serializer_class = FeedingEventSerializer


class AdverseEventViewSet(ExperimentFilteredViewSet):
    queryset = AdverseEvent.objects.all().order_by("-recorded_at")
    serializer_class = AdverseEventSerializer


class PhotoViewSet(ExperimentFilteredViewSet):
    queryset = Photo.objects.all().order_by("-created_at")
    serializer_class = PhotoSerializer
