import uuid

from django.db import migrations, models


def seed_metric_templates(apps, schema_editor):
    MetricTemplate = apps.get_model("api", "MetricTemplate")
    base_fields = [
        {
            "key": "health_score",
            "label": "Health Score",
            "type": "int",
            "min": 1,
            "max": 5,
            "required": True,
        },
        {
            "key": "coloration_score",
            "label": "Coloration Score",
            "type": "int",
            "min": 1,
            "max": 5,
            "required": True,
        },
        {
            "key": "growth_notes",
            "label": "Growth Notes",
            "type": "text",
            "required": False,
        },
        {
            "key": "pest_signs",
            "label": "Pest Signs",
            "type": "bool",
            "required": False,
        },
        {
            "key": "trap_count",
            "label": "Trap Count",
            "type": "int",
            "min": 0,
            "required": False,
        },
    ]

    for category in ["nepenthes", "flytrap", "drosera"]:
        MetricTemplate.objects.get_or_create(
            category=category,
            version=1,
            defaults={"fields": base_fields},
        )


def unseed_metric_templates(apps, schema_editor):
    MetricTemplate = apps.get_model("api", "MetricTemplate")
    MetricTemplate.objects.filter(category__in=["nepenthes", "flytrap", "drosera"], version=1).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0004_remove_plant_unique_plant_id_in_experiment_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="MetricTemplate",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("category", models.CharField(max_length=64)),
                ("version", models.IntegerField(default=1)),
                ("fields", models.JSONField(blank=True, default=list)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.AddConstraint(
            model_name="metrictemplate",
            constraint=models.UniqueConstraint(
                fields=("category", "version"),
                name="unique_metric_template_category_version",
            ),
        ),
        migrations.RunPython(seed_metric_templates, unseed_metric_templates),
    ]
