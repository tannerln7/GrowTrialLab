import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type ShelfStackProps = {
  children: ReactNode;
  className?: string;
};

export function ShelfStack({ children, className }: ShelfStackProps) {
  return <div className={cn("grid gap-2", className)}>{children}</div>;
}
