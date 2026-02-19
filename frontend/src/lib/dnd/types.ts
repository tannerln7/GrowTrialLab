import type { DndEntityKind } from "./ids";

export interface DraggableMeta {
  kind: DndEntityKind;
  id: string;
  experimentId: string;
  tentId?: string;
  shelfId?: string;
  slotId?: string;
  trayId?: string;
  plantId?: string;
  index?: number;
}

export interface DroppableMeta {
  kind: DndEntityKind;
  id: string;
  experimentId: string;
  tentId?: string;
  shelfId?: string;
  slotId?: string;
  trayId?: string;
  accepts?: DndEntityKind[];
}
