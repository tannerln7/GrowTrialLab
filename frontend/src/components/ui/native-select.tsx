import * as React from "react";

import { cn } from "@/lib/utils";
import { controlBaseClass } from "./ui-foundations";

function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(controlBaseClass, "h-9 px-3 py-2", className)} {...props} />;
}

export { NativeSelect };
