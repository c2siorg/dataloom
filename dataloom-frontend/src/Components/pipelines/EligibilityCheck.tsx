import { useEffect, useState } from "react";
import { LuCircleCheck, LuCircleX } from "react-icons/lu";
import { checkDraftPipelineSteps } from "../../api";
import type { PipelineCompatibility } from "../../api/pipelines";
import { toStepInputs, usePipelineDraft } from "../../context/PipelineDraftContext";
import { useToast } from "../../context/ToastContext";
import { getErrorMessage } from "../../utils/errorUtils";
import Button from "../common/Button";
import { stepFailureMessage } from "./pipelineStepText";

/** Step 2 — dry-run the current draft against this project before saving. */
export function EligibilityCheck({ projectId }: { projectId: string }) {
  const { steps } = usePipelineDraft();
  const { showToast } = useToast();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<PipelineCompatibility | null>(null);

  // A changed draft invalidates a previous result.
  useEffect(() => {
    setResult(null);
  }, [steps]);

  const runCheck = async () => {
    setChecking(true);
    try {
      setResult(await checkDraftPipelineSteps(projectId, toStepInputs(steps)));
    } catch (err) {
      showToast(getErrorMessage(err, "Compatibility check failed."), "error");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="secondary"
        onClick={runCheck}
        disabled={steps.length === 0 || checking}
      >
        {checking ? "Checking…" : "Check against this project"}
      </Button>
      {result &&
        (result.compatible ? (
          <span className="flex items-center gap-1.5 text-xs text-success">
            <LuCircleCheck className="h-4 w-4" />
            All {steps.length} step{steps.length === 1 ? "" : "s"} run cleanly on this project.
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-danger">
            <LuCircleX className="h-4 w-4" />
            {stepFailureMessage(result)}
          </span>
        ))}
    </div>
  );
}
