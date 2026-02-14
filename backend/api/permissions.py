from rest_framework.permissions import BasePermission


class HasAppUserPermission(BasePermission):
    def has_permission(self, request, view):
        return getattr(request, "app_user", None) is not None
