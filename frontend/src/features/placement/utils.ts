import { setHasAll, setWithAll } from "@/src/lib/collections/sets";
import { formatTrayDisplay } from "@/src/lib/format/labels";
import { buildChangeset } from "@/src/lib/state/drafts";

import type {
  PlantCell,
  PersistedTrayPlantRow,
  SlotSummary,
  TentDraft,
  TentSummary,
  Tray,
  TrayPlant,
  UnplacedPlant,
} from "./types";

export type PreviewSlot = SlotSummary & { isDraft?: boolean };

export type ShelfPreviewGroup = {
  shelfIndex: number;
  slots: PreviewSlot[];
  isNewShelf: boolean;
  removedSlotsInShelf: boolean;
};

export type TentDraftMeta = {
  draftName: string;
  draftCode: string;
  tentNameDirty: boolean;
  tentCodeDirty: boolean;
  restrictionsDirty: boolean;
  persistedAllowedSpeciesIds: string[];
  draftAllowedSpeciesIds: string[];
  draftShelfCounts: number[];
  persistedShelfCounts: number[];
  layoutDirty: boolean;
  shelvesRemoved: boolean;
  detailDirty: boolean;
};

export type SortedSlot = {
  slot_id: string;
  label: string;
  shelf_index: number;
  slot_index: number;
  tent_id: string;
};

export type StepCompletionState = {
  step1Complete: boolean;
  step1ReadyForNext: boolean;
  step2Complete: boolean;
  step2ReadyForNext: boolean;
  step3Complete: boolean;
  step4Complete: boolean;
};

export type DraftChangeCounts = {
  step1DraftChangeCount: number;
  step2DraftChangeCount: number;
  placementDraftChangeCount: number;
  traySlotDraftChangeCount: number;
};

export function isActivePlant(status: string): boolean {
  return status.toLowerCase() === "active";
}

