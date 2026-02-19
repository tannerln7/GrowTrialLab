import { CheckSquare, Layers, MoveRight, Trash2, X } from "lucide-react";
import { memo } from "react";

import { cn } from "@/lib/utils";
import { getDraftOrPersisted, isDirtyValue } from "@/src/lib/state/drafts";
import { draftChipLabelForStep, formatTrayDisplay } from "@/src/features/placement/utils";
import type { Step3Actions, Step3Model } from "@/src/features/placement/wizard/types";
import {
  buildSelectablePlantOccupantSpecs,
  PlantSelectableCell,
} from "@/src/features/placement/components/placement-cells";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { DraftChangeChip } from "@/src/components/ui/draft-change-chip";
import { GridControlButton } from "@/src/components/ui/grid-control-button";
import { NativeSelect } from "@/src/components/ui/native-select";
import SectionCard from "@/src/components/ui/SectionCard";
import { TrayCellExpandable } from "@/src/lib/gridkit/components";
import { TrayFolderProvider } from "@/src/lib/gridkit/state";
import type { ChipSpec, PositionSpec, TrayOccupantSpec } from "@/src/lib/gridkit/spec";

import { experimentsStyles as styles } from "@/src/components/ui/experiments-styles";

type Step3PlantsToTraysProps = {
  model: Step3Model;
  actions: Step3Actions;
};

