import uuid

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone

from .setup_packets import PACKET_ENVIRONMENT


class AppUser(models.Model):
    class Role(models.TextChoices):
        ADMIN = "admin", "admin"
        USER = "user", "user"

    class Status(models.TextChoices):
        ACTIVE = "active", "active"
        DISABLED = "disabled", "disabled"

    email = models.EmailField(unique=True)
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.USER)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        if self.email:
            self.email = self.email.strip().lower()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.email} ({self.role})"


class UUIDModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True


class Species(UUIDModel):
    name = models.CharField(max_length=128, unique=True)
    category = models.CharField(max_length=64, blank=True)

    def __str__(self):
        return self.name


class MetricTemplate(UUIDModel):
    category = models.CharField(max_length=64)
    version = models.IntegerField(default=1)
    fields = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["category", "version"], name="unique_metric_template_category_version"
            )
        ]

    def save(self, *args, **kwargs):
        if self.category:
            self.category = self.category.strip().lower()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.category}:v{self.version}"


class Experiment(UUIDModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "draft"
        RUN_IN = "run_in", "run_in"
        ACTIVE = "active", "active"
        COMPLETED = "completed", "completed"

    class LifecycleState(models.TextChoices):
        DRAFT = "draft", "draft"
        RUNNING = "running", "running"
        STOPPED = "stopped", "stopped"

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    lifecycle_state = models.CharField(
        max_length=16,
        choices=LifecycleState.choices,
        default=LifecycleState.DRAFT,
    )
    started_at = models.DateTimeField(null=True, blank=True)
    stopped_at = models.DateTimeField(null=True, blank=True)
    start_date = models.DateField(null=True, blank=True)
    duration_weeks = models.IntegerField(default=0)
    light_schedule = models.TextField(blank=True)
    tent_notes = models.TextField(blank=True)
    water_source = models.TextField(blank=True)
    ventilation_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class ExperimentSetupState(UUIDModel):
    experiment = models.OneToOneField(Experiment, on_delete=models.CASCADE, related_name="setup_state")
    current_packet = models.CharField(max_length=32, default=PACKET_ENVIRONMENT)
    completed_packets = models.JSONField(default=list, blank=True)
    locked_packets = models.JSONField(default=list, blank=True)
    packet_data = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)


class Recipe(UUIDModel):
    experiment = models.ForeignKey(Experiment, on_delete=models.CASCADE, related_name="recipes")
    code = models.CharField(max_length=32)
    name = models.CharField(max_length=255)
    notes = models.TextField(blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["experiment", "code"], name="unique_recipe_code_in_experiment")
        ]

    def __str__(self):
        return f"{self.experiment.pk}:{self.code}"


class BatchLot(UUIDModel):
    experiment = models.ForeignKey(Experiment, on_delete=models.CASCADE, related_name="lots")
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name="lots")
    lot_code = models.CharField(max_length=64)
    volume_ml = models.IntegerField(null=True, blank=True)
    ec_ms_cm = models.DecimalField(max_digits=6, decimal_places=3, null=True, blank=True)
    ph = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    temp_c = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    appearance_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["experiment", "lot_code"], name="unique_lot_code_in_experiment")
        ]

    def __str__(self):
        return f"{self.experiment.pk}:{self.lot_code}"


class Plant(UUIDModel):
    class Bin(models.TextChoices):
        A = "A", "A"
        B = "B", "B"
        C = "C", "C"

    class Status(models.TextChoices):
        ACTIVE = "active", "active"
        REMOVED = "removed", "removed"
        INACTIVE = "inactive", "inactive"
        DEAD = "dead", "dead"

    experiment = models.ForeignKey(Experiment, on_delete=models.CASCADE, related_name="plants")
    species = models.ForeignKey(Species, on_delete=models.PROTECT, related_name="plants")
    plant_id = models.CharField(max_length=64, blank=True, default="")
    cultivar = models.CharField(max_length=255, null=True, blank=True)
    bin = models.CharField(max_length=1, choices=Bin.choices, null=True, blank=True)
    assigned_recipe = models.ForeignKey(
        Recipe, on_delete=models.SET_NULL, null=True, blank=True, related_name="assigned_plants"
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    removed_at = models.DateTimeField(null=True, blank=True)
    removed_reason = models.TextField(blank=True)
    replaced_by = models.OneToOneField(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="replaces",
    )
    baseline_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["experiment", "plant_id"],
                condition=~Q(plant_id="") & ~Q(status="removed"),
                name="unique_plant_id_in_experiment",
            )
        ]

    def __str__(self):
        return f"{self.experiment.pk}:{self.plant_id or '(pending)'}"


class Tray(UUIDModel):
    experiment = models.ForeignKey(Experiment, on_delete=models.CASCADE, related_name="trays")
    block = models.ForeignKey("Block", on_delete=models.SET_NULL, null=True, blank=True, related_name="trays")
    recipe = models.ForeignKey(
        "Recipe",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="trays",
    )
    name = models.CharField(max_length=64)
    notes = models.TextField(blank=True)
    plants = models.ManyToManyField(Plant, through="TrayPlant", related_name="trays")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["experiment", "name"], name="unique_tray_name_in_experiment")
        ]

    def __str__(self):
        return f"{self.experiment.pk}:{self.name}"


