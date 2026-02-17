import * as React from "react";

import { cn } from "@/lib/utils";

function ToolbarRow({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card p-2",
        className,
      )}
      {...props}
    />
  );
}

export { ToolbarRow };
