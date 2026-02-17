"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ExperimentStatusSummary } from "@/lib/experiment-status";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import PageShell from "@/src/components/ui/PageShell";
import ResponsiveList from "@/src/components/ui/ResponsiveList";
import SectionCard from "@/src/components/ui/SectionCard";
import { api, isApiError } from "@/src/lib/api";
import { queryKeys } from "@/src/lib/queryKeys";
import { usePageQueryState } from "@/src/lib/usePageQueryState";

import styles from "../../experiments.module.css";

type FilterId =
  | "all"
  | "needs_baseline"
  | "needs_grade"
  | "needs_placement"
  | "needs_plant_recipe"
  | "active"
  | "removed";

type LocationNode = {
  id: string;
  code?: string | null;
  name?: string | null;
  label?: string | null;
};

type OverviewPlant = {
  uuid: string;
  plant_id: string;
  species_name: string;
  species_category: string;
  cultivar: string | null;
  status: string;
  grade: string | null;
  assigned_recipe: { id: string; code: string; name: string } | null;
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
    needs_plant_recipe: number;
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
  { id: "needs_plant_recipe", label: "Needs Plant Recipe" },
  { id: "active", label: "Active" },
  { id: "removed", label: "Removed" },
];

const DIAGNOSTIC_LABELS: Record<string, string> = {
  needs_baseline: "needs baseline",
  needs_placement: "needs placement",
  needs_plant_recipe: "needs plant recipe",
  needs_tent_restriction: "violates tent restrictions",
};

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
  const moment = slot.exact_time
    ? slot.exact_time.slice(0, 5)
    : slot.timeframe?.toLowerCase() || "time";
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

function recipeChipLabel(recipe: OverviewPlant["assigned_recipe"]): string {
  if (!recipe) {
    return "Recipe: Unassigned";
  }
  return recipe.name ? `Recipe: ${recipe.code} - ${recipe.name}` : `Recipe: ${recipe.code}`;
}

function formatActionError(error: unknown, fallback: string): string {
  if (isApiError(error)) {
    const detail = error.detail || fallback;
    if (error.status === 409) {
      const diagnosticsText = formatDiagnostics(error.diagnostics);
      if (diagnosticsText) {
        return `${detail} ${diagnosticsText}`;
      }
    }
    return detail;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

function formatDiagnostics(diagnostics: unknown): string {
  if (!diagnostics || typeof diagnostics !== "object") {
    return "";
  }

  const pieces: string[] = [];
  const reasonCounts =
    "reason_counts" in diagnostics &&
    diagnostics.reason_counts &&
    typeof diagnostics.reason_counts === "object"
      ? (diagnostics.reason_counts as Record<string, unknown>)
      : null;

  if (reasonCounts) {
    const reasons = Object.entries(reasonCounts)
      .filter(([, count]) => typeof count === "number" && count > 0)
      .map(([key, count]) => {
        const label = DIAGNOSTIC_LABELS[key] || key.replaceAll("_", " ");
        return `${count} ${label}`;
      });
    if (reasons.length > 0) {
      pieces.push(`Blocked by: ${reasons.join(", ")}.`);
    }
  }

  const missingSetup =
    "missing_setup" in diagnostics && Array.isArray(diagnostics.missing_setup)
      ? diagnostics.missing_setup
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item) => item.replaceAll("_", " "))
      : [];

  if (missingSetup.length > 0) {
    pieces.push(`Missing setup: ${missingSetup.join(", ")}.`);
  }

  return pieces.join(" ");
}

