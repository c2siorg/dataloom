import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import useChartSuggestions from "../useChartSuggestions";
import { getChartSuggestions, type ChartSpec } from "../../api/visualizations";
import { clearProfilingCache } from "../../utils/profilingCache";

vi.mock("../../api/visualizations", () => ({
  getChartSuggestions: vi.fn(),
}));

const mockGet = vi.mocked(getChartSuggestions);

const sample: ChartSpec[] = [
  {
    chart_type: "histogram",
    title: "Distribution of x",
    x_label: "x",
    y_label: "Count",
    series: [],
  },
];

beforeEach(() => {
  mockGet.mockReset();
  clearProfilingCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("useChartSuggestions", () => {
  it("does not fetch when disabled", () => {
    renderHook(() => useChartSuggestions("p1", false, 0));
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("fetches suggestions when enabled", async () => {
    mockGet.mockResolvedValue(sample);

    const { result } = renderHook(() => useChartSuggestions("p1", true, 0));

    await waitFor(() => expect(result.current.suggestions).not.toBeNull());
    expect(result.current.suggestions?.[0]?.chart_type).toBe("histogram");
    expect(result.current.error).toBe(false);
  });

  it("sets error when the fetch fails", async () => {
    mockGet.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useChartSuggestions("p1", true, 0));

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.suggestions).toBeNull();
  });

  it("serves the cache without refetching while the version is unchanged", async () => {
    mockGet.mockResolvedValue(sample);

    const first = renderHook(() => useChartSuggestions("p1", true, 0));
    await waitFor(() => expect(first.result.current.suggestions).not.toBeNull());
    expect(mockGet).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = renderHook(() => useChartSuggestions("p1", true, 0));
    await waitFor(() => expect(second.result.current.suggestions).not.toBeNull());
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("refetches when the data version changes", async () => {
    mockGet.mockResolvedValue(sample);

    const { rerender, result } = renderHook(
      ({ version }) => useChartSuggestions("p1", true, version),
      { initialProps: { version: 0 } },
    );
    await waitFor(() => expect(result.current.suggestions).not.toBeNull());
    expect(mockGet).toHaveBeenCalledTimes(1);

    rerender({ version: 1 });
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });

  it("refetch() forces a reload past the cache", async () => {
    mockGet.mockResolvedValue(sample);

    const { result } = renderHook(() => useChartSuggestions("p1", true, 0));
    await waitFor(() => expect(result.current.suggestions).not.toBeNull());
    expect(mockGet).toHaveBeenCalledTimes(1);

    act(() => result.current.refetch());
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });
});
