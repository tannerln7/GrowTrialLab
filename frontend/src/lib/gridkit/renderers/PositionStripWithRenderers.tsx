import { useCallback, useMemo } from "react";

import { POSITION_STRIP_PRESET } from "@/src/lib/gridkit/presets";
import type { PositionSpec } from "@/src/lib/gridkit/spec";
import { PositionStrip } from "../components/PositionStrip";
import { createPositionRendererMap } from "./defaultPositionRenderers";
import type { GridRenderContext, PositionRendererMap } from "./types";

type PositionStripWithRenderersProps = {
  positions: PositionSpec[];
  renderers?: PositionRendererMap;
  ctx?: GridRenderContext;
  pageSize?: number;
  columnsMode?: "fit" | "fixed";
  fixedColumns?: number;
  className?: string;
  pageGridClassName?: string;
  positionClassName?: string;
  ariaLabel?: string;
};

const EMPTY_CONTEXT: GridRenderContext = {};

export function PositionStripWithRenderers({
  positions,
  renderers,
  ctx,
  pageSize = POSITION_STRIP_PRESET.maxVisible,
  columnsMode = "fit",
  fixedColumns,
  className,
  pageGridClassName,
  positionClassName,
  ariaLabel,
}: PositionStripWithRenderersProps) {
  const resolvedContext = ctx || EMPTY_CONTEXT;
  const resolvedRenderers = useMemo(
    () => createPositionRendererMap(renderers),
    [renderers],
  );
  const renderPosition = useCallback(
    (position: PositionSpec) => {
      const renderer = resolvedRenderers[position.occupant.kind];
      if (!renderer) {
        return null;
      }
      return renderer({
        position,
        ctx: resolvedContext,
      });
    },
    [resolvedContext, resolvedRenderers],
  );

  return (
    <PositionStrip
      positions={positions}
      pageSize={pageSize}
      columnsMode={columnsMode}
      fixedColumns={fixedColumns}
      className={className}
      pageGridClassName={pageGridClassName}
      positionClassName={positionClassName}
      ariaLabel={ariaLabel}
      renderPosition={renderPosition}
    />
  );
}
