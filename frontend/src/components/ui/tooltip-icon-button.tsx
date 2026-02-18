import * as React from "react";
import { type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { IconButton, iconButtonVariants } from "./icon-button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

type TooltipIconButtonProps = Omit<React.ComponentProps<"button">, "children"> &
  VariantProps<typeof iconButtonVariants> & {
    label: string;
    icon: React.ReactNode;
    tooltipClassName?: string;
    delayDuration?: number;
  };

function TooltipIconButton({
  label,
  icon,
  className,
  tooltipClassName,
  delayDuration = 150,
  variant,
  size,
  ...props
}: TooltipIconButtonProps) {
  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip>
        <TooltipTrigger asChild>
          <IconButton
            type="button"
            className={className}
            variant={variant}
            size={size}
            aria-label={label}
            title={label}
            {...props}
          >
            {icon}
          </IconButton>
        </TooltipTrigger>
        <TooltipContent className={cn("px-2 py-1", tooltipClassName)}>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { TooltipIconButton };
