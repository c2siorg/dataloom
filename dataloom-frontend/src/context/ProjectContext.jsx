/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback } from "react";
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

  const refreshProject = useCallback(async (id) => {
    const targetId = id || projectId;
    if (!targetId) return;
    setLoading(true);
    setError(null);
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

  const updateData = useCallback((newColumns, newRows) => {
    setColumns(newColumns);
    setRows(newRows);
  }, []);

  const setProjectInfo = useCallback((id, name) => {
    setProjectId(id);
    setProjectName(name || "");
  }, []);

  return (
    <ProjectContext.Provider value={{
      projectId, projectName, columns, rows, loading, error,
      refreshProject, updateData, setProjectInfo,
    }}>
      {children}
    </ProjectContext.Provider>
  );
}
