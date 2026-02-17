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

import styles from "../../experiments.module.css";

type FilterId =
  | "all"
  | "needs_baseline"
  | "needs_grade"
  | "needs_placement"
  | "needs_tray_recipe"
  | "active"
  | "removed";

type LocationNode = { id: string; code?: string | null; name?: string | null; label?: string | null };

type OverviewPlant = {
  uuid: string;
  plant_id: string;
  species_name: string;
  species_category: string;
  cultivar: string | null;
  status: string;
  grade: string | null;
  assigned_recipe_code: string | null;
  has_baseline: boolean;
  replaced_by_uuid: string | null;
  location: {
    status: "placed" | "unplaced";
    tent: LocationNode | null;
    slot: (LocationNode & { shelf_index?: number | null; slot_index?: number | null }) | null;
    tray: (LocationNode & { capacity?: number | null; current_count?: number | null }) | null;
  };
};

type OverviewResponse = {
  counts: {
    total: number;
    active: number;
    removed: number;
    needs_baseline: number;
    needs_grade: number;
    needs_assignment: number;
    needs_placement: number;
    needs_tray_recipe: number;
  };
  plants: {
    count: number;
    results: OverviewPlant[];
    meta: Record<string, unknown>;
  };
};

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: "all", label: "All" },
  { id: "needs_baseline", label: "Needs Baseline" },
  { id: "needs_grade", label: "Needs Grade" },
  { id: "needs_placement", label: "Needs Placement" },
  { id: "needs_tray_recipe", label: "Needs Tray Recipe" },
  { id: "active", label: "Active" },
  { id: "removed", label: "Removed" },
];

function formatScheduleSlot(
  slot: ExperimentStatusSummary["schedule"]["next_scheduled_slot"],
): string {
  if (!slot) {
    return "No upcoming scheduled actions.";
  }
  const parsed = new Date(`${slot.date}T00:00:00`);
  const day = Number.isNaN(parsed.getTime())
    ? slot.date
    : parsed.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
  const moment = slot.exact_time ? slot.exact_time.slice(0, 5) : slot.timeframe?.toLowerCase() || "time";
  return `${day} · ${moment} (${slot.actions_count} action${slot.actions_count === 1 ? "" : "s"})`;
}

function locationSummary(plant: OverviewPlant): string {
  if (plant.location.status !== "placed" || !plant.location.slot || !plant.location.tray) {
    return "Unplaced";
  }
  const slotLabel = plant.location.slot.code || plant.location.slot.label || "Slot";
  const trayLabel = plant.location.tray.code || plant.location.tray.name || "Tray";
  const occupancy =
    plant.location.tray.current_count != null && plant.location.tray.capacity != null
      ? ` (${plant.location.tray.current_count}/${plant.location.tray.capacity})`
      : "";
  return `Slot ${slotLabel} > Tray ${trayLabel}${occupancy}`;
}

