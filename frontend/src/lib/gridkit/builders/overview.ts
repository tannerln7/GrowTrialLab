import { buildDndId } from "@/src/lib/dnd";

import type {
  EmptySlotOccupantSpec,
  PlantOccupantSpec,
  TentLayoutSpec,
  TrayOccupantSpec,
  TrayStackOccupantSpec,
} from "../spec";

type LocationNode = {
  id: string;
  code?: string | null;
  name?: string | null;
  label?: string | null;
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
    slot: (LocationNode & { shelf_index?: number | null; slot_index?: number | null }) | null;
    tray: (LocationNode & { capacity?: number | null; current_count?: number | null }) | null;
  };
};

type TentSlotAccumulator = {
  slot: NonNullable<OverviewBuilderPlant["location"]["slot"]>;
  rawShelfIndex: number | null;
  rawSlotIndex: number | null;
  trays: Map<string, { tray: NonNullable<OverviewBuilderPlant["location"]["tray"]>; plants: OverviewBuilderPlant[] }>;
};

type ShelfSlotAccumulator = {
  slot: NonNullable<OverviewBuilderPlant["location"]["slot"]>;
  shelfIndex: number;
  slotIndex: number;
  trays: TrayOccupantSpec[];
};

function normalizeGridIndex(value: number | null | undefined): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  const normalized = Math.trunc(value as number);
  return normalized < 1 ? null : normalized;
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

