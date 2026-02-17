"use client";

import { ReactNode } from "react";

import AppMarkPlaceholder from "@/src/components/AppMarkPlaceholder";
import { cn } from "@/src/lib/utils";
import { useOnlineStatus } from "@/src/hooks/useOnlineStatus";

import OfflineBanner from "./OfflineBanner";

type PageShellProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  stickyOffset?: boolean;
};

export default function PageShell({
  title,
  subtitle,
  actions,
  children,
  stickyOffset = false,
}: PageShellProps) {
  const isOnline = useOnlineStatus();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className={cn("mx-auto flex w-full max-w-6xl flex-col gap-4 p-3 pb-24 md:gap-5 md:p-6", stickyOffset && "pb-40")}>
        {!isOnline ? <OfflineBanner /> : null}
        <header className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:flex-row md:items-center md:justify-between md:p-5">
          <AppMarkPlaceholder />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
        {children}
      </main>
    </div>
  );
}
