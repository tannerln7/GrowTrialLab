import * as React from "react";

import { cn } from "@/lib/utils";

type DenseSelectableCellProps = React.ComponentProps<"article"> & {
  selected?: boolean;
  muted?: boolean;
  interactive?: boolean;
  dirty?: boolean;
};

function DenseSelectableCell({
  className,
  selected = false,
  muted = false,
  interactive = true,
  dirty = false,
  ...props
}: DenseSelectableCellProps) {
  return (
    <article
      className={cn(
        "relative grid min-h-[5.25rem] content-start gap-1 rounded-md border p-2",
        muted ? "bg-[color:var(--gt-cell-surface-2)]" : "bg-[color:var(--gt-cell-surface-1)]",
        selected ? "border-ring bg-[color:var(--gt-cell-selected)]" : "border-border",
        interactive ? "cursor-pointer hover:border-ring/70" : "",
        dirty ? "ring-1 ring-ring/50" : "",
        className,
      )}
      {...props}
    />
  );
}

export { DenseSelectableCell };
