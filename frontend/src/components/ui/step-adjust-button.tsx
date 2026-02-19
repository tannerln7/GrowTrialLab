import * as React from "react";
import { Minus, Plus } from "lucide-react";

import { GridControlButton } from "./grid-control-button";

type StepAdjustButtonProps = Omit<React.ComponentProps<typeof GridControlButton>, "children" | "aria-label"> & {
  direction: "increment" | "decrement";
};

function StepAdjustButton({ className, direction, ...props }: StepAdjustButtonProps) {
  const isIncrement = direction === "increment";
  const label = isIncrement ? "Increase value" : "Decrease value";

  return (
    <GridControlButton
      variant="secondary"
      aria-label={label}
      className={className}
      {...props}
    >
      {isIncrement ? <Plus /> : <Minus />}
    </GridControlButton>
  );
}

export { StepAdjustButton };
