export type Species = { id: string; name: string; category: string };

export type SlotSummary = {
  slot_id: string;
  code: string;
  label: string;
  shelf_index: number;
  slot_index: number;
  tray_count: number;
};

export type TentSummary = {
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

export type Location = {
  status: "placed" | "unplaced";
  tent: { id: string; code: string | null; name: string } | null;
  slot: {
    id: string;
    code: string;
    label: string;
    shelf_index: number;
    slot_index: number;
  } | null;
  tray: {
    id: string;
    code: string;
    name: string;
    capacity: number;
    current_count: number;
  } | null;
};

export type RecipeSummary = {
  id: string;
  code: string;
  name: string;
};

export type TrayPlant = {
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

export type Tray = {
  tray_id: string;
  name: string;
  capacity: number;
  current_count: number;
  location: Location;
  plants: TrayPlant[];
};

export type UnplacedPlant = {
  uuid: string;
  plant_id: string;
  species_id: string;
  species_name: string;
  species_category: string;
  grade: string | null;
  status: string;
  assigned_recipe: RecipeSummary | null;
};

export type PlacementSummary = {
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

export type Diagnostics = {
  reason_counts?: Record<string, number>;
  unplaceable_plants?: Array<{
    plant_id: string;
    species_name: string;
    reason: string;
  }>;
};

export type PlantCell = {
  uuid: string;
  plant_id: string;
  species_id: string;
  species_name: string;
  species_category: string;
  grade: string | null;
  status: string;
  assigned_recipe: RecipeSummary | null;
};

export type TrayCell = {
  tray_id: string;
  name: string;
  capacity: number;
  current_count: number;
};

export type PersistedTrayPlantRow = {
  trayId: string;
  trayPlantId: string;
};

export type TentDraft = {
  name: string;
  code: string;
};

export const RUNNING_LOCK_MESSAGE =
  "Placement cannot be edited while the experiment is running. Stop the experiment to change placement.";

export const STEPS = [
  { id: 1, title: "Tents + Slots" },
  { id: 2, title: "Trays + Capacity" },
  { id: 3, title: "Plants -> Trays" },
  { id: 4, title: "Trays -> Slots" },
] as const;
