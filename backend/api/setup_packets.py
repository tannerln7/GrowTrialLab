STEP_ENVIRONMENT = "environment"
STEP_PLANTS = "plants"
STEP_BASELINE = "baseline"
STEP_GROUPS = "groups"
STEP_TRAYS = "trays"
STEP_ROTATION = "rotation"
STEP_FEEDING = "feeding"
STEP_REVIEW = "review"

STEP_ORDER: list[str] = [
    STEP_PLANTS,
    STEP_ENVIRONMENT,
    STEP_BASELINE,
    STEP_GROUPS,
    STEP_TRAYS,
    STEP_ROTATION,
    STEP_FEEDING,
    STEP_REVIEW,
]

STEP_LABELS: dict[str, str] = {
    STEP_PLANTS: "Plants",
    STEP_ENVIRONMENT: "Environments",
    STEP_BASELINE: "Baseline",
    STEP_GROUPS: "Recipes and Assignment",
    STEP_TRAYS: "Placement",
    STEP_ROTATION: "Rotation",
    STEP_FEEDING: "Start",
    STEP_REVIEW: "Start",
}


def normalize_step_ids(step_ids: list[str]) -> list[str]:
    seen: set[str] = set()
    normalized: list[str] = []
    for step_id in step_ids:
        if step_id in STEP_ORDER and step_id not in seen:
            normalized.append(step_id)
            seen.add(step_id)
    return normalized


def next_incomplete_step(completed_steps: list[str]) -> str:
    completed = set(normalize_step_ids(completed_steps))
    for step_id in STEP_ORDER:
        if step_id not in completed:
            return step_id
    return STEP_ORDER[-1]


# Backward-compatible aliases while API endpoints and model keys remain stable.
PACKET_ENVIRONMENT = STEP_ENVIRONMENT
PACKET_PLANTS = STEP_PLANTS
PACKET_BASELINE = STEP_BASELINE
PACKET_GROUPS = STEP_GROUPS
PACKET_TRAYS = STEP_TRAYS
PACKET_ROTATION = STEP_ROTATION
PACKET_FEEDING = STEP_FEEDING
PACKET_REVIEW = STEP_REVIEW
PACKET_ORDER = STEP_ORDER
PACKET_LABELS = STEP_LABELS
normalize_packet_ids = normalize_step_ids
next_incomplete_packet = next_incomplete_step
