from django.urls import path

from .views import healthz, me

urlpatterns = [
    path("healthz", healthz, name="healthz"),
    path("api/me", me, name="me"),
]
