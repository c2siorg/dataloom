export function parseApiErrorDetail(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } } | null)?.response?.data
    ?.detail;

  return typeof detail === "string" ? detail : fallback;
}
