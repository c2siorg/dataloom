import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import useColumnProfiles from "../useColumnProfiles";
import { getColumnProfiles } from "../../api/profiling";
import { clearProfilingCache } from "../../utils/profilingCache";

vi.mock("../../api/profiling", () => ({
  getColumnProfiles: vi.fn(),
}));

const mockGet = vi.mocked(getColumnProfiles);

beforeEach(() => {
  mockGet.mockReset();
  clearProfilingCache();
});

describe("useColumnProfiles", () => {
  it("does not fetch when disabled", () => {
    renderHook(() => useColumnProfiles("p1", false, 0));
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("fetches all columns in one request and keys them by name", async () => {
    mockGet.mockResolvedValue([
      { column: "a", dtype: "str" },
      { column: "b", dtype: "str" },
    ] as never);

    const { result } = renderHook(() => useColumnProfiles("p1", true, 0));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(Object.keys(result.current.profiles)).toEqual(["a", "b"]);
    expect(result.current.profiles.a?.column).toBe("a");
  });

  it("leaves profiles empty when the request fails", async () => {
    mockGet.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useColumnProfiles("p1", true, 0));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profiles).toEqual({});
  });

  it("serves the cache without refetching while the version is unchanged", async () => {
    mockGet.mockResolvedValue([{ column: "a", dtype: "str" }] as never);

    // First mount fetches and populates the cache.
    const first = renderHook(() => useColumnProfiles("p1", true, 0));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(mockGet).toHaveBeenCalledTimes(1);
    first.unmount();

    // A fresh mount at the same version is a cache hit — no second request.
    const second = renderHook(() => useColumnProfiles("p1", true, 0));
    await waitFor(() => expect(Object.keys(second.result.current.profiles)).toEqual(["a"]));
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("refetches when the data version changes", async () => {
    mockGet.mockResolvedValue([{ column: "a", dtype: "str" }] as never);

    const { result, rerender } = renderHook(
      ({ version }) => useColumnProfiles("p1", true, version),
      { initialProps: { version: 0 } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGet).toHaveBeenCalledTimes(1);

    rerender({ version: 1 });
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });
});
