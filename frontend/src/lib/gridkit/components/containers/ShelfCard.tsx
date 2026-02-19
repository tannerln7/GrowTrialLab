import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { ChipSpec } from "@/src/lib/gridkit/spec";
import { HeaderChips } from "./HeaderChips";

type ShelfCardProps = {
  title: ReactNode;
  chips?: ChipSpec[];
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function ShelfCard({ title, chips, actions, children, className }: ShelfCardProps) {
  return (
    <section className={cn("grid min-w-0 gap-2 rounded-lg border border-border bg-card p-2", className)}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="text-sm font-semibold leading-tight text-foreground">{title}</h4>
        {chips || actions ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <HeaderChips chips={chips} />
            {actions}
          </div>
        ) : null}
      </header>
      <div className="min-w-0 perf-content-auto">{children}</div>
    </section>
  );
}
