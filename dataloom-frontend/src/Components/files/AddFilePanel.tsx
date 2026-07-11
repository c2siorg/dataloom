import { useCallback, useEffect, useRef, useState } from "react";
import { LuFilePlus, LuRotateCcw } from "react-icons/lu";
import {
  addFileToProject,
  getProjectFiles,
  previewAddFile,
  reappendProjectFile,
  type AppendPreview,
  type ProjectFileEntry,
} from "../../api/projectFiles";
import { useHistoryRefresh } from "../../context/HistoryRefreshContext";
import { useProjectContext } from "../../context/ProjectContext";
import { useToast } from "../../context/ToastContext";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";
import { ACCEPTED_EXTENSIONS } from "../../utils/fileUtils";
import Button from "../common/Button";

const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.join(",");

const errorDetail = (err: unknown, fallback: string): string =>
  (err as { response?: { data?: { detail?: string } } }).response?.data?.detail || fallback;

/**
 * Docked panel for appending more files to the current project.
 *
 * Preview-then-confirm: picking a file fetches a column-alignment report
 * (matched / new / missing columns, dtype clashes) and nothing changes until
 * the user confirms the append. Below the form, the project's file inventory
 * lists every previously added file — appends removed by revert/undo can be
 * re-applied from there, so an added file is never lost.
 */
const AddFilePanel = ({ projectId, onClose }: { projectId: string; onClose: () => void }) => {
  const { refreshProject, pageSize } = useProjectContext();
  const { refreshLogs } = useHistoryRefresh();
  const { showToast } = useToast();
  const { error, clearError, handleError } = useError();

  const [preview, setPreview] = useState<AppendPreview | null>(null);
  const [duplicateName, setDuplicateName] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [inventory, setInventory] = useState<ProjectFileEntry[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // The selected File is only read inside handlers (never rendered — the
  // native input shows its own filename), so a ref avoids a re-render.
  const fileRef = useRef<File | null>(null);

  const loadInventory = useCallback(async () => {
    try {
      setInventory(await getProjectFiles(projectId));
    } catch {
      // Inventory is auxiliary; the append form works without it.
      setInventory([]);
    }
  }, [projectId]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  const resetSelection = () => {
    fileRef.current = null;
    setPreview(null);
    setDuplicateName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = async (selected: File | null) => {
    clearError();
    setPreview(null);
    fileRef.current = selected;
    if (!selected) {
      setDuplicateName(null);
      return;
    }

    setDuplicateName(
      inventory.some((entry) => entry.original_filename === selected.name) ? selected.name : null,
    );

    setPreviewing(true);
    try {
      setPreview(await previewAddFile(projectId, selected));
    } catch (err) {
      handleError(err);
      resetSelection();
      showToast(errorDetail(err, "Could not analyze the selected file."), "error");
    } finally {
      setPreviewing(false);
    }
  };

  const afterAppend = async (message: string) => {
    await refreshProject(projectId, 1, pageSize);
    refreshLogs();
    await loadInventory();
    showToast(message, "success");
  };

  const handleAppend = async () => {
    const file = fileRef.current;
    if (!file || !preview) return;
    clearError();
    setSubmitting(true);
    try {
      await addFileToProject(projectId, file);
      const newColsNote =
        preview.new_columns.length > 0 ? `, added ${preview.new_columns.length} new column(s)` : "";
      resetSelection();
      await afterAppend(`Appended ${preview.incoming_row_count} row(s)${newColsNote}.`);
    } catch (err) {
      handleError(err);
      showToast(errorDetail(err, "Failed to append the file."), "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReappend = async (entry: ProjectFileEntry) => {
    clearError();
    setSubmitting(true);
    try {
      await reappendProjectFile(projectId, entry.id);
      await afterAppend(`Re-appended "${entry.original_filename}".`);
    } catch (err) {
      handleError(err);
      showToast(errorDetail(err, "Failed to re-append the file."), "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="mb-4">
        <label htmlFor="add-file-input" className="block text-sm font-medium text-foreground mb-1">
          File:
        </label>
        <input
          ref={fileInputRef}
          type="file"
          id="add-file-input"
          data-testid="add-file-input"
          accept={ACCEPT_ATTR}
          disabled={previewing || submitting}
          onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Rows are appended below the current data. Matching columns line up; new columns are added
          with empty cells.
        </p>
      </div>

      {previewing && <p className="text-sm text-muted-foreground mb-4">Analyzing file…</p>}

      {preview && (
        <div className="mb-4 rounded-md border border-app-border bg-elevated p-3 text-sm">
          <p className="font-medium text-foreground mb-2">
            {preview.incoming_row_count} row(s) will be appended to {preview.current_row_count}.
          </p>
          <ul className="space-y-1">
            <li className="text-green-700">
              ✓ {preview.matched_columns.length} matching column(s)
            </li>
            {preview.new_columns.length > 0 && (
              <li className="text-blue-700">
                + New column(s): {preview.new_columns.join(", ")}
                <span className="text-muted-foreground"> (empty for existing rows)</span>
              </li>
            )}
            {preview.missing_columns.length > 0 && (
              <li className="text-danger">
                ⚠ Not in this file: {preview.missing_columns.join(", ")}
                <span className="text-muted-foreground"> (empty for new rows)</span>
              </li>
            )}
            {preview.dtype_clashes.map((clash) => (
              <li key={clash.column} className="text-danger">
                ⚠ &quot;{clash.column}&quot; type differs: {clash.existing_dtype} vs{" "}
                {clash.incoming_dtype}
              </li>
            ))}
            {duplicateName && (
              <li className="text-danger">
                ⚠ &quot;{duplicateName}&quot; was already added to this project — appending again
                will duplicate its rows.
              </li>
            )}
          </ul>
        </div>
      )}

      <FormErrorAlert message={error} />

      <div className="flex justify-between mt-2">
        <button
          type="button"
          onClick={handleAppend}
          disabled={!preview || submitting || previewing}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md font-medium transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="inline-flex items-center gap-2">
            <LuFilePlus />
            {preview ? `Append ${preview.incoming_row_count} row(s)` : "Append"}
          </span>
        </button>
        <Button variant="secondary" type="button" onClick={onClose}>
          Close
        </Button>
      </div>

      {inventory.length > 0 && (
        <div className="mt-6 border-t border-app-border pt-4">
          <h3 className="text-sm font-medium text-foreground mb-2">Files added to this project</h3>
          <ul className="space-y-2">
            {inventory.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between rounded-md border border-app-border px-3 py-2 text-sm"
              >
                <span className="truncate text-foreground" title={entry.original_filename}>
                  {entry.original_filename}
                </span>
                <button
                  type="button"
                  onClick={() => handleReappend(entry)}
                  disabled={submitting}
                  title="Append this file's rows again (e.g. after a revert)"
                  className="ml-2 inline-flex shrink-0 items-center gap-1 text-blue-600 hover:text-blue-800 disabled:opacity-50"
                >
                  <LuRotateCcw /> Re-append
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground mt-2">
            Added files are kept even if their rows are removed by undo or revert.
          </p>
        </div>
      )}
    </div>
  );
};

export default AddFilePanel;