export function normalizePlant(plant: UnplacedPlant | TrayPlant): PlantCell {
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

export function buildDefaultShelves(tent: TentSummary): number[] {
  if (tent.layout?.schema_version === 1 && Array.isArray(tent.layout.shelves)) {
    const counts = tent.layout.shelves.map((shelf) => Math.max(0, shelf.tray_count));
    if (counts.length > 0) {
      return counts;
    }
  }
  return [4];
}

export function buildPersistedShelfCounts(tent: TentSummary): number[] {
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

export function areShelfCountsEqual(left: number[], right: number[]): boolean {
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

export function areStringSetsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const leftSet = setWithAll(left);
  if (leftSet.size !== right.length) {
    return false;
  }
  return setHasAll(leftSet, right);
}

export function parseStep(rawStep: string | null): number {
  const parsed = Number.parseInt(rawStep || "1", 10);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.min(4, Math.max(1, parsed));
}

export { formatTrayDisplay };

export function formatDraftChipLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

export function getTentDraftMeta(
  tent: TentSummary,
  shelfCountsByTent: Record<string, number[]>,
  tentAllowedSpeciesDraftById: Record<string, string[]>,
  tentDraftById: Record<string, TentDraft>,
): TentDraftMeta {
  const draft = tentDraftById[tent.tent_id] || {
    name: tent.name,
    code: tent.code,
  };
  const draftName = draft.name.trim();
  const draftCode = draft.code.trim();
  const tentNameDirty = draftName !== tent.name;
  const tentCodeDirty = draftCode !== tent.code;
  const persistedAllowedSpeciesIds = tent.allowed_species.map((item) => item.id);
  const draftAllowedSpeciesIds =
    tentAllowedSpeciesDraftById[tent.tent_id] || persistedAllowedSpeciesIds;
  const restrictionsDirty = !areStringSetsEqual(
    draftAllowedSpeciesIds,
    persistedAllowedSpeciesIds,
  );
  const draftShelfCounts = (
    shelfCountsByTent[tent.tent_id] || buildDefaultShelves(tent)
  ).map((value) => Math.max(0, value));
  const persistedShelfCounts = buildPersistedShelfCounts(tent);
  const layoutDirty =
    tent.slots.length === 0 || !areShelfCountsEqual(draftShelfCounts, persistedShelfCounts);
  const shelvesRemoved = draftShelfCounts.length < persistedShelfCounts.length;

  return {
    draftName,
    draftCode,
    tentNameDirty,
    tentCodeDirty,
    restrictionsDirty,
    persistedAllowedSpeciesIds,
    draftAllowedSpeciesIds,
    draftShelfCounts,
    persistedShelfCounts,
    layoutDirty,
    shelvesRemoved,
    detailDirty: tentNameDirty || tentCodeDirty || restrictionsDirty,
  };
}

export function buildStep1ShelfPreviewGroups(
  tent: TentSummary,
  draftShelfCounts: number[],
): ShelfPreviewGroup[] {
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

  const persistedShelfCounts = buildPersistedShelfCounts(tent);

  return draftShelfCounts.map((draftSlotCount, index) => {
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
        isNewShelf: shelfIndex > persistedShelfCounts.length,
        removedSlotsInShelf: false,
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

    const persistedCount = persistedShelfCounts[shelfIndex - 1] || 0;
    const isNewShelf = shelfIndex > persistedShelfCounts.length;
    const removedSlotsInShelf = !isNewShelf && previewSlots.length < persistedCount;

    return {
      shelfIndex,
      slots: previewSlots,
      isNewShelf,
      removedSlotsInShelf,
    };
  });
}

export function buildPlantDraftStats(
  sortedPlantIds: string[],
  persistedPlantToTray: Record<string, string | null>,
  draftPlantToTray: Record<string, string | null>,
): { changeCount: number; dirtyContainerTrayIds: Set<string> } {
  const changes = buildChangeset<string | null>(sortedPlantIds, persistedPlantToTray, draftPlantToTray, { fallback: null });
  const dirtyContainerTrayIds = new Set<string>();
  for (const change of changes) {
    if (change.persistedValue) {
      dirtyContainerTrayIds.add(change.persistedValue);
    }
    if (change.draftValue) {
      dirtyContainerTrayIds.add(change.draftValue);
    }
  }
  return { changeCount: changes.length, dirtyContainerTrayIds };
}

export function buildTraySlotDraftStats(
  sortedTrayIds: string[],
  persistedTrayToSlot: Record<string, string | null>,
  draftTrayToSlot: Record<string, string | null>,
): { changeCount: number; dirtySlotIds: Set<string> } {
  const changes = buildChangeset<string | null>(sortedTrayIds, persistedTrayToSlot, draftTrayToSlot, { fallback: null });
  const dirtySlotIds = new Set<string>();
  for (const change of changes) {
    if (change.persistedValue) {
      dirtySlotIds.add(change.persistedValue);
    }
    if (change.draftValue) {
      dirtySlotIds.add(change.draftValue);
    }
  }
  return { changeCount: changes.length, dirtySlotIds };
}

export function buildTrayCapacityDraftStats(
  trays: Tray[],
  trayCapacityDraftById: Record<string, number>,
): { changeCount: number; dirtyTrayCapacityIds: Set<string> } {
  let changeCount = 0;
  const dirtyTrayCapacityIds = new Set<string>();
  for (const tray of trays) {
    const draftCapacity = trayCapacityDraftById[tray.tray_id] ?? tray.capacity;
    if (draftCapacity !== tray.capacity) {
      changeCount += 1;
      dirtyTrayCapacityIds.add(tray.tray_id);
    }
  }
  return { changeCount, dirtyTrayCapacityIds };
}

export function buildSortedSlots(tents: TentSummary[]): SortedSlot[] {
  const tentLabelById = new Map(
    tents.map((tent) => [tent.tent_id, tent.code || tent.name] as const),
  );
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
      const leftTentLabel = tentLabelById.get(left.tent_id) || "";
      const rightTentLabel = tentLabelById.get(right.tent_id) || "";
      if (leftTentLabel !== rightTentLabel) {
        return leftTentLabel.localeCompare(rightTentLabel);
      }
      if (left.shelf_index !== right.shelf_index) {
        return left.shelf_index - right.shelf_index;
      }
      return left.slot_index - right.slot_index;
    });
}

