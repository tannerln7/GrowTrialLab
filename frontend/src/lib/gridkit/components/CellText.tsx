import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type CellTextProps = {
  className?: string;
  children: ReactNode;
};

export function CellTitle({ className, children }: CellTextProps) {
  return <strong className={cn("break-words text-[0.9rem] leading-tight", className)}>{children}</strong>;
}

export function CellSubtitle({ className, children }: CellTextProps) {
  return <span className={cn("text-[0.72rem] leading-snug text-muted-foreground", className)}>{children}</span>;
}

export function CellMeta({ className, children }: CellTextProps) {
  return <div className={cn("flex min-h-[1.25rem] flex-wrap items-center gap-1", className)}>{children}</div>;
}
