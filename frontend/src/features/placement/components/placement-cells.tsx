import { memo } from "react";

import { cn } from "@/lib/utils";
import type { PlantCell, TrayCell } from "@/src/features/placement/types";
import { formatTrayDisplay } from "@/src/features/placement/utils";
import { Badge } from "@/src/components/ui/badge";
import { experimentsStyles as styles } from "@/src/components/ui/experiments-styles";
import { CellChrome, CellMeta, CellSubtitle, CellTitle } from "@/src/lib/gridkit/components";
import type { ChipSpec } from "@/src/lib/gridkit/spec";

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
  plant: PlantCell;
  selected: boolean;
  dirty: boolean;
  onToggle: (plantId: string) => void;
};

function PlantSelectableCellImpl({ plant, selected, dirty, onToggle }: PlantSelectableCellProps) {
  const gradeLabel = plant.grade ? `Grade ${plant.grade}` : "Grade -";
  return (
    <CellChrome
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
    >
      <CellTitle className={styles.plantCellId}>{plant.plant_id || "(pending)"}</CellTitle>
      <CellSubtitle className={styles.plantCellSpecies}>{plant.species_name}</CellSubtitle>
      <CellMeta className={cn(styles.plantCellMetaRow, "justify-center")}>
        <Badge variant={plant.grade ? "secondary" : "outline"}>{gradeLabel}</Badge>
      </CellMeta>
    </CellChrome>
  );
}

export const PlantSelectableCell = memo(PlantSelectableCellImpl);

type TraySelectableCellProps = {
  tray: TrayCell;
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
    <CellChrome
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
    >
      <CellTitle className={cn(styles.trayGridCellId, inSlot && styles.trayGridCellIdInSlot)}>
        {formatTrayDisplay(tray.name, tray.tray_id)}
      </CellTitle>
      <Badge
        variant="secondary"
        className={cn(styles.recipeLegendItemCompact, inSlot && "justify-self-center")}
      >
        {tray.current_count}/{tray.capacity} plants
      </Badge>
    </CellChrome>
  );
}

export const TraySelectableCell = memo(TraySelectableCellImpl);
