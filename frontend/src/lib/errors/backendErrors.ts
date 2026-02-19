import { isApiError } from "@/src/lib/api";

export type ParsedBackendError<TDiagnostics = unknown> = {
  detail: string;
  diagnostics: TDiagnostics | null;
};

export async function parseBackendErrorPayload<TDiagnostics = unknown>(
  response: Response,
  fallback: string,
): Promise<ParsedBackendError<TDiagnostics>> {
  try {
    const payload = (await response.json()) as {
      detail?: string;
      diagnostics?: TDiagnostics;
    };
    return {
      detail: payload.detail || fallback,
      diagnostics: payload.diagnostics || null,
    };
  } catch {
    return { detail: fallback, diagnostics: null };
  }
}

export function parseApiErrorPayload<TDiagnostics = unknown>(
  error: unknown,
  fallback: string,
): ParsedBackendError<TDiagnostics> {
  if (!isApiError(error)) {
    return { detail: fallback, diagnostics: null };
  }

  const payload = error.payload as { detail?: string; diagnostics?: TDiagnostics } | undefined;
  const diagnosticsFromError = error.diagnostics as TDiagnostics | undefined;
  return {
    detail: payload?.detail || error.detail || fallback,
    diagnostics: payload?.diagnostics ?? diagnosticsFromError ?? null,
  };
}
