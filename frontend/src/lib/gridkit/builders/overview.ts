import { buildDndId } from "@/src/lib/dnd";

import { buildShelfSlotPositions, type ShelfSlotPlacement } from "./shelfPositions";
import type {
  PlantOccupantSpec,
  TentLayoutSpec,
  TrayOccupantSpec,
} from "../spec";

type LocationNode = {
  id: string;
  code?: string | null;
  name?: string | null;
  label?: string | null;
};

type OverviewSlotNode = LocationNode & {
  shelf_index?: number | null;
  slot_index?: number | null;
};

type OverviewTrayNode = LocationNode & {
  capacity?: number | null;
  current_count?: number | null;
};

export type OverviewBuilderPlant = {
  uuid: string;
  plant_id: string;
  species_name: string;
  cultivar: string | null;
  status: string;
  grade: string | null;
  assigned_recipe: { id: string; code: string; name: string } | null;
  location: {
    status: "placed" | "unplaced";
    tent: LocationNode | null;
    slot: OverviewSlotNode | null;
    tray: OverviewTrayNode | null;
  };
};

export type OverviewLayoutSpine = {
  tents: Array<{
    id: string;
    name?: string | null;
    shelves: Array<{
      shelfIndex: number;
      slotCount: number;
    }>;
  }>;
};

export type OverviewTrayPlacement = {
  trayId: string;
  tentId: string;
  shelfIndex: number;
  slotIndex: number;
  slot?: LocationNode | null;
  tray?: OverviewTrayNode | null;
};

type LayoutTentSpine = {
  tent: LocationNode;
  shelfSlotCountByIndex: Map<number, number>;
};

type TrayAccumulator = {
  trayId: string;
  tentId: string;
  shelfIndex: number;
  slotIndex: number;
  slot: LocationNode | null;
  tray: OverviewTrayNode | null;
  plants: OverviewBuilderPlant[];
};

function normalizeGridIndex(value: number | null | undefined): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  const normalized = Math.trunc(value as number);
  return normalized < 1 ? null : normalized;
}

function normalizeNonNegativeInt(value: number | null | undefined): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  const normalized = Math.trunc(value as number);
  return normalized < 0 ? 0 : normalized;
}

function locationLabel(node: LocationNode | null, fallback: string): string {
  return node?.code || node?.name || node?.label || fallback;
}

function formatTrayHeading(node: LocationNode | null): string {
  const raw = (node?.code || node?.name || node?.label || "").trim();
  if (!raw) {
    return "Tray";
  }

  const strictMatch = raw.match(/^(?:tray|tr|t)?[\s_-]*0*([0-9]+)$/i);
  const looseMatch = strictMatch || raw.match(/([0-9]+)/);
  if (!looseMatch) {
    return "Tray";
  }

  const trayNumber = Number.parseInt(looseMatch[1], 10);
  return Number.isFinite(trayNumber) ? `Tray ${trayNumber}` : "Tray";
}

function buildOverviewPlantSpec(plant: OverviewBuilderPlant): PlantOccupantSpec {
  const speciesLine = plant.cultivar
    ? `${plant.species_name} · ${plant.cultivar}`
    : plant.species_name;

  return {
    kind: "plant",
    id: plant.uuid,
    plantId: plant.uuid,
    title: plant.plant_id || "(pending)",
    subtitle: speciesLine,
    status: plant.status,
    grade: plant.grade,
    recipeCode: plant.assigned_recipe?.code || null,
    dnd: {
      draggableId: buildDndId("plant", plant.uuid),
      meta: {
        plant_id: plant.plant_id,
      },
    },
    meta: {
      raw: plant,
    },
  };
}

function ensureLayoutTent(
  tentSpineById: Map<string, LayoutTentSpine>,
  tentId: string,
  tentName: string | null | undefined,
): LayoutTentSpine {
  if (!tentSpineById.has(tentId)) {
    tentSpineById.set(tentId, {
      tent: {
        id: tentId,
        name: tentName || null,
      },
      shelfSlotCountByIndex: new Map(),
    });
  }
  const existing = tentSpineById.get(tentId);
  if (!existing) {
    return {
      tent: {
        id: tentId,
        name: tentName || null,
      },
      shelfSlotCountByIndex: new Map(),
    };
  }

  if ((!existing.tent.name || !existing.tent.name.trim()) && tentName?.trim()) {
    existing.tent.name = tentName;
  }

  return existing;
}

function traySortLabel(tray: TrayOccupantSpec): string {
  const trayNode = (
    tray.meta as { tray?: { code?: string | null; name?: string | null } } | undefined
  )?.tray;
  return (trayNode?.code || trayNode?.name || tray.title || "").toLowerCase();
}

