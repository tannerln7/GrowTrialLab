"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
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
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { backendFetch, normalizeBackendError, unwrapList } from "@/lib/backend";
import {
  fetchExperimentStatusSummary,
  type ExperimentStatusSummary,
} from "@/lib/experiment-status";
import { suggestTentCode, suggestTentName, suggestTrayName } from "@/lib/id-suggestions";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";
import StickyActionBar from "@/src/components/ui/StickyActionBar";

import styles from "../../experiments.module.css";

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

type TrayDraft = {
  name: string;
  capacity: number;
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

function ToolIconButton({
  label,
  icon,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            className={danger ? styles.toolbarIconDanger : styles.toolbarIconButton}
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            title={label}
          >
            {icon}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className={styles.toolbarTooltip} sideOffset={6}>
            {label}
            <Tooltip.Arrow className={styles.toolbarTooltipArrow} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
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

  const [newTentName, setNewTentName] = useState("");
  const [newTentCode, setNewTentCode] = useState("");
  const [shelfCountsByTent, setShelfCountsByTent] = useState<Record<string, number[]>>({});
  const [tentDraftById, setTentDraftById] = useState<Record<string, TentDraft>>({});

  const [newTrayName, setNewTrayName] = useState("");
  const [newTrayCapacity, setNewTrayCapacity] = useState(1);
  const [trayDraftById, setTrayDraftById] = useState<Record<string, TrayDraft>>({});

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
  const [selectedTrayManagerIds, setSelectedTrayManagerIds] = useState<Set<string>>(new Set());
  const [destinationSlotId, setDestinationSlotId] = useState("");

  const placementLocked = statusSummary?.lifecycle.state === "running";

  const tents = useMemo(() => summary?.tents.results || [], [summary?.tents.results]);
  const trays = useMemo(() => summary?.trays.results || [], [summary?.trays.results]);

  const tentNameSuggestion = useMemo(() => suggestTentName(tents.map((tent) => tent.name)), [tents]);
  const tentCodeSuggestion = useMemo(() => suggestTentCode(tents.map((tent) => tent.code)), [tents]);
  const trayNameSuggestion = useMemo(() => suggestTrayName(trays.map((tray) => tray.name)), [trays]);

  useEffect(() => {
    setCurrentStep(parseStep(searchParams.get("step")));
  }, [searchParams]);

  useEffect(() => {
    if (!newTentName.trim()) {
      setNewTentName(tentNameSuggestion);
    }
  }, [newTentName, tentNameSuggestion]);

  useEffect(() => {
    if (!newTentCode.trim()) {
      setNewTentCode(tentCodeSuggestion);
    }
  }, [newTentCode, tentCodeSuggestion]);

  useEffect(() => {
    if (!newTrayName.trim()) {
      setNewTrayName(trayNameSuggestion);
    }
  }, [newTrayName, trayNameSuggestion]);

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

    setTrayDraftById((current) => {
      const next = { ...current };
      for (const tray of trays) {
        next[tray.tray_id] = {
          name: tray.name,
          capacity: tray.capacity,
        };
      }
      return next;
    });

    setDestinationTrayId((current) => (current && trayById.has(current) ? current : trays[0]?.tray_id || ""));
    setDestinationSlotId((current) => (current && slotById.has(current) ? current : ""));
    setSelectedPlantIds(new Set());
    setSelectedTrayIds(new Set());
    setSelectedTrayManagerIds(new Set());
    setActivePlantAnchorId(null);
  }, [slotById, summary?.unplaced_plants.results, tents, trayById, trays]);

  useEffect(() => {
    setSelectedTrayManagerIds((current) => {
      const allowed = new Set(sortedTrayIds);
      const next = new Set<string>();
      for (const trayId of current) {
        if (allowed.has(trayId)) {
          next.add(trayId);
        }
      }
      return next;
    });
  }, [sortedTrayIds]);

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

  function goNextStep() {
    if (!isStepComplete(currentStep)) {
      setError(stepBlockedMessage(currentStep));
      return;
    }
    if (currentStep === 4) {
      router.push(`/experiments/${experimentId}/overview`);
      return;
    }
    setCurrentStep((current) => Math.min(4, current + 1));
    setError("");
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

    const name = newTentName.trim() || tentNameSuggestion;
    const code = newTentCode.trim() || tentCodeSuggestion;

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
        suggested_name?: string;
        suggested_code?: string;
      };

      if (!response.ok) {
        if (payload.suggested_name) {
          setNewTentName(payload.suggested_name);
        }
        if (payload.suggested_code) {
          setNewTentCode(payload.suggested_code);
        }
        setError(payload.detail || "Unable to create tent.");
        return;
      }

      setNotice("Tent created.");
      setNewTentName("");
      setNewTentCode("");
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

  async function saveTentDetails(tent: TentSummary) {
    if (placementLocked) {
      setError(RUNNING_LOCK_MESSAGE);
      return;
    }

    const draft = tentDraftById[tent.tent_id] || {
      name: tent.name,
      code: tent.code,
    };

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

  async function saveTentRestrictions(tent: TentSummary, allowedSpeciesIds: string[]) {
    if (placementLocked) {
      setError(RUNNING_LOCK_MESSAGE);
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await backendFetch(`/api/v1/tents/${tent.tent_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allowed_species: allowedSpeciesIds,
        }),
      });

      const payload = (await response.json()) as { detail?: string };
      if (!response.ok) {
        setError(payload.detail || "Unable to update tent restrictions.");
        return;
      }

      setNotice(`Updated restrictions for ${tent.name}.`);
      await loadPage();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to update tent restrictions.");
    } finally {
      setSaving(false);
    }
  }

  function updateShelfCount(tentId: string, shelfIndex: number, nextCount: number) {
    setShelfCountsByTent((current) => {
      const next = [...(current[tentId] || [4])];
      next[shelfIndex] = Math.max(0, nextCount);
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

  async function generateSlots(tentId: string) {
    if (placementLocked) {
      setError(RUNNING_LOCK_MESSAGE);
      return;
    }

    const shelfCounts = shelfCountsByTent[tentId] || [4];
    const layout = {
      schema_version: 1,
      shelves: shelfCounts.map((trayCount, index) => ({
        index: index + 1,
        tray_count: Math.max(0, trayCount),
      })),
    };

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await backendFetch(`/api/v1/tents/${tentId}/slots/generate`, {
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
        setError((payload.detail || "Unable to generate slots.") + orphanMessage);
        return;
      }

      setNotice("Slots generated.");
      await loadPage();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to generate slots.");
    } finally {
      setSaving(false);
    }
  }

  async function createTray() {
    if (placementLocked) {
      setError(RUNNING_LOCK_MESSAGE);
      return;
    }

    const name = newTrayName.trim() || trayNameSuggestion;
    if (!name) {
      setError("Tray code/name is required.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await backendFetch(`/api/v1/experiments/${experimentId}/trays`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          capacity: newTrayCapacity,
        }),
      });

      const payload = (await response.json()) as { detail?: string; suggested_name?: string };
      if (!response.ok) {
        if (payload.suggested_name) {
          setNewTrayName(payload.suggested_name);
        }
        setError(payload.detail || "Unable to create tray.");
        return;
      }

      setNotice("Tray created.");
      setNewTrayName("");
      setNewTrayCapacity(1);
      await loadPage();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to create tray.");
    } finally {
      setSaving(false);
    }
  }

  async function saveTrayDetails(tray: TrayCell) {
    if (placementLocked) {
      setError(RUNNING_LOCK_MESSAGE);
      return;
    }

    const draft = trayDraftById[tray.tray_id] || {
      name: tray.name,
      capacity: tray.capacity,
    };

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await backendFetch(`/api/v1/trays/${tray.tray_id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          capacity: Math.max(1, Number(draft.capacity || 1)),
        }),
      });

      const payload = (await response.json()) as { detail?: string };
      if (!response.ok) {
        setError(payload.detail || "Unable to update tray.");
        return;
      }

      setNotice(`Saved tray details for ${draft.name}.`);
      await loadPage();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to update tray.");
    } finally {
      setSaving(false);
    }
  }

  function toggleTrayManagerSelection(trayId: string) {
    if (!trayById.has(trayId)) {
      return;
    }
    setSelectedTrayManagerIds((current) => {
      const next = new Set(current);
      if (next.has(trayId)) {
        next.delete(trayId);
      } else {
        next.add(trayId);
      }
      return next;
    });
  }

  function selectAllTrayManagerCells() {
    setSelectedTrayManagerIds(new Set(sortedTrayIds));
  }

  function clearTrayManagerSelection() {
    setSelectedTrayManagerIds(new Set());
  }

  async function bulkDeleteSelectedTrays() {
    if (placementLocked) {
      setError(RUNNING_LOCK_MESSAGE);
      return;
    }

    const selected = sortedTrayIds.filter((trayId) => selectedTrayManagerIds.has(trayId));
    if (selected.length === 0) {
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      let deletedCount = 0;
      for (const trayId of selected) {
        const response = await backendFetch(`/api/v1/trays/${trayId}/`, {
          method: "DELETE",
        });
        if (!response.ok) {
          const parsed = await parseBackendErrorPayload(response, "Unable to delete selected trays.");
          setError(parsed.detail);
          setDiagnostics(parsed.diagnostics);
          if (deletedCount > 0) {
            await loadPage();
          }
          return;
        }
        deletedCount += 1;
      }

      setSelectedTrayManagerIds(new Set());
      setNotice(`Deleted ${deletedCount} tray(s).`);
      await loadPage();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to delete selected trays.");
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

    return (
      <article
        key={plant.uuid}
        className={[
          styles.plantCell,
          "gt-cell gt-cell--interactive",
          selected ? "gt-cell--selected" : "",
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
        <div className={styles.plantCellMetaRow}>
          <span className={styles.recipeLegendItem}>{plant.grade || "No grade"}</span>
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
          "gt-cell gt-cell--interactive",
          selected ? "gt-cell--selected" : "",
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
        <strong className={styles.trayGridCellId}>{formatTrayDisplay(tray.name, tray.tray_id)}</strong>
        <span className={styles.plantCellSpecies}>{tray.current_count}/{tray.capacity}</span>
        {inSlot ? <span className={styles.recipeLegendItem}>Placed</span> : null}
      </article>
    );
  }

  async function applyPlantToTrayLayout() {
    if (placementLocked) {
      setError(RUNNING_LOCK_MESSAGE);
      return;
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
      return;
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
          return;
        }

        const response = await backendFetch(`/api/v1/trays/${removal.persistedTrayId}/plants/${row.trayPlantId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const parsed = await parseBackendErrorPayload(response, "Unable to apply plant/tray layout changes.");
          setError(parsed.detail);
          setDiagnostics(parsed.diagnostics);
          return;
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
          return;
        }
      }

      setNotice(`Applied ${placementChanges.length} plant layout change(s).`);
      await loadPage();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to apply plant/tray layout changes.");
    } finally {
      setSaving(false);
    }
  }

  async function applyTrayToSlotLayout() {
    if (placementLocked) {
      setError(RUNNING_LOCK_MESSAGE);
      return;
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
      return;
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
          return;
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
          return;
        }
      }

      setNotice(`Applied ${slotChanges.length} tray/slot layout change(s).`);
      await loadPage();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to apply tray/slot layout changes.");
    } finally {
      setSaving(false);
    }
  }

  function resetPlantDrafts() {
    setDraftPlantToTray(persistedPlantToTray);
    setSelectedPlantIds(new Set());
    setActivePlantAnchorId(null);
    setDiagnostics(null);
    setError("");
    setNotice("Plant/tray drafts discarded.");
  }

  function resetTraySlotDrafts() {
    setDraftTrayToSlot(persistedTrayToSlot);
    setSelectedTrayIds(new Set());
    setDestinationSlotId("");
    setDiagnostics(null);
    setError("");
    setNotice("Tray/slot drafts discarded.");
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
        <Link className={styles.buttonPrimary} href={`/experiments/${experimentId}/overview`}>
          ← Overview
        </Link>
      }
    >
      {loading ? <p className={styles.mutedText}>Loading placement...</p> : null}
      {error ? <p className={styles.errorText}>{error}</p> : null}
      {notice ? <p className={styles.successText}>{notice}</p> : null}
      {offline ? <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" /> : null}

      {placementLocked ? (
        <SectionCard title="Placement Locked">
          <p className={styles.inlineNote}>{RUNNING_LOCK_MESSAGE}</p>
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
          <div className={[styles.stepBlocker, "gt-surface"].join(" ")}>
            <strong>Step blocker</strong>
            <p className={styles.mutedText}>{stepBlockedMessage(currentStep)}</p>
          </div>
        ) : null}

        <div key={currentStep} className={styles.stepPanel}>
          {currentStep === 1 ? (
            <div className={styles.stack}>
              <SectionCard title="Add Tent">
                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Tent name</span>
                    <input className={styles.input} value={newTentName} onChange={(event) => setNewTentName(event.target.value)} />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Tent code</span>
                    <input className={styles.input} value={newTentCode} onChange={(event) => setNewTentCode(event.target.value)} />
                  </label>
                  <button className={styles.buttonPrimary} type="button" disabled={saving} onClick={() => void createTent()}>
                    {saving ? "Saving..." : "Add tent"}
                  </button>
                </div>
              </SectionCard>

              {tents.map((tent) => {
                const shelfCounts = shelfCountsByTent[tent.tent_id] || buildDefaultShelves(tent);
                const totalSlots = shelfCounts.reduce((acc, value) => acc + Math.max(0, value), 0);
                const selectedSpecies = new Set(tent.allowed_species.map((item) => item.id));
                const tentDraft = tentDraftById[tent.tent_id] || { name: tent.name, code: tent.code };

                return (
                  <SectionCard key={tent.tent_id} title={`${tent.name}${tent.code ? ` (${tent.code})` : ""}`}>
                    <div className={styles.formGrid}>
                      <div className={styles.trayControlRow}>
                        <input
                          className={styles.input}
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
                        <input
                          className={styles.input}
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
                        <button className={styles.buttonSecondary} type="button" disabled={saving} onClick={() => void saveTentDetails(tent)}>
                          Save tent
                        </button>
                      </div>

                      <div className={styles.field}>
                        <span className={styles.fieldLabel}>Allowed species restrictions</span>
                        <div className={styles.selectionGrid}>
                          {species.map((item) => {
                            const checked = selectedSpecies.has(item.id);
                            return (
                              <label key={item.id} className={styles.checkboxRow}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) => {
                                    const next = new Set(selectedSpecies);
                                    if (event.target.checked) {
                                      next.add(item.id);
                                    } else {
                                      next.delete(item.id);
                                    }
                                    void saveTentRestrictions(tent, Array.from(next));
                                  }}
                                />
                                <span>{item.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <div className={styles.field}>
                        <span className={styles.fieldLabel}>Shelves layout</span>
                        <div className={styles.actions}>
                          <button className={styles.buttonSecondary} type="button" onClick={() => addShelf(tent.tent_id)}>
                            Add shelf
                          </button>
                          <button className={styles.buttonSecondary} type="button" onClick={() => removeShelf(tent.tent_id)}>
                            Remove shelf
                          </button>
                        </div>
                        {shelfCounts.map((count, index) => (
                          <label className={styles.field} key={`${tent.tent_id}-shelf-${index + 1}`}>
                            <span className={styles.fieldLabel}>Shelf {index + 1} slot count</span>
                            <input
                              className={styles.input}
                              type="number"
                              min={0}
                              value={count}
                              onChange={(event) =>
                                updateShelfCount(tent.tent_id, index, Number.parseInt(event.target.value || "0", 10))
                              }
                            />
                          </label>
                        ))}
                      </div>

                      <div className={styles.field}>
                        <span className={styles.fieldLabel}>Live preview</span>
                        <div className={styles.previewGrid}>
                          {shelfCounts.map((count, index) => (
                            <div className={styles.previewRow} key={`${tent.tent_id}-preview-${index + 1}`}>
                              <strong className={styles.mutedText}>Shelf {index + 1}</strong>
                              <div className={styles.previewCells}>
                                {Array.from({ length: Math.max(0, count) }).map((_, slotIndex) => (
                                  <span className={styles.previewCell} key={`${tent.tent_id}-${index + 1}-${slotIndex + 1}`}>
                                    {`S${index + 1}-${slotIndex + 1}`}
                                  </span>
                                ))}
                                {count === 0 ? <span className={styles.mutedText}>No slots</span> : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <button className={styles.buttonPrimary} type="button" disabled={saving} onClick={() => void generateSlots(tent.tent_id)}>
                        {saving ? "Generating..." : `Generate slots (${totalSlots})`}
                      </button>

                      <div className={styles.slotGridInline}>
                        {[...tent.slots]
                          .sort((left, right) => {
                            if (left.shelf_index !== right.shelf_index) {
                              return left.shelf_index - right.shelf_index;
                            }
                            if (left.slot_index !== right.slot_index) {
                              return left.slot_index - right.slot_index;
                            }
                            return left.slot_id.localeCompare(right.slot_id);
                          })
                          .map((slot) => (
                            <span key={slot.slot_id} className={styles.previewCell}>
                              {slot.code}
                            </span>
                          ))}
                        {tent.slots.length === 0 ? <span className={styles.mutedText}>No slots generated yet.</span> : null}
                      </div>
                    </div>
                  </SectionCard>
                );
              })}
            </div>
          ) : null}

          {currentStep === 2 ? (
            <div className={styles.stack}>
              <SectionCard title="Add Tray">
                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Tray code/name</span>
                    <input className={styles.input} value={newTrayName} onChange={(event) => setNewTrayName(event.target.value)} />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Capacity</span>
                    <input
                      className={styles.input}
                      type="number"
                      min={1}
                      value={newTrayCapacity}
                      onChange={(event) => setNewTrayCapacity(Number.parseInt(event.target.value || "1", 10))}
                    />
                  </label>
                  <button className={styles.buttonPrimary} type="button" disabled={saving} onClick={() => void createTray()}>
                    {saving ? "Saving..." : "Create tray"}
                  </button>
                </div>
              </SectionCard>

              <SectionCard title={`Tray Manager (${trays.length})`}>
                <div className={[styles.toolbarSummaryRow, "gt-row"].join(" ")}>
                  <span className={styles.mutedText}>Total trays: {sortedTrayIds.length}</span>
                  <span className={styles.mutedText}>Selected: {selectedTrayManagerIds.size}</span>
                  <div className={[styles.toolbarActionsCompact, "gt-btnbar"].join(" ")}>
                    <ToolIconButton
                      label="Select all trays"
                      icon={<CheckSquare size={16} />}
                      onClick={selectAllTrayManagerCells}
                      disabled={sortedTrayIds.length === 0}
                    />
                    <ToolIconButton
                      label="Clear tray selection"
                      icon={<X size={16} />}
                      onClick={clearTrayManagerSelection}
                      disabled={selectedTrayManagerIds.size === 0}
                    />
                    {selectedTrayManagerIds.size > 0 ? (
                      <ToolIconButton
                        label="Delete selected trays"
                        icon={<Trash2 size={16} />}
                        onClick={() => void bulkDeleteSelectedTrays()}
                        danger
                      />
                    ) : null}
                  </div>
                </div>

                <div className={[styles.trayManagerGrid, "gt-grid"].join(" ")} data-cell-size="lg">
                  {sortedTrayIds.map((trayId) => {
                    const tray = trayById.get(trayId);
                    if (!tray) {
                      return null;
                    }
                    const draft = trayDraftById[trayId] || { name: tray.name, capacity: tray.capacity };
                    const selected = selectedTrayManagerIds.has(trayId);
                    return (
                      <article
                        key={trayId}
                        className={[
                          styles.trayEditorCell,
                          "gt-surface-2",
                          selected ? "gt-cell--selected" : "",
                          selected ? styles.plantCellSelected : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => toggleTrayManagerSelection(trayId)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleTrayManagerSelection(trayId);
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
                        <strong className={styles.trayGridCellId}>
                          {formatTrayDisplay(draft.name || tray.name, tray.tray_id)}
                        </strong>
                        <span className={styles.mutedText}>Current occupancy: {tray.current_count}/{tray.capacity}</span>
                        <div className={styles.trayEditorInputs}>
                          <input
                            className={styles.input}
                            value={draft.name}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) =>
                              setTrayDraftById((current) => ({
                                ...current,
                                [trayId]: {
                                  ...(current[trayId] || { name: tray.name, capacity: tray.capacity }),
                                  name: event.target.value,
                                },
                              }))
                            }
                            aria-label="Tray name"
                          />
                          <input
                            className={styles.input}
                            type="number"
                            min={1}
                            value={draft.capacity}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) =>
                              setTrayDraftById((current) => ({
                                ...current,
                                [trayId]: {
                                  ...(current[trayId] || { name: tray.name, capacity: tray.capacity }),
                                  capacity: Number.parseInt(event.target.value || "1", 10),
                                },
                              }))
                            }
                            aria-label="Tray capacity"
                          />
                          <button
                            className={styles.buttonSecondary}
                            type="button"
                            disabled={saving}
                            onClick={(event) => {
                              event.stopPropagation();
                              void saveTrayDetails(tray);
                            }}
                          >
                            Save tray
                          </button>
                        </div>
                      </article>
                    );
                  })}
                  {trays.length === 0 ? <p className={styles.mutedText}>No trays yet.</p> : null}
                </div>
              </SectionCard>
            </div>
          ) : null}

          {currentStep === 3 ? (
            <div className={styles.stack}>
              <SectionCard title="Plants -> Trays (Draft)">
                <Tooltip.Provider delayDuration={150}>
                  <div className={[styles.placementToolbar, "gt-stack"].join(" ")}>
                    <select
                      className={styles.select}
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
                    </select>
                    <div className={[styles.toolbarActionsCompact, "gt-btnbar"].join(" ")}>
                      <ToolIconButton
                        label="Select all unplaced plants"
                        icon={<CheckSquare size={16} />}
                        onClick={selectAllPlantsInMainGrid}
                        disabled={mainGridPlantIds.length === 0}
                      />
                      <ToolIconButton
                        label="Select same species"
                        icon={<Layers size={16} />}
                        onClick={selectSameSpeciesInMainGrid}
                        disabled={sameSpeciesDisabled}
                      />
                      <ToolIconButton
                        label="Clear plant selection"
                        icon={<X size={16} />}
                        onClick={clearPlantSelection}
                        disabled={selectedPlantIds.size === 0}
                      />
                      <button
                        className={styles.buttonPrimary}
                        type="button"
                        disabled={placementLocked || !destinationTrayId || selectedInMainGrid.length === 0}
                        onClick={stageMovePlantsToTray}
                      >
                        <MoveRight size={16} />
                        Move selected
                      </button>
                    </div>
                  </div>
                </Tooltip.Provider>

                <div className={[styles.toolbarSummaryRow, "gt-row"].join(" ")}>
                  <span className={styles.mutedText}>Unplaced active plants: {mainGridPlantIds.length}</span>
                  <span className={styles.mutedText}>Selected in main grid: {selectedInMainGrid.length}</span>
                  {trays.length === 0 ? <span className={styles.badgeWarn}>Create at least one tray.</span> : null}
                </div>

                {diagnostics?.reason_counts ? (
                  <div className={styles.cardKeyValue}>
                    <span>Move diagnostics</span>
                    <strong>{Object.entries(diagnostics.reason_counts).map(([key, value]) => `${key}: ${value}`).join(" · ")}</strong>
                    {diagnostics.unplaceable_plants?.slice(0, 8).map((plant) => (
                      <span key={`${plant.plant_id}-${plant.reason}`}>{`${plant.plant_id || "(pending)"} · ${plant.species_name} · ${plant.reason}`}</span>
                    ))}
                  </div>
                ) : null}

                <div className={[styles.plantCellGrid, "gt-grid"].join(" ")} data-cell-size="sm">
                  {mainGridPlantIds.map((plantId) => renderPlantCell(plantId))}
                </div>
              </SectionCard>

              <SectionCard title="Tray Containers">
                <div className={[styles.trayManagerGrid, "gt-grid"].join(" ")} data-cell-size="lg">
                  {sortedTrayIds.map((trayId) => {
                    const tray = trayById.get(trayId);
                    if (!tray) {
                      return null;
                    }
                    const trayPlantIds = trayPlantIdsByTray[trayId] || [];
                    const selectedInTray = selectedInTrayByTrayId[trayId] || [];

                    return (
                      <article key={trayId} className={[styles.trayEditorCell, "gt-surface-2"].join(" ")}>
                        <div className={styles.trayHeaderRow}>
                          <div className={styles.trayHeaderMeta}>
                            <strong>{formatTrayDisplay(tray.name, tray.tray_id)}</strong>
                            <span className={styles.mutedText}>Occupancy: {draftPlantCountByTray[trayId] || 0}/{tray.capacity}</span>
                          </div>
                          <div className={styles.trayHeaderActions}>
                            {selectedInTray.length > 0 ? (
                              <ToolIconButton
                                label="Return selected plants to unplaced"
                                icon={<Trash2 size={16} />}
                                onClick={() => stageRemovePlantsFromTray(trayId)}
                                danger
                              />
                            ) : null}
                          </div>
                        </div>

                        <div className={[styles.plantCellGridTray, "gt-grid"].join(" ")} data-cell-size="sm">
                          {trayPlantIds.map((plantId) => renderPlantCell(plantId))}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </SectionCard>

              <StickyActionBar>
                <span className={styles.recipeLegendItem}>{placementDraftChangeCount} plant layout change(s)</span>
                <button
                  className={styles.buttonPrimary}
                  type="button"
                  disabled={saving || placementDraftChangeCount === 0}
                  onClick={() => void applyPlantToTrayLayout()}
                >
                  {saving ? "Applying..." : "Apply Plant -> Tray Layout"}
                </button>
                <button
                  className={styles.buttonSecondary}
                  type="button"
                  disabled={saving || placementDraftChangeCount === 0}
                  onClick={resetPlantDrafts}
                >
                  Discard drafts
                </button>
              </StickyActionBar>
            </div>
          ) : null}

          {currentStep === 4 ? (
            <div className={styles.stack}>
              <SectionCard title="Trays -> Slots (Draft)">
                <Tooltip.Provider delayDuration={150}>
                  <div className={[styles.placementToolbar, "gt-stack"].join(" ")}>
                    <select
                      className={styles.select}
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
                    </select>
                    <div className={[styles.toolbarActionsCompact, "gt-btnbar"].join(" ")}>
                      <ToolIconButton
                        label="Select all unplaced trays"
                        icon={<CheckSquare size={16} />}
                        onClick={selectAllTraysInMainGrid}
                        disabled={mainGridTrayIds.length === 0}
                      />
                      <ToolIconButton
                        label="Clear tray selection"
                        icon={<X size={16} />}
                        onClick={clearTraySelection}
                        disabled={selectedTrayIds.size === 0}
                      />
                      <button
                        className={styles.buttonPrimary}
                        type="button"
                        disabled={placementLocked || !destinationSlotId || selectedTrayIds.size === 0}
                        onClick={stageMoveTraysToSlots}
                      >
                        <ArrowRight size={16} />
                        Move selected
                      </button>
                    </div>
                  </div>
                </Tooltip.Provider>

                <div className={[styles.toolbarSummaryRow, "gt-row"].join(" ")}>
                  <span className={styles.mutedText}>Unplaced trays: {mainGridTrayIds.length}</span>
                  <span className={styles.mutedText}>Selected trays: {selectedTrayIds.size}</span>
                </div>

                <div className={[styles.trayMainGrid, "gt-grid"].join(" ")} data-cell-size="md">
                  {mainGridTrayIds.map((trayId) => renderTrayCell(trayId))}
                </div>
              </SectionCard>

              <SectionCard title="Tent Slot Containers">
                <div className={styles.tentBoardGrid}>
                  {tents.map((tent) => {
                    const selectedInTent = selectedTraysByTentId[tent.tent_id] || [];

                    return (
                      <article key={tent.tent_id} className={[styles.tentBoardCard, "gt-surface"].join(" ")}>
                        <div className={styles.trayHeaderRow}>
                          <div className={styles.trayHeaderMeta}>
                            <strong>{tent.name}</strong>
                            <span className={styles.mutedText}>{tent.code || ""}</span>
                          </div>
                          <div className={styles.trayHeaderActions}>
                            <span className={styles.recipeLegendItem}>{tent.slots.length} slot(s)</span>
                            {selectedInTent.length > 0 ? (
                              <ToolIconButton
                                label="Return selected trays to unplaced"
                                icon={<Trash2 size={16} />}
                                onClick={() => stageRemoveTraysFromTent(tent.tent_id)}
                                danger
                              />
                            ) : null}
                          </div>
                        </div>

                        <div className={styles.tentSlotGrid}>
                          {[...tent.slots]
                            .sort((left, right) => {
                              if (left.shelf_index !== right.shelf_index) {
                                return left.shelf_index - right.shelf_index;
                              }
                              if (left.slot_index !== right.slot_index) {
                                return left.slot_index - right.slot_index;
                              }
                              return left.slot_id.localeCompare(right.slot_id);
                            })
                            .map((slot) => {
                              const trayId = draftSlotToTray.get(slot.slot_id) || null;
                              return (
                                <div key={slot.slot_id} className={[styles.slotCell, "gt-cell gt-cell--muted"].join(" ")}>
                                  <span className={styles.slotCellLabel}>{slot.code}</span>
                                  {trayId ? (
                                    renderTrayCell(trayId, true)
                                  ) : (
                                    <button
                                      type="button"
                                      className={[
                                        styles.slotCellEmpty,
                                        destinationSlotId === slot.slot_id ? styles.slotCellEmptyActive : "",
                                      ]
                                        .filter(Boolean)
                                        .join(" ")}
                                      onClick={() => setDestinationSlotId(slot.slot_id)}
                                    >
                                      Empty
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          {tent.slots.length === 0 ? <span className={styles.mutedText}>No slots generated.</span> : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </SectionCard>

              <StickyActionBar>
                <span className={styles.recipeLegendItem}>{traySlotDraftChangeCount} tray/slot change(s)</span>
                <button
                  className={styles.buttonPrimary}
                  type="button"
                  disabled={saving || traySlotDraftChangeCount === 0}
                  onClick={() => void applyTrayToSlotLayout()}
                >
                  {saving ? "Applying..." : "Apply Tray -> Slot Layout"}
                </button>
                <button
                  className={styles.buttonSecondary}
                  type="button"
                  disabled={saving || traySlotDraftChangeCount === 0}
                  onClick={resetTraySlotDrafts}
                >
                  Discard drafts
                </button>
              </StickyActionBar>
            </div>
          ) : null}
        </div>

        <div
          className={[styles.stepNavRow, currentStep === 1 ? styles.stepNavRowForwardOnly : ""].filter(Boolean).join(" ")}
        >
          {currentStep > 1 ? (
            <button className={styles.buttonSecondary} type="button" onClick={goPreviousStep}>
              Back
            </button>
          ) : null}
          <button
            className={styles.buttonPrimary}
            type="button"
            disabled={!isStepComplete(currentStep)}
            onClick={goNextStep}
          >
            {currentStep === 4 ? "Go to Overview" : "Next"}
          </button>
        </div>
      </SectionCard>
    </PageShell>
  );
}
