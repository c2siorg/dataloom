import { useLayoutEffect, useState, type RefObject } from "react";

/** The data columns to render, and the spacer widths standing in for the rest. */
export interface ColumnWindow {
  /** First rendered data-column index. */
  start: number;
  /** One past the last rendered data-column index. */
  end: number;
  /** Width in px of the columns before `start`. */
  leftPad: number;
  /** Width in px of the columns from `end` on. */
  rightPad: number;
}

export interface ColumnWindowInput {
  scrollLeft: number;
  viewportWidth: number;
  columnCount: number;
  columnWidth: number;
  /** Width in px of the sticky column ahead of the data columns. */
  leadingOffset: number;
  /** Extra columns rendered past each edge of the viewport. */
  overscan: number;
  /** Data-column indices that must render even when scrolled out of view. */
  pinned?: readonly number[];
}

/**
 * Work out which fixed-width data columns intersect the horizontal viewport.
 *
 * Indices count data columns only: 0 is the first column after the sticky
 * leading column. `end` is exclusive. The result always satisfies
 * `leftPad + (end - start) * columnWidth + rightPad === columnCount * columnWidth`,
 * so swapping columns for spacers never changes the scroll width.
 *
 * A pinned index outside the viewport widens the window to include it. A zero
 * viewport (not yet laid out, or jsdom) renders just the overscan columns.
 */
export function computeColumnWindow({
  scrollLeft,
  viewportWidth,
  columnCount,
  columnWidth,
  leadingOffset,
  overscan,
  pinned = [],
}: ColumnWindowInput): ColumnWindow {
  if (columnCount <= 0 || columnWidth <= 0) {
    return { start: 0, end: 0, leftPad: 0, rightPad: 0 };
  }

  const left = Math.max(0, scrollLeft);
  // The sticky leading column covers the first leadingOffset px of the viewport.
  let first = Math.floor(left / columnWidth);
  let last = Math.max(
    first,
    Math.ceil((left + Math.max(0, viewportWidth) - leadingOffset) / columnWidth),
  );

  // A scrollLeft from before a column delete can point past the end. Slide the
  // window back, as the browser does when it clamps scrollLeft.
  if (last > columnCount) {
    first = Math.max(0, first - (last - columnCount));
    last = columnCount;
  }

  let start = Math.max(0, first - overscan);
  let end = Math.min(columnCount, last + overscan);

  for (const index of pinned) {
    if (!Number.isInteger(index) || index < 0 || index >= columnCount) continue;
    start = Math.min(start, index);
    end = Math.max(end, index + 1);
  }

  return {
    start,
    end,
    leftPad: start * columnWidth,
    rightPad: (columnCount - end) * columnWidth,
  };
}

interface ScrollMetrics {
  scrollLeft: number;
  viewportWidth: number;
}

export interface UseColumnWindowOptions extends Omit<
  ColumnWindowInput,
  "scrollLeft" | "viewportWidth"
> {
  /** When false the hook attaches nothing, never re-renders, and returns null. */
  enabled: boolean;
}

/**
 * Track the horizontal scroll of `scrollRef` and return its column window, or
 * null when `enabled` is false.
 *
 * Scroll events are coalesced to one measurement per animation frame, and a
 * ResizeObserver (where one exists; jsdom has none) re-measures on resize. A
 * measurement that leaves the window unchanged does not re-render, so scrolling
 * within a column costs nothing.
 */
export function useColumnWindow(
  scrollRef: RefObject<HTMLElement | null>,
  { enabled, columnCount, columnWidth, leadingOffset, overscan, pinned }: UseColumnWindowOptions,
): ColumnWindow | null {
  const [metrics, setMetrics] = useState<ScrollMetrics>({ scrollLeft: 0, viewportWidth: 0 });

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!enabled || !element) return;

    const geometry = { columnCount, columnWidth, leadingOffset, overscan };
    const sameWindow = (a: ScrollMetrics, b: ScrollMetrics) => {
      const before = computeColumnWindow({ ...a, ...geometry });
      const after = computeColumnWindow({ ...b, ...geometry });
      return before.start === after.start && before.end === after.end;
    };

    let frame = 0;
    const measure = () => {
      frame = 0;
      const next = { scrollLeft: element.scrollLeft, viewportWidth: element.clientWidth };
      setMetrics((prev) => (sameWindow(prev, next) ? prev : next));
    };
    const scheduleMeasure = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    // Measure before paint so the first frame never shows an unmeasured window.
    measure();
    element.addEventListener("scroll", scheduleMeasure, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleMeasure);
    observer?.observe(element);

    return () => {
      element.removeEventListener("scroll", scheduleMeasure);
      observer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scrollRef, enabled, columnCount, columnWidth, leadingOffset, overscan]);

  if (!enabled) return null;
  return computeColumnWindow({
    ...metrics,
    columnCount,
    columnWidth,
    leadingOffset,
    overscan,
    pinned,
  });
}
