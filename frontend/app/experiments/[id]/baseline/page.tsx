"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useState } from "react";

import { backendFetch, backendUrl, normalizeBackendError, unwrapList } from "@/lib/backend";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import { buttonVariants } from "@/src/components/ui/button";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";
import { Textarea } from "@/src/components/ui/textarea";
import { cn } from "@/lib/utils";

import { experimentsStyles as styles } from "@/src/components/ui/experiments-styles";

type QueuePlant = {
  uuid: string;
  plant_id: string;
  species_name: string;
  species_category: string;
  cultivar: string | null;
  status: string;
  has_baseline: boolean;
  has_grade: boolean;
  baseline_captured_at?: string | null;
  baseline_photo?: PhotoRecord | null;
};

type BaselineQueue = {
  remaining_count: number;
  baseline_locked: boolean;
  plants: {
    count: number;
    results: QueuePlant[];
    meta: Record<string, unknown>;
  };
};

type PlantRow = {
  id: string;
  plant_id: string;
  species_name: string;
  species_category: string;
};

type GradeSource = "auto" | "manual";
type GradeValue = "A" | "B" | "C";

type BaselineV1Metrics = {
  vigor: number | null;
  feature_count: number | null;
  feature_quality: number | null;
  color_turgor: number | null;
  damage_pests: number | null;
  grade_source?: GradeSource;
};

type PlantBaseline = {
  plant_id: string;
  experiment_id: string;
  species_name?: string;
  species_category?: string;
  grade: GradeValue | null;
  grade_source: GradeSource;
  has_baseline: boolean;
  metrics: Record<string, unknown>;
  notes: string;
  baseline_captured_at?: string | null;
  baseline_photo?: PhotoRecord | null;
  baseline_locked: boolean;
};

type PhotoRecord = {
  id: string;
  experiment?: string;
  plant?: string | null;
  week_number: number | null;
  tag: string;
  file: string;
  url?: string;
  created_at: string;
};

type SliderKey = keyof Omit<BaselineV1Metrics, "grade_source">;
type SliderValues = Record<SliderKey, number>;

type BaselineDraftSnapshot = {
  sliderValues: SliderValues;
  gradeSource: GradeSource;
  manualGrade: GradeValue | "";
  notes: string;
};

const DEFAULT_SLIDER_VALUE = 3;

const SLIDER_KEYS: SliderKey[] = [
  "vigor",
  "feature_count",
  "feature_quality",
  "color_turgor",
  "damage_pests",
];

const VALUE_DESCRIPTOR: Record<number, string> = {
  1: "Poor",
  2: "Weak",
  3: "Fair",
  4: "Good",
  5: "Great",
};

function queueNeedsBaseline(plant: QueuePlant): boolean {
  return !plant.has_baseline || !plant.has_grade;
}

function defaultSliderValues(): SliderValues {
  return {
    vigor: DEFAULT_SLIDER_VALUE,
    feature_count: DEFAULT_SLIDER_VALUE,
    feature_quality: DEFAULT_SLIDER_VALUE,
    color_turgor: DEFAULT_SLIDER_VALUE,
    damage_pests: DEFAULT_SLIDER_VALUE,
  };
}

function normalizeSliderValue(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    return null;
  }
  const rounded = Math.round(value);
  if (rounded < 1 || rounded > 5) {
    return null;
  }
  return rounded;
}

function extractBaselineV1Metrics(rawMetrics: unknown): BaselineV1Metrics {
  if (!rawMetrics || typeof rawMetrics !== "object") {
    return {
      vigor: null,
      feature_count: null,
      feature_quality: null,
      color_turgor: null,
      damage_pests: null,
      grade_source: "auto",
    };
  }

  const metrics = rawMetrics as Record<string, unknown>;
  const namespacedRaw = metrics.baseline_v1;
  const source =
    namespacedRaw && typeof namespacedRaw === "object"
      ? (namespacedRaw as Record<string, unknown>)
      : metrics;

  const gradeSource = source.grade_source === "manual" ? "manual" : "auto";

  return {
    vigor: normalizeSliderValue(source.vigor),
    feature_count: normalizeSliderValue(source.feature_count),
    feature_quality: normalizeSliderValue(source.feature_quality),
    color_turgor: normalizeSliderValue(source.color_turgor),
    damage_pests: normalizeSliderValue(source.damage_pests),
    grade_source: gradeSource,
  };
}

