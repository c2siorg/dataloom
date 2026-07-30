import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import {
  LuArrowDown,
  LuArrowUp,
  LuCircleCheck,
  LuCircleX,
  LuPlus,
  LuTrash2,
  LuWorkflow,
  LuX,
} from "react-icons/lu";
import {
  applyPipeline,
  checkPipeline,
  checkSteps,
  createPipeline,
  deletePipeline,
  getLogs,
  getPipelines,
} from "../../api";
import type { Pipeline, PipelineCompatibility } from "../../api/pipelines";
import { usePipelineDraft } from "../../context/PipelineDraftContext";
import { usePanel } from "../../context/PanelContext";
import { useProjectContext } from "../../context/ProjectContext";
import { useHistoryRefresh, useHistoryRefreshTokens } from "../../context/HistoryRefreshContext";
import { useToast } from "../../context/ToastContext";
import type { WorkspaceTab } from "../../context/WorkspaceTabsContext";
import Button from "../common/Button";
import { stepLabel, stepSummary } from "../pipelines/pipelineStepText";

/**
 * The docked step-builder panel this tab opens for "add a step from scratch".
 * Shared with the feature registration so both name the same panel.
 */
export const STEP_BUILDER_PANEL = "PipelineStepBuilder";

interface LogEntry {
  id: number;
  action_type: string;
  action_details: Record<string, unknown>;
  timestamp: string;
}

const errorDetail = (err: unknown, fallback: string): string =>
  (err as { response?: { data?: { detail?: string } } }).response?.data?.detail || fallback;

/** A numbered "—— Step N —— Title ——" divider that opens each part of the form. */
function SectionHeader({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-surface">
        {n}
      </span>
      <div className="shrink-0">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <span className="ml-2 h-px flex-1 bg-app-border" />
    </div>
  );
}

/** Ordinal badge with a connecting rail, marking a step's position in the run order. */
function StepRail({ index, last }: { index: number; last: boolean }) {
  return (
    <div className="flex flex-col items-center self-stretch">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-app-border bg-surface text-xs font-medium text-muted-foreground">
        {index + 1}
      </span>
      {!last && <span className="mt-1 w-px flex-1 bg-app-border" />}
    </div>
  );
}

/** Label + parameter summary + optional source tag for one step. */
function StepText({
  actionType,
  details,
  source,
}: {
  actionType: string;
  details: Record<string, unknown>;
  source?: "log" | "manual";
}) {
  const summary = stepSummary(actionType, details);
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">{stepLabel(actionType)}</span>
        {source && (
          <span className="rounded border border-app-border px-1 py-px text-[10px] uppercase tracking-wide text-muted-foreground">
            {source}
          </span>
        )}
      </div>
      {summary && <p className="truncate text-xs text-muted-foreground">{summary}</p>}
    </div>
  );
}

/** Always-visible list of the project's logged steps; clicking one appends it to the draft. */
function HistoryList({ projectId }: { projectId: string }) {
  const { addStep } = usePipelineDraft();
  const { showToast } = useToast();
  const { logsToken } = useHistoryRefreshTokens();
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const loadLogs = useCallback(async () => {
    try {
      setLogs(await getLogs(projectId));
    } catch {
      setLogs([]);
    }
  }, [projectId]);

  // Refetch on mount and whenever a mutation bumps the logs token.
  useEffect(() => {
    loadLogs();
  }, [loadLogs, logsToken]);

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

/** The ordered draft sequence with per-step reorder/remove controls. */
function DraftSequence() {
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

/** Step 2 — dry-run the current draft against this project before saving. */
function EligibilityCheck({ projectId }: { projectId: string }) {
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
      setResult(
        await checkSteps(
          projectId,
          steps.map((s) => ({ action_type: s.action_type, action_details: s.action_details })),
        ),
      );
    } catch (err) {
      showToast(errorDetail(err, "Compatibility check failed."), "error");
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
            Step {(result.failing_step ?? 0) + 1} ({stepLabel(result.action_type ?? "")}) would
            fail: {result.reason}
          </span>
        ))}
    </div>
  );
}

