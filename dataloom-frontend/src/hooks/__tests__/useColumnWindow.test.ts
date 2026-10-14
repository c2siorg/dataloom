import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  computeColumnWindow,
  useColumnWindow,
  type ColumnWindow,
  type ColumnWindowInput,
} from "../useColumnWindow";

// 200 columns of 160px behind a 64px sticky column, in an 800px viewport.
const base: ColumnWindowInput = {
  scrollLeft: 0,
  viewportWidth: 800,
  columnCount: 200,
  columnWidth: 160,
  leadingOffset: 64,
  overscan: 3,
};
const MAX_SCROLL_LEFT = 64 + 200 * 160 - 800;

const windowFor = (overrides: Partial<ColumnWindowInput>) => {
  const input = { ...base, ...overrides };
  const result = computeColumnWindow(input);
  // Spacers plus rendered columns always add up to the full scroll width.
  expect(result.start).toBeGreaterThanOrEqual(0);
  expect(result.end).toBeGreaterThanOrEqual(result.start);
  expect(result.end).toBeLessThanOrEqual(Math.max(0, input.columnCount));
  expect(result.leftPad + (result.end - result.start) * input.columnWidth + result.rightPad).toBe(
    Math.max(0, input.columnCount) * input.columnWidth,
  );
  return result;
};

const range = ({ start, end }: ColumnWindow) => [start, end];

describe("computeColumnWindow", () => {
  it("starts at the first column with overscan only on the right", () => {
    expect(windowFor({ scrollLeft: 0 })).toEqual({
      start: 0,
      end: 8,
      leftPad: 0,
      rightPad: 192 * 160,
    });
  });

  it("follows the scroll position in the middle", () => {
    // Columns 10..14 are in view at scrollLeft 1600.
    expect(windowFor({ scrollLeft: 1600 })).toEqual({
      start: 7,
      end: 18,
      leftPad: 7 * 160,
      rightPad: 182 * 160,
    });
  });

  it("ends at the last column when fully scrolled right", () => {
    expect(windowFor({ scrollLeft: MAX_SCROLL_LEFT })).toEqual({
      start: 192,
      end: 200,
      leftPad: 192 * 160,
      rightPad: 0,
    });
  });

  it("renders overscan columns past each edge of the viewport", () => {
    expect(range(windowFor({ scrollLeft: 1600, overscan: 0 }))).toEqual([10, 15]);
    expect(range(windowFor({ scrollLeft: 1600, overscan: 3 }))).toEqual([7, 18]);
  });

  it("widens the window to include a pinned column before it", () => {
    expect(windowFor({ scrollLeft: 1600, pinned: [2] })).toMatchObject({
      start: 2,
      end: 18,
      leftPad: 2 * 160,
    });
  });

  it("widens the window to include a pinned column after it", () => {
    expect(windowFor({ scrollLeft: 1600, pinned: [150] })).toMatchObject({
      start: 7,
      end: 151,
      rightPad: 49 * 160,
    });
    expect(range(windowFor({ scrollLeft: 1600, pinned: [2, 150] }))).toEqual([2, 151]);
  });

  it("ignores pinned indices inside the window or out of range", () => {
    expect(range(windowFor({ scrollLeft: 1600, pinned: [12] }))).toEqual([7, 18]);
    expect(range(windowFor({ scrollLeft: 1600, pinned: [-1, 200, 1.5, NaN] }))).toEqual([7, 18]);
  });

  it("slides back into range when columnCount shrinks under a stale scrollLeft", () => {
    // scrollLeft from a 200-column table, after the table shrank to 60 columns.
    expect(windowFor({ scrollLeft: 30000, columnCount: 60 })).toEqual({
      start: 51,
      end: 60,
      leftPad: 51 * 160,
      rightPad: 0,
    });
    expect(range(windowFor({ scrollLeft: 30000, columnCount: 3 }))).toEqual([0, 3]);
  });

  it("drops a pinned index that the shrink left out of range", () => {
    expect(range(windowFor({ scrollLeft: 0, columnCount: 60, pinned: [150] }))).toEqual([0, 8]);
  });

  it("renders only the overscan when the viewport has no width", () => {
    expect(windowFor({ viewportWidth: 0 })).toEqual({
      start: 0,
      end: 3,
      leftPad: 0,
      rightPad: 197 * 160,
    });
    expect(range(windowFor({ viewportWidth: 0, scrollLeft: 1600 }))).toEqual([7, 13]);
    expect(range(windowFor({ viewportWidth: 0, columnCount: 2 }))).toEqual([0, 2]);
  });

  it("treats a negative scrollLeft as the start", () => {
    expect(range(windowFor({ scrollLeft: -40 }))).toEqual([0, 8]);
  });

  it("returns an empty window when there are no columns", () => {
    expect(windowFor({ columnCount: 0, pinned: [0] })).toEqual({
      start: 0,
      end: 0,
      leftPad: 0,
      rightPad: 0,
    });
  });
});

describe("useColumnWindow", () => {
  const options = {
    columnCount: 200,
    columnWidth: 160,
    leadingOffset: 64,
    overscan: 3,
  };

  const scrollElement = () => {
    const element = document.createElement("div");
    Object.defineProperty(element, "clientWidth", { configurable: true, value: 800 });
    return element;
  };

  const nextFrame = () =>
    act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null and attaches no listener when disabled", () => {
    const element = scrollElement();
    const addListener = vi.spyOn(element, "addEventListener");

    const { result } = renderHook(() =>
      useColumnWindow({ current: element }, { ...options, enabled: false }),
    );

    expect(result.current).toBeNull();
    expect(addListener).not.toHaveBeenCalled();
  });

  it("measures on mount and coalesces scroll events into one frame", async () => {
    const element = scrollElement();
    const requestFrame = vi.spyOn(globalThis, "requestAnimationFrame");

    const { result } = renderHook(() =>
      useColumnWindow({ current: element }, { ...options, enabled: true }),
    );
    expect(range(result.current!)).toEqual([0, 8]);

    element.scrollLeft = 1600;
    element.dispatchEvent(new Event("scroll"));
    element.dispatchEvent(new Event("scroll"));
    element.dispatchEvent(new Event("scroll"));
    expect(requestFrame).toHaveBeenCalledTimes(1);

    await nextFrame();
    expect(range(result.current!)).toEqual([7, 18]);
  });

  it("does not re-render for a scroll that keeps the same window", async () => {
    const element = scrollElement();
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useColumnWindow({ current: element }, { ...options, enabled: true });
    });
    const rendersAfterMount = renders;

    element.scrollLeft = 20;
    element.dispatchEvent(new Event("scroll"));
    await nextFrame();

    expect(renders).toBe(rendersAfterMount);
  });

  it("removes the listener and cancels a pending frame on unmount", () => {
    const element = scrollElement();
    const removeListener = vi.spyOn(element, "removeEventListener");
    const cancelFrame = vi.spyOn(globalThis, "cancelAnimationFrame");

    const { unmount } = renderHook(() =>
      useColumnWindow({ current: element }, { ...options, enabled: true }),
    );
    element.dispatchEvent(new Event("scroll"));
    unmount();

    expect(removeListener).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(cancelFrame).toHaveBeenCalledTimes(1);
  });
});
