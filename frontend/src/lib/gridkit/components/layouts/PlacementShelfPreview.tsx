import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { StepAdjustButton } from "@/src/components/ui/step-adjust-button";
import { experimentsStyles as styles } from "@/src/components/ui/experiments-styles";
import type { ChipSpec } from "@/src/lib/gridkit/spec";
import type { TentSpec } from "@/src/lib/gridkit/spec";
import { createPositionRendererMap, PositionStripWithRenderers, type PositionRendererMap } from "@/src/lib/gridkit/renderers";
import { SlotCell } from "../cells";
import { ShelfCard, ShelfStack } from "../containers";

type PlacementShelfPreviewBaseProps = {
  tentSpec: TentSpec;
  onAdjustShelfSlotCount: (tentId: string, shelfIndex: number, delta: number) => void;
};

export type PlacementShelfPreviewProps = PlacementShelfPreviewBaseProps;

export function PlacementShelfPreview({
  tentSpec,
  onAdjustShelfSlotCount,
}: PlacementShelfPreviewProps) {
  const previewRenderers: PositionRendererMap = useMemo(
    () =>
      createPositionRendererMap({
        slotDef: ({ position }) => {
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
            <SlotCell
              position={position}
              variant="define"
              state={{ tone: isAddedSlot ? "warn" : undefined }}
              chips={chips}
              className={cn(
                styles.trayGridCell,
                "justify-items-center text-center",
                isDraft && "[grid-template-rows:auto_1fr]",
              )}
              titleClassName={styles.trayGridCellId}
            >
              {!isDraft && slotCode !== `Slot ${slotIndex}` ? (
                <span className="text-sm text-muted-foreground">{slotCode}</span>
              ) : null}
            </SlotCell>
          );
        },
      }),
    [],
  );

  return (
    <ShelfStack>
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
          <ShelfCard
            key={shelf.shelfId}
            title={shelf.label}
            chips={[
              {
                id: `${shelf.shelfId}-slot-count`,
                label: `${slotCount} ${slotCount === 1 ? "slot" : "slots"}`,
                tone: "muted",
                placement: "top",
              },
            ]}
            actions={
              <>
                <StepAdjustButton
                  direction="decrement"
                  onClick={() => onAdjustShelfSlotCount(tentSpec.tentId, shelfIndex - 1, -1)}
                  disabled={slotCount <= 0}
                />
                <StepAdjustButton
                  direction="increment"
                  onClick={() => onAdjustShelfSlotCount(tentSpec.tentId, shelfIndex - 1, 1)}
                />
              </>
            }
            className={cn(
              styles.cellSurfaceLevel2,
              shelfDirty && styles.draftChangedSurface,
            )}
          >
            {slotCount > 0 ? (
              <PositionStripWithRenderers
                positions={shelf.positions}
                className="[--gt-cell-min-height:6.5rem] [--gt-cell-pad:var(--gt-space-md)]"
                ariaLabel={`${shelf.label} preview positions`}
                renderers={previewRenderers}
              />
            ) : (
              <span className="text-sm text-muted-foreground">No slots.</span>
            )}
          </ShelfCard>
        );
      })}
      {tentSpec.shelves.length === 0 ? (
        <span className="text-sm text-muted-foreground">No shelves configured yet.</span>
      ) : null}
    </ShelfStack>
  );
}
