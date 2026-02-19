"use client";

import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type SetStateAction } from "react";

import { unwrapList } from "@/lib/backend";
import { ensureUnlocked, useSavingAction } from "@/src/lib/async/useSavingAction";
import { addManyToSet, removeManyFromSet, setDifference, setWithAll, toggleSet } from "@/src/lib/collections/sets";
import { api, isApiError } from "@/src/lib/api";
import { parseApiErrorPayload } from "@/src/lib/errors/backendErrors";
import { queryKeys } from "@/src/lib/queryKeys";
import { buildChangeset } from "@/src/lib/state/drafts";
import { usePageQueryState } from "@/src/lib/usePageQueryState";
import { useRouteParamString } from "@/src/lib/useRouteParamString";
import { type ExperimentStatusSummary } from "@/lib/experiment-status";
import { suggestTentCode, suggestTentName, suggestTrayName } from "@/lib/id-suggestions";
import type {
  Diagnostics,
  PersistedTrayPlantRow,
  PlacementSummary,
  PlantCell,
  SlotSummary,
  Species,
  TentDraft,
  TentSummary,
  TrayCell,
} from "@/src/features/placement/types";
import {
  RUNNING_LOCK_MESSAGE,
} from "@/src/features/placement/types";
import {
  areShelfCountsEqual,
  buildDefaultShelves,
  buildPlantDraftStats,
  buildPersistedShelfCounts,
  buildPersistedPlacementState,
  buildSortedSlots,
  buildTrayCapacityDraftStats,
  buildTraySlotDraftStats,
  draftChangeCountForStep,
  formatTrayDisplay,
  getTentDraftMeta,
  isStepReadyForNext,
  isActivePlant,
  nextButtonLabel,
  normalizePlant,
  parseStep,
  stepBlockedMessage,
} from "@/src/features/placement/utils";
import type { PlacementWizardController } from "@/src/features/placement/wizard/types";

