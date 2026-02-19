export async function parseBackendErrorPayload<TDiagnostics = unknown>(
  response: Response,
  fallback: string,
): Promise<{ detail: string; diagnostics: TDiagnostics | null }> {
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
