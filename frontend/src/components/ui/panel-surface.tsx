import * as React from "react";

import { cn } from "@/lib/utils";

function PanelSurface({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-lg border border-border bg-card p-3 shadow-sm", className)} {...props} />;
}

export { PanelSurface };
