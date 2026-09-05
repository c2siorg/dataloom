/**
 * Pagination bounds shared across the app.
 *
 * Mirrors the backend's `page_size: int = Query(50, ge=1, le=100)` constraint,
 * enforced on every write-path endpoint (see `paginate_dataframe()` in
 * `app/utils/pandas_helpers.py`). This is the one place the bound is defined
 * on the frontend — every site that reads a page size from an untrusted
 * source (localStorage, a server response) should funnel through
 * {@link clampPageSize} rather than re-deriving the range check.
 * @module utils/pagination
 */

export const MIN_PAGE_SIZE = 1;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 50;

/**
 * Clamp a candidate page size into the backend's accepted range.
 *
 * Anything that isn't a finite number — missing (`null`/`undefined`), an
 * empty string, or a corrupted non-numeric value — falls back to
 * {@link DEFAULT_PAGE_SIZE} rather than propagating `NaN`. A numeric value
 * outside `[MIN_PAGE_SIZE, MAX_PAGE_SIZE]` is clamped to the nearest bound.
 * @param value - A candidate page size, from state, a response, or storage.
 * @returns An integer page size guaranteed to be within
 *   `[MIN_PAGE_SIZE, MAX_PAGE_SIZE]`.
 */
export function clampPageSize(value: unknown): number {
  if (value === null || value === undefined || value === "") return DEFAULT_PAGE_SIZE;

  const numeric = typeof value === "string" ? Number(value) : value;
  if (typeof numeric !== "number" || !Number.isFinite(numeric)) return DEFAULT_PAGE_SIZE;

  return Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, Math.trunc(numeric)));
}
