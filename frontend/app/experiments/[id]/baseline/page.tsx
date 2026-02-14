"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { backendFetch, normalizeBackendError } from "@/lib/backend";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import PageShell from "@/src/components/ui/PageShell";
import ResponsiveList from "@/src/components/ui/ResponsiveList";
import SectionCard from "@/src/components/ui/SectionCard";
import StickyActionBar from "@/src/components/ui/StickyActionBar";

import styles from "../../experiments.module.css";

type PlantRow = {
  id: string;
  species_name: string;
  species_category: string;
  plant_id: string;
  bin: string | null;
  cultivar: string | null;
  status: string;
};

type BaselinePlantStatus = {
  id: string;
  plant_id: string;
  species_name: string;
  species_category: string;
  bin: string | null;
  baseline_done: boolean;
};

type BaselineStatus = {
  total_plants: number;
  baseline_completed: number;
  bins_assigned: number;
  photos_count: number;
  baseline_locked: boolean;
  plants: BaselinePlantStatus[];
};

type TemplateField = {
  key: string;
  label: string;
  type: "int" | "float" | "text" | "bool";
  min?: number;
  max?: number;
  required?: boolean;
};

type PlantBaselinePayload = {
  plant_id: string;
  experiment_id: string;
  bin: string | null;
  baseline_locked: boolean;
  template: {
    id: string;
    category: string;
    version: number;
    fields: TemplateField[];
  } | null;
  baseline: {
    metrics: Record<string, unknown>;
    notes: string;
  } | null;
};

const FALLBACK_TEMPLATE_FIELDS: TemplateField[] = [
  {
    key: "health_score",
    label: "Health Score",
    type: "int",
    min: 1,
    max: 5,
    required: true,
  },
  {
    key: "growth_notes",
    label: "Growth Notes",
    type: "text",
    required: false,
  },
];

function normalizeTemplateFields(value: unknown): TemplateField[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const fields: TemplateField[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const raw = item as Record<string, unknown>;
    const key = String(raw.key ?? "").trim();
    const label = String(raw.label ?? key).trim();
    const type = String(raw.type ?? "").toLowerCase();
    if (!key || !label || !["int", "float", "text", "bool"].includes(type)) {
      continue;
    }
    fields.push({
      key,
      label,
      type: type as TemplateField["type"],
      min: typeof raw.min === "number" ? raw.min : undefined,
      max: typeof raw.max === "number" ? raw.max : undefined,
      required: Boolean(raw.required),
    });
  }
  return fields;
}

function pickNextPlant(status: BaselineStatus, currentPlantId: string | null): string | null {
  const prioritize = status.plants.filter((plant) => !plant.baseline_done || !plant.bin);
  const pool = prioritize.length > 0 ? prioritize : status.plants;
  if (pool.length === 0) {
    return null;
  }

  if (!currentPlantId) {
    return pool[0].id;
  }

  const currentIndex = pool.findIndex((plant) => plant.id === currentPlantId);
  if (currentIndex >= 0 && currentIndex + 1 < pool.length) {
    return pool[currentIndex + 1].id;
  }
  return pool[0].id;
}

