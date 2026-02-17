import { ReactNode } from "react";

import { AppFrame } from "./AppFrame";

type StickyActionBarProps = {
  children: ReactNode;
};

export default function StickyActionBar({ children }: StickyActionBarProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
      <AppFrame className="pointer-events-auto rounded-lg border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
        {children}
      </AppFrame>
    </div>
  );
}
