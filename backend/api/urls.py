from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import admin_user_update, admin_users, healthz, me
from .viewsets import (
    AdverseEventViewSet,
    BatchLotViewSet,
    BlockViewSet,
    ExperimentViewSet,
    FeedingEventViewSet,
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
    path("api/v1/", include(router.urls)),
    path("api/admin/users", admin_users, name="admin-users"),
    path("api/admin/users/<int:user_id>", admin_user_update, name="admin-user-update"),
]
