import { cn } from "@/lib/utils";
import { StepAdjustButton } from "@/src/components/ui/step-adjust-button";
import { experimentsStyles as styles } from "@/src/components/ui/experiments-styles";
import type { ChipSpec } from "@/src/lib/gridkit/spec";
import type { TentSpec } from "@/src/lib/gridkit/spec";
import { CellChrome } from "../CellChrome";
import { CellTitle } from "../CellText";

type LegacyPlacementShelfPreviewAdapterProps = {
  tentSpec: TentSpec;
  onAdjustShelfSlotCount: (tentId: string, shelfIndex: number, delta: number) => void;
};

// Temporary bridge adapter: step1 shelf spec -> current preview card markup.
export function LegacyPlacementShelfPreviewAdapter({
  tentSpec,
  onAdjustShelfSlotCount,
}: LegacyPlacementShelfPreviewAdapterProps) {
  return (
    <div className={styles.step1ShelfPreviewLane}>
      {tentSpec.shelves.map((shelf, shelfPosition) => {
        const shelfIndexRaw = (shelf.meta as { shelfIndex?: unknown } | undefined)?.shelfIndex;
        const shelfIndex = typeof shelfIndexRaw === "number" ? shelfIndexRaw : shelfPosition + 1;
        const isNewShelf = Boolean((shelf.meta as { isNewShelf?: unknown } | undefined)?.isNewShelf);
        const removedSlotsInShelf = Boolean(
          (shelf.meta as { removedSlotsInShelf?: unknown } | undefined)?.removedSlotsInShelf,
        );
        const shelfDirty = isNewShelf || removedSlotsInShelf;
        const slotCount = shelf.positions.length;

        return (
          <article
            key={shelf.shelfId}
            className={cn(
              styles.trayEditorCell,
              styles.step1ShelfPreviewCard,
              styles.cellSurfaceLevel2,
              shelfDirty && styles.draftChangedSurface,
            )}
          >
            <div className={styles.trayHeaderRow}>
              <div className={styles.trayHeaderMeta}>
                <strong>{shelf.label}</strong>
              </div>
              <div className={styles.trayHeaderActions}>
                <span className={styles.recipeLegendItem}>
                  {slotCount} {slotCount === 1 ? "slot" : "slots"}
                </span>
                <StepAdjustButton
                  direction="decrement"
                  onClick={() => onAdjustShelfSlotCount(tentSpec.tentId, shelfIndex - 1, -1)}
                  disabled={slotCount <= 0}
                />
                <StepAdjustButton
                  direction="increment"
                  onClick={() => onAdjustShelfSlotCount(tentSpec.tentId, shelfIndex - 1, 1)}
                />
              </div>
            </div>

            <div className={styles.step1ShelfPreviewSlotGrid}>
              {shelf.positions.map((position) => {
                if (position.occupant.kind !== "slotDef") {
                  return null;
                }

                const isAddedSlot = Boolean((position.meta as { isAddedSlot?: unknown } | undefined)?.isAddedSlot);
                const isDraft = Boolean(position.occupant.isDraft);
                const slotIndex = position.occupant.slotIndex;
                const slotCode = position.occupant.code;
                const chips: ChipSpec[] = [];
                if (isAddedSlot) {
                  chips.push({
                    id: `${position.id}-added`,
                    label: "•",
                    tone: "warn",
                    placement: "tl",
                  });
                }
                if (isDraft) {
                  chips.push({
                    id: `${position.id}-new`,
                    label: "New",
                    tone: "success",
                    placement: "bottom",
                  });
                }

                return (
                  <CellChrome
                    key={position.id}
                    state={{ tone: isAddedSlot ? "warn" : undefined }}
                    chips={chips}
                    className={cn(
                      styles.trayGridCell,
                      "justify-items-center text-center",
                      isDraft && "[grid-template-rows:auto_1fr]",
                    )}
                  >
                    <CellTitle className={styles.trayGridCellId}>{`Slot ${slotIndex}`}</CellTitle>
                    {!isDraft && slotCode !== `Slot ${slotIndex}` ? (
                      <span className="text-sm text-muted-foreground">{slotCode}</span>
                    ) : null}
                  </CellChrome>
                );
              })}
              {slotCount === 0 ? <span className="text-sm text-muted-foreground">No slots.</span> : null}
            </div>
          </article>
        );
      })}
      {tentSpec.shelves.length === 0 ? (
        <span className="text-sm text-muted-foreground">No shelves configured yet.</span>
      ) : null}
    </div>
  );
}
