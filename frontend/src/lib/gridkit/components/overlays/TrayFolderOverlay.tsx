"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Popover, PopoverAnchor, PopoverContent } from "@/src/components/ui/popover";
import { usePrefersReducedMotion } from "@/src/lib/hooks/usePrefersReducedMotion";

type TrayFolderOverlayProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function TrayFolderOverlay({
  open,
  onOpenChange,
  trigger,
  title,
  children,
  className,
  contentClassName,
}: TrayFolderOverlayProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <Popover open={open} onOpenChange={onOpenChange} modal={false}>
      <PopoverAnchor asChild>
        <div className={cn("h-full", className)}>{trigger}</div>
      </PopoverAnchor>
      <PopoverContent
        forceMount
        align="start"
        side="bottom"
        sideOffset={10}
        collisionPadding={12}
        className={cn(
          "w-[min(28rem,calc(100vw-1.5rem))] border-0 bg-transparent p-0 shadow-none data-[state=closed]:pointer-events-none",
          contentClassName,
        )}
      >
        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              key="tray-folder-content"
              initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.98, y: 8 }}
              animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.98, y: 8 }}
              transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }}
              className="rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-lg"
            >
              {title ? <div className="mb-2 text-sm font-medium">{title}</div> : null}
              <div>{children}</div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </PopoverContent>
    </Popover>
  );
}
