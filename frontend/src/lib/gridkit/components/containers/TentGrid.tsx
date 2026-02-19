import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type TentGridProps = {
  children: ReactNode;
  className?: string;
};

export function TentGrid({ children, className }: TentGridProps) {
  return <div className={cn("grid grid-cols-1 items-start gap-2 md:grid-cols-2", className)}>{children}</div>;
}
