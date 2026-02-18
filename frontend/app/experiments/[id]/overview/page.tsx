"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ExperimentStatusSummary } from "@/lib/experiment-status";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import { buttonVariants } from "@/src/components/ui/button";
import { Notice } from "@/src/components/ui/notice";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";
import { api, isApiError } from "@/src/lib/api";
import { queryKeys } from "@/src/lib/queryKeys";
import { usePageQueryState } from "@/src/lib/usePageQueryState";

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

type PlacedTrayGroup = {
  tray: NonNullable<OverviewPlant["location"]["tray"]>;
  plants: OverviewPlant[];
};

type PlacedSlotGroup = {
  slot: NonNullable<OverviewPlant["location"]["slot"]>;
  shelfIndex: number;
  slotIndex: number;
  trays: PlacedTrayGroup[];
};

type PlacedShelfGroup = {
  shelfIndex: number;
  slots: PlacedSlotGroup[];
};

type PlacedTentGroup = {
  tent: NonNullable<OverviewPlant["location"]["tent"]>;
  shelves: PlacedShelfGroup[];
  maxSlotCount: number;
  trayCount: number;
  plantCount: number;
};

const DIAGNOSTIC_LABELS: Record<string, string> = {
  needs_baseline: "needs baseline",
  needs_placement: "needs placement",
  needs_plant_recipe: "needs plant recipe",
  needs_tent_restriction: "violates tent restrictions",
};

const OVERVIEW_SLOT_COLUMN_CLASSES = [
  "grid-cols-1",
  "grid-cols-2",
  "grid-cols-3",
  "grid-cols-4",
  "grid-cols-5",
  "grid-cols-6",
  "grid-cols-7",
  "grid-cols-8",
  "grid-cols-9",
  "grid-cols-10",
  "grid-cols-11",
  "grid-cols-12",
] as const;

function overviewSlotGridColumns(maxSlotCount: number): string {
  const capped = Math.min(12, Math.max(1, Math.trunc(maxSlotCount || 1)));
  return OVERVIEW_SLOT_COLUMN_CLASSES[capped - 1] || OVERVIEW_SLOT_COLUMN_CLASSES[0];
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

function normalizeGridIndex(value: number | null | undefined): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  const normalized = Math.trunc(value as number);
  if (normalized < 1) {
    return null;
  }
  return normalized;
}

function locationLabel(node: LocationNode | null, fallback: string): string {
  return node?.code || node?.name || node?.label || fallback;
}

