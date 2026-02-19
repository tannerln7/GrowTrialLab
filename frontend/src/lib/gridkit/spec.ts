export type Id = string;

export type CellTone = "default" | "warn" | "error" | "info";

export type CellState = {
  selected?: boolean;
  disabled?: boolean;
  locked?: boolean;
  tone?: CellTone;
};

export type ChipTone =
  | "default"
  | "muted"
  | "warn"
  | "error"
  | "success"
  | "info";

export type ChipPlacement = "tl" | "tr" | "bl" | "br" | "top" | "bottom";

export type ChipSpec = {
  id: Id;
  label: string;
  tone?: ChipTone;
  placement: ChipPlacement;
};

export type DndSpec = {
  draggableId?: Id;
  droppableId?: Id;
  meta?: Record<string, unknown>;
};

export type OccupantKind =
  | "tray"
  | "trayStack"
  | "emptySlot"
  | "slotDef"
  | "plant";

type OccupantBase = {
  kind: OccupantKind;
  id: Id;
  chips?: ChipSpec[];
  state?: CellState;
  dnd?: DndSpec;
  meta?: Record<string, unknown>;
};

export type PlantOccupantSpec = OccupantBase & {
  kind: "plant";
  plantId: string;
  title: string;
  subtitle?: string;
  status?: string;
  grade?: string | null;
  recipeCode?: string | null;
  linkHref?: string;
};

export type TrayOccupantSpec = OccupantBase & {
  kind: "tray";
  trayId: string;
  title: string;
  summaryLines: string[];
  currentCount?: number | null;
  capacity?: number | null;
  plants?: PlantOccupantSpec[];
};

export type TrayStackOccupantSpec = OccupantBase & {
  kind: "trayStack";
  trays: TrayOccupantSpec[];
};

export type EmptySlotOccupantSpec = OccupantBase & {
  kind: "emptySlot";
  slotIndex: number;
  label?: string;
};

export type SlotDefOccupantSpec = OccupantBase & {
  kind: "slotDef";
  slotIndex: number;
  slotId: string;
  code: string;
  label?: string;
  isDraft?: boolean;
};

export type OccupantSpec =
  | TrayOccupantSpec
  | TrayStackOccupantSpec
  | EmptySlotOccupantSpec
  | SlotDefOccupantSpec
  | PlantOccupantSpec;

export type PositionSpec = {
  id: Id;
  key: Id;
  tentId: Id;
  shelfId: Id;
  positionIndex: number;
  occupant: OccupantSpec;
  label?: string;
  chips?: ChipSpec[];
  state?: CellState;
  dnd?: DndSpec;
  meta?: Record<string, unknown>;
};

export type ShelfSpec = {
  shelfId: Id;
  label: string;
  positions: PositionSpec[];
  chips?: ChipSpec[];
  state?: CellState;
  dnd?: DndSpec;
  meta?: Record<string, unknown>;
};

export type TentSpec = {
  tentId: Id;
  label: string;
  shelves: ShelfSpec[];
  chips?: ChipSpec[];
  state?: CellState;
  dnd?: DndSpec;
  meta?: Record<string, unknown>;
};

export type TentLayoutSpec = {
  tents: TentSpec[];
  meta?: Record<string, unknown>;
};

export type GridKitSpec = TentLayoutSpec;