/** Step 3 — name the draft and save it. */
function SaveBar({
  projectId,
  onSaved,
}: {
  projectId: string;
  onSaved: () => void | Promise<void>;
}) {
  const { name, setName, steps, clearDraft } = usePipelineDraft();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [description, setDescription] = useState("");

  const handleSave = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createPipeline(
        projectId,
        name.trim(),
        steps.map((s) => ({ action_type: s.action_type, action_details: s.action_details })),
        description,
      );
      showToast("Pipeline saved.", "success");
      clearDraft();
      setDescription("");
      await onSaved();
    } catch (err) {
      showToast(errorDetail(err, "Failed to save pipeline."), "error");
    } finally {
      setSaving(false);
    }
  };

  const canSave = name.trim() !== "" && steps.length > 0 && !saving;

  return (
    <form onSubmit={handleSave} className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Pipeline name"
        placeholder="Pipeline name, e.g. Monthly cleanup"
        className="min-w-56 flex-1 rounded-md border border-app-border bg-surface px-3 py-2 text-sm text-foreground"
      />
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        aria-label="Pipeline description"
        placeholder="Description (optional)"
        className="min-w-56 flex-1 rounded-md border border-app-border bg-surface px-3 py-2 text-sm text-foreground"
      />
      <Button type="submit" disabled={!canSave}>
        {saving ? "Saving…" : "Save pipeline"}
      </Button>
      {steps.length > 0 && (
        <button
          type="button"
          onClick={clearDraft}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Clear draft
        </button>
      )}
    </form>
  );
}

/** One saved pipeline: its steps, plus apply / dry-run check / delete. */
function PipelineCard({
  pipeline,
  projectId,
  onDeleted,
}: {
  pipeline: Pipeline;
  projectId: string;
  onDeleted: () => void | Promise<void>;
}) {
  const { refreshProject } = useProjectContext();
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
        message: result.compatible
          ? "Compatible with this project."
          : `Step ${(result.failing_step ?? 0) + 1} (${stepLabel(result.action_type ?? "")}) would fail: ${result.reason}`,
      });
    } catch (err) {
      showToast(errorDetail(err, "Compatibility check failed."), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleApply = async () => {
    setBusy(true);
    try {
      await applyPipeline(pipeline.id, projectId);
      showToast(`Pipeline "${pipeline.name}" applied.`, "success");
      refreshProject();
      refreshLogs();
    } catch (err) {
      showToast(errorDetail(err, "Failed to apply pipeline."), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await deletePipeline(pipeline.id);
    } catch (err) {
      showToast(errorDetail(err, "Failed to delete pipeline."), "error");
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

/** A form section: the numbered divider header plus its indented body. */
function Section({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <SectionHeader n={n} title={title} hint={hint} />
      <div className="pl-10">{children}</div>
    </section>
  );
}

/**
 * Pipelines tab — a full-page, numbered form for building a reusable pipeline:
 * choose steps (from history or built from scratch in the docked builder), check
 * eligibility against the current project, then name and save. Saved pipelines are
 * listed below with their steps and apply/check/delete actions.
 */
export function PipelinesTab() {
  const { projectId } = useParams() as { projectId: string };
  const { openPanel } = usePanel();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);

  const loadPipelines = useCallback(async () => {
    try {
      setPipelines(await getPipelines());
    } catch {
      setPipelines([]);
    }
  }, []);

  useEffect(() => {
    loadPipelines();
  }, [loadPipelines]);

  return (
    <div className="flex-1 space-y-8 overflow-auto p-6">
      <header>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <LuWorkflow className="h-5 w-5" />
          Build a pipeline
        </h1>
        <p className="text-sm text-muted-foreground">
          Assemble an ordered set of transformations once, then replay it on any project.
        </p>
      </header>

      <Section n={1} title="Choose transformations" hint="Add steps in the order they should run.">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => openPanel(STEP_BUILDER_PANEL)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-app-border px-3 py-2 text-sm text-foreground hover:bg-surface-hover"
            >
              <LuPlus className="h-4 w-4" />
              Build a step from scratch
            </button>
            <HistoryList projectId={projectId} />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Your pipeline
            </p>
            <DraftSequence />
          </div>
        </div>
      </Section>

      <Section n={2} title="Check eligibility" hint="Optional: dry-run the draft on this project.">
        <EligibilityCheck projectId={projectId} />
      </Section>

      <Section n={3} title="Name & save">
        <SaveBar projectId={projectId} onSaved={loadPipelines} />
      </Section>

      <section className="space-y-3">
        <SectionHeader
          n={4}
          title="Saved pipelines"
          hint="Reapply or manage the ones you’ve saved."
        />
        <div className="pl-10">
          {pipelines.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No pipelines saved yet. Build one above to reuse it here.
            </p>
          ) : (
            <ul className="grid gap-2 lg:grid-cols-2">
              {pipelines.map((pipeline) => (
                <PipelineCard
                  key={pipeline.id}
                  pipeline={pipeline}
                  projectId={projectId}
                  onDeleted={loadPipelines}
                />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const PIPELINES_TAB: WorkspaceTab = {
  id: "pipelines",
  title: "Pipelines",
  type: "pipelines",
  closeable: true,
};
