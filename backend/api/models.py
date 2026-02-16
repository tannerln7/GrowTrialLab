from __future__ import annotations

import uuid

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone


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
    baseline_locked = models.BooleanField(default=False)
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
    class Grade(models.TextChoices):
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
    grade = models.CharField(max_length=1, choices=Grade.choices, null=True, blank=True)
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


def default_tent_layout() -> dict:
    return {
        "schema_version": 1,
        "shelves": [],
    }


class Tent(UUIDModel):
    experiment = models.ForeignKey(Experiment, on_delete=models.CASCADE, related_name="tents")
    name = models.CharField(max_length=128)
    code = models.CharField(max_length=16, blank=True, default="")
    notes = models.TextField(blank=True)
    layout = models.JSONField(default=default_tent_layout, blank=True)
    allowed_species = models.ManyToManyField(Species, related_name="tents", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["experiment", "name"], name="unique_tent_name_in_experiment"),
            models.UniqueConstraint(
                fields=["experiment", "code"],
                condition=~Q(code=""),
                name="unique_tent_code_in_experiment",
            ),
        ]

    def __str__(self):
        suffix = f" ({self.code})" if self.code else ""
        return f"{self.experiment.pk}:{self.name}{suffix}"


class Slot(UUIDModel):
    tent = models.ForeignKey(Tent, on_delete=models.CASCADE, related_name="slots")
    shelf_index = models.IntegerField(validators=[MinValueValidator(1)])
    slot_index = models.IntegerField(validators=[MinValueValidator(1)])
    label = models.CharField(max_length=128, blank=True, default="")
    code = models.CharField(max_length=32, editable=False)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["tent_id", "shelf_index", "slot_index", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["tent", "shelf_index", "slot_index"],
                name="unique_slot_coordinate_in_tent",
            )
        ]

    def save(self, *args, **kwargs):
        self.code = f"S{self.shelf_index}-{self.slot_index}"
        if not self.label:
            self.label = f"Shelf {self.shelf_index} · Slot {self.slot_index}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.tent.id}:{self.code}"


class Tray(UUIDModel):
    experiment = models.ForeignKey(Experiment, on_delete=models.CASCADE, related_name="trays")
    slot = models.ForeignKey(Slot, on_delete=models.SET_NULL, null=True, blank=True, related_name="trays")
    assigned_recipe = models.ForeignKey(
        Recipe,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="trays",
    )
    name = models.CharField(max_length=64)
    capacity = models.IntegerField(default=1, validators=[MinValueValidator(1)])
    notes = models.TextField(blank=True)
    plants = models.ManyToManyField(Plant, through="TrayPlant", related_name="trays")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["experiment", "name"], name="unique_tray_name_in_experiment"),
            models.UniqueConstraint(fields=["slot"], name="unique_tray_per_slot"),
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


class ScheduleAction(UUIDModel):
    class ActionType(models.TextChoices):
        FEED = "FEED", "Feed"
        ROTATE = "ROTATE", "Rotate"
        PHOTO = "PHOTO", "Photo"
        METRICS = "METRICS", "Metrics"
        NOTE = "NOTE", "Note"
        CUSTOM = "CUSTOM", "Custom"

    experiment = models.ForeignKey(Experiment, on_delete=models.CASCADE, related_name="schedule_actions")
    title = models.CharField(max_length=255)
    action_type = models.CharField(max_length=16, choices=ActionType.choices)
    description = models.TextField(blank=True)
    enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class ScheduleRule(UUIDModel):
    class RuleType(models.TextChoices):
        DAILY = "DAILY", "Daily"
        WEEKLY = "WEEKLY", "Weekly"
        CUSTOM_DAYS_INTERVAL = "CUSTOM_DAYS_INTERVAL", "Custom days interval"

    class Timeframe(models.TextChoices):
        MORNING = "MORNING", "Morning"
        AFTERNOON = "AFTERNOON", "Afternoon"
        EVENING = "EVENING", "Evening"
        NIGHT = "NIGHT", "Night"

    schedule_action = models.ForeignKey(
        ScheduleAction,
        on_delete=models.CASCADE,
        related_name="rules",
    )
    rule_type = models.CharField(max_length=24, choices=RuleType.choices)
    interval_days = models.IntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1)],
    )
    weekdays = models.JSONField(default=list, blank=True)
    timeframe = models.CharField(max_length=16, choices=Timeframe.choices, default=Timeframe.MORNING)
    exact_time = models.TimeField(null=True, blank=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class ScheduleScope(UUIDModel):
    class ScopeType(models.TextChoices):
        TENT = "TENT", "Tent"
        TRAY = "TRAY", "Tray"
        PLANT = "PLANT", "Plant"

    schedule_action = models.ForeignKey(
        ScheduleAction,
        on_delete=models.CASCADE,
        related_name="scopes",
    )
    scope_type = models.CharField(max_length=16, choices=ScopeType.choices)
    scope_id = models.UUIDField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["schedule_action", "scope_type", "scope_id"],
                name="unique_schedule_scope_target",
            )
        ]


class RotationLog(UUIDModel):
    experiment = models.ForeignKey(Experiment, on_delete=models.CASCADE, related_name="rotation_logs")
    tray = models.ForeignKey(Tray, on_delete=models.CASCADE, related_name="rotation_logs")
    from_slot = models.ForeignKey(
        Slot,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="rotation_logs_from",
    )
    to_slot = models.ForeignKey(
        Slot,
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
