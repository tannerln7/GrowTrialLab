import { cn } from "@/lib/utils";
import { buttonVariants } from "@/src/components/ui/button";
import SectionCard from "@/src/components/ui/SectionCard";

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
            return (
              <article
                key={plant.uuid}
                className={cn(
                  styles.plantCell,
                  styles.baselineQueuePlantCell,
                  styles.cellFrame,
                  styles.cellSurfaceLevel1,
                  styles.cellInteractive,
                  selected ? styles.plantCellSelected : "",
                )}
                role="button"
                tabIndex={0}
                onClick={() => actions.onJumpToPlant(plant.uuid)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    actions.onJumpToPlant(plant.uuid);
                  }
                }}
              >
                <strong className={styles.plantCellId}>{plant.plant_id || "(pending)"}</strong>
                <span className={styles.plantCellSpecies}>{plant.species_name}</span>
                <div className={styles.baselineQueueStatusRow}>
                  <span className={plant.has_baseline ? styles.baselineStatusReady : styles.baselineStatusMissing}>
                    {plant.has_baseline ? "Captured" : "No baseline"}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className={"text-sm text-muted-foreground"}>No active plants found in this queue.</p>
      )}
    </SectionCard>
  );
}
