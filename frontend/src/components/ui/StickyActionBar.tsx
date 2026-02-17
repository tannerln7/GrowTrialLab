import { ReactNode } from "react";

type StickyActionBarProps = {
  children: ReactNode;
};

export default function StickyActionBar({ children }: StickyActionBarProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] md:px-6">
      <div className="pointer-events-auto mx-auto max-w-6xl rounded-lg border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
        {children}
      </div>
    </div>
  );
}
