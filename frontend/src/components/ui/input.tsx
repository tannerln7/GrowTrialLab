import * as React from "react";

import { cn } from "@/lib/utils";
import { controlBaseClass } from "./ui-foundations";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        controlBaseClass,
        "h-10 px-3 py-2 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
