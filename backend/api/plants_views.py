import csv
from io import BytesIO, StringIO
from uuid import UUID

from django.conf import settings
from django.db import IntegrityError, transaction
from django.http import HttpResponse
import reportlab.graphics.renderPDF as renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from rest_framework.decorators import api_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .models import Experiment, ExperimentSetupState, Plant, Species
from .plant_ids import ExperimentPlantIdAllocator
from .serializers import (
    ExperimentPlantCreateSerializer,
    ExperimentPlantSerializer,
    PlantsPacketSerializer,
    SpeciesSerializer,
)
from .setup_packets import PACKET_PLANTS, normalize_packet_ids, next_incomplete_packet


def _require_app_user(request):
    app_user = getattr(request, "app_user", None)
    if app_user is None:
        return Response({"detail": "Not authenticated."}, status=403)
    return None


def _get_experiment(experiment_id: UUID):
    return Experiment.objects.filter(id=experiment_id).first()


def _get_or_create_setup_state(experiment: Experiment):
    return ExperimentSetupState.objects.get_or_create(experiment=experiment)[0]


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
        return Response(serializer.data)

    serializer = ExperimentPlantCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    species = _resolve_species(
        species_id=serializer.validated_data.get("species"),
        species_name=serializer.validated_data.get("species_name"),
        category=serializer.validated_data.get("category"),
    )

    allocator = ExperimentPlantIdAllocator(experiment)
    plant = _create_plant(
        experiment=experiment,
        species=species,
        allocator=allocator,
        plant_id=serializer.validated_data.get("plant_id", ""),
        cultivar=serializer.validated_data.get("cultivar", ""),
        baseline_notes=serializer.validated_data.get("baseline_notes", ""),
        status=serializer.validated_data.get("status", Plant.Status.ACTIVE),
    )
    return Response(ExperimentPlantSerializer(plant).data, status=201)


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

        canv.setFont("Helvetica", 8)
        canv.drawString(qr_x + qr_size + 8, qr_y + qr_size - 4, plant_label[:28])

    canv.save()
    pdf_bytes = buffer.getvalue()
    response = HttpResponse(pdf_bytes, content_type="application/pdf")
    response["Content-Disposition"] = (
        f'attachment; filename="experiment-{experiment.id}-plant-labels.pdf"'
    )
    return response


@api_view(["PUT"])
def experiment_plants_packet(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    serializer = PlantsPacketSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    setup_state = _get_or_create_setup_state(experiment)
    payload = {
        "id_format_notes": serializer.validated_data.get("id_format_notes", ""),
    }
    setup_state.packet_data[PACKET_PLANTS] = payload
    setup_state.save(update_fields=["packet_data", "updated_at"])
    return Response({"packet": PACKET_PLANTS, "data": payload})


@api_view(["POST"])
def complete_plants_packet(request, experiment_id: UUID):
    rejection = _require_app_user(request)
    if rejection:
        return rejection

    experiment = _get_experiment(experiment_id)
    if experiment is None:
        return Response({"detail": "Experiment not found."}, status=404)

    if not Plant.objects.filter(experiment=experiment).exists():
        return Response(
            {
                "detail": "Packet 2 cannot be completed.",
                "errors": ["At least 1 plant is required before completing Packet 2."],
            },
            status=400,
        )

    setup_state = _get_or_create_setup_state(experiment)
    completed = normalize_packet_ids([*setup_state.completed_packets, PACKET_PLANTS])
    setup_state.completed_packets = completed
    setup_state.current_packet = next_incomplete_packet(completed)
    setup_state.save(update_fields=["completed_packets", "current_packet", "updated_at"])
    return Response(
        {
            "current_packet": setup_state.current_packet,
            "completed_packets": setup_state.completed_packets,
            "packet_data": setup_state.packet_data,
        }
    )
