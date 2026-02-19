import type * as React from "react";

import { cn } from "@/lib/utils";
import type { DndSpec } from "@/src/lib/gridkit/spec";
import { getDndDataAttributes } from "./attributes";

type DndShellProps = React.HTMLAttributes<HTMLDivElement> & {
  dnd?: DndSpec;
};

export function DndDraggableShell({
  dnd,
  className,
  children,
  ...rest
}: DndShellProps) {
  return (
    <div
      className={cn(className)}
      {...getDndDataAttributes(dnd)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function DndDroppableShell({
  dnd,
  className,
  children,
  ...rest
}: DndShellProps) {
  return (
    <div
      className={cn(className)}
      {...getDndDataAttributes(dnd)}
      {...rest}
    >
      {children}
    </div>
  );
}
