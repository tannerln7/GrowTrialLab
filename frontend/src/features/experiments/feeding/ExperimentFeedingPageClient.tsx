"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ExperimentStatusSummary } from "@/lib/experiment-status";
import { unwrapList } from "@/lib/backend";
import { buttonVariants } from "@/src/components/ui/button";
import PageAlerts from "@/src/components/ui/PageAlerts";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";
import {
  FeedingActionBar,
  FeedingAllCompletePanel,
  FeedingBlockedPanel,
  FeedingQueueStatusPanel,
  FeedingRequiresRunningPanel,
  FeedingUpNextPanel,
  FeedPlantPanel,
} from "@/src/features/experiments/feeding/components/FeedingPanels";
import { api } from "@/src/lib/api";
import { normalizeUserFacingError } from "@/src/lib/error-normalization";
import { queryKeys } from "@/src/lib/queryKeys";
import { usePageQueryState } from "@/src/lib/usePageQueryState";

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

type ExperimentFeedingPageClientProps = {
  experimentId: string;
};

export function ExperimentFeedingPageClient({ experimentId }: ExperimentFeedingPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const preselectedPlantId = useMemo(() => searchParams.get("plant"), [searchParams]);
  const rawFromParam = useMemo(() => searchParams.get("from"), [searchParams]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mutationOffline, setMutationOffline] = useState(false);
  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null);
  const [amountText, setAmountText] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");

  const statusQueryKey = queryKeys.experiment.status(experimentId);
  const queueQueryKey = queryKeys.experiment.feature(experimentId, "feedingQueue");

  const statusQuery = useQuery({
    queryKey: statusQueryKey,
    queryFn: () =>
      api.get<ExperimentStatusSummary>(
        `/api/v1/experiments/${experimentId}/status/summary`,
      ),
    enabled: Boolean(experimentId),
  });

  const queueQuery = useQuery({
    queryKey: queueQueryKey,
    queryFn: () =>
      api.get<FeedingQueueResponse>(
        `/api/v1/experiments/${experimentId}/feeding/queue`,
      ),
    enabled:
      Boolean(experimentId) &&
      Boolean(statusQuery.data?.setup.is_complete) &&
      statusQuery.data?.lifecycle.state === "running",
  });

  const statusState = usePageQueryState(statusQuery);
  const queueState = usePageQueryState(queueQuery);

  const fromParam = useMemo(() => normalizeFromParam(rawFromParam), [rawFromParam]);
  const overviewHref = fromParam || `/experiments/${experimentId}/overview`;

  const queue = queueQuery.data ?? null;
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

  useEffect(() => {
    if (!experimentId || !statusQuery.data) {
      return;
    }
    if (!statusQuery.data.setup.is_complete) {
      router.replace(`/experiments/${experimentId}/setup`);
    }
  }, [experimentId, router, statusQuery.data]);

  useEffect(() => {
    if (!queue) {
      return;
    }

    const queueIds = new Set(queuePlants.map((plant) => plant.uuid));
    if (preselectedPlantId && queueIds.has(preselectedPlantId)) {
      setSelectedPlantId(preselectedPlantId);
      return;
    }

    if (selectedPlantId && queueIds.has(selectedPlantId)) {
      return;
    }

    const nextPlant = pickNextNeedingFeed(queuePlants, null) || queuePlants[0]?.uuid || null;
    setSelectedPlantId(nextPlant);
    if (nextPlant) {
      syncPlantInUrl(nextPlant);
    }
  }, [preselectedPlantId, queue, queuePlants, selectedPlantId, syncPlantInUrl]);

  const selectPlant = useCallback((plantId: string | null, syncUrl = true) => {
    setSelectedPlantId(plantId);
    if (syncUrl) {
      syncPlantInUrl(plantId);
    }
  }, [syncPlantInUrl]);

  const saveMutation = useMutation({
    mutationFn: async ({ plantId }: { plantId: string }) => {
      const payload = {
        amount_text: amountText.trim() || undefined,
        note: note.trim() || undefined,
      };
      return api.post<{ detail?: string }>(`/api/v1/plants/${plantId}/feed`, payload);
    },
    onMutate: () => {
      setSaving(true);
      setError("");
      setNotice("");
      setMutationOffline(false);
    },
    onError: (mutationError) => {
      const normalized = normalizeUserFacingError(mutationError, "Unable to save feeding event.");
      if (normalized.kind === "offline") {
        setMutationOffline(true);
      }
      setError("Unable to save feeding event.");
    },
    onSettled: () => {
      setSaving(false);
    },
  });

  const saveFeeding = useCallback(async (moveNext: boolean) => {
    if (!selectedPlantId) {
      setError("Choose a plant to feed.");
      return;
    }
    if (saveBlockedReason) {
      setError(`Cannot feed this plant yet: ${saveBlockedReason}.`);
      return;
    }

    const result = await saveMutation.mutateAsync({ plantId: selectedPlantId }).catch(() => null);
    if (!result) {
      return;
    }

    setNotice("Feeding saved.");
    setAmountText("");
    setNote("");
    setShowNote(false);

    const refreshedQueue = await queryClient.fetchQuery({
      queryKey: queueQueryKey,
      queryFn: () =>
        api.get<FeedingQueueResponse>(
          `/api/v1/experiments/${experimentId}/feeding/queue`,
        ),
    });

    const refreshedPlants = unwrapList<FeedingQueuePlant>(refreshedQueue.plants);
    if (moveNext) {
      const nextPlantId = pickNextNeedingFeed(refreshedPlants, selectedPlantId);
      if (!nextPlantId) {
        router.push(`/experiments/${experimentId}/overview?refresh=${Date.now()}`);
        return;
      }
      selectPlant(nextPlantId, true);
    }
  }, [
    experimentId,
    queueQueryKey,
    queryClient,
    saveBlockedReason,
    saveMutation,
    selectedPlantId,
    selectPlant,
    router,
  ]);

  const notInvited = statusState.errorKind === "forbidden";
  const loading =
    statusState.isLoading ||
    (Boolean(statusQuery.data?.setup.is_complete) &&
      statusQuery.data?.lifecycle.state === "running" &&
      queueState.isLoading);

  const queryError = useMemo(() => {
    if (notInvited) {
      return "";
    }
    if (statusState.isError && statusState.errorKind !== "offline") {
      return "Unable to load feeding queue.";
    }
    if (queueState.isError && queueState.errorKind !== "offline") {
      return "Unable to load feeding queue.";
    }
    return "";
  }, [notInvited, queueState.errorKind, queueState.isError, statusState.errorKind, statusState.isError]);

  const offline =
    mutationOffline ||
    statusState.errorKind === "offline" ||
    queueState.errorKind === "offline";

  const queueStatusModel = useMemo(
    () => ({
      remainingCount: queue?.remaining_count ?? 0,
      windowDays: queue?.window_days ?? 0,
      hasSelectedPlant: Boolean(selectedPlant),
      selectedPlantNeedsFeeding: Boolean(selectedPlant?.needs_feeding),
    }),
    [queue?.remaining_count, queue?.window_days, selectedPlant],
  );

  const queueStatusActions = useMemo(
    () => ({
      onNextNeedingFeed: () => {
        const next = pickNextNeedingFeed(queuePlants, selectedPlantId);
        if (next) {
          selectPlant(next, true);
        }
      },
    }),
    [queuePlants, selectPlant, selectedPlantId],
  );

  const feedPlantModel = useMemo(
    () => ({
      selectedPlantId: selectedPlantId ?? "",
      queuePlants,
      selectedPlant,
      amountText,
      showNote,
      note,
      selectedPlantLastFedLabel: formatLastFed(selectedPlant?.last_fed_at ?? null),
      selectedPlantLocationLabel: selectedPlant ? locationLabel(selectedPlant) : "Unplaced",
    }),
    [amountText, note, queuePlants, selectedPlant, selectedPlantId, showNote],
  );

  const feedPlantActions = useMemo(
    () => ({
      onSelectPlant: (plantId: string) => selectPlant(plantId || null, true),
      onAmountChange: setAmountText,
      onToggleNote: () => setShowNote((current) => !current),
      onNoteChange: setNote,
    }),
    [selectPlant],
  );

  const blockedModel = useMemo(
    () => ({
      saveBlockedReason: saveBlockedReason || "",
      experimentId,
      overviewHref,
    }),
    [experimentId, overviewHref, saveBlockedReason],
  );

  const upNextModel = useMemo(
    () => ({
      upNext,
    }),
    [upNext],
  );

  const upNextActions = useMemo(
    () => ({
      onSelectPlant: (plantId: string) => selectPlant(plantId, true),
    }),
    [selectPlant],
  );

  const actionBarModel = useMemo(
    () => ({
      selectedPlantId: selectedPlantId ?? "",
      saving,
      canSaveAndNext,
      saveBlocked,
    }),
    [canSaveAndNext, saveBlocked, saving, selectedPlantId],
  );

  const actionBarActions = useMemo(
    () => ({
      onSave: () => {
        void saveFeeding(false);
      },
      onSaveNext: () => {
        void saveFeeding(true);
      },
    }),
    [saveFeeding],
  );

  if (notInvited) {
    return (
      <PageShell title="Feeding">
        <SectionCard>
          <PageAlerts notInvited />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Feeding"
      subtitle="Record feeding quickly for active plants."
      actions={
        <Link className={buttonVariants({ variant: "default" })} href={overviewHref}>
          ← Overview
        </Link>
      }
    >
      <PageAlerts
        loading={loading}
        loadingText="Loading feeding queue..."
        error={error || queryError}
        notice={notice}
        offline={offline}
      />

      {statusQuery.data && statusQuery.data.lifecycle.state !== "running" ? (
        <FeedingRequiresRunningPanel experimentId={experimentId} />
      ) : null}

      {statusQuery.data && statusQuery.data.lifecycle.state === "running" && queue ? (
        <>
          <FeedingQueueStatusPanel model={queueStatusModel} actions={queueStatusActions} />

          {queue.remaining_count === 0 && !selectedPlant ? (
            <FeedingAllCompletePanel experimentId={experimentId} />
          ) : null}

          <FeedPlantPanel model={feedPlantModel} actions={feedPlantActions} />

          {saveBlocked ? (
            <FeedingBlockedPanel model={blockedModel} />
          ) : null}

          {upNext.length > 0 ? (
            <FeedingUpNextPanel model={upNextModel} actions={upNextActions} formatLastFed={formatLastFed} />
          ) : null}

          <FeedingActionBar model={actionBarModel} actions={actionBarActions} />
        </>
      ) : null}
    </PageShell>
  );
}
