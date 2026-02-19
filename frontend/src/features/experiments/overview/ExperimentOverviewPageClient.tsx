"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ExperimentStatusSummary } from "@/lib/experiment-status";
import { buttonVariants } from "@/src/components/ui/button";
import PageAlerts from "@/src/components/ui/PageAlerts";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";
import {
  OverviewEmptyPanel,
  OverviewSchedulePanel,
  OverviewStatePanel,
} from "@/src/features/experiments/overview/components/OverviewPanels";
import {
  buildTentLayoutSpecFromOverviewPlants,
} from "@/src/lib/gridkit/builders";
import {
  OverviewTentLayout,
  PlantCell,
} from "@/src/lib/gridkit/components";
import type { PlantOccupantSpec } from "@/src/lib/gridkit/spec";
import { api, isApiError } from "@/src/lib/api";
import { queryKeys } from "@/src/lib/queryKeys";
import { usePageQueryState } from "@/src/lib/usePageQueryState";
import { cn } from "@/lib/utils";

import { experimentsStyles as styles } from "@/src/components/ui/experiments-styles";

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

type ExperimentOverviewPageClientProps = {
  experimentId: string;
};

export function ExperimentOverviewPageClient({ experimentId }: ExperimentOverviewPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const refreshToken = searchParams.get("refresh");

  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const statusQueryKey = queryKeys.experiment.status(experimentId);
  const overviewQueryKey = queryKeys.experiment.feature(experimentId, "overviewPlants");
  const experimentDetailQueryKey = queryKeys.experiments.detail(experimentId);

  const statusQuery = useQuery({
    queryKey: statusQueryKey,
    queryFn: () =>
      api.get<ExperimentStatusSummary>(
        `/api/v1/experiments/${experimentId}/status/summary`,
      ),
    enabled: Boolean(experimentId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const overviewQuery = useQuery({
    queryKey: overviewQueryKey,
    queryFn: () =>
      api.get<OverviewResponse>(
        `/api/v1/experiments/${experimentId}/overview/plants`,
      ),
    enabled: Boolean(experimentId) && Boolean(statusQuery.data?.setup.is_complete),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const experimentDetailQuery = useQuery({
    queryKey: experimentDetailQueryKey,
    queryFn: () => api.get<{ name?: string }>(`/api/v1/experiments/${experimentId}/`),
    enabled: Boolean(experimentId),
    staleTime: 60_000,
    retry: 0,
  });

  const statusPageState = usePageQueryState(statusQuery);
  const overviewPageState = usePageQueryState(overviewQuery);

  const refreshOverviewData = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: overviewQueryKey,
    });
  }, [overviewQueryKey, queryClient]);

  const startMutation = useMutation({
    mutationFn: () =>
      api.post<ExperimentStatusSummary>(`/api/v1/experiments/${experimentId}/start`),
    onMutate: () => {
      setActionError("");
      setNotice("");
    },
    onSuccess: async (nextStatusSummary) => {
      setNotice("Experiment started.");
      queryClient.setQueryData(statusQueryKey, nextStatusSummary);
      await refreshOverviewData();
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
    onSuccess: async (nextStatusSummary) => {
      setNotice("Experiment stopped.");
      queryClient.setQueryData(statusQueryKey, nextStatusSummary);
      await refreshOverviewData();
    },
    onError: (error) => {
      setActionError(formatActionError(error, "Unable to stop experiment."));
    },
  });

  useEffect(() => {
    if (!experimentId || !refreshToken) {
      return;
    }
    void refreshOverviewData();
  }, [experimentId, refreshOverviewData, refreshToken]);

  useEffect(() => {
    if (!experimentId) {
      return;
    }
    if (statusQuery.data && !statusQuery.data.setup.is_complete) {
      router.replace(`/experiments/${experimentId}/setup`);
    }
  }, [experimentId, router, statusQuery.data]);

  const summary = statusQuery.data ?? null;
  const experimentName = experimentDetailQuery.data?.name ?? "";
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
  const startReady = Boolean(summary?.readiness.ready_to_start);
  const baselineNeedsAttention = (data?.counts.needs_baseline ?? summary?.readiness.counts.needs_baseline ?? 0) > 0;
  const placementNeedsAttention =
    (data?.counts.needs_placement ?? summary?.readiness.counts.needs_placement ?? 0) > 0 ||
    (summary?.readiness.counts.needs_tent_restriction ?? 0) > 0 ||
    Boolean(summary?.setup.missing.tents || summary?.setup.missing.slots);
  const recipesNeedsAttention =
    (data?.counts.needs_plant_recipe ?? summary?.readiness.counts.needs_plant_recipe ?? 0) > 0 ||
    Boolean(summary?.setup.missing.recipes);
  const rotationNeedsAttention = (summary?.readiness.counts.needs_tent_restriction ?? 0) > 0;
  const feedingNeedsAttention = (summary?.schedule.due_counts_today ?? 0) > 0;
  const scheduleNeedsAttention =
    (summary?.schedule.due_counts_today ?? 0) > 0 || summary?.schedule.next_scheduled_slot == null;

  const actionButtonClass = useCallback(
    (needsAttention: boolean): string =>
      cn(
        needsAttention
          ? buttonVariants({ variant: "default" })
          : buttonVariants({ variant: "secondary" }),
        styles.overviewActionButton,
      ),
    [],
  );

  const readinessItems = useMemo(
    () => [
      { key: "baseline", label: "Needs baseline", value: data?.counts.needs_baseline ?? 0 },
      { key: "grade", label: "Needs grade", value: data?.counts.needs_grade ?? 0 },
      { key: "placement", label: "Needs placement", value: data?.counts.needs_placement ?? 0 },
      { key: "recipe", label: "Needs plant recipe", value: data?.counts.needs_plant_recipe ?? 0 },
    ],
    [data?.counts.needs_baseline, data?.counts.needs_grade, data?.counts.needs_placement, data?.counts.needs_plant_recipe],
  );

  const visiblePlants = useMemo(() => data?.plants.results ?? [], [data?.plants.results]);

  const sortedPlants = useMemo(() => {
    return [...visiblePlants].sort((left, right) => {
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
  }, [visiblePlants]);

  const overviewLayoutSpec = useMemo(
    () =>
      buildTentLayoutSpecFromOverviewPlants({
        plants: sortedPlants,
      }),
    [sortedPlants],
  );

  const unplacedPlantSpecs = useMemo(() => {
    const raw = (overviewLayoutSpec.meta as { unplacedPlants?: unknown } | undefined)
      ?.unplacedPlants;
    if (!Array.isArray(raw)) {
      return [] as PlantOccupantSpec[];
    }
    return raw.filter(
      (item): item is PlantOccupantSpec =>
        typeof item === "object" &&
        item !== null &&
        "kind" in item &&
        item.kind === "plant",
    );
  }, [overviewLayoutSpec.meta]);

  const startExperiment = useCallback(() => {
    if (!startReady) {
      return;
    }
    startMutation.mutate();
  }, [startMutation, startReady]);

  const stopExperiment = useCallback(() => {
    stopMutation.mutate();
  }, [stopMutation]);

  const plantLink = useCallback(
    (plant: PlantOccupantSpec): string => {
      const from = encodeURIComponent(`/experiments/${experimentId}/overview?${searchParams.toString()}`);
      return `/p/${plant.id}?from=${from}`;
    },
    [experimentId, searchParams],
  );

  const handleTrayPlantPress = useCallback(
    (_plantId: string, plant: PlantOccupantSpec) => {
      router.push(plantLink(plant));
    },
    [plantLink, router],
  );

  function renderPlantCell(plant: PlantOccupantSpec) {
    const speciesLine = plant.subtitle || "";
    const statusLabel =
      (plant.status || "").length > 0
        ? `${(plant.status || "").charAt(0).toUpperCase()}${(plant.status || "").slice(1)}`
        : "Unknown";

    return (
      <PlantCell
        key={plant.id}
        plantId={plant.plantId}
        title={plant.title || "(pending)"}
        subtitle={speciesLine}
        className={cn(styles.plantCell, styles.overviewPlantCell, "p-0")}
        contentClassName={cn(
          "gap-1 p-[var(--gt-cell-pad,var(--gt-space-md))]",
          styles.overviewPlantCellLink,
        )}
        titleClassName={styles.plantCellId}
        subtitleClassName={cn(styles.plantCellSpecies, styles.overviewPlantSpecies)}
        metaClassName={styles.overviewPlantStatusRow}
        linkHref={plantLink(plant)}
        meta={
          <>
            <span
              className={cn(
                styles.overviewPlantChip,
                plant.grade ? styles.overviewPlantChipReady : styles.overviewPlantChipMissing,
              )}
            >
              {plant.grade ? `Grade ${plant.grade}` : "No grade"}
            </span>
            <span
              className={cn(
                styles.overviewPlantChip,
                plant.recipeCode ? styles.overviewPlantChipReady : styles.overviewPlantChipMissing,
              )}
            >
              {plant.recipeCode ? `Recipe ${plant.recipeCode}` : "No recipe"}
            </span>
            {plant.status !== "active" ? (
              <span className={cn(styles.overviewPlantChip, styles.overviewPlantChipMissing)}>
                {statusLabel}
              </span>
            ) : null}
          </>
        }
      />
    );
  }

  const overviewStateModel = useMemo(
    () => ({
      lifecycleState: summary?.lifecycle.state || "unknown",
      readinessItems,
      busy,
      startReady,
      showStop: summary?.lifecycle.state === "running",
      stateActionLinks: [
        {
          href: `/experiments/${experimentId}/baseline`,
          className: actionButtonClass(baselineNeedsAttention),
          label: "Capture baselines",
        },
        {
          href: `/experiments/${experimentId}/placement`,
          className: actionButtonClass(placementNeedsAttention),
          label: "Manage placement",
        },
        {
          href: `/experiments/${experimentId}/recipes`,
          className: actionButtonClass(recipesNeedsAttention),
          label: "Manage recipes",
        },
        {
          href: `/experiments/${experimentId}/rotation`,
          className: actionButtonClass(rotationNeedsAttention),
          label: "Rotation",
        },
        {
          href: `/experiments/${experimentId}/feeding`,
          className: actionButtonClass(feedingNeedsAttention),
          label: "Feeding",
        },
      ],
    }),
    [
      baselineNeedsAttention,
      busy,
      experimentId,
      feedingNeedsAttention,
      placementNeedsAttention,
      actionButtonClass,
      readinessItems,
      recipesNeedsAttention,
      rotationNeedsAttention,
      startReady,
      summary?.lifecycle.state,
    ],
  );

  const overviewStateActions = useMemo(
    () => ({
      onStart: startExperiment,
      onStop: stopExperiment,
    }),
    [startExperiment, stopExperiment],
  );

  const overviewScheduleModel = useMemo(
    () => ({
      nextScheduleSlotText: formatScheduleSlot(summary?.schedule.next_scheduled_slot || null),
      scheduleHref: `/experiments/${experimentId}/schedule`,
      scheduleClassName: actionButtonClass(scheduleNeedsAttention),
    }),
    [actionButtonClass, experimentId, scheduleNeedsAttention, summary?.schedule.next_scheduled_slot],
  );

  if (notInvited) {
    return (
      <PageShell title="Overview">
        <SectionCard>
          <PageAlerts notInvited />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell title="Overview" subtitle={experimentName || experimentId}>
      <PageAlerts
        loading={loading}
        loadingText="Loading overview..."
        error={error}
        notice={notice}
        offline={offline}
      />

      <OverviewStatePanel model={overviewStateModel} actions={overviewStateActions} />
      <OverviewSchedulePanel model={overviewScheduleModel} />

      {overviewLayoutSpec.tents.length > 0 ? (
        <SectionCard title="Tent -> Slot -> Tray -> Plants">
          <OverviewTentLayout
            spec={overviewLayoutSpec}
            onTrayPlantPress={handleTrayPlantPress}
          />
        </SectionCard>
      ) : null}

      {unplacedPlantSpecs.length > 0 ? (
        <SectionCard title="Unplaced Plants">
          <div className={cn(styles.plantCellGrid, styles.cellGridResponsive)} data-cell-size="sm">
            {unplacedPlantSpecs.map((plant) => renderPlantCell(plant))}
          </div>
        </SectionCard>
      ) : null}

      {!loading && visiblePlants.length === 0 ? <OverviewEmptyPanel /> : null}
    </PageShell>
  );
}
