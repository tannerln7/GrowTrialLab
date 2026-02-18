import * as React from "react";

import { cn } from "@/lib/utils";

import { StepAdjustButton } from "./step-adjust-button";

type CountAdjustToolbarProps = {
  count: number;
  countLabel: string;
  helperText?: React.ReactNode;
  onIncrement: () => void;
  onDecrement: () => void;
  incrementDisabled?: boolean;
  decrementDisabled?: boolean;
  className?: string;
};

function CountAdjustToolbar({
  count,
  countLabel,
  helperText,
  onIncrement,
  onDecrement,
  incrementDisabled,
  decrementDisabled,
  className,
}: CountAdjustToolbarProps) {
  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StepAdjustButton
            direction="decrement"
            onClick={onDecrement}
            disabled={decrementDisabled}
          />
          <StepAdjustButton
            direction="increment"
            onClick={onIncrement}
            disabled={incrementDisabled}
          />
        </div>
        <span className="text-sm text-muted-foreground">
          {countLabel}: {count}
        </span>
      </div>
      {helperText ? (
        <span className="text-sm text-muted-foreground">{helperText}</span>
      ) : null}
    </div>
  );
}

export { CountAdjustToolbar };
