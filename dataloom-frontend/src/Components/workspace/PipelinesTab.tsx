import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { LuPlus, LuWorkflow } from "react-icons/lu";
import { getPipelines } from "../../api";
import type { Pipeline } from "../../api/pipelines";
import { usePanel } from "../../context/PanelContext";
import type { WorkspaceTab } from "../../context/WorkspaceTabsContext";
import { DraftSequence } from "../pipelines/DraftSequence";
import { EligibilityCheck } from "../pipelines/EligibilityCheck";
import { HistoryList } from "../pipelines/HistoryList";
import { PipelineCard } from "../pipelines/PipelineCard";
import { SaveBar } from "../pipelines/SaveBar";
import { Section } from "../pipelines/Section";
import { STEP_BUILDER_PANEL } from "../pipelines/PipelineStepBuilderPanel";

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

      <Section n={4} title="Saved pipelines" hint="Reapply or manage the ones you’ve saved.">
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
      </Section>
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
