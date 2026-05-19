import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { getProjectDetails } from "../api";

const ProjectContext = createContext(null);

/**
 * Hook to access project state and actions.
 * @returns {{ projectId: string, columns: string[], rows: Array[], loading: boolean, error: string|null, projectName: string, totalRows: number, totalPages: number, page: number, pageSize: number, refreshProject: Function, updateData: Function, setProjectInfo: Function, setPaginationData: Function }}
 */
// eslint-disable-next-line react-refresh/only-export-components
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
  const [dtypes, setDtypes] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [totalRows, setTotalRows] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [columnOrders, setColumnOrders] = useState({});

  useEffect(() => {
    if (!projectId || columns.length === 0) return;
    const currentOrder = columnOrders[projectId];
    if (!currentOrder || currentOrder.length === 0) {
      setColumnOrders((prev) => ({
        ...prev,
        [projectId]: columns.map((_, index) => index),
      }));
    }
  }, [projectId, columns, columnOrders]);

  const refreshProject = useCallback(
    async (id, targetPage, preferredSize) => {
      const targetId = id || projectId;
      const fetchPage = targetPage || page;
      const targetSize = preferredSize || pageSize;
      if (!targetId) return;
      setLoading(true);
      setError(null);
      try {
        const data = await getProjectDetails(targetId, fetchPage, targetSize);
        setProjectId(data.project_id);
        setProjectName(data.filename);
        setColumns(data.columns);
        setRows(data.rows);
        setDtypes(data.dtypes || {});
        setTotalRows(data.total_rows);
        setTotalPages(data.total_pages);
        setPage(data.page);
        setPageSize(data.page_size);
      } catch (err) {
        setError(err.response?.data?.detail || err.message);
      } finally {
        setLoading(false);
      }
    },
    [projectId, page, pageSize],
  );

  const updateData = useCallback(
    (newColumns, newRows, options = {}) => {
      setColumns(newColumns);
      setRows(newRows);
      if (options && options.dtypes) setDtypes(options.dtypes);
      if (!projectId) return;
      setColumnOrders((prev) => {
        const existingOrder = prev[projectId];
        const shouldResetColumnOrder =
          typeof options.resetColumnOrder === "boolean"
            ? options.resetColumnOrder
            : !existingOrder || existingOrder.length !== newColumns.length;
        return {
          ...prev,
          [projectId]: shouldResetColumnOrder ? newColumns.map((_, index) => index) : existingOrder,
        };
      });
    },
    [projectId],
  );

  const setProjectInfo = useCallback((id, name) => {
    setProjectId(id);
    setProjectName(name || "");
  }, []);

  const setPaginationData = useCallback((paginationInfo) => {
    setTotalRows(paginationInfo.total_rows);
    setTotalPages(paginationInfo.total_pages);
    setPage(paginationInfo.page);
    setPageSize(paginationInfo.page_size);
  }, []);

  const columnOrder = projectId ? columnOrders[projectId] || [] : [];

  const setColumnOrder = useCallback(
    (order) => {
      if (!projectId) return;
      setColumnOrders((prev) => ({
        ...prev,
        [projectId]: order,
      }));
    },
    [projectId],
  );

  return (
    <ProjectContext.Provider
      value={{
        projectId,
        projectName,
        columns,
        rows,
        dtypes,
        columnOrder,
        loading,
        error,
        totalRows,
        totalPages,
        page,
        pageSize,
        refreshProject,
        updateData,
        setProjectInfo,
        setPaginationData,
        setColumnOrder,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}
