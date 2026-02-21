/**
 * Hook to fetch and manage project data by ID.
 * @module hooks/useProject
 */
import { useState, useEffect, useCallback } from "react";
import { getProjectDetails } from "../api";

/**
 * Fetch project data by ID.
 * @param {number|string} projectId - The project ID.
 * @returns {{ columns: string[], rows: Array[], loading: boolean, error: string|null, refresh: Function }}
 */
export function useProject(projectId) {
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getProjectDetails(projectId);
      setColumns(data.columns);
      setRows(data.rows);
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { columns, rows, loading, error, refresh };
}
