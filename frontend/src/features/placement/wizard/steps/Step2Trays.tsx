import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { draftChipLabelForStep, formatTrayDisplay } from "@/src/features/placement/utils";
import type { Step2Actions, Step2Model } from "@/src/features/placement/wizard/types";
import { Badge } from "@/src/components/ui/badge";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { DraftChangeChip } from "@/src/components/ui/draft-change-chip";
import { GridControlButton } from "@/src/components/ui/grid-control-button";
import SectionCard from "@/src/components/ui/SectionCard";
import { StepAdjustButton } from "@/src/components/ui/step-adjust-button";
import { TrayCell } from "@/src/lib/gridkit/components";
import type { ChipSpec } from "@/src/lib/gridkit/spec";

import { experimentsStyles as styles } from "@/src/components/ui/experiments-styles";

type Step2TraysProps = {
  model: Step2Model;
  actions: Step2Actions;
};

export function Step2Trays({ model, actions }: Step2TraysProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const visiblePersistedTrayIds = model.sortedTrayIds.filter((trayId) => !model.draftRemovedTrayIds.has(trayId));
  const selectedTrayCount = model.selectedTrayDraftKeys.size;
  const selectedPersistedTrayIds = useMemo(
    () =>
      Array.from(model.selectedTrayDraftKeys)
        .filter((trayKey) => trayKey.startsWith("persisted:"))
        .map((trayKey) => trayKey.slice("persisted:".length)),
    [model.selectedTrayDraftKeys],
  );
  const selectedTraysWithPlants = useMemo(
    () =>
      selectedPersistedTrayIds
        .map((trayId) => model.trayById.get(trayId))
        .filter((tray): tray is NonNullable<typeof tray> => !!tray && tray.current_count > 0),
    [model.trayById, selectedPersistedTrayIds],
  );
  const plantsInDeletedTrays = selectedTraysWithPlants.reduce((total, tray) => total + tray.current_count, 0);

  function handleRemoveSelectedTrays() {
    if (selectedTrayCount === 0) {
      return;
    }
    if (selectedTraysWithPlants.length > 0) {
      setConfirmOpen(true);
      return;
    }
    actions.removeSelectedTrays();
  }

  return (
    <div className="grid gap-3">
      <SectionCard
        title="Tray Manager"
        actions={
          model.step2DraftChangeCount > 0 ? (
            <DraftChangeChip label={draftChipLabelForStep(2, model.step2DraftChangeCount)} />
          ) : null
        }
      >
        <div className={cn(styles.trayControlRow, "justify-between")}>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Total trays: {model.totalDraftTrayCount}</span>
            <GridControlButton
              aria-label="Add tray"
              title="Add tray"
              onClick={actions.addDraftTray}
              disabled={model.saving || model.locked}
            >
              <Plus />
            </GridControlButton>
          </div>
          <GridControlButton
            aria-label="Remove selected trays"
            title="Remove selected trays"
            variant="destructive"
            onClick={handleRemoveSelectedTrays}
            disabled={model.saving || model.locked || selectedTrayCount === 0}
            className={cn(selectedTrayCount === 0 && "invisible")}
          >
            <Trash2 />
          </GridControlButton>
        </div>

        <div className={cn(styles.trayManagerGrid, styles.cellGridResponsive)} data-cell-size="sm">
          {visiblePersistedTrayIds.map((trayId) => {
            const tray = model.trayById.get(trayId);
            if (!tray) {
              return null;
            }
            const trayKey = `persisted:${trayId}`;
            const selected = model.selectedTrayDraftKeys.has(trayKey);
            const draftCapacity = Math.max(1, model.trayCapacityDraftById[trayId] ?? tray.capacity);
            const trayDirty = model.dirtyTrayCapacityIds.has(trayId);
            const chips: ChipSpec[] = [];
            if (trayDirty) {
              chips.push({
                id: `${trayId}-dirty`,
                label: "•",
                tone: "warn",
                placement: "tl",
              });
            }
            if (selected) {
              chips.push({
                id: `${trayId}-selected`,
                label: "✓",
                tone: "info",
                placement: "tr",
              });
            }

            return (
              <TrayCell
                key={trayId}
                trayId={tray.tray_id}
                title={formatTrayDisplay(tray.name, tray.tray_id)}
                state={{ selected, tone: trayDirty ? "warn" : undefined }}
                interactive={!model.saving && !model.locked}
                interactiveElement="div"
                onPress={
                  model.saving || model.locked
                    ? undefined
                    : () => actions.toggleTraySelection(trayKey)
                }
                chips={chips}
                className={cn(styles.trayEditorCell, "justify-items-center text-center")}
                titleClassName={styles.trayGridCellId}
                metaClassName={styles.trayEditorBadgeRow}
                meta={
                  <>
                    <Badge variant="secondary" className={styles.recipeLegendItemCompact}>
                      {draftCapacity} {draftCapacity === 1 ? "plant" : "plants"}
                    </Badge>
                  </>
                }
                contentClassName="justify-items-center text-center"
              >
                <div className={styles.trayEditorAdjustRow}>
                  <StepAdjustButton
                    direction="decrement"
                    onClick={() => actions.adjustTrayCapacity(trayId, -1)}
                    disabled={model.saving || model.locked || draftCapacity <= 1}
                  />
                  <StepAdjustButton
                    direction="increment"
                    onClick={() => actions.adjustTrayCapacity(trayId, 1)}
                    disabled={model.saving || model.locked}
                  />
                </div>
              </TrayCell>
            );
          })}
          {model.draftNewTrays.map((draftTray, index) => {
            const trayKey = `draft:${draftTray.id}`;
            const selected = model.selectedTrayDraftKeys.has(trayKey);
            const chips: ChipSpec[] = [
              {
                id: `${draftTray.id}-dirty`,
                label: "•",
                tone: "warn",
                placement: "tl",
              },
            ];
            if (selected) {
              chips.push({
                id: `${draftTray.id}-selected`,
                label: "✓",
                tone: "info",
                placement: "tr",
              });
            }

            return (
              <TrayCell
                key={draftTray.id}
                trayId={`draft-tray-${index + 1}`}
                title="New tray"
                state={{ selected, tone: "warn" }}
                interactive={!model.saving && !model.locked}
                interactiveElement="div"
                onPress={
                  model.saving || model.locked
                    ? undefined
                    : () => actions.toggleTraySelection(trayKey)
                }
                chips={chips}
                className={cn(
                  styles.trayEditorCell,
                  "justify-items-center text-center",
                  "border-dashed",
                )}
                titleClassName={styles.trayGridCellId}
                metaClassName={styles.trayEditorBadgeRow}
                meta={
                  <Badge variant="secondary" className={styles.recipeLegendItemCompact}>
                    {draftTray.capacity} {draftTray.capacity === 1 ? "plant" : "plants"}
                  </Badge>
                }
                contentClassName="justify-items-center text-center"
              >
                <div className={styles.trayEditorAdjustRow}>
                  <StepAdjustButton
                    direction="decrement"
                    onClick={() => actions.adjustPendingTrayCapacity(draftTray.id, -1)}
                    disabled={model.saving || model.locked || draftTray.capacity <= 1}
                  />
                  <StepAdjustButton
                    direction="increment"
                    onClick={() => actions.adjustPendingTrayCapacity(draftTray.id, 1)}
                    disabled={model.saving || model.locked}
                  />
                </div>
              </TrayCell>
            );
          })}
          {model.totalDraftTrayCount === 0 ? <p className="text-sm text-muted-foreground">No trays configured.</p> : null}
        </div>
      </SectionCard>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete selected trays?"
        description={`Deleting selected trays will unassign ${plantsInDeletedTrays} plant mapping(s) from those trays. Plants are not deleted.`}
        confirmLabel="Delete trays"
        onConfirm={actions.removeSelectedTrays}
        details={
          selectedTraysWithPlants.length > 0 ? (
            <>
              <span className="font-medium text-foreground">Affected trays</span>
              <ul className="list-disc pl-5">
                {selectedTraysWithPlants.map((tray) => (
                  <li key={tray.tray_id}>
                    {formatTrayDisplay(tray.name, tray.tray_id)}: {tray.current_count} mapped plant(s)
                  </li>
                ))}
              </ul>
            </>
          ) : null
        }
      />
    </div>
  );
}
