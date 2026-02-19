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

/**
 * @deprecated Use `api.*` helpers from `frontend/src/lib/api.ts` for UI/server-state calls.
 */
export async function backendFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const bases = backendBaseCandidates();
  let lastError: unknown = null;

  for (const base of bases) {
    try {
      return await fetch(joinBaseAndPath(base, path), init);
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
  return joinBaseAndPath(backendBaseCandidates()[0], path);
}

function backendBaseCandidates(): string[] {
  const publicBase = normalizeBase(
    process.env.NEXT_PUBLIC_BACKEND_BASE_URL || "",
  );
  if (publicBase) {
    return [publicBase];
  }

  // Browser should hit same-origin frontend and rely on Next rewrites.
  if (typeof window !== "undefined") {
    return [""];
  }

  // Server-side fallback for local tooling.
  const internalBase = normalizeBase(
    process.env.NEXT_BACKEND_ORIGIN || "http://localhost:8000",
  );
  return internalBase ? [internalBase] : [""];
}

function normalizeBase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.replace(/\/+$/, "");
}

function joinBaseAndPath(base: string, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${normalizedPath}` : normalizedPath;
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
  if (
    payload &&
    typeof payload === "object" &&
    "results" in payload &&
    "meta" in payload &&
    Array.isArray((payload as { results?: unknown }).results)
  ) {
    return (payload as { results: T[] }).results;
  }

  throw new BackendClientError(
    "unknown",
    "Expected list response from backend.",
  );
}
