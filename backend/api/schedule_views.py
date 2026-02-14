from __future__ import annotations

from uuid import UUID

from django.db import transaction
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Experiment, ScheduleAction, ScheduleRule, ScheduleScope
from .schedules import (
    action_blockers,
    build_scope_context,
    normalize_weekdays,
    plan_for_experiment,
    scope_label,
    validate_scope_membership,
)
from .serializers import (
    ScheduleActionCreateSerializer,
    ScheduleActionUpdateSerializer,
)


def _require_app_user(request):
    app_user = getattr(request, "app_user", None)
    if app_user is None:
        return Response({"detail": "Not authenticated."}, status=403)
    return None


def _serialize_action(
    action: ScheduleAction,
    *,
    context,
    experiment: Experiment,
) -> dict:
    rule_rows = ScheduleRule.objects.filter(schedule_action=action).order_by("created_at", "id")
    rules = [
        {
            "id": str(rule.id),
            "rule_type": rule.rule_type,
            "interval_days": rule.interval_days,
            "weekdays": normalize_weekdays(rule.weekdays),
            "timeframe": rule.timeframe,
            "exact_time": rule.exact_time.strftime("%H:%M:%S") if rule.exact_time else None,
            "start_date": rule.start_date.isoformat() if rule.start_date else None,
            "end_date": rule.end_date.isoformat() if rule.end_date else None,
        }
        for rule in rule_rows
    ]
    scope_rows = ScheduleScope.objects.filter(schedule_action=action).order_by(
        "scope_type",
        "created_at",
        "id",
    )
    scopes = [
        {
            "id": str(scope.id),
            "scope_type": scope.scope_type,
            "scope_id": str(scope.scope_id),
            "label": scope_label(scope, context),
        }
        for scope in scope_rows
    ]
    return {
        "id": str(action.id),
        "experiment_id": str(action.experiment.id),
        "title": action.title,
        "action_type": action.action_type,
        "description": action.description,
        "enabled": action.enabled,
        "created_at": action.created_at.isoformat(),
        "updated_at": action.updated_at.isoformat(),
        "rules": rules,
        "scopes": scopes,
        "current_blockers": action_blockers(action, experiment, context),
    }


def _replace_rules(action: ScheduleAction, rules_payload: list[dict]) -> None:
    ScheduleRule.objects.filter(schedule_action=action).delete()
    for item in rules_payload:
        ScheduleRule.objects.create(
            schedule_action=action,
            rule_type=item["rule_type"],
            interval_days=item.get("interval_days"),
            weekdays=normalize_weekdays(item.get("weekdays")),
            timeframe=item["timeframe"],
            exact_time=item.get("exact_time"),
            start_date=item.get("start_date"),
            end_date=item.get("end_date"),
        )


def _replace_scopes(action: ScheduleAction, scopes_payload: list[dict]) -> None:
    ScheduleScope.objects.filter(schedule_action=action).delete()
    for item in scopes_payload:
        ScheduleScope.objects.create(
            schedule_action=action,
            scope_type=item["scope_type"],
            scope_id=item["scope_id"],
        )


def _validate_scopes_for_experiment(experiment: Experiment, scopes_payload: list[dict]) -> list[str]:
    errors: list[str] = []
    seen: set[tuple[str, str]] = set()
    for item in scopes_payload:
        scope_type = item["scope_type"]
        scope_id = item["scope_id"]
        dedupe_key = (scope_type, str(scope_id))
        if dedupe_key in seen:
            errors.append(f"Duplicate scope target: {scope_type} {scope_id}")
            continue
        seen.add(dedupe_key)
        if not validate_scope_membership(experiment, scope_type, scope_id):
            errors.append(f"Invalid scope target for experiment: {scope_type} {scope_id}")
    return errors


@api_view(["GET", "POST"])
def experiment_schedules(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = Experiment.objects.filter(id=experiment_id).first()
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    if request.method == "GET":
        actions = list(
            ScheduleAction.objects.filter(experiment=experiment)
            .select_related("experiment")
            .order_by("created_at", "id")
        )
        context = build_scope_context(experiment)
        return Response(
            {
                "schedules": [
                    _serialize_action(action, context=context, experiment=experiment) for action in actions
                ]
            }
        )

    serializer = ScheduleActionCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    errors = _validate_scopes_for_experiment(experiment, serializer.validated_data["scopes"])
    if errors:
        return Response({"detail": "Invalid scope targets.", "errors": errors}, status=400)

    with transaction.atomic():
        action = ScheduleAction.objects.create(
            experiment=experiment,
            title=serializer.validated_data["title"],
            action_type=serializer.validated_data["action_type"],
            description=serializer.validated_data.get("description", ""),
            enabled=serializer.validated_data.get("enabled", True),
        )
        _replace_rules(action, serializer.validated_data["rules"])
        _replace_scopes(action, serializer.validated_data["scopes"])

    action = ScheduleAction.objects.filter(id=action.id).select_related("experiment").get()
    context = build_scope_context(experiment)
    return Response(
        {
            "schedule": _serialize_action(action, context=context, experiment=experiment),
        },
        status=201,
    )


@api_view(["PATCH", "DELETE"])
def schedule_detail(request, schedule_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    action = (
        ScheduleAction.objects.filter(id=schedule_id)
        .select_related("experiment")
        .first()
    )
    if action is None:
        return Response({"detail": "Schedule not found."}, status=404)

    if request.method == "DELETE":
        if action.experiment.lifecycle_state == Experiment.LifecycleState.RUNNING:
            return Response(
                {"detail": "Schedules cannot be deleted while the experiment is running."},
                status=409,
            )
        action.delete()
        return Response(status=204)

    serializer = ScheduleActionUpdateSerializer(data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    if "scopes" in serializer.validated_data:
        errors = _validate_scopes_for_experiment(action.experiment, serializer.validated_data["scopes"])
        if errors:
            return Response({"detail": "Invalid scope targets.", "errors": errors}, status=400)

    with transaction.atomic():
        for field in ["title", "action_type", "description", "enabled"]:
            if field in serializer.validated_data:
                setattr(action, field, serializer.validated_data[field])
        action.save(update_fields=["title", "action_type", "description", "enabled", "updated_at"])

        if "rules" in serializer.validated_data:
            _replace_rules(action, serializer.validated_data["rules"])
        if "scopes" in serializer.validated_data:
            _replace_scopes(action, serializer.validated_data["scopes"])

    action = ScheduleAction.objects.filter(id=action.id).select_related("experiment").get()
    context = build_scope_context(action.experiment)
    return Response({"schedule": _serialize_action(action, context=context, experiment=action.experiment)})


@api_view(["GET"])
def experiment_schedule_plan(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = Experiment.objects.filter(id=experiment_id).first()
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    raw_days = request.query_params.get("days", "14")
    try:
        days = int(raw_days)
    except (TypeError, ValueError):
        return Response({"detail": "days must be an integer."}, status=400)
    plant_id = request.query_params.get("plant_id")
    payload = plan_for_experiment(experiment, days=days, plant_id=plant_id)
    return Response(payload)
