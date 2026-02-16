from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .baseline_views import (
    experiment_baseline_lock,
    experiment_baseline_queue,
    experiment_baseline_status,
    plant_baseline,
)
from .cockpit_views import plant_cockpit
from .feeding_views import experiment_feeding_queue, plant_feed, plant_feeding_recent
from .overview_views import experiment_overview_plants
from .placement_views import (
    experiment_placement_auto,
    experiment_placement_summary,
    experiment_trays,
    tray_add_plant,
    tray_remove_plant,
)
from .plants_views import (
    experiment_plants,
    experiment_plants_bulk_import,
    experiment_plants_generate_ids,
    experiment_plants_labels_pdf,
    plant_replace,
)
from .recipes_views import experiment_recipes, recipe_detail
from .rotation_views import experiment_rotation_log, experiment_rotation_summary
from .schedule_views import experiment_schedule_plan, experiment_schedules, schedule_detail
from .status_views import experiment_start, experiment_status_summary, experiment_stop
from .tents_views import (
    experiment_tents,
    slot_detail,
    tent_detail,
    tent_slots,
    tent_slots_generate,
)
from .views import admin_user_update, admin_users, healthz, me
from .viewsets import (
    AdverseEventViewSet,
    BatchLotViewSet,
    ExperimentViewSet,
    FeedingEventViewSet,
    MetricTemplateViewSet,
    PhotoViewSet,
    PlantViewSet,
    PlantWeeklyMetricViewSet,
    RecipeViewSet,
    RotationLogViewSet,
    SlotViewSet,
    SpeciesViewSet,
    TrayPlantViewSet,
    TrayViewSet,
    WeeklySessionViewSet,
)

router = DefaultRouter()
router.register("species", SpeciesViewSet, basename="species")
router.register("metric-templates", MetricTemplateViewSet, basename="metric-templates")
router.register("experiments", ExperimentViewSet, basename="experiments")
router.register("recipes", RecipeViewSet, basename="recipes")
router.register("lots", BatchLotViewSet, basename="lots")
router.register("plants", PlantViewSet, basename="plants")
router.register("trays", TrayViewSet, basename="trays")
router.register("tray-plants", TrayPlantViewSet, basename="tray-plants")
router.register("slots", SlotViewSet, basename="slots")
router.register("rotation-logs", RotationLogViewSet, basename="rotation-logs")
router.register("weekly-sessions", WeeklySessionViewSet, basename="weekly-sessions")
router.register("plant-weekly-metrics", PlantWeeklyMetricViewSet, basename="plant-weekly-metrics")
router.register("feeding-events", FeedingEventViewSet, basename="feeding-events")
router.register("adverse-events", AdverseEventViewSet, basename="adverse-events")
router.register("photos", PhotoViewSet, basename="photos")

urlpatterns = [
    path("healthz", healthz, name="healthz"),
    path("api/me", me, name="me"),
    path(
        "api/v1/experiments/<uuid:experiment_id>/tents",
        experiment_tents,
        name="experiment-tents",
    ),
    path(
        "api/v1/tents/<uuid:tent_id>",
        tent_detail,
        name="tent-detail",
    ),
    path(
        "api/v1/tents/<uuid:tent_id>/slots",
        tent_slots,
        name="tent-slots",
    ),
    path(
        "api/v1/tents/<uuid:tent_id>/slots/generate",
        tent_slots_generate,
        name="tent-slots-generate",
    ),
    path(
        "api/v1/slots/<uuid:slot_id>",
        slot_detail,
        name="slot-detail",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/recipes",
        experiment_recipes,
        name="experiment-recipes",
    ),
    path(
        "api/v1/recipes/<uuid:recipe_id>",
        recipe_detail,
        name="recipe-detail",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/plants/",
        experiment_plants,
        name="experiment-plants",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/plants/bulk-import/",
        experiment_plants_bulk_import,
        name="experiment-plants-bulk-import",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/plants/generate-ids/",
        experiment_plants_generate_ids,
        name="experiment-plants-generate-ids",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/plants/labels.pdf",
        experiment_plants_labels_pdf,
        name="experiment-plants-labels-pdf",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/baseline/status",
        experiment_baseline_status,
        name="experiment-baseline-status",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/baseline/queue",
        experiment_baseline_queue,
        name="experiment-baseline-queue",
    ),
    path(
        "api/v1/plants/<uuid:plant_id>/baseline",
        plant_baseline,
        name="plant-baseline",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/baseline/lock",
        experiment_baseline_lock,
        name="experiment-baseline-lock",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/feeding/queue",
        experiment_feeding_queue,
        name="experiment-feeding-queue",
    ),
    path(
        "api/v1/plants/<uuid:plant_id>/feed",
        plant_feed,
        name="plant-feed",
    ),
    path(
        "api/v1/plants/<uuid:plant_id>/feeding/recent",
        plant_feeding_recent,
        name="plant-feeding-recent",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/overview/plants",
        experiment_overview_plants,
        name="experiment-overview-plants",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/placement/summary",
        experiment_placement_summary,
        name="experiment-placement-summary",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/placement/auto",
        experiment_placement_auto,
        name="experiment-placement-auto",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/trays",
        experiment_trays,
        name="experiment-trays",
    ),
    path(
        "api/v1/trays/<uuid:tray_id>/plants",
        tray_add_plant,
        name="tray-add-plant",
    ),
    path(
        "api/v1/trays/<uuid:tray_id>/plants/<uuid:tray_plant_id>",
        tray_remove_plant,
        name="tray-remove-plant",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/rotation/summary",
        experiment_rotation_summary,
        name="experiment-rotation-summary",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/rotation/log",
        experiment_rotation_log,
        name="experiment-rotation-log",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/schedules",
        experiment_schedules,
        name="experiment-schedules",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/schedules/plan",
        experiment_schedule_plan,
        name="experiment-schedules-plan",
    ),
    path(
        "api/v1/schedules/<uuid:schedule_id>",
        schedule_detail,
        name="schedule-detail",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/status/summary",
        experiment_status_summary,
        name="experiment-status-summary",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/start",
        experiment_start,
        name="experiment-start",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/stop",
        experiment_stop,
        name="experiment-stop",
    ),
    path(
        "api/v1/plants/<uuid:plant_id>/cockpit",
        plant_cockpit,
        name="plant-cockpit",
    ),
    path(
        "api/v1/plants/<uuid:plant_id>/replace",
        plant_replace,
        name="plant-replace",
    ),
    path("api/v1/", include(router.urls)),
    path("api/admin/users", admin_users, name="admin-users"),
    path("api/admin/users/<int:user_id>", admin_user_update, name="admin-user-update"),
]
