import type * as React from "react";

import { cn } from "@/lib/utils";
import type { CellState, ChipSpec, DndSpec, PositionSpec } from "@/src/lib/gridkit/spec";
import { CellChrome } from "../CellChrome";
import { CellMeta, CellSubtitle, CellTitle } from "../CellText";
import { getGridCellDataAttributes } from "./dataAttributes";
import { LEAF_CONTENT_CLASS_NAME, LEAF_SIZING_CLASS_NAME } from "./leafSizing";

type TrayCellProps = {
  trayId: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  summaryLines?: string[];
  currentCount?: number | null;
  capacity?: number | null;
  position?: Pick<PositionSpec, "id" | "tentId" | "shelfId" | "positionIndex">;
  state?: CellState;
  chips?: ChipSpec[];
  dnd?: DndSpec;
  interactive?: boolean;
  onPress?: () => void;
  ariaLabel?: string;
  className?: string;
  contentClassName?: string;
  titleClassName?: string;
  summaryClassName?: string;
  metaClassName?: string;
  meta?: React.ReactNode;
  children?: React.ReactNode;
  interactiveElement?: "button" | "div";
};

export function TrayCell({
  trayId,
  title,
  subtitle,
  summaryLines = [],
  currentCount,
  capacity,
  position,
  state,
  chips,
  dnd,
  interactive = false,
  onPress,
  ariaLabel,
  className,
  contentClassName,
  titleClassName,
  summaryClassName,
  metaClassName,
  meta,
  children,
  interactiveElement,
}: TrayCellProps) {
  const resolvedSummaryLines = summaryLines.length
    ? summaryLines
    : currentCount != null && capacity != null
      ? [`${currentCount}/${capacity}`]
      : [];

  return (
    <CellChrome
      state={state}
      chips={chips}
      interactive={interactive}
      interactiveElement={interactiveElement}
      onPress={onPress}
      ariaLabel={ariaLabel || (typeof title === "string" ? title : trayId)}
      className={cn(LEAF_SIZING_CLASS_NAME, className)}
      dataAttributes={getGridCellDataAttributes({
        cellKind: "tray",
        position,
        dnd,
      })}
    >
      <div className={cn(LEAF_CONTENT_CLASS_NAME, contentClassName)}>
        <CellTitle className={cn(titleClassName)}>{title}</CellTitle>
        {subtitle ? <CellSubtitle>{subtitle}</CellSubtitle> : null}
        {meta ? <CellMeta className={cn(metaClassName)}>{meta}</CellMeta> : null}
        {resolvedSummaryLines.length > 0 ? (
          <div className={cn("grid gap-1", summaryClassName)}>
            {resolvedSummaryLines.map((line, index) => (
              <span key={`${trayId}-summary-${index}`} className="text-xs text-muted-foreground">
                {line}
              </span>
            ))}
          </div>
        ) : null}
        {children ? <div className="min-h-0 flex-1">{children}</div> : null}
      </div>
    </CellChrome>
  );
}
