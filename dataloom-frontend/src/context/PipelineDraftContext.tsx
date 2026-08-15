import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PipelineStepInput } from "../api/pipelines";
import { useProjectContext } from "./ProjectContext";

/** Where a draft step came from: picked off the change log, or built from scratch. */
export type DraftStepSource = "log" | "manual";

/** A single step in the pipeline being assembled, before it is saved. */
export interface DraftStep {
  /** Stable client-side key for list rendering and reordering. */
  id: string;
  action_type: string;
  action_details: Record<string, unknown>;
  source: DraftStepSource;
}

/** A new step to add, minus the client id (assigned by the context). */
export type NewDraftStep = Omit<DraftStep, "id">;

interface PipelineDraftValue {
  steps: DraftStep[];
  addStep: (step: NewDraftStep) => void;
  removeStep: (id: string) => void;
  /** Move a step up (-1) or down (+1) in the run order. */
  moveStep: (id: string, direction: -1 | 1) => void;
  clearDraft: () => void;
}

const PipelineDraftContext = createContext<PipelineDraftValue | null>(null);

/**
 * Drop the client-only fields, leaving the `{ action_type, action_details }`
 * pairs the API stores. Used wherever a draft is sent to the backend — the
 * eligibility check and the save.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function toStepInputs(steps: DraftStep[]): PipelineStepInput[] {
  return steps.map((step) => ({
    action_type: step.action_type,
    action_details: step.action_details,
  }));
}

/** Access the shared pipeline draft. Bridges the docked step builder and the Pipelines tab. */
// eslint-disable-next-line react-refresh/only-export-components
export function usePipelineDraft(): PipelineDraftValue {
  const context = useContext(PipelineDraftContext);
  if (!context) throw new Error("usePipelineDraft must be used within a PipelineDraftProvider");
  return context;
}

/**
 * Holds the steps currently being assembled so the docked step builder (which
 * appends them) and the Pipelines tab (which lists, reorders and saves them) stay
 * in sync. The draft resets when the workspace's project changes.
 */
export function PipelineDraftProvider({ children }: { children: ReactNode }) {
  const { projectId } = useProjectContext();

  const [steps, setSteps] = useState<DraftStep[]>([]);
  const nextId = useRef(0);

  const addStep = useCallback((step: NewDraftStep) => {
    const id = String((nextId.current += 1));
    setSteps((prev) => [...prev, { ...step, id }]);
  }, []);

  const removeStep = useCallback((id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const moveStep = useCallback((id: string, direction: -1 | 1) => {
    setSteps((prev) => {
      const index = prev.findIndex((s) => s.id === id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const moved = next[index]!;
      next[index] = next[target]!;
      next[target] = moved;
      return next;
    });
  }, []);

  const clearDraft = useCallback(() => {
    setSteps([]);
  }, []);

  // Starting a different workspace should not carry a half-built draft over.
  useEffect(() => {
    clearDraft();
  }, [projectId, clearDraft]);

  const value = useMemo<PipelineDraftValue>(
    () => ({ steps, addStep, removeStep, moveStep, clearDraft }),
    [steps, addStep, removeStep, moveStep, clearDraft],
  );

  return <PipelineDraftContext.Provider value={value}>{children}</PipelineDraftContext.Provider>;
}
