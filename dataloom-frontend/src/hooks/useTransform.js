/**
 * Hook providing project transformation operations with toast feedback.
 * @module hooks/useTransform
 */
import { useState, useCallback } from "react";
import { transformProject } from "../api";
import { useToast } from "../context/ToastContext";

/**
 * Provides transformation operations for a project.
 * @param {number} projectId - The project ID.
 * @param {Function} onDataUpdate - Callback with (columns, rows) after a successful transform.
 * @returns {{ applyTransform: Function, loading: boolean, error: string|null }}
 */
export function useTransform(projectId, onDataUpdate) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { showToast } = useToast();

  const applyTransform = useCallback(async (transformInput) => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await transformProject(projectId, transformInput);
      if (onDataUpdate) {
        onDataUpdate(result.columns, result.rows);
      }
      showToast("Transformation applied", "success");
      return result;
    } catch (err) {
      const msg = err.response?.data?.detail || err.message;
      setError(msg);
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, onDataUpdate, showToast]);

  return { applyTransform, loading, error };
}
