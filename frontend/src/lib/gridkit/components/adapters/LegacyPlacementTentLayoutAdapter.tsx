import { Check, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { DraftChangeMarker } from "@/src/components/ui/draft-change-marker";
import { TooltipIconButton } from "@/src/components/ui/tooltip-icon-button";
import { experimentsStyles as styles } from "@/src/components/ui/experiments-styles";
import type { TentLayoutSpec, TentSpec } from "@/src/lib/gridkit/spec";

type LegacyPlacementTentLayoutAdapterProps = {
  spec: TentLayoutSpec;
  onReturnSelectedFromTent: (tentId: string) => void;
  onToggleDestinationSlot: (slotId: string) => void;
  renderTrayCell: (trayId: string, inSlot?: boolean) => ReactNode;
};

function readTentMeta(tent: TentSpec): { selectedTrayIds: string[]; slotCount: number } {
  const selectedTrayIds = Array.isArray((tent.meta as { selectedTrayIds?: unknown } | undefined)?.selectedTrayIds)
    ? ((tent.meta as { selectedTrayIds?: unknown[] }).selectedTrayIds || []).filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const slotCountRaw = (tent.meta as { slotCount?: unknown } | undefined)?.slotCount;
  const slotCount = typeof slotCountRaw === "number" ? slotCountRaw : tent.shelves.reduce((total, shelf) => total + shelf.positions.length, 0);
  return { selectedTrayIds, slotCount };
}

// Temporary bridge adapter: spec -> current placement board markup.
export function LegacyPlacementTentLayoutAdapter({
  spec,
  onReturnSelectedFromTent,
  onToggleDestinationSlot,
  renderTrayCell,
}: LegacyPlacementTentLayoutAdapterProps) {
  return (
    <div className={styles.tentBoardGrid}>
      {spec.tents.map((tent) => {
        const { selectedTrayIds, slotCount } = readTentMeta(tent);
        return (
          <article
            key={tent.tentId}
            className={cn(styles.tentBoardCard, "rounded-lg border border-border", styles.cellSurfaceLevel3)}
          >
            <div className={cn(styles.trayHeaderRow, "items-center")}>
              <div className={cn(styles.trayHeaderMeta, "py-0.5")}>
                <strong className={styles.trayGridCellId}>{tent.label}</strong>
              </div>
              <div className={styles.trayHeaderActions}>
                <span className={styles.recipeLegendItem}>
                  {slotCount} {slotCount === 1 ? "slot" : "slots"}
                </span>
                {selectedTrayIds.length > 0 ? (
                  <TooltipIconButton
                    label="Return selected trays to unplaced"
                    icon={<Trash2 size={16} />}
                    onClick={() => onReturnSelectedFromTent(tent.tentId)}
                    variant="destructive"
                  />
                ) : null}
              </div>
            </div>

            <div className={styles.tentShelfRow}>
              {tent.shelves.map((shelf) => (
                <article key={shelf.shelfId} className={cn(styles.tentShelfCard, styles.cellSurfaceLevel2)}>
                  <div className={cn(styles.trayHeaderRow, "items-center")}>
                    <div className={cn(styles.trayHeaderMeta, "py-0.5")}>
                      <strong className={styles.trayGridCellId}>{shelf.label}</strong>
                    </div>
                  </div>

                  <div className={styles.tentShelfSlotGrid}>
                    {shelf.positions.map((position) => {
                      if (position.occupant.kind === "tray") {
                        return (
                          <div key={position.id} className={styles.slotTrayCellFill}>
                            {renderTrayCell(position.occupant.trayId, true)}
                          </div>
                        );
                      }

                      if (position.occupant.kind === "trayStack" && position.occupant.trays.length > 0) {
                        return (
                          <div key={position.id} className={styles.slotTrayCellFill}>
                            {renderTrayCell(position.occupant.trays[0].trayId, true)}
                          </div>
                        );
                      }

                      const slotSelected = Boolean(position.state?.selected);
                      const dirty = position.state?.tone === "warn";
                      const slotLabel =
                        (typeof position.label === "string" && position.label.trim()) ||
                        (position.occupant.kind === "emptySlot" ? position.occupant.label : "") ||
                        `Slot ${position.positionIndex}`;

                      return (
                        <div
                          key={position.id}
                          className={cn(
                            styles.slotCell,
                            styles.slotContainerCellFrame,
                            styles.cellSurfaceLevel1,
                            dirty && styles.draftChangedSurface,
                            slotSelected && styles.plantCellSelected,
                          )}
                        >
                          {dirty ? <DraftChangeMarker /> : null}
                          {slotSelected ? (
                            <span className={styles.plantCellCheck}>
                              <Check size={12} />
                            </span>
                          ) : null}
                          <span className={styles.slotCellLabel}>{slotLabel}</span>
                          <button
                            type="button"
                            className={cn(styles.slotCellEmpty, slotSelected && styles.slotCellEmptyActive)}
                            onClick={() => onToggleDestinationSlot(position.id)}
                          >
                            Empty
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </article>
              ))}
              {slotCount === 0 ? <span className="text-sm text-muted-foreground">No slots generated.</span> : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
