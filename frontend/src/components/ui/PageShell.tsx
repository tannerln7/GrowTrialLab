"use client";

import { ReactNode } from "react";

import { cn } from "@/lib/utils";
import AppMarkPlaceholder from "@/src/components/AppMarkPlaceholder";
import { useOnlineStatus } from "@/src/hooks/useOnlineStatus";
import { surfaceVariants } from "./ui-foundations";

import { AppFrame } from "./AppFrame";
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
      <AppFrame as="main" className={cn("flex flex-col gap-4 pb-24 pt-3 md:gap-5 md:pt-6", stickyOffset && "pb-40")}>
        {!isOnline ? <OfflineBanner /> : null}
        <header className={cn(surfaceVariants(), "flex flex-col gap-3 p-4 text-left md:flex-row md:items-start md:gap-4 md:p-5")}>
          <AppMarkPlaceholder />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
            {actions ? <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div> : null}
          </div>
        </header>
        {children}
      </AppFrame>
    </div>
  );
}
