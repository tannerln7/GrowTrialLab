import { memo } from "react";

import { cn } from "@/lib/utils";
import type { PlantCell as PlantCellModel, TrayCell as TrayCellModel } from "@/src/features/placement/types";
import { formatTrayDisplay } from "@/src/features/placement/utils";
import { Badge } from "@/src/components/ui/badge";
import { experimentsStyles as styles } from "@/src/components/ui/experiments-styles";
import { PlantCell, TrayCell } from "@/src/lib/gridkit/components";
import type { ChipSpec } from "@/src/lib/gridkit/spec";
import type { PlantOccupantSpec } from "@/src/lib/gridkit/spec";

function buildCellChips(input: {
  id: string;
  selected: boolean;
  dirty: boolean;
  placed?: boolean;
}): ChipSpec[] {
  const chips: ChipSpec[] = [];
  if (input.dirty) {
    chips.push({
      id: `${input.id}-dirty`,
      label: "•",
      tone: "warn",
      placement: "tl",
    });
  }
  if (input.selected) {
    chips.push({
      id: `${input.id}-selected`,
      label: "✓",
      tone: "info",
      placement: "tr",
    });
  }
  if (input.placed) {
    chips.push({
      id: `${input.id}-placed`,
      label: "Placed",
      tone: "success",
      placement: "bottom",
    });
  }
  return chips;
}

type PlantSelectableCellProps = {
  plant: PlantCellModel;
  selected: boolean;
  dirty: boolean;
  onToggle: (plantId: string) => void;
};

function PlantSelectableCellImpl({ plant, selected, dirty, onToggle }: PlantSelectableCellProps) {
  const gradeLabel = plant.grade ? `Grade ${plant.grade}` : "Grade -";
  return (
    <PlantCell
      plantId={plant.uuid}
      title={plant.plant_id || "(pending)"}
      subtitle={plant.species_name}
      state={{
        selected,
        tone: dirty ? "warn" : undefined,
      }}
      interactive
      onPress={() => onToggle(plant.uuid)}
      ariaLabel={plant.plant_id || "Plant"}
      chips={buildCellChips({
        id: plant.uuid,
        selected,
        dirty,
      })}
      className={cn(styles.plantCell, "justify-items-center text-center")}
      titleClassName={styles.plantCellId}
      subtitleClassName={styles.plantCellSpecies}
      metaClassName={cn(styles.plantCellMetaRow, "justify-center")}
      meta={
        <Badge variant={plant.grade ? "secondary" : "outline"}>{gradeLabel}</Badge>
      }
      contentClassName="justify-items-center text-center"
    />
  );
}

export const PlantSelectableCell = memo(PlantSelectableCellImpl);

type TraySelectableCellProps = {
  tray: TrayCellModel;
  selected: boolean;
  dirty: boolean;
  inSlot?: boolean;
  onToggle: (trayId: string) => void;
};

function TraySelectableCellImpl({
  tray,
  selected,
  dirty,
  inSlot,
  onToggle,
}: TraySelectableCellProps) {
  return (
    <TrayCell
      trayId={tray.tray_id}
      title={formatTrayDisplay(tray.name, tray.tray_id)}
      state={{
        selected,
        tone: dirty ? "warn" : undefined,
      }}
      interactive
      onPress={() => onToggle(tray.tray_id)}
      ariaLabel={formatTrayDisplay(tray.name, tray.tray_id)}
      chips={buildCellChips({
        id: tray.tray_id,
        selected,
        dirty,
        placed: inSlot,
      })}
      className={cn(
        styles.trayGridCell,
        inSlot && "h-full min-h-0 p-2",
        inSlot && styles.slotTrayCellFill,
      )}
      titleClassName={cn(styles.trayGridCellId, inSlot && styles.trayGridCellIdInSlot)}
      meta={
        <Badge
          variant="secondary"
          className={cn(styles.recipeLegendItemCompact, inSlot && "justify-self-center")}
        >
          {tray.current_count}/{tray.capacity} plants
        </Badge>
      }
      contentClassName={cn(inSlot && "items-center")}
    />
  );
}

export const TraySelectableCell = memo(TraySelectableCellImpl);

export type SelectablePlantSpecsInput = {
  plantIds: string[];
  plantById: Map<string, PlantCellModel>;
  selectedPlantIds: Set<string>;
  isDirty: (plantId: string) => boolean;
};

export function buildSelectablePlantOccupantSpecs(
  input: SelectablePlantSpecsInput,
): PlantOccupantSpec[] {
  const specs: PlantOccupantSpec[] = [];

  for (const plantId of input.plantIds) {
    const plant = input.plantById.get(plantId);
    if (!plant) {
      continue;
    }
    const selected = input.selectedPlantIds.has(plantId);
    const dirty = input.isDirty(plantId);

    specs.push({
      kind: "plant",
      id: plant.uuid,
      plantId: plant.uuid,
      title: plant.plant_id || "(pending)",
      subtitle: plant.species_name,
      status: plant.status,
      grade: plant.grade,
      recipeCode: plant.assigned_recipe?.code || null,
      state: {
        selected: selected || undefined,
        tone: dirty ? "warn" : undefined,
      },
      chips: buildCellChips({
        id: plant.uuid,
        selected,
        dirty,
      }),
      meta: {
        raw: plant,
      },
    });
  }

  return specs;
}
