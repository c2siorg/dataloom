import { useState, useCallback } from "react";
import { transformProject } from "../api";
import { useProjectContext } from "../context/ProjectContext";
import { useHistoryRefresh } from "../context/HistoryRefreshContext";

/**
 * Shared hook that encapsulates the Save-Changes logic used by every
 * preview-before-persist form (FilterForm, SampleRowsForm, etc.).
 *
 * Returns { saving, handleSave } — wire `handleSave` to the Save button and
 * use `saving` to disable UI while the request is in flight.
 */
const usePreviewSave = ({ clearError, handleError, onClose }) => {
  const { confirmPreview, refreshProject, pageSize, pendingTransform } = useProjectContext();
  const { refreshLogs } = useHistoryRefresh();
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!pendingTransform?.payload) return;
    setSaving(true);
    clearError();
    try {
      await transformProject(pendingTransform.projectId, pendingTransform.payload, {
        preview: false,
      });
      confirmPreview();
      await refreshProject(pendingTransform.projectId, 1, pageSize);
      // Persisting the transform adds a log entry.
      refreshLogs();
      onClose();
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  }, [
    pendingTransform,
    clearError,
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
