import * as React from "react";
import { type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { toolbarRowVariants } from "./ui-foundations";

type ToolbarRowProps = React.ComponentProps<"div"> &
  VariantProps<typeof toolbarRowVariants>;

function ToolbarRow({
  className,
  variant,
  density,
  ...props
}: ToolbarRowProps) {
  return (
    <div
      className={cn(toolbarRowVariants({ variant, density }), className)}
      {...props}
    />
  );
}

export { ToolbarRow };
