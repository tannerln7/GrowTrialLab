import { ArrowRight, CheckSquare, X } from "lucide-react";
import { memo, useCallback, useMemo } from "react";

import { cn } from "@/lib/utils";
import { getDraftOrPersisted, isDirtyValue } from "@/src/lib/state/drafts";
import { draftChipLabelForStep, formatTrayDisplay } from "@/src/features/placement/utils";
import type { Step4Actions, Step4Model } from "@/src/features/placement/wizard/types";
import { TraySelectableCell } from "@/src/features/placement/components/placement-cells";
import { Button } from "@/src/components/ui/button";
import { DraftChangeChip } from "@/src/components/ui/draft-change-chip";
import { GridControlButton } from "@/src/components/ui/grid-control-button";
import { NativeSelect } from "@/src/components/ui/native-select";
import SectionCard from "@/src/components/ui/SectionCard";
import { buildTentLayoutSpecFromPlacementStep4 } from "@/src/lib/gridkit/builders";
import { PlacementTentLayout } from "@/src/lib/gridkit/components";

import { experimentsStyles as styles } from "@/src/components/ui/experiments-styles";

type Step4TraysToSlotsProps = {
  model: Step4Model;
  actions: Step4Actions;
};

function Step4TraysToSlotsImpl({ model, actions }: Step4TraysToSlotsProps) {
  const isTraySlotDirty = useCallback(
    (trayId: string) => {
      const persisted = model.persistedTrayToSlot[trayId] ?? null;
      const draft = getDraftOrPersisted<string | null>(model.draftTrayToSlot, model.persistedTrayToSlot, trayId, null);
      return isDirtyValue(persisted, draft);
    },
    [model.draftTrayToSlot, model.persistedTrayToSlot],
  );

  const renderTrayCell = useCallback(
    (trayId: string, inSlot?: boolean) => {
      const tray = model.trayById.get(trayId);
      if (!tray) {
        return null;
      }

      return (
        <TraySelectableCell
          key={trayId}
          tray={tray}
          inSlot={inSlot}
          selected={model.selectedTrayIds.has(trayId)}
          dirty={isTraySlotDirty(trayId)}
          onToggle={actions.toggleTraySelection}
        />
      );
    },
    [actions.toggleTraySelection, isTraySlotDirty, model.selectedTrayIds, model.trayById],
  );

  const tentLayoutSpec = useMemo(
    () =>
      buildTentLayoutSpecFromPlacementStep4({
        tents: model.tents,
        draftSlotToTray: model.draftSlotToTray,
        destinationSlotId: model.destinationSlotId,
        dirtySlotIds: model.dirtySlotIds,
        selectedTraysByTentId: model.selectedTraysByTentId,
      }),
    [
      model.destinationSlotId,
      model.dirtySlotIds,
      model.draftSlotToTray,
      model.selectedTraysByTentId,
      model.tents,
    ],
  );

  return (
    <div className="grid gap-3">
      <SectionCard
        title="Trays -> Slots (Draft)"
        actions={
          model.traySlotDraftChangeCount > 0 ? (
            <DraftChangeChip label={draftChipLabelForStep(4, model.traySlotDraftChangeCount)} />
          ) : null
        }
      >
        <div className={styles.placementToolbar}>
          <NativeSelect
            className={styles.toolbarInlineSelect}
            value={model.destinationSlotId}
            onChange={(event) => actions.setDestinationSlotId(event.target.value)}
            aria-label="Destination slot"
          >
            <option value="">Select destination slot</option>
            {model.sortedSlots.map((slot) => {
              const occupant = model.draftSlotToTray.get(slot.slot_id) || null;
              const occupantName = occupant
                ? formatTrayDisplay(model.trayById.get(occupant)?.name, occupant)
                : "Empty";
              return (
                <option key={slot.slot_id} value={slot.slot_id}>
                  {slot.label} ({occupantName})
                </option>
              );
            })}
          </NativeSelect>
          <div className={cn(styles.toolbarActionsCompact, "flex flex-wrap items-center gap-2")}>
            <GridControlButton
              aria-label="Select all unplaced trays"
              title="Select all unplaced trays"
              onClick={actions.selectAllTraysInMainGrid}
              disabled={model.mainGridTrayIds.length === 0}
            >
              <CheckSquare />
            </GridControlButton>
            <GridControlButton
              aria-label="Clear tray selection"
              title="Clear tray selection"
              onClick={actions.clearTraySelection}
              disabled={model.selectedTrayIds.size === 0}
            >
              <X />
            </GridControlButton>
            <Button
              type="button"
              disabled={model.locked || !model.destinationSlotId || model.selectedTrayIds.size === 0}
              onClick={actions.stageMoveTraysToSlots}
            >
              <ArrowRight size={16} />
              Move selected
            </Button>
          </div>
        </div>

        <div className={cn(styles.toolbarSummaryRow, "flex flex-wrap items-center gap-2")}>
          <span className="text-sm text-muted-foreground">Unplaced trays: {model.mainGridTrayIds.length}</span>
          <span className="text-sm text-muted-foreground">Selected trays: {model.selectedTrayIds.size}</span>
        </div>

        <div className={cn(styles.trayMainGrid, styles.cellGridResponsive)} data-cell-size="md">
          {model.mainGridTrayIds.map((trayId) => renderTrayCell(trayId))}
        </div>
      </SectionCard>

      <PlacementTentLayout
        spec={tentLayoutSpec}
        onReturnSelectedFromTent={actions.stageRemoveTraysFromTent}
        onToggleDestinationSlot={actions.toggleDestinationSlot}
        renderTrayCell={renderTrayCell}
      />
    </div>
  );
}

export const Step4TraysToSlots = memo(Step4TraysToSlotsImpl);