function Step3PlantsToTraysImpl({ model, actions }: Step3PlantsToTraysProps) {
  const isPlantPlacementDirty = (plantId: string): boolean => {
    const persisted = model.persistedPlantToTray[plantId] ?? null;
    const draft = getDraftOrPersisted<string | null>(model.draftPlantToTray, model.persistedPlantToTray, plantId, null);
    return isDirtyValue(persisted, draft);
  };

  return (
    <TrayFolderProvider>
      <div className="grid gap-3">
        <SectionCard
          title="Plants -> Trays (Draft)"
          actions={
            model.placementDraftChangeCount > 0 ? (
              <DraftChangeChip label={draftChipLabelForStep(3, model.placementDraftChangeCount)} />
            ) : null
          }
        >
          <div className={styles.placementToolbar}>
            <NativeSelect
              className={styles.toolbarInlineSelect}
              value={model.destinationTrayId}
              onChange={(event) => actions.setDestinationTrayId(event.target.value)}
              aria-label="Destination tray"
            >
              <option value="">Select destination tray</option>
              {model.sortedTrayIds.map((trayId) => {
                const tray = model.trayById.get(trayId);
                if (!tray) {
                  return null;
                }
                return (
                  <option key={trayId} value={trayId}>
                    {formatTrayDisplay(tray.name, tray.tray_id)} ({model.draftPlantCountByTray[trayId] || 0}/{tray.capacity})
                  </option>
                );
              })}
            </NativeSelect>
            <div className={cn(styles.toolbarActionsCompact, "flex flex-wrap items-center gap-2")}>
              <GridControlButton
                aria-label="Select all unplaced plants"
                title="Select all unplaced plants"
                onClick={actions.selectAllPlantsInMainGrid}
                disabled={model.mainGridPlantIds.length === 0}
              >
                <CheckSquare />
              </GridControlButton>
              <GridControlButton
                aria-label="Select same species"
                title="Select same species"
                onClick={actions.selectSameSpeciesInMainGrid}
                disabled={model.sameSpeciesDisabled}
              >
                <Layers />
              </GridControlButton>
              <GridControlButton
                aria-label="Clear plant selection"
                title="Clear plant selection"
                onClick={actions.clearPlantSelection}
                disabled={model.selectedPlantIds.size === 0}
              >
                <X />
              </GridControlButton>
              <Button
                type="button"
                disabled={model.locked || !model.destinationTrayId || model.selectedInMainGrid.length === 0}
                onClick={actions.stageMovePlantsToTray}
              >
                <MoveRight size={16} />
                Move selected
              </Button>
            </div>
          </div>

          <div className={cn(styles.toolbarSummaryRow, "flex flex-wrap items-center gap-2")}>
            <span className="text-sm text-muted-foreground">Unplaced active plants: {model.mainGridPlantIds.length}</span>
            <span className="text-sm text-muted-foreground">Selected in main grid: {model.selectedInMainGrid.length}</span>
            {model.sortedTrayIds.length === 0 ? <Badge variant="secondary">Create at least one tray.</Badge> : null}
          </div>

          {model.diagnostics?.reason_counts ? (
            <div className="grid gap-2">
              <span>Move diagnostics</span>
              <strong>{Object.entries(model.diagnostics.reason_counts).map(([key, value]) => `${key}: ${value}`).join(" · ")}</strong>
              {model.diagnostics.unplaceable_plants?.slice(0, 8).map((plant) => (
                <span key={`${plant.plant_id}-${plant.reason}`}>{`${plant.plant_id || "(pending)"} · ${plant.species_name} · ${plant.reason}`}</span>
              ))}
            </div>
          ) : null}

          <div className={cn(styles.plantCellGrid, styles.cellGridResponsive)} data-cell-size="sm">
            {model.mainGridPlantIds.map((plantId) => {
              const plant = model.plantById.get(plantId);
              if (!plant) {
                return null;
              }
              return (
                <PlantSelectableCell
                  key={plant.uuid}
                  plant={plant}
                  selected={model.selectedPlantIds.has(plantId)}
                  dirty={isPlantPlacementDirty(plantId)}
                  onToggle={actions.togglePlantSelection}
                />
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="Tray Containers">
          <div className={cn(styles.trayManagerGrid, styles.cellGridResponsive)} data-cell-size="sm">
            {model.sortedTrayIds.map((trayId, trayIndex) => {
              const tray = model.trayById.get(trayId);
              if (!tray) {
                return null;
              }

              const trayPlantIds = model.trayPlantIdsByTray[trayId] || [];
              const selectedInTray = model.selectedInTrayByTrayId[trayId] || [];
              const trayDirty = model.dirtyPlantContainerTrayIds.has(trayId);
              const occupancyLabel = `${model.draftPlantCountByTray[trayId] || 0}/${tray.capacity}`;
              const trayLabel = formatTrayDisplay(tray.name, tray.tray_id);
              const chips: ChipSpec[] = trayDirty
                ? [
                    {
                      id: `${trayId}-dirty`,
                      label: "•",
                      tone: "warn",
                      placement: "tl",
                    },
                  ]
                : [];

              const traySpec: TrayOccupantSpec = {
                kind: "tray",
                id: tray.tray_id,
                trayId: tray.tray_id,
                title: trayLabel,
                summaryLines: [],
                state: { tone: trayDirty ? "warn" : undefined },
                chips,
              };

              const position: PositionSpec = {
                id: `placement-step3:tray:${tray.tray_id}`,
                key: `placement-step3:tray:${tray.tray_id}`,
                tentId: "placement-step3",
                shelfId: "placement-tray-containers",
                positionIndex: trayIndex + 1,
                label: trayLabel,
                occupant: traySpec,
              };

              const trayPlants = buildSelectablePlantOccupantSpecs({
                plantIds: trayPlantIds,
                plantById: model.plantById,
                selectedPlantIds: model.selectedPlantIds,
                isDirty: isPlantPlacementDirty,
              });

              return (
                <TrayCellExpandable
                  key={trayId}
                  tray={traySpec}
                  position={position}
                  plants={trayPlants}
                  onPlantPress={(plantId) => actions.togglePlantSelection(plantId)}
                  className="justify-items-center text-center"
                  metaClassName="justify-center"
                  triggerMeta={
                    <Badge variant="secondary" className={styles.recipeLegendItemCompact}>
                      {occupancyLabel}
                    </Badge>
                  }
                  overlayTitle={
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{trayLabel}</span>
                      <GridControlButton
                        aria-label="Return selected plants to unplaced"
                        title="Return selected plants to unplaced"
                        onClick={() => actions.stageRemovePlantsFromTray(trayId)}
                        variant="destructive"
                        disabled={selectedInTray.length === 0}
                      >
                        <Trash2 />
                      </GridControlButton>
                    </div>
                  }
                />
              );
            })}
          </div>
        </SectionCard>
      </div>
    </TrayFolderProvider>
  );
}

export const Step3PlantsToTrays = memo(Step3PlantsToTraysImpl);
