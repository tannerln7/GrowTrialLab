import type { ReactNode } from "react";

import type { OccupantKind, PositionSpec } from "@/src/lib/gridkit/spec";

export type GridRenderActions = {
  onTrayPress?: (trayId: string, position: PositionSpec) => void;
  onSlotPress?: (position: PositionSpec) => void;
  onPlantPress?: (plantId: string, position: PositionSpec) => void;
};

export type GridRenderContext = {
  mode?: string;
  actions?: GridRenderActions;
};

export type OccupantRenderer = (args: {
  position: PositionSpec;
  ctx: GridRenderContext;
}) => ReactNode;

export type PositionRendererMap = Partial<Record<OccupantKind, OccupantRenderer>>;
