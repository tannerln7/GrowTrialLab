from __future__ import annotations

import logging

from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from api.contracts import list_envelope
from api.models import AppUser

logger = logging.getLogger(__name__)


@api_view(["GET"])
def healthz(_request):
    return Response({"status": "ok", "timestamp": timezone.now().isoformat()})


@api_view(["GET"])
def me(request):
    app_user = getattr(request, "app_user", None)
    if app_user is None:
        return Response({"detail": "Not authenticated."}, status=403)
    return Response(
        {
            "email": app_user.email,
            "role": app_user.role,
            "status": app_user.status,
        }
    )



def _serialize_user(app_user: AppUser):
    return {
        "id": app_user.pk,
        "email": app_user.email,
        "role": app_user.role,
        "status": app_user.status,
        "created_at": app_user.created_at.isoformat(),
        "last_seen_at": app_user.last_seen_at.isoformat() if app_user.last_seen_at else None,
    }



def _require_admin(request):
    app_user = getattr(request, "app_user", None)
    if app_user is None:
        return Response({"detail": "Not authenticated."}, status=403)
    if app_user.role != AppUser.Role.ADMIN:
        return Response({"detail": "Admin role required."}, status=403)
    return None


@api_view(["GET", "POST"])
def admin_users(request):
    rejection = _require_admin(request)
    if rejection:
        return rejection

    if request.method == "GET":
        users = AppUser.objects.order_by("id")
        return Response(list_envelope([_serialize_user(user) for user in users]))

    email = (request.data.get("email") or "").strip().lower()
    if not email:
        return Response({"detail": "Email is required."}, status=400)

    user, created = AppUser.objects.get_or_create(
        email=email,
        defaults={"role": AppUser.Role.USER, "status": AppUser.Status.ACTIVE},
    )
    if user.status != AppUser.Status.ACTIVE:
        user.status = AppUser.Status.ACTIVE
        user.save(update_fields=["status"])

    logger.info(
        "admin_invite actor=%s target=%s created=%s",
        request.app_user.email,
        user.email,
        created,
    )
    return Response(_serialize_user(user), status=201 if created else 200)


@api_view(["PATCH"])
def admin_user_update(request, user_id: int):
    rejection = _require_admin(request)
    if rejection:
        return rejection

    user = AppUser.objects.filter(id=user_id).first()
    if user is None:
        return Response({"detail": "User not found."}, status=404)

    desired_status = request.data.get("status")
    if desired_status is None and "disabled" in request.data:
        desired_status = (
            AppUser.Status.DISABLED if bool(request.data.get("disabled")) else AppUser.Status.ACTIVE
        )
    if desired_status not in {AppUser.Status.ACTIVE, AppUser.Status.DISABLED}:
        return Response({"detail": "status must be 'active' or 'disabled'."}, status=400)

    user.status = desired_status
    user.save(update_fields=["status"])

    logger.info(
        "admin_status_change actor=%s target=%s status=%s",
        request.app_user.email,
        user.email,
        desired_status,
    )
    return Response(_serialize_user(user))
