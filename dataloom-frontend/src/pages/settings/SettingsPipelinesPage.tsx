import { useCallback, useEffect, useRef, useState } from "react";
import { LuWorkflow } from "react-icons/lu";
import { deletePipeline, getPipelines } from "../../api/pipelines";
import type { Pipeline } from "../../api/pipelines";
import ConfirmDialog from "../../Components/common/ConfirmDialog";
import LoadingSpinner from "../../Components/common/LoadingSpinner";
import SavedPipelineItem from "../../Components/pipelines/SavedPipelineItem";
import { useToast } from "../../context/ToastContext";
import { getErrorMessage } from "../../utils/errorUtils";
import Button from "../../Components/common/Button";

export default function SettingsPipelinesPage() {
  const { showToast } = useToast();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pipelineToDelete, setPipelineToDelete] = useState<Pipeline | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);

  const loadPipelines = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setPipelines(await getPipelines());
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPipelines();
  }, [loadPipelines]);

  const handleDelete = async () => {
    if (!pipelineToDelete || deletingRef.current) return;
    const pipeline = pipelineToDelete;
    deletingRef.current = true;
    setDeleting(true);

    try {
      await deletePipeline(pipeline.id);
      setPipelineToDelete(null);
      showToast(`Pipeline "${pipeline.name}" deleted.`, "success");
      await loadPipelines();
    } catch (error) {
      showToast(getErrorMessage(error, "Failed to delete pipeline."), "error");
      setPipelineToDelete(null);
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Saved Pipelines</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View and manage reusable transformation pipelines saved to your account.
        </p>
      </header>

      {loading ? (
        <LoadingSpinner message="Loading saved pipelines…" />
      ) : loadError ? (
        <section className="rounded-2xl border border-app-border bg-surface p-6 text-center shadow-sm">
          <p className="text-sm text-danger">Could not load saved pipelines. Please try again.</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void loadPipelines()}
            className="mt-4"
          >
            Try again
          </Button>
        </section>
      ) : pipelines.length === 0 ? (
        <section className="rounded-2xl border border-app-border bg-surface px-6 py-12 text-center shadow-sm">
          <LuWorkflow className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 text-base font-semibold text-foreground">No saved pipelines yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Build and save a pipeline from a project’s Pipelines tab to see it here.
          </p>
        </section>
      ) : (
        <ul className="space-y-3">
          {pipelines.map((pipeline) => (
            <SavedPipelineItem
              key={pipeline.id}
              pipeline={pipeline}
              onDelete={setPipelineToDelete}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        isOpen={pipelineToDelete !== null}
        message={`Permanently delete "${pipelineToDelete?.name ?? "this pipeline"}" and its saved steps? This cannot be undone.`}
        onConfirm={() => void handleDelete()}
        onCancel={() => {
          if (!deletingRef.current) setPipelineToDelete(null);
        }}
        confirmDisabled={deleting}
        confirmLabel={deleting ? "Deleting…" : "Confirm"}
      />
    </div>
  );
}
