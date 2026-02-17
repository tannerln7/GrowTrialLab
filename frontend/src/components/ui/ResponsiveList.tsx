import { ReactNode } from "react";

import SectionCard from "./SectionCard";

type Column<T> = {
  key: string;
  label: string;
  render: (item: T) => ReactNode;
};

type ResponsiveListProps<T> = {
  items: T[];
  getKey: (item: T) => string;
  columns: Column<T>[];
  renderMobileCard: (item: T) => ReactNode;
  emptyState?: ReactNode;
};

export default function ResponsiveList<T>({ items, getKey, columns, renderMobileCard, emptyState }: ResponsiveListProps<T>) {
  if (items.length === 0) {
    return emptyState ?? null;
  }

  return (
    <>
      <div className="grid gap-3 md:hidden">
        {items.map((item) => (
          <SectionCard key={getKey(item)}>{renderMobileCard(item)}</SectionCard>
        ))}
      </div>
      <div className="hidden overflow-hidden rounded-lg border border-border md:block">
        <table className="w-full border-collapse bg-card text-sm">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-3 py-2 text-left font-medium">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={getKey(item)} className="border-t border-border align-top">
                {columns.map((column) => (
                  <td key={column.key} className="px-3 py-2">
                    {column.render(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
