from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from rest_framework.exceptions import ValidationError

from .models import Experiment, MetricTemplate

BASELINE_WEEK_NUMBER = 0


@dataclass
class TemplateField:
    key: str
    type: str
    required: bool
    minimum: float | None = None
    maximum: float | None = None


def get_metric_template_for_category(category: str | None) -> MetricTemplate | None:
    normalized_category = (category or "").strip().lower()
    if not normalized_category:
        return None
    return (
        MetricTemplate.objects.filter(category=normalized_category)
        .order_by("-version", "-created_at")
        .first()
    )


def parse_template_fields(raw_fields: Any) -> dict[str, TemplateField]:
    if not isinstance(raw_fields, list):
        raise ValidationError("Metric template fields must be a list.")

    parsed: dict[str, TemplateField] = {}
    for index, raw_field in enumerate(raw_fields):
        if not isinstance(raw_field, dict):
            raise ValidationError(f"Metric template field #{index + 1} must be an object.")

        key = str(raw_field.get("key", "")).strip()
        field_type = str(raw_field.get("type", "")).strip().lower()
        if not key:
            raise ValidationError(f"Metric template field #{index + 1} is missing key.")
        if field_type not in {"int", "float", "text", "bool"}:
            raise ValidationError(
                f"Metric template field '{key}' has unsupported type '{field_type}'."
            )

        parsed[key] = TemplateField(
            key=key,
            type=field_type,
            required=bool(raw_field.get("required", False)),
            minimum=raw_field.get("min"),
            maximum=raw_field.get("max"),
        )
    return parsed


def validate_metrics_against_template(metrics: Any, template: MetricTemplate | None) -> None:
    if not isinstance(metrics, dict):
        raise ValidationError({"metrics": ["Metrics must be an object."]})

    if template is None:
        return

    fields = parse_template_fields(template.fields)
    errors: list[str] = []

    for key, definition in fields.items():
        value = metrics.get(key)
        if definition.required and (value is None or (isinstance(value, str) and not value.strip())):
            errors.append(f"{key} is required.")
            continue

        if value is None:
            continue

        if definition.type == "int":
            if isinstance(value, bool) or not isinstance(value, int):
                errors.append(f"{key} must be an integer.")
                continue
            if definition.minimum is not None and value < definition.minimum:
                errors.append(f"{key} must be >= {definition.minimum}.")
            if definition.maximum is not None and value > definition.maximum:
                errors.append(f"{key} must be <= {definition.maximum}.")

        elif definition.type == "float":
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                errors.append(f"{key} must be a number.")
                continue
            numeric_value = float(value)
            if definition.minimum is not None and numeric_value < definition.minimum:
                errors.append(f"{key} must be >= {definition.minimum}.")
            if definition.maximum is not None and numeric_value > definition.maximum:
                errors.append(f"{key} must be <= {definition.maximum}.")

        elif definition.type == "text":
            if not isinstance(value, str):
                errors.append(f"{key} must be text.")

        elif definition.type == "bool":
            if not isinstance(value, bool):
                errors.append(f"{key} must be true or false.")

    unknown_keys = sorted(set(metrics.keys()) - set(fields.keys()))
    for key in unknown_keys:
        errors.append(f"{key} is not defined in template category '{template.category}'.")

    if errors:
        raise ValidationError({"metrics": errors})


def is_baseline_locked(experiment: Experiment) -> bool:
    return bool(experiment.baseline_locked)


def lock_baseline(experiment: Experiment) -> None:
    experiment.baseline_locked = True
    experiment.save(update_fields=["baseline_locked", "updated_at"])
