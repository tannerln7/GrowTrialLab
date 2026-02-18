import { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { surfaceVariants } from "./ui-foundations";

import { AppFrame } from "./AppFrame";

type StickyActionBarProps = {
  children: ReactNode;
};

export default function StickyActionBar({ children }: StickyActionBarProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 pb-[var(--gt-safe-bottom-offset)]">
      <AppFrame
        className={cn(
          surfaceVariants({ variant: "elevated" }),
          "pointer-events-auto p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/95",
        )}
      >
        {children}
      </AppFrame>
    </div>
  );
}
