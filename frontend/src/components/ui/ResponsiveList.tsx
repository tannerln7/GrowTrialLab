import { ReactNode } from "react";

import SectionCard from "./SectionCard";
import styles from "./ResponsiveList.module.css";

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

export default function ResponsiveList<T>({
  items,
  getKey,
  columns,
  renderMobileCard,
  emptyState,
}: ResponsiveListProps<T>) {
  if (items.length === 0) {
    return emptyState ?? null;
  }

  return (
    <>
      <div className={styles.mobileCards}>
        {items.map((item) => (
          <SectionCard key={getKey(item)}>{renderMobileCard(item)}</SectionCard>
        ))}
      </div>
      <div className={styles.desktopTableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={getKey(item)}>
                {columns.map((column) => (
                  <td key={column.key}>{column.render(item)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
