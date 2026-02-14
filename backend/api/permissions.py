from rest_framework.permissions import BasePermission


class HasAppUserPermission(BasePermission):
    def has_permission(self, request, view):
        return getattr(request, "app_user", None) is not None


class HasAdminAppUserPermission(BasePermission):
    def has_permission(self, request, view):
        app_user = getattr(request, "app_user", None)
        return bool(app_user and app_user.role == "admin")
