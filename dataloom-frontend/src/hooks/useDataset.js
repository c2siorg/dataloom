/**
 * Hook to fetch and manage dataset data by ID.
 * @module hooks/useDataset
 */
import { useState, useEffect, useCallback } from "react";
import { getDatasetDetails } from "../api";

/**
 * Fetch dataset data by ID.
 * @param {number|string} datasetId - The dataset ID.
 * @returns {{ columns: string[], rows: Array[], loading: boolean, error: string|null, refresh: Function }}
 */
export function useDataset(datasetId) {
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!datasetId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getDatasetDetails(datasetId);
      setColumns(data.columns);
      setRows(data.rows);
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  }, [datasetId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { columns, rows, loading, error, refresh };
}
