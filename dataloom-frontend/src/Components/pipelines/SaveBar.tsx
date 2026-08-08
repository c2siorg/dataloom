import { useState, type FormEvent } from "react";
import { createPipeline } from "../../api";
import { toStepInputs, usePipelineDraft } from "../../context/PipelineDraftContext";
import { useToast } from "../../context/ToastContext";
import { getErrorMessage } from "../../utils/errorUtils";
import Button from "../common/Button";

/** Step 3 — name the draft and save it. */
export function SaveBar({
  projectId,
  onSaved,
}: {
  projectId: string;
  onSaved: () => void | Promise<void>;
}) {
  const { steps, clearDraft } = usePipelineDraft();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleSave = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createPipeline(projectId, name.trim(), toStepInputs(steps), description);
      showToast("Pipeline saved.", "success");
      clearDraft();
      setName("");
      setDescription("");
      await onSaved();
    } catch (err) {
      showToast(getErrorMessage(err, "Failed to save pipeline."), "error");
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
