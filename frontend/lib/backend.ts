export async function backendFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const isHostDockerInternal =
    typeof window !== "undefined" &&
    window.location.hostname === "host.docker.internal";
  const bases = isHostDockerInternal
    ? ["http://host.docker.internal:8000", "http://localhost:8000"]
    : ["http://localhost:8000", "http://host.docker.internal:8000"];
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
