from __future__ import annotations

import math
from typing import Any

from rest_framework.exceptions import ValidationError

BASELINE_V1_NAMESPACE = "baseline_v1"
BASELINE_V1_KEYS = (
    "vigor",
    "feature_count",
    "feature_quality",
    "color_turgor",
    "damage_pests",
)
BASELINE_CAPTURED_AT_KEY = "captured_at"
GRADE_SOURCE_AUTO = "auto"
GRADE_SOURCE_MANUAL = "manual"
GRADE_SOURCES = {GRADE_SOURCE_AUTO, GRADE_SOURCE_MANUAL}


def default_baseline_v1_metrics(default_value: int | None = None) -> dict[str, int | None]:
    return {key: default_value for key in BASELINE_V1_KEYS}


def _coerce_metric_value(raw_value: Any) -> int | None:
    if isinstance(raw_value, bool):
        return None
    if isinstance(raw_value, int) and 1 <= raw_value <= 5:
        return raw_value
    if isinstance(raw_value, float) and raw_value.is_integer() and 1 <= int(raw_value) <= 5:
        return int(raw_value)
    return None


def extract_baseline_v1_metrics(raw_metrics: Any) -> dict[str, int | None]:
    if not isinstance(raw_metrics, dict):
        return default_baseline_v1_metrics()

    namespaced = raw_metrics.get(BASELINE_V1_NAMESPACE)
    if isinstance(namespaced, dict):
        source = namespaced
    else:
        source = raw_metrics

    metrics = default_baseline_v1_metrics()
    for key in BASELINE_V1_KEYS:
        metrics[key] = _coerce_metric_value(source.get(key))
    return metrics


def read_grade_source(raw_metrics: Any) -> str:
    if not isinstance(raw_metrics, dict):
        return GRADE_SOURCE_AUTO

    namespaced = raw_metrics.get(BASELINE_V1_NAMESPACE)
    if isinstance(namespaced, dict):
        source = namespaced
    else:
        source = raw_metrics

    value = source.get("grade_source")
    if value in GRADE_SOURCES:
        return str(value)
    return GRADE_SOURCE_AUTO


def read_baseline_captured_at(raw_metrics: Any) -> str | None:
    if not isinstance(raw_metrics, dict):
        return None

    namespaced = raw_metrics.get(BASELINE_V1_NAMESPACE)
    if isinstance(namespaced, dict):
        source = namespaced
    else:
        source = raw_metrics

    value = source.get(BASELINE_CAPTURED_AT_KEY)
    if isinstance(value, str) and value.strip():
        return value
    return None


def validate_baseline_v1_metrics(metrics: Any) -> dict[str, int]:
    if not isinstance(metrics, dict):
        raise ValidationError({"metrics": ["Metrics must be an object."]})

    baseline_v1 = metrics.get(BASELINE_V1_NAMESPACE)
    if not isinstance(baseline_v1, dict):
        raise ValidationError({"metrics": [f"{BASELINE_V1_NAMESPACE} is required."]})

    errors: list[str] = []
    normalized: dict[str, int] = {}
    for key in BASELINE_V1_KEYS:
        value = baseline_v1.get(key)
        if isinstance(value, bool) or not isinstance(value, int):
            errors.append(f"{key} must be an integer from 1 to 5.")
            continue
        if value < 1 or value > 5:
            errors.append(f"{key} must be between 1 and 5.")
            continue
        normalized[key] = value

    if errors:
        raise ValidationError({"metrics": errors})
    return normalized


def merge_baseline_v1_metrics(
    raw_metrics: Any,
    baseline_v1: dict[str, int],
    *,
    grade_source: str,
    captured_at: str | None = None,
) -> dict[str, Any]:
    merged = dict(raw_metrics) if isinstance(raw_metrics, dict) else {}
    merged[BASELINE_V1_NAMESPACE] = {
        **baseline_v1,
        "grade_source": grade_source,
        **({BASELINE_CAPTURED_AT_KEY: captured_at} if captured_at else {}),
    }
    return merged


def _normalize_slider(value: int) -> float:
    return math.sqrt((value - 1) / 4)


def compute_auto_baseline_grade(values: dict[str, int]) -> str:
    vigor = values["vigor"]
    damage_pests = values["damage_pests"]
    one_count = sum(1 for key in BASELINE_V1_KEYS if values[key] == 1)

    if vigor == 1 or damage_pests == 1:
        return "C"
    if one_count >= 2:
        return "C"

    score = (
        0.30 * _normalize_slider(values["vigor"])
        + 0.25 * _normalize_slider(values["feature_quality"])
        + 0.20 * _normalize_slider(values["damage_pests"])
        + 0.15 * _normalize_slider(values["color_turgor"])
        + 0.10 * _normalize_slider(values["feature_count"])
    )

    if score >= 0.84:
        grade = "A"
    elif score >= 0.48:
        grade = "B"
    else:
        grade = "C"

    if values["vigor"] >= 4 and all(values[key] >= 3 for key in BASELINE_V1_KEYS) and grade == "C":
        return "B"
    return grade
