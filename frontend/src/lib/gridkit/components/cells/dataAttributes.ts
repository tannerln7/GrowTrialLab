import { getDndDataAttributes } from "@/src/lib/dnd";
import type { DndSpec, PositionSpec } from "@/src/lib/gridkit/spec";

export type GridCellKind = "slot" | "tray" | "plant" | "position";

type GridCellDataInput = {
  cellKind: GridCellKind;
  position?: Pick<PositionSpec, "id" | "tentId" | "shelfId" | "positionIndex">;
  dnd?: DndSpec;
};

export function getGridCellDataAttributes({
  cellKind,
  position,
  dnd,
}: GridCellDataInput): Record<string, string | number | undefined> {
  return {
    "data-cell-kind": cellKind,
    "data-pos-id": position?.id,
    "data-tent-id": position?.tentId,
    "data-shelf-id": position?.shelfId,
    "data-position-index": position?.positionIndex,
    ...getDndDataAttributes(dnd),
  };
}
