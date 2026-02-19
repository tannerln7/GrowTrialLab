import { Check } from "lucide-react";

import type { PlantCell, TrayCell } from "@/src/features/placement/types";
import { formatTrayDisplay } from "@/src/features/placement/utils";
import { Badge } from "@/src/components/ui/badge";
import { DraftChangeMarker } from "@/src/components/ui/draft-change-marker";
import { experimentsStyles as styles } from "@/src/components/ui/experiments-styles";

type PlantSelectableCellProps = {
  plant: PlantCell;
  selected: boolean;
  dirty: boolean;
  onToggle: (plantId: string) => void;
};

export function PlantSelectableCell({ plant, selected, dirty, onToggle }: PlantSelectableCellProps) {
  const gradeLabel = plant.grade ? `Grade ${plant.grade}` : "Grade -";
  return (
    <article
      className={[
        styles.plantCell,
        styles.cellFrame,
        styles.cellSurfaceLevel1,
        styles.cellInteractive,
        "justify-items-center text-center",
        dirty ? styles.draftChangedSurface : "",
        selected ? styles.plantCellSelected : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onToggle(plant.uuid)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle(plant.uuid);
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
    >
      {selected ? (
        <span className={styles.plantCellCheck}>
          <Check size={12} />
        </span>
      ) : null}
      {dirty ? <DraftChangeMarker /> : null}
      <strong className={styles.plantCellId}>{plant.plant_id || "(pending)"}</strong>
      <span className={styles.plantCellSpecies}>{plant.species_name}</span>
      <div className={[styles.plantCellMetaRow, "justify-center"].join(" ")}>
        <Badge variant={plant.grade ? "secondary" : "outline"}>{gradeLabel}</Badge>
      </div>
    </article>
  );
}

type TraySelectableCellProps = {
  tray: TrayCell;
  selected: boolean;
  dirty: boolean;
  inSlot?: boolean;
  onToggle: (trayId: string) => void;
};

export function TraySelectableCell({
  tray,
  selected,
  dirty,
  inSlot,
  onToggle,
}: TraySelectableCellProps) {
  return (
    <article
      className={[
        styles.trayGridCell,
        inSlot ? styles.cellFrameCompact : styles.cellFrame,
        styles.cellSurfaceLevel1,
        styles.cellInteractive,
        inSlot ? styles.slotTrayCellFill : "",
        dirty ? styles.draftChangedSurface : "",
        selected ? styles.plantCellSelected : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onToggle(tray.tray_id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle(tray.tray_id);
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
    >
      {selected ? (
        <span className={styles.plantCellCheck}>
          <Check size={12} />
        </span>
      ) : null}
      {dirty ? <DraftChangeMarker /> : null}
      <strong
        className={[styles.trayGridCellId, inSlot ? styles.trayGridCellIdInSlot : ""]
          .filter(Boolean)
          .join(" ")}
      >
        {formatTrayDisplay(tray.name, tray.tray_id)}
      </strong>
      <Badge
        variant="secondary"
        className={[styles.recipeLegendItemCompact, inSlot ? "justify-self-center" : ""].filter(Boolean).join(" ")}
      >
        {tray.current_count}/{tray.capacity} plants
      </Badge>
      {inSlot ? <span className={styles.slotPlacedChip}>Placed</span> : null}
    </article>
  );
}
