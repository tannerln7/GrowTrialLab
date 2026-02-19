import type { QueryObserverResult } from "@tanstack/react-query";
import { useMemo } from "react";

import { normalizeUserFacingError } from "@/src/lib/errors/normalizeError";

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

function classifyError(error: unknown): { kind: PageErrorKind; message: string } {
  const normalized = normalizeUserFacingError(error);
  return {
    kind: normalized.kind,
    message: normalized.message,
  };
}
