from __future__ import annotations

import csv
import re
from io import BytesIO, StringIO
from uuid import UUID

import reportlab.graphics.renderPDF as renderPDF
from django.conf import settings
from django.db import IntegrityError, transaction
from django.http import HttpResponse
from django.utils import timezone
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from rest_framework.decorators import api_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .contracts import error_with_diagnostics, list_envelope
from .models import Experiment, Plant, Recipe, Species
from .plant_ids import ExperimentPlantIdAllocator, prefix_for_species
from .serializers import (
    ExperimentPlantCreateSerializer,
    ExperimentPlantSerializer,
    PlantReplaceSerializer,
    SpeciesSerializer,
)


def _require_app_user(request):
    app_user = getattr(request, "app_user", None)
    if app_user is None:
        return Response({"detail": "Not authenticated."}, status=403)
    return None


def _get_experiment(experiment_id: UUID):
    return Experiment.objects.filter(id=experiment_id).first()


def _resolve_species(
    *,
    species_id: str | None,
    species_name: str | None,
    category: str | None,
) -> Species:
    if species_id:
        species = Species.objects.filter(id=species_id).first()
        if species is None:
            raise ValidationError("Species not found.")
        return species

    if not species_name:
        raise ValidationError("species_name is required when species id is not provided.")

    normalized_name = species_name.strip()
    if not normalized_name:
        raise ValidationError("species_name is required.")

    species = Species.objects.filter(name__iexact=normalized_name).first()
    if species is not None:
        if category and not species.category:
            species.category = category.strip().lower()
            species.save(update_fields=["category"])
        return species

    return Species.objects.create(
        name=normalized_name,
        category=(category or "").strip().lower(),
    )


def _recipe_summary(recipe: Recipe | None) -> dict | None:
    if recipe is None:
        return None
    return {
        "id": str(recipe.id),
        "code": recipe.code,
        "name": recipe.name,
    }


def _create_plant(
    *,
    experiment: Experiment,
    species: Species,
    allocator: ExperimentPlantIdAllocator,
    plant_id: str,
    cultivar: str,
    baseline_notes: str,
    status: str,
) -> Plant:
    effective_plant_id = plant_id.strip()
    if not effective_plant_id:
        effective_plant_id = allocator.allocate(species)

    return Plant.objects.create(
        experiment=experiment,
        species=species,
        plant_id=effective_plant_id,
        cultivar=cultivar.strip() or None,
        baseline_notes=baseline_notes.strip(),
        status=status,
    )


def _suggest_next_plant_id(experiment: Experiment, prefix: str) -> str:
    normalized_prefix = (prefix or "PL").strip().upper()
    pattern = re.compile(rf"^{re.escape(normalized_prefix)}-(\d+)$")
    highest = 0
    for existing in Plant.objects.filter(experiment=experiment).exclude(plant_id="").values_list("plant_id", flat=True):
        match = pattern.match(existing)
        if match:
            highest = max(highest, int(match.group(1)))
    return f"{normalized_prefix}-{highest + 1:03d}"


def _load_csv_rows(request):
    uploaded_file = request.FILES.get("file")
    csv_text = request.data.get("csv_text")

    if uploaded_file is not None:
        decoded = uploaded_file.read().decode("utf-8-sig")
    elif isinstance(csv_text, str):
        decoded = csv_text
    else:
        raise ValidationError("Provide a CSV file upload or csv_text in request body.")

    reader = csv.DictReader(StringIO(decoded))
    if not reader.fieldnames:
        raise ValidationError("CSV must include a header row.")
    return list(reader)


