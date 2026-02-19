import { normalizeBackendError } from "@/lib/backend";
import { isApiError } from "@/src/lib/api";

export type NormalizedErrorKind =
  | "offline"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "server"
  | "unknown";

export type NormalizedError = {
  kind: NormalizedErrorKind;
  message: string;
  status: number | null;
};

export function normalizeUserFacingError(error: unknown, fallback = "Unexpected error."): NormalizedError {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { kind: "offline", message: "You appear to be offline.", status: null };
  }

  if (isApiError(error)) {
    if (error.status === null) {
      return { kind: "offline", message: error.detail, status: null };
    }
    if (error.status === 401) {
      return { kind: "unauthorized", message: error.detail, status: error.status };
    }
    if (error.status === 403) {
      return { kind: "forbidden", message: error.detail, status: error.status };
    }
    if (error.status === 404) {
      return { kind: "not_found", message: error.detail, status: error.status };
    }
    if (error.status >= 500) {
      return { kind: "server", message: error.detail, status: error.status };
    }
    return { kind: "unknown", message: error.detail, status: error.status };
  }

  const normalizedBackend = normalizeBackendError(error);
  if (normalizedBackend.kind === "offline") {
    return { kind: "offline", message: normalizedBackend.message, status: null };
  }
  if (normalizedBackend.message.trim()) {
    return { kind: "unknown", message: normalizedBackend.message, status: null };
  }

  return { kind: "unknown", message: fallback, status: null };
}