function isOfflineError(error: unknown): boolean {
  if (!isApiError(error)) {
    return false;
  }
  if (error.status === null) {
    return true;
  }
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export default function ExperimentOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

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
      value === "needs_plant_recipe" ||
      value === "active" ||
      value === "removed"
    ) {
      return value;
    }
    return "all";
  }, [searchParams]);

  const queryValue = searchParams.get("q") ?? "";
  const refreshToken = searchParams.get("refresh");

  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [experimentName, setExperimentName] = useState("");

  const statusQuery = useQuery({
    queryKey: queryKeys.experimentStatus(experimentId),
    queryFn: () =>
      api.get<ExperimentStatusSummary>(
        `/api/v1/experiments/${experimentId}/status/summary`,
      ),
    enabled: Boolean(experimentId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const overviewQuery = useQuery({
    queryKey: queryKeys.experimentOverviewPlants(experimentId),
    queryFn: () =>
      api.get<OverviewResponse>(
        `/api/v1/experiments/${experimentId}/overview/plants`,
      ),
    enabled: Boolean(experimentId) && Boolean(statusQuery.data?.setup.is_complete),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const statusPageState = usePageQueryState(statusQuery);
  const overviewPageState = usePageQueryState(overviewQuery);

  const invalidateOverviewData = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.experimentStatus(experimentId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.experimentOverviewPlants(experimentId),
      }),
    ]);
  }, [experimentId, queryClient]);

  const startMutation = useMutation({
    mutationFn: () =>
      api.post<ExperimentStatusSummary>(`/api/v1/experiments/${experimentId}/start`),
    onMutate: () => {
      setActionError("");
      setNotice("");
    },
    onSuccess: async () => {
      setNotice("Experiment started.");
      await invalidateOverviewData();
    },
    onError: (error) => {
      setActionError(formatActionError(error, "Unable to start experiment."));
    },
  });

  const stopMutation = useMutation({
    mutationFn: () =>
      api.post<ExperimentStatusSummary>(`/api/v1/experiments/${experimentId}/stop`),
    onMutate: () => {
      setActionError("");
      setNotice("");
    },
    onSuccess: async () => {
      setNotice("Experiment stopped.");
      await invalidateOverviewData();
    },
    onError: (error) => {
      setActionError(formatActionError(error, "Unable to stop experiment."));
    },
  });

  useEffect(() => {
    if (!experimentId) {
      return;
    }

    let isMounted = true;
    void (async () => {
      try {
        const payload = await api.get<{ name?: string }>(
          `/api/v1/experiments/${experimentId}/`,
        );
        if (isMounted) {
          setExperimentName(payload.name ?? "");
        }
      } catch {
        if (isMounted) {
          setExperimentName("");
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [experimentId]);

  useEffect(() => {
    if (!experimentId || !refreshToken) {
      return;
    }
    void invalidateOverviewData();
  }, [experimentId, invalidateOverviewData, refreshToken]);

  useEffect(() => {
    if (!experimentId) {
      return;
    }
    if (statusQuery.data && !statusQuery.data.setup.is_complete) {
      router.replace(`/experiments/${experimentId}/setup`);
    }
  }, [experimentId, router, statusQuery.data]);

  const summary = statusQuery.data ?? null;
  const data = overviewQuery.data ?? null;
  const busy = startMutation.isPending || stopMutation.isPending;

  const notInvited =
    statusPageState.errorKind === "forbidden" ||
    overviewPageState.errorKind === "forbidden";

  const loading =
    statusPageState.isLoading ||
    (Boolean(statusQuery.data?.setup.is_complete) && overviewPageState.isLoading);

  const queryError = useMemo(() => {
    if (notInvited) {
      return "";
    }
    if (statusPageState.isError) {
      return statusPageState.message || "Unable to load status summary.";
    }
    if (overviewPageState.isError) {
      return overviewPageState.message || "Unable to load overview roster.";
    }
    return "";
  }, [notInvited, overviewPageState.isError, overviewPageState.message, statusPageState.isError, statusPageState.message]);

  const error = actionError || queryError;

  const offline =
    statusPageState.errorKind === "offline" ||
    overviewPageState.errorKind === "offline" ||
    isOfflineError(startMutation.error) ||
    isOfflineError(stopMutation.error);

  const filteredPlants = useMemo(() => {
    const normalizedQuery = queryValue.trim().toLowerCase();
    const allPlants = data?.plants.results ?? [];
    return allPlants.filter((plant) => {
      const needsBaseline = plant.status === "active" && (!plant.has_baseline || !plant.grade);
      const needsGrade = plant.status === "active" && !plant.grade;
      const needsPlacement = plant.status === "active" && plant.location.status !== "placed";
      const needsPlantRecipe = plant.status === "active" && !plant.assigned_recipe;

      let matchesFilter = true;
      if (activeFilter === "needs_baseline") {
        matchesFilter = needsBaseline;
      } else if (activeFilter === "needs_grade") {
        matchesFilter = needsGrade;
      } else if (activeFilter === "needs_placement") {
        matchesFilter = needsPlacement;
      } else if (activeFilter === "needs_plant_recipe") {
        matchesFilter = needsPlantRecipe;
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
  }, [activeFilter, data?.plants.results, queryValue]);

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

  function startExperiment() {
    if (!summary?.readiness.ready_to_start) {
      return;
    }
    startMutation.mutate();
  }

  function stopExperiment() {
    stopMutation.mutate();
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
          <button className={styles.buttonPrimary} type="button" disabled={busy} onClick={startExperiment}>
            Start
          </button>
        ) : (
          <p className={styles.inlineNote}>Start blocked until readiness is complete.</p>
        )}
        {summary?.lifecycle.state === "running" ? (
          <button className={styles.buttonDanger} type="button" disabled={busy} onClick={stopExperiment}>
            Stop
          </button>
        ) : null}
      </SectionCard>

      <SectionCard title="Readiness">
        <p className={styles.mutedText}>
          Needs baseline: {data?.counts.needs_baseline ?? 0} · Needs grade: {data?.counts.needs_grade ?? 0} · Needs placement: {data?.counts.needs_placement ?? 0} · Needs plant recipe: {data?.counts.needs_plant_recipe ?? 0}
        </p>
        <div className={styles.actions}>
          <Link className={styles.buttonPrimary} href={`/experiments/${experimentId}/baseline`}>
            Capture baselines
          </Link>
          <Link className={styles.buttonSecondary} href={`/experiments/${experimentId}/placement`}>
            Manage placement
          </Link>
          <Link className={styles.buttonSecondary} href={`/experiments/${experimentId}/recipes`}>
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
        <p className={styles.mutedText}>
          Next schedule slot: {formatScheduleSlot(summary?.schedule.next_scheduled_slot || null)}
        </p>
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
                label: "Recipe",
                render: (plant) => (
                  <span
                    className={
                      plant.assigned_recipe ? styles.recipeChipAssigned : styles.recipeChipUnassigned
                    }
                  >
                    {recipeChipLabel(plant.assigned_recipe)}
                  </span>
                ),
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
                <span>Recipe</span>
                <strong>
                  <span
                    className={
                      plant.assigned_recipe ? styles.recipeChipAssigned : styles.recipeChipUnassigned
                    }
                  >
                    {recipeChipLabel(plant.assigned_recipe)}
                  </span>
                </strong>
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
