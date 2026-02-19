"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type VirtualListProps<T> = {
  items: T[];
  getKey: (item: T, index: number) => string;
  estimateSize: number | ((index: number, item: T) => number);
  overscan?: number;
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
};

export function VirtualList<T>({
  items,
  getKey,
  estimateSize,
  overscan = 8,
  renderItem,
  className,
  style,
  ariaLabel,
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  // TanStack Virtual manages imperative measurement APIs internally.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      if (typeof estimateSize === "number") {
        return estimateSize;
      }
      const item = items[index];
      return item ? estimateSize(index, item) : 0;
    },
    getItemKey: (index) => {
      const item = items[index];
      return item ? getKey(item, index) : `${index}`;
    },
    overscan,
    measureElement: (element) => element?.getBoundingClientRect().height ?? 0,
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className={cn("relative overflow-y-auto", className)}
      style={style}
      aria-label={ariaLabel}
    >
      <div
        className="relative w-full"
        style={{
          height: virtualizer.getTotalSize(),
        }}
      >
        {virtualItems.map((virtualItem) => {
          const item = items[virtualItem.index];
          if (!item) {
            return null;
          }

          return (
            <div
              key={virtualItem.key}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              className="absolute left-0 top-0 w-full"
              style={{
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {renderItem(item, virtualItem.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
