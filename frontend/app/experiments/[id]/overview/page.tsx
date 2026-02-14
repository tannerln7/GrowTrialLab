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
  | "needs_bin"
  | "needs_placement"
  | "needs_tray_recipe"
  | "active"
  | "removed";

type OverviewPlant = {
  uuid: string;
  plant_id: string;
  species_name: string;
  species_category: string;
  cultivar: string | null;
  status: string;
  bin: string | null;
  assigned_recipe_id: string | null;
  assigned_recipe_code: string | null;
  assigned_recipe_name: string | null;
  placed_tray_id: string | null;
  placed_tray_name: string | null;
  tray_id: string | null;
  tray_name: string | null;
  tray_code: string | null;
  tray_capacity: number | null;
  tray_current_count: number | null;
  placed_block_id: string | null;
  placed_block_name: string | null;
  block_id: string | null;
  block_name: string | null;
  tent_id: string | null;
  tent_code: string | null;
  tent_name: string | null;
  has_baseline: boolean;
  replaced_by_uuid: string | null;
};

type OverviewCounts = {
  total: number;
  active: number;
  removed: number;
  needs_baseline: number;
  needs_bin: number;
  needs_placement: number;
  needs_tray_recipe: number;
  needs_assignment: number;
};

type OverviewResponse = {
  counts: OverviewCounts;
  plants: OverviewPlant[];
};

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: "all", label: "All" },
  { id: "needs_baseline", label: "Needs Baseline" },
  { id: "needs_bin", label: "Needs Grade" },
  { id: "needs_placement", label: "Needs Placement" },
  { id: "needs_tray_recipe", label: "Needs Tray Recipe" },
  { id: "active", label: "Active" },
  { id: "removed", label: "Removed" },
];

type PlantGroup = {
  key: string;
  title: string;
  plants: OverviewPlant[];
  sortOrder: number;
};

function tentSortLabel(plant: OverviewPlant): string {
  return (plant.tent_code || plant.tent_name || "").trim().toLowerCase();
}

function traySortLabel(plant: OverviewPlant): string {
  return (plant.tray_code || plant.tray_name || plant.placed_tray_name || "").trim().toLowerCase();
}

function plantSortLabel(plant: OverviewPlant): string {
  return (plant.plant_id || "").trim().toLowerCase();
}

function occupancyLabel(plant: OverviewPlant): string {
  if (
    plant.tray_current_count === null ||
    plant.tray_capacity === null ||
    !Number.isFinite(plant.tray_current_count) ||
    !Number.isFinite(plant.tray_capacity)
  ) {
    return "";
  }
  return ` (${plant.tray_current_count}/${plant.tray_capacity})`;
}

