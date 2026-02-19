import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { experimentsStyles as styles } from "@/src/components/ui/experiments-styles";
import type { PlantOccupantSpec, PositionSpec, TentLayoutSpec, TrayOccupantSpec } from "@/src/lib/gridkit/spec";
import type { ChipSpec } from "@/src/lib/gridkit/spec";
import {
  createPositionRendererMap,
  PositionStripWithRenderers,
  type GridRenderContext,
  type PositionRendererMap,
} from "@/src/lib/gridkit/renderers";
import { TrayFolderProvider } from "@/src/lib/gridkit/state";
import { SlotCell, TrayCellExpandable } from "../cells";
import { ShelfCard, ShelfStack, TentCard, TentGrid } from "../containers";

function readTrayCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

type OverviewTentLayoutBaseProps = {
  spec: TentLayoutSpec;
  onTrayPlantPress?: (
    plantId: string,
    plant: PlantOccupantSpec,
    position: PositionSpec,
  ) => void;
};

export type OverviewTentLayoutProps = OverviewTentLayoutBaseProps;

export function OverviewTentLayout({
  spec,
  onTrayPlantPress,
}: OverviewTentLayoutProps) {
  const overviewRenderCtx: GridRenderContext = useMemo(
    () => ({
      trayFolder: {
        enabled: true,
        getPlantsForTray: (trayId, position) => {
          if (position.occupant.kind === "tray" && position.occupant.trayId === trayId) {
            return position.occupant.plants || [];
          }
          if (position.occupant.kind === "trayStack") {
            const tray = position.occupant.trays.find((entry) => entry.trayId === trayId);
            return tray?.plants || [];
          }
          return [];
        },
        onPlantPress: onTrayPlantPress,
      },
    }),
    [onTrayPlantPress],
  );

  const overviewRenderers: PositionRendererMap = useMemo(
    () =>
      createPositionRendererMap({
        emptySlot: ({ position }) => (
          <SlotCell
            position={position}
            variant="empty"
            className={cn(styles.slotCell, styles.overviewSlotCell, styles.overviewSlotCellEmpty)}
            titleClassName={styles.slotCellLabel}
            statusClassName={styles.overviewSlotEmptyState}
          />
        ),
        tray: ({ position, ctx }) => {
          if (position.occupant.kind !== "tray") {
            return null;
          }
          const plants =
            ctx.trayFolder?.getPlantsForTray(position.occupant.trayId, position) ||
            position.occupant.plants ||
            [];

          return (
            <div className="h-full min-h-[118px] max-sm:min-h-[104px]">
              <div className={styles.overviewSlotTrayStack}>
                <TrayCellExpandable
                  tray={position.occupant}
                  position={position}
                  plants={plants}
                  onPlantPress={ctx.trayFolder?.onPlantPress}
                  className={cn(styles.overviewTrayCell, "h-full")}
                  titleClassName={cn(styles.trayGridCellId, "text-left")}
                  metaClassName={styles.overviewTrayMeta}
                  triggerMeta={
                    position.occupant.currentCount != null &&
                    position.occupant.capacity != null ? (
                      <span className={cn(styles.recipeLegendItem, "shrink-0")}>
                        {position.occupant.currentCount}/{position.occupant.capacity}
                      </span>
                    ) : null
                  }
                />
              </div>
            </div>
          );
        },
        trayStack: ({ position, ctx }) => {
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
                  <TrayCellExpandable
                    key={tray.id}
                    tray={tray}
                    position={position}
                    plants={ctx.trayFolder?.getPlantsForTray(tray.trayId, position) || tray.plants || []}
                    onPlantPress={ctx.trayFolder?.onPlantPress}
                    className={cn(styles.overviewTrayCell, trays.length === 1 ? "h-full" : "")}
                    titleClassName={cn(styles.trayGridCellId, "text-left")}
                    metaClassName={styles.overviewTrayMeta}
                    triggerMeta={
                      tray.currentCount != null && tray.capacity != null ? (
                        <span className={cn(styles.recipeLegendItem, "shrink-0")}>
                          {tray.currentCount}/{tray.capacity}
                        </span>
                      ) : null
                    }
                  />
                ))}
              </div>
            </div>
          );
        },
      }),
    [],
  );

  return (
    <TrayFolderProvider>
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
                        ctx={overviewRenderCtx}
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
    </TrayFolderProvider>
  );
}
