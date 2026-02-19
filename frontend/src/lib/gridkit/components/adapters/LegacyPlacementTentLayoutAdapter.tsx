import { Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { TooltipIconButton } from "@/src/components/ui/tooltip-icon-button";
import { experimentsStyles as styles } from "@/src/components/ui/experiments-styles";
import type { ChipSpec } from "@/src/lib/gridkit/spec";
import type { TentLayoutSpec, TentSpec } from "@/src/lib/gridkit/spec";
import { createPositionRendererMap, PositionStripWithRenderers, type PositionRendererMap } from "@/src/lib/gridkit/renderers";
import { SlotCell } from "../cells";
import { ShelfCard, ShelfStack, TentCard, TentGrid } from "../containers";

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
  const placementRenderers: PositionRendererMap = createPositionRendererMap({
    tray: ({ position }) => {
      if (position.occupant.kind !== "tray") {
        return null;
      }
      return (
        <div className={styles.slotTrayCellFill}>{renderTrayCell(position.occupant.trayId, true)}</div>
      );
    },
    trayStack: ({ position }) => {
      if (position.occupant.kind !== "trayStack" || position.occupant.trays.length === 0) {
        return null;
      }
      return (
        <div className={styles.slotTrayCellFill}>
          {renderTrayCell(position.occupant.trays[0].trayId, true)}
        </div>
      );
    },
    emptySlot: ({ position }) => {
      const slotSelected = Boolean(position.state?.selected);
      const dirty = position.state?.tone === "warn";
      const slotLabel =
        (typeof position.label === "string" && position.label.trim()) ||
        (position.occupant.kind === "emptySlot" ? position.occupant.label : "") ||
        `Slot ${position.positionIndex}`;
      const chips: ChipSpec[] = [];
      if (dirty) {
        chips.push({
          id: `${position.id}-dirty`,
          label: "•",
          tone: "warn",
          placement: "tl",
        });
      }
      if (slotSelected) {
        chips.push({
          id: `${position.id}-selected`,
          label: "✓",
          tone: "info",
          placement: "tr",
        });
      }

      return (
        <SlotCell
          position={position}
          variant="empty"
          state={{
            selected: slotSelected,
            tone: dirty ? "warn" : undefined,
          }}
          interactive
          onPress={() => onToggleDestinationSlot(position.id)}
          ariaLabel={slotLabel}
          chips={chips}
          className={cn(styles.slotCell, styles.slotContainerCellFrame)}
          titleClassName={styles.slotCellLabel}
          statusClassName={cn(styles.slotCellEmpty, slotSelected && styles.slotCellEmptyActive)}
        />
      );
    },
  });

  return (
    <TentGrid>
      {spec.tents.map((tent) => {
        const { selectedTrayIds, slotCount } = readTentMeta(tent);
        const tentChips: ChipSpec[] = [
          {
            id: `${tent.tentId}-slot-count`,
            label: `${slotCount} ${slotCount === 1 ? "slot" : "slots"}`,
            tone: "muted",
            placement: "top",
          },
        ];
        return (
          <TentCard
            key={tent.tentId}
            title={<span className={styles.trayGridCellId}>{tent.label}</span>}
            chips={tentChips}
            className={styles.cellSurfaceLevel3}
            actions={
              selectedTrayIds.length > 0 ? (
                <TooltipIconButton
                  label="Return selected trays to unplaced"
                  icon={<Trash2 size={16} />}
                  onClick={() => onReturnSelectedFromTent(tent.tentId)}
                  variant="destructive"
                />
              ) : null
            }
          >
            <ShelfStack>
              {tent.shelves.map((shelf) => (
                <ShelfCard
                  key={shelf.shelfId}
                  title={<span className={styles.trayGridCellId}>{shelf.label}</span>}
                  className={styles.cellSurfaceLevel2}
                >
                  <PositionStripWithRenderers
                    positions={shelf.positions}
                    ariaLabel={`${tent.label} ${shelf.label} positions`}
                    renderers={placementRenderers}
                  />
                </ShelfCard>
              ))}
              {slotCount === 0 ? <span className="text-sm text-muted-foreground">No slots generated.</span> : null}
            </ShelfStack>
          </TentCard>
        );
      })}
    </TentGrid>
  );
}
