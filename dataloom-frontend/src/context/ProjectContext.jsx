import { createContext, useState, useCallback, useRef, useEffect } from "react";
import { getProjectDetails, DEFAULT_PAGE_SIZE } from "../api";

export const ProjectContext = createContext(null);

/**
 * Provides project state and data-fetching actions to the component tree.
 * Includes pagination state management for server-side pagination.
 */
export function ProjectProvider({ children }) {
  const [projectId, setProjectId] = useState(null);
  const [projectName, setProjectName] = useState("");
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalRows, setTotalRows] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Use refs to track current values for callbacks without causing re-creation
  const pageRef = useRef(page);
  const pageSizeRef = useRef(pageSize);
  const projectIdRef = useRef(projectId);

  // Keep refs in sync with state
  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => { pageSizeRef.current = pageSize; }, [pageSize]);
  useEffect(() => { projectIdRef.current = projectId; }, [projectId]);

  const refreshProject = useCallback(
    async (id, targetPage = null, targetPageSize = null) => {
      const targetId = id || projectIdRef.current;
      if (!targetId) return;

      // Use provided values or current state from refs
      const currentPage = targetPage ?? pageRef.current;
      const currentPageSize = targetPageSize ?? pageSizeRef.current;

      setLoading(true);
      setError(null);
      try {
        const data = await getProjectDetails(targetId, currentPage, currentPageSize);
        setProjectId(data.project_id);
        setProjectName(data.filename);
        setColumns(data.columns);
        setRows(data.rows);
        // Update pagination state from response
        setPage(data.page);
        setPageSize(data.page_size);
        setTotalRows(data.total_rows);
        setTotalPages(data.total_pages);
      } catch (err) {
        setError(err.response?.data?.detail || err.message);
      } finally {
        setLoading(false);
      }
    },
    [], // No dependencies - uses refs for current values
  );

  // Refs for totalPages to avoid dependencies
  const totalPagesRef = useRef(totalPages);
  useEffect(() => { totalPagesRef.current = totalPages; }, [totalPages]);

  /**
   * Navigate to a specific page.
   * @param {number} newPage - The page number to navigate to.
   */
  const goToPage = useCallback(
    async (newPage) => {
      if (!projectIdRef.current) return;
      if (newPage < 1 || newPage > totalPagesRef.current) return;
      setLoading(true);
      try {
        const data = await getProjectDetails(projectIdRef.current, newPage, pageSizeRef.current);
        setProjectId(data.project_id);
        setProjectName(data.filename);
        setColumns(data.columns);
        setRows(data.rows);
        // Update pagination state from response
        setPage(data.page);
        setPageSize(data.page_size);
        setTotalRows(data.total_rows);
        setTotalPages(data.total_pages);
      } catch (err) {
        setError(err.response?.data?.detail || err.message);
      } finally {
        setLoading(false);
      }
    },
    [], // No dependencies - uses refs for current values
  );

  /**
   * Navigate to the previous page.
   */
  const goToPreviousPage = useCallback(() => {
    if (pageRef.current > 1) {
      goToPage(pageRef.current - 1);
    }
  }, [goToPage]);

  /**
   * Navigate to the next page.
   */
  const goToNextPage = useCallback(() => {
    if (pageRef.current < totalPagesRef.current) {
      goToPage(pageRef.current + 1);
    }
  }, [goToPage]);

  /**
   * Reset pagination to page 1.
   * Call this after transformations that modify data structure.
   */
  const resetPage = useCallback(() => {
    setPage(1);
  }, []);

  const updateData = useCallback((newColumns, newRows, paginationData = null) => {
    setColumns(newColumns);
    setRows(newRows);
    if (paginationData) {
      setPage(paginationData.page);
      setTotalPages(paginationData.total_pages);
      setTotalRows(paginationData.total_rows);
    }
  }, []);

  const setProjectInfo = useCallback((id, name) => {
    setProjectId(id);
    setProjectName(name || "");
    // Reset pagination when switching projects
    setPage(1);
    setTotalPages(0);
    setTotalRows(0);
  }, []);

  return (
    <ProjectContext.Provider
      value={{
        projectId,
        projectName,
        columns,
        rows,
        loading,
        error,
        // Pagination state
        page,
        pageSize,
        totalRows,
        totalPages,
        // Pagination actions
        goToPage,
        goToPreviousPage,
        goToNextPage,
        resetPage,
        // Data actions
        refreshProject,
        updateData,
        setProjectInfo,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}
