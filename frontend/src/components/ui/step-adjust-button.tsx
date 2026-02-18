import * as React from "react";

import { Button } from "./button";

type StepAdjustButtonProps = Omit<React.ComponentProps<typeof Button>, "children" | "size" | "variant" | "type"> & {
  direction: "increment" | "decrement";
};

function StepAdjustButton({ className, direction, ...props }: StepAdjustButtonProps) {
  const isIncrement = direction === "increment";
  const label = isIncrement ? "Increase value" : "Decrease value";

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      aria-label={label}
      className={className}
      {...props}
    >
      {isIncrement ? "+" : "-"}
    </Button>
  );
}

export { StepAdjustButton };
