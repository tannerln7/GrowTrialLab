import Link from "next/link";
import type * as React from "react";

import { cn } from "@/lib/utils";
import type { CellState, ChipSpec, DndSpec, PositionSpec } from "@/src/lib/gridkit/spec";
import { CellChrome } from "../CellChrome";
import { CellMeta, CellSubtitle, CellTitle } from "../CellText";
import { getGridCellDataAttributes } from "./dataAttributes";

type PlantCellProps = {
  plantId: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  position?: Pick<PositionSpec, "id" | "tentId" | "shelfId" | "positionIndex">;
  state?: CellState;
  chips?: ChipSpec[];
  dnd?: DndSpec;
  interactive?: boolean;
  onPress?: () => void;
  linkHref?: string;
  ariaLabel?: string;
  className?: string;
  contentClassName?: string;
  titleClassName?: string;
  subtitleClassName?: string;
  metaClassName?: string;
  meta?: React.ReactNode;
  children?: React.ReactNode;
};

export function PlantCell({
  plantId,
  title,
  subtitle,
  position,
  state,
  chips,
  dnd,
  interactive = false,
  onPress,
  linkHref,
  ariaLabel,
  className,
  contentClassName,
  titleClassName,
  subtitleClassName,
  metaClassName,
  meta,
  children,
}: PlantCellProps) {
  const content = (
    <div className={cn("grid h-full content-start gap-1", contentClassName)}>
      <CellTitle className={cn(titleClassName)}>{title}</CellTitle>
      {subtitle ? <CellSubtitle className={cn(subtitleClassName)}>{subtitle}</CellSubtitle> : null}
      {meta ? <CellMeta className={cn(metaClassName)}>{meta}</CellMeta> : null}
      {children}
    </div>
  );

  return (
    <CellChrome
      state={state}
      chips={chips}
      interactive={interactive}
      onPress={onPress}
      ariaLabel={ariaLabel || (typeof title === "string" ? title : plantId)}
      className={cn(className)}
      dataAttributes={getGridCellDataAttributes({
        cellKind: "plant",
        position,
        dnd,
      })}
    >
      {linkHref && !onPress ? (
        <Link href={linkHref} className="h-full">
          {content}
        </Link>
      ) : (
        content
      )}
    </CellChrome>
  );
}