export default function ExperimentOverviewPage() {
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

  const activeFilter = useMemo<FilterId>(() => {
    const value = searchParams.get("filter");
    if (
      value === "needs_baseline" ||
      value === "needs_grade" ||
      value === "needs_placement" ||
      value === "needs_tray_recipe" ||
      value === "active" ||
      value === "removed"
    ) {
      return value;
    }
    return "all";
  }, [searchParams]);

  const queryValue = searchParams.get("q") ?? "";
  const refreshToken = searchParams.get("refresh");

  const [loading, setLoading] = useState(true);
  const [notInvited, setNotInvited] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [summary, setSummary] = useState<ExperimentStatusSummary | null>(null);
  const [experimentName, setExperimentName] = useState("");
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshStatusSummary = useCallback(async () => {
    const status = await fetchExperimentStatusSummary(experimentId);
    if (!status) {
      setError("Unable to load status summary.");
      return null;
    }
    setSummary(status);
    return status;
  }, [experimentId]);

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

        const status = await refreshStatusSummary();
        if (!status) {
          return;
        }
        if (!status.setup.is_complete) {
          router.replace(`/experiments/${experimentId}/setup`);
          return;
        }

        const [overviewResponse, experimentResponse] = await Promise.all([
          backendFetch(`/api/v1/experiments/${experimentId}/overview/plants`),
          backendFetch(`/api/v1/experiments/${experimentId}/`),
        ]);

        if (!overviewResponse.ok) {
          setError("Unable to load overview roster.");
          return;
        }
        const overviewPayload = (await overviewResponse.json()) as OverviewResponse;
        setData(overviewPayload);

        if (experimentResponse.ok) {
          const experimentPayload = (await experimentResponse.json()) as { name?: string };
          setExperimentName(experimentPayload.name ?? "");
        }
      } catch (requestError) {
        const normalized = normalizeBackendError(requestError);
        if (normalized.kind === "offline") {
          setOffline(true);
        }
        setError("Unable to load overview.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [experimentId, refreshToken, refreshStatusSummary, router]);

  const filteredPlants = useMemo(() => {
    const normalizedQuery = queryValue.trim().toLowerCase();
    const allPlants = data?.plants.results ?? [];
    return allPlants.filter((plant) => {
      const needsBaseline = plant.status === "active" && (!plant.has_baseline || !plant.grade);
      const needsGrade = plant.status === "active" && !plant.grade;
      const needsPlacement = plant.status === "active" && plant.location.status !== "placed";
      const needsTrayRecipe =
        plant.status === "active" && plant.location.status === "placed" && !plant.assigned_recipe_code;

      let matchesFilter = true;
      if (activeFilter === "needs_baseline") {
        matchesFilter = needsBaseline;
      } else if (activeFilter === "needs_grade") {
        matchesFilter = needsGrade;
      } else if (activeFilter === "needs_placement") {
        matchesFilter = needsPlacement;
      } else if (activeFilter === "needs_tray_recipe") {
        matchesFilter = needsTrayRecipe;
      } else if (activeFilter === "active") {
        matchesFilter = plant.status === "active";
      } else if (activeFilter === "removed") {
        matchesFilter = plant.status !== "active";
      }

      if (!matchesFilter) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }

      return (
        plant.plant_id.toLowerCase().includes(normalizedQuery) ||
        plant.species_name.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [data?.plants.results, activeFilter, queryValue]);

  const sortedPlants = useMemo(() => {
    return [...filteredPlants].sort((left, right) => {
      const leftPlaced = left.location.status === "placed" ? 0 : 1;
      const rightPlaced = right.location.status === "placed" ? 0 : 1;
      if (leftPlaced !== rightPlaced) {
        return leftPlaced - rightPlaced;
      }

      const leftTent = (left.location.tent?.code || left.location.tent?.name || "").toLowerCase();
      const rightTent = (right.location.tent?.code || right.location.tent?.name || "").toLowerCase();
      const tentCompare = leftTent.localeCompare(rightTent);
      if (tentCompare !== 0) {
        return tentCompare;
      }

      const leftTray = (left.location.tray?.code || left.location.tray?.name || "").toLowerCase();
      const rightTray = (right.location.tray?.code || right.location.tray?.name || "").toLowerCase();
      const trayCompare = leftTray.localeCompare(rightTray);
      if (trayCompare !== 0) {
        return trayCompare;
      }

      return (left.plant_id || "").localeCompare(right.plant_id || "");
    });
  }, [filteredPlants]);

  const groupedPlants = useMemo(() => {
    const groups = new Map<string, { title: string; plants: OverviewPlant[]; order: number }>();

    for (const plant of sortedPlants) {
      const isUnplaced = plant.location.status !== "placed";
      const key = isUnplaced ? "unplaced" : (plant.location.tent?.id || "unknown");
      const title = isUnplaced
        ? "Unplaced"
        : `Tent ${plant.location.tent?.code || plant.location.tent?.name || "Unknown"}`;
      const order = isUnplaced ? 1 : 0;

      if (!groups.has(key)) {
        groups.set(key, { title, plants: [], order });
      }
      groups.get(key)?.plants.push(plant);
    }

    return Array.from(groups.entries())
      .map(([key, value]) => ({ key, ...value }))
      .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title));
  }, [sortedPlants]);

  function updateQuery(nextFilter: FilterId, nextQ: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("refresh");
    if (nextFilter === "all") {
      next.delete("filter");
    } else {
      next.set("filter", nextFilter);
    }
    if (nextQ.trim()) {
      next.set("q", nextQ);
    } else {
      next.delete("q");
    }
    const query = next.toString();
    router.replace(`/experiments/${experimentId}/overview${query ? `?${query}` : ""}`);
  }

  async function startExperiment() {
    if (!summary?.readiness.ready_to_start) {
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await backendFetch(`/api/v1/experiments/${experimentId}/start`, { method: "POST" });
      const payload = (await response.json()) as ExperimentStatusSummary | { detail?: string };
      if (!response.ok) {
        setError((payload as { detail?: string }).detail || "Unable to start experiment.");
        return;
      }
      setSummary(payload as ExperimentStatusSummary);
      setNotice("Experiment started.");
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to start experiment.");
    } finally {
      setBusy(false);
    }
  }

  async function stopExperiment() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await backendFetch(`/api/v1/experiments/${experimentId}/stop`, { method: "POST" });
      const payload = (await response.json()) as ExperimentStatusSummary | { detail?: string };
      if (!response.ok) {
        setError((payload as { detail?: string }).detail || "Unable to stop experiment.");
        return;
      }
      setSummary(payload as ExperimentStatusSummary);
      setNotice("Experiment stopped.");
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to stop experiment.");
    } finally {
      setBusy(false);
    }
  }

  function plantLink(plant: OverviewPlant): string {
    const from = encodeURIComponent(`/experiments/${experimentId}/overview?${searchParams.toString()}`);
    return `/p/${plant.uuid}?from=${from}`;
  }

  if (notInvited) {
    return (
      <PageShell title="Overview">
        <SectionCard>
          <IllustrationPlaceholder inventoryId="ILL-001" kind="notInvited" />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell title="Overview" subtitle={experimentName || experimentId}>
      {loading ? <p className={styles.mutedText}>Loading overview...</p> : null}
      {error ? <p className={styles.errorText}>{error}</p> : null}
      {notice ? <p className={styles.successText}>{notice}</p> : null}
      {offline ? <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" /> : null}

      <SectionCard title="Experiment State">
        <p className={styles.mutedText}>State: {summary?.lifecycle.state.toUpperCase() || "UNKNOWN"}</p>
        {summary?.readiness.ready_to_start ? (
          <button className={styles.buttonPrimary} type="button" disabled={busy} onClick={() => void startExperiment()}>
            Start
          </button>
        ) : (
          <p className={styles.inlineNote}>
            Start blocked until readiness is complete.
          </p>
        )}
        {summary?.lifecycle.state === "running" ? (
          <button className={styles.buttonDanger} type="button" disabled={busy} onClick={() => void stopExperiment()}>
            Stop
          </button>
        ) : null}
      </SectionCard>

      <SectionCard title="Readiness">
        <p className={styles.mutedText}>
          Needs baseline: {data?.counts.needs_baseline ?? 0} · Needs grade: {data?.counts.needs_grade ?? 0} · Needs placement: {data?.counts.needs_placement ?? 0} · Needs tray recipe: {data?.counts.needs_tray_recipe ?? 0}
        </p>
        <div className={styles.actions}>
          <Link className={styles.buttonPrimary} href={`/experiments/${experimentId}/baseline`}>
            Capture baselines
          </Link>
          <Link className={styles.buttonSecondary} href={`/experiments/${experimentId}/placement`}>
            Manage placement
          </Link>
          <Link className={styles.buttonSecondary} href={`/experiments/${experimentId}/assignment`}>
            Manage recipes
          </Link>
          <Link className={styles.buttonSecondary} href={`/experiments/${experimentId}/rotation`}>
            Rotation
          </Link>
          <Link className={styles.buttonSecondary} href={`/experiments/${experimentId}/feeding`}>
            Feeding
          </Link>
          <Link className={styles.buttonSecondary} href={`/experiments/${experimentId}/schedule`}>
            Schedule
          </Link>
        </div>
        <p className={styles.mutedText}>Next schedule slot: {formatScheduleSlot(summary?.schedule.next_scheduled_slot || null)}</p>
      </SectionCard>

      <SectionCard title="Filters">
        <div className={styles.actions}>
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              className={activeFilter === filter.id ? styles.buttonPrimary : styles.buttonSecondary}
              type="button"
              onClick={() => updateQuery(filter.id, queryValue)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Search</span>
          <input
            className={styles.input}
            value={queryValue}
            onChange={(event) => updateQuery(activeFilter, event.target.value)}
            placeholder="Plant ID or species"
          />
        </label>
      </SectionCard>

      {groupedPlants.map((group) => (
        <SectionCard key={group.key} title={group.title}>
          <ResponsiveList
            items={group.plants}
            getKey={(plant) => plant.uuid}
            columns={[
              {
                key: "plant",
                label: "Plant",
                render: (plant) => (
                  <Link className={styles.inlineLink} href={plantLink(plant)}>
                    {plant.plant_id || "(pending)"}
                  </Link>
                ),
              },
              {
                key: "species",
                label: "Species",
                render: (plant) => `${plant.species_name}${plant.cultivar ? ` · ${plant.cultivar}` : ""}`,
              },
              {
                key: "grade",
                label: "Grade",
                render: (plant) => plant.grade || "Missing",
              },
              {
                key: "location",
                label: "Location",
                render: (plant) => locationSummary(plant),
              },
              {
                key: "recipe",
                label: "Tray Recipe",
                render: (plant) => plant.assigned_recipe_code || "Missing",
              },
            ]}
            renderMobileCard={(plant) => (
              <div className={styles.cardKeyValue}>
                <span>Plant</span>
                <strong>
                  <Link className={styles.inlineLink} href={plantLink(plant)}>
                    {plant.plant_id || "(pending)"}
                  </Link>
                </strong>
                <span>Species</span>
                <strong>{plant.species_name}</strong>
                <span>Grade</span>
                <strong>{plant.grade || "Missing"}</strong>
                <span>Location</span>
                <strong>{locationSummary(plant)}</strong>
                <span>Tray recipe</span>
                <strong>{plant.assigned_recipe_code || "Missing"}</strong>
              </div>
            )}
          />
        </SectionCard>
      ))}

      {!loading && groupedPlants.length === 0 ? (
        <SectionCard>
          <IllustrationPlaceholder inventoryId="ILL-201" kind="generic" />
          <p className={styles.mutedText}>No plants match the current filters.</p>
        </SectionCard>
      ) : null}
    </PageShell>
  );
}
