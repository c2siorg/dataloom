import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { ProjectProvider, useProjectContext } from "../context/ProjectContext";

describe("ProjectContext — column order state", () => {
  it("setColumnOrder updates order for current project only", () => {
    const { result } = renderHook(() => useProjectContext(), {
      wrapper: ProjectProvider,
    });

    act(() => {
      result.current.setProjectInfo("project-1", "Project 1");
    });

    act(() => {
      result.current.updateData(["City", "Amount", "Date"], [], {});
    });

    act(() => {
      result.current.setColumnOrder([2, 0, 1]);
    });

    expect(result.current.columnOrder).toEqual([2, 0, 1]);
  });

  it("switching project initializes a fresh column order", () => {
    const { result } = renderHook(() => useProjectContext(), {
      wrapper: ProjectProvider,
    });

    act(() => {
      result.current.setProjectInfo("project-1", "Project 1");
    });

    act(() => {
      result.current.updateData(["City", "Amount", "Date"], [], {});
    });

    act(() => {
      result.current.setColumnOrder([2, 0, 1]);
    });

    expect(result.current.columnOrder).toEqual([2, 0, 1]);

    act(() => {
      result.current.setProjectInfo("project-2", "Project 2");
    });

    act(() => {
      result.current.updateData(["Name", "Score"], [], {});
    });

    expect(result.current.columnOrder).toEqual([0, 1]);
  });

  it("setColumnOrder does nothing when no projectId exists", () => {
    const { result } = renderHook(() => useProjectContext(), {
      wrapper: ProjectProvider,
    });

    act(() => {
      result.current.setColumnOrder([2, 0, 1]);
    });

    expect(result.current.columnOrder).toEqual([]);
  });
});
