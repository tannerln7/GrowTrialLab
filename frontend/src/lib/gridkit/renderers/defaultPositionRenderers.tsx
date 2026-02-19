import { PlantCell } from "@/src/lib/gridkit/components/cells/PlantCell";
import { SlotCell } from "@/src/lib/gridkit/components/cells/SlotCell";
import { TrayCell } from "@/src/lib/gridkit/components/cells/TrayCell";
import { TrayCellExpandable } from "@/src/lib/gridkit/components/cells/TrayCellExpandable";
import type { PositionRendererMap } from "./types";

export const defaultPositionRendererMap: PositionRendererMap = {
  emptySlot: ({ position, ctx }) => (
    <SlotCell
      position={position}
      variant="empty"
      interactive={Boolean(ctx.actions?.onSlotPress)}
      onPress={ctx.actions?.onSlotPress ? () => ctx.actions?.onSlotPress?.(position) : undefined}
    />
  ),
  slotDef: ({ position, ctx }) => (
    <SlotCell
      position={position}
      variant="define"
      interactive={Boolean(ctx.actions?.onSlotPress)}
      onPress={ctx.actions?.onSlotPress ? () => ctx.actions?.onSlotPress?.(position) : undefined}
    />
  ),
  tray: ({ position, ctx }) => {
    const occupant = position.occupant;
    if (occupant.kind !== "tray") {
      return null;
    }
    const trayFolderEnabled = Boolean(ctx.trayFolder?.enabled);
    const trayPlants = trayFolderEnabled
      ? ctx.trayFolder?.getPlantsForTray(occupant.trayId, position) || []
      : [];

    if (trayFolderEnabled && trayPlants.length > 0) {
      return (
        <TrayCellExpandable
          tray={occupant}
          position={position}
          plants={trayPlants}
          onTrayPress={ctx.actions?.onTrayPress}
          onPlantPress={ctx.trayFolder?.onPlantPress}
        />
      );
    }

    return (
      <TrayCell
        trayId={occupant.trayId}
        title={occupant.title}
        summaryLines={occupant.summaryLines}
        currentCount={occupant.currentCount}
        capacity={occupant.capacity}
        position={position}
        state={occupant.state || position.state}
        chips={occupant.chips || position.chips}
        dnd={occupant.dnd || position.dnd}
        interactive={Boolean(ctx.actions?.onTrayPress)}
        onPress={
          ctx.actions?.onTrayPress
            ? () => ctx.actions?.onTrayPress?.(occupant.trayId, position)
            : undefined
        }
      />
    );
  },
  trayStack: ({ position, ctx }) => {
    const occupant = position.occupant;
    if (occupant.kind !== "trayStack" || occupant.trays.length === 0) {
      return (
        <SlotCell
          position={position}
          variant="empty"
          interactive={Boolean(ctx.actions?.onSlotPress)}
          onPress={ctx.actions?.onSlotPress ? () => ctx.actions?.onSlotPress?.(position) : undefined}
        />
      );
    }
    const primaryTray = occupant.trays[0];
    return (
      <TrayCell
        trayId={primaryTray.trayId}
        title={primaryTray.title}
        summaryLines={[
          `${occupant.trays.length} trays in slot`,
          ...(primaryTray.summaryLines || []),
        ]}
        currentCount={primaryTray.currentCount}
        capacity={primaryTray.capacity}
        position={position}
        state={primaryTray.state || position.state}
        chips={primaryTray.chips || position.chips}
        dnd={primaryTray.dnd || position.dnd}
        interactive={Boolean(ctx.actions?.onTrayPress)}
        onPress={
          ctx.actions?.onTrayPress
            ? () => ctx.actions?.onTrayPress?.(primaryTray.trayId, position)
            : undefined
        }
      />
    );
  },
  plant: ({ position, ctx }) => {
    const occupant = position.occupant;
    if (occupant.kind !== "plant") {
      return null;
    }
    return (
      <PlantCell
        plantId={occupant.plantId}
        title={occupant.title}
        subtitle={occupant.subtitle}
        position={position}
        state={occupant.state || position.state}
        chips={occupant.chips || position.chips}
        dnd={occupant.dnd || position.dnd}
        interactive={Boolean(ctx.actions?.onPlantPress)}
        onPress={
          ctx.actions?.onPlantPress
            ? () => ctx.actions?.onPlantPress?.(occupant.plantId, position)
            : undefined
        }
      />
    );
  },
};

export function createPositionRendererMap(
  overrides?: PositionRendererMap,
): PositionRendererMap {
  return {
    ...defaultPositionRendererMap,
    ...(overrides || {}),
  };
}
