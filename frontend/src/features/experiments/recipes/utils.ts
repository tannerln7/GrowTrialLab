import { formatRecipeLabel } from "@/src/lib/format/labels";

type PlantLike = {
  uuid: string;
  plant_id: string;
  status: string;
};

type PlacementLike<TPlant extends PlantLike> = {
  trays: {
    results: Array<{ plants: TPlant[] }>;
  };
  unplaced_plants: {
    results: TPlant[];
  };
};

type PlantWithRecipe<TRecipe extends { id: string } | null> = PlantLike & {
  assigned_recipe: TRecipe;
};

export function isActivePlant(status: string): boolean {
  return status.toLowerCase() === "active";
}

export function sortPlantsById<TPlant extends Pick<PlantLike, "plant_id" | "uuid">>(
  left: TPlant,
  right: TPlant,
): number {
  const leftCode = left.plant_id || "";
  const rightCode = right.plant_id || "";
  if (leftCode !== rightCode) {
    return leftCode.localeCompare(rightCode);
  }
  return left.uuid.localeCompare(right.uuid);
}

export function recipeLabel(recipe: { code: string; name: string }): string {
  return formatRecipeLabel(recipe);
}

export function buildPersistedRecipeMap<TPlant extends PlantWithRecipe<{ id: string } | null>>(
  placement: PlacementLike<TPlant>,
): Record<string, string | null> {
  const nextPersisted: Record<string, string | null> = {};
  for (const tray of placement.trays.results) {
    for (const plant of tray.plants) {
      if (isActivePlant(plant.status)) {
        nextPersisted[plant.uuid] = plant.assigned_recipe?.id || null;
      }
    }
  }
  for (const plant of placement.unplaced_plants.results) {
    if (isActivePlant(plant.status)) {
      nextPersisted[plant.uuid] = plant.assigned_recipe?.id || null;
    }
  }
  return nextPersisted;
}
