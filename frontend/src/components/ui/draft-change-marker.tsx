import * as React from "react";

import { cn } from "@/lib/utils";

type DraftChangeMarkerProps = React.ComponentProps<"span">;

function DraftChangeMarker({ className, ...props }: DraftChangeMarkerProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute left-1 top-1 h-[0.42rem] w-[0.42rem] rounded-full bg-ring",
        className,
      )}
      {...props}
    />
  );
}

export { DraftChangeMarker };
