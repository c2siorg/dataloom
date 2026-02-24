/**
 * Hook providing dataset transformation operations with toast feedback.
 * @module hooks/useTransform
 */
import { useState, useCallback } from "react";
import { transformDataset } from "../api";
import { useToast } from "../context/ToastContext";

/**
 * Provides transformation operations for a dataset.
 * @param {number} datasetId - The dataset ID.
 * @param {Function} onDataUpdate - Callback with (columns, rows) after a successful transform.
 * @returns {{ applyTransform: Function, loading: boolean, error: string|null }}
 */
export function useTransform(datasetId, onDataUpdate) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { showToast } = useToast();

  const applyTransform = useCallback(
    async (transformInput) => {
      if (!datasetId) return;
      setLoading(true);
      setError(null);
      try {
        const result = await transformDataset(datasetId, transformInput);
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
    },
    [datasetId, onDataUpdate, showToast],
  );

  return { applyTransform, loading, error };
}
