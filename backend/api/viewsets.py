from rest_framework import status, viewsets
from rest_framework.response import Response

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
            queryset = queryset.select_related("species", "experiment", "assigned_recipe")
        return queryset

    def get_serializer_class(self):
        if self.action == "retrieve":
            return PlantDetailSerializer
        return super().get_serializer_class()

class TrayViewSet(ExperimentFilteredViewSet):
    queryset = Tray.objects.all().order_by("name")
    serializer_class = TraySerializer

    def _placement_locked(self, tray: Tray) -> bool:
        return tray.experiment.lifecycle_state == Experiment.LifecycleState.RUNNING

    def _block_conflict_response(self, tray: Tray):
        requested_block = self.request.data.get("block")
        if requested_block is None:
            requested_block = self.request.data.get("block_id")
        if requested_block in {None, ""}:
            return None
        block = Block.objects.filter(id=requested_block, tent__experiment=tray.experiment).first()
        if block is None:
            return None
        conflict_exists = (
            Tray.objects.filter(experiment=tray.experiment, block=block)
            .exclude(id=tray.id)
            .exists()
        )
        if conflict_exists:
            return Response(
                {"detail": "Block already has a tray. Each block can contain only one tray."},
                status=status.HTTP_409_CONFLICT,
            )
        return None

    def update(self, request, *args, **kwargs):
        tray = self.get_object()
        if self._placement_locked(tray):
            return Response(
                {
                    "detail": "Placement cannot be edited while the experiment is running. Stop the experiment to change placement."
                },
                status=status.HTTP_409_CONFLICT,
            )
        conflict_response = self._block_conflict_response(tray)
        if conflict_response is not None:
            return conflict_response
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        tray = self.get_object()
        if self._placement_locked(tray):
            return Response(
                {
                    "detail": "Placement cannot be edited while the experiment is running. Stop the experiment to change placement."
                },
                status=status.HTTP_409_CONFLICT,
            )
        conflict_response = self._block_conflict_response(tray)
        if conflict_response is not None:
            return conflict_response
        return super().partial_update(request, *args, **kwargs)


class TrayPlantViewSet(ExperimentFilteredViewSet):
    queryset = TrayPlant.objects.all().order_by("tray_id", "order_index")
    serializer_class = TrayPlantSerializer
    experiment_filter_field = "tray__experiment_id"


class BlockViewSet(ExperimentFilteredViewSet):
    queryset = Block.objects.all().order_by("name")
    serializer_class = BlockSerializer

    def destroy(self, request, *args, **kwargs):
        block = self.get_object()
        if Tray.objects.filter(block=block).exists():
            return Response(
                {"detail": "Block cannot be deleted while trays are placed in it."},
                status=status.HTTP_409_CONFLICT,
            )
        return super().destroy(request, *args, **kwargs)


class RotationLogViewSet(ExperimentFilteredViewSet):
    queryset = RotationLog.objects.all().order_by("-occurred_at", "tray_id")
    serializer_class = RotationLogSerializer


class WeeklySessionViewSet(ExperimentFilteredViewSet):
    queryset = WeeklySession.objects.all().order_by("week_number")
    serializer_class = WeeklySessionSerializer


class PlantWeeklyMetricViewSet(ExperimentFilteredViewSet):
    queryset = PlantWeeklyMetric.objects.all().order_by("week_number", "plant_id")
    serializer_class = PlantWeeklyMetricSerializer


class FeedingEventViewSet(ExperimentFilteredViewSet):
    queryset = FeedingEvent.objects.all().order_by("-recorded_at")
    serializer_class = FeedingEventSerializer


class AdverseEventViewSet(ExperimentFilteredViewSet):
    queryset = AdverseEvent.objects.all().order_by("-recorded_at")
    serializer_class = AdverseEventSerializer


class PhotoViewSet(ExperimentFilteredViewSet):
    queryset = Photo.objects.all().order_by("-created_at")
    serializer_class = PhotoSerializer
