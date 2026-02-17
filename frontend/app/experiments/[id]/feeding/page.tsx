"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { backendFetch, normalizeBackendError, unwrapList } from "@/lib/backend";
import {
  fetchExperimentStatusSummary,
  type ExperimentStatusSummary,
} from "@/lib/experiment-status";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import PageShell from "@/src/components/ui/PageShell";
import ResponsiveList from "@/src/components/ui/ResponsiveList";
import SectionCard from "@/src/components/ui/SectionCard";
import StickyActionBar from "@/src/components/ui/StickyActionBar";


type Location = {
  status: "placed" | "unplaced";
  tent: { id: string; code: string | null; name: string } | null;
  slot: {
    id: string;
    code: string;
    label: string;
    shelf_index: number;
    slot_index: number;
  } | null;
  tray: {
    id: string;
    code: string;
    name: string;
    capacity: number;
    current_count: number;
  } | null;
};

type FeedingQueuePlant = {
  uuid: string;
  plant_id: string;
  species_name: string;
  species_category: string;
  cultivar: string | null;
  assigned_recipe: { id: string; code: string; name: string } | null;
  location: Location;
  blocked_reason: string | null;
  last_fed_at: string | null;
  needs_feeding: boolean;
};

type FeedingQueueResponse = {
  remaining_count: number;
  window_days: number;
  plants: {
    count: number;
    results: FeedingQueuePlant[];
    meta: Record<string, unknown>;
  };
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
  plants: FeedingQueuePlant[],
  currentPlantId: string | null,
): string | null {
  const missing = plants.filter((plant) => plant.needs_feeding);
  if (missing.length === 0) {
    return null;
  }
  if (!currentPlantId) {
    return missing[0].uuid;
  }
  const next = missing.find((plant) => plant.uuid !== currentPlantId);
  return next ? next.uuid : missing[0].uuid;
}

