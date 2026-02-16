from __future__ import annotations

from typing import Any

from rest_framework.response import Response


def list_envelope(results: list[Any], *, meta: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "count": len(results),
        "results": results,
        "meta": meta or {},
    }


def error_with_diagnostics(
    detail: str,
    *,
    status_code: int = 409,
    diagnostics: dict[str, Any] | None = None,
) -> Response:
    return Response(
        {
            "detail": detail,
            "diagnostics": diagnostics
            or {
                "reason_counts": {},
                "remaining_unplaced_plants": 0,
                "unplaceable_plants": [],
                "would_orphan_trays": [],
            },
        },
        status=status_code,
    )
