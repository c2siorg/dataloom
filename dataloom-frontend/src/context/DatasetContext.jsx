import { createContext, useContext, useState, useCallback } from "react";
import { getDatasetDetails } from "../api";

const DatasetContext = createContext(null);

/**
 * Hook to access dataset state and actions.
 * @returns {{ datasetId: number, columns: string[], rows: Array[], loading: boolean, error: string|null, datasetName: string, refreshDataset: Function, updateData: Function, setDatasetInfo: Function }}
 */
export function useDatasetContext() {
  const context = useContext(DatasetContext);
  if (!context) throw new Error("useDatasetContext must be used within DatasetProvider");
  return context;
}

/**
 * Provides dataset state and data-fetching actions to the component tree.
 */
export function DatasetProvider({ children }) {
  const [datasetId, setDatasetId] = useState(null);
  const [datasetName, setDatasetName] = useState("");
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refreshDataset = useCallback(async (id) => {
    const targetId = id || datasetId;
    if (!targetId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getDatasetDetails(targetId);
      setDatasetId(data.dataset_id);
      setDatasetName(data.filename);
      setColumns(data.columns);
      setRows(data.rows);
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  }, [datasetId]);

  const updateData = useCallback((newColumns, newRows) => {
    setColumns(newColumns);
    setRows(newRows);
  }, []);

  const setDatasetInfo = useCallback((id, name) => {
    setDatasetId(id);
    setDatasetName(name || "");
  }, []);

  return (
    <DatasetContext.Provider value={{
      datasetId, datasetName, columns, rows, loading, error,
      refreshDataset, updateData, setDatasetInfo,
    }}>
      {children}
    </DatasetContext.Provider>
  );
}
