import { ReactNode } from "react";

import SectionCard from "./SectionCard";
import {
  TableBodyRow,
  TableCell,
  TableHeadCell,
  TableHeaderRow,
  TableShell,
} from "./table-shell";

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
      <TableShell className="hidden md:block">
        <table className="w-full border-collapse bg-card text-sm">
          <thead>
            <TableHeaderRow>
              {columns.map((column) => (
                <TableHeadCell key={column.key}>
                  {column.label}
                </TableHeadCell>
              ))}
            </TableHeaderRow>
          </thead>
          <tbody>
            {items.map((item) => (
              <TableBodyRow key={getKey(item)}>
                {columns.map((column) => (
                  <TableCell key={column.key}>
                    {column.render(item)}
                  </TableCell>
                ))}
              </TableBodyRow>
            ))}
          </tbody>
        </table>
      </TableShell>
    </>
  );
}
