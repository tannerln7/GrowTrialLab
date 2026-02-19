import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { chunkArray } from "@/src/lib/collections/array";
import { usePointerCoarse } from "@/src/lib/hooks/usePointerCoarse";
import { usePrefersReducedMotion } from "@/src/lib/hooks/usePrefersReducedMotion";
import { useResizeObserver } from "@/src/lib/hooks/useResizeObserver";
import { getDndDataAttributes } from "@/src/lib/dnd";
import type { PositionSpec } from "@/src/lib/gridkit/spec";

type PositionStripProps = {
  positions: PositionSpec[];
  renderPosition: (position: PositionSpec) => ReactNode;
  pageSize?: number;
  className?: string;
  pageGridClassName?: string;
  positionClassName?: string;
  ariaLabel?: string;
};

function clampPage(value: number, pageCount: number): number {
  if (pageCount <= 0) {
    return 0;
  }
  return Math.min(Math.max(value, 0), pageCount - 1);
}

export function PositionStrip({
  positions,
  renderPosition,
  pageSize = 4,
  className,
  pageGridClassName,
  positionClassName,
  ariaLabel,
}: PositionStripProps) {
  const safePageSize = Math.max(1, Math.trunc(pageSize));
  const pages = useMemo(() => chunkArray(positions, safePageSize), [positions, safePageSize]);

  const stripRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const isPointerCoarse = usePointerCoarse();
  const [scrollLeft, setScrollLeft] = useState(0);
  const { width } = useResizeObserver(stripRef);

  const pageCount = pages.length;
  const viewportWidth = Math.max(1, width || 1);
  const currentPage = clampPage(Math.round(scrollLeft / viewportWidth), pageCount);
  const canPrev = currentPage > 0;
  const canNext = currentPage < pageCount - 1;
  const showArrows = pageCount > 1 && !isPointerCoarse;

  useEffect(
    () => () => {
      if (scrollRafRef.current != null && typeof window !== "undefined") {
        window.cancelAnimationFrame(scrollRafRef.current);
      }
    },
    [],
  );

  const handleScroll = useCallback(() => {
    if (scrollRafRef.current != null || typeof window === "undefined") {
      return;
    }

    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const node = stripRef.current;
      if (!node) {
        return;
      }
      setScrollLeft(node.scrollLeft);
    });
  }, []);

  const scrollToPage = useCallback(
    (targetPage: number) => {
      const node = stripRef.current;
      if (!node || pageCount <= 0) {
        return;
      }

      const clampedPage = clampPage(targetPage, pageCount);
      const widthValue = Math.max(1, node.clientWidth);

      node.scrollTo({
        left: clampedPage * widthValue,
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });
      setScrollLeft(clampedPage * widthValue);
    },
    [pageCount, prefersReducedMotion],
  );

  if (positions.length === 0) {
    return null;
  }

  return (
    <div className={cn("relative", className)}>
      {showArrows && canPrev ? (
        <button
          type="button"
          className="absolute left-1 top-1/2 z-10 -translate-y-1/2 rounded-md border border-border bg-card/95 p-1 shadow-sm"
          onClick={() => scrollToPage(currentPage - 1)}
          aria-label="Previous shelf positions"
        >
          <ChevronLeft size={16} />
        </button>
      ) : null}

      {showArrows && canNext ? (
        <button
          type="button"
          className="absolute right-1 top-1/2 z-10 -translate-y-1/2 rounded-md border border-border bg-card/95 p-1 shadow-sm"
          onClick={() => scrollToPage(currentPage + 1)}
          aria-label="Next shelf positions"
        >
          <ChevronRight size={16} />
        </button>
      ) : null}

      <div
        ref={stripRef}
        className="hide-scrollbar overflow-x-auto snap-x snap-mandatory [scroll-snap-stop:always] [-webkit-overflow-scrolling:touch]"
        onScroll={handleScroll}
        aria-label={ariaLabel || "Shelf positions"}
      >
        <div className="flex min-w-full items-stretch">
          {pages.map((page, pageIndex) => (
            <div
              key={`page-${pageIndex}`}
              className="basis-full shrink-0 snap-start"
              data-gridkit-page-index={pageIndex}
              data-gridkit-page-size={safePageSize}
            >
              <div className={cn("grid grid-cols-4 items-stretch gap-2", pageGridClassName)}>
                {page.map((position) => {
                  const dndSpec = {
                    ...(position.occupant.dnd || {}),
                    ...(position.dnd || {}),
                  };
                  return (
                    <div
                      key={position.id}
                      className={positionClassName}
                      data-cell-kind="position"
                      data-pos-id={position.id}
                      data-pos-index={position.positionIndex}
                      data-position-index={position.positionIndex}
                      data-shelf-id={position.shelfId}
                      data-tent-id={position.tentId}
                      {...getDndDataAttributes(dndSpec)}
                    >
                      {renderPosition(position)}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
