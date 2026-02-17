import type { QueryObserverResult } from "@tanstack/react-query";
import { useMemo } from "react";

import { isApiError } from "@/src/lib/api";

export type PageErrorKind =
  | "offline"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "server"
  | "unknown";

type QueryStateInput = Pick<
  QueryObserverResult<unknown, unknown>,
  "isPending" | "isError" | "error" | "refetch"
>;

export type PageQueryState = {
  isLoading: boolean;
  isError: boolean;
  errorKind: PageErrorKind;
  message: string;
  retry: () => void;
};

export function usePageQueryState(query: QueryStateInput): PageQueryState {
  const classified = useMemo(() => classifyError(query.error), [query.error]);
  const retry = () => {
    void query.refetch();
  };

  if (!query.isError) {
    return {
      isLoading: query.isPending,
      isError: false,
      errorKind: "unknown",
      message: "",
      retry,
    };
  }

  return {
    isLoading: query.isPending,
    isError: true,
    errorKind: classified.kind,
    message: classified.message,
    retry,
  };
}

function classifyError(error: unknown): {
  kind: PageErrorKind;
  message: string;
} {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { kind: "offline", message: "You appear to be offline." };
  }

  if (isApiError(error)) {
    if (error.status === null) {
      return { kind: "offline", message: error.detail };
    }
    if (error.status === 401) {
      return { kind: "unauthorized", message: error.detail };
    }
    if (error.status === 403) {
      return { kind: "forbidden", message: error.detail };
    }
    if (error.status === 404) {
      return { kind: "not_found", message: error.detail };
    }
    if (error.status >= 500) {
      return { kind: "server", message: error.detail };
    }
    return { kind: "unknown", message: error.detail };
  }

  if (error instanceof Error && error.message.trim()) {
    return { kind: "unknown", message: error.message };
  }

  return { kind: "unknown", message: "Unexpected error." };
}
