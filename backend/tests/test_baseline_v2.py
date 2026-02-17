from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from api.baseline import BASELINE_WEEK_NUMBER
from api.baseline_grade import compute_auto_baseline_grade
from api.models import Photo, PlantWeeklyMetric

pytestmark = pytest.mark.django_db


def _baseline_payload(
    *,
    vigor: int = 3,
    feature_count: int = 3,
    feature_quality: int = 3,
    color_turgor: int = 3,
    damage_pests: int = 3,
):
    return {
        "metrics": {
            "baseline_v1": {
                "vigor": vigor,
                "feature_count": feature_count,
                "feature_quality": feature_quality,
                "color_turgor": color_turgor,
                "damage_pests": damage_pests,
            }
        },
        "notes": "baseline notes",
    }


def test_auto_grade_roundtrip_and_grade_source(api_client, experiment, make_plant):
    plant = make_plant("NP-500")

    save_response = api_client.post(
        f"/api/v1/plants/{plant.id}/baseline",
        {
            **_baseline_payload(
                vigor=5,
                feature_count=4,
                feature_quality=5,
                color_turgor=4,
                damage_pests=5,
            ),
            "grade_source": "auto",
        },
        format="json",
    )
    assert save_response.status_code == 200
    save_payload = save_response.json()
    assert save_payload["grade_source"] == "auto"
    assert save_payload["grade"] == "A"
    assert save_payload["metrics"]["baseline_v1"]["vigor"] == 5
    assert save_payload["metrics"]["baseline_v1"]["grade_source"] == "auto"
    assert isinstance(save_payload["metrics"]["baseline_v1"]["captured_at"], str)
    assert isinstance(save_payload["baseline_captured_at"], str)

    get_response = api_client.get(f"/api/v1/plants/{plant.id}/baseline")
    assert get_response.status_code == 200
    get_payload = get_response.json()
    assert get_payload["grade"] == "A"
    assert get_payload["grade_source"] == "auto"
    assert get_payload["metrics"]["baseline_v1"]["feature_quality"] == 5
    assert isinstance(get_payload["metrics"]["baseline_v1"]["captured_at"], str)
    assert isinstance(get_payload["baseline_captured_at"], str)
    assert get_payload["species_name"] == plant.species.name
    assert get_payload["species_category"] == plant.species.category

    weekly_metric = PlantWeeklyMetric.objects.get(
        experiment=experiment,
        plant=plant,
        week_number=BASELINE_WEEK_NUMBER,
    )
    assert weekly_metric.metrics["baseline_v1"]["grade_source"] == "auto"