class TrayPlant(UUIDModel):
    tray = models.ForeignKey(Tray, on_delete=models.CASCADE, related_name="tray_plants")
    plant = models.ForeignKey(Plant, on_delete=models.CASCADE, related_name="tray_plants")
    order_index = models.IntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["tray", "plant"], name="unique_plant_in_tray"),
            models.UniqueConstraint(fields=["plant"], name="unique_plant_single_tray"),
            models.UniqueConstraint(fields=["tray", "order_index"], name="unique_tray_order_index"),
        ]


class Block(UUIDModel):
    experiment = models.ForeignKey(Experiment, on_delete=models.CASCADE, related_name="blocks")
    name = models.CharField(max_length=64)
    description = models.TextField(blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["experiment", "name"], name="unique_block_name_in_experiment")
        ]

    def __str__(self):
        return f"{self.experiment.pk}:{self.name}"


class RotationLog(UUIDModel):
    experiment = models.ForeignKey(Experiment, on_delete=models.CASCADE, related_name="rotation_logs")
    tray = models.ForeignKey(Tray, on_delete=models.CASCADE, related_name="rotation_logs")
    from_block = models.ForeignKey(
        Block,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="rotation_logs_from",
    )
    to_block = models.ForeignKey(
        Block,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="rotation_logs_to",
    )
    occurred_at = models.DateTimeField(default=timezone.now)
    note = models.TextField(blank=True)
    created_by_email = models.EmailField(blank=True)


class WeeklySession(UUIDModel):
    experiment = models.ForeignKey(Experiment, on_delete=models.CASCADE, related_name="weekly_sessions")
    week_number = models.IntegerField()
    session_date = models.DateField()
    checklist_state = models.JSONField(default=dict, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["experiment", "week_number"], name="unique_weekly_session")
        ]


class PlantWeeklyMetric(UUIDModel):
    experiment = models.ForeignKey(Experiment, on_delete=models.CASCADE, related_name="plant_weekly_metrics")
    plant = models.ForeignKey(Plant, on_delete=models.CASCADE, related_name="weekly_metrics")
    week_number = models.IntegerField()
    metrics = models.JSONField(default=dict, blank=True)
    notes = models.TextField(blank=True)
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["plant", "week_number"], name="unique_plant_weekly_metric")
        ]


class FeedingEvent(UUIDModel):
    class DoseUnit(models.TextChoices):
        DROPS = "drops", "drops"
        ML = "ml", "ml"

    class Status(models.TextChoices):
        FED = "fed", "fed"
        SKIPPED = "skipped", "skipped"
        PAUSED = "paused", "paused"

    experiment = models.ForeignKey(Experiment, on_delete=models.CASCADE, related_name="feeding_events")
    plant = models.ForeignKey(Plant, on_delete=models.CASCADE, related_name="feeding_events")
    week_number = models.IntegerField(null=True, blank=True)
    recipe = models.ForeignKey(
        Recipe,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="feeding_events",
    )
    lot = models.ForeignKey(
        BatchLot, on_delete=models.SET_NULL, null=True, blank=True, related_name="feeding_events"
    )
    dose_value = models.DecimalField(max_digits=8, decimal_places=3, null=True, blank=True)
    dose_unit = models.CharField(max_length=16, choices=DoseUnit.choices, default=DoseUnit.DROPS)
    dosed_trap_count = models.IntegerField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.FED)
    notes = models.TextField(blank=True)
    note = models.TextField(blank=True)
    amount_text = models.CharField(max_length=64, blank=True)
    created_by_email = models.EmailField(blank=True)
    occurred_at = models.DateTimeField(default=timezone.now)
    recorded_at = models.DateTimeField(auto_now_add=True)


class AdverseEvent(UUIDModel):
    experiment = models.ForeignKey(Experiment, on_delete=models.CASCADE, related_name="adverse_events")
    plant = models.ForeignKey(Plant, on_delete=models.CASCADE, related_name="adverse_events")
    week_number = models.IntegerField(null=True, blank=True)
    type = models.CharField(max_length=128)
    severity = models.IntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    action_taken = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    recorded_at = models.DateTimeField(auto_now_add=True)


class Photo(UUIDModel):
    class Tag(models.TextChoices):
        BASELINE = "baseline", "baseline"
        WEEKLY = "weekly", "weekly"
        PROBLEM = "problem", "problem"
        OTHER = "other", "other"

    experiment = models.ForeignKey(Experiment, on_delete=models.CASCADE, related_name="photos")
    plant = models.ForeignKey(Plant, on_delete=models.SET_NULL, null=True, blank=True, related_name="photos")
    tray = models.ForeignKey(Tray, on_delete=models.SET_NULL, null=True, blank=True, related_name="photos")
    week_number = models.IntegerField(null=True, blank=True)
    tag = models.CharField(max_length=16, choices=Tag.choices, default=Tag.OTHER)
    file = models.FileField(upload_to="photos/%Y/%m/%d")
    created_at = models.DateTimeField(auto_now_add=True)