@api_view(["GET", "POST"])
def experiment_plants(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    if request.method == "GET":
        plants = Plant.objects.filter(experiment=experiment).select_related("species").order_by(
            "plant_id", "created_at"
        )
        serializer = ExperimentPlantSerializer(plants, many=True)
        return Response(list_envelope(list(serializer.data)))

    serializer = ExperimentPlantCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    species = _resolve_species(
        species_id=serializer.validated_data.get("species"),
        species_name=serializer.validated_data.get("species_name"),
        category=serializer.validated_data.get("category"),
    )

    allocator = ExperimentPlantIdAllocator(experiment)
    requested_plant_id = serializer.validated_data.get("plant_id", "")
    try:
        plant = _create_plant(
            experiment=experiment,
            species=species,
            allocator=allocator,
            plant_id=requested_plant_id,
            cultivar=serializer.validated_data.get("cultivar", ""),
            baseline_notes=serializer.validated_data.get("baseline_notes", ""),
            status=serializer.validated_data.get("status", Plant.Status.ACTIVE),
        )
    except IntegrityError:
        prefix_match = re.match(r"^([A-Za-z]+)-\\d+$", requested_plant_id.strip())
        prefix = prefix_match.group(1).upper() if prefix_match else prefix_for_species(species)
        return Response(
            {
                "detail": f"plant_id '{requested_plant_id.strip()}' already exists in this experiment.",
                "suggested_plant_id": _suggest_next_plant_id(experiment, prefix),
            },
            status=409,
        )
    return Response(ExperimentPlantSerializer(plant).data, status=201)


@api_view(["PATCH"])
def experiment_plants_recipes(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    raw_updates = request.data.get("updates")
    if not isinstance(raw_updates, list) or len(raw_updates) == 0:
        return Response({"detail": "updates must be a non-empty list."}, status=400)

    invalid_updates: list[dict[str, str]] = []
    parsed_updates: list[tuple[str, str | None]] = []

    for index, item in enumerate(raw_updates):
        if not isinstance(item, dict):
            invalid_updates.append(
                {"plant_id": "", "reason": f"invalid_update_payload_at_index_{index}"}
            )
            continue
        plant_id = item.get("plant_id")
        if not plant_id:
            invalid_updates.append({"plant_id": "", "reason": "plant_id_missing"})
            continue
        assigned_recipe_id = item.get("assigned_recipe_id")
        if assigned_recipe_id not in {None, ""} and not isinstance(assigned_recipe_id, str):
            invalid_updates.append({"plant_id": str(plant_id), "reason": "assigned_recipe_id_invalid"})
            continue
        parsed_updates.append(
            (str(plant_id), str(assigned_recipe_id) if assigned_recipe_id not in {None, ""} else None)
        )

    plant_ids = {plant_id for plant_id, _ in parsed_updates}
    plants_by_id = {
        str(plant.id): plant
        for plant in Plant.objects.filter(id__in=plant_ids, experiment=experiment).select_related("assigned_recipe")
    }
    recipe_ids = {recipe_id for _, recipe_id in parsed_updates if recipe_id is not None}
    recipes_by_id = {
        str(recipe.id): recipe
        for recipe in Recipe.objects.filter(id__in=recipe_ids, experiment=experiment).only("id", "code", "name")
    }

    for plant_id, recipe_id in parsed_updates:
        plant = plants_by_id.get(plant_id)
        if plant is None:
            invalid_updates.append({"plant_id": plant_id, "reason": "not_in_experiment"})
            continue
        if recipe_id is not None and recipes_by_id.get(recipe_id) is None:
            invalid_updates.append({"plant_id": plant_id, "reason": "recipe_not_found"})

    if invalid_updates:
        return error_with_diagnostics(
            "One or more recipe updates are invalid.",
            diagnostics={
                "reason_counts": {"invalid_updates": len(invalid_updates)},
                "invalid_updates": invalid_updates,
            },
        )

    results: list[dict[str, object]] = []
    plants_to_update_by_id: dict[str, Plant] = {}

    for plant_id, recipe_id in parsed_updates:
        plant = plants_by_id[plant_id]
        recipe = recipes_by_id.get(recipe_id) if recipe_id is not None else None
        current_recipe_id = str(plant.assigned_recipe.id) if plant.assigned_recipe else None
        next_recipe_id = str(recipe.id) if recipe else None
        status = "noop" if current_recipe_id == next_recipe_id else "updated"
        if status == "updated":
            plant.assigned_recipe = recipe
            plants_to_update_by_id[plant_id] = plant
        results.append(
            {
                "plant_id": plant_id,
                "assigned_recipe_id": next_recipe_id,
                "assigned_recipe": _recipe_summary(recipe),
                "status": status,
            }
        )

    if plants_to_update_by_id:
        Plant.objects.bulk_update(list(plants_to_update_by_id.values()), ["assigned_recipe", "updated_at"])

    return Response(list_envelope(results))


@api_view(["POST"])
def experiment_plants_bulk_import(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    rows = _load_csv_rows(request)
    allocator = ExperimentPlantIdAllocator(experiment)
    created: list[Plant] = []

    with transaction.atomic():
        for row_index, row in enumerate(rows, start=2):
            species_name = (row.get("species_name") or "").strip()
            if not species_name:
                raise ValidationError(f"Row {row_index}: species_name is required.")

            category = (row.get("category") or "").strip().lower()
            cultivar = (row.get("cultivar") or "").strip()
            baseline_notes = (row.get("baseline_notes") or "").strip()
            requested_plant_id = (row.get("plant_id") or "").strip()
            quantity_raw = (row.get("quantity") or "1").strip()

            try:
                quantity = int(quantity_raw) if quantity_raw else 1
            except ValueError as exc:
                raise ValidationError(f"Row {row_index}: quantity must be an integer.") from exc

            if quantity < 1:
                raise ValidationError(f"Row {row_index}: quantity must be at least 1.")
            if quantity > 1 and requested_plant_id:
                raise ValidationError(
                    f"Row {row_index}: plant_id cannot be provided when quantity is greater than 1."
                )

            species = _resolve_species(
                species_id=None,
                species_name=species_name,
                category=category,
            )
            for item_index in range(quantity):
                plant_id = requested_plant_id if item_index == 0 else ""
                try:
                    created.append(
                        _create_plant(
                            experiment=experiment,
                            species=species,
                            allocator=allocator,
                            plant_id=plant_id,
                            cultivar=cultivar,
                            baseline_notes=baseline_notes,
                            status=Plant.Status.ACTIVE,
                        )
                    )
                except IntegrityError as exc:
                    raise ValidationError(
                        f"Row {row_index}: plant_id '{plant_id}' already exists in this experiment."
                    ) from exc

    return Response(
        {
            "created_count": len(created),
            "plant_ids": [plant.plant_id for plant in created],
            "species": SpeciesSerializer(
                Species.objects.filter(id__in={plant.species.id for plant in created}),
                many=True,
            ).data,
        },
        status=201,
    )


@api_view(["POST"])
def experiment_plants_generate_ids(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    missing_plants = list(
        Plant.objects.filter(experiment=experiment, plant_id="")
        .select_related("species")
        .order_by("created_at")
    )
    if not missing_plants:
        return Response({"updated_count": 0, "plant_ids": []})

    allocator = ExperimentPlantIdAllocator(experiment)
    updated_ids: list[str] = []
    for plant in missing_plants:
        plant.plant_id = allocator.allocate(plant.species)
        updated_ids.append(plant.plant_id)

    Plant.objects.bulk_update(missing_plants, ["plant_id"])
    return Response({"updated_count": len(missing_plants), "plant_ids": updated_ids})


def _draw_qr_label(canv: canvas.Canvas, value: str, x: float, y: float, size: float):
    qr_widget = QrCodeWidget(value)
    bounds = qr_widget.getBounds()
    width = bounds[2] - bounds[0]
    height = bounds[3] - bounds[1]
    drawing = Drawing(
        size,
        size,
        transform=[size / width, 0, 0, size / height, 0, 0],
    )
    drawing.add(qr_widget)
    renderPDF.draw(drawing, canv, x, y)


def _get_qr_base_url() -> str:
    configured_base_url = (settings.PUBLIC_BASE_URL or "").strip().rstrip("/")
    if configured_base_url.startswith(("http://", "https://")):
        return configured_base_url
    return "http://localhost:3000"


@api_view(["GET"])
def experiment_plants_labels_pdf(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    mode = (request.query_params.get("mode") or "all").strip().lower()
    if mode not in {"all", "missing_ids"}:
        return Response({"detail": "mode must be 'all' or 'missing_ids'."}, status=400)

    plants_query = Plant.objects.filter(experiment=experiment).select_related("species").order_by(
        "created_at"
    )
    if mode == "missing_ids":
        plants_query = plants_query.filter(plant_id="")
    plants = list(plants_query)
    if not plants:
        return Response({"detail": "No plants available for label export."}, status=400)

    buffer = BytesIO()
    canv = canvas.Canvas(buffer, pagesize=letter, pageCompression=0)
    page_width, page_height = letter
    qr_base_url = _get_qr_base_url()

    margin = 36
    gutter = 18
    label_height = 118
    row_gap = 12
    label_width = (page_width - (2 * margin) - gutter) / 2
    rows_per_page = max(1, int((page_height - (2 * margin) + row_gap) / (label_height + row_gap)))
    labels_per_page = rows_per_page * 2

    for index, plant in enumerate(plants):
        slot = index % labels_per_page
        if slot == 0 and index > 0:
            canv.showPage()

        row = slot // 2
        col = slot % 2
        x = margin + (col * (label_width + gutter))
        y = page_height - margin - label_height - (row * (label_height + row_gap))

        canv.roundRect(x, y, label_width, label_height, radius=8, stroke=1, fill=0)
        plant_label = plant.plant_id or "(pending)"
        canv.setFont("Helvetica-Bold", 16)
        canv.drawString(x + 10, y + label_height - 24, plant_label[:28])

        canv.setFont("Helvetica", 10)
        canv.drawString(x + 10, y + label_height - 40, plant.species.name[:42])

        plant_path = f"/p/{plant.id}"
        plant_url = f"{qr_base_url}{plant_path}"
        qr_size = 58
        qr_x = x + 10
        qr_y = y + 12
        _draw_qr_label(canv, plant_url, qr_x, qr_y, qr_size)
        canv.linkURL(
            plant_url,
            (qr_x, qr_y, qr_x + qr_size, qr_y + qr_size),
            relative=0,
            thickness=0,
        )

        canv.setFont("Helvetica", 8)
        canv.drawString(qr_x + qr_size + 8, qr_y + qr_size - 4, plant_label[:28])

    canv.save()
    pdf_bytes = buffer.getvalue()
    response = HttpResponse(pdf_bytes, content_type="application/pdf")
    response["Content-Disposition"] = (
        f'attachment; filename="experiment-{experiment.id}-plant-labels.pdf"'
    )
    return response


@api_view(["POST"])
def plant_replace(request, plant_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    original = (
        Plant.objects.filter(id=plant_id)
        .select_related("experiment", "species", "assigned_recipe")
        .first()
    )
    if original is None:
        return Response({"detail": "Plant not found."}, status=404)
    if original.replaced_by:
        return Response({"detail": "This plant already has a replacement."}, status=400)

    serializer = PlantReplaceSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    payload = serializer.validated_data

    mark_original_removed = payload.get("mark_original_removed", True)
    copy_identity_fields = payload.get("copy_identity_fields", True)
    inherit_assignment = payload.get("inherit_assignment", True)
    inherit_grade = payload.get("inherit_grade", False)
    removed_reason = (payload.get("removed_reason") or "").strip()
    removed_at = payload.get("removed_at") or timezone.now()

    allocator = ExperimentPlantIdAllocator(original.experiment)
    if "new_plant_id" in payload:
        raw_new_plant_id = payload.get("new_plant_id")
        new_plant_id = (raw_new_plant_id or "").strip()
    else:
        new_plant_id = allocator.allocate(original.species)

    if new_plant_id and Plant.objects.filter(
        experiment=original.experiment,
        plant_id=new_plant_id,
    ).exists():
        prefix_match = re.match(r"^([A-Za-z]+)-\\d+$", new_plant_id)
        prefix = prefix_match.group(1).upper() if prefix_match else prefix_for_species(original.species)
        return Response(
            {
                "detail": f"plant_id '{new_plant_id}' already exists in this experiment.",
                "suggested_plant_id": _suggest_next_plant_id(original.experiment, prefix),
            },
            status=409,
        )

    replacement = Plant.objects.create(
        experiment=original.experiment,
        species=original.species if copy_identity_fields else original.species,
        plant_id=new_plant_id,
        cultivar=original.cultivar if copy_identity_fields else None,
        baseline_notes=original.baseline_notes if copy_identity_fields else "",
        assigned_recipe=original.assigned_recipe if inherit_assignment else None,
        grade=original.grade if inherit_grade else None,
        status=Plant.Status.ACTIVE,
    )

    original.replaced_by = replacement
    if mark_original_removed:
        original.status = Plant.Status.REMOVED
        original.removed_at = removed_at
        original.removed_reason = removed_reason
        original.save(update_fields=["replaced_by", "status", "removed_at", "removed_reason", "updated_at"])
    else:
        original.save(update_fields=["replaced_by", "updated_at"])

    return Response(
        {
            "original": {
                "uuid": str(original.id),
                "plant_id": original.plant_id,
                "status": original.status,
                "replaced_by_uuid": str(replacement.id),
            },
            "replacement": {
                "uuid": str(replacement.id),
                "plant_id": replacement.plant_id,
                "status": replacement.status,
                "replaces_uuid": str(original.id),
                "assigned_recipe": {
                    "id": str(replacement.assigned_recipe.id),
                    "code": replacement.assigned_recipe.code,
                    "name": replacement.assigned_recipe.name,
                }
                if replacement.assigned_recipe
                else None,
                "grade": replacement.grade,
                "has_baseline": False,
            },
        },
        status=201,
    )
