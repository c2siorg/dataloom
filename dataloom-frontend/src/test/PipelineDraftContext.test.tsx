import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { PipelineDraftProvider, usePipelineDraft } from "../context/PipelineDraftContext";

// The provider only reads projectId (to reset the draft on project switch).
vi.mock("../context/ProjectContext", () => ({
  useProjectContext: () => ({ projectId: "p1" }),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <PipelineDraftProvider>{children}</PipelineDraftProvider>
);

const step = (action_type: string, source: "log" | "manual" = "manual") => ({
  action_type,
  action_details: { operation_type: action_type },
  source,
});

describe("PipelineDraftContext", () => {
  it("addStep appends with a stable id and preserves source", () => {
    const { result } = renderHook(() => usePipelineDraft(), { wrapper });

    act(() => result.current.addStep(step("filter", "log")));
    act(() => result.current.addStep(step("sort", "manual")));

    expect(result.current.steps.map((s) => s.action_type)).toEqual(["filter", "sort"]);
    expect(result.current.steps.map((s) => s.source)).toEqual(["log", "manual"]);
    expect(new Set(result.current.steps.map((s) => s.id)).size).toBe(2);
  });

  it("removeStep drops the step by id", () => {
    const { result } = renderHook(() => usePipelineDraft(), { wrapper });

    act(() => result.current.addStep(step("filter")));
    act(() => result.current.addStep(step("sort")));
    const firstId = result.current.steps[0]!.id;

    act(() => result.current.removeStep(firstId));

    expect(result.current.steps.map((s) => s.action_type)).toEqual(["sort"]);
  });

  it("moveStep reorders and is a no-op at the boundaries", () => {
    const { result } = renderHook(() => usePipelineDraft(), { wrapper });

    act(() => result.current.addStep(step("filter")));
    act(() => result.current.addStep(step("sort")));
    const [a, b] = result.current.steps as [
      (typeof result.current.steps)[number],
      (typeof result.current.steps)[number],
    ];

    act(() => result.current.moveStep(b.id, -1));
    expect(result.current.steps.map((s) => s.action_type)).toEqual(["sort", "filter"]);

    // b is now at the top; moving it up again does nothing.
    act(() => result.current.moveStep(b.id, -1));
    expect(result.current.steps.map((s) => s.action_type)).toEqual(["sort", "filter"]);

    act(() => result.current.moveStep(a.id, -1));
    expect(result.current.steps.map((s) => s.action_type)).toEqual(["filter", "sort"]);
  });

  it("clearDraft empties the name and steps", () => {
    const { result } = renderHook(() => usePipelineDraft(), { wrapper });

    act(() => result.current.setName("Monthly"));
    act(() => result.current.addStep(step("filter")));

    act(() => result.current.clearDraft());

    expect(result.current.name).toBe("");
    expect(result.current.steps).toEqual([]);
  });
});
