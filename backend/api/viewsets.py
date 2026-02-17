from __future__ import annotations

from rest_framework import viewsets
from rest_framework.response import Response

from .contracts import error_with_diagnostics
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
    Slot,
    Species,
    Tray,
    TrayPlant,
    WeeklySession,
)
from .permissions import HasAdminAppUserPermission, HasAppUserPermission
from .serializers import (
    AdverseEventSerializer,
    BatchLotSerializer,
    ExperimentSerializer,
    FeedingEventSerializer,
    MetricTemplateSerializer,
    PhotoSerializer,
    PlantDetailSerializer,
    PlantSerializer,
    PlantWeeklyMetricSerializer,
    RecipeSerializer,
    RotationLogSerializer,
    SlotSerializer,
    SpeciesSerializer,
    TrayPlantSerializer,
    TraySerializer,
    WeeklySessionSerializer,
)

PLACEMENT_LOCK_MESSAGE = (
    "Placement cannot be edited while the experiment is running. Stop the experiment to change placement."
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

    def _resolve_requested_recipe(self, plant: Plant):
        has_assigned_recipe = "assigned_recipe" in self.request.data
        has_assigned_recipe_id = "assigned_recipe_id" in self.request.data
        if not has_assigned_recipe and not has_assigned_recipe_id:
            return None, None

        raw_recipe_id = self.request.data.get("assigned_recipe")
        if not has_assigned_recipe:
            raw_recipe_id = self.request.data.get("assigned_recipe_id")

        if raw_recipe_id in {None, ""}:
            return None, None

        recipe = Recipe.objects.filter(id=raw_recipe_id).select_related("experiment").first()
        if recipe is None:
            return None, error_with_diagnostics(
                "Recipe not found.",
                status_code=400,
                diagnostics={"reason_counts": {"recipe_not_found": 1}},
            )
        if recipe.experiment.id != plant.experiment.id:
            return None, error_with_diagnostics(
                "Recipe must belong to the same experiment as plant.",
                status_code=400,
                diagnostics={"reason_counts": {"recipe_experiment_mismatch": 1}},
            )
        return recipe, None

    def update(self, request, *args, **kwargs):
        plant = self.get_object()
        _, validation_response = self._resolve_requested_recipe(plant)
        if validation_response is not None:
            return validation_response
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        plant = self.get_object()
        recipe, validation_response = self._resolve_requested_recipe(plant)
        if validation_response is not None:
            return validation_response
        if "assigned_recipe" in request.data or "assigned_recipe_id" in request.data:
            plant.assigned_recipe = recipe
            plant.save(update_fields=["assigned_recipe", "updated_at"])
            serializer = self.get_serializer(plant)
            return Response(serializer.data)
        return super().partial_update(request, *args, **kwargs)


class TrayViewSet(ExperimentFilteredViewSet):
    queryset = Tray.objects.all().order_by("name")
    serializer_class = TraySerializer

    def _placement_locked(self, tray: Tray) -> bool:
        return tray.experiment.lifecycle_state == Experiment.LifecycleState.RUNNING

    def _slot_conflict_response(self, tray: Tray):
        requested_slot = self.request.data.get("slot")
        if requested_slot is None:
            requested_slot = self.request.data.get("slot_id")
        if requested_slot in {None, ""}:
            return None
        slot = Slot.objects.filter(id=requested_slot, tent__experiment=tray.experiment).first()
        if slot is None:
            return None
        conflict_exists = (
            Tray.objects.filter(experiment=tray.experiment, slot=slot)
            .exclude(id=tray.id)
            .exists()
        )
        if conflict_exists:
            return error_with_diagnostics(
                "Slot already has a tray. Each slot can contain only one tray.",
                diagnostics={"reason_counts": {"slot_occupied": 1}, "slot_id": str(slot.id)},
            )
        return None

    def update(self, request, *args, **kwargs):
        tray = self.get_object()
        if self._placement_locked(tray):
            return error_with_diagnostics(
                PLACEMENT_LOCK_MESSAGE,
                diagnostics={"reason_counts": {"running": 1}},
            )
        conflict_response = self._slot_conflict_response(tray)
        if conflict_response is not None:
            return conflict_response
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        tray = self.get_object()
        if self._placement_locked(tray):
            return error_with_diagnostics(
                PLACEMENT_LOCK_MESSAGE,
                diagnostics={"reason_counts": {"running": 1}},
            )
        conflict_response = self._slot_conflict_response(tray)
        if conflict_response is not None:
            return conflict_response
        return super().partial_update(request, *args, **kwargs)


class TrayPlantViewSet(ExperimentFilteredViewSet):
    queryset = TrayPlant.objects.all().order_by("tray_id", "order_index")
    serializer_class = TrayPlantSerializer
    experiment_filter_field = "tray__experiment_id"


class SlotViewSet(ExperimentFilteredViewSet):
    queryset = Slot.objects.all().order_by("tent_id", "shelf_index", "slot_index")
    serializer_class = SlotSerializer
    experiment_filter_field = "tent__experiment_id"

    def destroy(self, request, *args, **kwargs):
        slot = self.get_object()
        if Tray.objects.filter(slot=slot).exists():
            return error_with_diagnostics(
                "Slot cannot be deleted while trays are placed in it.",
                diagnostics={"reason_counts": {"slot_occupied": 1}, "slot_id": str(slot.id)},
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