export function usePlacementWizard(initialStep: number): PlacementWizardController {
  const router = useRouter();
  const queryClient = useQueryClient();

  const experimentId = useRouteParamString("id") || "";

  const [currentStep, setCurrentStep] = useState<number>(parseStep(String(initialStep)));

  const [saving, setSaving] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);

  const [summary, setSummary] = useState<PlacementSummary | null>(null);
  const [statusSummary, setStatusSummary] = useState<ExperimentStatusSummary | null>(null);
  const [species, setSpecies] = useState<Species[]>([]);

  const [shelfCountsByTent, setShelfCountsByTent] = useState<Record<string, number[]>>({});
  const [tentDraftById, setTentDraftById] = useState<Record<string, TentDraft>>({});
  const [tentAllowedSpeciesDraftById, setTentAllowedSpeciesDraftById] = useState<Record<string, string[]>>({});

  const [trayCapacityDraftById, setTrayCapacityDraftById] = useState<Record<string, number>>({});
  const [draftRemovedTrayIds, setDraftRemovedTrayIds] = useState<Set<string>>(new Set());
  const [step2SelectedTrayKeys, setStep2SelectedTrayKeys] = useState<Set<string>>(new Set());
  const [draftNewTrays, setDraftNewTrays] = useState<Array<{ id: string; capacity: number }>>([]);
  const draftTrayIdCounterRef = useRef(1);

  const [persistedPlantToTray, setPersistedPlantToTray] = useState<Record<string, string | null>>({});
  const [draftPlantToTray, setDraftPlantToTray] = useState<Record<string, string | null>>({});
  const [persistedTrayPlantRowByPlantId, setPersistedTrayPlantRowByPlantId] = useState<
    Record<string, PersistedTrayPlantRow>
  >({});

  const [persistedTrayToSlot, setPersistedTrayToSlot] = useState<Record<string, string | null>>({});
  const [draftTrayToSlot, setDraftTrayToSlot] = useState<Record<string, string | null>>({});

  const [selectedPlantIds, setSelectedPlantIds] = useState<Set<string>>(new Set());
  const [activePlantAnchorId, setActivePlantAnchorId] = useState<string | null>(null);
  const [destinationTrayId, setDestinationTrayId] = useState("");

  const [selectedTrayIds, setSelectedTrayIds] = useState<Set<string>>(new Set());
  const [destinationSlotId, setDestinationSlotId] = useState("");

  const { runSavingAction } = useSavingAction<Diagnostics>({
    setSaving,
    setError,
    setNotice,
    setOffline,
    setDiagnostics,
  });

  const placementLocked = statusSummary?.lifecycle.state === "running";

  const tents = useMemo(() => summary?.tents.results || [], [summary?.tents.results]);
  const trays = useMemo(() => summary?.trays.results || [], [summary?.trays.results]);

  const defaultTrayCapacity = useMemo(() => trays[0]?.capacity ?? 4, [trays]);

  useEffect(() => {
    setTrayCapacityDraftById(
      Object.fromEntries(trays.map((tray) => [tray.tray_id, Math.max(1, tray.capacity)])),
    );
    setDraftRemovedTrayIds(setWithAll<string>([]));
    setStep2SelectedTrayKeys(setWithAll<string>([]));
    setDraftNewTrays([]);
  }, [trays]);

  const trayById = useMemo(() => {
    const map = new Map<string, TrayCell>();
    for (const tray of trays) {
      map.set(tray.tray_id, {
        tray_id: tray.tray_id,
        name: tray.name,
        capacity: tray.capacity,
        current_count: tray.current_count,
      });
    }
    return map;
  }, [trays]);

  const plantById = useMemo(() => {
    const map = new Map<string, PlantCell>();
    for (const plant of summary?.unplaced_plants.results || []) {
      if (isActivePlant(plant.status)) {
        map.set(plant.uuid, normalizePlant(plant));
      }
    }
    for (const tray of trays) {
      for (const plant of tray.plants) {
        if (isActivePlant(plant.status)) {
          map.set(plant.uuid, normalizePlant(plant));
        }
      }
    }
    return map;
  }, [summary?.unplaced_plants.results, trays]);

  const sortedPlantIds = useMemo(() => {
    return Array.from(plantById.values())
      .sort((left, right) => {
        const leftId = left.plant_id || "";
        const rightId = right.plant_id || "";
        if (leftId !== rightId) {
          return leftId.localeCompare(rightId);
        }
        return left.uuid.localeCompare(right.uuid);
      })
      .map((plant) => plant.uuid);
  }, [plantById]);

  const sortedTrayIds = useMemo(() => {
    return [...trays]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((tray) => tray.tray_id);
  }, [trays]);

  const slotById = useMemo(() => {
    const map = new Map<string, { slot: SlotSummary; tent: TentSummary }>();
    for (const tent of tents) {
      for (const slot of tent.slots) {
        map.set(slot.slot_id, { slot, tent });
      }
    }
    return map;
  }, [tents]);

  const sortedSlots = useMemo(() => buildSortedSlots(tents), [tents]);

  const tentAllowedSpeciesById = useMemo(() => {
    const map = new Map<string, Set<string> | null>();
    for (const tent of tents) {
      map.set(
        tent.tent_id,
        tent.allowed_species.length > 0 ? new Set(tent.allowed_species.map((item) => item.id)) : null,
      );
    }
    return map;
  }, [tents]);

  const step1Complete = useMemo(() => {
    if (tents.length === 0) {
      return false;
    }
    return tents.every((tent) => {
      const hasLayout =
        tent.layout?.schema_version === 1 && Array.isArray(tent.layout.shelves) && tent.layout.shelves.length > 0;
      const hasSlots = tent.slots.length > 0;
      return hasLayout && hasSlots;
    });
  }, [tents]);

  const step1ReadyForNext = useMemo(() => {
    if (tents.length === 0) {
      return false;
    }
    return tents.every((tent) => {
      const draftShelfCounts = (
        shelfCountsByTent[tent.tent_id] || buildDefaultShelves(tent)
      ).map((value) => Math.max(0, value));
      const persistedShelfCounts = buildPersistedShelfCounts(tent);
      const layoutWillChange =
        tent.slots.length === 0 ||
        !areShelfCountsEqual(draftShelfCounts, persistedShelfCounts);
      if (layoutWillChange) {
        return draftShelfCounts.some((count) => count > 0);
      }
      return tent.slots.length > 0;
    });
  }, [shelfCountsByTent, tents]);

  const step2Complete = useMemo(() => {
    if (trays.length === 0) {
      return false;
    }
    return trays.every((tray) => tray.capacity >= 1);
  }, [trays]);

  const step2ReadyForNext = useMemo(() => {
    const remainingPersistedTrayIds = sortedTrayIds.filter((trayId) => !draftRemovedTrayIds.has(trayId));
    const totalDraftTrayCount = remainingPersistedTrayIds.length + draftNewTrays.length;
    if (totalDraftTrayCount < 1) {
      return false;
    }

    const persistedValid = remainingPersistedTrayIds.every((trayId) => {
      const tray = trayById.get(trayId);
      if (!tray) {
        return false;
      }
      const draftCapacity = trayCapacityDraftById[trayId] ?? tray.capacity;
      return Number.isFinite(draftCapacity) && draftCapacity >= 1;
    });
    if (!persistedValid) {
      return false;
    }

    for (const draftTray of draftNewTrays) {
      const capacity = draftTray.capacity;
      if (!Number.isFinite(capacity) || capacity < 1) {
        return false;
      }
    }

    return true;
  }, [
    draftNewTrays,
    draftRemovedTrayIds,
    sortedTrayIds,
    trayById,
    trayCapacityDraftById,
  ]);

  const step3Complete = useMemo(() => {
    if (sortedPlantIds.length === 0) {
      return true;
    }
    return sortedPlantIds.every((plantId) => (draftPlantToTray[plantId] ?? null) !== null);
  }, [draftPlantToTray, sortedPlantIds]);

  const step4Complete = useMemo(() => {
    if (sortedTrayIds.length === 0) {
      return false;
    }
    return sortedTrayIds.every((trayId) => (draftTrayToSlot[trayId] ?? null) !== null);
  }, [draftTrayToSlot, sortedTrayIds]);

  const maxUnlockedStep = useMemo(() => {
    if (!step1Complete) {
      return 1;
    }
    if (!step2Complete) {
      return 2;
    }
    if (!step3Complete) {
      return 3;
    }
    return 4;
  }, [step1Complete, step2Complete, step3Complete]);

  useEffect(() => {
    setCurrentStep((current) => Math.min(Math.max(1, current), maxUnlockedStep));
  }, [maxUnlockedStep]);

  const placementDataQueryKey = queryKeys.experiment.feature(experimentId, "placement", "wizardData");

  const fetchPlacementPageData = useCallback(async () => {
    await api.get<{ email: string; role: string; status: string }>("/api/me");
    const [summaryPayload, statusPayload, speciesPayload] = await Promise.all([
      api.get<PlacementSummary>(`/api/v1/experiments/${experimentId}/placement/summary`),
      api.get<ExperimentStatusSummary>(`/api/v1/experiments/${experimentId}/status/summary`),
      api.get<unknown>("/api/v1/species/"),
    ]);

    return {
      summaryPayload,
      statusPayload,
      species: unwrapList<Species>(speciesPayload),
    };
  }, [experimentId]);

  const placementDataQuery = useQuery({
    queryKey: placementDataQueryKey,
    queryFn: fetchPlacementPageData,
    enabled: Boolean(experimentId),
    retry: false,
  });
  const placementDataState = usePageQueryState(placementDataQuery);
  const notInvited = isApiError(placementDataQuery.error) && placementDataQuery.error.status === 403;
  const loading = Boolean(experimentId) && placementDataQuery.isPending;
  const queryOffline = placementDataState.errorKind === "offline";

  useEffect(() => {
    const data = placementDataQuery.data;
    if (!data) {
      return;
    }
    setSummary(data.summaryPayload);
    setStatusSummary(data.statusPayload);
    setSpecies(data.species);
    setError("");
  }, [placementDataQuery.data]);

  useEffect(() => {
    if (!placementDataQuery.isError || notInvited) {
      return;
    }
    if (queryOffline) {
      setOffline(true);
      setError("");
      return;
    }
    setOffline(false);
    setError("Unable to load placement page.");
  }, [notInvited, placementDataQuery.isError, queryOffline]);

  useEffect(() => {
    if (placementDataQuery.isSuccess) {
      setOffline(false);
    }
  }, [placementDataQuery.isSuccess]);

  const reloadPlacementData = useCallback(async () => {
    await queryClient.fetchQuery({
      queryKey: placementDataQueryKey,
      queryFn: fetchPlacementPageData,
    });
  }, [fetchPlacementPageData, placementDataQueryKey, queryClient]);

  useEffect(() => {
    const persistedPlacementState = buildPersistedPlacementState(
      summary?.unplaced_plants.results || [],
      trays,
    );
    setPersistedPlantToTray(persistedPlacementState.persistedPlantToTray);
    setDraftPlantToTray(persistedPlacementState.persistedPlantToTray);
    setPersistedTrayPlantRowByPlantId(persistedPlacementState.persistedTrayPlantRowByPlantId);
    setPersistedTrayToSlot(persistedPlacementState.persistedTrayToSlot);
    setDraftTrayToSlot(persistedPlacementState.persistedTrayToSlot);

    setShelfCountsByTent((current) => {
      const next = { ...current };
      for (const tent of tents) {
        if (!next[tent.tent_id] || next[tent.tent_id].length === 0) {
          next[tent.tent_id] = buildDefaultShelves(tent);
        }
      }
      return next;
    });

    setTentDraftById((current) => {
      const next = { ...current };
      for (const tent of tents) {
        next[tent.tent_id] = {
          name: tent.name,
          code: tent.code,
        };
      }
      return next;
    });
    setTentAllowedSpeciesDraftById((current) => {
      const next = { ...current };
      for (const tent of tents) {
        next[tent.tent_id] = tent.allowed_species.map((item) => item.id);
      }
      return next;
    });

    setDestinationTrayId((current) => (current && trayById.has(current) ? current : trays[0]?.tray_id || ""));
    setDestinationSlotId((current) => (current && slotById.has(current) ? current : ""));
    setSelectedPlantIds(setWithAll<string>([]));
    setSelectedTrayIds(setWithAll<string>([]));
    setActivePlantAnchorId(null);
  }, [slotById, summary?.unplaced_plants.results, tents, trayById, trays]);

  const draftPlantCountByTray = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tray of trays) {
      counts[tray.tray_id] = 0;
    }
    for (const trayId of Object.values(draftPlantToTray)) {
      if (trayId && counts[trayId] !== undefined) {
        counts[trayId] += 1;
      }
    }
    return counts;
  }, [draftPlantToTray, trays]);

  const mainGridPlantIds = useMemo(
    () => sortedPlantIds.filter((plantId) => (draftPlantToTray[plantId] ?? null) === null),
    [draftPlantToTray, sortedPlantIds],
  );

  const trayPlantIdsByTray = useMemo(() => {
    const grouped: Record<string, string[]> = {};
    for (const tray of trays) {
      grouped[tray.tray_id] = [];
    }
    for (const plantId of sortedPlantIds) {
      const trayId = draftPlantToTray[plantId] ?? null;
      if (trayId && grouped[trayId]) {
        grouped[trayId].push(plantId);
      }
    }
    return grouped;
  }, [draftPlantToTray, sortedPlantIds, trays]);

  const selectedInMainGrid = useMemo(
    () => mainGridPlantIds.filter((plantId) => selectedPlantIds.has(plantId)),
    [mainGridPlantIds, selectedPlantIds],
  );

  const selectedInTrayByTrayId = useMemo(() => {
    const grouped: Record<string, string[]> = {};
    for (const tray of trays) {
      grouped[tray.tray_id] = (trayPlantIdsByTray[tray.tray_id] || []).filter((plantId) =>
        selectedPlantIds.has(plantId),
      );
    }
    return grouped;
  }, [selectedPlantIds, trayPlantIdsByTray, trays]);

  const draftSlotToTray = useMemo(() => {
    const map = new Map<string, string>();
    for (const trayId of sortedTrayIds) {
      const slotId = draftTrayToSlot[trayId] ?? null;
      if (slotId) {
        map.set(slotId, trayId);
      }
    }
    return map;
  }, [draftTrayToSlot, sortedTrayIds]);

  const mainGridTrayIds = useMemo(
    () => sortedTrayIds.filter((trayId) => (draftTrayToSlot[trayId] ?? null) === null),
    [draftTrayToSlot, sortedTrayIds],
  );

  const selectedTraysByTentId = useMemo(() => {
    const grouped: Record<string, string[]> = {};
    for (const tent of tents) {
      grouped[tent.tent_id] = [];
    }
    for (const trayId of selectedTrayIds) {
      const slotId = draftTrayToSlot[trayId] ?? null;
      if (!slotId) {
        continue;
      }
      const slotRef = slotById.get(slotId);
      if (slotRef) {
        grouped[slotRef.tent.tent_id].push(trayId);
      }
    }
    return grouped;
  }, [draftTrayToSlot, selectedTrayIds, slotById, tents]);

  const plantDraftStats = useMemo(
    () =>
      buildPlantDraftStats(
        sortedPlantIds,
        persistedPlantToTray,
        draftPlantToTray,
      ),
    [draftPlantToTray, persistedPlantToTray, sortedPlantIds],
  );
  const placementDraftChangeCount = plantDraftStats.changeCount;
  const dirtyPlantContainerTrayIds = plantDraftStats.dirtyContainerTrayIds;

  const traySlotDraftStats = useMemo(
    () =>
      buildTraySlotDraftStats(
        sortedTrayIds,
        persistedTrayToSlot,
        draftTrayToSlot,
      ),
    [draftTrayToSlot, persistedTrayToSlot, sortedTrayIds],
  );
  const traySlotDraftChangeCount = traySlotDraftStats.changeCount;
  const dirtySlotIds = traySlotDraftStats.dirtySlotIds;

  const step1DraftStats = useMemo(() => {
    let tentSlotDraftChangeCount = 0;
    let tentDetailsDraftChangeCount = 0;
    const dirtyTentIds = new Set<string>();
    const tentDraftMetaById = new Map<string, ReturnType<typeof getTentDraftMeta>>();

    for (const tent of tents) {
      const tentDraftMeta = getTentDraftMeta(
        tent,
        shelfCountsByTent,
        tentAllowedSpeciesDraftById,
        tentDraftById,
      );
      tentDraftMetaById.set(tent.tent_id, tentDraftMeta);
      if (tentDraftMeta.layoutDirty) {
        tentSlotDraftChangeCount += 1;
      }
      if (tentDraftMeta.detailDirty) {
        tentDetailsDraftChangeCount += 1;
      }
      if (tentDraftMeta.layoutDirty || tentDraftMeta.detailDirty) {
        dirtyTentIds.add(tent.tent_id);
      }
    }

    return {
      tentSlotDraftChangeCount,
      tentDetailsDraftChangeCount,
      dirtyTentIds,
      tentDraftMetaById,
    };
  }, [
    shelfCountsByTent,
    tentAllowedSpeciesDraftById,
    tentDraftById,
    tents,
  ]);
  const tentSlotDraftChangeCount = step1DraftStats.tentSlotDraftChangeCount;
  const tentDetailsDraftChangeCount = step1DraftStats.tentDetailsDraftChangeCount;
  const dirtyTentIds = step1DraftStats.dirtyTentIds;
  const tentDraftMetaById = step1DraftStats.tentDraftMetaById;

  const step1DraftChangeCount = tentSlotDraftChangeCount + tentDetailsDraftChangeCount;

  const retainedPersistedTrays = useMemo(
    () => trays.filter((tray) => !draftRemovedTrayIds.has(tray.tray_id)),
    [draftRemovedTrayIds, trays],
  );
  const trayCountDraftChangeCount = draftRemovedTrayIds.size + draftNewTrays.length;
  const trayCapacityDraftStats = useMemo(
    () => buildTrayCapacityDraftStats(retainedPersistedTrays, trayCapacityDraftById),
    [retainedPersistedTrays, trayCapacityDraftById],
  );
  const trayCapacityDraftChangeCount = trayCapacityDraftStats.changeCount;
  const dirtyTrayCapacityIds = trayCapacityDraftStats.dirtyTrayCapacityIds;

  const step2DraftChangeCount = trayCountDraftChangeCount + trayCapacityDraftChangeCount;
  const totalDraftTrayCount = retainedPersistedTrays.length + draftNewTrays.length;
  const stepCompletionState = useMemo(
    () => ({
      step1Complete,
      step1ReadyForNext,
      step2Complete,
      step2ReadyForNext,
      step3Complete,
      step4Complete,
    }),
    [step1Complete, step1ReadyForNext, step2Complete, step2ReadyForNext, step3Complete, step4Complete],
  );
  const stepDraftCounts = useMemo(
    () => ({
      step1DraftChangeCount,
      step2DraftChangeCount,
      placementDraftChangeCount,
      traySlotDraftChangeCount,
    }),
    [
      placementDraftChangeCount,
      step1DraftChangeCount,
      step2DraftChangeCount,
      traySlotDraftChangeCount,
    ],
  );
  const currentStepDraftChangeCount = draftChangeCountForStep(currentStep, stepDraftCounts);
  const currentStepBlockedMessage = !isStepReadyForNext(currentStep, stepCompletionState)
    ? stepBlockedMessage(currentStep, stepCompletionState)
    : "";
  const nextPrimaryButtonLabel = nextButtonLabel(
    saving,
    currentStep,
    currentStepDraftChangeCount,
  );

  function goToStep(step: number) {
    const next = Math.min(Math.max(1, step), maxUnlockedStep);
    setCurrentStep(next);
    setDiagnostics(null);
    setError("");
  }

  async function goNextStep() {
    if (!isStepReadyForNext(currentStep, stepCompletionState)) {
      setError(stepBlockedMessage(currentStep, stepCompletionState));
      return;
    }
    setError("");

    if (currentStepDraftChangeCount > 0) {
      let saved = true;
      if (currentStep === 1) {
        saved = await applyTentSlotLayouts();
      } else if (currentStep === 2) {
        saved = await applyTrayCountDraft();
      } else if (currentStep === 3) {
        saved = await applyPlantToTrayLayout();
      } else {
        saved = await applyTrayToSlotLayout();
      }
      if (!saved) {
        return;
      }
    }

    if (currentStep === 4) {
      setDiagnostics(null);
      router.push(`/experiments/${experimentId}/overview`);
      return;
    }
    setCurrentStep((current) => Math.min(4, current + 1));
    setDiagnostics(null);
  }

  function goPreviousStep() {
    setCurrentStep((current) => Math.max(1, current - 1));
    setError("");
    setDiagnostics(null);
  }

  function resetCurrentStepDrafts() {
    if (currentStep === 1) {
      setShelfCountsByTent((current) => {
        const next = { ...current };
        for (const tent of tents) {
          next[tent.tent_id] =
            tent.slots.length > 0 ? buildPersistedShelfCounts(tent) : buildDefaultShelves(tent);
        }
        return next;
      });
      setTentDraftById((current) => {
        const next = { ...current };
        for (const tent of tents) {
          next[tent.tent_id] = { name: tent.name, code: tent.code };
        }
        return next;
      });
      setTentAllowedSpeciesDraftById((current) => {
        const next = { ...current };
        for (const tent of tents) {
          next[tent.tent_id] = tent.allowed_species.map((item) => item.id);
        }
        return next;
      });
      setNotice("Discarded step 1 draft changes.");
    } else if (currentStep === 2) {
      setTrayCapacityDraftById(
        Object.fromEntries(trays.map((tray) => [tray.tray_id, Math.max(1, tray.capacity)])),
      );
      setDraftRemovedTrayIds(setWithAll<string>([]));
      setStep2SelectedTrayKeys(setWithAll<string>([]));
      setDraftNewTrays([]);
      setNotice("Discarded step 2 draft changes.");
    } else if (currentStep === 3) {
      setDraftPlantToTray(persistedPlantToTray);
      setSelectedPlantIds(setWithAll<string>([]));
      setActivePlantAnchorId(null);
      setDiagnostics(null);
      setNotice("Discarded step 3 draft changes.");
    } else {
      setDraftTrayToSlot(persistedTrayToSlot);
      setSelectedTrayIds(setWithAll<string>([]));
      setDestinationSlotId("");
      setDiagnostics(null);
      setNotice("Discarded step 4 draft changes.");
    }
    setError("");
    setDiagnostics(null);
  }

  async function createTent() {
    if (!ensureUnlocked({ locked: placementLocked, message: RUNNING_LOCK_MESSAGE, setError })) {
      return;
    }
    if (!summary) {
      setError("Placement data is still loading. Try again.");
      return;
    }

    await runSavingAction({
      locked: placementLocked,
      lockMessage: RUNNING_LOCK_MESSAGE,
      fallbackError: "Unable to create tent.",
      clearDiagnostics: false,
      action: async () => {
        const knownNames = tents.map((tent) => tent.name).filter(Boolean);
        const knownCodes = tents.map((tent) => tent.code).filter(Boolean);

        for (let attempt = 0; attempt < 8; attempt += 1) {
          const name = suggestTentName(knownNames);
          const code = suggestTentCode(knownCodes);

          if (!name) {
            setError("Tent name is required.");
            return false;
          }

          try {
            await api.post(`/api/v1/experiments/${experimentId}/tents`, {
              name,
              code,
              allowed_species: [],
            });
            setNotice("Tent created.");
            await reloadPlacementData();
            return true;
          } catch (requestError) {
            const payload = parseApiErrorPayload<Diagnostics>(requestError, "Unable to create tent.");
            const detailLower = payload.detail.toLowerCase();
            const duplicateName = detailLower.includes("tent name already exists");
            const duplicateCode = detailLower.includes("tent code already exists");

            if (!duplicateName && !duplicateCode) {
              setError(payload.detail);
              return false;
            }

            knownNames.push(name);
            knownCodes.push(code);
          }
        }

        setError("Unable to create a unique tent name/code. Try again.");
        return false;
      },
    });
  }

  async function removeTent() {
    if (!ensureUnlocked({ locked: placementLocked, message: RUNNING_LOCK_MESSAGE, setError })) {
      return;
    }
    if (tents.length === 0) {
      return;
    }

    const removableTent =
      [...tents].reverse().find((tent) => tent.slots.length === 0) || tents[tents.length - 1];
    if (!removableTent) {
      return;
    }

    await runSavingAction({
      locked: placementLocked,
      lockMessage: RUNNING_LOCK_MESSAGE,
      fallbackError: "Unable to remove tent.",
      clearDiagnostics: false,
      action: async () => {
        try {
          await api.delete(`/api/v1/tents/${removableTent.tent_id}`);
        } catch (requestError) {
          const payload = parseApiErrorPayload<Diagnostics>(requestError, "Unable to remove tent.");
          setError(payload.detail);
          setDiagnostics(payload.diagnostics);
          return false;
        }
        setNotice(`Removed ${removableTent.name}.`);
        await reloadPlacementData();
        return true;
      },
    });
  }

  function adjustShelfSlotCount(tentId: string, shelfIndex: number, delta: number) {
    setShelfCountsByTent((current) => {
      const next = [...(current[tentId] || [4])];
      next[shelfIndex] = Math.max(0, (next[shelfIndex] || 0) + delta);
      return { ...current, [tentId]: next };
    });
  }

  function addShelf(tentId: string) {
    setShelfCountsByTent((current) => {
      const next = [...(current[tentId] || [4]), 0];
      return { ...current, [tentId]: next };
    });
  }

  function removeShelf(tentId: string) {
    setShelfCountsByTent((current) => {
      const values = [...(current[tentId] || [4])];
      if (values.length <= 1) {
        return current;
      }
      values.pop();
      return { ...current, [tentId]: values };
    });
  }

  async function applyTentSlotLayouts(): Promise<boolean> {
    if (!ensureUnlocked({ locked: placementLocked, message: RUNNING_LOCK_MESSAGE, setError })) {
      return false;
    }

    const changedTentDetails = tents.filter(
      (tent) => tentDraftMetaById.get(tent.tent_id)?.detailDirty,
    );

    const changedTentLayouts = tents.filter(
      (tent) => tentDraftMetaById.get(tent.tent_id)?.layoutDirty,
    );

    if (changedTentDetails.length === 0 && changedTentLayouts.length === 0) {
      setNotice("No step 1 changes to apply.");
      return true;
    }

    return runSavingAction({
      locked: placementLocked,
      lockMessage: RUNNING_LOCK_MESSAGE,
      fallbackError: "Unable to apply tent slot layout changes.",
      action: async () => {
        let detailAppliedCount = 0;
        let layoutAppliedCount = 0;

        for (const tent of changedTentDetails) {
          const tentDraftMeta = tentDraftMetaById.get(tent.tent_id);
          if (!tentDraftMeta) {
            continue;
          }

          try {
            await api.patch(`/api/v1/tents/${tent.tent_id}`, {
              name: tentDraftMeta.draftName,
              code: tentDraftMeta.draftCode,
              allowed_species: tentDraftMeta.draftAllowedSpeciesIds,
            });
          } catch (requestError) {
            const payload = parseApiErrorPayload<Diagnostics>(requestError, "Unable to update tent details.");
            setError(`${tent.name}: ${payload.detail}`);
            setDiagnostics(payload.diagnostics);
            return false;
          }
          detailAppliedCount += 1;
        }

        for (const tent of changedTentLayouts) {
          const tentDraftMeta = tentDraftMetaById.get(tent.tent_id);
          if (!tentDraftMeta) {
            continue;
          }
          const shelfCounts = tentDraftMeta.draftShelfCounts;
          const layout = {
            schema_version: 1,
            shelves: shelfCounts.map((trayCount, index) => ({
              index: index + 1,
              tray_count: Math.max(0, trayCount),
            })),
          };

          try {
            await api.post(`/api/v1/tents/${tent.tent_id}/slots/generate`, { layout });
          } catch (requestError) {
            const payload = parseApiErrorPayload<Diagnostics>(requestError, "Unable to generate slots.");
            const orphanDiagnostics = payload.diagnostics as
              | {
                  would_orphan_trays?: Array<{ tray_code: string; slot_shelf_index: number; slot_index: number }>;
                }
              | null;
            const orphanMessage = orphanDiagnostics?.would_orphan_trays?.length
              ? ` Would orphan: ${orphanDiagnostics.would_orphan_trays
                  .map((item) => `${item.tray_code} @ S${item.slot_shelf_index}-${item.slot_index}`)
                  .join(", ")}.`
              : "";
            setError(`${tent.name}: ${payload.detail + orphanMessage}`);
            setDiagnostics(payload.diagnostics);
            if (detailAppliedCount > 0 || layoutAppliedCount > 0) {
              await reloadPlacementData();
            }
            return false;
          }

          layoutAppliedCount += 1;
        }

        const messages: string[] = [];
        if (detailAppliedCount > 0) {
          messages.push(`Saved tent details for ${detailAppliedCount} tent(s).`);
        }
        if (layoutAppliedCount > 0) {
          messages.push(`Applied tent slot layout for ${layoutAppliedCount} tent(s).`);
        }
        setNotice(messages.join(" "));
        await reloadPlacementData();
        return true;
      },
    });
  }

  function addDraftTray() {
    const draftId = `draft-tray-${draftTrayIdCounterRef.current}`;
    draftTrayIdCounterRef.current += 1;
    setDraftNewTrays((current) => [
      ...current,
      {
        id: draftId,
        capacity: defaultTrayCapacity,
      },
    ]);
  }

  function toggleStep2TraySelection(trayKey: string) {
    setStep2SelectedTrayKeys((current) => toggleSet(current, trayKey));
  }

  function removeSelectedDraftTrays() {
    if (!ensureUnlocked({ locked: placementLocked, message: RUNNING_LOCK_MESSAGE, setError })) {
      return;
    }
    if (step2SelectedTrayKeys.size === 0) {
      return;
    }

    const persistedTrayIdsToRemove: string[] = [];
    const draftTrayIdsToRemove = new Set<string>();

    for (const trayKey of step2SelectedTrayKeys) {
      if (trayKey.startsWith("persisted:")) {
        persistedTrayIdsToRemove.push(trayKey.slice("persisted:".length));
      } else if (trayKey.startsWith("draft:")) {
        draftTrayIdsToRemove.add(trayKey.slice("draft:".length));
      }
    }

    if (persistedTrayIdsToRemove.length > 0) {
      setDraftRemovedTrayIds((current) => {
        const next = new Set(current);
        for (const trayId of persistedTrayIdsToRemove) {
          next.add(trayId);
        }
        return next;
      });
    }

    if (draftTrayIdsToRemove.size > 0) {
      setDraftNewTrays((current) => current.filter((tray) => !draftTrayIdsToRemove.has(tray.id)));
    }

    setStep2SelectedTrayKeys(setWithAll<string>([]));
    setError("");
    setDiagnostics(null);
    setNotice(`${persistedTrayIdsToRemove.length + draftTrayIdsToRemove.size} tray(s) staged for removal.`);
  }

  function adjustTrayCapacity(trayId: string, delta: number) {
    const tray = trayById.get(trayId);
    if (!tray) {
      return;
    }
    setTrayCapacityDraftById((current) => {
      const currentValue = current[trayId] ?? tray.capacity;
      return {
        ...current,
        [trayId]: Math.max(1, currentValue + delta),
      };
    });
  }

  function adjustPendingTrayCapacity(draftTrayId: string, delta: number) {
    setDraftNewTrays((current) =>
      current.map((tray) =>
        tray.id === draftTrayId
          ? {
              ...tray,
              capacity: Math.max(1, tray.capacity + delta),
            }
          : tray,
      ),
    );
  }

  async function applyTrayCountDraft(): Promise<boolean> {
    if (!ensureUnlocked({ locked: placementLocked, message: RUNNING_LOCK_MESSAGE, setError })) {
      return false;
    }

    const traysToRemove = sortedTrayIds.filter((trayId) => draftRemovedTrayIds.has(trayId));
    const remainingTrayIds = sortedTrayIds.filter((trayId) => !draftRemovedTrayIds.has(trayId));
    if (traysToRemove.length === 0 && draftNewTrays.length === 0 && trayCapacityDraftChangeCount === 0) {
      return true;
    }

    return runSavingAction({
      locked: placementLocked,
      lockMessage: RUNNING_LOCK_MESSAGE,
      fallbackError: "Unable to apply tray manager changes.",
      action: async () => {
        let createdCount = 0;
        let deletedCount = 0;
        let detachedPlantCount = 0;
        let capacityUpdatedCount = 0;
        let mutationCount = 0;
        const traySummaryById = new Map(trays.map((tray) => [tray.tray_id, tray] as const));

        for (const trayId of traysToRemove) {
          const tray = traySummaryById.get(trayId);
          const trayPlants = tray?.plants || [];

          for (const trayPlant of trayPlants) {
            try {
              await api.delete(`/api/v1/trays/${trayId}/plants/${trayPlant.tray_plant_id}`);
            } catch (requestError) {
              const parsed = parseApiErrorPayload<Diagnostics>(requestError, "Unable to clear tray plants.");
              setError(parsed.detail);
              setDiagnostics(parsed.diagnostics);
              if (mutationCount > 0) {
                await reloadPlacementData();
              }
              return false;
            }
            detachedPlantCount += 1;
            mutationCount += 1;
          }

          try {
            await api.delete(`/api/v1/trays/${trayId}/`);
          } catch (requestError) {
            const parsed = parseApiErrorPayload<Diagnostics>(requestError, "Unable to remove trays.");
            setError(parsed.detail);
            setDiagnostics(parsed.diagnostics);
            if (mutationCount > 0) {
              await reloadPlacementData();
            }
            return false;
          }
          deletedCount += 1;
          mutationCount += 1;
        }

        const existingNames = new Set(
          trays.filter((tray) => !draftRemovedTrayIds.has(tray.tray_id)).map((tray) => tray.name),
        );
        for (const draftTray of draftNewTrays) {
          const suggestedName = suggestTrayName(Array.from(existingNames));
          const draftCapacity = Math.max(1, draftTray.capacity);
          try {
            const payload = await api.post<{ detail?: string; suggested_name?: string; name?: string }>(
              `/api/v1/experiments/${experimentId}/trays`,
              {
                name: suggestedName,
                capacity: draftCapacity,
              },
            );
            existingNames.add(payload.name || payload.suggested_name || suggestedName);
            createdCount += 1;
            mutationCount += 1;
          } catch (requestError) {
            const payload = parseApiErrorPayload<Diagnostics>(requestError, "Unable to add trays.");
            if (mutationCount > 0) {
              await reloadPlacementData();
            }
            setError(payload.detail);
            setDiagnostics(payload.diagnostics);
            return false;
          }
        }

        for (const trayId of remainingTrayIds) {
          const tray = trayById.get(trayId);
          if (!tray) {
            continue;
          }
          const draftCapacity = Math.max(1, trayCapacityDraftById[trayId] ?? tray.capacity);
          if (draftCapacity === tray.capacity) {
            continue;
          }
          try {
            await api.patch(`/api/v1/trays/${trayId}/`, {
              capacity: draftCapacity,
            });
          } catch (requestError) {
            const parsed = parseApiErrorPayload<Diagnostics>(requestError, "Unable to update tray capacity.");
            setError(parsed.detail);
            setDiagnostics(parsed.diagnostics);
            if (mutationCount > 0) {
              await reloadPlacementData();
            }
            return false;
          }
          capacityUpdatedCount += 1;
          mutationCount += 1;
        }

        const messages: string[] = [];
        if (createdCount > 0) {
          messages.push(`Added ${createdCount} tray(s).`);
        }
        if (detachedPlantCount > 0) {
          messages.push(`Removed ${detachedPlantCount} plant placement(s) from deleted trays.`);
        }
        if (deletedCount > 0) {
          messages.push(`Removed ${deletedCount} tray(s).`);
        }
        if (capacityUpdatedCount > 0) {
          messages.push(`Updated ${capacityUpdatedCount} tray capacity setting(s).`);
        }
        setNotice(messages.join(" "));
        await reloadPlacementData();
        return true;
      },
    });
  }

  function togglePlantSelection(plantId: string) {
    if (!plantById.has(plantId)) {
      return;
    }

    setSelectedPlantIds((current) => toggleSet(current, plantId));
    setActivePlantAnchorId(plantId);
  }

  function selectAllPlantsInMainGrid() {
    setSelectedPlantIds((current) => addManyToSet(current, mainGridPlantIds));
    setActivePlantAnchorId((current) => current || mainGridPlantIds[0] || null);
  }

  function selectSameSpeciesInMainGrid() {
    if (!activePlantAnchorId) {
      return;
    }
    const anchor = plantById.get(activePlantAnchorId);
    if (!anchor) {
      return;
    }

    const mainGridSet = setWithAll(mainGridPlantIds);
    const matching = mainGridPlantIds.filter((plantId) => {
      const plant = plantById.get(plantId);
      return !!plant && plant.species_id === anchor.species_id;
    });

    setSelectedPlantIds((current) => {
      const outsideMainGrid = setDifference(current, mainGridSet);
      return addManyToSet(outsideMainGrid, matching);
    });
  }

  function clearPlantSelection() {
    setSelectedPlantIds(setWithAll<string>([]));
    setActivePlantAnchorId(null);
  }

  function validatePlantMove(selectedPlantIdsToMove: string[], tray: TrayCell): { detail: string; diagnostics: Diagnostics } | null {
    const currentCount = draftPlantCountByTray[tray.tray_id] || 0;
    const remaining = tray.capacity - currentCount;
    if (selectedPlantIdsToMove.length > remaining) {
      return {
        detail: `Tray is full (capacity ${tray.capacity}).`,
        diagnostics: { reason_counts: { tray_full: 1 } },
      };
    }

    const destinationSlotId = draftTrayToSlot[tray.tray_id] ?? null;
    if (!destinationSlotId) {
      return null;
    }

    const slotRef = slotById.get(destinationSlotId);
    if (!slotRef) {
      return null;
    }

    const allowedSpecies = tentAllowedSpeciesById.get(slotRef.tent.tent_id);
    if (!allowedSpecies || allowedSpecies.size === 0) {
      return null;
    }

    const conflicts: Diagnostics["unplaceable_plants"] = [];

    for (const plantId of selectedPlantIdsToMove) {
      const plant = plantById.get(plantId);
      if (!plant) {
        continue;
      }
      if (!allowedSpecies.has(plant.species_id)) {
        conflicts.push({
          plant_id: plant.plant_id,
          species_name: plant.species_name,
          reason: "restriction_conflict",
        });
      }
    }

    if (conflicts.length > 0) {
      return {
        detail: "One or more selected plants do not match destination tent restrictions.",
        diagnostics: {
          reason_counts: { restriction_conflict: conflicts.length },
          unplaceable_plants: conflicts,
        },
      };
    }

    return null;
  }

  function stageMovePlantsToTray() {
    if (!ensureUnlocked({ locked: placementLocked, message: RUNNING_LOCK_MESSAGE, setError })) {
      return;
    }
    if (!destinationTrayId) {
      setError("Select a destination tray first.");
      return;
    }

    if (selectedInMainGrid.length === 0) {
      setError("Select one or more plants from the unplaced grid first.");
      return;
    }

    const destinationTray = trayById.get(destinationTrayId);
    if (!destinationTray) {
      setError("Destination tray not found.");
      return;
    }

    const validation = validatePlantMove(selectedInMainGrid, destinationTray);
    if (validation) {
      setError(validation.detail);
      setDiagnostics(validation.diagnostics);
      return;
    }

    setDraftPlantToTray((current) => {
      const next = { ...current };
      for (const plantId of selectedInMainGrid) {
        next[plantId] = destinationTrayId;
      }
      return next;
    });

    setSelectedPlantIds((current) => {
      return removeManyFromSet(current, selectedInMainGrid);
    });

    setDiagnostics(null);
    setError("");
    setNotice(
      `${selectedInMainGrid.length} plant(s) staged for ${formatTrayDisplay(destinationTray.name, destinationTray.tray_id)}.`,
    );
  }

  function stageRemovePlantsFromTray(trayId: string) {
    if (!ensureUnlocked({ locked: placementLocked, message: RUNNING_LOCK_MESSAGE, setError })) {
      return;
    }

    const selectedInTray = selectedInTrayByTrayId[trayId] || [];
    if (selectedInTray.length === 0) {
      return;
    }

    setDraftPlantToTray((current) => {
      const next = { ...current };
      for (const plantId of selectedInTray) {
        next[plantId] = null;
      }
      return next;
    });

    setSelectedPlantIds((current) => {
      return removeManyFromSet(current, selectedInTray);
    });

    setDiagnostics(null);
    setError("");
    setNotice(`${selectedInTray.length} plant(s) staged back to unplaced.`);
  }

  function toggleTraySelection(trayId: string) {
    if (!trayById.has(trayId)) {
      return;
    }

    setSelectedTrayIds((current) => toggleSet(current, trayId));
  }

  function clearTraySelection() {
    setSelectedTrayIds(setWithAll<string>([]));
  }

  function selectAllTraysInMainGrid() {
    setSelectedTrayIds((current) => addManyToSet(current, mainGridTrayIds));
  }

  function toggleDestinationSlot(slotId: string) {
    if (!slotById.has(slotId)) {
      return;
    }
    setDestinationSlotId((current) => (current === slotId ? "" : slotId));
  }

  function stageMoveTraysToSlots() {
    if (!ensureUnlocked({ locked: placementLocked, message: RUNNING_LOCK_MESSAGE, setError })) {
      return;
    }

    if (!destinationSlotId) {
      setError("Select a destination slot first.");
      return;
    }

    const selected = sortedTrayIds.filter((trayId) => selectedTrayIds.has(trayId));
    if (selected.length === 0) {
      setError("Select one or more trays first.");
      return;
    }

    const startIndex = sortedSlots.findIndex((slot) => slot.slot_id === destinationSlotId);
    if (startIndex < 0) {
      setError("Destination slot is not available.");
      return;
    }

    const selectedSet = setWithAll(selected);
    const availableSlots = sortedSlots
      .slice(startIndex)
      .filter((slot) => {
        const occupant = draftSlotToTray.get(slot.slot_id) || null;
        return !occupant || selectedSet.has(occupant);
      })
      .map((slot) => slot.slot_id);

    if (availableSlots.length < selected.length) {
      setError("Not enough empty slots from the selected destination onward.");
      setDiagnostics({
        reason_counts: {
          insufficient_slots: 1,
        },
      });
      return;
    }

    setDraftTrayToSlot((current) => {
      const next = { ...current };
      const orderedSelected = [...selected].sort((left, right) => {
        const leftTray = trayById.get(left);
        const rightTray = trayById.get(right);
        return (leftTray?.name || left).localeCompare(rightTray?.name || right);
      });

      for (let index = 0; index < orderedSelected.length; index += 1) {
        next[orderedSelected[index]] = availableSlots[index];
      }
      return next;
    });

    setSelectedTrayIds(setWithAll<string>([]));
    setDiagnostics(null);
    setError("");
    setNotice(`${selected.length} tray(s) staged into slots.`);
  }

  function stageRemoveTraysFromTent(tentId: string) {
    if (!ensureUnlocked({ locked: placementLocked, message: RUNNING_LOCK_MESSAGE, setError })) {
      return;
    }

    const selectedInTent = selectedTraysByTentId[tentId] || [];
    if (selectedInTent.length === 0) {
      return;
    }

    setDraftTrayToSlot((current) => {
      const next = { ...current };
      for (const trayId of selectedInTent) {
        next[trayId] = null;
      }
      return next;
    });

    setSelectedTrayIds((current) => {
      return removeManyFromSet(current, selectedInTent);
    });

    setError("");
    setDiagnostics(null);
    setNotice(`${selectedInTent.length} tray(s) staged back to unplaced.`);
  }

  async function applyPlantToTrayLayout(): Promise<boolean> {
    if (!ensureUnlocked({ locked: placementLocked, message: RUNNING_LOCK_MESSAGE, setError })) {
      return false;
    }

    const placementChanges = buildChangeset<string | null>(sortedPlantIds, persistedPlantToTray, draftPlantToTray, {
      fallback: null,
    })
      .map((change) => ({
        plantId: change.key,
        persistedTrayId: change.persistedValue,
        stagedTrayId: change.draftValue,
        plantCode: plantById.get(change.key)?.plant_id || change.key,
      }))
      .sort((left, right) => left.plantCode.localeCompare(right.plantCode));

    if (placementChanges.length === 0) {
      setNotice("No staged plant/tray changes to apply.");
      return true;
    }

    return runSavingAction({
      locked: placementLocked,
      lockMessage: RUNNING_LOCK_MESSAGE,
      fallbackError: "Unable to apply plant/tray layout changes.",
      action: async () => {
        const removals = placementChanges.filter((change) => change.persistedTrayId !== null);
        const additions = placementChanges.filter((change) => change.stagedTrayId !== null);

        for (const removal of removals) {
          const row = persistedTrayPlantRowByPlantId[removal.plantId];
          if (!row || !removal.persistedTrayId) {
            setError("Unable to resolve persisted tray placement. Refresh and try again.");
            return false;
          }

          try {
            await api.delete(`/api/v1/trays/${removal.persistedTrayId}/plants/${row.trayPlantId}`);
          } catch (requestError) {
            const parsed = parseApiErrorPayload<Diagnostics>(requestError, "Unable to apply plant/tray layout changes.");
            setError(parsed.detail);
            setDiagnostics(parsed.diagnostics);
            return false;
          }
        }

        for (const addition of additions) {
          if (!addition.stagedTrayId) {
            continue;
          }

          try {
            await api.post(`/api/v1/trays/${addition.stagedTrayId}/plants`, { plant_id: addition.plantId });
          } catch (requestError) {
            const parsed = parseApiErrorPayload<Diagnostics>(requestError, "Unable to apply plant/tray layout changes.");
            setError(parsed.detail);
            setDiagnostics(parsed.diagnostics);
            return false;
          }
        }

        setNotice(`Applied ${placementChanges.length} plant layout change(s).`);
        await reloadPlacementData();
        return true;
      },
    });
  }

  async function applyTrayToSlotLayout(): Promise<boolean> {
    if (!ensureUnlocked({ locked: placementLocked, message: RUNNING_LOCK_MESSAGE, setError })) {
      return false;
    }

    const slotChanges = buildChangeset<string | null>(sortedTrayIds, persistedTrayToSlot, draftTrayToSlot, {
      fallback: null,
    }).map((change) => ({
      trayId: change.key,
      persistedSlotId: change.persistedValue,
      draftSlotId: change.draftValue,
    }));

    if (slotChanges.length === 0) {
      setNotice("No staged tray/slot changes to apply.");
      return true;
    }

    return runSavingAction({
      locked: placementLocked,
      lockMessage: RUNNING_LOCK_MESSAGE,
      fallbackError: "Unable to apply tray/slot layout changes.",
      action: async () => {
        const clearSlotFirst = slotChanges.filter(
          (change) =>
            change.persistedSlotId !== null && (change.persistedSlotId || null) !== (change.draftSlotId || null),
        );

        for (const change of clearSlotFirst) {
          try {
            await api.patch(`/api/v1/trays/${change.trayId}/`, { slot_id: null });
          } catch (requestError) {
            const parsed = parseApiErrorPayload<Diagnostics>(requestError, "Unable to apply tray/slot layout changes.");
            setError(parsed.detail);
            setDiagnostics(parsed.diagnostics);
            return false;
          }
        }

        for (const change of slotChanges) {
          if (change.draftSlotId === null) {
            continue;
          }

          try {
            await api.patch(`/api/v1/trays/${change.trayId}/`, { slot_id: change.draftSlotId });
          } catch (requestError) {
            const parsed = parseApiErrorPayload<Diagnostics>(requestError, "Unable to apply tray/slot layout changes.");
            setError(parsed.detail);
            setDiagnostics(parsed.diagnostics);
            return false;
          }
        }

        setNotice(`Applied ${slotChanges.length} tray/slot layout change(s).`);
        await reloadPlacementData();
        return true;
      },
    });
  }

  const sameSpeciesDisabled = useMemo(() => {
    if (!activePlantAnchorId) {
      return true;
    }
    const anchorPlant = plantById.get(activePlantAnchorId);
    if (!anchorPlant) {
      return true;
    }
    return !mainGridPlantIds.some((plantId) => {
      const plant = plantById.get(plantId);
      return !!plant && plant.species_id === anchorPlant.species_id;
    });
  }, [activePlantAnchorId, mainGridPlantIds, plantById]);

  const setTentName = useCallback((tentId: string, name: string, defaults: { name: string; code: string }) => {
    setTentDraftById((current) => ({
      ...current,
      [tentId]: {
        ...(current[tentId] || defaults),
        name,
      },
    }));
  }, []);

  const setTentCode = useCallback((tentId: string, code: string, defaults: { name: string; code: string }) => {
    setTentDraftById((current) => ({
      ...current,
      [tentId]: {
        ...(current[tentId] || defaults),
        code,
      },
    }));
  }, []);

  const toggleTentAllowedSpecies = useCallback((tentId: string, speciesId: string) => {
    setTentAllowedSpeciesDraftById((current) => {
      const next = toggleSet(setWithAll(current[tentId] || []), speciesId);
      return { ...current, [tentId]: Array.from(next) };
    });
  }, []);

  const stepModels = useMemo(
    () => ({
      step1: {
        step1DraftChangeCount,
        tents,
        species,
        saving,
        locked: placementLocked,
        shelfCountsByTent,
        tentDraftById,
        tentAllowedSpeciesDraftById,
        tentDraftMetaById,
        dirtyTentIds,
      },
      step2: {
        step2DraftChangeCount,
        saving,
        locked: placementLocked,
        sortedTrayIds,
        trayById,
        trayCapacityDraftById,
        dirtyTrayCapacityIds,
        draftRemovedTrayIds,
        selectedTrayDraftKeys: step2SelectedTrayKeys,
        draftNewTrays,
        totalDraftTrayCount,
      },
      step3: {
        placementDraftChangeCount,
        saving,
        locked: placementLocked,
        diagnostics,
        destinationTrayId,
        sortedTrayIds,
        trayById,
        draftPlantCountByTray,
        mainGridPlantIds,
        selectedInMainGrid,
        selectedPlantIds,
        sameSpeciesDisabled,
        trayPlantIdsByTray,
        selectedInTrayByTrayId,
        dirtyPlantContainerTrayIds,
        plantById,
        persistedPlantToTray,
        draftPlantToTray,
      },
      step4: {
        traySlotDraftChangeCount,
        saving,
        locked: placementLocked,
        destinationSlotId,
        sortedSlots,
        draftSlotToTray,
        trayById,
        mainGridTrayIds,
        selectedTrayIds,
        tents,
        dirtySlotIds,
        selectedTraysByTentId,
        persistedTrayToSlot,
        draftTrayToSlot,
      },
    }),
    [
      destinationSlotId,
      destinationTrayId,
      draftNewTrays,
      diagnostics,
      dirtyPlantContainerTrayIds,
      dirtySlotIds,
      dirtyTrayCapacityIds,
      draftPlantCountByTray,
      draftPlantToTray,
      draftRemovedTrayIds,
      draftSlotToTray,
      draftTrayToSlot,
      mainGridPlantIds,
      mainGridTrayIds,
      persistedPlantToTray,
      persistedTrayToSlot,
      placementDraftChangeCount,
      placementLocked,
      sameSpeciesDisabled,
      saving,
      selectedInMainGrid,
      selectedInTrayByTrayId,
      selectedPlantIds,
      step2SelectedTrayKeys,
      selectedTraysByTentId,
      selectedTrayIds,
      shelfCountsByTent,
      sortedSlots,
      sortedTrayIds,
      species,
      step1DraftChangeCount,
      step2DraftChangeCount,
      tentAllowedSpeciesDraftById,
      tentDraftById,
      tentDraftMetaById,
      tents,
      totalDraftTrayCount,
      trayById,
      trayCapacityDraftById,
      trayPlantIdsByTray,
      traySlotDraftChangeCount,
      plantById,
      dirtyTentIds,
    ],
  );

  const uiState = useMemo(
    () => ({
      loading,
      saving,
      notInvited,
      offline,
      error,
      notice,
      diagnostics,
    }),
    [diagnostics, error, loading, notInvited, notice, offline, saving],
  );

  const actionRefs = useRef<{
    goToStep: (step: number) => void;
    goNextStep: () => Promise<void>;
    goPreviousStep: () => void;
    resetCurrentStepDrafts: () => void;
    createTent: () => Promise<void>;
    removeTent: () => Promise<void>;
    addShelf: (tentId: string) => void;
    removeShelf: (tentId: string) => void;
    adjustShelfSlotCount: (tentId: string, shelfIndex: number, delta: number) => void;
    setTentName: (tentId: string, name: string, defaults: { name: string; code: string }) => void;
    setTentCode: (tentId: string, code: string, defaults: { name: string; code: string }) => void;
    toggleTentAllowedSpecies: (tentId: string, speciesId: string) => void;
    addDraftTray: () => void;
    toggleStep2TraySelection: (trayKey: string) => void;
    removeSelectedDraftTrays: () => void;
    adjustTrayCapacity: (trayId: string, delta: number) => void;
    adjustPendingTrayCapacity: (draftTrayId: string, delta: number) => void;
    setDestinationTrayId: (value: SetStateAction<string>) => void;
    togglePlantSelection: (plantId: string) => void;
    selectAllPlantsInMainGrid: () => void;
    selectSameSpeciesInMainGrid: () => void;
    clearPlantSelection: () => void;
    stageMovePlantsToTray: () => void;
    stageRemovePlantsFromTray: (trayId: string) => void;
    setDestinationSlotId: (value: SetStateAction<string>) => void;
    toggleTraySelection: (trayId: string) => void;
    clearTraySelection: () => void;
    selectAllTraysInMainGrid: () => void;
    toggleDestinationSlot: (slotId: string) => void;
    stageMoveTraysToSlots: () => void;
    stageRemoveTraysFromTent: (tentId: string) => void;
  } | null>(null);

  // Keep wrapper callbacks stable while always calling latest action implementations.
  // `useLayoutEffect` ensures refs are refreshed before users can interact after a render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    actionRefs.current = {
      goToStep,
      goNextStep,
      goPreviousStep,
      resetCurrentStepDrafts,
      createTent,
      removeTent,
      addShelf,
      removeShelf,
      adjustShelfSlotCount,
      setTentName,
      setTentCode,
      toggleTentAllowedSpecies,
      addDraftTray,
      toggleStep2TraySelection,
      removeSelectedDraftTrays,
      adjustTrayCapacity,
      adjustPendingTrayCapacity,
      setDestinationTrayId,
      togglePlantSelection,
      selectAllPlantsInMainGrid,
      selectSameSpeciesInMainGrid,
      clearPlantSelection,
      stageMovePlantsToTray,
      stageRemovePlantsFromTray,
      setDestinationSlotId,
      toggleTraySelection,
      clearTraySelection,
      selectAllTraysInMainGrid,
      toggleDestinationSlot,
      stageMoveTraysToSlots,
      stageRemoveTraysFromTent,
    };
  });

  const wizardActions = useMemo(
    () => ({
      goToStep: (step: number) => actionRefs.current?.goToStep(step),
      goNextStep: async () => {
        await actionRefs.current?.goNextStep();
      },
      goPreviousStep: () => actionRefs.current?.goPreviousStep(),
      resetCurrentStepDrafts: () => actionRefs.current?.resetCurrentStepDrafts(),
    }),
    [],
  );

  const stepActions = useMemo(
    () => ({
      step1: {
        createTent: async () => {
          await actionRefs.current?.createTent();
        },
        removeTent: async () => {
          await actionRefs.current?.removeTent();
        },
        addShelf: (tentId: string) => actionRefs.current?.addShelf(tentId),
        removeShelf: (tentId: string) => actionRefs.current?.removeShelf(tentId),
        adjustShelfSlotCount: (tentId: string, shelfIndex: number, delta: number) =>
          actionRefs.current?.adjustShelfSlotCount(tentId, shelfIndex, delta),
        setTentName: (tentId: string, name: string, defaults: { name: string; code: string }) =>
          actionRefs.current?.setTentName(tentId, name, defaults),
        setTentCode: (tentId: string, code: string, defaults: { name: string; code: string }) =>
          actionRefs.current?.setTentCode(tentId, code, defaults),
        toggleTentAllowedSpecies: (tentId: string, speciesId: string) =>
          actionRefs.current?.toggleTentAllowedSpecies(tentId, speciesId),
      },
      step2: {
        addDraftTray: () => actionRefs.current?.addDraftTray(),
        toggleTraySelection: (trayKey: string) => actionRefs.current?.toggleStep2TraySelection(trayKey),
        removeSelectedTrays: () => actionRefs.current?.removeSelectedDraftTrays(),
        adjustTrayCapacity: (trayId: string, delta: number) => actionRefs.current?.adjustTrayCapacity(trayId, delta),
        adjustPendingTrayCapacity: (draftTrayId: string, delta: number) =>
          actionRefs.current?.adjustPendingTrayCapacity(draftTrayId, delta),
      },
      step3: {
        setDestinationTrayId: (value: SetStateAction<string>) => {
          const target = actionRefs.current;
          if (!target) {
            return;
          }
          target.setDestinationTrayId(value);
        },
        togglePlantSelection: (plantId: string) => actionRefs.current?.togglePlantSelection(plantId),
        selectAllPlantsInMainGrid: () => actionRefs.current?.selectAllPlantsInMainGrid(),
        selectSameSpeciesInMainGrid: () => actionRefs.current?.selectSameSpeciesInMainGrid(),
        clearPlantSelection: () => actionRefs.current?.clearPlantSelection(),
        stageMovePlantsToTray: () => actionRefs.current?.stageMovePlantsToTray(),
        stageRemovePlantsFromTray: (trayId: string) => actionRefs.current?.stageRemovePlantsFromTray(trayId),
      },
      step4: {
        setDestinationSlotId: (value: SetStateAction<string>) => {
          const target = actionRefs.current;
          if (!target) {
            return;
          }
          target.setDestinationSlotId(value);
        },
        toggleTraySelection: (trayId: string) => actionRefs.current?.toggleTraySelection(trayId),
        clearTraySelection: () => actionRefs.current?.clearTraySelection(),
        selectAllTraysInMainGrid: () => actionRefs.current?.selectAllTraysInMainGrid(),
        toggleDestinationSlot: (slotId: string) => actionRefs.current?.toggleDestinationSlot(slotId),
        stageMoveTraysToSlots: () => actionRefs.current?.stageMoveTraysToSlots(),
        stageRemoveTraysFromTent: (tentId: string) => actionRefs.current?.stageRemoveTraysFromTent(tentId),
      },
    }),
    [],
  );

  const wizardState = useMemo(
    () => ({
      currentStep,
      maxUnlockedStep,
      currentStepDraftChangeCount,
      blockerHint: currentStepBlockedMessage,
      nextLabel: nextPrimaryButtonLabel,
      stepCompletionState,
      goToStep: wizardActions.goToStep,
      goNextStep: wizardActions.goNextStep,
      goPreviousStep: wizardActions.goPreviousStep,
      resetCurrentStepDrafts: wizardActions.resetCurrentStepDrafts,
    }),
    [
      currentStep,
      currentStepBlockedMessage,
      currentStepDraftChangeCount,
      maxUnlockedStep,
      nextPrimaryButtonLabel,
      stepCompletionState,
      wizardActions.goNextStep,
      wizardActions.goPreviousStep,
      wizardActions.goToStep,
      wizardActions.resetCurrentStepDrafts,
    ],
  );

  const controllerState = useMemo(
    () => ({
      ui: uiState,
      wizard: wizardState,
      locked: placementLocked,
      stepModels,
      stepActions,
      summary,
      statusSummary,
      persistedTrayPlantRowByPlantId,
      experimentId,
    }),
    [
      experimentId,
      persistedTrayPlantRowByPlantId,
      placementLocked,
      statusSummary,
      stepActions,
      stepModels,
      summary,
      uiState,
      wizardState,
    ],
  );

  return controllerState;
}