function formatTrayHeading(node: LocationNode | null): string {
  const raw = (node?.code || node?.name || node?.label || "").trim();
  if (!raw) {
    return "Tray";
  }
  const strictMatch = raw.match(/^(?:tray|tr|t)?[\s_-]*0*([0-9]+)$/i);
  const looseMatch = strictMatch || raw.match(/([0-9]+)/);
  if (!looseMatch) {
    return "Tray";
  }
  const trayNumber = Number.parseInt(looseMatch[1], 10);
  if (!Number.isFinite(trayNumber)) {
    return "Tray";
  }
  return `Tray ${trayNumber}`;
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

  function actionButtonClass(needsAttention: boolean): string {
    return [needsAttention ? buttonVariants({ variant: "default" }) : buttonVariants({ variant: "secondary" }), styles.overviewActionButton].join(" ");
  }

  const readinessItems = [
    { key: "baseline", label: "Needs baseline", value: data?.counts.needs_baseline ?? 0 },
    { key: "grade", label: "Needs grade", value: data?.counts.needs_grade ?? 0 },
    { key: "placement", label: "Needs placement", value: data?.counts.needs_placement ?? 0 },
    { key: "recipe", label: "Needs plant recipe", value: data?.counts.needs_plant_recipe ?? 0 },
  ];

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

  const placementGroups = useMemo(() => {
    type TentSlotAccumulator = {
      slot: NonNullable<OverviewPlant["location"]["slot"]>;
      rawShelfIndex: number | null;
      rawSlotIndex: number | null;
      trays: Map<string, PlacedTrayGroup>;
    };

    const tentMap = new Map<
      string,
      {
        tent: NonNullable<OverviewPlant["location"]["tent"]>;
        slots: Map<string, TentSlotAccumulator>;
      }
    >();
    const unplaced: OverviewPlant[] = [];

    for (const plant of sortedPlants) {
      const { location } = plant;
      if (
        location.status !== "placed" ||
        !location.tent ||
        !location.slot ||
        !location.tray
      ) {
        unplaced.push(plant);
        continue;
      }

      const tentId = location.tent.id;
      const slotId = location.slot.id;
      const trayId = location.tray.id;
      const rawShelfIndex = normalizeGridIndex(location.slot.shelf_index);
      const rawSlotIndex = normalizeGridIndex(location.slot.slot_index);

      if (!tentMap.has(tentId)) {
        tentMap.set(tentId, { tent: location.tent, slots: new Map() });
      }
      const tentGroup = tentMap.get(tentId);
      if (!tentGroup) {
        continue;
      }

      if (!tentGroup.slots.has(slotId)) {
        tentGroup.slots.set(slotId, {
          slot: location.slot,
          rawShelfIndex,
          rawSlotIndex,
          trays: new Map(),
        });
      }
      const slotGroup = tentGroup.slots.get(slotId);
      if (!slotGroup) {
        continue;
      }

      if (!slotGroup.trays.has(trayId)) {
        slotGroup.trays.set(trayId, { tray: location.tray, plants: [] });
      }
      slotGroup.trays.get(trayId)?.plants.push(plant);
    }

    const tents: PlacedTentGroup[] = Array.from(tentMap.values())
      .map((tentGroup) => {
        const slotsByShelf = new Map<number, PlacedSlotGroup[]>();

        Array.from(tentGroup.slots.values())
          .map((slotGroup) => {
            const trays = Array.from(slotGroup.trays.values())
              .map((trayGroup) => ({
                ...trayGroup,
                plants: [...trayGroup.plants].sort((left, right) =>
                  (left.plant_id || "").localeCompare(right.plant_id || ""),
                ),
              }))
              .sort((left, right) => {
                const leftLabel = (left.tray.code || left.tray.name || "").toLowerCase();
                const rightLabel = (right.tray.code || right.tray.name || "").toLowerCase();
                return leftLabel.localeCompare(rightLabel);
              });

            return {
              slot: slotGroup.slot,
              rawShelfIndex: slotGroup.rawShelfIndex,
              rawSlotIndex: slotGroup.rawSlotIndex,
              trays,
            };
          })
          .sort((left, right) => {
            const leftShelf = left.rawShelfIndex ?? Number.MAX_SAFE_INTEGER;
            const rightShelf = right.rawShelfIndex ?? Number.MAX_SAFE_INTEGER;
            if (leftShelf !== rightShelf) {
              return leftShelf - rightShelf;
            }
            const leftIndex = left.rawSlotIndex ?? Number.MAX_SAFE_INTEGER;
            const rightIndex = right.rawSlotIndex ?? Number.MAX_SAFE_INTEGER;
            if (leftIndex !== rightIndex) {
              return leftIndex - rightIndex;
            }
            const leftLabel = (left.slot.code || left.slot.label || "").toLowerCase();
            const rightLabel = (right.slot.code || right.slot.label || "").toLowerCase();
            return leftLabel.localeCompare(rightLabel);
          })
          .forEach((slotGroup) => {
            const shelfIndex = slotGroup.rawShelfIndex ?? 1;
            const existing = slotsByShelf.get(shelfIndex) || [];
            existing.push({
              slot: slotGroup.slot,
              shelfIndex,
              slotIndex: slotGroup.rawSlotIndex ?? 0,
              trays: slotGroup.trays,
            });
            slotsByShelf.set(shelfIndex, existing);
          });

        const shelves: PlacedShelfGroup[] = Array.from(slotsByShelf.entries())
          .sort((left, right) => left[0] - right[0])
          .map(([shelfIndex, slots]) => {
            const orderedSlots = [...slots].sort((left, right) => {
              const leftIndex = left.slotIndex > 0 ? left.slotIndex : Number.MAX_SAFE_INTEGER;
              const rightIndex = right.slotIndex > 0 ? right.slotIndex : Number.MAX_SAFE_INTEGER;
              if (leftIndex !== rightIndex) {
                return leftIndex - rightIndex;
              }
              return locationLabel(left.slot, "").toLowerCase().localeCompare(locationLabel(right.slot, "").toLowerCase());
            });
            const usedSlotIndexes = new Set<number>();
            const normalizedSlots = orderedSlots.map((slotGroup) => {
              let resolvedIndex = slotGroup.slotIndex > 0 ? slotGroup.slotIndex : 0;
              if (resolvedIndex <= 0 || usedSlotIndexes.has(resolvedIndex)) {
                resolvedIndex = 1;
                while (usedSlotIndexes.has(resolvedIndex)) {
                  resolvedIndex += 1;
                }
              }
              usedSlotIndexes.add(resolvedIndex);
              return {
                ...slotGroup,
                slotIndex: resolvedIndex,
              };
            });
            return { shelfIndex, slots: normalizedSlots };
          });

        const maxSlotCount = Math.max(
          1,
          ...shelves.flatMap((shelf) => shelf.slots.map((slot) => slot.slotIndex)),
        );
        const trayCount = shelves.reduce(
          (total, shelf) =>
            total + shelf.slots.reduce((slotTotal, slot) => slotTotal + slot.trays.length, 0),
          0,
        );
        const plantCount = shelves.reduce(
          (total, shelf) =>
            total +
            shelf.slots.reduce(
              (slotTotal, slot) =>
                slotTotal +
                slot.trays.reduce((trayTotal, tray) => trayTotal + tray.plants.length, 0),
              0,
            ),
          0,
        );

        return {
          tent: tentGroup.tent,
          shelves,
          maxSlotCount,
          trayCount,
          plantCount,
        };
      })
      .sort((left, right) => {
        const leftLabel = (left.tent.code || left.tent.name || "").toLowerCase();
        const rightLabel = (right.tent.code || right.tent.name || "").toLowerCase();
        return leftLabel.localeCompare(rightLabel);
      });

    return {
      tents,
      unplaced: [...unplaced].sort((left, right) =>
        (left.plant_id || "").localeCompare(right.plant_id || ""),
      ),
    };
  }, [sortedPlants]);

  function startExperiment() {
    if (!startReady) {
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

  function renderPlantCell(plant: OverviewPlant) {
    const speciesLine = plant.cultivar
      ? `${plant.species_name} · ${plant.cultivar}`
      : plant.species_name;
    const statusLabel =
      plant.status.length > 0
        ? `${plant.status.charAt(0).toUpperCase()}${plant.status.slice(1)}`
        : "Unknown";

    return (
      <Link
        key={plant.uuid}
        href={plantLink(plant)}
        className={[
          styles.plantCell,
          styles.overviewPlantCellLink,
          styles.overviewPlantCell,
          styles.cellFrame,
          styles.cellSurfaceLevel1,
          styles.cellInteractive,
        ].join(" ")}
      >
        <strong className={styles.plantCellId}>{plant.plant_id || "(pending)"}</strong>
        <span className={[styles.plantCellSpecies, styles.overviewPlantSpecies].join(" ")}>{speciesLine}</span>
        <div className={styles.overviewPlantStatusRow}>
          <span
            className={[
              styles.overviewPlantChip,
              plant.grade ? styles.overviewPlantChipReady : styles.overviewPlantChipMissing,
            ].join(" ")}
          >
            {plant.grade ? `Grade ${plant.grade}` : "No grade"}
          </span>
          <span
            className={[
              styles.overviewPlantChip,
              plant.assigned_recipe ? styles.overviewPlantChipReady : styles.overviewPlantChipMissing,
            ].join(" ")}
          >
            {plant.assigned_recipe ? `Recipe ${plant.assigned_recipe.code}` : "No recipe"}
          </span>
          {plant.status !== "active" ? (
            <span className={[styles.overviewPlantChip, styles.overviewPlantChipMissing].join(" ")}>
              {statusLabel}
            </span>
          ) : null}
        </div>
      </Link>
    );
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
      {loading ? <p className="text-sm text-muted-foreground">Loading overview...</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <Notice variant="success">{notice}</Notice> : null}
      {offline ? <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" /> : null}

      <SectionCard title="Experiment State">
        <div className={styles.overviewStateCard}>
          <p className="text-sm text-muted-foreground">State: {summary?.lifecycle.state.toUpperCase() || "UNKNOWN"}</p>
          <div className={styles.overviewReadinessRow}>
            {readinessItems.map((item) => (
              <span
                key={item.key}
                className={[
                  styles.overviewReadinessChip,
                  item.value === 0 ? styles.overviewReadinessChipReady : styles.overviewReadinessChipPending,
                ].join(" ")}
              >
                {item.label}: {item.value}
              </span>
            ))}
          </div>
          <div className={styles.overviewStateActionRow}>
            <button
              className={[buttonVariants({ variant: "default" }), styles.overviewActionButton].join(" ")}
              type="button"
              disabled={busy || !startReady}
              onClick={startExperiment}
            >
              Start
            </button>
            {summary?.lifecycle.state === "running" ? (
              <button
                className={[buttonVariants({ variant: "destructive" }), styles.overviewActionButton].join(" ")}
                type="button"
                disabled={busy}
                onClick={stopExperiment}
              >
                Stop
              </button>
            ) : null}
            <Link className={actionButtonClass(baselineNeedsAttention)} href={`/experiments/${experimentId}/baseline`}>
              Capture baselines
            </Link>
            <Link className={actionButtonClass(placementNeedsAttention)} href={`/experiments/${experimentId}/placement`}>
              Manage placement
            </Link>
            <Link className={actionButtonClass(recipesNeedsAttention)} href={`/experiments/${experimentId}/recipes`}>
              Manage recipes
            </Link>
            <Link className={actionButtonClass(rotationNeedsAttention)} href={`/experiments/${experimentId}/rotation`}>
              Rotation
            </Link>
            <Link className={actionButtonClass(feedingNeedsAttention)} href={`/experiments/${experimentId}/feeding`}>
              Feeding
            </Link>
          </div>
          {!startReady ? (
            <p className={"text-sm text-muted-foreground"}>Start blocked until readiness is complete.</p>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Schedule">
        <div className={styles.overviewScheduleCard}>
          <p className="text-sm text-muted-foreground">
            Next schedule slot: {formatScheduleSlot(summary?.schedule.next_scheduled_slot || null)}
          </p>
          <div className={"flex flex-wrap items-center gap-2"}>
            <Link className={actionButtonClass(scheduleNeedsAttention)} href={`/experiments/${experimentId}/schedule`}>
              Schedule
            </Link>
          </div>
        </div>
      </SectionCard>

      {placementGroups.tents.length > 0 ? (
        <SectionCard title="Tent -> Slot -> Tray -> Plants">
          <div className={styles.overviewTentBoardGrid}>
            {placementGroups.tents.map((tentGroup) => {
              return (
                <article
                  key={tentGroup.tent.id}
                  className={[styles.tentBoardCard, styles.overviewTentBoardCard, "rounded-lg border border-border", styles.cellSurfaceLevel4].join(" ")}
                >
                  <div className={styles.trayHeaderRow}>
                    <div className={styles.trayHeaderMeta}>
                      <strong>{tentGroup.tent.name || tentGroup.tent.code || "Tent"}</strong>
                    </div>
                    <div className={styles.trayHeaderActions}>
                      <span className={styles.recipeLegendItem}>{tentGroup.trayCount} tray(s)</span>
                      <span className={styles.recipeLegendItem}>{tentGroup.plantCount} plant(s)</span>
                    </div>
                  </div>
                  <div className={styles.overviewTentShelfStack}>
                    {tentGroup.shelves.map((shelfGroup) => {
                      const slotByIndex = new Map(
                        shelfGroup.slots.map((slotGroup) => [slotGroup.slotIndex, slotGroup] as const),
                      );
                      return (
                        <div key={`${tentGroup.tent.id}-shelf-${shelfGroup.shelfIndex}`} className={styles.overviewShelfGroup}>
                        <span className={styles.overviewShelfLabel}>Shelf {shelfGroup.shelfIndex}</span>
                        <div
                          className={[
                            styles.overviewTentSlotGrid,
                            styles.overviewShelfSlotGrid,
                            overviewSlotGridColumns(tentGroup.maxSlotCount),
                          ].join(" ")}
                        >
                          {Array.from({ length: tentGroup.maxSlotCount }, (_, index) => {
                            const slotIndex = index + 1;
                            const slotGroup = slotByIndex.get(slotIndex);
                            if (!slotGroup) {
                              return (
                                <div
                                  key={`${tentGroup.tent.id}-shelf-${shelfGroup.shelfIndex}-slot-${slotIndex}`}
                                  className={[
                                    styles.slotCell,
                                    styles.overviewSlotCell,
                                    styles.overviewSlotCellEmpty,
                                    styles.cellFrame,
                                    styles.cellSurfaceLevel3,
                                  ].join(" ")}
                                >
                                  <span className={styles.slotCellLabel}>Slot {slotIndex}</span>
                                  <div className={styles.overviewSlotEmptyState}>Empty</div>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={slotGroup.slot.id}
                                className={[styles.slotCell, styles.overviewSlotCell, styles.cellFrame, styles.cellSurfaceLevel3].join(" ")}
                              >
                                <span className={styles.slotCellLabel}>Slot {slotIndex}</span>
                                <div className={styles.overviewSlotTrayStack}>
                                  {slotGroup.trays.map((trayGroup) => (
                                    <article
                                      key={trayGroup.tray.id}
                                      className={[styles.overviewTrayCell, styles.cellSurfaceLevel2].join(" ")}
                                    >
                                    <div className={styles.overviewTrayMeta}>
                                      <strong className={styles.trayGridCellId}>
                                        {formatTrayHeading(trayGroup.tray)}
                                      </strong>
                                        {trayGroup.tray.current_count != null && trayGroup.tray.capacity != null ? (
                                          <span className={styles.recipeLegendItem}>
                                            {trayGroup.tray.current_count}/{trayGroup.tray.capacity}
                                          </span>
                                        ) : null}
                                      </div>
                                      <div className={[styles.plantCellGridTray, styles.cellGridResponsive].join(" ")} data-cell-size="sm">
                                        {trayGroup.plants.map((plant) => renderPlantCell(plant))}
                                      </div>
                                    </article>
                                  ))}
                                  {slotGroup.trays.length === 0 ? (
                                    <div className={styles.overviewSlotEmptyState}>Empty</div>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        </div>
                      );
                    })}
                    {tentGroup.shelves.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No mapped slots.</p>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </SectionCard>
      ) : null}

      {placementGroups.unplaced.length > 0 ? (
        <SectionCard title="Unplaced Plants">
          <div className={[styles.plantCellGrid, styles.cellGridResponsive].join(" ")} data-cell-size="sm">
            {placementGroups.unplaced.map((plant) => renderPlantCell(plant))}
          </div>
        </SectionCard>
      ) : null}

      {!loading && sortedPlants.length === 0 ? (
        <SectionCard>
          <IllustrationPlaceholder inventoryId="ILL-201" kind="generic" />
          <p className="text-sm text-muted-foreground">No plants available for this experiment.</p>
        </SectionCard>
      ) : null}
    </PageShell>
  );
}
