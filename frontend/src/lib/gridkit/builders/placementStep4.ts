import { buildDndId } from "@/src/lib/dnd";

import type { TentSummary } from "@/src/features/placement/types";
import type { EmptySlotOccupantSpec, TentLayoutSpec, TrayOccupantSpec } from "../spec";

function sortTentSlots(tent: TentSummary): TentSummary["slots"] {
  return [...tent.slots].sort((left, right) => {
    if (left.shelf_index !== right.shelf_index) {
      return left.shelf_index - right.shelf_index;
    }
    if (left.slot_index !== right.slot_index) {
      return left.slot_index - right.slot_index;
    }
    return left.slot_id.localeCompare(right.slot_id);
  });
}

export function buildTentLayoutSpecFromPlacementStep4(input: {
  tents: ReadonlyArray<TentSummary>;
  draftSlotToTray: ReadonlyMap<string, string>;
  destinationSlotId: string;
  dirtySlotIds: ReadonlySet<string>;
  selectedTraysByTentId: Readonly<Record<string, string[]>>;
}): TentLayoutSpec {
  const tents = input.tents.map((tent) => {
    const slotsByShelf = sortTentSlots(tent).reduce<Map<number, TentSummary["slots"]>>((map, slot) => {
      const shelfSlots = map.get(slot.shelf_index);
      if (shelfSlots) {
        shelfSlots.push(slot);
      } else {
        map.set(slot.shelf_index, [slot]);
      }
      return map;
    }, new Map<number, TentSummary["slots"]>());

    const selectedTrayIds = input.selectedTraysByTentId[tent.tent_id] || [];

    const shelves = Array.from(slotsByShelf.entries()).map(([shelfIndex, shelfSlots]) => {
      const shelfId = buildDndId("shelf", tent.tent_id, shelfIndex);
      return {
        shelfId,
        label: `Shelf ${shelfIndex}`,
        positions: shelfSlots.map((slot) => {
          const trayId = input.draftSlotToTray.get(slot.slot_id) || null;
          const slotSelected = input.destinationSlotId === slot.slot_id;
          const dirty = input.dirtySlotIds.has(slot.slot_id);
          const baseDndId = buildDndId("slot", tent.tent_id, shelfIndex, slot.slot_index);

          return {
            id: slot.slot_id,
            key: slot.slot_id,
            tentId: tent.tent_id,
            shelfId,
            positionIndex: slot.slot_index,
            label: slot.code,
            occupant: trayId
              ? ({
                  kind: "tray",
                  id: trayId,
                  trayId,
                  title: trayId,
                  summaryLines: [],
                  dnd: {
                    draggableId: buildDndId("tray", trayId),
                    droppableId: baseDndId,
                    meta: {
                      slot_id: slot.slot_id,
                    },
                  },
                } satisfies TrayOccupantSpec)
              : ({
                  kind: "emptySlot",
                  id: slot.slot_id,
                  slotIndex: slot.slot_index,
                  label: slot.code,
                  dnd: {
                    droppableId: baseDndId,
                  },
                } satisfies EmptySlotOccupantSpec),
            state: {
              selected: slotSelected || undefined,
              tone: dirty ? ("warn" as const) : ("default" as const),
            },
            dnd: {
              droppableId: baseDndId,
              meta: {
                tent_id: tent.tent_id,
              },
            },
            meta: {
              slotCode: slot.code,
              dirty,
              slotSelected,
            },
          };
        }),
        dnd: {
          droppableId: shelfId,
        },
      };
    });

    return {
      tentId: tent.tent_id,
      label: tent.name,
      shelves,
      dnd: {
        droppableId: buildDndId("tent", tent.tent_id),
      },
      meta: {
        selectedTrayIds,
        slotCount: tent.slots.length,
      },
    };
  });

  return { tents };
}