function buildTrayOccupantSpec(trayAccumulator: TrayAccumulator): TrayOccupantSpec {
  const sortedPlants = [...trayAccumulator.plants].sort((left, right) =>
    (left.plant_id || "").localeCompare(right.plant_id || ""),
  );
  const plantSpecs = sortedPlants.map((plant) => buildOverviewPlantSpec(plant));
  const summaryLines: string[] = [];

  if (
    trayAccumulator.tray?.current_count != null &&
    trayAccumulator.tray.capacity != null
  ) {
    summaryLines.push(
      `${trayAccumulator.tray.current_count}/${trayAccumulator.tray.capacity}`,
    );
  }
  summaryLines.push(`${plantSpecs.length} plant${plantSpecs.length === 1 ? "" : "s"}`);

  return {
    kind: "tray",
    id: trayAccumulator.trayId,
    trayId: trayAccumulator.trayId,
    title: formatTrayHeading(trayAccumulator.tray),
    currentCount: trayAccumulator.tray?.current_count,
    capacity: trayAccumulator.tray?.capacity,
    summaryLines,
    plants: plantSpecs,
    dnd: {
      draggableId: buildDndId("tray", trayAccumulator.trayId),
      meta: {
        slot_id: trayAccumulator.slot?.id,
      },
    },
    meta: {
      tray: trayAccumulator.tray,
    },
  };
}

