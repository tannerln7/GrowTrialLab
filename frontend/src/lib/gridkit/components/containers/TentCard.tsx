import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { ChipSpec } from "@/src/lib/gridkit/spec";
import { HeaderChips } from "./HeaderChips";

type TentCardProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  chips?: ChipSpec[];
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function TentCard({ title, subtitle, chips, actions, children, className }: TentCardProps) {
  return (
    <article className={cn("grid min-w-0 gap-2 rounded-lg border border-border bg-card p-2", className)}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid min-w-0 gap-0.5">
          <h3 className="text-sm font-semibold leading-tight text-foreground">{title}</h3>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {chips || actions ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <HeaderChips chips={chips} />
            {actions}
          </div>
        ) : null}
      </header>
      <div className="min-w-0 perf-content-auto">{children}</div>
    </article>
  );
}
