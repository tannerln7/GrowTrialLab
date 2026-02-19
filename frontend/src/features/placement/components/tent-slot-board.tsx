import { Check, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import type { SlotSummary, TentSummary } from "@/src/features/placement/types";
import { groupSlotsByShelf } from "@/src/features/placement/utils";
import { DraftChangeMarker } from "@/src/components/ui/draft-change-marker";
import { TooltipIconButton } from "@/src/components/ui/tooltip-icon-button";
import { experimentsStyles as styles } from "@/src/components/ui/experiments-styles";

type TentSlotBoardProps = {
  tents: TentSummary[];
  draftSlotToTray: Map<string, string>;
  destinationSlotId: string;
  dirtySlotIds: Set<string>;
  selectedTraysByTentId: Record<string, string[]>;
  onReturnSelectedFromTent: (tentId: string) => void;
  onToggleDestinationSlot: (slotId: string) => void;
  renderTrayCell: (trayId: string, inSlot?: boolean) => ReactNode;
};

export function TentSlotBoard({
  tents,
  draftSlotToTray,
  destinationSlotId,
  dirtySlotIds,
  selectedTraysByTentId,
  onReturnSelectedFromTent,
  onToggleDestinationSlot,
  renderTrayCell,
}: TentSlotBoardProps) {
  return (
    <div className={styles.tentBoardGrid}>
      {tents.map((tent) => {
        const selectedInTent = selectedTraysByTentId[tent.tent_id] || [];
        const slotsByShelf = groupSlotsByShelf(tent);
        return (
          <article
            key={tent.tent_id}
            className={[styles.tentBoardCard, "rounded-lg border border-border", styles.cellSurfaceLevel3].join(" ")}
          >
            <div className={[styles.trayHeaderRow, "items-center"].join(" ")}>
              <div className={[styles.trayHeaderMeta, "py-0.5"].join(" ")}>
                <strong className={styles.trayGridCellId}>{tent.name}</strong>
              </div>
              <div className={styles.trayHeaderActions}>
                <span className={styles.recipeLegendItem}>
                  {tent.slots.length} {tent.slots.length === 1 ? "slot" : "slots"}
                </span>
                {selectedInTent.length > 0 ? (
                  <TooltipIconButton
                    label="Return selected trays to unplaced"
                    icon={<Trash2 size={16} />}
                    onClick={() => onReturnSelectedFromTent(tent.tent_id)}
                    variant="destructive"
                  />
                ) : null}
              </div>
            </div>

            <div className={styles.tentShelfRow}>
              {Array.from(slotsByShelf.entries()).map(([shelfIndex, shelfSlots]) => (
                <article key={`${tent.tent_id}-shelf-${shelfIndex}`} className={[styles.tentShelfCard, styles.cellSurfaceLevel2].join(" ")}>
                  <div className={[styles.trayHeaderRow, "items-center"].join(" ")}>
                    <div className={[styles.trayHeaderMeta, "py-0.5"].join(" ")}>
                      <strong className={styles.trayGridCellId}>Shelf {shelfIndex}</strong>
                    </div>
                  </div>

                  <div className={styles.tentShelfSlotGrid}>
                    {shelfSlots.map((slot) => (
                      <SlotCell
                        key={slot.slot_id}
                        slot={slot}
                        trayId={draftSlotToTray.get(slot.slot_id) || null}
                        destinationSlotId={destinationSlotId}
                        dirty={dirtySlotIds.has(slot.slot_id)}
                        onToggleDestinationSlot={onToggleDestinationSlot}
                        renderTrayCell={renderTrayCell}
                      />
                    ))}
                  </div>
                </article>
              ))}
              {tent.slots.length === 0 ? <span className="text-sm text-muted-foreground">No slots generated.</span> : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

type SlotCellProps = {
  slot: SlotSummary;
  trayId: string | null;
  destinationSlotId: string;
  dirty: boolean;
  onToggleDestinationSlot: (slotId: string) => void;
  renderTrayCell: (trayId: string, inSlot?: boolean) => ReactNode;
};

function SlotCell({
  slot,
  trayId,
  destinationSlotId,
  dirty,
  onToggleDestinationSlot,
  renderTrayCell,
}: SlotCellProps) {
  const slotSelected = destinationSlotId === slot.slot_id;
  if (trayId) {
    return <div className={styles.slotTrayCellFill}>{renderTrayCell(trayId, true)}</div>;
  }
  return (
    <div
      className={[
        styles.slotCell,
        styles.slotContainerCellFrame,
        styles.cellSurfaceLevel1,
        dirty ? styles.draftChangedSurface : "",
        slotSelected ? styles.plantCellSelected : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {dirty ? <DraftChangeMarker /> : null}
      {slotSelected ? (
        <span className={styles.plantCellCheck}>
          <Check size={12} />
        </span>
      ) : null}
      <span className={styles.slotCellLabel}>{slot.code}</span>
      <button
        type="button"
        className={[styles.slotCellEmpty, slotSelected ? styles.slotCellEmptyActive : ""]
          .filter(Boolean)
          .join(" ")}
        onClick={() => onToggleDestinationSlot(slot.slot_id)}
      >
        Empty
      </button>
    </div>
  );
}