export function buildTentLayoutSpecFromOverviewPlants(input: {
  plants: ReadonlyArray<OverviewBuilderPlant>;
  layout?: OverviewLayoutSpine;
  trayPlacements?: ReadonlyArray<OverviewTrayPlacement>;
}): TentLayoutSpec {
  const tentSpineById = new Map<string, LayoutTentSpine>();
  const trayAccumulatorById = new Map<string, TrayAccumulator>();
  const unplaced: PlantOccupantSpec[] = [];

  for (const layoutTent of input.layout?.tents || []) {
    if (!layoutTent.id) {
      continue;
    }
    const tentSpine = ensureLayoutTent(tentSpineById, layoutTent.id, layoutTent.name);

    for (const shelf of layoutTent.shelves || []) {
      const shelfIndex = normalizeGridIndex(shelf.shelfIndex);
      const slotCount = normalizeNonNegativeInt(shelf.slotCount);
      if (!shelfIndex || slotCount == null) {
        continue;
      }
      tentSpine.shelfSlotCountByIndex.set(shelfIndex, slotCount);
    }
  }

  for (const placement of input.trayPlacements || []) {
    if (!placement.trayId || !placement.tentId) {
      continue;
    }

    const shelfIndex = normalizeGridIndex(placement.shelfIndex);
    const slotIndex = normalizeGridIndex(placement.slotIndex);
    if (!shelfIndex || !slotIndex) {
      continue;
    }

    ensureLayoutTent(tentSpineById, placement.tentId, null);

    const existing = trayAccumulatorById.get(placement.trayId);
    if (existing) {
      existing.tentId = placement.tentId;
      existing.shelfIndex = shelfIndex;
      existing.slotIndex = slotIndex;
      if (placement.slot) {
        existing.slot = placement.slot;
      }
      if (placement.tray) {
        existing.tray = placement.tray;
      }
      continue;
    }

    trayAccumulatorById.set(placement.trayId, {
      trayId: placement.trayId,
      tentId: placement.tentId,
      shelfIndex,
      slotIndex,
      slot: placement.slot || null,
      tray: placement.tray || null,
      plants: [],
    });
  }

  for (const plant of input.plants) {
    const plantSpec = buildOverviewPlantSpec(plant);
    const { location } = plant;

    if (location.status !== "placed" || !location.tent || !location.slot || !location.tray) {
      unplaced.push(plantSpec);
      continue;
    }

    const tentId = location.tent.id;
    const trayId = location.tray.id;
    const shelfIndex = normalizeGridIndex(location.slot.shelf_index) || 1;
    const slotIndex = normalizeGridIndex(location.slot.slot_index) || 1;

    ensureLayoutTent(tentSpineById, tentId, location.tent.name || null);

    if (!trayAccumulatorById.has(trayId)) {
      trayAccumulatorById.set(trayId, {
        trayId,
        tentId,
        shelfIndex,
        slotIndex,
        slot: location.slot,
        tray: location.tray,
        plants: [],
      });
    }

    const trayAccumulator = trayAccumulatorById.get(trayId);
    if (!trayAccumulator) {
      continue;
    }

    trayAccumulator.tentId = trayAccumulator.tentId || tentId;
    trayAccumulator.shelfIndex = trayAccumulator.shelfIndex || shelfIndex;
    trayAccumulator.slotIndex = trayAccumulator.slotIndex || slotIndex;

    if (!trayAccumulator.slot && location.slot) {
      trayAccumulator.slot = location.slot;
    }
    if (!trayAccumulator.tray && location.tray) {
      trayAccumulator.tray = location.tray;
    }

    trayAccumulator.plants.push(plant);
  }

  const trayPlacementsByTentShelfSlot = new Map<
    string,
    Map<number, Map<number, ShelfSlotPlacement>>
  >();

  for (const trayAccumulator of trayAccumulatorById.values()) {
    const shelfMap =
      trayPlacementsByTentShelfSlot.get(trayAccumulator.tentId) || new Map<number, Map<number, ShelfSlotPlacement>>();

    const slotMap = shelfMap.get(trayAccumulator.shelfIndex) || new Map<number, ShelfSlotPlacement>();

    const traySpec = buildTrayOccupantSpec(trayAccumulator);
    const slotPlacement: ShelfSlotPlacement = slotMap.get(trayAccumulator.slotIndex) || {
      slotId: trayAccumulator.slot?.id || null,
      slotLabel: locationLabel(trayAccumulator.slot, `Slot ${trayAccumulator.slotIndex}`),
      slotMeta: trayAccumulator.slot ? { ...trayAccumulator.slot } : null,
      trays: [],
    };

    if (!slotPlacement.slotId && trayAccumulator.slot?.id) {
      slotPlacement.slotId = trayAccumulator.slot.id;
    }
    if (!slotPlacement.slotMeta && trayAccumulator.slot) {
      slotPlacement.slotMeta = { ...trayAccumulator.slot };
    }

    slotPlacement.trays.push(traySpec);

    slotMap.set(trayAccumulator.slotIndex, slotPlacement);
    shelfMap.set(trayAccumulator.shelfIndex, slotMap);
    trayPlacementsByTentShelfSlot.set(trayAccumulator.tentId, shelfMap);
  }

  const allTentIds = new Set<string>([
    ...Array.from(tentSpineById.keys()),
    ...Array.from(trayPlacementsByTentShelfSlot.keys()),
  ]);

  const tents = Array.from(allTentIds)
    .map((tentId) => {
      const tentSpine = tentSpineById.get(tentId);
      const tentPlacementMap = trayPlacementsByTentShelfSlot.get(tentId) || new Map<number, Map<number, ShelfSlotPlacement>>();

      const shelfIndexes = new Set<number>([
        ...Array.from(tentSpine?.shelfSlotCountByIndex.keys() || []),
        ...Array.from(tentPlacementMap.keys()),
      ]);

      const shelves = Array.from(shelfIndexes)
        .sort((left, right) => left - right)
        .map((shelfIndex) => {
          const shelfId = buildDndId("shelf", tentId, shelfIndex);
          const slotMap = tentPlacementMap.get(shelfIndex) || new Map<number, ShelfSlotPlacement>();
          for (const slotPlacement of slotMap.values()) {
            slotPlacement.trays.sort((left, right) => traySortLabel(left).localeCompare(traySortLabel(right)));
          }

          const observedMaxSlotIndex = slotMap.size > 0 ? Math.max(...Array.from(slotMap.keys())) : 0;
          const layoutSlotCount = tentSpine?.shelfSlotCountByIndex.get(shelfIndex);
          const shelfSlotCount =
            layoutSlotCount != null ? layoutSlotCount : Math.max(1, observedMaxSlotIndex);

          const positions = buildShelfSlotPositions({
            tentId,
            shelfId,
            shelfIndex,
            slotCount: shelfSlotCount,
            trayBySlotIndex: slotMap,
          });

          if (
            process.env.NODE_ENV !== "production" &&
            layoutSlotCount != null &&
            positions.length !== layoutSlotCount
          ) {
            console.warn(
              "[gridkit/overview] shelf slot count mismatch",
              {
                tentId,
                shelfIndex,
                expected: layoutSlotCount,
                actual: positions.length,
              },
            );
          }

          return {
            shelfId,
            label: `Shelf ${shelfIndex}`,
            positions,
            dnd: {
              droppableId: shelfId,
            },
            meta: {
              shelfIndex,
            },
          };
        });

      const trayCount = shelves.reduce(
        (total, shelf) =>
          total +
          shelf.positions.reduce((positionTotal, position) => {
            if (position.occupant.kind === "tray") {
              return positionTotal + 1;
            }
            if (position.occupant.kind === "trayStack") {
              return positionTotal + position.occupant.trays.length;
            }
            return positionTotal;
          }, 0),
        0,
      );

      const plantCount = shelves.reduce(
        (total, shelf) =>
          total +
          shelf.positions.reduce((positionTotal, position) => {
            if (position.occupant.kind === "tray") {
              return positionTotal + (position.occupant.plants?.length || 0);
            }
            if (position.occupant.kind === "trayStack") {
              return (
                positionTotal +
                position.occupant.trays.reduce(
                  (trayTotal, tray) => trayTotal + (tray.plants?.length || 0),
                  0,
                )
              );
            }
            return positionTotal;
          }, 0),
        0,
      );

      return {
        tentId,
        label: locationLabel(tentSpine?.tent || null, "Tent"),
        shelves,
        dnd: {
          droppableId: buildDndId("tent", tentId),
        },
        meta: {
          tent: tentSpine?.tent || { id: tentId, name: null },
          trayCount,
          plantCount,
        },
      };
    })
    .sort((left, right) => {
      const leftLabel = left.label.toLowerCase();
      const rightLabel = right.label.toLowerCase();
      const labelCompare = leftLabel.localeCompare(rightLabel);
      if (labelCompare !== 0) {
        return labelCompare;
      }
      return left.tentId.localeCompare(right.tentId);
    });

  return {
    tents,
    meta: {
      unplacedPlants: [...unplaced].sort((left, right) => left.title.localeCompare(right.title)),
    },
  };
}