function normalizeGradeInput(value: string): GradeValue | "" {
  if (value === "A" || value === "B" || value === "C") {
    return value;
  }
  return "";
}

function normalizedScore(value: number): number {
  return Math.sqrt((value - 1) / 4);
}

function computeAutoGrade(values: SliderValues): GradeValue {
  const completeValues = values;
  const oneCount = SLIDER_KEYS.reduce(
    (count, key) => (completeValues[key] === 1 ? count + 1 : count),
    0,
  );

  if (completeValues.vigor === 1 || completeValues.damage_pests === 1 || oneCount >= 2) {
    return "C";
  }

  const score =
    0.3 * normalizedScore(completeValues.vigor) +
    0.25 * normalizedScore(completeValues.feature_quality) +
    0.2 * normalizedScore(completeValues.damage_pests) +
    0.15 * normalizedScore(completeValues.color_turgor) +
    0.1 * normalizedScore(completeValues.feature_count);

  let grade: GradeValue = "C";
  if (score >= 0.84) {
    grade = "A";
  } else if (score >= 0.48) {
    grade = "B";
  }

  if (
    completeValues.vigor >= 4 &&
    SLIDER_KEYS.every((key) => completeValues[key] >= 3) &&
    grade === "C"
  ) {
    return "B";
  }
  return grade;
}

