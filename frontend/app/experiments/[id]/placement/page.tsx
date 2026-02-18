"use client";

import {
  ArrowRight,
  Check,
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
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { CountAdjustToolbar } from "@/src/components/ui/count-adjust-toolbar";
import { Input } from "@/src/components/ui/input";
import { NativeSelect } from "@/src/components/ui/native-select";
import { Notice } from "@/src/components/ui/notice";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";
import { StepAdjustButton } from "@/src/components/ui/step-adjust-button";
import { ToolbarRow } from "@/src/components/ui/toolbar-row";
import { TooltipIconButton } from "@/src/components/ui/tooltip-icon-button";

import { experimentsStyles as styles } from "@/src/components/ui/experiments-styles";

type Species = { id: string; name: string; category: string };

type SlotSummary = {
  slot_id: string;
  code: string;
  label: string;
  shelf_index: number;
  slot_index: number;
  tray_count: number;
};

type TentSummary = {
  tent_id: string;
  name: string;
  code: string;
  layout: {
    schema_version: number;
    shelves: Array<{ index: number; tray_count: number }>;
  };
  allowed_species_count: number;
  allowed_species: Species[];
  slots: SlotSummary[];
};

type Location = {
  status: "placed" | "unplaced";
  tent: { id: string; code: string | null; name: string } | null;
  slot: { id: string; code: string; label: string; shelf_index: number; slot_index: number } | null;
  tray: { id: string; code: string; name: string; capacity: number; current_count: number } | null;
};

type RecipeSummary = {
  id: string;
  code: string;
  name: string;
};

type TrayPlant = {
  tray_plant_id: string;
  uuid: string;
  plant_id: string;
  species_id: string;
  species_name: string;
  species_category: string;
  grade: string | null;
  status: string;
  assigned_recipe: RecipeSummary | null;
};

type Tray = {
  tray_id: string;
  name: string;
  capacity: number;
  current_count: number;
  location: Location;
  plants: TrayPlant[];
};

type UnplacedPlant = {
  uuid: string;
  plant_id: string;
  species_id: string;
  species_name: string;
  species_category: string;
  grade: string | null;
  status: string;
  assigned_recipe: RecipeSummary | null;
};

type PlacementSummary = {
  tents: { count: number; results: TentSummary[]; meta: Record<string, unknown> };
  trays: { count: number; results: Tray[]; meta: Record<string, unknown> };
  unplaced_plants: {
    count: number;
    results: UnplacedPlant[];
    meta: { remaining_count?: number };
  };
  unplaced_trays: {
    count: number;
    results: Array<{
      tray_id: string;
      tray_name: string;
      capacity: number;
      current_count: number;
    }>;
    meta: Record<string, unknown>;
  };
};

type Diagnostics = {
  reason_counts?: Record<string, number>;
  unplaceable_plants?: Array<{
    plant_id: string;
    species_name: string;
    reason: string;
  }>;
};

type PlantCell = {
  uuid: string;
  plant_id: string;
  species_id: string;
  species_name: string;
  species_category: string;
  grade: string | null;
  status: string;
  assigned_recipe: RecipeSummary | null;
};

type TrayCell = {
  tray_id: string;
  name: string;
  capacity: number;
  current_count: number;
};

type PersistedTrayPlantRow = {
  trayId: string;
  trayPlantId: string;
};

type TentDraft = {
  name: string;
  code: string;
};

const RUNNING_LOCK_MESSAGE =
  "Placement cannot be edited while the experiment is running. Stop the experiment to change placement.";

const STEPS = [
  { id: 1, title: "Tents + Slots" },
  { id: 2, title: "Trays + Capacity" },
  { id: 3, title: "Plants -> Trays" },
  { id: 4, title: "Trays -> Slots" },
] as const;

function isActivePlant(status: string): boolean {
  return status.toLowerCase() === "active";
}

function normalizePlant(plant: UnplacedPlant | TrayPlant): PlantCell {
  return {
    uuid: plant.uuid,
    plant_id: plant.plant_id,
    species_id: plant.species_id,
    species_name: plant.species_name,
    species_category: plant.species_category,
    grade: plant.grade,
    status: plant.status,
    assigned_recipe: plant.assigned_recipe,
  };
}

function buildDefaultShelves(tent: TentSummary): number[] {
  if (tent.layout?.schema_version === 1 && Array.isArray(tent.layout.shelves)) {
    const counts = tent.layout.shelves.map((shelf) => Math.max(0, shelf.tray_count));
    if (counts.length > 0) {
      return counts;
    }
  }
  return [4];
}

function buildPersistedShelfCounts(tent: TentSummary): number[] {
  const layoutCounts = (tent.layout?.shelves || [])
    .slice()
    .sort((left, right) => left.index - right.index)
    .map((shelf) => Math.max(0, shelf.tray_count));

  if (tent.slots.length === 0) {
    return layoutCounts;
  }

  const slotCountByShelf = new Map<number, number>();
  for (const slot of tent.slots) {
    slotCountByShelf.set(slot.shelf_index, (slotCountByShelf.get(slot.shelf_index) || 0) + 1);
  }

  const maxShelfIndex = Math.max(
    layoutCounts.length,
    ...Array.from(slotCountByShelf.keys(), (shelfIndex) => Math.max(1, shelfIndex)),
  );
  const counts: number[] = [];
  for (let index = 1; index <= maxShelfIndex; index += 1) {
    counts.push(slotCountByShelf.get(index) || 0);
  }
  return counts;
}

function areShelfCountsEqual(left: number[], right: number[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function parseStep(rawStep: string | null): number {
  const parsed = Number.parseInt(rawStep || "1", 10);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.min(4, Math.max(1, parsed));
}

function formatTrayDisplay(rawValue: string | null | undefined, fallbackValue?: string): string {
  const raw = (rawValue || "").trim() || (fallbackValue || "").trim();
  if (!raw) {
    return "";
  }
  const match = raw.match(/^(?:tray|tr|t)?[\s_-]*0*([0-9]+)$/i);
  if (!match) {
    return raw;
  }
  const trayNumber = Number.parseInt(match[1], 10);
  if (!Number.isFinite(trayNumber)) {
    return raw;
  }
  return `Tray ${trayNumber}`;
}

function formatDraftChipLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

async function parseBackendErrorPayload(
  response: Response,
  fallback: string,
): Promise<{ detail: string; diagnostics: Diagnostics | null }> {
  try {
    const payload = (await response.json()) as { detail?: string; diagnostics?: Diagnostics };
    return {
      detail: payload.detail || fallback,
      diagnostics: payload.diagnostics || null,
    };
  } catch {
    return { detail: fallback, diagnostics: null };
  }
}

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

  const sortedSlots = useMemo(() => {
    return tents
      .flatMap((tent) =>
        [...tent.slots]
          .sort((left, right) => {
            if (left.shelf_index !== right.shelf_index) {
              return left.shelf_index - right.shelf_index;
            }
            if (left.slot_index !== right.slot_index) {
              return left.slot_index - right.slot_index;
            }
            return left.slot_id.localeCompare(right.slot_id);
          })
          .map((slot) => ({
            slot_id: slot.slot_id,
            label: `${tent.code || tent.name} / ${slot.code}`,
            shelf_index: slot.shelf_index,
            slot_index: slot.slot_index,
            tent_id: tent.tent_id,
          })),
      )
      .sort((left, right) => {
        const leftTent = tents.find((tent) => tent.tent_id === left.tent_id);
        const rightTent = tents.find((tent) => tent.tent_id === right.tent_id);
        const leftTentLabel = leftTent ? leftTent.code || leftTent.name : "";
        const rightTentLabel = rightTent ? rightTent.code || rightTent.name : "";
        if (leftTentLabel !== rightTentLabel) {
          return leftTentLabel.localeCompare(rightTentLabel);
        }
        if (left.shelf_index !== right.shelf_index) {
          return left.shelf_index - right.shelf_index;
        }
        return left.slot_index - right.slot_index;
      });
  }, [tents]);

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
    const nextPersistedPlantToTray: Record<string, string | null> = {};
    const nextPersistedRows: Record<string, PersistedTrayPlantRow> = {};

    for (const plant of summary?.unplaced_plants.results || []) {
      if (isActivePlant(plant.status)) {
        nextPersistedPlantToTray[plant.uuid] = null;
      }
    }

    for (const tray of trays) {
      for (const plant of tray.plants) {
        if (!isActivePlant(plant.status)) {
          continue;
        }
        nextPersistedPlantToTray[plant.uuid] = tray.tray_id;
        nextPersistedRows[plant.uuid] = {
          trayId: tray.tray_id,
          trayPlantId: plant.tray_plant_id,
        };
      }
    }

    const nextPersistedTrayToSlot: Record<string, string | null> = {};
    for (const tray of trays) {
      nextPersistedTrayToSlot[tray.tray_id] = tray.location.slot?.id || null;
    }

    setPersistedPlantToTray(nextPersistedPlantToTray);
    setDraftPlantToTray(nextPersistedPlantToTray);
    setPersistedTrayPlantRowByPlantId(nextPersistedRows);

    setPersistedTrayToSlot(nextPersistedTrayToSlot);
    setDraftTrayToSlot(nextPersistedTrayToSlot);

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

  const placementDraftChangeCount = useMemo(() => {
    let count = 0;
    for (const plantId of sortedPlantIds) {
      const persistedTrayId = persistedPlantToTray[plantId] ?? null;
      const draftTrayId = draftPlantToTray[plantId] ?? persistedTrayId;
      if ((persistedTrayId || null) !== (draftTrayId || null)) {
        count += 1;
      }
    }
    return count;
  }, [draftPlantToTray, persistedPlantToTray, sortedPlantIds]);

  const traySlotDraftChangeCount = useMemo(() => {
    let count = 0;
    for (const trayId of sortedTrayIds) {
      const persistedSlotId = persistedTrayToSlot[trayId] ?? null;
      const draftSlotId = draftTrayToSlot[trayId] ?? persistedSlotId;
      if ((persistedSlotId || null) !== (draftSlotId || null)) {
        count += 1;
      }
    }
    return count;
  }, [draftTrayToSlot, persistedTrayToSlot, sortedTrayIds]);

  const tentSlotDraftChangeCount = useMemo(() => {
    let count = 0;
    for (const tent of tents) {
      const draftShelfCounts = (shelfCountsByTent[tent.tent_id] || buildDefaultShelves(tent)).map((value) =>
        Math.max(0, value),
      );
      const persistedShelfCounts = buildPersistedShelfCounts(tent);
      const hasNoPersistedSlots = tent.slots.length === 0;

      if (hasNoPersistedSlots || !areShelfCountsEqual(draftShelfCounts, persistedShelfCounts)) {
        count += 1;
      }
    }
    return count;
  }, [shelfCountsByTent, tents]);

  const trayCountDraftChangeCount = Math.abs(draftTrayCount - trays.length);

  const trayCapacityDraftChangeCount = useMemo(() => {
    let count = 0;
    for (const tray of trays) {
      const draftCapacity = trayCapacityDraftById[tray.tray_id] ?? tray.capacity;
      if (draftCapacity !== tray.capacity) {
        count += 1;
      }
    }
    return count;
  }, [trayCapacityDraftById, trays]);

  const step2DraftChangeCount = trayCountDraftChangeCount + trayCapacityDraftChangeCount;

  function draftChangeCountForStep(step: number): number {
    if (step === 1) {
      return tentSlotDraftChangeCount;
    }
    if (step === 2) {
      return step2DraftChangeCount;
    }
    if (step === 3) {
      return placementDraftChangeCount;
    }
    return traySlotDraftChangeCount;
  }

  function draftChipLabelForStep(step: number): string {
    const count = draftChangeCountForStep(step);
    if (step === 1) {
      return formatDraftChipLabel(count, "tent layout change");
    }
    if (step === 2) {
      return formatDraftChipLabel(count, "tray change");
    }
    if (step === 3) {
      return formatDraftChipLabel(count, "plant layout change");
    }
    return formatDraftChipLabel(count, "tray/slot change");
  }

  const currentStepDraftChangeCount = draftChangeCountForStep(currentStep);

  function stepBlockedMessage(step: number): string {
    if (step === 1 && !step1Complete) {
      return "Add at least one tent and generate slots for each tent before continuing.";
    }
    if (step === 2 && !step2Complete) {
      return "Add at least one tray with capacity before continuing.";
    }
    if (step === 3 && !step3Complete) {
      return "Place all active plants into trays before continuing.";
    }
    if (step === 4 && !step4Complete) {
      return "Place all trays into tent slots before continuing.";
    }
    return "";
  }

  function isStepComplete(step: number): boolean {
    if (step === 1) {
      return step1Complete;
    }
    if (step === 2) {
      return step2Complete;
    }
    if (step === 3) {
      return step3Complete;
    }
    return step4Complete;
  }

  function goToStep(step: number) {
    const next = Math.min(Math.max(1, step), maxUnlockedStep);
    setCurrentStep(next);
  }

  async function goNextStep() {
    if (!isStepComplete(currentStep)) {
      setError(stepBlockedMessage(currentStep));
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

  async function saveTentDetails(tent: TentSummary) {
    if (placementLocked) {
      setError(RUNNING_LOCK_MESSAGE);
      return;
    }

    const draft = tentDraftById[tent.tent_id] || {
      name: tent.name,
      code: tent.code,
    };
    const allowedSpeciesIds = tentAllowedSpeciesDraftById[tent.tent_id] || tent.allowed_species.map((item) => item.id);

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await backendFetch(`/api/v1/tents/${tent.tent_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          code: draft.code,
          allowed_species: allowedSpeciesIds,
        }),
      });

      const payload = (await response.json()) as { detail?: string };
      if (!response.ok) {
        setError(payload.detail || "Unable to update tent.");
        return;
      }

      setNotice(`Saved tent details for ${draft.name}.`);
      await loadPage();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to update tent.");
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

    const changedTents = tents.filter((tent) => {
      const draftShelfCounts = (shelfCountsByTent[tent.tent_id] || buildDefaultShelves(tent)).map((count) =>
        Math.max(0, count),
      );
      const persistedShelfCounts = buildPersistedShelfCounts(tent);
      return tent.slots.length === 0 || !areShelfCountsEqual(draftShelfCounts, persistedShelfCounts);
    });

    if (changedTents.length === 0) {
      setNotice("No tent slot layout changes to apply.");
      return true;
    }

    setSaving(true);
    setError("");
    setNotice("");
    setDiagnostics(null);

    try {
      let appliedCount = 0;
      for (const tent of changedTents) {
        const shelfCounts = shelfCountsByTent[tent.tent_id] || [4];
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
          if (appliedCount > 0) {
            await loadPage();
          }
          return false;
        }

        appliedCount += 1;
      }

      setNotice(`Applied tent slot layout for ${appliedCount} tent(s).`);
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

    const selected = selectedPlantIds.has(plantId);
    const gradeLabel = plant.grade ? `Grade ${plant.grade}` : "Grade -";

    return (
      <article
        key={plant.uuid}
        className={[
          styles.plantCell,
          styles.cellFrame,
          styles.cellSurfaceLevel1,
          styles.cellInteractive,
          "justify-items-center text-center",
          selected ? styles.plantCellSelected : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => togglePlantSelection(plant.uuid)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            togglePlantSelection(plant.uuid);
          }
        }}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
      >
        {selected ? (
          <span className={styles.plantCellCheck}>
            <Check size={12} />
          </span>
        ) : null}
        <strong className={styles.plantCellId}>{plant.plant_id || "(pending)"}</strong>
        <span className={styles.plantCellSpecies}>{plant.species_name}</span>
        <div className={[styles.plantCellMetaRow, "justify-center"].join(" ")}>
          <Badge variant={plant.grade ? "secondary" : "outline"}>{gradeLabel}</Badge>
        </div>
      </article>
    );
  }

  function renderTrayCell(trayId: string, inSlot?: boolean) {
    const tray = trayById.get(trayId);
    if (!tray) {
      return null;
    }

    const selected = selectedTrayIds.has(trayId);

    return (
      <article
        key={trayId}
        className={[
          styles.trayGridCell,
          inSlot ? styles.cellFrameCompact : styles.cellFrame,
          styles.cellSurfaceLevel1,
          styles.cellInteractive,
          inSlot ? styles.slotTrayCellFill : "",
          selected ? styles.plantCellSelected : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => toggleTraySelection(trayId)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleTraySelection(trayId);
          }
        }}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
      >
        {selected ? (
          <span className={styles.plantCellCheck}>
            <Check size={12} />
          </span>
        ) : null}
        <strong
          className={[
            styles.trayGridCellId,
            inSlot ? styles.trayGridCellIdInSlot : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {formatTrayDisplay(tray.name, tray.tray_id)}
        </strong>
        <Badge
          variant="secondary"
          className={[styles.recipeLegendItemCompact, inSlot ? "justify-self-center" : ""].filter(Boolean).join(" ")}
        >
          {tray.current_count}/{tray.capacity} plants
        </Badge>
        {inSlot ? <span className={styles.slotPlacedChip}>Placed</span> : null}
      </article>
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
            const complete = isStepComplete(step.id);
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

        {!isStepComplete(currentStep) ? (
          <div className={[styles.stepBlocker, "rounded-lg border border-border bg-card"].join(" ")}>
            <strong>Step blocker</strong>
            <p className="text-sm text-muted-foreground">{stepBlockedMessage(currentStep)}</p>
          </div>
        ) : null}

        <div key={currentStep} className={styles.stepPanel}>
          {currentStep === 1 ? (
            <div className={"grid gap-3"}>
              <SectionCard title="Tent Manager">
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
                type PreviewSlot = SlotSummary & { isDraft?: boolean };
                const shelfCounts = shelfCountsByTent[tent.tent_id] || buildDefaultShelves(tent);
                const normalizedDraftShelfCounts = shelfCounts.map((value) => Math.max(0, value));
                const selectedSpecies = new Set(
                  tentAllowedSpeciesDraftById[tent.tent_id] || tent.allowed_species.map((item) => item.id),
                );
                const tentDraft = tentDraftById[tent.tent_id] || { name: tent.name, code: tent.code };
                const sortedTentSlots = [...tent.slots].sort((left, right) => {
                  if (left.shelf_index !== right.shelf_index) {
                    return left.shelf_index - right.shelf_index;
                  }
                  if (left.slot_index !== right.slot_index) {
                    return left.slot_index - right.slot_index;
                  }
                  return left.slot_id.localeCompare(right.slot_id);
                });
                const slotsByShelf = new Map<number, SlotSummary[]>();
                for (const slot of sortedTentSlots) {
                  const shelfSlots = slotsByShelf.get(slot.shelf_index);
                  if (shelfSlots) {
                    shelfSlots.push(slot);
                  } else {
                    slotsByShelf.set(slot.shelf_index, [slot]);
                  }
                }
                const previewShelfSlotGroups = normalizedDraftShelfCounts.map((draftSlotCount, index) => {
                  const shelfIndex = index + 1;
                  const persistedSlots: PreviewSlot[] = (slotsByShelf.get(shelfIndex) || []).map((slot) => ({
                    ...slot,
                    isDraft: false,
                  }));
                  const usePersistedShelfPreview =
                    tent.slots.length > 0 && draftSlotCount === persistedSlots.length;

                  if (usePersistedShelfPreview) {
                    return {
                      shelfIndex,
                      slots: persistedSlots,
                    };
                  }

                  const previewSlots = persistedSlots.slice(0, draftSlotCount);
                  for (let slotIndex = previewSlots.length; slotIndex < draftSlotCount; slotIndex += 1) {
                    previewSlots.push({
                      slot_id: `draft-${tent.tent_id}-${shelfIndex}-${slotIndex + 1}`,
                      code: `Slot ${slotIndex + 1}`,
                      label: `Shelf ${shelfIndex} Slot ${slotIndex + 1}`,
                      shelf_index: shelfIndex,
                      slot_index: slotIndex + 1,
                      tray_count: 0,
                      isDraft: true,
                    });
                  }

                  return {
                    shelfIndex,
                    slots: previewSlots,
                  };
                });

                return (
                  <SectionCard key={tent.tent_id} title={`${tent.name}${tent.code ? ` (${tent.code})` : ""}`}>
                    <div className={"grid gap-3"}>
                      <div className={styles.trayControlRow}>
                        <Input
                          className="sm:w-auto sm:min-w-[11rem] sm:flex-1"
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
                        <Input
                          className="sm:w-auto sm:min-w-[11rem] sm:flex-1"
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
                        <Button variant="secondary" type="button" disabled={saving} onClick={() => void saveTentDetails(tent)}>
                          Save tent
                        </Button>
                      </div>

                      <div className={"grid gap-2"}>
                        <details className={["rounded-lg border border-border", styles.cellSurfaceLevel1].join(" ")}>
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
                        <div className="grid grid-flow-col auto-cols-[minmax(220px,1fr)] gap-2 overflow-x-auto pb-1">
                          {previewShelfSlotGroups.map((group) => (
                            <article key={`${tent.tent_id}-shelf-${group.shelfIndex}`} className={[styles.trayEditorCell, "min-w-[220px] rounded-lg border border-border", styles.cellSurfaceLevel2].join(" ")}>
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

                              <div className={[styles.plantCellGridTray, styles.cellGridResponsive].join(" ")} data-cell-size="sm">
                                {group.slots.map((slot) => (
                                  <article
                                    key={slot.slot_id}
                                    className={[
                                      styles.trayGridCell,
                                      styles.cellFrame,
                                      styles.cellSurfaceLevel1,
                                      "justify-items-center text-center",
                                      slot.isDraft ? "[grid-template-rows:auto_1fr]" : "",
                                    ]
                                      .filter(Boolean)
                                      .join(" ")}
                                  >
                                    <strong className={styles.trayGridCellId}>{`Slot ${slot.slot_index}`}</strong>
                                    {!slot.isDraft && slot.code !== `Slot ${slot.slot_index}` ? (
                                      <span className="text-sm text-muted-foreground">{slot.code}</span>
                                    ) : null}
                                    {slot.isDraft ? (
                                      <span className={[styles.slotPlacedChip, "self-end"].join(" ")}>New</span>
                                    ) : null}
                                  </article>
                                ))}
                                {group.slots.length === 0 ? <span className="text-sm text-muted-foreground">No slots.</span> : null}
                              </div>
                            </article>
                          ))}
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
              <SectionCard title="Tray Manager">
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
                    return (
                      <article
                        key={trayId}
                        className={[
                          styles.trayEditorCell,
                          "rounded-lg border border-border",
                          styles.cellSurfaceLevel1,
                          "justify-items-center text-center",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <strong className={styles.trayGridCellId}>
                          {formatTrayDisplay(tray.name, tray.tray_id)}
                        </strong>
                        <div className={styles.trayEditorBadgeRow}>
                          <Badge variant="secondary" className={styles.recipeLegendItemCompact}>
                            {draftCapacity} {draftCapacity === 1 ? "plant" : "plants"}
                          </Badge>
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
                          ].join(" ")}
                        >
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
              <SectionCard title="Plants -> Trays (Draft)">
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
                      <article key={trayId} className={[styles.trayEditorCell, "rounded-lg border border-border", styles.cellSurfaceLevel2].join(" ")}>
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
              <SectionCard title="Trays -> Slots (Draft)">
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

              <div className={styles.tentBoardGrid}>
                {tents.map((tent) => {
                  const selectedInTent = selectedTraysByTentId[tent.tent_id] || [];
                  const slotsByShelf = [...tent.slots]
                    .sort((left, right) => {
                      if (left.shelf_index !== right.shelf_index) {
                        return left.shelf_index - right.shelf_index;
                      }
                      if (left.slot_index !== right.slot_index) {
                        return left.slot_index - right.slot_index;
                      }
                      return left.slot_id.localeCompare(right.slot_id);
                    })
                    .reduce<Map<number, SlotSummary[]>>((map, slot) => {
                      const shelfSlots = map.get(slot.shelf_index);
                      if (shelfSlots) {
                        shelfSlots.push(slot);
                      } else {
                        map.set(slot.shelf_index, [slot]);
                      }
                      return map;
                    }, new Map<number, SlotSummary[]>());

                  return (
                    <article key={tent.tent_id} className={[styles.tentBoardCard, "rounded-lg border border-border", styles.cellSurfaceLevel3].join(" ")}>
                      <div className={[styles.trayHeaderRow, "items-center"].join(" ")}>
                        <div className={[styles.trayHeaderMeta, "py-0.5"].join(" ")}>
                          <strong className={styles.trayGridCellId}>{tent.name}</strong>
                        </div>
                        <div className={styles.trayHeaderActions}>
                          <span className={styles.recipeLegendItem}>
                            {tent.slots.length} {tent.slots.length === 1 ? "slot" : "slots"}
                          </span>
                          {selectedInTent.length > 0 ? (
                            <TooltipIconButton
                              label="Return selected trays to unplaced"
                              icon={<Trash2 size={16} />}
                              onClick={() => stageRemoveTraysFromTent(tent.tent_id)}
                              variant="destructive"
                            />
                          ) : null}
                        </div>
                      </div>

                      <div className={styles.tentShelfRow}>
                        {Array.from(slotsByShelf.entries()).map(([shelfIndex, shelfSlots]) => (
                          <article key={`${tent.tent_id}-shelf-${shelfIndex}`} className={[styles.tentShelfCard, styles.cellSurfaceLevel2].join(" ")}>
                            <div className={[styles.trayHeaderRow, "items-center"].join(" ")}>
                              <div className={[styles.trayHeaderMeta, "py-0.5"].join(" ")}>
                                <strong className={styles.trayGridCellId}>Shelf {shelfIndex}</strong>
                              </div>
                            </div>

                            <div className={styles.tentShelfSlotGrid}>
                              {shelfSlots.map((slot) => {
                                const trayId = draftSlotToTray.get(slot.slot_id) || null;
                                const slotSelected = destinationSlotId === slot.slot_id;
                                if (trayId) {
                                  return (
                                    <div key={slot.slot_id} className={styles.slotTrayCellFill}>
                                      {renderTrayCell(trayId, true)}
                                    </div>
                                  );
                                }
                                return (
                                  <div
                                    key={slot.slot_id}
                                    className={[
                                      styles.slotCell,
                                      styles.slotContainerCellFrame,
                                      styles.cellSurfaceLevel1,
                                      slotSelected ? styles.plantCellSelected : "",
                                    ]
                                      .filter(Boolean)
                                      .join(" ")}
                                  >
                                    {slotSelected ? (
                                      <span className={styles.plantCellCheck}>
                                        <Check size={12} />
                                      </span>
                                    ) : null}
                                    <span className={styles.slotCellLabel}>{slot.code}</span>
                                    <button
                                      type="button"
                                      className={[
                                        styles.slotCellEmpty,
                                        slotSelected ? styles.slotCellEmptyActive : "",
                                      ]
                                        .filter(Boolean)
                                        .join(" ")}
                                      onClick={() => toggleDestinationSlot(slot.slot_id)}
                                    >
                                      Empty
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </article>
                        ))}
                        {tent.slots.length === 0 ? <span className="text-sm text-muted-foreground">No slots generated.</span> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        <ToolbarRow className="mt-3">
          {currentStep > 1 ? (
            <Button variant="secondary" type="button" onClick={goPreviousStep}>
              Back
            </Button>
          ) : null}
          <div className={styles.stepNavActions}>
            {currentStepDraftChangeCount > 0 ? (
              <span className={styles.recipeLegendItem}>{draftChipLabelForStep(currentStep)}</span>
            ) : null}
            <Button
             
              type="button"
              disabled={saving || !isStepComplete(currentStep)}
              onClick={() => void goNextStep()}
            >
              {saving
                ? "Saving..."
                : currentStepDraftChangeCount > 0
                  ? "Save & Next"
                  : currentStep === 4
                    ? "Go to Overview"
                    : "Next"}
            </Button>
          </div>
        </ToolbarRow>
      </SectionCard>
    </PageShell>
  );
}
