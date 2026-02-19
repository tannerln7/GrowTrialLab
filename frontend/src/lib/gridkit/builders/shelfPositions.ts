import { buildDndId } from "@/src/lib/dnd";

import type {
  EmptySlotOccupantSpec,
  PositionSpec,
  TrayOccupantSpec,
  TrayStackOccupantSpec,
} from "../spec";

export type ShelfSlotPlacement = {
  slotId?: string | null;
  slotLabel?: string | null;
  slotMeta?: Record<string, unknown> | null;
  trays: TrayOccupantSpec[];
};

type BuildShelfSlotPositionsInput = {
  tentId: string;
  shelfId: string;
  shelfIndex: number;
  slotCount: number;
  trayBySlotIndex: ReadonlyMap<number, ShelfSlotPlacement>;
};

function normalizeSlotCount(slotCount: number): number {
  if (!Number.isFinite(slotCount)) {
    return 0;
  }
  return Math.max(0, Math.trunc(slotCount));
}

function resolveSlotId(
  input: BuildShelfSlotPositionsInput,
  positionIndex: number,
  slotPlacement?: ShelfSlotPlacement,
): string {
  const slotId = slotPlacement?.slotId;
  if (typeof slotId === "string" && slotId.trim().length > 0) {
    return slotId;
  }
  return buildDndId("slot", input.tentId, input.shelfIndex, positionIndex);
}

function buildOccupant(
  input: BuildShelfSlotPositionsInput,
  positionIndex: number,
  slotPlacement: ShelfSlotPlacement | undefined,
  resolvedSlotId: string,
) {
  if (!slotPlacement || slotPlacement.trays.length === 0) {
    return {
      kind: "emptySlot",
      id: resolvedSlotId,
      slotIndex: positionIndex,
      label: slotPlacement?.slotLabel || `Slot ${positionIndex}`,
      dnd: {
        droppableId: buildDndId("slot", input.tentId, input.shelfIndex, positionIndex),
        meta: {
          tent_id: input.tentId,
        },
      },
    } satisfies EmptySlotOccupantSpec;
  }

  if (slotPlacement.trays.length === 1) {
    return slotPlacement.trays[0];
  }

  return {
    kind: "trayStack",
    id: resolvedSlotId,
    trays: slotPlacement.trays,
  } satisfies TrayStackOccupantSpec;
}

export function buildShelfSlotPositions(
  input: BuildShelfSlotPositionsInput,
): PositionSpec[] {
  const slotCount = normalizeSlotCount(input.slotCount);
  return Array.from({ length: slotCount }, (_, index) => {
    const positionIndex = index + 1;
    const slotPlacement = input.trayBySlotIndex.get(positionIndex);
    const resolvedSlotId = resolveSlotId(input, positionIndex, slotPlacement);
    const droppableId = buildDndId("slot", input.tentId, input.shelfIndex, positionIndex);

    return {
      id: resolvedSlotId,
      key: resolvedSlotId,
      tentId: input.tentId,
      shelfId: input.shelfId,
      positionIndex,
      label: slotPlacement?.slotLabel || `Slot ${positionIndex}`,
      occupant: buildOccupant(input, positionIndex, slotPlacement, resolvedSlotId),
      dnd: {
        droppableId,
      },
      meta: {
        slot: slotPlacement?.slotMeta || null,
      },
    };
  });
}
