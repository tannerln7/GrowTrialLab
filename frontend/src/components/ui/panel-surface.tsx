import * as React from "react";
import { type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { panelSurfaceVariants } from "./ui-foundations";

type PanelSurfaceProps = React.ComponentProps<"div"> &
  VariantProps<typeof panelSurfaceVariants>;

function PanelSurface({
  className,
  variant,
  density,
  ...props
}: PanelSurfaceProps) {
  return (
    <div
      className={cn(panelSurfaceVariants({ variant, density }), className)}
      {...props}
    />
  );
}

export { PanelSurface };
