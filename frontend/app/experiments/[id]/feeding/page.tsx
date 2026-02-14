"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { backendFetch, normalizeBackendError } from "@/lib/backend";
import {
  fetchExperimentStatusSummary,
  type ExperimentStatusSummary,
} from "@/lib/experiment-status";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import PageShell from "@/src/components/ui/PageShell";
import ResponsiveList from "@/src/components/ui/ResponsiveList";
import SectionCard from "@/src/components/ui/SectionCard";
import StickyActionBar from "@/src/components/ui/StickyActionBar";

import styles from "../../experiments.module.css";

type FeedingQueuePlant = {
  uuid: string;
  plant_id: string;
  species_name: string;
  species_category: string;
  cultivar: string | null;
  assigned_recipe_id: string | null;
  assigned_recipe_code: string | null;
  assigned_recipe_name: string | null;
  last_fed_at: string | null;
  needs_feeding: boolean;
};

type FeedingQueueResponse = {
  remaining_count: number;
  window_days: number;
  plants: FeedingQueuePlant[];
};

function normalizeFromParam(rawFrom: string | null): string | null {
  if (!rawFrom) {
    return null;
  }
  let decoded = rawFrom;
  try {
    decoded = decodeURIComponent(rawFrom);
  } catch {
    decoded = rawFrom;
  }
  if (decoded.startsWith("/experiments/")) {
    return decoded;
  }
  return null;
}

function formatLastFed(lastFedAt: string | null): string {
  if (!lastFedAt) {
    return "Never";
  }
  const parsed = new Date(lastFedAt);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }
  const now = Date.now();
  const diffMs = now - parsed.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  if (diffDays === 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "1 day ago";
  }
  return `${diffDays} days ago`;
}

function pickNextNeedingFeed(
  queue: FeedingQueueResponse,
  currentPlantId: string | null,
): string | null {
  const missing = queue.plants.filter((plant) => plant.needs_feeding);
  if (missing.length === 0) {
    return null;
  }
  if (!currentPlantId) {
    return missing[0].uuid;
  }
  const next = missing.find((plant) => plant.uuid !== currentPlantId);
  return next ? next.uuid : missing[0].uuid;
}

