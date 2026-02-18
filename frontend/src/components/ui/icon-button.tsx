import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { uiInteraction } from "./ui-foundations";

const iconButtonVariants = cva(
  [
    "inline-flex items-center justify-center rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80",
    "data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
    uiInteraction.transition,
    uiInteraction.focusRing,
    uiInteraction.disabled,
  ].join(" "),
  {
    variants: {
      variant: {
        default: "",
        secondary: "",
        ghost: "bg-transparent hover:bg-accent hover:text-accent-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        // Backwards-compatible alias.
        danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      },
      size: {
        sm: "h-10 w-10",
        default: "h-11 w-11",
        lg: "h-12 w-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type IconButtonProps = React.ComponentProps<"button"> & VariantProps<typeof iconButtonVariants>;

function IconButton({ className, variant, size, ...props }: IconButtonProps) {
  return <button className={cn(iconButtonVariants({ variant, size, className }))} {...props} />;
}

export { IconButton, iconButtonVariants };