export function buildTentLayoutSpecFromOverviewPlants(input: {
  plants: ReadonlyArray<OverviewBuilderPlant>;
}): TentLayoutSpec {
  const tentMap = new Map<
    string,
    {
      tent: NonNullable<OverviewBuilderPlant["location"]["tent"]>;
      slots: Map<string, TentSlotAccumulator>;
    }
  >();
  const unplaced: PlantOccupantSpec[] = [];

  for (const plant of input.plants) {
    const plantSpec = buildOverviewPlantSpec(plant);
    const { location } = plant;

    if (
      location.status !== "placed" ||
      !location.tent ||
      !location.slot ||
      !location.tray
    ) {
      unplaced.push(plantSpec);
      continue;
    }

    const tentId = location.tent.id;
    const slotId = location.slot.id;
    const trayId = location.tray.id;
    const rawShelfIndex = normalizeGridIndex(location.slot.shelf_index);
    const rawSlotIndex = normalizeGridIndex(location.slot.slot_index);

    if (!tentMap.has(tentId)) {
      tentMap.set(tentId, { tent: location.tent, slots: new Map() });
    }
    const tentGroup = tentMap.get(tentId);
    if (!tentGroup) {
      continue;
    }

    if (!tentGroup.slots.has(slotId)) {
      tentGroup.slots.set(slotId, {
        slot: location.slot,
        rawShelfIndex,
        rawSlotIndex,
        trays: new Map(),
      });
    }
    const slotGroup = tentGroup.slots.get(slotId);
    if (!slotGroup) {
      continue;
    }

    if (!slotGroup.trays.has(trayId)) {
      slotGroup.trays.set(trayId, { tray: location.tray, plants: [] });
    }
    slotGroup.trays.get(trayId)?.plants.push(plant);
  }

  const tents = Array.from(tentMap.values())
    .map((tentGroup) => {
      const slotsByShelf = new Map<number, ShelfSlotAccumulator[]>();

      Array.from(tentGroup.slots.values())
        .map((slotGroup) => {
          const trays = Array.from(slotGroup.trays.values())
            .map((trayGroup) => {
              const sortedPlants = [...trayGroup.plants].sort((left, right) =>
                (left.plant_id || "").localeCompare(right.plant_id || ""),
              );
              const plantSpecs = sortedPlants.map((plant) => buildOverviewPlantSpec(plant));
              const summaryLines: string[] = [];
              if (trayGroup.tray.current_count != null && trayGroup.tray.capacity != null) {
                summaryLines.push(`${trayGroup.tray.current_count}/${trayGroup.tray.capacity}`);
              }
              summaryLines.push(`${plantSpecs.length} plant${plantSpecs.length === 1 ? "" : "s"}`);

              return {
                kind: "tray" as const,
                id: trayGroup.tray.id,
                trayId: trayGroup.tray.id,
                title: formatTrayHeading(trayGroup.tray),
                currentCount: trayGroup.tray.current_count,
                capacity: trayGroup.tray.capacity,
                summaryLines,
                plants: plantSpecs,
                dnd: {
                  draggableId: buildDndId("tray", trayGroup.tray.id),
                  meta: {
                    slot_id: slotGroup.slot.id,
                  },
                },
                meta: {
                  tray: trayGroup.tray,
                },
              } satisfies TrayOccupantSpec;
            })
            .sort((left, right) => {
              const leftTray = (
                left.meta as { tray?: { code?: string | null; name?: string | null } } | undefined
              )?.tray;
              const rightTray = (
                right.meta as { tray?: { code?: string | null; name?: string | null } } | undefined
              )?.tray;
              const leftLabel = (leftTray?.code || leftTray?.name || "").toLowerCase();
              const rightLabel = (rightTray?.code || rightTray?.name || "").toLowerCase();
              return leftLabel.localeCompare(rightLabel);
            });

          return {
            slot: slotGroup.slot,
            rawShelfIndex: slotGroup.rawShelfIndex,
            rawSlotIndex: slotGroup.rawSlotIndex,
            trays,
          };
        })
        .sort((left, right) => {
          const leftShelf = left.rawShelfIndex ?? Number.MAX_SAFE_INTEGER;
          const rightShelf = right.rawShelfIndex ?? Number.MAX_SAFE_INTEGER;
          if (leftShelf !== rightShelf) {
            return leftShelf - rightShelf;
          }
          const leftIndex = left.rawSlotIndex ?? Number.MAX_SAFE_INTEGER;
          const rightIndex = right.rawSlotIndex ?? Number.MAX_SAFE_INTEGER;
          if (leftIndex !== rightIndex) {
            return leftIndex - rightIndex;
          }
          const leftLabel = (left.slot.code || left.slot.label || "").toLowerCase();
          const rightLabel = (right.slot.code || right.slot.label || "").toLowerCase();
          return leftLabel.localeCompare(rightLabel);
        })
        .forEach((slotGroup) => {
          const shelfIndex = slotGroup.rawShelfIndex ?? 1;
          const existing = slotsByShelf.get(shelfIndex) || [];
          existing.push({
            slot: slotGroup.slot,
            shelfIndex,
            slotIndex: slotGroup.rawSlotIndex ?? 0,
            trays: slotGroup.trays,
          });
          slotsByShelf.set(shelfIndex, existing);
        });

      const normalizedShelves = Array.from(slotsByShelf.entries())
        .sort((left, right) => left[0] - right[0])
        .map(([shelfIndex, slots]) => {
          const orderedSlots = [...slots].sort((left, right) => {
            const leftIndex = left.slotIndex > 0 ? left.slotIndex : Number.MAX_SAFE_INTEGER;
            const rightIndex = right.slotIndex > 0 ? right.slotIndex : Number.MAX_SAFE_INTEGER;
            if (leftIndex !== rightIndex) {
              return leftIndex - rightIndex;
            }
            return locationLabel(left.slot, "").toLowerCase().localeCompare(locationLabel(right.slot, "").toLowerCase());
          });
          const usedSlotIndexes = new Set<number>();
          const normalizedSlots = orderedSlots.map((slotGroup) => {
            let resolvedIndex = slotGroup.slotIndex > 0 ? slotGroup.slotIndex : 0;
            if (resolvedIndex <= 0 || usedSlotIndexes.has(resolvedIndex)) {
              resolvedIndex = 1;
              while (usedSlotIndexes.has(resolvedIndex)) {
                resolvedIndex += 1;
              }
            }
            usedSlotIndexes.add(resolvedIndex);
            return {
              ...slotGroup,
              slotIndex: resolvedIndex,
            };
          });
          return { shelfIndex, slots: normalizedSlots };
        });

      const maxSlotCount = Math.max(
        1,
        ...normalizedShelves.flatMap((shelf) => shelf.slots.map((slot) => slot.slotIndex)),
      );

      const shelves = normalizedShelves.map((shelf) => {
        const slotByIndex = new Map(shelf.slots.map((slotGroup) => [slotGroup.slotIndex, slotGroup] as const));

        return {
          shelfId: buildDndId("shelf", tentGroup.tent.id, shelf.shelfIndex),
          label: `Shelf ${shelf.shelfIndex}`,
          positions: Array.from({ length: maxSlotCount }, (_, index) => {
            const positionIndex = index + 1;
            const slotGroup = slotByIndex.get(positionIndex);
            const occupant = !slotGroup || slotGroup.trays.length === 0
              ? ({
                  kind: "emptySlot",
                  id: slotGroup?.slot.id || buildDndId("slot", tentGroup.tent.id, shelf.shelfIndex, positionIndex),
                  slotIndex: positionIndex,
                  label: `Slot ${positionIndex}`,
                  dnd: {
                    droppableId: buildDndId("slot", tentGroup.tent.id, shelf.shelfIndex, positionIndex),
                    meta: {
                      tent_id: tentGroup.tent.id,
                    },
                  },
                } satisfies EmptySlotOccupantSpec)
              : slotGroup.trays.length === 1
                ? slotGroup.trays[0]
                : ({
                    kind: "trayStack",
                    id: slotGroup.slot.id,
                    trays: slotGroup.trays,
                  } satisfies TrayStackOccupantSpec);

            return {
              id: slotGroup?.slot.id || buildDndId("slot", tentGroup.tent.id, shelf.shelfIndex, positionIndex),
              key: slotGroup?.slot.id || `${tentGroup.tent.id}-shelf-${shelf.shelfIndex}-slot-${positionIndex}`,
              tentId: tentGroup.tent.id,
              shelfId: buildDndId("shelf", tentGroup.tent.id, shelf.shelfIndex),
              positionIndex,
              label: `Slot ${positionIndex}`,
              occupant,
              dnd: {
                droppableId: buildDndId("slot", tentGroup.tent.id, shelf.shelfIndex, positionIndex),
              },
              meta: {
                slot: slotGroup?.slot || null,
              },
            };
          }),
          dnd: {
            droppableId: buildDndId("shelf", tentGroup.tent.id, shelf.shelfIndex),
          },
          meta: {
            shelfIndex: shelf.shelfIndex,
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
        tentId: tentGroup.tent.id,
        label: tentGroup.tent.name || tentGroup.tent.code || "Tent",
        shelves,
        dnd: {
          droppableId: buildDndId("tent", tentGroup.tent.id),
        },
        meta: {
          tent: tentGroup.tent,
          maxSlotCount,
          trayCount,
          plantCount,
        },
      };
    })
    .sort((left, right) => {
      const leftLabel = left.label.toLowerCase();
      const rightLabel = right.label.toLowerCase();
      return leftLabel.localeCompare(rightLabel);
    });

  return {
    tents,
    meta: {
      unplacedPlants: [...unplaced].sort((left, right) => left.title.localeCompare(right.title)),
    },
  };
}
