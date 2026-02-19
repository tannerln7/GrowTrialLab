import { cn } from "@/lib/utils";
import { experimentsStyles as styles } from "@/src/components/ui/experiments-styles";
import type { PlantOccupantSpec, TentLayoutSpec, TrayOccupantSpec } from "@/src/lib/gridkit/spec";
import type { ReactNode } from "react";

const OVERVIEW_SLOT_COLUMN_CLASSES = [
  "grid-cols-1",
  "grid-cols-2",
  "grid-cols-3",
  "grid-cols-4",
  "grid-cols-5",
  "grid-cols-6",
  "grid-cols-7",
  "grid-cols-8",
  "grid-cols-9",
  "grid-cols-10",
  "grid-cols-11",
  "grid-cols-12",
] as const;

function overviewSlotGridColumns(maxSlotCount: number): string {
  const capped = Math.min(12, Math.max(1, Math.trunc(maxSlotCount || 1)));
  return OVERVIEW_SLOT_COLUMN_CLASSES[capped - 1] || OVERVIEW_SLOT_COLUMN_CLASSES[0];
}

function readTrayCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

type LegacyOverviewTentLayoutAdapterProps = {
  spec: TentLayoutSpec;
  renderPlantCell: (plant: PlantOccupantSpec) => ReactNode;
};

// Temporary bridge adapter: overview tent layout spec -> current board markup.
export function LegacyOverviewTentLayoutAdapter({
  spec,
  renderPlantCell,
}: LegacyOverviewTentLayoutAdapterProps) {
  return (
    <div className={styles.overviewTentBoardGrid}>
      {spec.tents.map((tent) => {
        const trayCount = readTrayCount((tent.meta as { trayCount?: unknown } | undefined)?.trayCount);
        const plantCount = readTrayCount((tent.meta as { plantCount?: unknown } | undefined)?.plantCount);

        return (
          <article
            key={tent.tentId}
            className={cn(
              styles.tentBoardCard,
              styles.overviewTentBoardCard,
              "rounded-lg border border-border",
              styles.cellSurfaceLevel4,
            )}
          >
            <div className={styles.trayHeaderRow}>
              <div className={styles.trayHeaderMeta}>
                <strong>{tent.label}</strong>
              </div>
              <div className={styles.trayHeaderActions}>
                <span className={styles.recipeLegendItem}>{trayCount} tray(s)</span>
                <span className={styles.recipeLegendItem}>{plantCount} plant(s)</span>
              </div>
            </div>
            <div className={styles.overviewTentShelfStack}>
              {tent.shelves.map((shelf, shelfPosition) => {
                const shelfIndexRaw = (shelf.meta as { shelfIndex?: unknown } | undefined)?.shelfIndex;
                const shelfIndex = typeof shelfIndexRaw === "number" ? shelfIndexRaw : shelfPosition + 1;
                const maxSlotCount = shelf.positions.length;

                return (
                  <div key={shelf.shelfId} className={styles.overviewShelfGroup}>
                    <span className={styles.overviewShelfLabel}>{`Shelf ${shelfIndex}`}</span>
                    <div
                      className={cn(
                        styles.overviewTentSlotGrid,
                        styles.overviewShelfSlotGrid,
                        overviewSlotGridColumns(maxSlotCount),
                      )}
                    >
                      {shelf.positions.map((position) => {
                        if (position.occupant.kind === "emptySlot") {
                          return (
                            <div
                              key={position.key}
                              className={cn(
                                styles.slotCell,
                                styles.overviewSlotCell,
                                styles.overviewSlotCellEmpty,
                                styles.cellFrame,
                                styles.cellSurfaceLevel3,
                              )}
                            >
                              <span className={styles.slotCellLabel}>Slot {position.positionIndex}</span>
                              <div className={styles.overviewSlotEmptyState}>Empty</div>
                            </div>
                          );
                        }

                        const trays: TrayOccupantSpec[] =
                          position.occupant.kind === "tray"
                            ? [position.occupant]
                            : position.occupant.kind === "trayStack"
                              ? position.occupant.trays
                              : [];

                        if (trays.length === 0) {
                          return (
                            <div
                              key={position.key}
                              className={cn(
                                styles.slotCell,
                                styles.overviewSlotCell,
                                styles.overviewSlotCellEmpty,
                                styles.cellFrame,
                                styles.cellSurfaceLevel3,
                              )}
                            >
                              <span className={styles.slotCellLabel}>Slot {position.positionIndex}</span>
                              <div className={styles.overviewSlotEmptyState}>Empty</div>
                            </div>
                          );
                        }

                        return (
                          <div key={position.key} className="h-full min-h-[118px] max-sm:min-h-[104px]">
                            <div className={styles.overviewSlotTrayStack}>
                              {trays.map((tray) => (
                                <article
                                  key={tray.id}
                                  className={cn(
                                    styles.overviewTrayCell,
                                    styles.cellSurfaceLevel2,
                                    trays.length === 1 ? "h-full" : "",
                                  )}
                                >
                                  <div className={styles.overviewTrayMeta}>
                                    <strong className={cn(styles.trayGridCellId, "text-left")}>
                                      {tray.title}
                                    </strong>
                                    {tray.currentCount != null && tray.capacity != null ? (
                                      <span className={cn(styles.recipeLegendItem, "shrink-0")}>
                                        {tray.currentCount}/{tray.capacity}
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className={cn(styles.plantCellGridTray, styles.cellGridResponsive)} data-cell-size="sm">
                                    {(tray.plants || []).map((plant) => renderPlantCell(plant))}
                                  </div>
                                </article>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {tent.shelves.length === 0 ? (
                <p className="text-sm text-muted-foreground">No mapped slots.</p>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
