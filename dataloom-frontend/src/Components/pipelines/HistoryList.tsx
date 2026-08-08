import { LuPlus } from "react-icons/lu";
import { usePipelineDraft } from "../../context/PipelineDraftContext";
import { useToast } from "../../context/ToastContext";
import { useLogs, type LogEntry } from "../../hooks/useLogs";
import { stepLabel } from "./pipelineStepText";
import { StepText } from "./StepText";

/** Always-visible list of the project's logged steps; clicking one appends it to the draft. */
export function HistoryList({ projectId }: { projectId: string }) {
  const { addStep } = usePipelineDraft();
  const { showToast } = useToast();
  const logs = useLogs(projectId);

  const addLog = (log: LogEntry) => {
    addStep({ action_type: log.action_type, action_details: log.action_details, source: "log" });
    showToast(`Added ${stepLabel(log.action_type)} step to the draft.`, "success");
  };

  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        From this project’s history
      </p>
      {logs.length === 0 ? (
        <p className="rounded-md border border-dashed border-app-border px-3 py-4 text-center text-xs text-muted-foreground">
          Nothing logged yet. Run some transforms first, or build a step from scratch.
        </p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-app-border p-1">
          {logs.map((log) => (
            <li
              key={log.id}
              className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-surface-hover"
            >
              <StepText actionType={log.action_type} details={log.action_details} />
              <button
                type="button"
                aria-label={`Add ${stepLabel(log.action_type)} step`}
                onClick={() => addLog(log)}
                className="ml-auto flex shrink-0 items-center gap-1 rounded-md border border-app-border px-2 py-1 text-xs text-foreground hover:bg-surface"
              >
                <LuPlus className="h-3.5 w-3.5" />
                Add
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
