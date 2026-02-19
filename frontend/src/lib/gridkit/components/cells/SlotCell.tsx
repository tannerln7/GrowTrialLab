import type * as React from "react";

import { cn } from "@/lib/utils";
import type {
  CellState,
  ChipSpec,
  DndSpec,
  PositionSpec,
} from "@/src/lib/gridkit/spec";
import { CellChrome } from "../CellChrome";
import { CellSubtitle, CellTitle } from "../CellText";
import { getGridCellDataAttributes } from "./dataAttributes";
import { LEAF_CONTENT_CLASS_NAME, LEAF_SIZING_CLASS_NAME } from "./leafSizing";

export type SlotCellVariant = "empty" | "define";

type SlotPositionSpec = Pick<
  PositionSpec,
  "id" | "tentId" | "shelfId" | "positionIndex" | "label" | "state" | "chips" | "dnd"
> & {
  occupant: PositionSpec["occupant"];
};

type SlotCellProps = {
  position?: SlotPositionSpec;
  variant?: SlotCellVariant;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  statusLabel?: string;
  state?: CellState;
  chips?: ChipSpec[];
  dnd?: DndSpec;
  interactive?: boolean;
  onPress?: () => void;
  ariaLabel?: string;
  className?: string;
  titleClassName?: string;
  subtitleClassName?: string;
  statusClassName?: string;
  children?: React.ReactNode;
};

export function SlotCell({
  position,
  variant,
  title,
  subtitle,
  statusLabel,
  state,
  chips,
  dnd,
  interactive = false,
  onPress,
  ariaLabel,
  className,
  titleClassName,
  subtitleClassName,
  statusClassName,
  children,
}: SlotCellProps) {
  const resolvedVariant: SlotCellVariant =
    variant || (position?.occupant.kind === "slotDef" ? "define" : "empty");
  const resolvedState = state || position?.state || position?.occupant.state;
  const resolvedChips = chips || position?.chips || position?.occupant.chips;
  const resolvedDnd = dnd || position?.dnd || position?.occupant.dnd;
  const slotIndex =
    position?.occupant.kind === "slotDef" || position?.occupant.kind === "emptySlot"
      ? position.occupant.slotIndex
      : position?.positionIndex || 0;
  const slotLabel =
    title ||
    position?.label ||
    (position?.occupant.kind === "slotDef"
      ? position.occupant.code
      : position?.occupant.kind === "emptySlot"
        ? position.occupant.label
        : null) ||
    `Slot ${slotIndex}`;
  const defaultSubtitle =
    resolvedVariant === "define"
      ? subtitle ||
        (position?.occupant.kind === "slotDef" &&
        position.occupant.code !== `Slot ${position.occupant.slotIndex}`
          ? position.occupant.code
          : null)
      : subtitle;
  const emptyStatus = resolvedVariant === "empty" ? statusLabel || "Empty" : null;

  return (
    <CellChrome
      state={resolvedState}
      chips={resolvedChips}
      interactive={interactive}
      onPress={onPress}
      ariaLabel={ariaLabel || (typeof slotLabel === "string" ? slotLabel : "Slot")}
      className={cn(LEAF_SIZING_CLASS_NAME, className)}
      dataAttributes={getGridCellDataAttributes({
        cellKind: "slot",
        position,
        dnd: resolvedDnd,
      })}
    >
      <div className={LEAF_CONTENT_CLASS_NAME}>
        <CellTitle className={cn(titleClassName)}>{slotLabel}</CellTitle>
        {defaultSubtitle ? (
          <CellSubtitle className={cn(subtitleClassName)}>{defaultSubtitle}</CellSubtitle>
        ) : null}
        {emptyStatus ? (
          <span className={cn("text-sm text-muted-foreground", statusClassName)}>{emptyStatus}</span>
        ) : null}
        {children}
      </div>
    </CellChrome>
  );
}
