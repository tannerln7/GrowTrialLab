from __future__ import annotations

from uuid import UUID

from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Block, Experiment, Species, Tent, Tray

DEFAULT_BLOCKS = [
    ("B1", "Front-left position"),
    ("B2", "Front-right position"),
    ("B3", "Back-left position"),
    ("B4", "Back-right position"),
]


def _require_app_user(request):
    app_user = getattr(request, "app_user", None)
    if app_user is None:
        return Response({"detail": "Not authenticated."}, status=403)
    return None


def _get_experiment(experiment_id: UUID):
    return Experiment.objects.filter(id=experiment_id).first()


def _parse_allowed_species_ids(raw_ids) -> tuple[list[Species], Response | None]:
    if raw_ids is None:
        return [], None
    if not isinstance(raw_ids, list):
        return [], Response({"detail": "allowed_species must be an array of species IDs."}, status=400)
    species_ids = [str(item) for item in raw_ids if str(item).strip()]
    species = list(Species.objects.filter(id__in=species_ids))
    if len(species) != len(set(species_ids)):
        return [], Response({"detail": "One or more allowed_species IDs are invalid."}, status=400)
    return species, None


def _serialize_tent(tent: Tent, *, include_blocks: bool = False) -> dict:
    allowed = list(tent.allowed_species.all().order_by("name"))
    payload = {
        "id": str(tent.id),
        "experiment": str(tent.experiment.id),
        "name": tent.name,
        "code": tent.code,
        "notes": tent.notes,
        "allowed_species": [
            {
                "id": str(species.id),
                "name": species.name,
                "category": species.category,
            }
            for species in allowed
        ],
        "allowed_species_count": len(allowed),
        "created_at": tent.created_at.isoformat(),
        "updated_at": tent.updated_at.isoformat(),
    }
    if include_blocks:
        payload["blocks"] = [
            {
                "id": str(block.id),
                "name": block.name,
                "description": block.description,
                "tray_count": Tray.objects.filter(block=block).count(),
            }
            for block in Block.objects.filter(tent=tent).order_by("name")
        ]
    return payload


@api_view(["GET", "POST"])
def experiment_tents(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    if request.method == "GET":
        tents = Tent.objects.filter(experiment=experiment).order_by("name", "id")
        return Response([_serialize_tent(tent, include_blocks=True) for tent in tents])

    name = (request.data.get("name") or "").strip()
    code = (request.data.get("code") or "").strip()
    notes = (request.data.get("notes") or "").strip()
    if not name:
        return Response({"detail": "Tent name is required."}, status=400)

    allowed_species, error_response = _parse_allowed_species_ids(request.data.get("allowed_species"))
    if error_response:
        return error_response

    tent = Tent.objects.create(
        experiment=experiment,
        name=name,
        code=code,
        notes=notes,
    )
    if allowed_species:
        tent.allowed_species.set(allowed_species)
    return Response(_serialize_tent(tent, include_blocks=True), status=201)


@api_view(["PATCH", "DELETE"])
def tent_detail(request, tent_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    tent = Tent.objects.filter(id=tent_id).first()
    if tent is None:
        return Response({"detail": "Tent not found."}, status=404)

    if request.method == "DELETE":
        if Block.objects.filter(tent=tent).exists():
            return Response(
                {"detail": "Tent cannot be deleted while it still has blocks."},
                status=409,
            )
        tent.delete()
        return Response(status=204)

    if "name" in request.data:
        name = (request.data.get("name") or "").strip()
        if not name:
            return Response({"detail": "Tent name cannot be blank."}, status=400)
        tent.name = name
    if "code" in request.data:
        tent.code = (request.data.get("code") or "").strip()
    if "notes" in request.data:
        tent.notes = (request.data.get("notes") or "").strip()

    if "allowed_species" in request.data:
        allowed_species, error_response = _parse_allowed_species_ids(request.data.get("allowed_species"))
        if error_response:
            return error_response
        tent.save()
        tent.allowed_species.set(allowed_species)
        return Response(_serialize_tent(tent, include_blocks=True))

    tent.save()
    return Response(_serialize_tent(tent, include_blocks=True))


@api_view(["GET", "POST"])
def tent_blocks(request, tent_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    tent = Tent.objects.filter(id=tent_id).select_related("experiment").first()
    if tent is None:
        return Response({"detail": "Tent not found."}, status=404)

    if request.method == "GET":
        blocks = Block.objects.filter(tent=tent).order_by("name")
        return Response(
            [
                {
                    "id": str(block.id),
                    "experiment": str(block.experiment.id),
                    "tent": str(block.tent.id),
                    "name": block.name,
                    "description": block.description,
                }
                for block in blocks
            ]
        )

    name = (request.data.get("name") or "").strip()
    if not name:
        return Response({"detail": "Block name is required."}, status=400)
    description = (request.data.get("description") or "").strip()
    block = Block.objects.create(
        experiment=tent.experiment,
        tent=tent,
        name=name,
        description=description,
    )
    return Response(
        {
            "id": str(block.id),
            "experiment": str(block.experiment.id),
            "tent": str(block.tent.id),
            "name": block.name,
            "description": block.description,
        },
        status=201,
    )


@api_view(["POST"])
def tent_blocks_defaults(request, tent_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    tent = Tent.objects.filter(id=tent_id).select_related("experiment").first()
    if tent is None:
        return Response({"detail": "Tent not found."}, status=404)

    created_count = 0
    for name, description in DEFAULT_BLOCKS:
        _, created = Block.objects.get_or_create(
            tent=tent,
            name=name,
            defaults={"experiment": tent.experiment, "description": description},
        )
        if created:
            created_count += 1

    blocks = Block.objects.filter(tent=tent).order_by("name")
    return Response(
        {
            "created_count": created_count,
            "blocks": [
                {
                    "id": str(block.id),
                    "experiment": str(block.experiment.id),
                    "tent": str(block.tent.id),
                    "name": block.name,
                    "description": block.description,
                }
                for block in blocks
            ],
        }
    )
