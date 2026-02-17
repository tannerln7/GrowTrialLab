import * as React from "react";

import { cn } from "@/src/lib/utils";

type AppFrameProps = React.ComponentProps<"div"> & {
  as?: "div" | "main";
};

function AppFrame({ as = "div", className, ...props }: AppFrameProps) {
  const Comp = as;
  return <Comp className={cn("mx-auto w-full max-w-6xl px-3 md:px-6", className)} {...props} />;
}

export { AppFrame };
