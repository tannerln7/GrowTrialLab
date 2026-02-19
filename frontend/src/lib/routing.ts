export function getParamString(param: string | string[] | undefined): string | null {
  if (typeof param === "string") {
    return param;
  }
  if (Array.isArray(param)) {
    return param[0] ?? null;
  }
  return null;
}
