export type BackendErrorKind = "offline" | "unknown";

export class BackendClientError extends Error {
  kind: BackendErrorKind;

  constructor(kind: BackendErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = "BackendClientError";
  }
}

export type BackendErrorShape = {
  kind: BackendErrorKind;
  message: string;
};

export async function backendFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const bases = backendBaseCandidates();
  let lastError: unknown = null;

  for (const base of bases) {
    try {
      return await fetch(`${base}${path}`, init);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw new BackendClientError("offline", "Backend is unreachable.");
  }
  throw new BackendClientError("unknown", "Unexpected backend error.");
}

export function backendUrl(path: string): string {
  return `${backendBaseCandidates()[0]}${path}`;
}

function backendBaseCandidates(): string[] {
  const isHostDockerInternal =
    typeof window !== "undefined" &&
    window.location.hostname === "host.docker.internal";
  return isHostDockerInternal
    ? ["http://host.docker.internal:8000", "http://localhost:8000"]
    : ["http://localhost:8000", "http://host.docker.internal:8000"];
}

export function normalizeBackendError(error: unknown): BackendErrorShape {
  if (error instanceof BackendClientError) {
    return { kind: error.kind, message: error.message };
  }
  if (error instanceof Error) {
    return { kind: "unknown", message: error.message || "Unexpected error." };
  }
  return { kind: "unknown", message: "Unexpected error." };
}

export function unwrapList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (
    payload &&
    typeof payload === "object" &&
    "results" in payload &&
    Array.isArray((payload as { results?: unknown }).results)
  ) {
    return (payload as { results: T[] }).results;
  }

  throw new BackendClientError(
    "unknown",
    "Expected list response from backend.",
  );
}