def test_manual_grade_override_persists(api_client, make_plant):
    plant = make_plant("NP-501")

    response = api_client.post(
        f"/api/v1/plants/{plant.id}/baseline",
        {
            **_baseline_payload(vigor=5, feature_count=5, feature_quality=5, color_turgor=5, damage_pests=5),
            "grade_source": "manual",
            "grade": "B",
        },
        format="json",
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["grade"] == "B"
    assert payload["grade_source"] == "manual"
    assert payload["metrics"]["baseline_v1"]["grade_source"] == "manual"


def test_baseline_post_validation_errors(api_client, make_plant):
    plant = make_plant("NP-502")

    missing_namespace = api_client.post(
        f"/api/v1/plants/{plant.id}/baseline",
        {"metrics": {"vigor": 4}, "grade_source": "auto"},
        format="json",
    )
    assert missing_namespace.status_code == 400
    assert "metrics" in missing_namespace.json()

    out_of_range = api_client.post(
        f"/api/v1/plants/{plant.id}/baseline",
        {
            **_baseline_payload(vigor=6),
            "grade_source": "auto",
        },
        format="json",
    )
    assert out_of_range.status_code == 400
    assert "metrics" in out_of_range.json()

    missing_manual_grade = api_client.post(
        f"/api/v1/plants/{plant.id}/baseline",
        {
            **_baseline_payload(),
            "grade_source": "manual",
        },
        format="json",
    )
    assert missing_manual_grade.status_code == 400
    assert "grade" in missing_manual_grade.json()


def test_auto_grade_guardrails():
    assert compute_auto_baseline_grade(
        {
            "vigor": 5,
            "feature_count": 5,
            "feature_quality": 5,
            "color_turgor": 5,
            "damage_pests": 5,
        }
    ) == "A"
    assert compute_auto_baseline_grade(
        {
            "vigor": 4,
            "feature_count": 4,
            "feature_quality": 4,
            "color_turgor": 4,
            "damage_pests": 4,
        }
    ) == "A"
    assert compute_auto_baseline_grade(
        {
            "vigor": 3,
            "feature_count": 3,
            "feature_quality": 3,
            "color_turgor": 3,
            "damage_pests": 3,
        }
    ) == "B"
    assert compute_auto_baseline_grade(
        {
            "vigor": 4,
            "feature_count": 3,
            "feature_quality": 4,
            "color_turgor": 3,
            "damage_pests": 4,
        }
    ) == "B"
    assert compute_auto_baseline_grade(
        {
            "vigor": 1,
            "feature_count": 5,
            "feature_quality": 5,
            "color_turgor": 5,
            "damage_pests": 5,
        }
    ) == "C"
    assert compute_auto_baseline_grade(
        {
            "vigor": 2,
            "feature_count": 1,
            "feature_quality": 1,
            "color_turgor": 5,
            "damage_pests": 5,
        }
    ) == "C"


def test_baseline_queue_includes_species_fields(api_client, experiment, make_plant):
    plant = make_plant("NP-503")
    save_response = api_client.post(
        f"/api/v1/plants/{plant.id}/baseline",
        {
            **_baseline_payload(),
            "grade_source": "auto",
        },
        format="json",
    )
    assert save_response.status_code == 200

    response = api_client.get(f"/api/v1/experiments/{experiment.id}/baseline/queue")
    assert response.status_code == 200
    first_row = response.json()["plants"]["results"][0]
    assert "species_name" in first_row
    assert "species_category" in first_row
    assert isinstance(first_row["baseline_captured_at"], str)


def test_baseline_get_includes_latest_baseline_photo(api_client, experiment, make_plant):
    plant = make_plant("NP-504")

    older_photo = Photo.objects.create(
        experiment=experiment,
        plant=plant,
        tag=Photo.Tag.BASELINE,
        week_number=0,
        file="photos/2026/02/14/older.jpg",
    )
    newer_photo = Photo.objects.create(
        experiment=experiment,
        plant=plant,
        tag=Photo.Tag.BASELINE,
        week_number=0,
        file="photos/2026/02/14/newer.jpg",
    )
    Photo.objects.filter(id=older_photo.id).update(created_at=timezone.now() - timedelta(hours=1))
    Photo.objects.filter(id=newer_photo.id).update(created_at=timezone.now())

    response = api_client.get(f"/api/v1/plants/{plant.id}/baseline")
    assert response.status_code == 200
    payload = response.json()
    assert payload["baseline_photo"] is not None
    assert payload["baseline_photo"]["id"] == str(newer_photo.id)
    assert payload["baseline_photo"]["plant"] == str(plant.id)
    assert payload["baseline_photo"]["tag"] == "baseline"
    assert payload["baseline_photo"]["file"].endswith("/media/photos/2026/02/14/newer.jpg")
    assert payload["baseline_photo"]["url"].endswith("/media/photos/2026/02/14/newer.jpg")


def test_baseline_queue_includes_latest_baseline_photo_per_plant(api_client, experiment, make_plant):
    plant = make_plant("NP-505")

    older_photo = Photo.objects.create(
        experiment=experiment,
        plant=plant,
        tag=Photo.Tag.BASELINE,
        week_number=0,
        file="photos/2026/02/14/old-queue.jpg",
    )
    newer_photo = Photo.objects.create(
        experiment=experiment,
        plant=plant,
        tag=Photo.Tag.BASELINE,
        week_number=0,
        file="photos/2026/02/14/new-queue.jpg",
    )
    Photo.objects.filter(id=older_photo.id).update(created_at=timezone.now() - timedelta(minutes=30))
    Photo.objects.filter(id=newer_photo.id).update(created_at=timezone.now())

    response = api_client.get(f"/api/v1/experiments/{experiment.id}/baseline/queue")
    assert response.status_code == 200
    rows = response.json()["plants"]["results"]
    row = next(item for item in rows if item["uuid"] == str(plant.id))
    assert row["baseline_photo"] is not None
    assert row["baseline_photo"]["id"] == str(newer_photo.id)
    assert row["baseline_photo"]["file"].endswith("/media/photos/2026/02/14/new-queue.jpg")
