import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { getProjectDetails } from "../api";

const ProjectContext = createContext(null);

/**
 * Hook to access project state and actions.
 * @returns {{ projectId: string, columns: string[], rows: Array[], loading: boolean, error: string|null, projectName: string, refreshProject: Function, updateData: Function, setProjectInfo: Function }}
 */
export function useProjectContext() {
  const context = useContext(ProjectContext);
  if (!context) throw new Error("useProjectContext must be used within ProjectProvider");
  return context;
}

/**
 * Provides project state and data-fetching actions to the component tree.
 */
export function ProjectProvider({ children }) {
  const [projectId, setProjectId] = useState(null);
  const [projectName, setProjectName] = useState("");
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [columnOrders, setColumnOrders] = useState({});

  const refreshProject = useCallback(async (id) => {
    const targetId = id || projectId;
    if (!targetId) return;
    setLoading(true);
    setError(null);
    // Clear previous project's table data immediately so that
    // components depending on columns/rows don't render with
    // stale data while the new project's details are loading.
    setColumns([]);
    setRows([]);
    try {
      const data = await getProjectDetails(targetId);
      setProjectId(data.project_id);
      setProjectName(data.filename);
      setColumns(data.columns);
      setRows(data.rows);
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const updateData = useCallback(
    (newColumns, newRows, options = {}) => {
      setColumns(newColumns);
      setRows(newRows);
      if (!projectId) return;

      setColumnOrders((prev) => {
        const existingOrder = prev[projectId];
        const shouldResetColumnOrder =
          typeof options.resetColumnOrder === "boolean"
            ? options.resetColumnOrder
            : !existingOrder || existingOrder.length !== newColumns.length;

        return {
          ...prev,
          [projectId]: shouldResetColumnOrder
            ? newColumns.map((_, index) => index)
            : existingOrder,
        };
      });
    },
    [projectId]
  );

  const setProjectInfo = useCallback((id, name) => {
    setProjectId(id);
    setProjectName(name || "");
  }, []);

  useEffect(() => {
    if (!projectId || columns.length === 0) return;
    const currentOrder = columnOrders[projectId];
    if (!currentOrder || currentOrder.length === 0) {
      setColumnOrders((prev) => ({
        ...prev,
        [projectId]: columns.map((_, index) => index),
      }));
    }
  }, [projectId, columns]);

  const columnOrder = projectId ? columnOrders[projectId] || [] : [];

  const setColumnOrder = useCallback(
    (order) => {
      if (!projectId) return;
      setColumnOrders((prev) => ({
        ...prev,
        [projectId]: order,
      }));
    },
    [projectId]
  );

  return (
    <ProjectContext.Provider
      value={{
        projectId,
        projectName,
        columns,
        rows,
        columnOrder,
        loading,
        error,
        refreshProject,
        updateData,
        setProjectInfo,
        setColumnOrder,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}
