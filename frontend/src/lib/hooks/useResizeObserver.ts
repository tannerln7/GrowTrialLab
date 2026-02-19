import { useEffect, useState, type RefObject } from "react";

export type ResizeObserverSize = {
  width: number;
  height: number;
};

const EMPTY_SIZE: ResizeObserverSize = { width: 0, height: 0 };

export function useResizeObserver<T extends HTMLElement>(
  ref: RefObject<T | null>,
): ResizeObserverSize {
  const [size, setSize] = useState<ResizeObserverSize>(EMPTY_SIZE);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    if (typeof window === "undefined" || typeof ResizeObserver === "undefined") {
      const rect = node.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
