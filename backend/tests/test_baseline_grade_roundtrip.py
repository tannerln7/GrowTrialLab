from __future__ import annotations

import pytest

from api.baseline import BASELINE_WEEK_NUMBER
from api.models import PlantWeeklyMetric

pytestmark = pytest.mark.django_db


def test_grade_roundtrip_in_baseline_and_overview(api_client, experiment, make_plant):
    plant = make_plant("NP-400")

    save_response = api_client.post(
        f"/api/v1/plants/{plant.id}/baseline",
        {"metrics": {"height_cm": 4}, "grade": "A", "notes": "ok"},
        format="json",
    )
    assert save_response.status_code == 200
    plant.refresh_from_db()
    assert plant.grade == "A"

    get_response = api_client.get(f"/api/v1/plants/{plant.id}/baseline")
    assert get_response.status_code == 200
    assert get_response.json()["grade"] == "A"

    weekly_exists = PlantWeeklyMetric.objects.filter(
        experiment=experiment,
        plant=plant,
        week_number=BASELINE_WEEK_NUMBER,
    ).exists()
    assert weekly_exists is True

    overview = api_client.get(f"/api/v1/experiments/{experiment.id}/overview/plants")
    assert overview.status_code == 200
    row = overview.json()["plants"]["results"][0]
    assert row["grade"] == "A"
