"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type VirtualGridBreakpoints = {
  base: number;
  sm?: number;
  md?: number;
  lg?: number;
  xl?: number;
  "2xl"?: number;
};

type VirtualGridProps<T> = {
  items: T[];
  getKey: (item: T, index: number) => string;
  estimateRowHeight: number;
  columnsByBreakpoint?: VirtualGridBreakpoints;
  gapPx?: number;
  overscan?: number;
  renderCell: (item: T, index: number) => ReactNode;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
};

const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

function resolveColumns(columnsByBreakpoint: VirtualGridBreakpoints, viewportWidth: number): number {
  let columns = columnsByBreakpoint.base;

  if (columnsByBreakpoint.sm && viewportWidth >= BREAKPOINTS.sm) {
    columns = columnsByBreakpoint.sm;
  }
  if (columnsByBreakpoint.md && viewportWidth >= BREAKPOINTS.md) {
    columns = columnsByBreakpoint.md;
  }
  if (columnsByBreakpoint.lg && viewportWidth >= BREAKPOINTS.lg) {
    columns = columnsByBreakpoint.lg;
  }
  if (columnsByBreakpoint.xl && viewportWidth >= BREAKPOINTS.xl) {
    columns = columnsByBreakpoint.xl;
  }
  if (columnsByBreakpoint["2xl"] && viewportWidth >= BREAKPOINTS["2xl"]) {
    columns = columnsByBreakpoint["2xl"];
  }

  return Math.max(1, Math.trunc(columns));
}

export function VirtualGrid<T>({
  items,
  getKey,
  estimateRowHeight,
  columnsByBreakpoint = { base: 1 },
  gapPx = 8,
  overscan = 8,
  renderCell,
  className,
  style,
  ariaLabel,
}: VirtualGridProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateViewportWidth = () => {
      setViewportWidth(window.innerWidth);
    };

    updateViewportWidth();
    window.addEventListener("resize", updateViewportWidth);
    return () => {
      window.removeEventListener("resize", updateViewportWidth);
    };
  }, []);

  const columnCount = resolveColumns(columnsByBreakpoint, viewportWidth);
  const rowCount = Math.ceil(items.length / columnCount);
  const rowEstimate = Math.max(1, estimateRowHeight) + Math.max(0, gapPx);

  // TanStack Virtual manages imperative measurement APIs internally.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowEstimate,
    getItemKey: (index) => `${index}`,
    overscan,
    measureElement: (element) => element?.getBoundingClientRect().height ?? rowEstimate,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = useMemo(
    () => Math.max(0, virtualizer.getTotalSize() - (rowCount > 0 ? gapPx : 0)),
    [gapPx, rowCount, virtualizer],
  );

  return (
    <div
      ref={parentRef}
      className={cn("relative overflow-y-auto", className)}
      style={style}
      aria-label={ariaLabel}
    >
      <div className="relative w-full" style={{ height: totalSize }}>
        {virtualRows.map((virtualRow) => {
          const rowIndex = virtualRow.index;
          const startIndex = rowIndex * columnCount;
          const rowItems = items.slice(startIndex, startIndex + columnCount);

          return (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={rowIndex}
              className="absolute left-0 top-0 w-full"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div
                className="grid"
                style={{
                  gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                  columnGap: `${gapPx}px`,
                  paddingBottom: `${gapPx}px`,
                }}
              >
                {Array.from({ length: columnCount }, (_, columnIndex) => {
                  const item = rowItems[columnIndex];
                  if (!item) {
                    return <div key={`row-${rowIndex}-empty-${columnIndex}`} aria-hidden="true" />;
                  }

                  const itemIndex = startIndex + columnIndex;
                  return (
                    <div key={getKey(item, itemIndex)}>
                      {renderCell(item, itemIndex)}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
