"use client";

import { ReactNode } from "react";

import AppMarkPlaceholder from "@/src/components/AppMarkPlaceholder";
import { useOnlineStatus } from "@/src/hooks/useOnlineStatus";

import OfflineBanner from "./OfflineBanner";
import styles from "./PageShell.module.css";

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
    <div className={styles.page}>
      <main className={`${styles.main} ${stickyOffset ? styles.stickyOffset : ""}`}>
        {!isOnline ? <OfflineBanner /> : null}
        <header className={styles.header}>
          <AppMarkPlaceholder />
          <div className={styles.titleWrap}>
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </header>
        {children}
      </main>
    </div>
  );
}