function locationLabel(plant: FeedingQueuePlant): string {
  if (plant.location.status !== "placed" || !plant.location.slot || !plant.location.tray) {
    return "Unplaced";
  }
  return `${plant.location.slot.code} / ${plant.location.tray.code || plant.location.tray.name}`;
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
  const preselectedPlantId = useMemo(() => searchParams.get("plant"), [searchParams]);
  const rawFromParam = useMemo(() => searchParams.get("from"), [searchParams]);

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

  const fromParam = useMemo(() => normalizeFromParam(rawFromParam), [rawFromParam]);
  const overviewHref = fromParam || `/experiments/${experimentId}/overview`;

  const queuePlants = useMemo(() => (queue ? unwrapList<FeedingQueuePlant>(queue.plants) : []), [queue]);

  const selectedPlant = useMemo(
    () => queuePlants.find((plant) => plant.uuid === selectedPlantId) ?? null,
    [queuePlants, selectedPlantId],
  );

  const upNext = useMemo(
    () => queuePlants.filter((plant) => plant.needs_feeding && plant.uuid !== selectedPlantId).slice(0, 3),
    [queuePlants, selectedPlantId],
  );

  const canSaveAndNext = (queue?.remaining_count ?? 0) > 0;
  const saveBlockedReason = selectedPlant?.blocked_reason ?? null;
  const saveBlocked = Boolean(saveBlockedReason);

  const syncPlantInUrl = useCallback(
    (plantId: string | null) => {
      const current = preselectedPlantId ?? null;
      if (current === plantId) {
        return;
      }
      const nextParams = new URLSearchParams();
      if (rawFromParam) {
        nextParams.set("from", rawFromParam);
      }
      if (plantId) {
        nextParams.set("plant", plantId);
      }
      const query = nextParams.toString();
      router.replace(`/experiments/${experimentId}/feeding${query ? `?${query}` : ""}`);
    },
    [experimentId, preselectedPlantId, rawFromParam, router],
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
        const plants = unwrapList<FeedingQueuePlant>(queuePayload.plants);
        if (preselectedPlantId) {
          setSelectedPlantId(preselectedPlantId);
        } else {
          const nextPlant =
            pickNextNeedingFeed(plants, null) ||
            plants[0]?.uuid ||
            null;
          setSelectedPlantId(nextPlant);
          if (nextPlant) {
            syncPlantInUrl(nextPlant);
          }
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
  }, [experimentId, loadQueue, preselectedPlantId, router, syncPlantInUrl]);

  function selectPlant(plantId: string | null, syncUrl = true) {
    setSelectedPlantId(plantId);
    if (syncUrl) {
      syncPlantInUrl(plantId);
    }
  }

  async function saveFeeding(moveNext: boolean) {
    if (!selectedPlantId) {
      setError("Choose a plant to feed.");
      return;
    }
    if (saveBlockedReason) {
      setError(`Cannot feed this plant yet: ${saveBlockedReason}.`);
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
      const refreshedPlants = unwrapList<FeedingQueuePlant>(refreshedQueue.plants);
      if (moveNext) {
        const nextPlantId = pickNextNeedingFeed(refreshedPlants, selectedPlantId);
        if (!nextPlantId) {
          router.push(`/experiments/${experimentId}/overview?refresh=${Date.now()}`);
          return;
        }
        selectPlant(nextPlantId, true);
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
        <Link className={"inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90"} href={overviewHref}>
          ← Overview
        </Link>
      }
    >
      {loading ? <p className={"text-sm text-muted-foreground"}>Loading feeding queue...</p> : null}
      {error ? <p className={"text-sm text-destructive"}>{error}</p> : null}
      {notice ? <p className={"text-sm text-emerald-400"}>{notice}</p> : null}
      {offline ? <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" /> : null}

      {statusSummary && statusSummary.lifecycle.state !== "running" ? (
        <SectionCard title="Feeding Requires Running State">
          <p className={"text-sm text-muted-foreground"}>Feeding is available only while an experiment is running.</p>
          <Link className={"inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90"} href={`/experiments/${experimentId}/overview`}>
            Start experiment from Overview
          </Link>
        </SectionCard>
      ) : null}

      {statusSummary && statusSummary.lifecycle.state === "running" && queue ? (
        <>
          <SectionCard title="Queue Status">
            <div className={"grid gap-3"}>
              <span className={"inline-flex items-center justify-center rounded-full border border-border bg-muted px-2 py-0.5 text-[0.72rem] leading-tight text-muted-foreground"}>Remaining feedings: {queue.remaining_count}</span>
              <p className={"text-sm text-muted-foreground"}>Window: feed plants at least once every {queue.window_days} days.</p>
              {selectedPlant && !selectedPlant.needs_feeding ? (
                <p className={"text-sm text-muted-foreground"}>This plant is already within the feeding window.</p>
              ) : null}
              {queue.remaining_count > 0 ? (
                <button
                  className={"inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80"}
                  type="button"
                  onClick={() => {
                    const next = pickNextNeedingFeed(queuePlants, selectedPlantId);
                    if (next) {
                      selectPlant(next, true);
                    }
                  }}
                >
                  Next needing feeding
                </button>
              ) : (
                <p className={"text-sm text-emerald-400"}>All plants are up to date.</p>
              )}
            </div>
          </SectionCard>

          {queue.remaining_count === 0 && !selectedPlant ? (
            <SectionCard title="All Feedings Complete">
              <p className={"text-sm text-muted-foreground"}>No active plants currently need feeding.</p>
              <Link className={"inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90"} href={`/experiments/${experimentId}/overview`}>
                Back to Overview
              </Link>
            </SectionCard>
          ) : null}

          <SectionCard title="Feed Plant">
            <div className={"grid gap-3"}>
              <label className={"grid gap-2"}>
                <span className={"text-sm text-muted-foreground"}>Plant</span>
                <select
                  className={"flex h-9 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"}
                  value={selectedPlantId ?? ""}
                  onChange={(event) => selectPlant(event.target.value || null, true)}
                >
                  <option value="">Select plant</option>
                  {queuePlants.map((plant) => (
                    <option key={plant.uuid} value={plant.uuid}>
                      {plant.plant_id || "(pending)"} - {plant.species_name}
                    </option>
                  ))}
                </select>
              </label>
              {selectedPlant ? (
                <div className={"grid gap-3"}>
                  <p className={"text-sm text-muted-foreground"}>Last fed: {formatLastFed(selectedPlant.last_fed_at)}</p>
                  <p className={"text-sm text-muted-foreground"}>
                    Assigned recipe:{" "}
                    {selectedPlant.assigned_recipe
                      ? `${selectedPlant.assigned_recipe.code}${selectedPlant.assigned_recipe.name ? ` - ${selectedPlant.assigned_recipe.name}` : ""}`
                      : "Unassigned"}
                  </p>
                  <p className={"text-sm text-muted-foreground"}>Location: {locationLabel(selectedPlant)}</p>
                  {selectedPlant.blocked_reason ? (
                    <p className={"text-sm text-destructive"}>Blocked: {selectedPlant.blocked_reason}</p>
                  ) : null}
                </div>
              ) : null}
              <label className={"grid gap-2"}>
                <span className={"text-sm text-muted-foreground"}>Amount (optional)</span>
                <input
                  className={"flex h-9 w-full items-center rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"}
                  value={amountText}
                  onChange={(event) => setAmountText(event.target.value)}
                  placeholder="3 drops"
                />
              </label>
              <button className={"inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80"} type="button" onClick={() => setShowNote((current) => !current)}>
                {showNote ? "Hide note" : "Add note"}
              </button>
              {showNote ? (
                <label className={"grid gap-2"}>
                  <span className={"text-sm text-muted-foreground"}>Note (optional)</span>
                  <textarea className={"flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"} value={note} onChange={(event) => setNote(event.target.value)} />
                </label>
              ) : null}
            </div>
          </SectionCard>

          {saveBlocked ? (
            <SectionCard title="Feeding Blocked">
              <p className={"text-sm text-muted-foreground"}>
                {saveBlockedReason === "Unplaced"
                  ? "This plant needs placement in a tray before feeding."
                  : "This plant needs a plant recipe before feeding."}
              </p>
              <div className={"flex flex-wrap items-center gap-2"}>
                <Link className={"inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90"} href={`/experiments/${experimentId}/placement`}>
                  Fix placement
                </Link>
                <Link className={"inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80"} href={overviewHref}>
                  Back to Overview
                </Link>
              </div>
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
                  <div className={"grid gap-2"}>
                    <span>Plant</span>
                    <strong>{plant.plant_id || "(pending)"}</strong>
                    <span>Species</span>
                    <strong>{plant.species_name}</strong>
                    <span>Last fed</span>
                    <strong>{formatLastFed(plant.last_fed_at)}</strong>
                    <button className={"inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80"} type="button" onClick={() => selectPlant(plant.uuid, true)}>
                      Select
                    </button>
                  </div>
                )}
              />
            </SectionCard>
          ) : null}

          <StickyActionBar>
            <button
              className={"inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90"}
              type="button"
              disabled={!selectedPlantId || saving || saveBlocked}
              onClick={() => void saveFeeding(false)}
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              className={"inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80"}
              type="button"
              disabled={!selectedPlantId || saving || !canSaveAndNext || saveBlocked}
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
