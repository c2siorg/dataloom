import { useState, useCallback } from "react";
import { transformProject } from "../api";
import { useProjectContext } from "../context/ProjectContext";
import { useHistoryRefresh } from "../context/HistoryRefreshContext";
import { isStaleRevisionConflict, STALE_PREVIEW_MESSAGE } from "../utils/errorUtils";

interface PreviewSaveOptions {
  clearError: () => void;
  handleError: (err: unknown) => void;
  onClose: () => void;
}

/**
 * Shared hook that encapsulates the Save-Changes logic used by every
 * preview-before-persist form (FilterForm, SampleRowsForm, etc.).
 *
 * Returns { saving, handleSave } — wire `handleSave` to the Save button and
 * use `saving` to disable UI while the request is in flight.
 */
const usePreviewSave = ({ clearError, handleError, onClose }: PreviewSaveOptions) => {
  const { confirmPreview, cancelPreview, refreshProject, pageSize, pendingTransform } =
    useProjectContext();
  const { refreshLogs } = useHistoryRefresh();
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!pendingTransform?.payload) return;
    if (pendingTransform.revision === undefined) {
      cancelPreview();
      handleError(
        new Error("This preview is missing its dataset revision. Apply the transformation again."),
      );
      return;
    }
    setSaving(true);
    clearError();
    try {
      await transformProject(pendingTransform.projectId, pendingTransform.payload, {
        preview: false,
        expectedRevision: pendingTransform.revision,
      });
      confirmPreview();
      await refreshProject(pendingTransform.projectId, 1, pageSize);
      // Persisting the transform adds a log entry.
      refreshLogs();
      onClose();
    } catch (err) {
      if (isStaleRevisionConflict(err)) {
        cancelPreview();
        handleError(new Error(STALE_PREVIEW_MESSAGE));
      } else {
        handleError(err);
      }
    } finally {
      setSaving(false);
    }
  }, [
    pendingTransform,
    clearError,
    cancelPreview,
    confirmPreview,
    refreshProject,
    pageSize,
    onClose,
    handleError,
    refreshLogs,
  ]);

  return { saving, handleSave };
};

export default usePreviewSave;
