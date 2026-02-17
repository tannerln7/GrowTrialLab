type JsonObject = Record<string, unknown>;

export type ApiRequestBody = BodyInit | JsonObject | unknown[] | null;

export type ApiRequestOptions = Omit<RequestInit, "method" | "body"> & {
  body?: ApiRequestBody;
};

export type ApiErrorShape = {
  status: number | null;
  detail: string;
  diagnostics?: unknown;
  payload?: unknown;
};

export class ApiError extends Error {
  status: number | null;
  detail: string;
  diagnostics?: unknown;
  payload?: unknown;

  constructor(shape: ApiErrorShape) {
    super(shape.detail);
    this.name = "ApiError";
    this.status = shape.status;
    this.detail = shape.detail;
    this.diagnostics = shape.diagnostics;
    this.payload = shape.payload;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export async function apiGet<TResponse>(
  path: string,
  options?: Omit<ApiRequestOptions, "body">,
): Promise<TResponse> {
  return request<TResponse>("GET", path, options);
}

export async function apiPost<TResponse>(
  path: string,
  body?: ApiRequestBody,
  options?: Omit<ApiRequestOptions, "body">,
): Promise<TResponse> {
  return request<TResponse>("POST", path, { ...options, body });
}

export async function apiPatch<TResponse>(
  path: string,
  body?: ApiRequestBody,
  options?: Omit<ApiRequestOptions, "body">,
): Promise<TResponse> {
  return request<TResponse>("PATCH", path, { ...options, body });
}

export async function apiDelete<TResponse>(
  path: string,
  body?: ApiRequestBody,
  options?: Omit<ApiRequestOptions, "body">,
): Promise<TResponse> {
  return request<TResponse>("DELETE", path, { ...options, body });
}

export const api = {
  get: apiGet,
  post: apiPost,
  patch: apiPatch,
  delete: apiDelete,
};

async function request<TResponse>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  options?: ApiRequestOptions,
): Promise<TResponse> {
  const headers = new Headers(options?.headers);
  const body = encodeBody(options?.body, headers);
  let lastNetworkError: unknown = null;

  for (const base of backendBaseCandidates()) {
    const url = joinBaseAndPath(base, path);
    try {
      const response = await fetch(url, {
        ...options,
        method,
        headers,
        body,
      });
      const payload = await parseResponsePayload(response);
      if (!response.ok) {
        throw new ApiError({
          status: response.status,
          detail: extractDetail(payload, response.status),
          diagnostics: extractDiagnostics(payload),
          payload,
        });
      }
      return payload as TResponse;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      lastNetworkError = error;
    }
  }

  if (lastNetworkError instanceof ApiError) {
    throw lastNetworkError;
  }
  throw new ApiError({
    status: null,
    detail: defaultNetworkErrorDetail(),
  });
}

function encodeBody(body: ApiRequestBody | undefined, headers: Headers): BodyInit | undefined {
  if (body == null) {
    return undefined;
  }

  if (isBodyInit(body)) {
    return body;
  }

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return JSON.stringify(body);
}

function isBodyInit(body: unknown): body is BodyInit {
  if (typeof body === "string" || body instanceof URLSearchParams) {
    return true;
  }
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return true;
  }
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return true;
  }
  if (
    typeof ArrayBuffer !== "undefined" &&
    (body instanceof ArrayBuffer || ArrayBuffer.isView(body))
  ) {
    return true;
  }
  return false;
}

async function parseResponsePayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }

  const raw = await response.text();
  if (!raw) {
    return undefined;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  }

  return raw;
}

function extractDetail(payload: unknown, status: number): string {
  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) {
      return detail.trim();
    }
  }
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }
  return `Request failed with status ${status}.`;
}

function extractDiagnostics(payload: unknown): unknown {
  if (payload && typeof payload === "object" && "diagnostics" in payload) {
    return (payload as { diagnostics?: unknown }).diagnostics;
  }
  return undefined;
}

function defaultNetworkErrorDetail(): string {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "You appear to be offline.";
  }
  return "Backend is unreachable.";
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
