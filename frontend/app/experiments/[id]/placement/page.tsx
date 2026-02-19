"use client";

import {
  ArrowRight,
  CheckSquare,
  Layers,
  MoveRight,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { backendFetch, normalizeBackendError, unwrapList } from "@/lib/backend";
import {
  fetchExperimentStatusSummary,
  type ExperimentStatusSummary,
} from "@/lib/experiment-status";
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
  STEPS,
  RUNNING_LOCK_MESSAGE,
} from "@/src/features/placement/types";
import {
  areShelfCountsEqual,
  buildDefaultShelves,
  buildPlantDraftStats,
  buildPersistedShelfCounts,
  buildPersistedPlacementState,
  buildRemovedTrayIds,
  buildSortedSlots,
  buildStep1ShelfPreviewGroups,
  buildTrayCapacityDraftStats,
  buildTraySlotDraftStats,
  draftChangeCountForStep,
  draftChipLabelForStep,
  formatTrayDisplay,
  getTentDraftMeta,
  isStepComplete,
  isStepReadyForNext,
  isActivePlant,
  nextButtonLabel,
  normalizePlant,
  parseBackendErrorPayload,
  parseStep,
  stepBlockedMessage,
} from "@/src/features/placement/utils";
import { PlantSelectableCell, TraySelectableCell } from "@/src/features/placement/components/placement-cells";
import { TentSlotBoard } from "@/src/features/placement/components/tent-slot-board";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { CountAdjustToolbar } from "@/src/components/ui/count-adjust-toolbar";
import { DraftChangeChip } from "@/src/components/ui/draft-change-chip";
import { DraftChangeMarker } from "@/src/components/ui/draft-change-marker";
import { Input } from "@/src/components/ui/input";
import { NativeSelect } from "@/src/components/ui/native-select";
import { Notice } from "@/src/components/ui/notice";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";
import { StepNavBar } from "@/src/components/ui/step-nav-bar";
import { StepAdjustButton } from "@/src/components/ui/step-adjust-button";
import { TooltipIconButton } from "@/src/components/ui/tooltip-icon-button";

import { experimentsStyles as styles } from "@/src/components/ui/experiments-styles";

