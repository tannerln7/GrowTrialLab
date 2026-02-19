import { cn } from "@/lib/utils";
import { buttonVariants } from "@/src/components/ui/button";
import SectionCard from "@/src/components/ui/SectionCard";
import { CellChrome, CellMeta, CellSubtitle, CellTitle } from "@/src/lib/gridkit/components";
import type { ChipSpec } from "@/src/lib/gridkit/spec";

import { experimentsStyles as styles } from "@/src/components/ui/experiments-styles";

type QueuePlant = {
  uuid: string;
  plant_id: string;
  species_name: string;
  has_baseline: boolean;
};

type QueueStatusModel = {
  remainingCount: number;
  baselineLocked: boolean;
  editingUnlocked: boolean;
  allBaselinesCaptured: boolean;
  saving: boolean;
  primarySaveDisabled: boolean;
  primarySaveLabel: string;
};

type QueueStatusActions = {
  onUnlockEditing: () => void;
  onRelockEditing: () => void;
  onFinishAndLock: () => void;
  onPrimarySave: () => void;
};

type PlantQueueModel = {
  queuePlants: QueuePlant[];
  selectedPlantId: string;
};

type PlantQueueActions = {
  onJumpToPlant: (plantId: string) => void;
};

export function BaselineQueueStatusPanel({ model, actions }: { model: QueueStatusModel; actions: QueueStatusActions }) {
  return (
    <SectionCard title="Queue Status">
      <p className="text-sm text-muted-foreground">Remaining baselines: {model.remainingCount}</p>
      {model.baselineLocked ? (
        <p className={"text-sm text-muted-foreground"}>Baseline is locked in UI. Unlock editing for this session to continue.</p>
      ) : null}
      <div className={"flex flex-wrap items-center gap-2"}>
        {model.baselineLocked && !model.editingUnlocked ? (
          <button className={buttonVariants({ variant: "destructive" })} type="button" onClick={actions.onUnlockEditing}>
            Unlock editing
          </button>
        ) : null}
        {model.baselineLocked && model.editingUnlocked ? (
          <button className={buttonVariants({ variant: "secondary" })} type="button" onClick={actions.onRelockEditing}>
            Re-lock UI
          </button>
        ) : null}
        {!model.baselineLocked && model.allBaselinesCaptured ? (
          <button
            className={buttonVariants({ variant: "secondary" })}
            type="button"
            disabled={model.saving}
            onClick={actions.onFinishAndLock}
          >
            Finish and Lock
          </button>
        ) : null}
        <button
          className={buttonVariants({ variant: "default" })}
          type="button"
          disabled={model.primarySaveDisabled}
          onClick={actions.onPrimarySave}
        >
          {model.saving ? "Saving..." : model.primarySaveLabel}
        </button>
      </div>
    </SectionCard>
  );
}

export function BaselinePlantQueuePanel({ model, actions }: { model: PlantQueueModel; actions: PlantQueueActions }) {
  return (
    <SectionCard title="Plant Queue">
      {model.queuePlants.length > 0 ? (
        <div className={cn(styles.plantCellGrid, styles.cellGridResponsive)} data-cell-size="sm">
          {model.queuePlants.map((plant) => {
            const selected = plant.uuid === model.selectedPlantId;
            const chips: ChipSpec[] = selected
              ? [
                  {
                    id: `${plant.uuid}-selected`,
                    label: "✓",
                    tone: "info",
                    placement: "tr",
                  },
                ]
              : [];

            return (
              <CellChrome
                key={plant.uuid}
                state={{ selected }}
                interactive
                onPress={() => actions.onJumpToPlant(plant.uuid)}
                ariaLabel={plant.plant_id || "Plant"}
                chips={chips}
                className={cn(styles.plantCell, styles.baselineQueuePlantCell, "justify-items-center text-center")}
              >
                <CellTitle className={styles.plantCellId}>{plant.plant_id || "(pending)"}</CellTitle>
                <CellSubtitle className={styles.plantCellSpecies}>{plant.species_name}</CellSubtitle>
                <CellMeta className={styles.baselineQueueStatusRow}>
                  <span className={plant.has_baseline ? styles.baselineStatusReady : styles.baselineStatusMissing}>
                    {plant.has_baseline ? "Captured" : "No baseline"}
                  </span>
                </CellMeta>
              </CellChrome>
            );
          })}
        </div>
      ) : (
        <p className={"text-sm text-muted-foreground"}>No active plants found in this queue.</p>
      )}
    </SectionCard>
  );
}
