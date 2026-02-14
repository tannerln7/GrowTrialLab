PACKET_ENVIRONMENT = "environment"
PACKET_PLANTS = "plants"
PACKET_BASELINE = "baseline"
PACKET_GROUPS = "groups"
PACKET_TRAYS = "trays"
PACKET_ROTATION = "rotation"
PACKET_FEEDING = "feeding"
PACKET_REVIEW = "review"

PACKET_ORDER: list[str] = [
    PACKET_ENVIRONMENT,
    PACKET_PLANTS,
    PACKET_BASELINE,
    PACKET_GROUPS,
    PACKET_TRAYS,
    PACKET_ROTATION,
    PACKET_FEEDING,
    PACKET_REVIEW,
]

PACKET_LABELS: dict[str, str] = {
    PACKET_ENVIRONMENT: "Environment",
    PACKET_PLANTS: "Plants",
    PACKET_BASELINE: "Baseline",
    PACKET_GROUPS: "Groups",
    PACKET_TRAYS: "Trays",
    PACKET_ROTATION: "Rotation",
    PACKET_FEEDING: "Feeding",
    PACKET_REVIEW: "Review",
}


def normalize_packet_ids(packet_ids: list[str]) -> list[str]:
    seen: set[str] = set()
    normalized: list[str] = []
    for packet_id in packet_ids:
        if packet_id in PACKET_ORDER and packet_id not in seen:
            normalized.append(packet_id)
            seen.add(packet_id)
    return normalized


def next_incomplete_packet(completed_packets: list[str]) -> str:
    completed = set(normalize_packet_ids(completed_packets))
    for packet_id in PACKET_ORDER:
        if packet_id not in completed:
            return packet_id
    return PACKET_ORDER[-1]
