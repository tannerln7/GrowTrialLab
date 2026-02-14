from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response


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
