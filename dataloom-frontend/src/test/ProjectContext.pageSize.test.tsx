import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { ProjectProvider, useProjectContext } from "../context/ProjectContext";
import { getProjectDetails } from "../api";

vi.mock("../api", () => ({
  getProjectDetails: vi.fn(),
}));

const mockGetProjectDetails = getProjectDetails as unknown as Mock;

describe("ProjectContext — page size clamping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset here rather than at the end of each test: a trailing cleanup line
    // is skipped when an assertion above it fails, leaking the key into the
    // next test and turning one real failure into several.
    localStorage.clear();
  });

  it("clamps a pageSize hydrated from localStorage above the max down to 100", () => {
    localStorage.setItem("pageSize", "121500");

    const { result } = renderHook(() => useProjectContext(), {
      wrapper: ProjectProvider,
    });

    expect(result.current.pageSize).toBe(100);
  });

  it("sends the clamped pageSize on the next request", async () => {
    localStorage.setItem("pageSize", "121500");
    mockGetProjectDetails.mockResolvedValue({
      project_id: "p1",
      filename: "proj",
      file_path: "proj.csv",
      columns: ["A"],
      rows: [[1]],
      dtypes: { A: "int" },
      page: 1,
      page_size: 100,
      total_rows: 1,
      total_pages: 1,
    });

    const { result } = renderHook(() => useProjectContext(), {
      wrapper: ProjectProvider,
    });

    await act(async () => {
      await result.current.refreshProject("p1");
    });

    // A stale, pre-fix localStorage value must not resurface as an
    // out-of-range page_size on the request — the backend now rejects
    // anything over 100 with a 422.
    expect(mockGetProjectDetails).toHaveBeenCalledWith("p1", 1, 100);
  });

  it("clamps a pageSize hydrated from localStorage below the min up to 1", () => {
    localStorage.setItem("pageSize", "0");

    const { result } = renderHook(() => useProjectContext(), {
      wrapper: ProjectProvider,
    });

    expect(result.current.pageSize).toBe(1);
  });

  it("falls back to the default for a non-numeric localStorage value", () => {
    localStorage.setItem("pageSize", "not-a-number");

    const { result } = renderHook(() => useProjectContext(), {
      wrapper: ProjectProvider,
    });

    expect(result.current.pageSize).toBe(50);
  });

  it("falls back to the default when the pageSize key is absent", () => {
    localStorage.removeItem("pageSize");

    const { result } = renderHook(() => useProjectContext(), {
      wrapper: ProjectProvider,
    });

    expect(result.current.pageSize).toBe(50);
  });

  it("clamps an out-of-range pageSize passed to updatePageSizePreference", () => {
    const { result } = renderHook(() => useProjectContext(), {
      wrapper: ProjectProvider,
    });

    act(() => {
      result.current.updatePageSizePreference(500);
    });

    // The preference write path must clamp too, so a caller outside
    // PAGE_SIZE_OPTIONS cannot persist a value the backend rejects.
    expect(result.current.pageSize).toBe(100);
    expect(localStorage.getItem("pageSize")).toBe("100");
  });
});
