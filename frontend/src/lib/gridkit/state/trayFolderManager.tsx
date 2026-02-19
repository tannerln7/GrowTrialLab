"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type TrayFolderManagerValue = {
  openKey: string | null;
  isOpen: (key: string) => boolean;
  open: (key: string) => void;
  close: () => void;
  toggle: (key: string) => void;
};

const TrayFolderManagerContext = createContext<TrayFolderManagerValue | null>(null);

type TrayFolderProviderProps = {
  children: ReactNode;
};

export function TrayFolderProvider({ children }: TrayFolderProviderProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  const isOpen = useCallback((key: string) => openKey === key, [openKey]);
  const open = useCallback((key: string) => {
    setOpenKey(key);
  }, []);
  const close = useCallback(() => {
    setOpenKey(null);
  }, []);
  const toggle = useCallback((key: string) => {
    setOpenKey((current) => (current === key ? null : key));
  }, []);

  const value = useMemo<TrayFolderManagerValue>(
    () => ({
      openKey,
      isOpen,
      open,
      close,
      toggle,
    }),
    [close, isOpen, open, openKey, toggle],
  );

  return (
    <TrayFolderManagerContext.Provider value={value}>
      {children}
    </TrayFolderManagerContext.Provider>
  );
}

export function useTrayFolderManager(): TrayFolderManagerValue {
  const context = useContext(TrayFolderManagerContext);
  if (!context) {
    throw new Error("useTrayFolderManager must be used within a TrayFolderProvider.");
  }
  return context;
}
