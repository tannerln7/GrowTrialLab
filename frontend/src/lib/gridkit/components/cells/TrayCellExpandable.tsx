"use client";

import type { ReactNode } from "react";

import { TrayFolderOverlay } from "@/src/lib/gridkit/components/overlays/TrayFolderOverlay";
import { useTrayFolderManager } from "@/src/lib/gridkit/state/trayFolderManager";
import type {
  PlantOccupantSpec,
  PositionSpec,
  TrayOccupantSpec,
} from "@/src/lib/gridkit/spec";
import { TrayPlantGrid } from "../grids/TrayPlantGrid";
import { TrayCell } from "./TrayCell";

type TrayCellExpandableProps = {
  position: PositionSpec;
  tray: TrayOccupantSpec;
  plants: PlantOccupantSpec[];
  onPlantPress?: (plantId: string, plant: PlantOccupantSpec, position: PositionSpec) => void;
  onTrayPress?: (trayId: string, position: PositionSpec) => void;
  overlayTitle?: ReactNode;
  triggerMeta?: ReactNode;
  className?: string;
  titleClassName?: string;
  metaClassName?: string;
};

export function TrayCellExpandable({
  position,
  tray,
  plants,
  onPlantPress,
  onTrayPress,
  overlayTitle,
  triggerMeta,
  className,
  titleClassName,
  metaClassName,
}: TrayCellExpandableProps) {
  const manager = useTrayFolderManager();
  const trayKey = `tray-folder:${tray.trayId}:${position.id}`;
  const open = manager.isOpen(trayKey);
  const canExpand = plants.length > 0;

  const handleTrayPress = () => {
    onTrayPress?.(tray.trayId, position);
    if (!canExpand) {
      return;
    }
    manager.toggle(trayKey);
  };

  return (
    <TrayFolderOverlay
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          manager.open(trayKey);
        } else {
          manager.close();
        }
      }}
      title={overlayTitle || tray.title}
      trigger={
        <TrayCell
          trayId={tray.trayId}
          title={tray.title}
          summaryLines={tray.summaryLines}
          currentCount={tray.currentCount}
          capacity={tray.capacity}
          position={position}
          state={tray.state}
          chips={tray.chips}
          dnd={tray.dnd}
          interactive={Boolean(onTrayPress) || canExpand}
          onPress={handleTrayPress}
          className={className}
          titleClassName={titleClassName}
          metaClassName={metaClassName}
          meta={
            triggerMeta ||
            (tray.currentCount != null && tray.capacity != null
              ? `${tray.currentCount}/${tray.capacity}`
              : undefined)
          }
        />
      }
    >
      <TrayPlantGrid
        plants={plants}
        position={position}
        onPlantPress={
          onPlantPress ? (plantId, plant) => onPlantPress(plantId, plant, position) : undefined
        }
      />
    </TrayFolderOverlay>
  );
}
