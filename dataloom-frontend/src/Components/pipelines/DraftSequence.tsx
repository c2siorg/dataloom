import { LuArrowDown, LuArrowUp, LuWorkflow, LuX } from "react-icons/lu";
import { usePipelineDraft } from "../../context/PipelineDraftContext";
import { StepRail, StepText } from "./StepText";

/** The ordered draft sequence with per-step reorder/remove controls. */
export function DraftSequence() {
  const { steps, removeStep, moveStep } = usePipelineDraft();

  if (steps.length === 0) {
    return (
      <div className="flex h-full min-h-[9rem] flex-col items-center justify-center rounded-md border border-dashed border-app-border px-3 py-6 text-center">
        <LuWorkflow className="mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Your pipeline is empty. Add steps from the left to build it.
        </p>
      </div>
    );
  }

  return (
    <ol>
      {steps.map((step, index) => (
        <li key={step.id} className="flex gap-3 pb-2 last:pb-0">
          <StepRail index={index} last={index === steps.length - 1} />
          <div className="flex flex-1 items-center gap-2 rounded-md border border-app-border px-3 py-2">
            <StepText
              actionType={step.action_type}
              details={step.action_details}
              source={step.source}
            />
            <div className="ml-auto flex items-center gap-0.5">
              <button
                type="button"
                aria-label="Move step up"
                disabled={index === 0}
                onClick={() => moveStep(step.id, -1)}
                className="rounded p-1 text-muted-foreground hover:bg-surface-hover disabled:opacity-30"
              >
                <LuArrowUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Move step down"
                disabled={index === steps.length - 1}
                onClick={() => moveStep(step.id, 1)}
                className="rounded p-1 text-muted-foreground hover:bg-surface-hover disabled:opacity-30"
              >
                <LuArrowDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Remove step"
                onClick={() => removeStep(step.id)}
                className="rounded p-1 text-muted-foreground hover:bg-surface-hover"
              >
                <LuX className="h-4 w-4" />
              </button>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
