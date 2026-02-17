import { ReactNode } from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("grid gap-2 rounded-lg border border-dashed border-border bg-card/50 p-4 text-sm", className)}>
      <p className="font-medium text-foreground">{title}</p>
      {description ? <p className="text-muted-foreground">{description}</p> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

export { EmptyState };
