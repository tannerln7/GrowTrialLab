import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const iconButtonVariants = cva(
  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-secondary text-secondary-foreground transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "",
        danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      },
      size: {
        sm: "h-7 w-7",
        default: "h-8 w-8",
        lg: "h-9 w-9",
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
