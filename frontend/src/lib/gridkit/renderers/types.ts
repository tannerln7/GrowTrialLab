import type { ReactNode } from "react";

import type { OccupantKind, PlantOccupantSpec, PositionSpec } from "@/src/lib/gridkit/spec";

export type GridRenderActions = {
  onTrayPress?: (trayId: string, position: PositionSpec) => void;
  onSlotPress?: (position: PositionSpec) => void;
  onPlantPress?: (plantId: string, position: PositionSpec) => void;
};

export type GridRenderContext = {
  mode?: string;
  actions?: GridRenderActions;
  trayFolder?: {
    enabled: boolean;
    getPlantsForTray: (trayId: string, position: PositionSpec) => PlantOccupantSpec[];
    onPlantPress?: (plantId: string, plant: PlantOccupantSpec, position: PositionSpec) => void;
  };
};

export type OccupantRenderer = (args: {
  position: PositionSpec;
  ctx: GridRenderContext;
}) => ReactNode;

export type PositionRendererMap = Partial<Record<OccupantKind, OccupantRenderer>>;
