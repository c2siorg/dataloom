import { useState } from "react";
import { LuChevronDown, LuChevronRight, LuTrash2 } from "react-icons/lu";
import type { Pipeline } from "../../api/pipelines";
import Button from "../common/Button";
import { StepRail, StepText } from "./StepText";

interface SavedPipelineItemProps {
  pipeline: Pipeline;
  onDelete: (pipeline: Pipeline) => void;
}

/** One expandable pipeline row for the user-wide Settings library. */
export default function SavedPipelineItem({ pipeline, onDelete }: SavedPipelineItemProps) {
  const [expanded, setExpanded] = useState(false);
  const steps = [...pipeline.steps].sort((a, b) => a.step_order - b.step_order);

  return (
    <li className="rounded-2xl border border-app-border bg-surface p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={`pipeline-steps-${pipeline.id}`}
          aria-label={`${expanded ? "Hide" : "Show"} ${steps.length} steps for ${pipeline.name}`}
          onClick={() => setExpanded((value) => !value)}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-lg text-left focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <span className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true">
            {expanded ? (
              <LuChevronDown className="h-4 w-4" />
            ) : (
              <LuChevronRight className="h-4 w-4" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="truncate text-base font-semibold text-foreground">
                {pipeline.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {steps.length} {steps.length === 1 ? "step" : "steps"}
              </span>
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">
              {pipeline.description || "No description"}
            </span>
            <span className="mt-2 block text-xs text-muted-foreground">
              Created {new Date(pipeline.created_at).toLocaleDateString()}
            </span>
          </span>
        </button>

        <Button
          type="button"
          variant="danger"
          size="sm"
          aria-label={`Delete ${pipeline.name}`}
          onClick={() => onDelete(pipeline)}
          className="self-start sm:shrink-0"
        >
          <span className="flex items-center gap-1.5">
            <LuTrash2 className="h-4 w-4" />
            Delete
          </span>
        </Button>
      </div>

      {expanded && (
        <ol
          id={`pipeline-steps-${pipeline.id}`}
          aria-label={`${pipeline.name} steps`}
          className="ml-2 mt-5 space-y-2 border-t border-app-border pt-4"
        >
          {steps.map((step, index) => (
            <li key={`${pipeline.id}-${step.step_order}`} className="flex min-h-8 gap-3">
              <StepRail index={index} last={index === steps.length - 1} />
              <StepText actionType={step.action_type} details={step.action_details} />
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}
