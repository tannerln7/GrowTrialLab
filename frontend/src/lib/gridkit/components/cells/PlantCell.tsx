import Link from "next/link";
import type * as React from "react";

import { cn } from "@/lib/utils";
import type { CellState, ChipSpec, DndSpec, PositionSpec } from "@/src/lib/gridkit/spec";
import { CellChrome } from "../CellChrome";
import { CellMeta, CellSubtitle, CellTitle } from "../CellText";
import { getGridCellDataAttributes } from "./dataAttributes";
import { LEAF_CONTENT_CLASS_NAME, LEAF_SIZING_CLASS_NAME } from "./leafSizing";

type PlantCellProps = {
  plantId: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  grade?: string | null;
  recipeCode?: string | null;
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
  grade,
  recipeCode,
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
  const hasGradeRecipeChips = grade !== undefined || recipeCode !== undefined;
  const resolvedChips: ChipSpec[] | undefined = hasGradeRecipeChips
    ? [
        ...(chips || []),
        {
          id: `${plantId}-grade`,
          label: `G:${(grade || "").trim() || "-"}`,
          tone: grade ? "success" : "muted",
          placement: "bl",
        },
        {
          id: `${plantId}-recipe`,
          label: `R:${((recipeCode || "").trim().replace(/^R[\s:-]*/i, "") || "-")}`,
          tone: recipeCode ? "success" : "muted",
          placement: "br",
        },
      ]
    : chips;

  const content = (
    <div className={cn(LEAF_CONTENT_CLASS_NAME, contentClassName)}>
      <CellTitle className={cn(titleClassName)}>{title}</CellTitle>
      {subtitle ? <CellSubtitle className={cn(subtitleClassName)}>{subtitle}</CellSubtitle> : null}
      {meta ? <CellMeta className={cn(metaClassName)}>{meta}</CellMeta> : null}
      {children}
    </div>
  );

  return (
    <CellChrome
      state={state}
      chips={resolvedChips}
      interactive={interactive}
      onPress={onPress}
      ariaLabel={ariaLabel || (typeof title === "string" ? title : plantId)}
      className={cn(LEAF_SIZING_CLASS_NAME, className)}
      dataAttributes={getGridCellDataAttributes({
        cellKind: "plant",
        position,
        dnd,
      })}
    >
      {linkHref && !onPress ? (
        <Link href={linkHref} className="block h-full w-full">
          {content}
        </Link>
      ) : (
        content
      )}
    </CellChrome>
  );
}
