import { useCallback } from "react";

import { normalizeUserFacingError } from "@/src/lib/error-normalization";

type EnsureUnlockedArgs = {
  locked: boolean;
  message: string;
  setError: (value: string) => void;
};

export function ensureUnlocked({ locked, message, setError }: EnsureUnlockedArgs): boolean {
  if (!locked) {
    return true;
  }
  setError(message);
  return false;
}

type SavingActionStateSetters<TDiagnostics> = {
  setSaving: (value: boolean) => void;
  setError: (value: string) => void;
  setNotice: (value: string) => void;
  setOffline: (value: boolean) => void;
  setDiagnostics?: (value: TDiagnostics | null) => void;
};

type RunSavingActionArgs = {
  locked?: boolean;
  lockMessage?: string;
  fallbackError: string;
  clearDiagnostics?: boolean;
  clearNotice?: boolean;
  clearError?: boolean;
  action: () => Promise<boolean>;
  onError?: (error: unknown) => void;
};

export function useSavingAction<TDiagnostics = unknown>({
  setSaving,
  setError,
  setNotice,
  setOffline,
  setDiagnostics,
}: SavingActionStateSetters<TDiagnostics>) {
  const runSavingAction = useCallback(
    async ({
      locked,
      lockMessage,
      fallbackError,
      clearDiagnostics = true,
      clearNotice = true,
      clearError = true,
      action,
      onError,
    }: RunSavingActionArgs) => {
      if (locked && lockMessage) {
        if (!ensureUnlocked({ locked, message: lockMessage, setError })) {
          return false;
        }
      }

      setSaving(true);
      if (clearError) {
        setError("");
      }
      if (clearNotice) {
        setNotice("");
      }
      if (clearDiagnostics) {
        setDiagnostics?.(null);
      }

      try {
        const result = await action();
        return result;
      } catch (requestError) {
        const normalized = normalizeUserFacingError(requestError);
        if (normalized.kind === "offline") {
          setOffline(true);
        }
        setError(fallbackError);
        onError?.(requestError);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [setDiagnostics, setError, setNotice, setOffline, setSaving],
  );

  return { runSavingAction };
}
