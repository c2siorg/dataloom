import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { PanelProvider, usePanel } from "../context/PanelContext";

describe("PanelContext", () => {
  it("starts with no active panel", () => {
    const { result } = renderHook(() => usePanel(), { wrapper: PanelProvider });
    expect(result.current.activePanel).toBeNull();
  });

  it("openPanel sets the active panel", () => {
    const { result } = renderHook(() => usePanel(), { wrapper: PanelProvider });
    act(() => result.current.openPanel("FilterForm"));
    expect(result.current.activePanel).toBe("FilterForm");
  });

  it("closePanel clears the active panel", () => {
    const { result } = renderHook(() => usePanel(), { wrapper: PanelProvider });
    act(() => result.current.openPanel("Logs"));
    act(() => result.current.closePanel());
    expect(result.current.activePanel).toBeNull();
  });

  it("togglePanel opens, then closes the same panel", () => {
    const { result } = renderHook(() => usePanel(), { wrapper: PanelProvider });
    act(() => result.current.togglePanel("SortForm"));
    expect(result.current.activePanel).toBe("SortForm");
    act(() => result.current.togglePanel("SortForm"));
    expect(result.current.activePanel).toBeNull();
  });

  it("togglePanel switches directly between panels", () => {
    const { result } = renderHook(() => usePanel(), { wrapper: PanelProvider });
    act(() => result.current.togglePanel("FilterForm"));
    act(() => result.current.togglePanel("Checkpoints"));
    expect(result.current.activePanel).toBe("Checkpoints");
  });
});
