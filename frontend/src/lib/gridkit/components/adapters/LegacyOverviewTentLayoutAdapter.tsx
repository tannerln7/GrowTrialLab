import { cn } from "@/lib/utils";
import { experimentsStyles as styles } from "@/src/components/ui/experiments-styles";
import type { PlantOccupantSpec, TentLayoutSpec, TrayOccupantSpec } from "@/src/lib/gridkit/spec";
import type { ChipSpec } from "@/src/lib/gridkit/spec";
import { createPositionRendererMap, PositionStripWithRenderers, type PositionRendererMap } from "@/src/lib/gridkit/renderers";
import type { ReactNode } from "react";
import { SlotCell, TrayCell } from "../cells";
import { ShelfCard, ShelfStack, TentCard, TentGrid } from "../containers";

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
  const overviewRenderers: PositionRendererMap = createPositionRendererMap({
    emptySlot: ({ position }) => (
      <SlotCell
        position={position}
        variant="empty"
        className={cn(styles.slotCell, styles.overviewSlotCell, styles.overviewSlotCellEmpty)}
        titleClassName={styles.slotCellLabel}
        statusClassName={styles.overviewSlotEmptyState}
      />
    ),
    tray: ({ position }) => {
      if (position.occupant.kind !== "tray") {
        return null;
      }

      return (
        <div className="h-full min-h-[118px] max-sm:min-h-[104px]">
          <div className={styles.overviewSlotTrayStack}>
            <TrayCell
              trayId={position.occupant.trayId}
              title={position.occupant.title}
              position={position}
              state={position.occupant.state || position.state}
              chips={position.occupant.chips || position.chips}
              dnd={position.occupant.dnd || position.dnd}
              className={cn(styles.overviewTrayCell, "h-full")}
              titleClassName={cn(styles.trayGridCellId, "text-left")}
              metaClassName={styles.overviewTrayMeta}
              meta={
                position.occupant.currentCount != null &&
                position.occupant.capacity != null ? (
                  <span className={cn(styles.recipeLegendItem, "shrink-0")}>
                    {position.occupant.currentCount}/{position.occupant.capacity}
                  </span>
                ) : null
              }
            >
              <div className={cn(styles.plantCellGridTray, styles.cellGridResponsive)} data-cell-size="sm">
                {(position.occupant.plants || []).map((plant) => renderPlantCell(plant))}
              </div>
            </TrayCell>
          </div>
        </div>
      );
    },
    trayStack: ({ position }) => {
      const trays: TrayOccupantSpec[] =
        position.occupant.kind === "trayStack" ? position.occupant.trays : [];
      if (trays.length === 0) {
        return (
          <SlotCell
            position={position}
            variant="empty"
            className={cn(styles.slotCell, styles.overviewSlotCell, styles.overviewSlotCellEmpty)}
            titleClassName={styles.slotCellLabel}
            statusClassName={styles.overviewSlotEmptyState}
          />
        );
      }

      return (
        <div className="h-full min-h-[118px] max-sm:min-h-[104px]">
          <div className={styles.overviewSlotTrayStack}>
            {trays.map((tray) => (
              <TrayCell
                key={tray.id}
                trayId={tray.trayId}
                title={tray.title}
                position={position}
                state={tray.state || position.state}
                chips={tray.chips || position.chips}
                dnd={tray.dnd || position.dnd}
                className={cn(styles.overviewTrayCell, trays.length === 1 ? "h-full" : "")}
                titleClassName={cn(styles.trayGridCellId, "text-left")}
                metaClassName={styles.overviewTrayMeta}
                meta={
                  tray.currentCount != null && tray.capacity != null ? (
                    <span className={cn(styles.recipeLegendItem, "shrink-0")}>
                      {tray.currentCount}/{tray.capacity}
                    </span>
                  ) : null
                }
              >
                <div className={cn(styles.plantCellGridTray, styles.cellGridResponsive)} data-cell-size="sm">
                  {(tray.plants || []).map((plant) => renderPlantCell(plant))}
                </div>
              </TrayCell>
            ))}
          </div>
        </div>
      );
    },
  });

  return (
    <TentGrid>
      {spec.tents.map((tent) => {
        const trayCount = readTrayCount((tent.meta as { trayCount?: unknown } | undefined)?.trayCount);
        const plantCount = readTrayCount((tent.meta as { plantCount?: unknown } | undefined)?.plantCount);
        const tentChips: ChipSpec[] = [
          {
            id: `${tent.tentId}-trays`,
            label: `${trayCount} tray(s)`,
            tone: "muted",
            placement: "top",
          },
          {
            id: `${tent.tentId}-plants`,
            label: `${plantCount} plant(s)`,
            tone: "muted",
            placement: "top",
          },
        ];

        return (
          <TentCard
            key={tent.tentId}
            title={tent.label}
            chips={tentChips}
            className={styles.cellSurfaceLevel4}
          >
            <ShelfStack>
              {tent.shelves.map((shelf, shelfPosition) => {
                const shelfIndexRaw = (shelf.meta as { shelfIndex?: unknown } | undefined)?.shelfIndex;
                const shelfIndex = typeof shelfIndexRaw === "number" ? shelfIndexRaw : shelfPosition + 1;

                return (
                  <ShelfCard
                    key={shelf.shelfId}
                    title={<span className={styles.overviewShelfLabel}>{`Shelf ${shelfIndex}`}</span>}
                  >
                    <PositionStripWithRenderers
                      positions={shelf.positions}
                      pageGridClassName="max-sm:gap-1"
                      ariaLabel={`${tent.label} shelf ${shelfIndex} positions`}
                      renderers={overviewRenderers}
                    />
                  </ShelfCard>
                );
              })}
              {tent.shelves.length === 0 ? (
                <p className="text-sm text-muted-foreground">No mapped slots.</p>
              ) : null}
            </ShelfStack>
          </TentCard>
        );
      })}
    </TentGrid>
  );
}
