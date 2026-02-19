import { buildDndId } from "@/src/lib/dnd";

import type { TentSummary } from "@/src/features/placement/types";
import type { SlotDefOccupantSpec, TentLayoutSpec } from "../spec";

export type PlacementStep1TentDraftInput = {
  tent: TentSummary;
  draftShelfCounts: number[];
};

type PreviewSlot = {
  slot_id: string;
  code: string;
  label: string;
  shelf_index: number;
  slot_index: number;
  isDraft: boolean;
};

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

function buildPreviewSlotsByShelf(
  tent: TentSummary,
  draftShelfCounts: number[],
): Array<{
  shelfIndex: number;
  slots: PreviewSlot[];
  isNewShelf: boolean;
  removedSlotsInShelf: boolean;
  persistedCount: number;
}> {
  const sortedTentSlots = [...tent.slots].sort((left, right) => {
    if (left.shelf_index !== right.shelf_index) {
      return left.shelf_index - right.shelf_index;
    }
    if (left.slot_index !== right.slot_index) {
      return left.slot_index - right.slot_index;
    }
    return left.slot_id.localeCompare(right.slot_id);
  });

  const slotsByShelf = new Map<number, PreviewSlot[]>();
  for (const slot of sortedTentSlots) {
    const shelfSlots = slotsByShelf.get(slot.shelf_index);
    const nextSlot: PreviewSlot = {
      slot_id: slot.slot_id,
      code: slot.code,
      label: slot.label,
      shelf_index: slot.shelf_index,
      slot_index: slot.slot_index,
      isDraft: false,
    };
    if (shelfSlots) {
      shelfSlots.push(nextSlot);
    } else {
      slotsByShelf.set(slot.shelf_index, [nextSlot]);
    }
  }

  const persistedShelfCounts = buildPersistedShelfCounts(tent);

  return draftShelfCounts.map((draftSlotCount, index) => {
    const shelfIndex = index + 1;
    const persistedSlots = (slotsByShelf.get(shelfIndex) || []).map((slot) => ({ ...slot, isDraft: false }));
    const usePersistedShelfPreview = tent.slots.length > 0 && draftSlotCount === persistedSlots.length;

    if (usePersistedShelfPreview) {
      const persistedCount = persistedShelfCounts[shelfIndex - 1] || 0;
      return {
        shelfIndex,
        slots: persistedSlots,
        isNewShelf: shelfIndex > persistedShelfCounts.length,
        removedSlotsInShelf: false,
        persistedCount,
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
        isDraft: true,
      });
    }

    const persistedCount = persistedShelfCounts[shelfIndex - 1] || 0;
    const isNewShelf = shelfIndex > persistedShelfCounts.length;

    return {
      shelfIndex,
      slots: previewSlots,
      isNewShelf,
      removedSlotsInShelf: !isNewShelf && previewSlots.length < persistedCount,
      persistedCount,
    };
  });
}

export function buildTentLayoutSpecFromPlacementStep1(input: {
  tents: ReadonlyArray<PlacementStep1TentDraftInput>;
}): TentLayoutSpec {
  const tents = input.tents.map(({ tent, draftShelfCounts }) => {
    const shelfSpecs = buildPreviewSlotsByShelf(tent, draftShelfCounts).map((shelfGroup) => {
      const shelfId = buildDndId("shelf", tent.tent_id, shelfGroup.shelfIndex);
      return {
        shelfId,
        label: `Shelf ${shelfGroup.shelfIndex}`,
        positions: shelfGroup.slots.map((slot) => {
          const positionId = slot.slot_id;
          const isAddedSlot =
            !shelfGroup.isNewShelf && slot.isDraft && slot.slot_index > shelfGroup.persistedCount;
          const occupant: SlotDefOccupantSpec = {
            kind: "slotDef",
            id: positionId,
            slotId: slot.slot_id,
            slotIndex: slot.slot_index,
            code: slot.code,
            label: slot.label,
            isDraft: slot.isDraft,
            dnd: {
              droppableId: buildDndId("slot", tent.tent_id, shelfGroup.shelfIndex, slot.slot_index),
            },
          };

          return {
            id: positionId,
            key: positionId,
            tentId: tent.tent_id,
            shelfId,
            positionIndex: slot.slot_index,
            label: slot.code,
            occupant,
            state: isAddedSlot ? { tone: "warn" as const } : undefined,
            dnd: {
              droppableId: buildDndId("slot", tent.tent_id, shelfGroup.shelfIndex, slot.slot_index),
            },
            meta: {
              isAddedSlot,
              shelfIndex: shelfGroup.shelfIndex,
              persistedCount: shelfGroup.persistedCount,
            },
          };
        }),
        meta: {
          shelfIndex: shelfGroup.shelfIndex,
          isNewShelf: shelfGroup.isNewShelf,
          removedSlotsInShelf: shelfGroup.removedSlotsInShelf,
          persistedCount: shelfGroup.persistedCount,
        },
      };
    });

    return {
      tentId: tent.tent_id,
      label: tent.name || tent.code || "Tent",
      shelves: shelfSpecs,
      meta: {
        tentCode: tent.code,
      },
    };
  });

  return { tents };
}