export default function FeedingPage() {
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
  const preselectedPlantId = searchParams.get("plant");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notInvited, setNotInvited] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [statusSummary, setStatusSummary] = useState<ExperimentStatusSummary | null>(null);
  const [queue, setQueue] = useState<FeedingQueueResponse | null>(null);
  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null);
  const [amountText, setAmountText] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");

  const fromParam = useMemo(() => normalizeFromParam(searchParams.get("from")), [searchParams]);
  const overviewHref = fromParam || `/experiments/${experimentId}/overview`;

  const selectedPlant = useMemo(
    () => queue?.plants.find((plant) => plant.uuid === selectedPlantId) ?? null,
    [queue?.plants, selectedPlantId],
  );
  const upNext = useMemo(() => {
    if (!queue) {
      return [];
    }
    return queue.plants
      .filter((plant) => plant.needs_feeding && plant.uuid !== selectedPlantId)
      .slice(0, 3);
  }, [queue, selectedPlantId]);
  const canSaveAndNext = (queue?.remaining_count ?? 0) > 0;
  const selectedPlantAssigned = Boolean(selectedPlant?.assigned_recipe_id);
  const saveBlockedByAssignment = Boolean(selectedPlant && !selectedPlantAssigned);

  const updatePlantQuery = useCallback(
    (plantId: string | null) => {
      const currentPlant = searchParams.get("plant");
      if ((currentPlant ?? null) === plantId) {
        return;
      }
      const nextParams = new URLSearchParams(searchParams.toString());
      if (plantId) {
        nextParams.set("plant", plantId);
      } else {
        nextParams.delete("plant");
      }
      const query = nextParams.toString();
      router.replace(`/experiments/${experimentId}/feeding${query ? `?${query}` : ""}`);
    },
    [experimentId, router, searchParams],
  );

  const selectPlant = useCallback(
    (plantId: string | null, options?: { syncUrl?: boolean }) => {
      setSelectedPlantId(plantId);
      if (options?.syncUrl !== false) {
        updatePlantQuery(plantId);
      }
    },
    [updatePlantQuery],
  );

  const loadQueue = useCallback(async () => {
    const response = await backendFetch(`/api/v1/experiments/${experimentId}/feeding/queue`);
    if (!response.ok) {
      throw new Error("Unable to load feeding queue.");
    }
    const payload = (await response.json()) as FeedingQueueResponse;
    setQueue(payload);
    return payload;
  }, [experimentId]);

  useEffect(() => {
    async function load() {
      if (!experimentId) {
        return;
      }

      setLoading(true);
      setError("");
      setOffline(false);
      setNotInvited(false);
      try {
        const meResponse = await backendFetch("/api/me");
        if (meResponse.status === 403) {
          setNotInvited(true);
          return;
        }

        const summary = await fetchExperimentStatusSummary(experimentId);
        if (!summary) {
          setError("Unable to load experiment status.");
          return;
        }
        setStatusSummary(summary);
        if (!summary.setup.is_complete) {
          router.replace(`/experiments/${experimentId}/setup`);
          return;
        }

        if (summary.lifecycle.state !== "running") {
          return;
        }

        const queuePayload = await loadQueue();
        if (preselectedPlantId) {
          setSelectedPlantId(preselectedPlantId);
        } else if (queuePayload.remaining_count > 0) {
          const nextPlant = pickNextNeedingFeed(queuePayload, null);
          if (nextPlant) {
            selectPlant(nextPlant);
          }
        } else if (queuePayload.plants.length > 0) {
          selectPlant(queuePayload.plants[0].uuid);
        }
      } catch (requestError) {
        const normalized = normalizeBackendError(requestError);
        if (normalized.kind === "offline") {
          setOffline(true);
        }
        setError("Unable to load feeding queue.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [experimentId, loadQueue, preselectedPlantId, router, selectPlant]);

  async function saveFeeding(moveNext: boolean) {
    if (!selectedPlantId) {
      setError("Choose a plant to feed.");
      return;
    }
    if (!selectedPlantAssigned) {
      setError("This plant needs assignment before feeding.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        amount_text: amountText.trim() || undefined,
        note: note.trim() || undefined,
      };
      const response = await backendFetch(`/api/v1/plants/${selectedPlantId}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as { detail?: string };
      if (!response.ok) {
        setError(body.detail || "Unable to save feeding event.");
        return;
      }

      setNotice("Feeding saved.");
      setAmountText("");
      setNote("");
      setShowNote(false);

      const refreshedQueue = await loadQueue();
      if (moveNext) {
        const nextPlantId = pickNextNeedingFeed(refreshedQueue, selectedPlantId);
        if (!nextPlantId) {
          router.push(`/experiments/${experimentId}/overview?refresh=${Date.now()}`);
          return;
        }
        selectPlant(nextPlantId);
      }
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to save feeding event.");
    } finally {
      setSaving(false);
    }
  }

  if (notInvited) {
    return (
      <PageShell title="Feeding">
        <SectionCard>
          <IllustrationPlaceholder inventoryId="ILL-001" kind="notInvited" />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Feeding"
      subtitle="Record feeding quickly for active plants."
      actions={
        <Link className={styles.buttonPrimary} href={overviewHref}>
          ← Overview
        </Link>
      }
    >
      {loading ? <p className={styles.mutedText}>Loading feeding queue...</p> : null}
      {error ? <p className={styles.errorText}>{error}</p> : null}
      {notice ? <p className={styles.successText}>{notice}</p> : null}
      {offline ? <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" /> : null}

      {statusSummary && statusSummary.lifecycle.state !== "running" ? (
        <SectionCard title="Feeding Requires Running State">
          <p className={styles.mutedText}>
            Feeding is available only while an experiment is running.
          </p>
          <Link className={styles.buttonPrimary} href={`/experiments/${experimentId}/overview`}>
            Start experiment from Overview
          </Link>
        </SectionCard>
      ) : null}

      {statusSummary && statusSummary.lifecycle.state === "running" && queue ? (
        <>
          <SectionCard title="Queue Status">
            <div className={styles.stack}>
              <span className={styles.badgeWarn}>
                Remaining feedings: {queue.remaining_count}
              </span>
              <p className={styles.mutedText}>
                Window: feed plants at least once every {queue.window_days} days.
              </p>
              {selectedPlant && !selectedPlant.needs_feeding ? (
                <p className={styles.inlineNote}>
                  This plant is already within the feeding window.
                </p>
              ) : null}
              {queue.remaining_count > 0 ? (
                <button
                  className={styles.buttonSecondary}
                  type="button"
                  onClick={() => {
                    const next = pickNextNeedingFeed(queue, selectedPlantId);
                    if (next) {
                      selectPlant(next);
                    }
                  }}
                >
                  Next needing feeding
                </button>
              ) : (
                <p className={styles.successText}>All plants are up to date.</p>
              )}
            </div>
          </SectionCard>

          {queue.remaining_count === 0 && !selectedPlant ? (
            <SectionCard title="All Feedings Complete">
              <p className={styles.mutedText}>
                No active plants currently need feeding.
              </p>
              <Link className={styles.buttonPrimary} href={`/experiments/${experimentId}/overview`}>
                Back to Overview
              </Link>
            </SectionCard>
          ) : null}

          <SectionCard title="Feed Plant">
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Plant</span>
                <select
                  className={styles.select}
                  value={selectedPlantId ?? ""}
                  onChange={(event) => selectPlant(event.target.value || null)}
                >
                  <option value="">Select plant</option>
                  {queue.plants.map((plant) => (
                    <option key={plant.uuid} value={plant.uuid}>
                      {plant.plant_id || "(pending)"} - {plant.species_name}
                    </option>
                  ))}
                </select>
              </label>
              {selectedPlant ? (
                <div className={styles.stack}>
                  <p className={styles.mutedText}>
                    Last fed: {formatLastFed(selectedPlant.last_fed_at)}
                  </p>
                  <p className={styles.mutedText}>
                    Assigned recipe:{" "}
                    {selectedPlant.assigned_recipe_code
                      ? `${selectedPlant.assigned_recipe_code}${selectedPlant.assigned_recipe_name ? ` - ${selectedPlant.assigned_recipe_name}` : ""}`
                      : "Unassigned"}
                  </p>
                </div>
              ) : null}
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Amount (optional)</span>
                <input
                  className={styles.input}
                  value={amountText}
                  onChange={(event) => setAmountText(event.target.value)}
                  placeholder="3 drops"
                />
              </label>
              <button
                className={styles.buttonSecondary}
                type="button"
                onClick={() => setShowNote((current) => !current)}
              >
                {showNote ? "Hide note" : "Add note"}
              </button>
              {showNote ? (
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Note (optional)</span>
                  <textarea
                    className={styles.textarea}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </label>
              ) : null}
            </div>
          </SectionCard>

          {saveBlockedByAssignment ? (
            <SectionCard title="Assignment Required Before Feeding">
              <p className={styles.mutedText}>
                This plant needs assignment before feeding.
              </p>
              <Link className={styles.buttonPrimary} href={`/experiments/${experimentId}/assignment`}>
                Go to Assignment
              </Link>
            </SectionCard>
          ) : null}

          {upNext.length > 0 ? (
            <SectionCard title="Up Next">
              <ResponsiveList
                items={upNext}
                getKey={(plant) => plant.uuid}
                columns={[
                  {
                    key: "plant_id",
                    label: "Plant",
                    render: (plant) => plant.plant_id || "(pending)",
                  },
                  {
                    key: "species",
                    label: "Species",
                    render: (plant) => plant.species_name,
                  },
                  {
                    key: "last_fed",
                    label: "Last fed",
                    render: (plant) => formatLastFed(plant.last_fed_at),
                  },
                ]}
                renderMobileCard={(plant) => (
                  <div className={styles.cardKeyValue}>
                    <span>Plant</span>
                    <strong>{plant.plant_id || "(pending)"}</strong>
                    <span>Species</span>
                    <strong>{plant.species_name}</strong>
                    <span>Last fed</span>
                    <strong>{formatLastFed(plant.last_fed_at)}</strong>
                    <button
                      className={styles.buttonSecondary}
                      type="button"
                      onClick={() => selectPlant(plant.uuid)}
                    >
                      Select
                    </button>
                  </div>
                )}
              />
            </SectionCard>
          ) : null}

          <StickyActionBar>
            <button
              className={styles.buttonPrimary}
              type="button"
              disabled={!selectedPlantId || saving || saveBlockedByAssignment}
              onClick={() => void saveFeeding(false)}
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              className={styles.buttonSecondary}
              type="button"
              disabled={!selectedPlantId || saving || !canSaveAndNext || saveBlockedByAssignment}
              onClick={() => void saveFeeding(true)}
            >
              Save & Next
            </button>
          </StickyActionBar>
        </>
      ) : null}
    </PageShell>
  );
}