export function groupSlotsByShelf(tent: TentSummary): Map<number, SlotSummary[]> {
  return [...tent.slots]
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
}

export function buildPersistedPlacementState(
  unplacedPlants: UnplacedPlant[],
  trays: Tray[],
): {
  persistedPlantToTray: Record<string, string | null>;
  persistedTrayPlantRowByPlantId: Record<string, PersistedTrayPlantRow>;
  persistedTrayToSlot: Record<string, string | null>;
} {
  const persistedPlantToTray: Record<string, string | null> = {};
  const persistedTrayPlantRowByPlantId: Record<string, PersistedTrayPlantRow> = {};
  const persistedTrayToSlot: Record<string, string | null> = {};

  for (const plant of unplacedPlants) {
    if (isActivePlant(plant.status)) {
      persistedPlantToTray[plant.uuid] = null;
    }
  }

  for (const tray of trays) {
    persistedTrayToSlot[tray.tray_id] = tray.location.slot?.id || null;
    for (const plant of tray.plants) {
      if (!isActivePlant(plant.status)) {
        continue;
      }
      persistedPlantToTray[plant.uuid] = tray.tray_id;
      persistedTrayPlantRowByPlantId[plant.uuid] = {
        trayId: tray.tray_id,
        trayPlantId: plant.tray_plant_id,
      };
    }
  }

  return {
    persistedPlantToTray,
    persistedTrayPlantRowByPlantId,
    persistedTrayToSlot,
  };
}

export function draftChangeCountForStep(step: number, counts: DraftChangeCounts): number {
  if (step === 1) {
    return counts.step1DraftChangeCount;
  }
  if (step === 2) {
    return counts.step2DraftChangeCount;
  }
  if (step === 3) {
    return counts.placementDraftChangeCount;
  }
  return counts.traySlotDraftChangeCount;
}

export function draftChipLabelForStep(step: number, count: number): string {
  if (step === 1) {
    return formatDraftChipLabel(count, "step 1 change");
  }
  if (step === 2) {
    return formatDraftChipLabel(count, "tray change");
  }
  if (step === 3) {
    return formatDraftChipLabel(count, "plant layout change");
  }
  return formatDraftChipLabel(count, "tray/slot change");
}

export function stepBlockedMessage(step: number, state: StepCompletionState): string {
  if (step === 1 && !state.step1ReadyForNext) {
    return "Add at least one tent and ensure each tent has at least one slot before continuing.";
  }
  if (step === 2 && !state.step2ReadyForNext) {
    return "Add at least one tray with capacity before continuing.";
  }
  if (step === 3 && !state.step3Complete) {
    return "Place all active plants into trays before continuing.";
  }
  if (step === 4 && !state.step4Complete) {
    return "Place all trays into tent slots before continuing.";
  }
  return "";
}

export function isStepComplete(step: number, state: StepCompletionState): boolean {
  if (step === 1) {
    return state.step1Complete;
  }
  if (step === 2) {
    return state.step2Complete;
  }
  if (step === 3) {
    return state.step3Complete;
  }
  return state.step4Complete;
}

export function isStepReadyForNext(step: number, state: StepCompletionState): boolean {
  if (step === 1) {
    return state.step1ReadyForNext;
  }
  if (step === 2) {
    return state.step2ReadyForNext;
  }
  return isStepComplete(step, state);
}

export function nextButtonLabel(
  saving: boolean,
  currentStep: number,
  currentStepDraftChangeCount: number,
): string {
  if (saving) {
    return "Saving...";
  }
  if (currentStepDraftChangeCount > 0) {
    return "Save & Next";
  }
  return currentStep === 4 ? "Go to Overview" : "Next";
}
