"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { RotateCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useState } from "react";

import { backendUrl, unwrapList } from "@/lib/backend";
import { buttonVariants } from "@/src/components/ui/button";
import { NativeSelect } from "@/src/components/ui/native-select";
import PageAlerts from "@/src/components/ui/PageAlerts";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";
import {
  BaselinePlantQueuePanel,
  BaselineQueueStatusPanel,
} from "@/src/features/experiments/baseline/components/BaselinePanels";
import { Textarea } from "@/src/components/ui/textarea";
import { api, isApiError } from "@/src/lib/api";
import { normalizeUserFacingError } from "@/src/lib/errors/normalizeError";
import { queryKeys } from "@/src/lib/queryKeys";
import { usePageQueryState } from "@/src/lib/usePageQueryState";
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

type ExperimentBaselinePageClientProps = {
  experimentId: string;
};

export function ExperimentBaselinePageClient({ experimentId }: ExperimentBaselinePageClientProps) {
  const baselinePhotoInputId = useId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const selectedPlantFromQuery = searchParams.get("plant") || "";

  const [mutationOffline, setMutationOffline] = useState(false);
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

  const baselineInitialDataQueryKey = queryKeys.experiment.feature(experimentId, "baseline", "initialData");

  const meQuery = useQuery({
    queryKey: queryKeys.system.me(),
    queryFn: () => api.get<{ email: string; role: string; status: string }>("/api/me"),
    enabled: Boolean(experimentId),
    retry: false,
  });
  const meQueryState = usePageQueryState(meQuery);
  const notInvited = isApiError(meQuery.error) && meQuery.error.status === 403;

  const fetchBaselineInitialData = useCallback(async () => {
    const [plantsPayload, queuePayload] = await Promise.all([
      api.get<unknown>(`/api/v1/experiments/${experimentId}/plants/`),
      api.get<BaselineQueue>(`/api/v1/experiments/${experimentId}/baseline/queue`),
    ]);

    return {
      plants: unwrapList<PlantRow>(plantsPayload),
      queue: queuePayload,
    };
  }, [experimentId]);

  const baselineInitialDataQuery = useQuery({
    queryKey: baselineInitialDataQueryKey,
    queryFn: fetchBaselineInitialData,
    enabled: Boolean(experimentId) && meQuery.isSuccess,
    retry: false,
  });
  const baselineInitialState = usePageQueryState(baselineInitialDataQuery);

  const selectedPlantBaselineQuery = useQuery({
    queryKey: queryKeys.experiment.feature(experimentId, "baseline", "plant", selectedPlantId || null),
    queryFn: () => api.get<PlantBaseline>(`/api/v1/plants/${selectedPlantId}/baseline`),
    enabled: Boolean(experimentId) && Boolean(selectedPlantId) && meQuery.isSuccess,
    retry: false,
  });
  const selectedPlantBaselineState = usePageQueryState(selectedPlantBaselineQuery);

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

  const applyPlantBaselinePayload = useCallback((plantId: string, payload: PlantBaseline) => {
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
    const payload = baselineInitialDataQuery.data;
    if (!payload) {
      return;
    }

    const queueRows = unwrapList<QueuePlant>(payload.queue.plants);
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
    setPlants(payload.plants);
    setQueue(payload.queue);

    setSelectedPlantId((current) => {
      if (selectedPlantFromQuery) {
        return selectedPlantFromQuery;
      }
      if (current && queueRows.some((row) => row.uuid === current)) {
        return current;
      }
      const firstMissing = queueRows.find((plant) => queueNeedsBaseline(plant));
      return firstMissing?.uuid || queueRows[0]?.uuid || "";
    });
  }, [baselineInitialDataQuery.data, selectedPlantFromQuery]);

  useEffect(() => {
    if (!selectedPlantFromQuery) {
      return;
    }
    setSelectedPlantId(selectedPlantFromQuery);
  }, [selectedPlantFromQuery]);

  useEffect(() => {
    if (!selectedPlantId || !selectedPlantBaselineQuery.data) {
      return;
    }
    applyPlantBaselinePayload(selectedPlantId, selectedPlantBaselineQuery.data);
  }, [applyPlantBaselinePayload, selectedPlantBaselineQuery.data, selectedPlantId]);

  const jumpToPlant = useCallback((plantId: string) => {
    const nextQuery = new URLSearchParams(searchParams.toString());
    nextQuery.set("plant", plantId);
    router.replace(`/experiments/${experimentId}/baseline?${nextQuery.toString()}`);
  }, [experimentId, router, searchParams]);

  const refreshBaselineInitialData = useCallback(async () => {
    return queryClient.fetchQuery({
      queryKey: baselineInitialDataQueryKey,
      queryFn: fetchBaselineInitialData,
    });
  }, [baselineInitialDataQueryKey, fetchBaselineInitialData, queryClient]);

  const saveBaselineMutation = useMutation({
    mutationFn: async (args: {
      plantId: string;
      saveAndNext: boolean;
      completeValues: SliderValues;
      gradeSource: GradeSource;
      manualGrade: GradeValue | "";
      notes: string;
    }) => {
      const body: Record<string, unknown> = {
        metrics: {
          baseline_v1: {
            ...args.completeValues,
            grade_source: args.gradeSource,
          },
        },
        notes: args.notes,
        grade_source: args.gradeSource,
      };
      if (args.gradeSource === "manual") {
        body.grade = args.manualGrade;
      }

      await api.post(`/api/v1/plants/${args.plantId}/baseline`, body);
      return args;
    },
    onMutate: () => {
      setError("");
      setNotice("");
      setMutationOffline(false);
    },
    onSuccess: async (result) => {
      const refreshedData = await refreshBaselineInitialData();
      const refreshedRows = unwrapList<QueuePlant>(refreshedData.queue.plants);

      if (result.plantId === selectedPlantId) {
        await selectedPlantBaselineQuery.refetch();
      } else {
        await queryClient.fetchQuery({
          queryKey: queryKeys.experiment.feature(experimentId, "baseline", "plant", result.plantId),
          queryFn: () => api.get<PlantBaseline>(`/api/v1/plants/${result.plantId}/baseline`),
        });
      }

      setNotice("Baseline saved.");
      if (!result.saveAndNext) {
        return;
      }

      if (refreshedData.queue.remaining_count === 0) {
        setNotice("All baselines complete.");
        router.push(`/experiments/${experimentId}/overview?refresh=${Date.now()}`);
        return;
      }

      const nextPlant =
        refreshedRows.find((plant) => queueNeedsBaseline(plant) && plant.uuid !== result.plantId) ||
        refreshedRows.find((plant) => queueNeedsBaseline(plant));
      if (nextPlant) {
        jumpToPlant(nextPlant.uuid);
      }
    },
    onError: (requestError) => {
      if (isApiError(requestError)) {
        setError(requestError.detail || "Unable to save baseline.");
        return;
      }
      const normalized = normalizeUserFacingError(requestError, "Unable to save baseline.");
      if (normalized.kind === "offline") {
        setMutationOffline(true);
      }
      setError("Unable to save baseline.");
    },
  });

  const uploadBaselinePhotoMutation = useMutation({
    mutationFn: async (args: { plantId: string; file: File }) => {
      const formData = new FormData();
      formData.append("experiment", experimentId);
      formData.append("plant", args.plantId);
      formData.append("tag", "baseline");
      formData.append("week_number", "0");
      formData.append("file", args.file);
      return api.postForm<PhotoRecord>("/api/v1/photos/", formData);
    },
    onMutate: () => {
      setError("");
      setNotice("");
      setMutationOffline(false);
    },
    onSuccess: (uploadedPhoto, args) => {
      setLatestBaselinePhotosByPlantId((current) => ({
        ...current,
        [args.plantId]: uploadedPhoto,
      }));
      setPhotoDirtyByPlantId((current) => ({
        ...current,
        [args.plantId]: true,
      }));
      setPhotoFile(null);
      setNotice("Baseline photo uploaded.");
    },
    onError: (requestError) => {
      if (isApiError(requestError)) {
        setError(requestError.detail || "Unable to upload baseline photo.");
        return;
      }
      const normalized = normalizeUserFacingError(requestError, "Unable to upload baseline photo.");
      if (normalized.kind === "offline") {
        setMutationOffline(true);
      }
      setError("Unable to upload baseline photo.");
    },
  });

  const lockBaselineMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/api/v1/experiments/${experimentId}/baseline/lock`);
    },
    onMutate: () => {
      setError("");
      setNotice("");
      setMutationOffline(false);
    },
    onSuccess: async () => {
      setEditingUnlocked(false);
      setNotice("Baseline locked (UI guardrail). Inputs are read-only by default.");
      await refreshBaselineInitialData();
    },
    onError: (requestError) => {
      if (isApiError(requestError)) {
        setError(requestError.detail || "Unable to lock baseline.");
        return;
      }
      const normalized = normalizeUserFacingError(requestError, "Unable to lock baseline.");
      if (normalized.kind === "offline") {
        setMutationOffline(true);
      }
      setError("Unable to lock baseline.");
    },
  });

  const loading =
    meQuery.isPending ||
    baselineInitialDataQuery.isPending ||
    (Boolean(selectedPlantId) && selectedPlantBaselineQuery.isPending);
  const saving = saveBaselineMutation.isPending || lockBaselineMutation.isPending;
  const uploadingPhoto = uploadBaselinePhotoMutation.isPending;
  const primarySaveDisabled =
    saving ||
    readOnly ||
    !selectedPlantId ||
    (selectedPlantHasCapturedBaseline && !selectedPlantDirty);
  const queryOffline =
    meQueryState.errorKind === "offline" ||
    baselineInitialState.errorKind === "offline" ||
    selectedPlantBaselineState.errorKind === "offline";
  const offline = mutationOffline || queryOffline;
  const queryError =
    !notInvited &&
    !offline &&
    (meQueryState.isError || baselineInitialState.isError || selectedPlantBaselineState.isError)
      ? "Unable to load baseline page."
      : "";

  const saveBaseline = useCallback((saveAndNext: boolean) => {
    if (!selectedPlantId || readOnly) {
      return;
    }
    if (gradeSource === "manual" && !manualGrade) {
      setError("Select a manual grade or revert to auto.");
      return;
    }

    saveBaselineMutation.mutate({
      plantId: selectedPlantId,
      saveAndNext,
      completeValues: sliderValues,
      gradeSource,
      manualGrade,
      notes,
    });
  }, [gradeSource, manualGrade, notes, readOnly, saveBaselineMutation, selectedPlantId, sliderValues]);

  const uploadBaselinePhoto = useCallback(() => {
    if (!selectedPlantId || !photoFile || readOnly) {
      return;
    }
    uploadBaselinePhotoMutation.mutate({ plantId: selectedPlantId, file: photoFile });
  }, [photoFile, readOnly, selectedPlantId, uploadBaselinePhotoMutation]);

  const lockBaseline = useCallback(() => {
    lockBaselineMutation.mutate();
  }, [lockBaselineMutation]);

  const queueStatusModel = useMemo(
    () => ({
      remainingCount: queue?.remaining_count ?? 0,
      baselineLocked,
      editingUnlocked,
      allBaselinesCaptured,
      saving,
      primarySaveDisabled,
      primarySaveLabel,
    }),
    [
      allBaselinesCaptured,
      baselineLocked,
      editingUnlocked,
      primarySaveDisabled,
      primarySaveLabel,
      queue?.remaining_count,
      saving,
    ],
  );

  const queueStatusActions = useMemo(
    () => ({
      onUnlockEditing: () => setEditingUnlocked(true),
      onRelockEditing: () => setEditingUnlocked(false),
      onFinishAndLock: () => {
        void lockBaseline();
      },
      onPrimarySave: () => {
        void saveBaseline(primarySaveLabel === "Save & Next");
      },
    }),
    [lockBaseline, primarySaveLabel, saveBaseline],
  );

  const plantQueueModel = useMemo(
    () => ({
      queuePlants,
      selectedPlantId,
    }),
    [queuePlants, selectedPlantId],
  );

  const plantQueueActions = useMemo(
    () => ({
      onJumpToPlant: jumpToPlant,
    }),
    [jumpToPlant],
  );

  if (notInvited) {
    return (
      <PageShell title="Baseline">
        <SectionCard>
          <PageAlerts notInvited />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Baseline"
      subtitle="Record week 0 baseline metrics and grade."
      actions={
        <Link className={buttonVariants({ variant: "default" })} href={`/experiments/${experimentId}/overview`}>
          ← Overview
        </Link>
      }
    >
      <PageAlerts
        loading={loading}
        loadingText="Loading baseline queue..."
        error={error || queryError}
        notice={notice}
        offline={offline}
      />

      <BaselineQueueStatusPanel model={queueStatusModel} actions={queueStatusActions} />

      {selectedPlantId ? (
        <SectionCard title="Capture Baseline">
          <div className={"grid gap-3"}>
            <label className={"grid gap-2"}>
              <span className={"text-sm text-muted-foreground"}>Plant</span>
              <NativeSelect
                value={selectedPlantId}
                onChange={(event) => jumpToPlant(event.target.value)}
                disabled={saving}
              >
                {plants.map((plant) => (
                  <option key={plant.id} value={plant.id}>
                    {plant.plant_id || "(pending)"} · {plant.species_name}
                  </option>
                ))}
              </NativeSelect>
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
                      className={selected ? buttonVariants({ variant: "default" }) : buttonVariants({ variant: "secondary" })}
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

      <BaselinePlantQueuePanel model={plantQueueModel} actions={plantQueueActions} />

    </PageShell>
  );
}