export default function BaselineCapturePage() {
  const params = useParams();
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

  const preselectedPlantId = searchParams.get("plant");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notInvited, setNotInvited] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [plants, setPlants] = useState<PlantRow[]>([]);
  const [baselineStatus, setBaselineStatus] = useState<BaselineStatus | null>(null);
  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null);
  const [baselineLocked, setBaselineLocked] = useState(false);

  const [templateFields, setTemplateFields] = useState<TemplateField[]>([]);
  const [usingFallbackTemplate, setUsingFallbackTemplate] = useState(false);
  const [metrics, setMetrics] = useState<Record<string, unknown>>({});
  const [notes, setNotes] = useState("");
  const [selectedBin, setSelectedBin] = useState<"A" | "B" | "C" | "">("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const selectedPlant = useMemo(
    () => plants.find((plant) => plant.id === selectedPlantId) ?? null,
    [plants, selectedPlantId],
  );

  function handleRequestError(requestError: unknown, fallbackMessage: string): string {
    const normalizedError = normalizeBackendError(requestError);
    if (normalizedError.kind === "offline") {
      setOffline(true);
      return "Backend is unreachable.";
    }
    return fallbackMessage;
  }

  const fetchPlants = useCallback(async () => {
    const response = await backendFetch(`/api/v1/experiments/${experimentId}/plants/`);
    if (!response.ok) {
      throw new Error("Unable to load plants.");
    }
    const data = (await response.json()) as PlantRow[];
    setPlants(data);
    return data;
  }, [experimentId]);

  const fetchBaselineStatus = useCallback(async () => {
    const response = await backendFetch(
      `/api/v1/experiments/${experimentId}/baseline/status`,
    );
    if (response.status === 403) {
      setNotInvited(true);
      return null;
    }
    if (!response.ok) {
      throw new Error("Unable to load baseline status.");
    }
    const data = (await response.json()) as BaselineStatus;
    setBaselineStatus(data);
    setBaselineLocked(data.baseline_locked);
    return data;
  }, [experimentId]);

  const fetchPlantBaseline = useCallback(async (plantId: string) => {
    const response = await backendFetch(`/api/v1/plants/${plantId}/baseline`);
    if (!response.ok) {
      throw new Error("Unable to load baseline record.");
    }

    const data = (await response.json()) as PlantBaselinePayload;
    setBaselineLocked(data.baseline_locked);
    setMetrics(data.baseline?.metrics ?? {});
    setNotes(data.baseline?.notes ?? "");
    setSelectedBin((data.bin as "A" | "B" | "C" | null) ?? "");

    const fields = normalizeTemplateFields(data.template?.fields);
    if (fields.length > 0) {
      setTemplateFields(fields);
      setUsingFallbackTemplate(false);
    } else {
      setTemplateFields(FALLBACK_TEMPLATE_FIELDS);
      setUsingFallbackTemplate(true);
    }
  }, []);

  useEffect(() => {
    async function loadInitial() {
      if (!experimentId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");

      try {
        const meResponse = await backendFetch("/api/me");
        if (meResponse.status === 403) {
          setNotInvited(true);
          return;
        }

        const [statusData, plantsData] = await Promise.all([
          fetchBaselineStatus(),
          fetchPlants(),
        ]);
        if (!statusData) {
          return;
        }

        const preferredPlant =
          preselectedPlantId && statusData.plants.some((plant) => plant.id === preselectedPlantId)
            ? preselectedPlantId
            : pickNextPlant(statusData, null);

        if (preferredPlant && plantsData.some((plant) => plant.id === preferredPlant)) {
          setSelectedPlantId(preferredPlant);
        }

        setOffline(false);
      } catch (requestError) {
        setError(handleRequestError(requestError, "Unable to load baseline capture."));
      } finally {
        setLoading(false);
      }
    }

    void loadInitial();
  }, [experimentId, fetchBaselineStatus, fetchPlants, preselectedPlantId]);

  useEffect(() => {
    async function loadSelectedPlantBaseline() {
      if (!selectedPlantId) {
        return;
      }
      setError("");
      try {
        await fetchPlantBaseline(selectedPlantId);
      } catch (requestError) {
        setError(handleRequestError(requestError, "Unable to load selected plant baseline."));
      }
    }

    void loadSelectedPlantBaseline();
  }, [fetchPlantBaseline, selectedPlantId]);

  async function uploadBaselinePhoto(plantId: string) {
    if (!photoFile) {
      return;
    }

    const formData = new FormData();
    formData.append("experiment", experimentId);
    formData.append("plant", plantId);
    formData.append("week_number", "0");
    formData.append("tag", "baseline");
    formData.append("file", photoFile);

    const response = await backendFetch("/api/v1/photos/", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error("Baseline saved, but photo upload failed.");
    }

    setPhotoFile(null);
  }

  async function saveBaseline(advance: boolean) {
    if (!selectedPlantId) {
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const payload: Record<string, unknown> = {
        metrics,
        notes,
      };
      if (selectedBin) {
        payload.bin = selectedBin;
      }

      const response = await backendFetch(`/api/v1/plants/${selectedPlantId}/baseline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = (await response.json()) as {
          detail?: string;
          metrics?: string[];
        };
        setError(data.metrics?.join(" ") || data.detail || "Unable to save baseline.");
        return;
      }

      await uploadBaselinePhoto(selectedPlantId);
      const statusData = await fetchBaselineStatus();
      await fetchPlants();
      await fetchPlantBaseline(selectedPlantId);

      if (advance && statusData) {
        const nextPlantId = pickNextPlant(statusData, selectedPlantId);
        if (nextPlantId) {
          setSelectedPlantId(nextPlantId);
        }
      }

      setNotice(advance ? "Baseline saved. Moved to next plant." : "Baseline saved.");
      setOffline(false);
    } catch (requestError) {
      setError(handleRequestError(requestError, "Unable to save baseline."));
    } finally {
      setSaving(false);
    }
  }

  function updateMetricValue(field: TemplateField, rawValue: string | boolean) {
    setMetrics((prev) => {
      const next = { ...prev };

      if (field.type === "bool") {
        next[field.key] = rawValue;
        return next;
      }

      if (typeof rawValue !== "string") {
        return next;
      }

      if (rawValue === "") {
        delete next[field.key];
        return next;
      }

      if (field.type === "int") {
        next[field.key] = Number.parseInt(rawValue, 10);
      } else if (field.type === "float") {
        next[field.key] = Number.parseFloat(rawValue);
      } else {
        next[field.key] = rawValue;
      }
      return next;
    });
  }

  if (notInvited) {
    return (
      <PageShell title="Baseline Capture">
        <SectionCard>
          <IllustrationPlaceholder inventoryId="ILL-001" kind="notInvited" />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Baseline Capture"
      subtitle={`Experiment: ${experimentId}`}
      stickyOffset
      actions={
        <div className={styles.actions}>
          <Link className={styles.buttonSecondary} href={`/experiments/${experimentId}/setup`}>
            Back to setup
          </Link>
          <Link className={styles.buttonSecondary} href={`/experiments/${experimentId}/plants`}>
            Plants list
          </Link>
        </div>
      }
    >
      {loading ? <p className={styles.mutedText}>Loading baseline workflow...</p> : null}
      {error ? <p className={styles.errorText}>{error}</p> : null}
      {notice ? <p className={styles.successText}>{notice}</p> : null}
      {offline ? <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" /> : null}

      {baselineStatus ? (
        <SectionCard title="Status">
          <p className={styles.mutedText}>Plants: {baselineStatus.total_plants}</p>
          <p className={styles.mutedText}>Baseline done: {baselineStatus.baseline_completed}</p>
          <p className={styles.mutedText}>Bins assigned: {baselineStatus.bins_assigned}</p>
          <p className={styles.mutedText}>Baseline photos: {baselineStatus.photos_count}</p>
          {baselineLocked ? (
            <p className={styles.successText}>Baseline is locked for this experiment.</p>
          ) : null}
        </SectionCard>
      ) : null}

      {baselineStatus && baselineStatus.total_plants === 0 ? (
        <SectionCard title="Plants">
          <IllustrationPlaceholder inventoryId="ILL-201" kind="noPlants" />
        </SectionCard>
      ) : null}

      {baselineStatus && baselineStatus.total_plants > 0 ? (
        <>
          <SectionCard title="Plant Queue">
            <ResponsiveList
              items={baselineStatus.plants}
              getKey={(plant) => plant.id}
              columns={[
                {
                  key: "plant_id",
                  label: "Plant ID",
                  render: (plant) => plant.plant_id || "(pending)",
                },
                {
                  key: "species",
                  label: "Species",
                  render: (plant) => plant.species_name,
                },
                {
                  key: "baseline",
                  label: "Baseline",
                  render: (plant) => (plant.baseline_done ? "Done" : "Missing"),
                },
                {
                  key: "bin",
                  label: "Bin",
                  render: (plant) => plant.bin || "Missing",
                },
              ]}
              renderMobileCard={(plant) => (
                <div className={styles.cardKeyValue}>
                  <span>Plant ID</span>
                  <strong>{plant.plant_id || "(pending)"}</strong>
                  <span>Species</span>
                  <strong>{plant.species_name}</strong>
                  <span>Baseline</span>
                  <strong>{plant.baseline_done ? "Done" : "Missing"}</strong>
                  <span>Bin</span>
                  <strong>{plant.bin || "Missing"}</strong>
                  <button
                    className={styles.buttonSecondary}
                    type="button"
                    onClick={() => setSelectedPlantId(plant.id)}
                  >
                    Capture this plant
                  </button>
                </div>
              )}
            />
          </SectionCard>

          {selectedPlant ? (
            <SectionCard title="Capture Baseline">
              <div className={styles.cardKeyValue}>
                <span>Plant ID</span>
                <strong>{selectedPlant.plant_id || "(pending)"}</strong>
                <span>Species</span>
                <strong>{selectedPlant.species_name}</strong>
                <span>Category</span>
                <strong>{selectedPlant.species_category || "-"}</strong>
                <span>Current Bin</span>
                <strong>{selectedPlant.bin || "Unassigned"}</strong>
              </div>

              {usingFallbackTemplate ? (
                <p className={styles.mutedText}>
                  No metric template found for this species category. Using fallback MVP fields.
                </p>
              ) : null}

              <div className={styles.formGrid}>
                {templateFields.map((field) => {
                  if (field.type === "bool") {
                    return (
                      <label className={styles.field} key={field.key}>
                        <span className={styles.fieldLabel}>{field.label}</span>
                        <input
                          className={styles.input}
                          type="checkbox"
                          checked={Boolean(metrics[field.key])}
                          disabled={saving || baselineLocked}
                          onChange={(event) =>
                            updateMetricValue(field, event.target.checked)
                          }
                        />
                      </label>
                    );
                  }

                  if (field.type === "text") {
                    return (
                      <label className={styles.field} key={field.key}>
                        <span className={styles.fieldLabel}>{field.label}</span>
                        <textarea
                          className={styles.textarea}
                          value={String(metrics[field.key] ?? "")}
                          disabled={saving || baselineLocked}
                          onChange={(event) =>
                            updateMetricValue(field, event.target.value)
                          }
                        />
                      </label>
                    );
                  }

                  return (
                    <label className={styles.field} key={field.key}>
                      <span className={styles.fieldLabel}>{field.label}</span>
                      <input
                        className={styles.input}
                        type="number"
                        min={field.min}
                        max={field.max}
                        step={field.type === "int" ? "1" : "0.1"}
                        value={
                          typeof metrics[field.key] === "number"
                            ? String(metrics[field.key])
                            : ""
                        }
                        disabled={saving || baselineLocked}
                        onChange={(event) =>
                          updateMetricValue(field, event.target.value)
                        }
                      />
                    </label>
                  );
                })}

                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Bin Assignment</span>
                  <div className={styles.actions}>
                    {(["A", "B", "C"] as const).map((binValue) => (
                      <button
                        key={binValue}
                        type="button"
                        disabled={saving || baselineLocked}
                        className={
                          selectedBin === binValue
                            ? styles.buttonPrimary
                            : styles.buttonSecondary
                        }
                        onClick={() => setSelectedBin(binValue)}
                      >
                        Bin {binValue}
                      </button>
                    ))}
                  </div>
                </label>

                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Baseline Photo (optional)</span>
                  <input
                    className={styles.input}
                    type="file"
                    accept="image/*"
                    disabled={saving || baselineLocked}
                    onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)}
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Notes</span>
                  <textarea
                    className={styles.textarea}
                    value={notes}
                    disabled={saving || baselineLocked}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </label>
              </div>
            </SectionCard>
          ) : null}

          <StickyActionBar>
            <button
              className={styles.buttonPrimary}
              type="button"
              disabled={saving || baselineLocked || !selectedPlantId}
              onClick={() => void saveBaseline(false)}
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              className={styles.buttonSecondary}
              type="button"
              disabled={saving || baselineLocked || !selectedPlantId}
              onClick={() => void saveBaseline(true)}
            >
              {saving ? "Saving..." : "Save & Next"}
            </button>
          </StickyActionBar>
        </>
      ) : null}
    </PageShell>
  );
}
