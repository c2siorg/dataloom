import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { getProjectDetails, type TransformationInput } from "../api";

/** A single table cell value. `undefined` arises from sparse index access. */
export type CellValue = string | number | null | undefined;

/** Pagination metadata as the backend spells it, plus the camelCase alias. */
export interface PaginationInfo {
  page?: number;
  page_size?: number;
  total_rows?: number;
  total_pages?: number;
  pageSize?: number;
}

/** The table state captured on entering preview mode, restored on cancel. */
export interface PreviewSnapshot {
  columns: string[];
  rows: CellValue[][];
  dtypes: Record<string, string>;
  totalRows: number;
  totalPages: number;
  page: number;
  pageSize: number;
}

/** The transform awaiting confirmation while preview mode is active. */
export interface PendingTransform {
  projectId: string;
  payload: TransformationInput;
}

/** Options accepted by {@link ProjectContextValue.updateData}. */
export interface UpdateDataOptions {
  dtypes?: Record<string, string>;
  resetColumnOrder?: boolean;
}

/** Project state and actions shared across the workspace. */
export interface ProjectContextValue {
  projectId: string | null;
  projectName: string;
  columns: string[];
  rows: CellValue[][];
  dtypes: Record<string, string>;
  columnOrder: number[];
  deleteProjectOrder: (projectId: string) => void;
  loading: boolean;
  error: string | null;
  dataVersion: number;
  totalRows: number;
  totalPages: number;
  updatePageSizePreference: (newPageSize: number) => void;
  page: number;
  pageSize: number;
  refreshProject: (id?: string, targetPage?: number, preferredSize?: number) => Promise<void>;
  updateData: (columns: string[], rows: CellValue[][], options?: UpdateDataOptions) => void;
  setProjectInfo: (id: string | null, name?: string) => void;
  setPaginationData: (paginationInfo: PaginationInfo) => void;
  isPreviewMode: boolean;
  previewSnapshot: PreviewSnapshot | null;
  pendingTransform: PendingTransform | null;
  setIsPreviewMode: (isPreviewMode: boolean) => void;
  setPreviewSnapshot: (snapshot: PreviewSnapshot | null) => void;
  setPendingTransform: (transform: PendingTransform | null) => void;
  enterPreviewMode: (
    previewColumns: string[],
    previewRows: CellValue[][],
    previewDtypes?: Record<string, string>,
    transformInfo?: PendingTransform | null,
    paginationInfo?: PaginationInfo,
  ) => void;
  updatePreviewPage: (
    previewColumns: string[],
    previewRows: CellValue[][],
    previewDtypes?: Record<string, string>,
    paginationInfo?: PaginationInfo,
  ) => void;
  cancelPreview: () => void;
  confirmPreview: () => void;
  setColumnOrder: (order: number[]) => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

/**
 * Hook to access project state and actions.
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
export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<CellValue[][]>([]);
  const [dtypes, setDtypes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [previewSnapshot, setPreviewSnapshot] = useState<PreviewSnapshot | null>(null);
  const [pendingTransform, setPendingTransform] = useState<PendingTransform | null>(null);

  // Monotonic counter bumped on every content mutation (via updateData), used to
  // key derived caches (e.g. column profiles). Pagination does not touch it, so
  // paging never invalidates those caches.
  const [dataVersion, setDataVersion] = useState(0);

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
  const [columnOrders, setColumnOrders] = useState<Record<string, number[]>>(() => {
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

  const updatePageSizePreference = useCallback((newPageSize: number) => {
    setPageSize(newPageSize);
    try {
      localStorage.setItem("pageSize", String(newPageSize));
    } catch {
      // localStorage unavailable — fail silently
    }
  }, []);

  const refreshProject = useCallback(
    async (id?: string, targetPage?: number, preferredSize?: number) => {
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
        // The endpoint types rows as unknown[][] because the backend echoes raw
        // JSON; the table has always treated them as scalar cells.
        setRows(data.rows as CellValue[][]);
        setDtypes(data.dtypes || {});
        setTotalRows(data.total_rows);
        setTotalPages(data.total_pages);
        setPage(data.page);
        setPageSize(data.page_size);
      } catch (err) {
        const apiError = err as { response?: { data?: { detail?: string } }; message?: string };
        setError(apiError.response?.data?.detail || apiError.message || null);
      } finally {
        setLoading(false);
      }
    },
    [projectId, page, pageSize],
  );

  const updateData = useCallback(
    (newColumns: string[], newRows: CellValue[][], options: UpdateDataOptions = {}) => {
      setColumns(newColumns);
      setRows(newRows);
      setDataVersion((v) => v + 1);
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
          [projectId]: shouldResetColumnOrder
            ? newColumns.map((_, index) => index)
            : (existingOrder ?? []),
        };
      });
    },
    [projectId],
  );

  const setProjectInfo = useCallback((id: string | null, name?: string) => {
    setProjectId(id);
    setProjectName(name || "");
  }, []);

  const setPaginationData = useCallback((paginationInfo: PaginationInfo) => {
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
    (
      previewColumns: string[],
      previewRows: CellValue[][],
      previewDtypes?: Record<string, string>,
      transformInfo: PendingTransform | null = null,
      paginationInfo: PaginationInfo = {},
    ) => {
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
          pageSize,
        });
      }

      // Update the table to show the preview data.
      setColumns(previewColumns);
      setRows(previewRows);
      if (previewDtypes) setDtypes(previewDtypes);
      setPendingTransform(transformInfo);

      // Use pagination metadata returned for the transformed preview.
      setTotalRows(paginationInfo.total_rows ?? previewRows.length);
      setTotalPages(paginationInfo.total_pages ?? 1);
      setPage(paginationInfo.page ?? 1);
      setPageSize(paginationInfo.page_size ?? pageSize);

      // Activate preview mode.
      setIsPreviewMode(true);
    },
    [columns, rows, dtypes, totalRows, totalPages, page, pageSize, previewSnapshot],
  );

  const updatePreviewPage = useCallback(
    (
      previewColumns: string[],
      previewRows: CellValue[][],
      previewDtypes?: Record<string, string>,
      paginationInfo: PaginationInfo = {},
    ) => {
      setColumns(previewColumns);
      setRows(previewRows);

      if (previewDtypes) {
        setDtypes(previewDtypes);
      }

      setTotalRows(paginationInfo.total_rows ?? previewRows.length);
      setTotalPages(paginationInfo.total_pages ?? 1);
      setPage(paginationInfo.page ?? 1);
      setPageSize(paginationInfo.page_size ?? pageSize);
    },
    [pageSize],
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
    setPageSize(previewSnapshot.pageSize);

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
    (order: number[]) => {
      if (!projectId) return;
      setColumnOrders((prev) => ({
        ...prev,
        [projectId]: order,
      }));
    },
    [projectId],
  );

  const deleteProjectOrder = useCallback((projectId: string) => {
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
        dataVersion,
        totalRows,
        totalPages,
        updatePageSizePreference,
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
        updatePreviewPage,
        cancelPreview,
        confirmPreview,
        setColumnOrder,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}
