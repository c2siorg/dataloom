/** The part of an Axios error this module reads. */
interface ApiErrorLike {
  response?: { status?: number; data?: { detail?: unknown } };
}

export const STALE_PREVIEW_MESSAGE =
  "The dataset changed after this preview was generated. Your preview was discarded; apply the transformation again to review the current data.";

/** True only for the revision conflict raised by preview-bound transforms. */
export function isStaleRevisionConflict(err: unknown): boolean {
  const response = (err as ApiErrorLike | null | undefined)?.response;
  const detail = response?.data?.detail;
  return (
    response?.status === 409 &&
    typeof detail === "object" &&
    detail !== null &&
    (detail as { code?: unknown }).code === "stale_dataset_revision"
  );
}

/**
 * Normalizes an API error into a plain string safe to render.
 *
 * FastAPI validation failures (422) return `detail` as an array of Pydantic
 * error objects, so passing it straight to a toast would try to render objects
 * as React children and crash the tree.
 *
 * @param err - Error thrown by the API layer.
 * @param fallback - Message used when no usable detail is present.
 */
export function getErrorMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  const detail = (err as ApiErrorLike | null | undefined)?.response?.data?.detail;

  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  if (
    typeof detail === "object" &&
    detail !== null &&
    typeof (detail as { message?: unknown }).message === "string"
  ) {
    return (detail as { message: string }).message;
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((e: unknown) => (e as { msg?: string } | null)?.msg ?? JSON.stringify(e))
      .filter(Boolean);
    if (messages.length > 0) {
      return messages.join(", ");
    }
  } else if (typeof detail === "object" && detail !== null) {
    return JSON.stringify(detail);
  }

  return fallback;
}
