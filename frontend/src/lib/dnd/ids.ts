export type DndEntityKind = "tent" | "shelf" | "slot" | "tray" | "plant";

export function buildDndId(
  kind: DndEntityKind,
  ...parts: Array<string | number>
): string {
  return [kind, ...parts].map((part) => String(part)).join(":");
}

export const dndId = {
  tent: (experimentId: string, tentId: string | number) =>
    buildDndId("tent", experimentId, tentId),
  shelf: (
    experimentId: string,
    tentId: string | number,
    shelfId: string | number,
  ) => buildDndId("shelf", experimentId, tentId, shelfId),
  slot: (
    experimentId: string,
    tentId: string | number,
    shelfId: string | number,
    slotId: string | number,
  ) => buildDndId("slot", experimentId, tentId, shelfId, slotId),
  tray: (experimentId: string, trayId: string | number) =>
    buildDndId("tray", experimentId, trayId),
  plant: (experimentId: string, plantId: string | number) =>
    buildDndId("plant", experimentId, plantId),
} as const;
