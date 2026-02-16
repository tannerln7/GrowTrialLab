"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { backendFetch, normalizeBackendError, unwrapList } from "@/lib/backend";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import PageShell from "@/src/components/ui/PageShell";
import ResponsiveList from "@/src/components/ui/ResponsiveList";
import SectionCard from "@/src/components/ui/SectionCard";
import StickyActionBar from "@/src/components/ui/StickyActionBar";

import styles from "../../experiments.module.css";

type QueuePlant = {
  uuid: string;
  plant_id: string;
  species_name: string;
  species_category: string;
  cultivar: string | null;
  status: string;
  has_baseline: boolean;
  has_grade: boolean;
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

type PlantBaseline = {
  plant_id: string;
  grade: "A" | "B" | "C" | null;
  has_baseline: boolean;
  metrics: Record<string, unknown>;
  notes: string;
  baseline_locked: boolean;
};

function queueNeedsBaseline(plant: QueuePlant): boolean {
  return !plant.has_baseline || !plant.has_grade;
}

export default function BaselinePage() {
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
  const [notInvited, setNotInvited] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [plants, setPlants] = useState<PlantRow[]>([]);
  const [queue, setQueue] = useState<BaselineQueue | null>(null);
  const [selectedPlantId, setSelectedPlantId] = useState("");
  const [grade, setGrade] = useState<"A" | "B" | "C" | "">("");
  const [notes, setNotes] = useState("");
  const [metricsJson, setMetricsJson] = useState("{}\n");
  const [editingUnlocked, setEditingUnlocked] = useState(false);
  const queuePlants = useMemo(
    () => (queue ? unwrapList<QueuePlant>(queue.plants) : []),
    [queue],
  );

  const loadQueue = useCallback(async () => {
    const response = await backendFetch(`/api/v1/experiments/${experimentId}/baseline/queue`);
    if (!response.ok) {
      throw new Error("Unable to load baseline queue.");
    }
    const payload = (await response.json()) as BaselineQueue;
    setQueue(payload);
    return payload;
  }, [experimentId]);

  const loadPlantBaseline = useCallback(async (plantId: string) => {
    const response = await backendFetch(`/api/v1/plants/${plantId}/baseline`);
    if (!response.ok) {
      throw new Error("Unable to load baseline.");
    }
    const payload = (await response.json()) as PlantBaseline;
    setGrade(payload.grade || "");
    setNotes(payload.notes || "");
    setMetricsJson(`${JSON.stringify(payload.metrics || {}, null, 2)}\n`);
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

  const baselineLocked = queue?.baseline_locked ?? false;
  const readOnly = baselineLocked && !editingUnlocked;

  const nextMissingPlant = useMemo(() => {
    if (!queue || queue.remaining_count <= 0) {
      return null;
    }
    if (!selectedPlantId) {
      return queuePlants.find((plant) => queueNeedsBaseline(plant)) || null;
    }
    const index = queuePlants.findIndex((item) => item.uuid === selectedPlantId);
    const after = queuePlants.slice(index + 1).find((plant) => queueNeedsBaseline(plant));
    if (after) {
      return after;
    }
    return queuePlants.find((plant) => queueNeedsBaseline(plant)) || null;
  }, [queue, queuePlants, selectedPlantId]);

  function jumpToPlant(plantId: string) {
    const nextQuery = new URLSearchParams(searchParams.toString());
    nextQuery.set("plant", plantId);
    router.replace(`/experiments/${experimentId}/baseline?${nextQuery.toString()}`);
  }

  async function saveBaseline(saveAndNext: boolean) {
    if (!selectedPlantId || readOnly) {
      return;
    }

    let metrics: Record<string, unknown>;
    try {
      metrics = JSON.parse(metricsJson) as Record<string, unknown>;
      if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) {
        setError("Metrics JSON must be an object.");
        return;
      }
    } catch {
      setError("Metrics JSON is invalid.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await backendFetch(`/api/v1/plants/${selectedPlantId}/baseline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metrics,
          notes,
          grade: grade || null,
        }),
      });
      const payload = (await response.json()) as { detail?: string };
      if (!response.ok) {
        setError(payload.detail || "Unable to save baseline.");
        return;
      }

      await loadPlantBaseline(selectedPlantId);
      const refreshedQueue = await loadQueue();
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
      const nextPlant = refreshedRows.find((plant) => queueNeedsBaseline(plant) && plant.uuid !== selectedPlantId)
        || refreshedRows.find((plant) => queueNeedsBaseline(plant));
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
      subtitle="Record week 0 metrics and assign grades."
      actions={
        <Link className={styles.buttonPrimary} href={`/experiments/${experimentId}/overview`}>
          ← Overview
        </Link>
      }
    >
      {loading ? <p className={styles.mutedText}>Loading baseline queue...</p> : null}
      {error ? <p className={styles.errorText}>{error}</p> : null}
      {notice ? <p className={styles.successText}>{notice}</p> : null}
      {offline ? <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" /> : null}

      <SectionCard title="Queue Status">
        <p className={styles.mutedText}>Remaining baselines: {queue?.remaining_count ?? 0}</p>
        {baselineLocked ? (
          <p className={styles.inlineNote}>Baseline is locked in UI. Unlock editing for this session to continue.</p>
        ) : null}
        <div className={styles.actions}>
          {baselineLocked && !editingUnlocked ? (
            <button className={styles.buttonDanger} type="button" onClick={() => setEditingUnlocked(true)}>
              Unlock editing
            </button>
          ) : null}
          {baselineLocked && editingUnlocked ? (
            <button className={styles.buttonSecondary} type="button" onClick={() => setEditingUnlocked(false)}>
              Re-lock UI
            </button>
          ) : null}
          {!baselineLocked ? (
            <button className={styles.buttonSecondary} type="button" disabled={saving} onClick={() => void lockBaseline()}>
              Lock baseline
            </button>
          ) : null}
          {nextMissingPlant ? (
            <button className={styles.buttonSecondary} type="button" onClick={() => jumpToPlant(nextMissingPlant.uuid)}>
              Next missing baseline
            </button>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Plant Queue">
        {queue ? (
          <ResponsiveList
            items={queuePlants}
            getKey={(plant) => plant.uuid}
            columns={[
              { key: "plant", label: "Plant", render: (plant) => plant.plant_id || "(pending)" },
              { key: "species", label: "Species", render: (plant) => plant.species_name },
              {
                key: "baseline",
                label: "Baseline",
                render: (plant) => (plant.has_baseline ? "Complete" : "Missing"),
              },
              {
                key: "grade",
                label: "Grade",
                render: (plant) => (plant.has_grade ? "Assigned" : "Missing"),
              },
              {
                key: "action",
                label: "Action",
                render: (plant) => (
                  <button className={styles.buttonSecondary} type="button" onClick={() => jumpToPlant(plant.uuid)}>
                    Open
                  </button>
                ),
              },
            ]}
            renderMobileCard={(plant) => (
              <div className={styles.cardKeyValue}>
                <span>Plant</span>
                <strong>{plant.plant_id || "(pending)"}</strong>
                <span>Species</span>
                <strong>{plant.species_name}</strong>
                <span>Baseline</span>
                <strong>{plant.has_baseline ? "Complete" : "Missing"}</strong>
                <span>Grade</span>
                <strong>{plant.has_grade ? "Assigned" : "Missing"}</strong>
                <button className={styles.buttonSecondary} type="button" onClick={() => jumpToPlant(plant.uuid)}>
                  Open
                </button>
              </div>
            )}
          />
        ) : null}
      </SectionCard>

      {selectedPlantId ? (
        <SectionCard title="Capture Baseline">
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Plant</span>
              <select
                className={styles.select}
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

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Grade</span>
              <div className={styles.actions}>
                {(["A", "B", "C"] as const).map((value) => (
                  <button
                    key={value}
                    className={grade === value ? styles.buttonPrimary : styles.buttonSecondary}
                    type="button"
                    disabled={saving || readOnly}
                    onClick={() => setGrade(value)}
                  >
                    Grade {value}
                  </button>
                ))}
              </div>
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Metrics (JSON)</span>
              <textarea
                className={styles.textarea}
                value={metricsJson}
                onChange={(event) => setMetricsJson(event.target.value)}
                rows={8}
                disabled={saving || readOnly}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Notes</span>
              <textarea
                className={styles.textarea}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                disabled={saving || readOnly}
              />
            </label>
          </div>
        </SectionCard>
      ) : null}

      <StickyActionBar>
        <button
          className={styles.buttonPrimary}
          type="button"
          disabled={saving || readOnly || !selectedPlantId}
          onClick={() => void saveBaseline(false)}
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          className={styles.buttonSecondary}
          type="button"
          disabled={saving || readOnly || !selectedPlantId || (queue?.remaining_count ?? 0) === 0}
          onClick={() => void saveBaseline(true)}
        >
          Save & Next
        </button>
      </StickyActionBar>

      {!loading && queue && queue.remaining_count === 0 ? (
        <SectionCard>
          <p className={styles.successText}>All active plants have baseline metrics and grade assignments.</p>
          <Link className={styles.buttonPrimary} href={`/experiments/${experimentId}/overview`}>
            Back to Overview
          </Link>
        </SectionCard>
      ) : null}
    </PageShell>
  );
}
