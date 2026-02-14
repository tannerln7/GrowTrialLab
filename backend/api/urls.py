from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .plants_views import (
    complete_plants_packet,
    experiment_plants,
    experiment_plants_bulk_import,
    experiment_plants_generate_ids,
    experiment_plants_labels_pdf,
    experiment_plants_packet,
    plant_replace,
)
from .cockpit_views import plant_cockpit
from .groups_views import (
    complete_groups_packet,
    experiment_groups_apply,
    experiment_groups_packet,
    experiment_groups_preview,
    experiment_groups_recipe_update,
    experiment_groups_recipes,
    experiment_groups_status,
)
from .status_views import experiment_start, experiment_status_summary, experiment_stop
from .overview_views import experiment_overview_plants
from .placement_views import (
    experiment_placement_auto,
    experiment_placement_summary,
    experiment_trays,
    tray_add_plant,
    tray_remove_plant,
)
from .tents_views import (
    experiment_tents,
    tent_blocks,
    tent_blocks_defaults,
    tent_detail,
)
from .rotation_views import experiment_rotation_log, experiment_rotation_summary
from .baseline_views import (
    complete_baseline_packet,
    experiment_baseline_lock,
    experiment_baseline_packet,
    experiment_baseline_queue,
    experiment_baseline_status,
    plant_baseline,
)
from .feeding_views import experiment_feeding_queue, plant_feed, plant_feeding_recent
from .views import (
    admin_user_update,
    admin_users,
    complete_environment_packet,
    experiment_blocks,
    experiment_blocks_defaults,
    experiment_environment_packet,
    experiment_setup_state,
    healthz,
    me,
)
from .viewsets import (
    AdverseEventViewSet,
    BatchLotViewSet,
    BlockViewSet,
    ExperimentViewSet,
    FeedingEventViewSet,
    MetricTemplateViewSet,
    PhotoViewSet,
    PlantViewSet,
    PlantWeeklyMetricViewSet,
    RecipeViewSet,
    RotationLogViewSet,
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
router.register("blocks", BlockViewSet, basename="blocks")
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
        "api/v1/experiments/<uuid:experiment_id>/setup-state/",
        experiment_setup_state,
        name="experiment-setup-state",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/packets/environment/",
        experiment_environment_packet,
        name="experiment-environment-packet",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/packets/environment/complete/",
        complete_environment_packet,
        name="complete-environment-packet",
    ),
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
        "api/v1/tents/<uuid:tent_id>/blocks",
        tent_blocks,
        name="tent-blocks",
    ),
    path(
        "api/v1/tents/<uuid:tent_id>/blocks/defaults",
        tent_blocks_defaults,
        name="tent-blocks-defaults",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/blocks/",
        experiment_blocks,
        name="experiment-blocks",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/blocks/defaults",
        experiment_blocks_defaults,
        name="experiment-blocks-defaults",
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
        "api/v1/experiments/<uuid:experiment_id>/packets/plants/",
        experiment_plants_packet,
        name="experiment-plants-packet",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/packets/plants/complete/",
        complete_plants_packet,
        name="complete-plants-packet",
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
        "api/v1/experiments/<uuid:experiment_id>/feeding/queue",
        experiment_feeding_queue,
        name="experiment-feeding-queue",
    ),
    path(
        "api/v1/plants/<uuid:plant_id>/baseline",
        plant_baseline,
        name="plant-baseline",
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
        "api/v1/experiments/<uuid:experiment_id>/baseline/lock",
        experiment_baseline_lock,
        name="experiment-baseline-lock",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/packets/baseline/",
        experiment_baseline_packet,
        name="experiment-baseline-packet",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/packets/baseline/complete/",
        complete_baseline_packet,
        name="complete-baseline-packet",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/groups/status",
        experiment_groups_status,
        name="experiment-groups-status",
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
        "api/v1/experiments/<uuid:experiment_id>/trays",
        experiment_trays,
        name="experiment-trays",
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
    path(
        "api/v1/experiments/<uuid:experiment_id>/groups/recipes",
        experiment_groups_recipes,
        name="experiment-groups-recipes",
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
        "api/v1/experiments/<uuid:experiment_id>/groups/recipes/<uuid:recipe_id>",
        experiment_groups_recipe_update,
        name="experiment-groups-recipe-update",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/groups/preview",
        experiment_groups_preview,
        name="experiment-groups-preview",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/groups/apply",
        experiment_groups_apply,
        name="experiment-groups-apply",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/packets/groups/",
        experiment_groups_packet,
        name="experiment-groups-packet",
    ),
    path(
        "api/v1/experiments/<uuid:experiment_id>/packets/groups/complete/",
        complete_groups_packet,
        name="complete-groups-packet",
    ),
    path("api/v1/", include(router.urls)),
    path("api/admin/users", admin_users, name="admin-users"),
    path("api/admin/users/<int:user_id>", admin_user_update, name="admin-user-update"),
]
