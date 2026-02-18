import * as React from "react";
import { type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { selectableCellVariants } from "./ui-foundations";

type DenseSelectableCellProps = React.ComponentProps<"article"> & {
  tone?: VariantProps<typeof selectableCellVariants>["tone"];
  state?: VariantProps<typeof selectableCellVariants>["state"];
  selected?: boolean;
  muted?: boolean;
  interactive?: boolean;
  dirty?: boolean;
};

function DenseSelectableCell({
  className,
  tone,
  state,
  selected = false,
  muted = false,
  interactive = true,
  dirty = false,
  ...props
}: DenseSelectableCellProps) {
  const resolvedTone = tone ?? (muted ? "muted" : "default");
  const resolvedState = state ?? (selected ? "selected" : "default");

  return (
    <article
      className={cn(
        selectableCellVariants({
          tone: resolvedTone,
          state: resolvedState,
          interactive,
          dirty,
        }),
        className,
      )}
      {...props}
    />
  );
}

export { DenseSelectableCell };