function locationLabel(plant: OverviewPlant): string {
  if (!plant.tent_id || !plant.tray_id) {
    return "Unplaced";
  }
  const blockName = plant.block_name || "Unassigned";
  const trayName = plant.tray_code || plant.tray_name || plant.placed_tray_name || "Unassigned";
  return `Block ${blockName} > Tray ${trayName}${occupancyLabel(plant)}`;
}

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
      value === "needs_bin" ||
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
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const [experimentName, setExperimentName] = useState("");
  const [summary, setSummary] = useState<ExperimentStatusSummary | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionNotice, setActionNotice] = useState("");
  const [showStopModal, setShowStopModal] = useState(false);
  const [stopConfirmed, setStopConfirmed] = useState(false);
  const [data, setData] = useState<OverviewResponse>({
    counts: {
      total: 0,
      active: 0,
      removed: 0,
      needs_baseline: 0,
      needs_bin: 0,
      needs_placement: 0,
      needs_tray_recipe: 0,
      needs_assignment: 0,
    },
    plants: [],
  });

  const refreshStatusSummary = useCallback(async (): Promise<ExperimentStatusSummary | null> => {
    const statusSummary = await fetchExperimentStatusSummary(experimentId);
    if (!statusSummary) {
      setError("Unable to load overview status.");
      return null;
    }
    setSummary(statusSummary);
    return statusSummary;
  }, [experimentId]);

  useEffect(() => {
    async function load() {
      if (!experimentId) {
        return;
      }

      setLoading(true);
      setError("");
      setNotInvited(false);

      try {
        const meResponse = await backendFetch("/api/me");
        if (meResponse.status === 403) {
          setNotInvited(true);
          return;
        }

        const statusSummary = await refreshStatusSummary();
        if (!statusSummary) {
          return;
        }
        if (!statusSummary.setup.is_complete) {
          router.replace(`/experiments/${experimentId}/setup`);
          return;
        }

        const [overviewResponse, experimentResponse] = await Promise.all([
          backendFetch(`/api/v1/experiments/${experimentId}/overview/plants`),
          backendFetch(`/api/v1/experiments/${experimentId}/`),
        ]);

        if (!overviewResponse.ok) {
          setError("Unable to load overview.");
          return;
        }

        const overviewPayload = (await overviewResponse.json()) as OverviewResponse;
        setData(overviewPayload);
        if (experimentResponse.ok) {
          const experimentPayload = (await experimentResponse.json()) as { name?: string };
          setExperimentName(experimentPayload.name ?? "");
        }
        setOffline(false);
      } catch (requestError) {
        const normalizedError = normalizeBackendError(requestError);
        if (normalizedError.kind === "offline") {
          setOffline(true);
        }
        setError("Unable to load overview.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [experimentId, refreshToken, refreshStatusSummary, router]);

  async function handleStartExperiment() {
    if (!summary || !summary.readiness.ready_to_start) {
      return;
    }
    setActionBusy(true);
    setActionNotice("");
    setError("");
    try {
      const response = await backendFetch(`/api/v1/experiments/${experimentId}/start`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) {
        setError((payload as { detail?: string }).detail || "Unable to start experiment.");
        return;
      }
      setSummary(payload as ExperimentStatusSummary);
      setActionNotice("Experiment started.");
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to start experiment.");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleStopExperiment() {
    setActionBusy(true);
    setActionNotice("");
    setError("");
    try {
      const response = await backendFetch(`/api/v1/experiments/${experimentId}/stop`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) {
        setError((payload as { detail?: string }).detail || "Unable to stop experiment.");
        return;
      }
      setSummary(payload as ExperimentStatusSummary);
      setActionNotice("Experiment stopped.");
      setShowStopModal(false);
      setStopConfirmed(false);
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to stop experiment.");
    } finally {
      setActionBusy(false);
    }
  }

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

  const filteredPlants = useMemo(() => {
    const normalizedQuery = queryValue.trim().toLowerCase();
    return data.plants.filter((plant) => {
      const needsBaseline = plant.status === "active" && (!plant.has_baseline || !plant.bin);
      const needsGrade = plant.status === "active" && !plant.bin;
      const needsPlacement = plant.status === "active" && !plant.placed_tray_id;
      const needsTrayRecipe =
        plant.status === "active" && !!plant.placed_tray_id && !plant.assigned_recipe_id;

      let matchesFilter = true;
      if (activeFilter === "needs_baseline") {
        matchesFilter = needsBaseline;
      } else if (activeFilter === "needs_bin") {
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
  }, [data.plants, activeFilter, queryValue]);

  const sortedFilteredPlants = useMemo(() => {
    return [...filteredPlants].sort((left, right) => {
      const leftUnplaced = left.tent_id ? 0 : 1;
      const rightUnplaced = right.tent_id ? 0 : 1;
      if (leftUnplaced !== rightUnplaced) {
        return leftUnplaced - rightUnplaced;
      }

      const tentCompare = tentSortLabel(left).localeCompare(tentSortLabel(right));
      if (tentCompare !== 0) {
        return tentCompare;
      }

      const leftTrayMissing = left.tray_id ? 0 : 1;
      const rightTrayMissing = right.tray_id ? 0 : 1;
      if (leftTrayMissing !== rightTrayMissing) {
        return leftTrayMissing - rightTrayMissing;
      }

      const trayCompare = traySortLabel(left).localeCompare(traySortLabel(right));
      if (trayCompare !== 0) {
        return trayCompare;
      }

      const plantCompare = plantSortLabel(left).localeCompare(plantSortLabel(right));
      if (plantCompare !== 0) {
        return plantCompare;
      }

      return left.uuid.localeCompare(right.uuid);
    });
  }, [filteredPlants]);

  const groupedPlants = useMemo<PlantGroup[]>(() => {
    const map = new Map<string, PlantGroup>();
    for (const plant of sortedFilteredPlants) {
      const unplaced = !plant.tent_id || !plant.tray_id;
      const key = unplaced ? "unplaced" : (plant.tent_id as string);
      const title = unplaced
        ? "Unplaced"
        : `Tent ${plant.tent_code || plant.tent_name || "Unknown"}`;
      const sortOrder = unplaced ? 1 : 0;
      const current = map.get(key);
      if (current) {
        current.plants.push(plant);
      } else {
        map.set(key, { key, title, plants: [plant], sortOrder });
      }
    }
    return Array.from(map.values()).sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }
      return left.title.localeCompare(right.title);
    });
  }, [sortedFilteredPlants]);

  const overviewPathWithFilters = useMemo(() => {
    const query = searchParams.toString();
    return `/experiments/${experimentId}/overview${query ? `?${query}` : ""}`;
  }, [searchParams, experimentId]);

  const baselineActionHref = `/experiments/${experimentId}/baseline`;
  const feedingActionHref = `/experiments/${experimentId}/feeding`;
  const scheduleActionHref = `/experiments/${experimentId}/schedule`;

  function plantNeedsLabels(plant: OverviewPlant): string[] {
    const needs: string[] = [];
    if (plant.status === "active" && !plant.has_baseline) {
      needs.push("Needs Baseline");
    }
    if (plant.status === "active" && !plant.bin) {
      needs.push("Needs Grade");
    }
    if (plant.status === "active" && !plant.placed_tray_id) {
      needs.push("Needs Placement");
    }
    if (plant.status === "active" && plant.placed_tray_id && !plant.assigned_recipe_id) {
      needs.push("Needs Tray Recipe");
    }
    return needs;
  }

  function quickActionHref(plant: OverviewPlant): string | null {
    if (plant.status !== "active") {
      if (plant.replaced_by_uuid) {
        return `/p/${plant.replaced_by_uuid}?from=${encodeURIComponent(overviewPathWithFilters)}`;
      }
      return null;
    }
    if (!plant.has_baseline || !plant.bin) {
      return `/experiments/${experimentId}/baseline?plant=${plant.uuid}`;
    }
    if (!plant.placed_tray_id || !plant.assigned_recipe_id) {
      return `/experiments/${experimentId}/placement`;
    }
    return null;
  }

  function quickActionLabel(plant: OverviewPlant): string {
    if (plant.status !== "active" && plant.replaced_by_uuid) {
      return "Replacement →";
    }
    if (!plant.has_baseline || !plant.bin) {
      return "Baseline";
    }
    return "Placement";
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
    <PageShell
      title="Overview"
      subtitle={experimentName ? `${experimentName}` : `Experiment: ${experimentId}`}
      actions={
        <div className={styles.actions}>
          <Link className={styles.buttonSecondary} href="/experiments">
            Back to experiments
          </Link>
        </div>
      }
    >
      <SectionCard>
        <p className={styles.inlineNote}>
          Tap a plant to open its action page. Scan QR codes to jump directly to a plant.
        </p>
      </SectionCard>
      {actionNotice ? <p className={styles.successText}>{actionNotice}</p> : null}

      {summary ? (
        <SectionCard title="Experiment State">
          <p className={styles.mutedText}>
            Current state: <strong>{summary.lifecycle.state}</strong>
          </p>
          {summary.lifecycle.started_at ? (
            <p className={styles.mutedText}>
              Started: {new Date(summary.lifecycle.started_at).toLocaleString()}
            </p>
          ) : null}
          {summary.lifecycle.stopped_at ? (
            <p className={styles.mutedText}>
              Stopped: {new Date(summary.lifecycle.stopped_at).toLocaleString()}
            </p>
          ) : null}
          <div className={styles.actions}>
            <button
              className={styles.buttonPrimary}
              type="button"
              disabled={actionBusy || !summary.readiness.ready_to_start}
              onClick={() => void handleStartExperiment()}
            >
              {actionBusy ? "Working..." : "Start"}
            </button>
            {summary.lifecycle.state === "running" ? (
              <button
                className={styles.buttonDanger}
                type="button"
                disabled={actionBusy}
                onClick={() => setShowStopModal(true)}
              >
                Stop
              </button>
            ) : null}
            <Link
              className={styles.buttonSecondary}
              href={`/experiments/${experimentId}/rotation`}
            >
              Rotation
            </Link>
            <Link className={styles.buttonSecondary} href={feedingActionHref}>
              Feeding
            </Link>
            <Link className={styles.buttonSecondary} href={scheduleActionHref}>
              Schedule
            </Link>
          </div>
          {summary.lifecycle.state !== "running" ? (
            <p className={styles.inlineNote}>Start to enable rotation and feeding logging.</p>
          ) : null}
          <p className={styles.inlineNote}>
            Schedule: {formatScheduleSlot(summary.schedule.next_scheduled_slot)} Today due:{" "}
            {summary.schedule.due_counts_today}
          </p>
          {!summary.readiness.ready_to_start ? (
            <div className={styles.stack}>
              <p className={styles.inlineNote}>
                Start is disabled until setup, baseline, placement, tray recipe readiness, and tent restrictions are satisfied.
              </p>
              <div className={styles.actions}>
                {!summary.setup.is_complete ? (
                  <Link className={styles.buttonSecondary} href={`/experiments/${experimentId}/setup`}>
                    Complete setup
                  </Link>
                ) : null}
                {summary.readiness.counts.needs_baseline > 0 ? (
                  <Link className={styles.buttonSecondary} href={`/experiments/${experimentId}/baseline`}>
                    Capture baselines
                  </Link>
                ) : null}
                {summary.readiness.counts.needs_assignment > 0 ? (
                  <Link className={styles.buttonSecondary} href={`/experiments/${experimentId}/placement`}>
                    Manage trays & placement
                  </Link>
                ) : null}
                {summary.readiness.counts.needs_tent_restriction > 0 ? (
                  <Link className={styles.buttonSecondary} href={`/experiments/${experimentId}/placement`}>
                    Resolve tent restrictions
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      {summary ? (
        <SectionCard title="Readiness">
          {summary.readiness.is_ready ? (
            <div className={styles.stack}>
              <p className={styles.successText}>Ready to start</p>
            </div>
          ) : (
            <div className={styles.stack}>
              <p className={styles.mutedText}>
                Not ready: {summary.readiness.counts.needs_baseline} plant(s) need baseline,{" "}
                {summary.readiness.counts.needs_placement} need placement,{" "}
                {summary.readiness.counts.needs_tray_recipe} need tray recipes
                {summary.readiness.counts.needs_tent_restriction > 0
                  ? `, ${summary.readiness.counts.needs_tent_restriction} violate tent restrictions`
                  : ""}
                .
              </p>
              <div className={styles.actions}>
                <Link className={styles.buttonPrimary} href={baselineActionHref}>
                  Capture baselines
                </Link>
                <Link
                  className={styles.buttonSecondary}
                  href={`/experiments/${experimentId}/placement`}
                >
                  Manage trays & placement
                </Link>
                <Link
                  className={styles.buttonSecondary}
                  href={`/experiments/${experimentId}/placement`}
                >
                  Manage tray recipes
                </Link>
                <Link
                  className={styles.buttonSecondary}
                  href={`/experiments/${experimentId}/rotation`}
                >
                  Rotation
                </Link>
                <Link className={styles.buttonSecondary} href={feedingActionHref}>
                  Feeding
                </Link>
              </div>
              {summary.readiness.counts.needs_assignment > 0 ? (
                <p className={styles.inlineNote}>
                  Assign tray recipes and place all plants to enable feeding for all plants.
                </p>
              ) : null}
            </div>
          )}
        </SectionCard>
      ) : null}
      {summary?.readiness.is_ready ? (
        <SectionCard title="Actions">
          <div className={styles.actions}>
            <Link className={styles.buttonSecondary} href={`/experiments/${experimentId}/placement`}>
              Placement
            </Link>
            <Link className={styles.buttonSecondary} href={`/experiments/${experimentId}/rotation`}>
              Rotation
            </Link>
            <Link className={styles.buttonSecondary} href={feedingActionHref}>
              Feeding
            </Link>
          </div>
          {summary.readiness.counts.needs_assignment > 0 ? (
            <p className={styles.inlineNote}>
              Assign tray recipes and place all plants to enable feeding for all plants.
            </p>
          ) : null}
          {summary.lifecycle.state !== "running" ? (
            <p className={styles.inlineNote}>Start to enable feeding.</p>
          ) : null}
        </SectionCard>
      ) : null}

      <SectionCard title="Status Filters">
        <div className={styles.tileGrid}>
          {FILTERS.map((filter) => {
            const count =
              filter.id === "all"
                ? data.counts.total
                : filter.id === "active"
                  ? data.counts.active
                  : filter.id === "removed"
                    ? data.counts.removed
                    : filter.id === "needs_baseline"
                      ? data.counts.needs_baseline
                    : filter.id === "needs_bin"
                      ? data.counts.needs_bin
                      : filter.id === "needs_placement"
                        ? data.counts.needs_placement
                        : data.counts.needs_tray_recipe;
            return (
              <button
                key={filter.id}
                type="button"
                className={`${styles.tileButton} ${
                  activeFilter === filter.id ? styles.tileButtonActive : ""
                }`}
                onClick={() => updateQuery(filter.id, queryValue)}
              >
                <span>{filter.label}</span>
                <strong>{count}</strong>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Plant Queue">
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Search by plant ID or species</span>
          <input
            className={styles.input}
            value={queryValue}
            onChange={(event) => updateQuery(activeFilter, event.target.value)}
            placeholder="NP- or Nepenthes"
          />
        </label>

        {loading ? <p className={styles.mutedText}>Loading overview...</p> : null}
        {error ? <p className={styles.errorText}>{error}</p> : null}

        {!loading && !error ? (
          data.plants.length === 0 ? (
            <IllustrationPlaceholder inventoryId="ILL-201" kind="noPlants" />
          ) : groupedPlants.length === 0 ? (
            <p className={styles.mutedText}>No plants match the current filter.</p>
          ) : (
            <div className={styles.stack}>
              {groupedPlants.map((group) => (
                <div key={group.key} className={styles.groupSection}>
                  <p className={styles.groupHeading}>{group.title}</p>
                  <ResponsiveList
                    items={group.plants}
                    getKey={(plant) => plant.uuid}
                    columns={[
                      {
                        key: "plant_id",
                        label: "Plant ID",
                        render: (plant) => (
                          <Link href={`/p/${plant.uuid}?from=${encodeURIComponent(overviewPathWithFilters)}`}>
                            {plant.plant_id || "(pending)"}
                          </Link>
                        ),
                      },
                      {
                        key: "species",
                        label: "Species",
                        render: (plant) =>
                          `${plant.species_name}${plant.species_category ? ` (${plant.species_category})` : ""}`,
                      },
                      {
                        key: "status",
                        label: "Status",
                        render: (plant) => plant.status,
                      },
                      {
                        key: "grade",
                        label: "Grade",
                        render: (plant) => plant.bin || "Missing",
                      },
                      {
                        key: "recipe",
                        label: "Recipe",
                        render: (plant) => plant.assigned_recipe_code || "Missing",
                      },
                      {
                        key: "location",
                        label: "Location",
                        render: (plant) => locationLabel(plant),
                      },
                      {
                        key: "action",
                        label: "Action",
                        render: (plant) => {
                          const href = quickActionHref(plant);
                          if (!href) {
                            return "Open";
                          }
                          return <Link href={href}>{quickActionLabel(plant)}</Link>;
                        },
                      },
                    ]}
                    renderMobileCard={(plant) => {
                      const needs = plantNeedsLabels(plant);
                      const quickHref = quickActionHref(plant);
                      return (
                        <div className={styles.cardKeyValue}>
                          <span>Plant ID</span>
                          <strong>
                            <Link href={`/p/${plant.uuid}?from=${encodeURIComponent(overviewPathWithFilters)}`}>
                              {plant.plant_id || "(pending)"}
                            </Link>
                          </strong>
                          <span>Species</span>
                          <strong>
                            {plant.species_name}
                            {plant.species_category ? ` (${plant.species_category})` : ""}
                          </strong>
                          <span>Status</span>
                          <strong>{plant.status}</strong>
                          {plant.status !== "active" && plant.replaced_by_uuid ? (
                            <>
                              <span>Replacement</span>
                              <strong>
                                <Link
                                  href={`/p/${plant.replaced_by_uuid}?from=${encodeURIComponent(overviewPathWithFilters)}`}
                                >
                                  Open replacement
                                </Link>
                              </strong>
                            </>
                          ) : null}
                          <span>Grade</span>
                          <strong>{plant.bin || "Missing"}</strong>
                          <span>Recipe</span>
                          <strong>{plant.assigned_recipe_code || "Missing"}</strong>
                          <span>Location</span>
                          <strong title={locationLabel(plant)}>{locationLabel(plant)}</strong>
                          <div className={styles.badgeRow}>
                            {needs.map((label) => (
                              <span className={styles.badgeWarn} key={label}>
                                {label}
                              </span>
                            ))}
                          </div>
                          {quickHref ? (
                            <Link className={styles.buttonSecondary} href={quickHref}>
                              {quickActionLabel(plant)}
                            </Link>
                          ) : null}
                        </div>
                      );
                    }}
                  />
                </div>
              ))}
            </div>
          )
        ) : null}
        {offline ? <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" /> : null}
      </SectionCard>
      {showStopModal ? (
        <div className={styles.modalBackdrop} role="presentation">
          <SectionCard title="Stop Experiment">
            <p className={styles.mutedText}>
              Stopping marks the experiment as stopped. You can still edit data in v1.
            </p>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={stopConfirmed}
                onChange={(event) => setStopConfirmed(event.target.checked)}
              />
              <span>I understand and want to stop this experiment.</span>
            </label>
            <div className={styles.actions}>
              <button
                className={styles.buttonSecondary}
                type="button"
                onClick={() => {
                  setShowStopModal(false);
                  setStopConfirmed(false);
                }}
              >
                Cancel
              </button>
              <button
                className={styles.buttonDanger}
                type="button"
                disabled={!stopConfirmed || actionBusy}
                onClick={() => void handleStopExperiment()}
              >
                {actionBusy ? "Stopping..." : "Stop experiment"}
              </button>
            </div>
          </SectionCard>
        </div>
      ) : null}
    </PageShell>
  );
}
