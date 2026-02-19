import { cn } from "@/lib/utils";
import { draftChipLabelForStep, formatTrayDisplay } from "@/src/features/placement/utils";
import type { Step2Actions, Step2Model } from "@/src/features/placement/wizard/types";
import { Badge } from "@/src/components/ui/badge";
import { DraftChangeChip } from "@/src/components/ui/draft-change-chip";
import { CountAdjustToolbar } from "@/src/components/ui/count-adjust-toolbar";
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
        <CountAdjustToolbar
          count={model.draftTrayCount}
          countLabel="Total trays"
          onDecrement={actions.decrementDraftTrayCount}
          onIncrement={actions.incrementDraftTrayCount}
          decrementDisabled={model.saving || model.locked || model.draftTrayCount === 0}
          incrementDisabled={model.saving || model.locked}
        />

        <div className={cn(styles.trayManagerGrid, styles.cellGridResponsive)} data-cell-size="lg">
          {model.sortedTrayIds.map((trayId) => {
            const tray = model.trayById.get(trayId);
            if (!tray) {
              return null;
            }
            const draftCapacity = Math.max(1, model.trayCapacityDraftById[trayId] ?? tray.capacity);
            const trayMarkedForRemoval = model.draftRemovedTrayIds.has(trayId);
            const trayDirty = model.dirtyTrayCapacityIds.has(trayId) || trayMarkedForRemoval;
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

            return (
              <TrayCell
                key={trayId}
                trayId={tray.tray_id}
                title={formatTrayDisplay(tray.name, tray.tray_id)}
                state={{ tone: trayDirty ? "warn" : undefined }}
                chips={chips}
                className={cn(styles.trayEditorCell, "justify-items-center text-center")}
                titleClassName={styles.trayGridCellId}
                metaClassName={styles.trayEditorBadgeRow}
                meta={
                  <>
                    <Badge variant="secondary" className={styles.recipeLegendItemCompact}>
                      {draftCapacity} {draftCapacity === 1 ? "plant" : "plants"}
                    </Badge>
                    {trayMarkedForRemoval ? (
                      <Badge variant="destructive" className={styles.recipeLegendItemCompact}>
                        Pending removal
                      </Badge>
                    ) : null}
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
          {model.draftTrayCount > model.sortedTrayIds.length
            ? Array.from({ length: model.draftTrayCount - model.sortedTrayIds.length }, (_, index) => {
                const draftCapacity = Math.max(1, model.newTrayCapacities[index] ?? model.defaultTrayCapacity);
                const chips: ChipSpec[] = [
                  {
                    id: `draft-tray-${index + 1}-dirty`,
                    label: "•",
                    tone: "warn",
                    placement: "tl",
                  },
                ];

                return (
                  <TrayCell
                    key={`draft-tray-${index + 1}`}
                    trayId={`draft-tray-${index + 1}`}
                    title="New tray"
                    state={{ tone: "warn" }}
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
                        {draftCapacity} {draftCapacity === 1 ? "plant" : "plants"}
                      </Badge>
                    }
                    contentClassName="justify-items-center text-center"
                  >
                    <div className={styles.trayEditorAdjustRow}>
                      <StepAdjustButton
                        direction="decrement"
                        onClick={() => actions.adjustPendingTrayCapacity(index, -1)}
                        disabled={model.saving || model.locked || draftCapacity <= 1}
                      />
                      <StepAdjustButton
                        direction="increment"
                        onClick={() => actions.adjustPendingTrayCapacity(index, 1)}
                        disabled={model.saving || model.locked}
                      />
                    </div>
                  </TrayCell>
                );
              })
            : null}
          {model.draftTrayCount === 0 ? <p className="text-sm text-muted-foreground">No trays configured.</p> : null}
        </div>
      </SectionCard>
    </div>
  );
}
