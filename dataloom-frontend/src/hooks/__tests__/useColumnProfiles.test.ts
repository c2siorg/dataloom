import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import useColumnProfiles from "../useColumnProfiles";
import { getColumnProfile } from "../../api/profiling";

vi.mock("../../api/profiling", () => ({
  getColumnProfile: vi.fn(),
}));

const mockGet = vi.mocked(getColumnProfile);

beforeEach(() => {
  mockGet.mockReset();
});

describe("useColumnProfiles", () => {
  it("does not fetch when disabled", () => {
    renderHook(() => useColumnProfiles("p1", ["a", "b"], false, 0));
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("fetches all columns in parallel and keys them by name", async () => {
    mockGet.mockImplementation((_id, name) =>
      Promise.resolve({ column: name, dtype: "str" } as never),
    );

    const { result } = renderHook(() => useColumnProfiles("p1", ["a", "b"], true, 0));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(Object.keys(result.current.profiles)).toEqual(["a", "b"]);
    expect(result.current.profiles.a?.column).toBe("a");
  });

  it("skips a column whose fetch fails without dropping the others", async () => {
    mockGet.mockImplementation((_id, name) =>
      name === "b"
        ? Promise.reject(new Error("boom"))
        : Promise.resolve({ column: name, dtype: "str" } as never),
    );

    const { result } = renderHook(() => useColumnProfiles("p1", ["a", "b"], true, 0));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(Object.keys(result.current.profiles)).toEqual(["a"]);
  });

  it("refetches when the data version changes", async () => {
    mockGet.mockResolvedValue({ column: "a", dtype: "str" } as never);

    const { result, rerender } = renderHook(
      ({ version }) => useColumnProfiles("p1", ["a"], true, version),
      { initialProps: { version: 0 } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGet).toHaveBeenCalledTimes(1);

    rerender({ version: 1 });
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });
});
