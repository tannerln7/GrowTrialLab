import { ReactNode } from "react";

import { cn } from "@/src/lib/utils";

type SectionCardProps = {
  className?: string;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export default function SectionCard({ className, title, subtitle, actions, children }: SectionCardProps) {
  return (
    <section className={cn("rounded-lg border border-border bg-card text-card-foreground shadow-sm", className)}>
      {title || subtitle || actions ? (
        <header className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-start md:justify-between">
          <div>
            {title ? <h2 className="text-base font-semibold">{title}</h2> : null}
            {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}