function toPhotoHref(path: string): string {
  if (!path) {
    return "";
  }
  if (path.startsWith("blob:") || path.startsWith("data:")) {
    return path;
  }
  if (path.startsWith("http://") || path.startsWith("https://")) {
    try {
      const parsed = new URL(path);
      const routePath = `${parsed.pathname}${parsed.search || ""}`;
      if (parsed.pathname.startsWith("/media/")) {
        return routePath;
      }
      return path;
    } catch {
      return path;
    }
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (normalizedPath.startsWith("/media/")) {
    return normalizedPath;
  }
  return backendUrl(normalizedPath);
}

function baselineLabelSkin(plant: QueuePlant | null) {
  const category = (plant?.species_category || "").trim().toLowerCase();
  const speciesName = (plant?.species_name || "").trim().toLowerCase();

  if (category === "nepenthes" || speciesName.startsWith("nepenthes")) {
    return {
      featureCountLabel: "Pitcher count",
      featureQualityLabel: "Pitcher quality",
    };
  }
  if (category === "dionaea" || category === "flytrap" || speciesName.includes("dionaea muscipula")) {
    return {
      featureCountLabel: "Trap count",
      featureQualityLabel: "Trap health",
    };
  }
  if (category === "drosera" || speciesName.startsWith("drosera")) {
    return {
      featureCountLabel: "Active leaf count",
      featureQualityLabel: "Dew tentacle health",
    };
  }
  if (category === "sarracenia" || speciesName.startsWith("sarracenia")) {
    return {
      featureCountLabel: "Pitcher count",
      featureQualityLabel: "Pitcher quality",
    };
  }
  if (category === "pinguicula" || speciesName.startsWith("pinguicula")) {
    return {
      featureCountLabel: "Leaf count",
      featureQualityLabel: "Leaf mucilage health",
    };
  }
  if (category === "cephalotus" || speciesName.startsWith("cephalotus")) {
    return {
      featureCountLabel: "Pitcher count",
      featureQualityLabel: "Pitcher quality",
    };
  }
  if (category === "utricularia" || speciesName.startsWith("utricularia")) {
    return {
      featureCountLabel: "Growth point count",
      featureQualityLabel: "Foliage health",
    };
  }
  return {
    featureCountLabel: "Structure count",
    featureQualityLabel: "Structure quality",
  };
}

export default function BaselinePage() {
  const baselinePhotoInputId = useId();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const experimentId = useMemo(() => {
    if (typeof params.id === "string") {
      return params.id;
    }
    if (Array.isArray(params.id)) {
      return params.id[0] ?? "";
    }
    return "";
  }, [params]);

  const selectedPlantFromQuery = searchParams.get("plant") || "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [notInvited, setNotInvited] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [plants, setPlants] = useState<PlantRow[]>([]);
  const [queue, setQueue] = useState<BaselineQueue | null>(null);
  const [selectedPlantId, setSelectedPlantId] = useState("");
  const [sliderValues, setSliderValues] = useState<SliderValues>(defaultSliderValues);
  const [gradeSource, setGradeSource] = useState<GradeSource>("auto");
  const [manualGrade, setManualGrade] = useState<GradeValue | "">("");
  const [notes, setNotes] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [selectedPhotoPreviewUrl, setSelectedPhotoPreviewUrl] = useState("");
  const [editingUnlocked, setEditingUnlocked] = useState(false);
  const [latestBaselinePhotosByPlantId, setLatestBaselinePhotosByPlantId] = useState<Record<string, PhotoRecord>>(
    {},
  );
  const [baselineCapturedAtByPlantId, setBaselineCapturedAtByPlantId] = useState<Record<string, string>>({});
  const [photoDirtyByPlantId, setPhotoDirtyByPlantId] = useState<Record<string, boolean>>({});
  const [baselineSnapshotByPlantId, setBaselineSnapshotByPlantId] = useState<Record<string, BaselineDraftSnapshot>>(
    {},
  );

  const queuePlants = useMemo(
    () => (queue ? unwrapList<QueuePlant>(queue.plants) : []),
    [queue],
  );
  const selectedQueuePlant = useMemo(
    () => queuePlants.find((plant) => plant.uuid === selectedPlantId) ?? null,
    [queuePlants, selectedPlantId],
  );
  const labelSkin = useMemo(() => baselineLabelSkin(selectedQueuePlant), [selectedQueuePlant]);
  const autoGrade = useMemo(() => computeAutoGrade(sliderValues), [sliderValues]);
  const effectiveGrade =
    gradeSource === "manual" ? (manualGrade || autoGrade) : autoGrade;
  const manualOverrideActive =
    gradeSource === "manual" &&
    !!manualGrade &&
    manualGrade !== autoGrade;
  const gradeStatusChipText = manualOverrideActive
    ? `Overridden: ${effectiveGrade}`
    : `Autograde selected: ${autoGrade}`;
  const selectedBaselinePhoto = selectedPlantId ? latestBaselinePhotosByPlantId[selectedPlantId] ?? null : null;
  const selectedBaselineCapturedAt = selectedPlantId
    ? baselineCapturedAtByPlantId[selectedPlantId] ?? selectedQueuePlant?.baseline_captured_at ?? null
    : null;
  const photoThumbnailSrc =
    selectedPhotoPreviewUrl ||
    (selectedBaselinePhoto
      ? toPhotoHref(selectedBaselinePhoto.url || selectedBaselinePhoto.file)
      : "");
  const selectedSnapshot = selectedPlantId ? baselineSnapshotByPlantId[selectedPlantId] ?? null : null;
  const selectedPlantHasCapturedBaseline = Boolean(
    selectedQueuePlant && selectedQueuePlant.has_baseline && selectedQueuePlant.has_grade,
  );
  const selectedPlantDirty = useMemo(() => {
    if (!selectedPlantId || !selectedSnapshot) {
      return false;
    }

    const sliderChanged = SLIDER_KEYS.some(
      (key) => sliderValues[key] !== selectedSnapshot.sliderValues[key],
    );
    const gradeChanged =
      gradeSource !== selectedSnapshot.gradeSource ||
      (gradeSource === "manual" ? manualGrade : "") !==
        (selectedSnapshot.gradeSource === "manual" ? selectedSnapshot.manualGrade : "");
    const notesChanged = notes !== selectedSnapshot.notes;
    const photoChanged = photoDirtyByPlantId[selectedPlantId] ?? false;

    return sliderChanged || gradeChanged || notesChanged || photoChanged;
  }, [
    gradeSource,
    manualGrade,
    notes,
    photoDirtyByPlantId,
    selectedPlantId,
    selectedSnapshot,
    sliderValues,
  ]);
  const baselineLocked = queue?.baseline_locked ?? false;
  const readOnly = baselineLocked && !editingUnlocked;
  const allBaselinesCaptured = (queue?.remaining_count ?? 0) === 0;
  const hasRemainingBaselines = (queue?.remaining_count ?? 0) > 0;
  const primarySaveLabel =
    selectedPlantHasCapturedBaseline
      ? "Save"
      : hasRemainingBaselines
        ? "Save & Next"
        : "Save";
  const primarySaveDisabled =
    saving ||
    readOnly ||
    !selectedPlantId ||
    (selectedPlantHasCapturedBaseline && !selectedPlantDirty);

  const sliderDefinitions = useMemo(
    () => [
      { key: "vigor" as const, label: "Growth vigor" },
      { key: "feature_count" as const, label: labelSkin.featureCountLabel },
      { key: "feature_quality" as const, label: labelSkin.featureQualityLabel },
      { key: "color_turgor" as const, label: "Color turgor" },
      { key: "damage_pests" as const, label: "Pest damage" },
    ],
    [labelSkin.featureCountLabel, labelSkin.featureQualityLabel],
  );

  useEffect(() => {
    if (!photoFile) {
      setSelectedPhotoPreviewUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(photoFile);
    setSelectedPhotoPreviewUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [photoFile]);

  const loadQueue = useCallback(async () => {
    const response = await backendFetch(`/api/v1/experiments/${experimentId}/baseline/queue`);
    if (!response.ok) {
      throw new Error("Unable to load baseline queue.");
    }
    const payload = (await response.json()) as BaselineQueue;
    const queueRows = unwrapList<QueuePlant>(payload.plants);
    const latestByPlant: Record<string, PhotoRecord> = {};
    const capturedAtByPlant: Record<string, string> = {};
    for (const row of queueRows) {
      if (row.baseline_captured_at) {
        capturedAtByPlant[row.uuid] = row.baseline_captured_at;
      }
      if (row.baseline_photo) {
        latestByPlant[row.uuid] = row.baseline_photo;
      }
    }
    setBaselineCapturedAtByPlantId(capturedAtByPlant);
    setLatestBaselinePhotosByPlantId(latestByPlant);
    setQueue(payload);
    return payload;
  }, [experimentId]);

  const loadPlantBaseline = useCallback(async (plantId: string) => {
    const response = await backendFetch(`/api/v1/plants/${plantId}/baseline`);
    if (!response.ok) {
      throw new Error("Unable to load baseline.");
    }
    const payload = (await response.json()) as PlantBaseline;
    const baselineMetrics = extractBaselineV1Metrics(payload.metrics);
    const nextValues = defaultSliderValues();
    for (const key of SLIDER_KEYS) {
      if (baselineMetrics[key] !== null) {
        nextValues[key] = baselineMetrics[key];
      }
    }
    setSliderValues(nextValues);

    const source = payload.grade_source === "manual" ? "manual" : "auto";
    setGradeSource(source);
    setManualGrade(source === "manual" ? normalizeGradeInput(payload.grade || "") : "");
    setNotes(payload.notes || "");
    setBaselineCapturedAtByPlantId((current) => {
      const next = { ...current };
      if (payload.baseline_captured_at) {
        next[plantId] = payload.baseline_captured_at;
      } else {
        delete next[plantId];
      }
      return next;
    });
    setLatestBaselinePhotosByPlantId((current) => {
      const next = { ...current };
      if (payload.baseline_photo) {
        next[plantId] = payload.baseline_photo;
      } else {
        delete next[plantId];
      }
      return next;
    });
    setPhotoFile(null);
    setPhotoDirtyByPlantId((current) => ({
      ...current,
      [plantId]: false,
    }));
    setBaselineSnapshotByPlantId((current) => ({
      ...current,
      [plantId]: {
        sliderValues: nextValues,
        gradeSource: source,
        manualGrade: source === "manual" ? normalizeGradeInput(payload.grade || "") : "",
        notes: payload.notes || "",
      },
    }));
  }, []);

  useEffect(() => {
    async function load() {
      if (!experimentId) {
        return;
      }
      setLoading(true);
      setError("");
      setOffline(false);
      try {
        const meResponse = await backendFetch("/api/me");
        if (meResponse.status === 403) {
          setNotInvited(true);
          return;
        }

        const [plantsResponse, queuePayload] = await Promise.all([
          backendFetch(`/api/v1/experiments/${experimentId}/plants/`),
          loadQueue(),
        ]);

        if (!plantsResponse.ok) {
          setError("Unable to load plants.");
          return;
        }

        const plantsPayload = (await plantsResponse.json()) as unknown;
        const rows = unwrapList<PlantRow>(plantsPayload);
        setPlants(rows);

        const fromQuery = selectedPlantFromQuery;
        const queueRows = unwrapList<QueuePlant>(queuePayload.plants);
        const firstMissing = queueRows.find((plant) => queueNeedsBaseline(plant));
        const target = fromQuery || firstMissing?.uuid || queueRows[0]?.uuid || "";

        if (target) {
          setSelectedPlantId(target);
          await loadPlantBaseline(target);
        } else {
          setSelectedPlantId("");
        }
      } catch (requestError) {
        const normalized = normalizeBackendError(requestError);
        if (normalized.kind === "offline") {
          setOffline(true);
        }
        setError("Unable to load baseline page.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [experimentId, loadPlantBaseline, loadQueue, selectedPlantFromQuery]);

  function jumpToPlant(plantId: string) {
    const nextQuery = new URLSearchParams(searchParams.toString());
    nextQuery.set("plant", plantId);
    router.replace(`/experiments/${experimentId}/baseline?${nextQuery.toString()}`);
  }

  async function saveBaseline(saveAndNext: boolean) {
    if (!selectedPlantId || readOnly) {
      return;
    }
    if (gradeSource === "manual" && !manualGrade) {
      setError("Select a manual grade or revert to auto.");
      return;
    }
    const completeValues = sliderValues;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const body: Record<string, unknown> = {
        metrics: {
          baseline_v1: {
            ...completeValues,
            grade_source: gradeSource,
          },
        },
        notes,
        grade_source: gradeSource,
      };
      if (gradeSource === "manual") {
        body.grade = manualGrade;
      }

      const response = await backendFetch(`/api/v1/plants/${selectedPlantId}/baseline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { detail?: string };
      if (!response.ok) {
        setError(payload.detail || "Unable to save baseline.");
        return;
      }

      const refreshedQueue = await loadQueue();
      await loadPlantBaseline(selectedPlantId);
      setNotice("Baseline saved.");

      if (!saveAndNext) {
        return;
      }

      if (refreshedQueue.remaining_count === 0) {
        setNotice("All baselines complete.");
        router.push(`/experiments/${experimentId}/overview?refresh=${Date.now()}`);
        return;
      }

      const refreshedRows = unwrapList<QueuePlant>(refreshedQueue.plants);
      const nextPlant =
        refreshedRows.find((plant) => queueNeedsBaseline(plant) && plant.uuid !== selectedPlantId) ||
        refreshedRows.find((plant) => queueNeedsBaseline(plant));
      if (nextPlant) {
        jumpToPlant(nextPlant.uuid);
      }
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to save baseline.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadBaselinePhoto() {
    if (!selectedPlantId || !photoFile || readOnly) {
      return;
    }

    setUploadingPhoto(true);
    setError("");
    setNotice("");
    try {
      const formData = new FormData();
      formData.append("experiment", experimentId);
      formData.append("plant", selectedPlantId);
      formData.append("tag", "baseline");
      formData.append("week_number", "0");
      formData.append("file", photoFile);

      const response = await backendFetch("/api/v1/photos/", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as PhotoRecord | { detail?: string };
      if (!response.ok) {
        setError((payload as { detail?: string }).detail || "Unable to upload baseline photo.");
        return;
      }

      const uploadedPhoto = payload as PhotoRecord;
      setLatestBaselinePhotosByPlantId((current) => ({
        ...current,
        [selectedPlantId]: uploadedPhoto,
      }));
      setPhotoDirtyByPlantId((current) => ({
        ...current,
        [selectedPlantId]: true,
      }));
      setPhotoFile(null);
      setNotice("Baseline photo uploaded.");
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to upload baseline photo.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function lockBaseline() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await backendFetch(`/api/v1/experiments/${experimentId}/baseline/lock`, {
        method: "POST",
      });
      const payload = (await response.json()) as { detail?: string };
      if (!response.ok) {
        setError(payload.detail || "Unable to lock baseline.");
        return;
      }
      setEditingUnlocked(false);
      setNotice("Baseline locked (UI guardrail). Inputs are read-only by default.");
      await loadQueue();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to lock baseline.");
    } finally {
      setSaving(false);
    }
  }

  if (notInvited) {
    return (
      <PageShell title="Baseline">
        <SectionCard>
          <IllustrationPlaceholder inventoryId="ILL-001" kind="notInvited" />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Baseline"
      subtitle="Record week 0 baseline metrics and grade."
      actions={
        <Link className={cn(buttonVariants({ variant: "default" }), "border border-border")} href={`/experiments/${experimentId}/overview`}>
          ← Overview
        </Link>
      }
    >
      {loading ? <p className="text-sm text-muted-foreground">Loading baseline queue...</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-400">{notice}</p> : null}
      {offline ? <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" /> : null}

      <SectionCard title="Queue Status">
        <p className="text-sm text-muted-foreground">Remaining baselines: {queue?.remaining_count ?? 0}</p>
        {baselineLocked ? (
          <p className={"text-sm text-muted-foreground"}>Baseline is locked in UI. Unlock editing for this session to continue.</p>
        ) : null}
        <div className={"flex flex-wrap items-center gap-2"}>
          {baselineLocked && !editingUnlocked ? (
            <button
              className={cn(buttonVariants({ variant: "destructive" }), "border border-border")}
              type="button"
              onClick={() => setEditingUnlocked(true)}
            >
              Unlock editing
            </button>
          ) : null}
          {baselineLocked && editingUnlocked ? (
            <button
              className={cn(buttonVariants({ variant: "secondary" }), "border border-border")}
              type="button"
              onClick={() => setEditingUnlocked(false)}
            >
              Re-lock UI
            </button>
          ) : null}
          {!baselineLocked && allBaselinesCaptured ? (
            <button
              className={cn(buttonVariants({ variant: "secondary" }), "border border-border")}
              type="button"
              disabled={saving}
              onClick={() => void lockBaseline()}
            >
              Finish and Lock
            </button>
          ) : null}
          <button
            className={cn(buttonVariants({ variant: "default" }), "border border-border")}
            type="button"
            disabled={primarySaveDisabled}
            onClick={() => void saveBaseline(primarySaveLabel === "Save & Next")}
          >
            {saving ? "Saving..." : primarySaveLabel}
          </button>
        </div>
      </SectionCard>

      {selectedPlantId ? (
        <SectionCard title="Capture Baseline">
          <div className={"grid gap-3"}>
            <label className={"grid gap-2"}>
              <span className={"text-sm text-muted-foreground"}>Plant</span>
              <select
                className={styles.nativeSelect}
                value={selectedPlantId}
                onChange={(event) => jumpToPlant(event.target.value)}
                disabled={saving}
              >
                {plants.map((plant) => (
                  <option key={plant.id} value={plant.id}>
                    {plant.plant_id || "(pending)"} · {plant.species_name}
                  </option>
                ))}
              </select>
            </label>

            <div className={"grid gap-2"}>
              <span className={"text-sm text-muted-foreground"}>Baseline metrics (1-5)</span>
              <div className={styles.metricSliderGrid}>
                {sliderDefinitions.map((slider) => {
                  const value = sliderValues[slider.key];
                  return (
                    <div key={slider.key} className={styles.metricSliderField}>
                      <span className={styles.metricSliderLabelRow}>
                        <strong className={styles.metricSliderTitle}>{slider.label}</strong>
                      </span>
                      <input
                        className={styles.metricSliderInput}
                        type="range"
                        min={1}
                        max={5}
                        step={1}
                        value={value}
                        list={`baseline-slider-${slider.key}`}
                        disabled={saving || readOnly}
                        onChange={(event) =>
                          setSliderValues((current) => ({
                            ...current,
                            [slider.key]: Number(event.target.value),
                          }))
                        }
                      />
                      <datalist id={`baseline-slider-${slider.key}`}>
                        <option value={1} />
                        <option value={2} />
                        <option value={3} />
                        <option value={4} />
                        <option value={5} />
                      </datalist>
                      <span className={styles.metricSliderValueRow}>
                        {value} · {VALUE_DESCRIPTOR[value]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={"grid gap-2"}>
              <span className={"text-sm text-muted-foreground"}>Grade</span>
              <div className={styles.baselineGradeRow}>
                <span className={styles.baselineGradePill}>{gradeStatusChipText}</span>
                {manualOverrideActive ? (
                  <button
                    className={styles.baselineGradeRevertButton}
                    type="button"
                    aria-label="Revert to auto grade"
                    title="Revert to auto grade"
                    disabled={saving || readOnly}
                    onClick={() => {
                      setGradeSource("auto");
                      setManualGrade("");
                    }}
                  >
                    <RotateCcw size={14} />
                  </button>
                ) : null}
              </div>
              <div className={styles.baselineGradeButtonRow}>
                {(["A", "B", "C"] as const).map((grade) => {
                  const selected = effectiveGrade === grade;
                  return (
                    <button
                      key={grade}
                      className={selected ? cn(buttonVariants({ variant: "default" }), "border border-border") : cn(buttonVariants({ variant: "secondary" }), "border border-border")}
                      type="button"
                      disabled={saving || readOnly}
                      onClick={() => {
                        if (grade === autoGrade) {
                          setGradeSource("auto");
                          setManualGrade("");
                          return;
                        }
                        setGradeSource("manual");
                        setManualGrade(grade);
                      }}
                    >
                      {grade}
                    </button>
                  );
                })}
              </div>
              {selectedBaselineCapturedAt ? (
                <p className={"text-sm text-muted-foreground"}>
                  Last baseline capture: {new Date(selectedBaselineCapturedAt).toLocaleString()}
                </p>
              ) : null}
            </div>

            <div className={"grid gap-2"}>
              <span className={"text-sm text-muted-foreground"}>Baseline photo</span>
              <div className={styles.baselinePhotoRow}>
                <div className={styles.baselinePhotoThumbCell}>
                  {photoThumbnailSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className={styles.baselinePhotoThumbImage}
                      src={photoThumbnailSrc}
                      alt="Baseline media preview"
                    />
                  ) : (
                    <span className={styles.baselinePhotoThumbEmpty}>No media</span>
                  )}
                </div>
                <div className={styles.baselinePhotoControls}>
                  <div className="flex h-9 w-full items-center gap-3 rounded-md border border-input bg-background px-2 text-sm text-foreground shadow-xs transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
                    <label
                      htmlFor={baselinePhotoInputId}
                      className={cn(
                        buttonVariants({ variant: "secondary", size: "sm" }),
                        "h-7 px-3 text-sm",
                        (readOnly || uploadingPhoto || saving) && "pointer-events-none opacity-50",
                      )}
                    >
                      Choose file
                    </label>
                    <span className="min-w-0 truncate text-sm text-muted-foreground">
                      {photoFile ? photoFile.name : "No file chosen"}
                    </span>
                    <input
                      id={baselinePhotoInputId}
                      className="sr-only"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      disabled={readOnly || uploadingPhoto || saving}
                      onChange={(event) => setPhotoFile(event.target.files?.[0] || null)}
                    />
                  </div>
                  <button
                    className={cn(buttonVariants({ variant: "secondary" }), "w-fit self-start")}
                    type="button"
                    disabled={readOnly || uploadingPhoto || saving || !photoFile}
                    onClick={() => void uploadBaselinePhoto()}
                  >
                    {uploadingPhoto ? "Uploading..." : "Upload photo"}
                  </button>
                </div>
              </div>
              {selectedBaselinePhoto ? (
                <p className={"text-sm text-muted-foreground"}>
                  Latest upload: {new Date(selectedBaselinePhoto.created_at).toLocaleString()}
                </p>
              ) : null}
            </div>

            <label className={"grid gap-2"}>
              <span className={"text-sm text-muted-foreground"}>Notes</span>
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                disabled={saving || readOnly}
              />
            </label>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Plant Queue">
        {queuePlants.length > 0 ? (
          <div className={[styles.plantCellGrid, styles.cellGridResponsive].join(" ")} data-cell-size="sm">
            {queuePlants.map((plant) => {
              const selected = plant.uuid === selectedPlantId;
              return (
                <article
                  key={plant.uuid}
                  className={[
                    styles.plantCell,
                    styles.baselineQueuePlantCell,
                    styles.cellFrame,
                    styles.cellSurfaceLevel1,
                    styles.cellInteractive,
                    selected ? styles.plantCellSelected : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  role="button"
                  tabIndex={0}
                  onClick={() => jumpToPlant(plant.uuid)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      jumpToPlant(plant.uuid);
                    }
                  }}
                >
                  <strong className={styles.plantCellId}>{plant.plant_id || "(pending)"}</strong>
                  <span className={styles.plantCellSpecies}>{plant.species_name}</span>
                  <div className={styles.baselineQueueStatusRow}>
                    <span className={plant.has_baseline ? styles.baselineStatusReady : styles.baselineStatusMissing}>
                      {plant.has_baseline ? "Captured" : "No baseline"}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className={"text-sm text-muted-foreground"}>No active plants found in this queue.</p>
        )}
      </SectionCard>

    </PageShell>
  );
}
