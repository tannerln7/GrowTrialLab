import logging
from uuid import UUID

from api.models import AppUser
from api.models import Block, Experiment, ExperimentSetupState
from api.serializers import (
    BlockSerializer,
    EnvironmentPacketSerializer,
    ExperimentSetupStateSerializer,
    SetupStateUpdateSerializer,
)
from api.setup_packets import (
    PACKET_ENVIRONMENT,
    PACKET_PLANTS,
    normalize_packet_ids,
    next_incomplete_packet,
)
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

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


def _require_app_user(request):
    app_user = getattr(request, "app_user", None)
    if app_user is None:
        return Response({"detail": "Not authenticated."}, status=403)
    return None


def _get_experiment(experiment_id: UUID):
    return Experiment.objects.filter(id=experiment_id).first()


def _get_or_create_setup_state(experiment: Experiment):
    return ExperimentSetupState.objects.get_or_create(
        experiment=experiment,
        defaults={"current_packet": PACKET_PLANTS},
    )[0]


def _ensure_default_blocks(experiment: Experiment):
    defaults = [
        ("B1", "Front-left position"),
        ("B2", "Front-right position"),
        ("B3", "Back-left position"),
        ("B4", "Back-right position"),
    ]
    created_count = 0
    for name, description in defaults:
        _, created = Block.objects.get_or_create(
            experiment=experiment,
            name=name,
            defaults={"description": description},
        )
        if created:
            created_count += 1
    return created_count


@api_view(["GET", "PATCH"])
def experiment_setup_state(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    setup_state = _get_or_create_setup_state(experiment)
    if request.method == "GET":
        serializer = ExperimentSetupStateSerializer(setup_state)
        return Response(serializer.data)

    serializer = SetupStateUpdateSerializer(data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    if "current_packet" in serializer.validated_data:
        setup_state.current_packet = serializer.validated_data["current_packet"]
    if "completed_packets" in serializer.validated_data:
        setup_state.completed_packets = normalize_packet_ids(
            serializer.validated_data["completed_packets"]
        )
        if setup_state.current_packet in setup_state.completed_packets:
            setup_state.current_packet = next_incomplete_packet(setup_state.completed_packets)
    setup_state.save()
    return Response(ExperimentSetupStateSerializer(setup_state).data)


@api_view(["PUT"])
def experiment_environment_packet(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    setup_state = _get_or_create_setup_state(experiment)
    serializer = EnvironmentPacketSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    payload = {
        "tent_name": serializer.validated_data.get("tent_name", ""),
        "light_schedule": serializer.validated_data.get("light_schedule", ""),
        "light_height_notes": serializer.validated_data.get("light_height_notes", ""),
        "ventilation_notes": serializer.validated_data.get("ventilation_notes", ""),
        "water_source": serializer.validated_data.get("water_source", ""),
        "run_in_days": serializer.validated_data.get("run_in_days", 14),
        "notes": serializer.validated_data.get("notes", ""),
    }
    setup_state.packet_data[PACKET_ENVIRONMENT] = payload
    setup_state.save(update_fields=["packet_data", "updated_at"])
    return Response({"packet": PACKET_ENVIRONMENT, "data": payload})


@api_view(["POST"])
def complete_environment_packet(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    setup_state = _get_or_create_setup_state(experiment)
    payload = setup_state.packet_data.get(PACKET_ENVIRONMENT)
    errors: list[str] = []
    if not isinstance(payload, dict):
        errors.append("Environment payload has not been saved yet.")
    else:
        if not str(payload.get("tent_name", "")).strip():
            errors.append("Environment field 'tent_name' is required.")
        if not str(payload.get("light_schedule", "")).strip():
            errors.append("Environment field 'light_schedule' is required.")

    block_count = Block.objects.filter(experiment=experiment).count()
    if block_count < 2:
        errors.append("At least 2 blocks are required before completing the Environments step.")

    if errors:
        return Response(
            {"detail": "Environments step cannot be completed.", "errors": errors},
            status=400,
        )

    completed = normalize_packet_ids([*setup_state.completed_packets, PACKET_ENVIRONMENT])
    setup_state.completed_packets = completed
    setup_state.current_packet = next_incomplete_packet(completed)
    setup_state.save(update_fields=["completed_packets", "current_packet", "updated_at"])
    return Response(ExperimentSetupStateSerializer(setup_state).data)


@api_view(["GET", "POST"])
def experiment_blocks(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    if request.method == "GET":
        serializer = BlockSerializer(Block.objects.filter(experiment=experiment).order_by("name"), many=True)
        return Response(serializer.data)

    serializer = BlockSerializer(data={**request.data, "experiment": str(experiment.id)})
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data, status=201)


@api_view(["POST"])
def experiment_blocks_defaults(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    created_count = _ensure_default_blocks(experiment)
    blocks = Block.objects.filter(experiment=experiment).order_by("name")
    serializer = BlockSerializer(blocks, many=True)
    return Response(
        {
            "created_count": created_count,
            "blocks": serializer.data,
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
        return Response([_serialize_user(user) for user in users])

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
