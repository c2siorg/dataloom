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
      console.error("Transform error:", err);

      let msg;
      if (err.response?.data?.detail) {
        // Backend returned a structured error response
        msg = err.response.data.detail;
      } else if (err.response?.status) {
        // HTTP error but no detail message
        msg = `Server error (${err.response.status}). Please try again.`;
      } else if (err.message?.includes("Network Error") || err.message?.includes("CORS")) {
        // CORS or network connectivity issues
        msg = "Unable to connect to server. Please check your connection and try again.";
      } else {
        // Generic fallback
        msg = "Something went wrong. Please try again.";
      }

      setError(msg);
      // Remove duplicate error toast - keep only ErrorAlert for consistency
    } finally {
      setLoading(false);
    }
  }, [projectId, onDataUpdate, showToast]);

  return { applyTransform, loading, error };
}
