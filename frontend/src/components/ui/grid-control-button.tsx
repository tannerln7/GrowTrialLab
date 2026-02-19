import * as React from "react";

import { cn } from "@/lib/utils";

import { Button } from "./button";

type GridControlVariant = NonNullable<React.ComponentProps<typeof Button>["variant"]>;

type GridControlButtonProps = Omit<React.ComponentProps<typeof Button>, "size" | "type" | "aria-label"> & {
  "aria-label": string;
  variant?: Extract<GridControlVariant, "ghost" | "secondary" | "destructive">;
};

function GridControlButton({
  className,
  variant = "secondary",
  children,
  ...props
}: GridControlButtonProps) {
  return (
    <Button
      type="button"
      size="icon"
      variant={variant}
      className={cn(
        "h-8 w-8 rounded-md p-0 [&_svg]:h-4 [&_svg]:w-4",
        className,
      )}
      {...props}
    >
      {children}
    </Button>
  );
}

export { GridControlButton };