export default function PlacementPage() {
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

  const [currentStep, setCurrentStep] = useState<number>(parseStep(searchParams.get("step")));

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notInvited, setNotInvited] = useState(false);
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

  const [draftTrayCount, setDraftTrayCount] = useState(0);
  const [trayCapacityDraftById, setTrayCapacityDraftById] = useState<Record<string, number>>({});
  const [newTrayCapacities, setNewTrayCapacities] = useState<number[]>([]);

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

  const placementLocked = statusSummary?.lifecycle.state === "running";

  const tents = useMemo(() => summary?.tents.results || [], [summary?.tents.results]);
  const trays = useMemo(() => summary?.trays.results || [], [summary?.trays.results]);

  const tentNameSuggestion = useMemo(() => suggestTentName(tents.map((tent) => tent.name)), [tents]);
  const tentCodeSuggestion = useMemo(() => suggestTentCode(tents.map((tent) => tent.code)), [tents]);
  const defaultTrayCapacity = useMemo(() => trays[0]?.capacity ?? 4, [trays]);

  useEffect(() => {
    setCurrentStep(parseStep(searchParams.get("step")));
  }, [searchParams]);

  useEffect(() => {
    setDraftTrayCount(trays.length);
    setTrayCapacityDraftById(
      Object.fromEntries(trays.map((tray) => [tray.tray_id, Math.max(1, tray.capacity)])),
    );
  }, [trays]);

  useEffect(() => {
    setNewTrayCapacities((current) => {
      const required = Math.max(0, draftTrayCount - trays.length);
      const next = current.slice(0, required);
      while (next.length < required) {
        next.push(defaultTrayCapacity);
      }
      return next;
    });
  }, [defaultTrayCapacity, draftTrayCount, trays.length]);

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

  const loadPage = useCallback(async () => {
    const [summaryResponse, statusResponse, speciesResponse] = await Promise.all([
      backendFetch(`/api/v1/experiments/${experimentId}/placement/summary`),
      fetchExperimentStatusSummary(experimentId),
      backendFetch("/api/v1/species/"),
    ]);

    if (!summaryResponse.ok) {
      throw new Error("Unable to load placement summary.");
    }
    if (!statusResponse) {
      throw new Error("Unable to load status summary.");
    }
    if (!speciesResponse.ok) {
      throw new Error("Unable to load species.");
    }

    const summaryPayload = (await summaryResponse.json()) as PlacementSummary;
    const speciesPayload = (await speciesResponse.json()) as unknown;

    setSummary(summaryPayload);
    setStatusSummary(statusResponse);
    setSpecies(unwrapList<Species>(speciesPayload));
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

        const status = await fetchExperimentStatusSummary(experimentId);
        if (!status) {
          setError("Unable to load setup status.");
          return;
        }
        if (!status.setup.is_complete) {
          router.replace(`/experiments/${experimentId}/setup`);
          return;
        }

        await loadPage();
      } catch (requestError) {
        const normalized = normalizeBackendError(requestError);
        if (normalized.kind === "offline") {
          setOffline(true);
        }
        setError("Unable to load placement page.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [experimentId, loadPage, router]);

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
    setSelectedPlantIds(new Set());
    setSelectedTrayIds(new Set());
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

  const trayCountDraftChangeCount = Math.abs(draftTrayCount - trays.length);
  const trayCapacityDraftStats = useMemo(
    () => buildTrayCapacityDraftStats(trays, trayCapacityDraftById),
    [trayCapacityDraftById, trays],
  );
  const trayCapacityDraftChangeCount = trayCapacityDraftStats.changeCount;
  const dirtyTrayCapacityIds = trayCapacityDraftStats.dirtyTrayCapacityIds;

  const step2DraftChangeCount = trayCountDraftChangeCount + trayCapacityDraftChangeCount;

  const draftRemovedTrayIds = useMemo(
    () => buildRemovedTrayIds(sortedTrayIds, draftTrayCount),
    [draftTrayCount, sortedTrayIds],
  );
  const stepCompletionState = useMemo(
    () => ({
      step1Complete,
      step1ReadyForNext,
      step2Complete,
      step3Complete,
      step4Complete,
    }),
    [step1Complete, step1ReadyForNext, step2Complete, step3Complete, step4Complete],
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
      router.push(`/experiments/${experimentId}/overview`);
      return;
    }
    setCurrentStep((current) => Math.min(4, current + 1));
  }

  function goPreviousStep() {
    setCurrentStep((current) => Math.max(1, current - 1));
    setError("");
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
      setDraftTrayCount(trays.length);
      setTrayCapacityDraftById(
        Object.fromEntries(trays.map((tray) => [tray.tray_id, Math.max(1, tray.capacity)])),
      );
      setNewTrayCapacities([]);
      setNotice("Discarded step 2 draft changes.");
    } else if (currentStep === 3) {
      setDraftPlantToTray(persistedPlantToTray);
      setSelectedPlantIds(new Set());
      setActivePlantAnchorId(null);
      setDiagnostics(null);
      setNotice("Discarded step 3 draft changes.");
    } else {
      setDraftTrayToSlot(persistedTrayToSlot);
      setSelectedTrayIds(new Set());
      setDestinationSlotId("");
      setDiagnostics(null);
      setNotice("Discarded step 4 draft changes.");
    }
    setError("");
  }

  async function createTent() {
    if (placementLocked) {
      setError(RUNNING_LOCK_MESSAGE);
      return;
    }

    const name = tentNameSuggestion;
    const code = tentCodeSuggestion;

    if (!name) {
      setError("Tent name is required.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await backendFetch(`/api/v1/experiments/${experimentId}/tents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          code,
          allowed_species: [],
        }),
      });

      const payload = (await response.json()) as {
        detail?: string;
      };

      if (!response.ok) {
        setError(payload.detail || "Unable to create tent.");
        return;
      }

      setNotice("Tent created.");
      await loadPage();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to create tent.");
    } finally {
      setSaving(false);
    }
  }

  async function removeTent() {
    if (placementLocked) {
      setError(RUNNING_LOCK_MESSAGE);
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

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await backendFetch(`/api/v1/tents/${removableTent.tent_id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await parseBackendErrorPayload(response, "Unable to remove tent.");
        setError(payload.detail);
        return;
      }
      setNotice(`Removed ${removableTent.name}.`);
      await loadPage();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to remove tent.");
    } finally {
      setSaving(false);
    }
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
    if (placementLocked) {
      setError(RUNNING_LOCK_MESSAGE);
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

    setSaving(true);
    setError("");
    setNotice("");
    setDiagnostics(null);

    try {
      let detailAppliedCount = 0;
      let layoutAppliedCount = 0;

      for (const tent of changedTentDetails) {
        const tentDraftMeta = tentDraftMetaById.get(tent.tent_id);
        if (!tentDraftMeta) {
          continue;
        }

        const detailResponse = await backendFetch(`/api/v1/tents/${tent.tent_id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: tentDraftMeta.draftName,
            code: tentDraftMeta.draftCode,
            allowed_species: tentDraftMeta.draftAllowedSpeciesIds,
          }),
        });
        const detailPayload = (await detailResponse.json()) as { detail?: string };
        if (!detailResponse.ok) {
          setError(`${tent.name}: ${detailPayload.detail || "Unable to update tent details."}`);
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

        const response = await backendFetch(`/api/v1/tents/${tent.tent_id}/slots/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ layout }),
        });

        const payload = (await response.json()) as {
          detail?: string;
          diagnostics?: {
            would_orphan_trays?: Array<{ tray_code: string; slot_shelf_index: number; slot_index: number }>;
          };
        };

        if (!response.ok) {
          const orphanMessage = payload.diagnostics?.would_orphan_trays?.length
            ? ` Would orphan: ${payload.diagnostics.would_orphan_trays
                .map((item) => `${item.tray_code} @ S${item.slot_shelf_index}-${item.slot_index}`)
                .join(", ")}.`
            : "";
          setError(`${tent.name}: ${(payload.detail || "Unable to generate slots.") + orphanMessage}`);
          if (detailAppliedCount > 0 || layoutAppliedCount > 0) {
            await loadPage();
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
      await loadPage();
      return true;
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to apply tent slot layout changes.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function incrementDraftTrayCount() {
    setDraftTrayCount((current) => current + 1);
  }

  function decrementDraftTrayCount() {
    setDraftTrayCount((current) => Math.max(0, current - 1));
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

  function adjustPendingTrayCapacity(index: number, delta: number) {
    setNewTrayCapacities((current) => {
      if (index < 0 || index >= current.length) {
        return current;
      }
      const next = [...current];
      next[index] = Math.max(1, next[index] + delta);
      return next;
    });
  }

  async function applyTrayCountDraft(): Promise<boolean> {
    if (placementLocked) {
      setError(RUNNING_LOCK_MESSAGE);
      return false;
    }

    const targetCount = Math.max(0, draftTrayCount);
    const currentCount = trays.length;
    const delta = targetCount - currentCount;
    if (delta === 0 && trayCapacityDraftChangeCount === 0) {
      return true;
    }

    setSaving(true);
    setError("");
    setNotice("");
    setDiagnostics(null);

    try {
      let createdCount = 0;
      let deletedCount = 0;
      let capacityUpdatedCount = 0;
      let mutationCount = 0;

      if (delta > 0) {
        const existingNames = new Set(trays.map((tray) => tray.name));
        for (let index = 0; index < delta; index += 1) {
          const suggestedName = suggestTrayName(Array.from(existingNames));
          const draftCapacity = Math.max(1, newTrayCapacities[index] ?? defaultTrayCapacity);
          const response = await backendFetch(`/api/v1/experiments/${experimentId}/trays`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: suggestedName,
              capacity: draftCapacity,
            }),
          });

          const payload = (await response.json()) as { detail?: string; suggested_name?: string; name?: string };
          if (!response.ok) {
            if (mutationCount > 0) {
              await loadPage();
            }
            setError(payload.detail || "Unable to add trays.");
            return false;
          }

          existingNames.add(payload.name || payload.suggested_name || suggestedName);
          createdCount += 1;
          mutationCount += 1;
        }
      } else {
        const removeCount = Math.abs(delta);
        const traysToRemove = [...sortedTrayIds].slice(-removeCount);
        for (const trayId of traysToRemove) {
          const response = await backendFetch(`/api/v1/trays/${trayId}/`, {
            method: "DELETE",
          });
          if (!response.ok) {
            const parsed = await parseBackendErrorPayload(response, "Unable to remove trays.");
            setError(parsed.detail);
            setDiagnostics(parsed.diagnostics);
            if (mutationCount > 0) {
              await loadPage();
            }
            return false;
          }
          deletedCount += 1;
          mutationCount += 1;
        }
      }

      const removeCount = delta < 0 ? Math.abs(delta) : 0;
      const remainingTrayIds = removeCount > 0 ? [...sortedTrayIds].slice(0, sortedTrayIds.length - removeCount) : sortedTrayIds;

      for (const trayId of remainingTrayIds) {
        const tray = trayById.get(trayId);
        if (!tray) {
          continue;
        }
        const draftCapacity = Math.max(1, trayCapacityDraftById[trayId] ?? tray.capacity);
        if (draftCapacity === tray.capacity) {
          continue;
        }
        const response = await backendFetch(`/api/v1/trays/${trayId}/`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            capacity: draftCapacity,
          }),
        });
        if (!response.ok) {
          const parsed = await parseBackendErrorPayload(response, "Unable to update tray capacity.");
          setError(parsed.detail);
          setDiagnostics(parsed.diagnostics);
          if (mutationCount > 0) {
            await loadPage();
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
      if (deletedCount > 0) {
        messages.push(`Removed ${deletedCount} tray(s).`);
      }
      if (capacityUpdatedCount > 0) {
        messages.push(`Updated ${capacityUpdatedCount} tray capacity setting(s).`);
      }
      setNotice(messages.join(" "));
      await loadPage();
      return true;
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to apply tray count changes.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function togglePlantSelection(plantId: string) {
    if (!plantById.has(plantId)) {
      return;
    }

    setSelectedPlantIds((current) => {
      const next = new Set(current);
      if (next.has(plantId)) {
        next.delete(plantId);
      } else {
        next.add(plantId);
      }
      return next;
    });
    setActivePlantAnchorId(plantId);
  }

  function selectAllPlantsInMainGrid() {
    setSelectedPlantIds((current) => {
      const next = new Set(current);
      for (const plantId of mainGridPlantIds) {
        next.add(plantId);
      }
      return next;
    });
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

    const mainGridSet = new Set(mainGridPlantIds);
    const matching = mainGridPlantIds.filter((plantId) => {
      const plant = plantById.get(plantId);
      return !!plant && plant.species_id === anchor.species_id;
    });

    setSelectedPlantIds((current) => {
      const next = new Set<string>();
      for (const plantId of current) {
        if (!mainGridSet.has(plantId)) {
          next.add(plantId);
        }
      }
      for (const plantId of matching) {
        next.add(plantId);
      }
      return next;
    });
  }

  function clearPlantSelection() {
    setSelectedPlantIds(new Set());
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
    if (placementLocked) {
      setError(RUNNING_LOCK_MESSAGE);
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
      const next = new Set(current);
      for (const plantId of selectedInMainGrid) {
        next.delete(plantId);
      }
      return next;
    });

    setDiagnostics(null);
    setError("");
    setNotice(
      `${selectedInMainGrid.length} plant(s) staged for ${formatTrayDisplay(destinationTray.name, destinationTray.tray_id)}.`,
    );
  }

  function stageRemovePlantsFromTray(trayId: string) {
    if (placementLocked) {
      setError(RUNNING_LOCK_MESSAGE);
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
      const next = new Set(current);
      for (const plantId of selectedInTray) {
        next.delete(plantId);
      }
      return next;
    });

    setDiagnostics(null);
    setError("");
    setNotice(`${selectedInTray.length} plant(s) staged back to unplaced.`);
  }

  function toggleTraySelection(trayId: string) {
    if (!trayById.has(trayId)) {
      return;
    }

    setSelectedTrayIds((current) => {
      const next = new Set(current);
      if (next.has(trayId)) {
        next.delete(trayId);
      } else {
        next.add(trayId);
      }
      return next;
    });
  }

  function clearTraySelection() {
    setSelectedTrayIds(new Set());
  }

  function selectAllTraysInMainGrid() {
    setSelectedTrayIds((current) => {
      const next = new Set(current);
      for (const trayId of mainGridTrayIds) {
        next.add(trayId);
      }
      return next;
    });
  }

  function toggleDestinationSlot(slotId: string) {
    if (!slotById.has(slotId)) {
      return;
    }
    setDestinationSlotId((current) => (current === slotId ? "" : slotId));
  }

  function stageMoveTraysToSlots() {
    if (placementLocked) {
      setError(RUNNING_LOCK_MESSAGE);
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

    const selectedSet = new Set(selected);
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

    setSelectedTrayIds(new Set());
    setDiagnostics(null);
    setError("");
    setNotice(`${selected.length} tray(s) staged into slots.`);
  }

  function stageRemoveTraysFromTent(tentId: string) {
    if (placementLocked) {
      setError(RUNNING_LOCK_MESSAGE);
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
      const next = new Set(current);
      for (const trayId of selectedInTent) {
        next.delete(trayId);
      }
      return next;
    });

    setError("");
    setDiagnostics(null);
    setNotice(`${selectedInTent.length} tray(s) staged back to unplaced.`);
  }

  function renderPlantCell(plantId: string) {
    const plant = plantById.get(plantId);
    if (!plant) {
      return null;
    }
    return (
      <PlantSelectableCell
        key={plant.uuid}
        plant={plant}
        selected={selectedPlantIds.has(plantId)}
        dirty={(persistedPlantToTray[plantId] ?? null) !== (draftPlantToTray[plantId] ?? persistedPlantToTray[plantId] ?? null)}
        onToggle={togglePlantSelection}
      />
    );
  }

  function renderTrayCell(trayId: string, inSlot?: boolean) {
    const tray = trayById.get(trayId);
    if (!tray) {
      return null;
    }

    return (
      <TraySelectableCell
        key={trayId}
        tray={tray}
        inSlot={inSlot}
        selected={selectedTrayIds.has(trayId)}
        dirty={(persistedTrayToSlot[trayId] ?? null) !== (draftTrayToSlot[trayId] ?? persistedTrayToSlot[trayId] ?? null)}
        onToggle={toggleTraySelection}
      />
    );
  }

  async function applyPlantToTrayLayout(): Promise<boolean> {
    if (placementLocked) {
      setError(RUNNING_LOCK_MESSAGE);
      return false;
    }

    const placementChanges = sortedPlantIds
      .map((plantId) => {
        const persistedTrayId = persistedPlantToTray[plantId] ?? null;
        const stagedTrayId = draftPlantToTray[plantId] ?? persistedTrayId;
        if ((persistedTrayId || null) === (stagedTrayId || null)) {
          return null;
        }
        return {
          plantId,
          persistedTrayId,
          stagedTrayId,
          plantCode: plantById.get(plantId)?.plant_id || plantId,
        };
      })
      .filter(
        (item): item is { plantId: string; persistedTrayId: string | null; stagedTrayId: string | null; plantCode: string } =>
          item !== null,
      )
      .sort((left, right) => left.plantCode.localeCompare(right.plantCode));

    if (placementChanges.length === 0) {
      setNotice("No staged plant/tray changes to apply.");
      return true;
    }

    setSaving(true);
    setError("");
    setNotice("");
    setDiagnostics(null);

    try {
      const removals = placementChanges.filter((change) => change.persistedTrayId !== null);
      const additions = placementChanges.filter((change) => change.stagedTrayId !== null);

      for (const removal of removals) {
        const row = persistedTrayPlantRowByPlantId[removal.plantId];
        if (!row || !removal.persistedTrayId) {
          setError("Unable to resolve persisted tray placement. Refresh and try again.");
          return false;
        }

        const response = await backendFetch(`/api/v1/trays/${removal.persistedTrayId}/plants/${row.trayPlantId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const parsed = await parseBackendErrorPayload(response, "Unable to apply plant/tray layout changes.");
          setError(parsed.detail);
          setDiagnostics(parsed.diagnostics);
          return false;
        }
      }

      for (const addition of additions) {
        if (!addition.stagedTrayId) {
          continue;
        }

        const response = await backendFetch(`/api/v1/trays/${addition.stagedTrayId}/plants`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plant_id: addition.plantId }),
        });

        if (!response.ok) {
          const parsed = await parseBackendErrorPayload(response, "Unable to apply plant/tray layout changes.");
          setError(parsed.detail);
          setDiagnostics(parsed.diagnostics);
          return false;
        }
      }

      setNotice(`Applied ${placementChanges.length} plant layout change(s).`);
      await loadPage();
      return true;
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to apply plant/tray layout changes.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function applyTrayToSlotLayout(): Promise<boolean> {
    if (placementLocked) {
      setError(RUNNING_LOCK_MESSAGE);
      return false;
    }

    const slotChanges = sortedTrayIds
      .map((trayId) => {
        const persistedSlotId = persistedTrayToSlot[trayId] ?? null;
        const draftSlotId = draftTrayToSlot[trayId] ?? persistedSlotId;
        if ((persistedSlotId || null) === (draftSlotId || null)) {
          return null;
        }
        return {
          trayId,
          persistedSlotId,
          draftSlotId,
        };
      })
      .filter(
        (item): item is { trayId: string; persistedSlotId: string | null; draftSlotId: string | null } =>
          item !== null,
      );

    if (slotChanges.length === 0) {
      setNotice("No staged tray/slot changes to apply.");
      return true;
    }

    setSaving(true);
    setError("");
    setNotice("");
    setDiagnostics(null);

    try {
      const clearSlotFirst = slotChanges.filter(
        (change) => change.persistedSlotId !== null && (change.persistedSlotId || null) !== (change.draftSlotId || null),
      );

      for (const change of clearSlotFirst) {
        const response = await backendFetch(`/api/v1/trays/${change.trayId}/`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slot_id: null }),
        });

        if (!response.ok) {
          const parsed = await parseBackendErrorPayload(response, "Unable to apply tray/slot layout changes.");
          setError(parsed.detail);
          setDiagnostics(parsed.diagnostics);
          return false;
        }
      }

      for (const change of slotChanges) {
        if (change.draftSlotId === null) {
          continue;
        }

        const response = await backendFetch(`/api/v1/trays/${change.trayId}/`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slot_id: change.draftSlotId }),
        });

        if (!response.ok) {
          const parsed = await parseBackendErrorPayload(response, "Unable to apply tray/slot layout changes.");
          setError(parsed.detail);
          setDiagnostics(parsed.diagnostics);
          return false;
        }
      }

      setNotice(`Applied ${slotChanges.length} tray/slot layout change(s).`);
      await loadPage();
      return true;
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to apply tray/slot layout changes.");
      return false;
    } finally {
      setSaving(false);
    }
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

  if (notInvited) {
    return (
      <PageShell title="Placement">
        <SectionCard>
          <IllustrationPlaceholder inventoryId="ILL-001" kind="notInvited" />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Placement"
      subtitle="Step through tent/slot setup, tray setup, then staged placement applies."
      actions={
        <Button asChild>
          <Link href={`/experiments/${experimentId}/overview`}>← Overview</Link>
        </Button>
      }
    >
      {loading ? <p className="text-sm text-muted-foreground">Loading placement...</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <Notice variant="success">{notice}</Notice> : null}
      {offline ? <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" /> : null}

      {placementLocked ? (
        <SectionCard title="Placement Locked">
          <p className={"text-sm text-muted-foreground"}>{RUNNING_LOCK_MESSAGE}</p>
        </SectionCard>
      ) : null}

      <SectionCard title="Placement Workflow">
        <div className={styles.stepperRow}>
          {STEPS.map((step) => {
            const complete = isStepComplete(step.id, stepCompletionState);
            const active = step.id === currentStep;
            const disabled = step.id > maxUnlockedStep;
            return (
              <button
                key={step.id}
                type="button"
                className={[
                  styles.stepperItem,
                  active ? styles.stepperItemActive : "",
                  complete ? styles.stepperItemDone : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={disabled}
                onClick={() => goToStep(step.id)}
              >
                <span className={styles.stepperIndex}>{step.id}</span>
                <span>{step.title}</span>
              </button>
            );
          })}
        </div>

        <div key={currentStep} className={styles.stepPanel}>
          {currentStep === 1 ? (
            <div className={"grid gap-3"}>
              <SectionCard
                title="Tent Manager"
                actions={
                  step1DraftChangeCount > 0 ? (
                    <DraftChangeChip label={draftChipLabelForStep(1, step1DraftChangeCount)} />
                  ) : null
                }
              >
                <CountAdjustToolbar
                  count={tents.length}
                  countLabel="Total tents"
                  helperText="Shelves and slots are configured per tent below."
                  onDecrement={() => void removeTent()}
                  onIncrement={() => void createTent()}
                  decrementDisabled={saving || placementLocked || tents.length === 0}
                  incrementDisabled={saving || placementLocked}
                />
              </SectionCard>

              {tents.map((tent) => {
                const tentDraftMeta =
                  tentDraftMetaById.get(tent.tent_id) ||
                  getTentDraftMeta(
                    tent,
                    shelfCountsByTent,
                    tentAllowedSpeciesDraftById,
                    tentDraftById,
                  );
                const shelfCounts = tentDraftMeta.draftShelfCounts;
                const selectedSpecies = new Set(tentDraftMeta.draftAllowedSpeciesIds);
                const tentDraft = tentDraftById[tent.tent_id] || { name: tent.name, code: tent.code };
                const previewShelfSlotGroups = buildStep1ShelfPreviewGroups(
                  tent,
                  shelfCounts,
                );
                const persistedShelfCounts = tentDraftMeta.persistedShelfCounts;
                const shelvesRemoved = tentDraftMeta.shelvesRemoved;
                const tentNameDirty = tentDraftMeta.tentNameDirty;
                const tentCodeDirty = tentDraftMeta.tentCodeDirty;
                const restrictionsDirty = tentDraftMeta.restrictionsDirty;

                return (
                  <SectionCard
                    key={tent.tent_id}
                    title={`${tent.name}${tent.code ? ` (${tent.code})` : ""}`}
                    className={shelvesRemoved ? styles.draftChangedSurface : ""}
                    actions={dirtyTentIds.has(tent.tent_id) ? <DraftChangeChip label="Draft changes" /> : null}
                  >
                    {shelvesRemoved ? <DraftChangeMarker /> : null}
                    <div className={"grid gap-3"}>
                      <div className={styles.trayControlRow}>
                        <label
                          className={[
                            "grid gap-1 sm:w-auto sm:min-w-[11rem] sm:flex-1",
                            tentNameDirty ? `${styles.draftChangedSurface} relative rounded-md p-1` : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {tentNameDirty ? <DraftChangeMarker /> : null}
                          <span className="text-xs text-muted-foreground">Tent Name</span>
                          <Input
                            value={tentDraft.name}
                            onChange={(event) =>
                              setTentDraftById((current) => ({
                                ...current,
                                [tent.tent_id]: {
                                  ...(current[tent.tent_id] || { name: tent.name, code: tent.code }),
                                  name: event.target.value,
                                },
                              }))
                            }
                            aria-label="Tent name"
                          />
                        </label>
                        <label
                          className={[
                            "grid gap-1 sm:w-auto sm:min-w-[11rem] sm:flex-1",
                            tentCodeDirty ? `${styles.draftChangedSurface} relative rounded-md p-1` : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {tentCodeDirty ? <DraftChangeMarker /> : null}
                          <span className="text-xs text-muted-foreground">Tent ID</span>
                          <Input
                            value={tentDraft.code}
                            onChange={(event) =>
                              setTentDraftById((current) => ({
                                ...current,
                                [tent.tent_id]: {
                                  ...(current[tent.tent_id] || { name: tent.name, code: tent.code }),
                                  code: event.target.value,
                                },
                              }))
                            }
                            aria-label="Tent code"
                          />
                        </label>
                      </div>

                      <div className={"grid gap-2"}>
                        <details
                          className={[
                            "rounded-lg border border-border",
                            styles.cellSurfaceLevel1,
                            restrictionsDirty ? `${styles.draftChangedSurface} relative` : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {restrictionsDirty ? <DraftChangeMarker /> : null}
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm text-foreground">
                            <span>Allowed species restrictions</span>
                            <span className={styles.recipeLegendItem}>
                              {selectedSpecies.size === 0 ? "All species" : `${selectedSpecies.size} selected`}
                            </span>
                          </summary>
                          <div className={"grid gap-2 border-t border-border p-2"}>
                            {species.map((item) => {
                              const checked = selectedSpecies.has(item.id);
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  className={[
                                    "flex min-h-10 w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm",
                                    checked
                                      ? "border-ring bg-[color:var(--gt-cell-selected)] text-foreground"
                                      : "border-border bg-[color:var(--gt-cell-surface-1)] text-foreground",
                                  ].join(" ")}
                                  onClick={() => {
                                    const next = new Set(selectedSpecies);
                                    if (checked) {
                                      next.delete(item.id);
                                    } else {
                                      next.add(item.id);
                                    }
                                    setTentAllowedSpeciesDraftById((current) => ({
                                      ...current,
                                      [tent.tent_id]: Array.from(next),
                                    }));
                                  }}
                                  aria-pressed={checked}
                                >
                                  <span>{item.name}</span>
                                  <span className={styles.recipeLegendItem}>{checked ? "Selected" : "Tap to add"}</span>
                                </button>
                              );
                            })}
                          </div>
                        </details>
                      </div>

                      <div className={"grid gap-2"}>
                        <span className={"text-sm text-muted-foreground"}>Shelves layout</span>
                        <CountAdjustToolbar
                          count={shelfCounts.length}
                          countLabel="Total shelves"
                          onDecrement={() => removeShelf(tent.tent_id)}
                          onIncrement={() => addShelf(tent.tent_id)}
                          decrementDisabled={saving || placementLocked || shelfCounts.length <= 1}
                          incrementDisabled={saving || placementLocked}
                        />
                      </div>

                      <div className={"grid gap-2"}>
                        <span className={"text-sm text-muted-foreground"}>Current slots</span>
                        <div className={styles.step1ShelfPreviewLane}>
                          {previewShelfSlotGroups.map((group) => {
                            const persistedCount = persistedShelfCounts[group.shelfIndex - 1] || 0;
                            const shelfDirty = group.isNewShelf || group.removedSlotsInShelf;
                            return (
                              <article
                                key={`${tent.tent_id}-shelf-${group.shelfIndex}`}
                                className={[
                                  styles.trayEditorCell,
                                  styles.step1ShelfPreviewCard,
                                  styles.cellSurfaceLevel2,
                                  shelfDirty ? styles.draftChangedSurface : "",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                              >
                                {shelfDirty ? <DraftChangeMarker /> : null}
                              <div className={styles.trayHeaderRow}>
                                <div className={styles.trayHeaderMeta}>
                                  <strong>{`Shelf ${group.shelfIndex}`}</strong>
                                </div>
                                <div className={styles.trayHeaderActions}>
                                  <span className={styles.recipeLegendItem}>
                                    {group.slots.length} {group.slots.length === 1 ? "slot" : "slots"}
                                  </span>
                                  <StepAdjustButton
                                    direction="decrement"
                                    onClick={() => adjustShelfSlotCount(tent.tent_id, group.shelfIndex - 1, -1)}
                                    disabled={(shelfCounts[group.shelfIndex - 1] || 0) <= 0}
                                  />
                                  <StepAdjustButton
                                    direction="increment"
                                    onClick={() => adjustShelfSlotCount(tent.tent_id, group.shelfIndex - 1, 1)}
                                  />
                                </div>
                              </div>

                              <div className={styles.step1ShelfPreviewSlotGrid}>
                                {group.slots.map((slot) => {
                                  const isAddedSlot =
                                    !group.isNewShelf &&
                                    slot.isDraft &&
                                    slot.slot_index > persistedCount;
                                  return (
                                  <article
                                    key={slot.slot_id}
                                    className={[
                                      styles.trayGridCell,
                                      styles.cellFrame,
                                      styles.cellSurfaceLevel1,
                                      "justify-items-center text-center",
                                      isAddedSlot ? styles.draftChangedSurface : "",
                                      slot.isDraft ? "[grid-template-rows:auto_1fr]" : "",
                                    ]
                                      .filter(Boolean)
                                      .join(" ")}
                                  >
                                    {isAddedSlot ? <DraftChangeMarker /> : null}
                                    <strong className={styles.trayGridCellId}>{`Slot ${slot.slot_index}`}</strong>
                                    {!slot.isDraft && slot.code !== `Slot ${slot.slot_index}` ? (
                                      <span className="text-sm text-muted-foreground">{slot.code}</span>
                                    ) : null}
                                    {slot.isDraft ? (
                                      <span className={[styles.slotPlacedChip, "self-end"].join(" ")}>New</span>
                                    ) : null}
                                  </article>
                                  );
                                })}
                                {group.slots.length === 0 ? <span className="text-sm text-muted-foreground">No slots.</span> : null}
                              </div>
                              </article>
                            );
                          })}
                          {previewShelfSlotGroups.length === 0 ? <span className="text-sm text-muted-foreground">No shelves configured yet.</span> : null}
                        </div>
                      </div>

                    </div>
                  </SectionCard>
                );
              })}
            </div>
          ) : null}

          {currentStep === 2 ? (
            <div className={"grid gap-3"}>
              <SectionCard
                title="Tray Manager"
                actions={
                  step2DraftChangeCount > 0 ? (
                    <DraftChangeChip label={draftChipLabelForStep(2, step2DraftChangeCount)} />
                  ) : null
                }
              >
                <CountAdjustToolbar
                  count={draftTrayCount}
                  countLabel="Total trays"
                  onDecrement={decrementDraftTrayCount}
                  onIncrement={incrementDraftTrayCount}
                  decrementDisabled={saving || placementLocked || draftTrayCount === 0}
                  incrementDisabled={saving || placementLocked}
                />

                <div className={[styles.trayManagerGrid, styles.cellGridResponsive].join(" ")} data-cell-size="lg">
                  {sortedTrayIds.map((trayId) => {
                    const tray = trayById.get(trayId);
                    if (!tray) {
                      return null;
                    }
                    const draftCapacity = Math.max(1, trayCapacityDraftById[trayId] ?? tray.capacity);
                    const trayMarkedForRemoval = draftRemovedTrayIds.has(trayId);
                    return (
                      <article
                        key={trayId}
                        className={[
                          styles.trayEditorCell,
                          "rounded-lg border border-border",
                          styles.cellSurfaceLevel1,
                          "justify-items-center text-center",
                          dirtyTrayCapacityIds.has(trayId) || trayMarkedForRemoval ? styles.draftChangedSurface : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {dirtyTrayCapacityIds.has(trayId) || trayMarkedForRemoval ? <DraftChangeMarker /> : null}
                        <strong className={styles.trayGridCellId}>
                          {formatTrayDisplay(tray.name, tray.tray_id)}
                        </strong>
                        <div className={styles.trayEditorBadgeRow}>
                          <Badge variant="secondary" className={styles.recipeLegendItemCompact}>
                            {draftCapacity} {draftCapacity === 1 ? "plant" : "plants"}
                          </Badge>
                          {trayMarkedForRemoval ? (
                            <Badge variant="destructive" className={styles.recipeLegendItemCompact}>
                              Pending removal
                            </Badge>
                          ) : null}
                        </div>
                        <div className={styles.trayEditorAdjustRow}>
                          <StepAdjustButton
                            direction="decrement"
                            onClick={() => adjustTrayCapacity(trayId, -1)}
                            disabled={saving || placementLocked || draftCapacity <= 1}
                          />
                          <StepAdjustButton
                            direction="increment"
                            onClick={() => adjustTrayCapacity(trayId, 1)}
                            disabled={saving || placementLocked}
                          />
                        </div>
                      </article>
                    );
                  })}
                  {draftTrayCount > sortedTrayIds.length
                    ? Array.from({ length: draftTrayCount - sortedTrayIds.length }, (_, index) => {
                        const draftCapacity = Math.max(1, newTrayCapacities[index] ?? defaultTrayCapacity);
                        return (
                        <article
                          key={`draft-tray-${index + 1}`}
                          className={[
                            styles.trayEditorCell,
                            "rounded-lg border border-dashed border-border",
                            styles.cellSurfaceLevel2,
                            "justify-items-center text-center",
                            styles.draftChangedSurface,
                          ].join(" ")}
                        >
                          <DraftChangeMarker />
                          <strong className={styles.trayGridCellId}>New tray</strong>
                          <div className={styles.trayEditorBadgeRow}>
                            <Badge variant="secondary" className={styles.recipeLegendItemCompact}>
                              {draftCapacity} {draftCapacity === 1 ? "plant" : "plants"}
                            </Badge>
                          </div>
                          <div className={styles.trayEditorAdjustRow}>
                            <StepAdjustButton
                              direction="decrement"
                              onClick={() => adjustPendingTrayCapacity(index, -1)}
                              disabled={saving || placementLocked || draftCapacity <= 1}
                            />
                            <StepAdjustButton
                              direction="increment"
                              onClick={() => adjustPendingTrayCapacity(index, 1)}
                              disabled={saving || placementLocked}
                            />
                          </div>
                        </article>
                        );
                      })
                    : null}
                  {draftTrayCount === 0 ? <p className="text-sm text-muted-foreground">No trays configured.</p> : null}
                </div>
              </SectionCard>
            </div>
          ) : null}

          {currentStep === 3 ? (
            <div className={"grid gap-3"}>
              <SectionCard
                title="Plants -> Trays (Draft)"
                actions={
                  placementDraftChangeCount > 0 ? (
                    <DraftChangeChip label={draftChipLabelForStep(3, placementDraftChangeCount)} />
                  ) : null
                }
              >
                <div className={styles.placementToolbar}>
                  <NativeSelect
                    className={styles.toolbarInlineSelect}
                    value={destinationTrayId}
                    onChange={(event) => setDestinationTrayId(event.target.value)}
                    aria-label="Destination tray"
                  >
                    <option value="">Select destination tray</option>
                    {sortedTrayIds.map((trayId) => {
                      const tray = trayById.get(trayId);
                      if (!tray) {
                        return null;
                      }
                      return (
                        <option key={trayId} value={trayId}>
                          {formatTrayDisplay(tray.name, tray.tray_id)} ({draftPlantCountByTray[trayId] || 0}/{tray.capacity})
                        </option>
                      );
                    })}
                  </NativeSelect>
                  <div className={[styles.toolbarActionsCompact, "flex flex-wrap items-center gap-2"].join(" ")}>
                    <TooltipIconButton
                      label="Select all unplaced plants"
                      icon={<CheckSquare size={16} />}
                      onClick={selectAllPlantsInMainGrid}
                      disabled={mainGridPlantIds.length === 0}
                    />
                    <TooltipIconButton
                      label="Select same species"
                      icon={<Layers size={16} />}
                      onClick={selectSameSpeciesInMainGrid}
                      disabled={sameSpeciesDisabled}
                    />
                    <TooltipIconButton
                      label="Clear plant selection"
                      icon={<X size={16} />}
                      onClick={clearPlantSelection}
                      disabled={selectedPlantIds.size === 0}
                    />
                    <Button
                     
                      type="button"
                      disabled={placementLocked || !destinationTrayId || selectedInMainGrid.length === 0}
                      onClick={stageMovePlantsToTray}
                    >
                      <MoveRight size={16} />
                      Move selected
                    </Button>
                  </div>
                </div>

                <div className={[styles.toolbarSummaryRow, "flex flex-wrap items-center gap-2"].join(" ")}>
                  <span className="text-sm text-muted-foreground">Unplaced active plants: {mainGridPlantIds.length}</span>
                  <span className="text-sm text-muted-foreground">Selected in main grid: {selectedInMainGrid.length}</span>
                  {trays.length === 0 ? <Badge variant="secondary">Create at least one tray.</Badge> : null}
                </div>

                {diagnostics?.reason_counts ? (
                  <div className={"grid gap-2"}>
                    <span>Move diagnostics</span>
                    <strong>{Object.entries(diagnostics.reason_counts).map(([key, value]) => `${key}: ${value}`).join(" · ")}</strong>
                    {diagnostics.unplaceable_plants?.slice(0, 8).map((plant) => (
                      <span key={`${plant.plant_id}-${plant.reason}`}>{`${plant.plant_id || "(pending)"} · ${plant.species_name} · ${plant.reason}`}</span>
                    ))}
                  </div>
                ) : null}

                <div className={[styles.plantCellGrid, styles.cellGridResponsive].join(" ")} data-cell-size="sm">
                  {mainGridPlantIds.map((plantId) => renderPlantCell(plantId))}
                </div>
              </SectionCard>

              <SectionCard title="Tray Containers">
                <div className={[styles.trayManagerGrid, styles.cellGridResponsive].join(" ")} data-cell-size="lg">
                  {sortedTrayIds.map((trayId) => {
                    const tray = trayById.get(trayId);
                    if (!tray) {
                      return null;
                    }
                    const trayPlantIds = trayPlantIdsByTray[trayId] || [];
                    const selectedInTray = selectedInTrayByTrayId[trayId] || [];

                    return (
                      <article
                        key={trayId}
                        className={[
                          styles.trayEditorCell,
                          "rounded-lg border border-border",
                          styles.cellSurfaceLevel2,
                          dirtyPlantContainerTrayIds.has(trayId) ? styles.draftChangedSurface : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {dirtyPlantContainerTrayIds.has(trayId) ? (
                          <DraftChangeMarker />
                        ) : null}
                        <div className={styles.trayHeaderRow}>
                          <div className={styles.trayHeaderMeta}>
                            <strong>{formatTrayDisplay(tray.name, tray.tray_id)}</strong>
                            <span className={styles.recipeLegendItemCompact}>
                              {(draftPlantCountByTray[trayId] || 0)}/{tray.capacity}
                            </span>
                          </div>
                          <div className={styles.trayHeaderActions}>
                            {selectedInTray.length > 0 ? (
                              <TooltipIconButton
                                label="Return selected plants to unplaced"
                                icon={<Trash2 size={16} />}
                                onClick={() => stageRemovePlantsFromTray(trayId)}
                                variant="destructive"
                              />
                            ) : null}
                          </div>
                        </div>

                        <div className={[styles.plantCellGridTray, styles.cellGridResponsive].join(" ")} data-cell-size="sm">
                          {trayPlantIds.map((plantId) => renderPlantCell(plantId))}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </SectionCard>
            </div>
          ) : null}

          {currentStep === 4 ? (
            <div className={"grid gap-3"}>
              <SectionCard
                title="Trays -> Slots (Draft)"
                actions={
                  traySlotDraftChangeCount > 0 ? (
                    <DraftChangeChip label={draftChipLabelForStep(4, traySlotDraftChangeCount)} />
                  ) : null
                }
              >
                <div className={styles.placementToolbar}>
                  <NativeSelect
                    className={styles.toolbarInlineSelect}
                    value={destinationSlotId}
                    onChange={(event) => setDestinationSlotId(event.target.value)}
                    aria-label="Destination slot"
                  >
                    <option value="">Select destination slot</option>
                    {sortedSlots.map((slot) => {
                      const occupant = draftSlotToTray.get(slot.slot_id) || null;
                      const occupantName = occupant
                        ? formatTrayDisplay(trayById.get(occupant)?.name, occupant)
                        : "Empty";
                      return (
                        <option key={slot.slot_id} value={slot.slot_id}>
                          {slot.label} ({occupantName})
                        </option>
                      );
                    })}
                  </NativeSelect>
                  <div className={[styles.toolbarActionsCompact, "flex flex-wrap items-center gap-2"].join(" ")}>
                    <TooltipIconButton
                      label="Select all unplaced trays"
                      icon={<CheckSquare size={16} />}
                      onClick={selectAllTraysInMainGrid}
                      disabled={mainGridTrayIds.length === 0}
                    />
                    <TooltipIconButton
                      label="Clear tray selection"
                      icon={<X size={16} />}
                      onClick={clearTraySelection}
                      disabled={selectedTrayIds.size === 0}
                    />
                    <Button
                     
                      type="button"
                      disabled={placementLocked || !destinationSlotId || selectedTrayIds.size === 0}
                      onClick={stageMoveTraysToSlots}
                    >
                      <ArrowRight size={16} />
                      Move selected
                    </Button>
                  </div>
                </div>

                <div className={[styles.toolbarSummaryRow, "flex flex-wrap items-center gap-2"].join(" ")}>
                  <span className="text-sm text-muted-foreground">Unplaced trays: {mainGridTrayIds.length}</span>
                  <span className="text-sm text-muted-foreground">Selected trays: {selectedTrayIds.size}</span>
                </div>

                <div className={[styles.trayMainGrid, styles.cellGridResponsive].join(" ")} data-cell-size="md">
                  {mainGridTrayIds.map((trayId) => renderTrayCell(trayId))}
                </div>
              </SectionCard>

              <TentSlotBoard
                tents={tents}
                draftSlotToTray={draftSlotToTray}
                destinationSlotId={destinationSlotId}
                dirtySlotIds={dirtySlotIds}
                selectedTraysByTentId={selectedTraysByTentId}
                onReturnSelectedFromTent={stageRemoveTraysFromTent}
                onToggleDestinationSlot={toggleDestinationSlot}
                renderTrayCell={renderTrayCell}
              />
            </div>
          ) : null}
        </div>

        <StepNavBar
          className="mt-3"
          showBack={currentStep > 1}
          onBack={goPreviousStep}
          showReset={currentStepDraftChangeCount > 0}
          onReset={resetCurrentStepDrafts}
          resetDisabled={saving}
          onNext={() => void goNextStep()}
          nextDisabled={saving || !isStepReadyForNext(currentStep, stepCompletionState)}
          nextLabel={nextPrimaryButtonLabel}
          blockerHint={currentStepBlockedMessage}
          draftIndicator={
            currentStepDraftChangeCount > 0 ? (
              <DraftChangeChip label={draftChipLabelForStep(currentStep, currentStepDraftChangeCount)} />
            ) : null
          }
        />
      </SectionCard>
    </PageShell>
  );
}
