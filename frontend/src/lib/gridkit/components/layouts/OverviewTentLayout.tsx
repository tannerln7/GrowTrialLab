import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { experimentsStyles as styles } from "@/src/components/ui/experiments-styles";
import { POSITION_STRIP_PRESET } from "@/src/lib/gridkit/presets";
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

function withOverviewOccupancyChip(
  tray: TrayOccupantSpec,
  occupancy: {
    currentCount: number | null | undefined;
    capacity: number | null | undefined;
  },
): TrayOccupantSpec {
  if (occupancy.currentCount == null || occupancy.capacity == null) {
    return tray;
  }

  return {
    ...tray,
    chips: [
      ...(tray.chips || []),
      {
        id: `${tray.id}-occupancy`,
        label: `${occupancy.currentCount}/${occupancy.capacity} Plants`,
        tone: "muted",
        placement: "bottom",
      },
    ],
  };
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
            titleClassName={cn(styles.slotCellLabel, "w-full text-center")}
            statusClassName={cn(styles.overviewSlotEmptyState, "grow")}
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
                  tray={withOverviewOccupancyChip(
                    {
                      ...position.occupant,
                      summaryLines: [],
                      currentCount: null,
                      capacity: null,
                    },
                    {
                      currentCount: position.occupant.currentCount,
                      capacity: position.occupant.capacity,
                    },
                  )}
                  position={position}
                  plants={plants}
                  onPlantPress={ctx.trayFolder?.onPlantPress}
                  className={cn(styles.overviewTrayCell, "h-full")}
                  titleClassName={cn(styles.trayGridCellId, "w-full text-center")}
                  metaClassName={cn(styles.overviewTrayMeta, "mt-auto justify-center")}
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
                titleClassName={cn(styles.slotCellLabel, "w-full text-center")}
                statusClassName={cn(styles.overviewSlotEmptyState, "grow")}
              />
            );
          }

          return (
            <div className="h-full min-h-[118px] max-sm:min-h-[104px]">
              <div className={styles.overviewSlotTrayStack}>
                {trays.map((tray) => (
                  <TrayCellExpandable
                    key={tray.id}
                    tray={withOverviewOccupancyChip(
                      {
                        ...tray,
                        summaryLines: [],
                        currentCount: null,
                        capacity: null,
                      },
                      {
                        currentCount: tray.currentCount,
                        capacity: tray.capacity,
                      },
                    )}
                    position={position}
                    plants={ctx.trayFolder?.getPlantsForTray(tray.trayId, position) || tray.plants || []}
                    onPlantPress={ctx.trayFolder?.onPlantPress}
                    className={cn(styles.overviewTrayCell, trays.length === 1 ? "h-full" : "")}
                    titleClassName={cn(styles.trayGridCellId, "w-full text-center")}
                    metaClassName={cn(styles.overviewTrayMeta, "mt-auto justify-center")}
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
                        columnsMode="fixed"
                        fixedColumns={POSITION_STRIP_PRESET.maxVisible}
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
