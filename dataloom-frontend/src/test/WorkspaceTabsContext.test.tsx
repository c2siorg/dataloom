import { describe, it, expect } from "vitest";
import { renderHook, render, act } from "@testing-library/react";
import {
  WorkspaceTabsProvider,
  useWorkspaceTabs,
  type WorkspaceTab,
} from "../context/WorkspaceTabsContext";
import type { ReactNode } from "react";

const DATASET = { id: "dataset", title: "DataSet", type: "dataset", closeable: true };

function makeWrapper(projectId = "p1") {
  return ({ children }: { children: ReactNode }) => (
    <WorkspaceTabsProvider projectId={projectId} initialTabs={[DATASET]}>
      {children}
    </WorkspaceTabsProvider>
  );
}

describe("WorkspaceTabsContext", () => {
  it("starts with the initial tabs and activates the first", () => {
    const { result } = renderHook(() => useWorkspaceTabs(), { wrapper: makeWrapper() });
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.activeTabId).toBe("dataset");
  });

  it("openTab appends a new tab and activates it", () => {
    const { result } = renderHook(() => useWorkspaceTabs(), { wrapper: makeWrapper() });

    act(() => {
      result.current.openTab({ id: "pivot-1", title: "Pivot", type: "pivot" });
    });

    expect(result.current.tabs.map((t) => t.id)).toEqual(["dataset", "pivot-1"]);
    expect(result.current.activeTabId).toBe("pivot-1");
  });

  it("openTab focuses an existing tab instead of duplicating", () => {
    const { result } = renderHook(() => useWorkspaceTabs(), { wrapper: makeWrapper() });

    act(() => {
      result.current.openTab({ id: "pivot-1", title: "Pivot", type: "pivot" });
    });
    act(() => {
      result.current.setActiveTab("dataset");
    });
    act(() => {
      result.current.openTab({ id: "pivot-1", title: "Pivot", type: "pivot" });
    });

    expect(result.current.tabs).toHaveLength(2);
    expect(result.current.activeTabId).toBe("pivot-1");
  });

  it("closing the active tab activates the left neighbour", () => {
    const { result } = renderHook(() => useWorkspaceTabs(), { wrapper: makeWrapper() });

    act(() => {
      result.current.openTab({ id: "a", title: "A", type: "x" });
    });
    act(() => {
      result.current.openTab({ id: "b", title: "B", type: "x" });
    });
    // tabs: [dataset, a, b], active "b"
    act(() => {
      result.current.closeTab("b");
    });

    expect(result.current.tabs.map((t) => t.id)).toEqual(["dataset", "a"]);
    expect(result.current.activeTabId).toBe("a");
  });

  it("closing the last remaining tab leaves no active tab", () => {
    const { result } = renderHook(() => useWorkspaceTabs(), { wrapper: makeWrapper() });

    act(() => {
      result.current.closeTab("dataset");
    });

    expect(result.current.tabs).toHaveLength(0);
    expect(result.current.activeTabId).toBeNull();
  });

  it("closing a non-active tab keeps the active tab", () => {
    const { result } = renderHook(() => useWorkspaceTabs(), { wrapper: makeWrapper() });

    act(() => {
      result.current.openTab({ id: "a", title: "A", type: "x" });
    });
    act(() => {
      result.current.setActiveTab("dataset");
    });
    act(() => {
      result.current.closeTab("a");
    });

    expect(result.current.activeTabId).toBe("dataset");
  });

  it("changing projectId resets tabs to the initial set", () => {
    // renderHook's wrapper doesn't receive initialProps, so drive projectId
    // through a real render + rerender and read state via a probe.
    let api: ReturnType<typeof useWorkspaceTabs> | null = null;
    function Probe() {
      api = useWorkspaceTabs();
      return null;
    }
    const tree = (projectId: string) => (
      <WorkspaceTabsProvider projectId={projectId} initialTabs={[DATASET]}>
        <Probe />
      </WorkspaceTabsProvider>
    );

    const { rerender } = render(tree("p1"));

    act(() => {
      api!.openTab({ id: "a", title: "A", type: "x" });
    });
    expect(api!.tabs).toHaveLength(2);

    act(() => {
      rerender(tree("p2"));
    });

    expect(api!.tabs.map((t: WorkspaceTab) => t.id)).toEqual(["dataset"]);
    expect(api!.activeTabId).toBe("dataset");
  });
});
