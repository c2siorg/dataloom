import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import useDatasetSummary from "../useDatasetSummary";
import { getDatasetSummary } from "../../api/profiling";
import { clearProfilingCache } from "../../utils/profilingCache";

vi.mock("../../api/profiling", () => ({
  getDatasetSummary: vi.fn(),
}));

const mockGet = vi.mocked(getDatasetSummary);

beforeEach(() => {
  mockGet.mockReset();
  clearProfilingCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("useDatasetSummary", () => {
  it("does not fetch when disabled", () => {
    renderHook(() => useDatasetSummary("p1", false, 0));
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("fetches the summary when enabled", async () => {
    mockGet.mockResolvedValue({ row_count: 10 } as never);

    const { result } = renderHook(() => useDatasetSummary("p1", true, 0));

    await waitFor(() => expect(result.current.summary).not.toBeNull());
    expect(result.current.summary?.row_count).toBe(10);
    expect(result.current.error).toBe(false);
  });

  it("sets error when the fetch fails", async () => {
    mockGet.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useDatasetSummary("p1", true, 0));

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.summary).toBeNull();
  });

  it("serves the cache without refetching while the version is unchanged", async () => {
    mockGet.mockResolvedValue({ row_count: 10 } as never);

    const first = renderHook(() => useDatasetSummary("p1", true, 0));
    await waitFor(() => expect(first.result.current.summary).not.toBeNull());
    expect(mockGet).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = renderHook(() => useDatasetSummary("p1", true, 0));
    await waitFor(() => expect(second.result.current.summary).not.toBeNull());
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("refetch() forces a reload past the cache", async () => {
    mockGet.mockResolvedValue({ row_count: 10 } as never);

    const { result } = renderHook(() => useDatasetSummary("p1", true, 0));
    await waitFor(() => expect(result.current.summary).not.toBeNull());
    expect(mockGet).toHaveBeenCalledTimes(1);

    act(() => result.current.refetch());
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });

  it("consults the cache again after a refetch (bypass does not persist)", async () => {
    mockGet.mockResolvedValue({ row_count: 10 } as never);

    const { result, rerender } = renderHook(({ enabled }) => useDatasetSummary("p1", enabled, 0), {
      initialProps: { enabled: true },
    });
    await waitFor(() => expect(result.current.summary).not.toBeNull());
    expect(mockGet).toHaveBeenCalledTimes(1);

    // A manual retry should bypass the cache exactly once.
    act(() => result.current.refetch());
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));

    // Re-running the effect at the same version (e.g. toggling the panel off
    // and back on) must hit the cache, not refetch — the bypass is one-shot.
    rerender({ enabled: false });
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.summary?.row_count).toBe(10));
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});
