import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import useCorrelation from "../useCorrelation";
import { getCorrelationMatrix } from "../../api/profiling";
import { clearProfilingCache } from "../../utils/profilingCache";

vi.mock("../../api/profiling", () => ({
  getCorrelationMatrix: vi.fn(),
}));

const mockGet = vi.mocked(getCorrelationMatrix);

const sample = {
  columns: ["a", "b"],
  matrix: [
    [1, 0.5],
    [0.5, 1],
  ],
};

beforeEach(() => {
  mockGet.mockReset();
  clearProfilingCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("useCorrelation", () => {
  it("does not fetch when disabled", () => {
    renderHook(() => useCorrelation("p1", false, 0));
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("fetches the correlation matrix when enabled", async () => {
    mockGet.mockResolvedValue(sample);

    const { result } = renderHook(() => useCorrelation("p1", true, 0));

    await waitFor(() => expect(result.current.correlation).not.toBeNull());
    expect(result.current.correlation?.columns).toEqual(["a", "b"]);
    expect(result.current.error).toBe(false);
  });

  it("sets error when the fetch fails", async () => {
    mockGet.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useCorrelation("p1", true, 0));

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.correlation).toBeNull();
  });

  it("serves the cache without refetching while the version is unchanged", async () => {
    mockGet.mockResolvedValue(sample);

    const first = renderHook(() => useCorrelation("p1", true, 0));
    await waitFor(() => expect(first.result.current.correlation).not.toBeNull());
    expect(mockGet).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = renderHook(() => useCorrelation("p1", true, 0));
    await waitFor(() => expect(second.result.current.correlation).not.toBeNull());
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("refetches when the data version changes", async () => {
    mockGet.mockResolvedValue(sample);

    const { rerender, result } = renderHook(({ version }) => useCorrelation("p1", true, version), {
      initialProps: { version: 0 },
    });
    await waitFor(() => expect(result.current.correlation).not.toBeNull());
    expect(mockGet).toHaveBeenCalledTimes(1);

    rerender({ version: 1 });
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });

  it("refetch() forces a reload past the cache", async () => {
    mockGet.mockResolvedValue(sample);

    const { result } = renderHook(() => useCorrelation("p1", true, 0));
    await waitFor(() => expect(result.current.correlation).not.toBeNull());
    expect(mockGet).toHaveBeenCalledTimes(1);

    act(() => result.current.refetch());
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });
});
