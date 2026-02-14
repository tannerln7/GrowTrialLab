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

  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to reach backend.");
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
