import * as React from "react";

import { cn } from "@/lib/utils";

function TableShell({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-card", className)} {...props} />
  );
}

function TableHeaderRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("bg-muted/60 text-muted-foreground", className)} {...props} />;
}

function TableBodyRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("border-t border-border align-top", className)} {...props} />;
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("px-3 py-2", className)} {...props} />;
}

function TableHeadCell({ className, ...props }: React.ComponentProps<"th">) {
  return <th className={cn("px-3 py-2 text-left font-medium", className)} {...props} />;
}

export { TableBodyRow, TableCell, TableHeadCell, TableHeaderRow, TableShell };
