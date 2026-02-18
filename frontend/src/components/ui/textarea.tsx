import * as React from "react";

import { cn } from "@/lib/utils";
import { controlBaseClass } from "./ui-foundations";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        controlBaseClass,
        "min-h-24 px-3 py-2",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
