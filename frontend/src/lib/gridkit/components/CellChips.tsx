import { cn } from "@/lib/utils";

import type { ChipSpec } from "../spec";

type CellChipsProps = {
  chips?: ChipSpec[];
  className?: string;
};

const CHIP_PLACEMENT_CLASS: Record<ChipSpec["placement"], string> = {
  tl: "left-1 top-1",
  tr: "right-1 top-1",
  bl: "left-1 bottom-1",
  br: "right-1 bottom-1",
  top: "left-1/2 top-1 -translate-x-1/2",
  bottom: "left-1/2 bottom-1 -translate-x-1/2",
};

const CHIP_TONE_CLASS: Record<NonNullable<ChipSpec["tone"]>, string> = {
  default: "border-border bg-muted text-foreground",
  muted: "border-border bg-muted/70 text-muted-foreground",
  warn: "border-amber-400/65 bg-amber-500/15 text-amber-100",
  error: "border-destructive/65 bg-destructive/20 text-destructive-foreground",
  success: "border-success/55 bg-success/20 text-success-foreground",
  info: "border-primary/60 bg-primary/20 text-primary-foreground",
};

const CHIP_BASE_CLASS =
  "pointer-events-none absolute z-[1] inline-flex max-w-[calc(100%-0.5rem)] items-center justify-center rounded-full border px-2 py-0.5 text-[0.68rem] leading-none whitespace-nowrap";

export function CellChips({ chips, className }: CellChipsProps) {
  if (!chips || chips.length === 0) {
    return null;
  }

  return (
    <div className={cn("pointer-events-none absolute inset-0", className)} aria-hidden="true">
      {chips.map((chip) => (
        <span
          key={chip.id}
          className={cn(
            CHIP_BASE_CLASS,
            CHIP_PLACEMENT_CLASS[chip.placement],
            CHIP_TONE_CLASS[chip.tone || "default"],
          )}
        >
          {chip.label}
        </span>
      ))}
    </div>
  );
}
