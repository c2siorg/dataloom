import { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";
import { getProjectDetails } from "../api";

const ProjectContext = createContext(null);

/**
 * Hook to access project state and actions.
 * @returns {{ projectId: string, columns: string[], rows: Array[], dtypes: Object.<string, string>, loading: boolean, error: string|null, projectName: string, totalRows: number, totalPages: number, page: number, pageSize: number, isPreviewMode: boolean, previewSnapshot: object|null, pendingTransform: object|null, refreshProject: Function, updateData: Function, setProjectInfo: Function, setPaginationData: Function, setIsPreviewMode: Function, setPreviewSnapshot: Function, setPendingTransform: Function, enterPreviewMode: Function, cancelPreview: Function, confirmPreview: Function }}
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
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [previewSnapshot, setPreviewSnapshot] = useState(null);
  const [pendingTransform, setPendingTransform] = useState(null);

  const [totalRows, setTotalRows] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    try {
      const stored = localStorage.getItem("pageSize");
      return stored ? parseInt(stored, 10) : 50;
    } catch {
      return 50;
    }
  });

  // Initialize "columnOrders" from localStorage
  const [columnOrders, setColumnOrders] = useState(() => {
    try {
      const stored = localStorage.getItem("columnOrders");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

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

  useEffect(() => {
    try {
      localStorage.setItem("columnOrders", JSON.stringify(columnOrders));
    } catch {
      // localStorage unavailable — fail silently
    }
  }, [columnOrders]);

  useEffect(() => {
    try {
      localStorage.setItem("pageSize", String(pageSize));
    } catch {
      // localStorage unavailable — fail silently
    }
  }, [pageSize]);

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
      if (options.dtypes) setDtypes(options.dtypes);
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
    if (paginationInfo.total_rows !== undefined) {
      setTotalRows(paginationInfo.total_rows);
    }

    if (paginationInfo.total_pages !== undefined) {
      setTotalPages(paginationInfo.total_pages);
    }

    if (paginationInfo.page !== undefined) {
      setPage(paginationInfo.page);
    }

    if (paginationInfo.page_size !== undefined) {
      setPageSize(paginationInfo.page_size);
    }

    if (paginationInfo.pageSize !== undefined) {
      setPageSize(paginationInfo.pageSize);
    }
  }, []);

  const enterPreviewMode = useCallback(
    (previewColumns, previewRows, previewDtypes, transformInfo = null) => {
      // Save the current table state into the snapshot (only on first entry;
      // a second Apply click while already in preview mode refreshes the
      // preview data but keeps the original snapshot intact).
      if (!previewSnapshot) {
        setPreviewSnapshot({
          columns,
          rows,
          dtypes,
          totalRows,
          totalPages,
          page,
        });
      }

      // Update the table to show the preview data
      setColumns(previewColumns);
      setRows(previewRows);
      if (previewDtypes) setDtypes(previewDtypes);
      setPendingTransform(transformInfo);

      // Update pagination counters to reflect the preview result so the
      // pagination UI doesn't misleadingly show the original row/page count.
      const previewRowCount = previewRows.length;
      setTotalRows(previewRowCount);
      setTotalPages(1);
      setPage(1);

      // Activate preview mode
      setIsPreviewMode(true);
    },
    [columns, rows, dtypes, totalRows, totalPages, page, previewSnapshot],
  );

  const cancelPreview = useCallback(() => {
    if (!previewSnapshot) return;

    // Restore the table state from the snapshot
    setColumns(previewSnapshot.columns);
    setRows(previewSnapshot.rows);
    setDtypes(previewSnapshot.dtypes);
    setTotalRows(previewSnapshot.totalRows);
    setTotalPages(previewSnapshot.totalPages);
    setPage(previewSnapshot.page);

    // Clear the snapshot and exit preview mode
    setPreviewSnapshot(null);
    setPendingTransform(null);
    setIsPreviewMode(false);
  }, [previewSnapshot]);

  const confirmPreview = useCallback(() => {
    setPreviewSnapshot(null);
    setPendingTransform(null);
    setIsPreviewMode(false);
  }, []);

  const columnOrder = useMemo(() => {
    if (!projectId || !columnOrders[projectId]) return [];
    const stored = columnOrders[projectId];
    if (stored.length !== columns.length) return [];
    if (stored.some((idx) => idx >= columns.length || idx < 0)) return [];
    return stored;
  }, [projectId, columnOrders, columns]);

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

  const deleteProjectOrder = useCallback((projectId) => {
    setColumnOrders((prev) => {
      const updated = { ...prev };
      delete updated[projectId];
      return updated;
    });
  }, []);

  return (
    <ProjectContext.Provider
      value={{
        projectId,
        projectName,
        columns,
        rows,
        dtypes,
        columnOrder,
        deleteProjectOrder,
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
        isPreviewMode,
        previewSnapshot,
        pendingTransform,
        setIsPreviewMode,
        setPreviewSnapshot,
        setPendingTransform,
        enterPreviewMode,
        cancelPreview,
        confirmPreview,
        setColumnOrder,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}
