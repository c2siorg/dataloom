import { useState } from "react";
import { LuTrash2 } from "react-icons/lu";
import { applyPipeline, checkPipeline, deletePipeline } from "../../api";
import type { Pipeline } from "../../api/pipelines";
import { useProjectContext } from "../../context/ProjectContext";
import { useHistoryRefresh } from "../../context/HistoryRefreshContext";
import { useToast } from "../../context/ToastContext";
import { getErrorMessage } from "../../utils/errorUtils";
import Button from "../common/Button";
import { stepFailureMessage, stepLabel, stepSummary } from "./pipelineStepText";

/** One saved pipeline: its steps, plus apply / dry-run check / delete. */
export function PipelineCard({
  pipeline,
  projectId,
  onDeleted,
}: {
  pipeline: Pipeline;
  projectId: string;
  onDeleted: () => void | Promise<void>;
}) {
  const { updateData, setPaginationData, page, pageSize } = useProjectContext();
  const { refreshLogs } = useHistoryRefresh();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<{ ok: boolean; message: string } | null>(null);

  const orderedSteps = [...pipeline.steps].sort((a, b) => a.step_order - b.step_order);

  const handleCheck = async () => {
    setBusy(true);
    setCheck(null);
    try {
      const result = await checkPipeline(pipeline.id, projectId);
      setCheck({
        ok: result.compatible,
        message: result.compatible ? "Compatible with this project." : stepFailureMessage(result),
      });
    } catch (err) {
      showToast(getErrorMessage(err, "Compatibility check failed."), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleApply = async () => {
    setBusy(true);
    try {
      const response = await applyPipeline(pipeline.id, projectId, page, pageSize);
      showToast(`Pipeline "${pipeline.name}" applied.`, "success");
      updateData(response.columns, response.rows, { resetColumnOrder: false });
      setPaginationData(response);
      refreshLogs();
    } catch (err) {
      showToast(getErrorMessage(err, "Failed to apply pipeline."), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await deletePipeline(pipeline.id);
    } catch (err) {
      showToast(getErrorMessage(err, "Failed to delete pipeline."), "error");
      return;
    } finally {
      setBusy(false);
    }
    await onDeleted();
  };

  return (
    <li className="rounded-md border border-app-border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium text-foreground">{pipeline.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {new Date(pipeline.created_at).toLocaleDateString()} · {orderedSteps.length} step
          {orderedSteps.length === 1 ? "" : "s"}
        </span>
      </div>

      {pipeline.description && (
        <p className="mt-1 text-xs text-muted-foreground">{pipeline.description}</p>
      )}

      <ol className="mt-2 space-y-0.5">
        {orderedSteps.map((step, index) => {
          const summary = stepSummary(step.action_type, step.action_details);
          return (
            <li key={step.step_order} className="flex gap-2 text-xs text-muted-foreground">
              <span className="tabular-nums">{index + 1}.</span>
              <span className="text-foreground">{stepLabel(step.action_type)}</span>
              {summary && <span className="truncate">{summary}</span>}
            </li>
          );
        })}
      </ol>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" onClick={handleApply} disabled={busy}>
          Apply to this project
        </Button>
        <Button type="button" variant="secondary" onClick={handleCheck} disabled={busy}>
          Check
        </Button>
        <Button type="button" variant="danger" onClick={handleDelete} disabled={busy}>
          <span className="flex items-center gap-1">
            <LuTrash2 className="h-4 w-4" />
            Delete
          </span>
        </Button>
      </div>

      {check && (
        <p className={`mt-2 text-xs ${check.ok ? "text-success" : "text-danger"}`}>
          {check.message}
        </p>
      )}
    </li>
  );
}
