import { cn } from "@/lib/utils";
import type { ChipSpec } from "@/src/lib/gridkit/spec";

type HeaderChipsProps = {
  chips?: ChipSpec[];
  className?: string;
};

const TONE_CLASS: Record<NonNullable<ChipSpec["tone"]>, string> = {
  default: "border-border bg-muted text-foreground",
  muted: "border-border bg-muted/70 text-muted-foreground",
  warn: "border-amber-400/65 bg-amber-500/15 text-amber-100",
  error: "border-destructive/65 bg-destructive/20 text-destructive-foreground",
  success: "border-success/55 bg-success/20 text-success-foreground",
  info: "border-primary/60 bg-primary/20 text-primary-foreground",
};

export function HeaderChips({ chips, className }: HeaderChipsProps) {
  if (!chips || chips.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {chips.map((chip) => (
        <span
          key={chip.id}
          className={cn(
            "inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-[0.72rem] leading-none whitespace-nowrap",
            TONE_CLASS[chip.tone || "default"],
          )}
        >
          {chip.label}
        </span>
      ))}
    </div>
  );
}
