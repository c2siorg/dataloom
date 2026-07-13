/**
 * API functions for project CRUD operations.
 * @module api/projects
 */
import client from "./client";

/**
 * Upload a new project CSV file.
 * @param {File} file - The CSV file to upload.
 * @param {string} projectName - Name for the new project.
 * @param {string} projectDescription - Description for the new project.
 * @returns {Promise<Object>} The created project response.
 */
export const uploadProject = async (file, projectName, projectDescription) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("projectName", projectName);
  formData.append("projectDescription", projectDescription);
  const response = await client.post("/projects/upload", formData);
  return response.data;
};

/**
 * Fetch full project details including rows and columns.
 * @param {string} projectId - The project ID.
 * @param {number} [page] - Current Page
 * @param {number} [pageSize] - Elements per page
 * @returns {Promise<{ project_id: string, filename: string, columns: string[], rows: Array<Array<*>>, dtypes: Object.<string, string>, total_rows: number, total_pages: number, page: number, page_size: number }>} Project details with columns and rows.
 */
export const getProjectDetails = async (projectId, page, pageSize) => {
  const response = await client.get(`/projects/get/${projectId}`, {
    params: { page, pageSize },
  });
  return response.data;
};

/**
 * Fetch the most recently modified projects.
 * @returns {Promise<Array>} List of recent project summaries.
 */
export const getRecentProjects = async () => {
  const response = await client.get("/projects/recent");
  return response.data;
};

/**
 * Save the current project state as a checkpoint.
 * @param {string} projectId - The project ID.
 * @param {string} commitMessage - Description of changes.
 * @returns {Promise<Object>} Updated project response.
 */
export const saveProject = async (projectId, commitMessage) => {
  const response = await client.post(
    `/projects/${projectId}/save?commit_message=${encodeURIComponent(commitMessage)}`,
  );
  return response.data;
};

/**
 * Revert project to a previous checkpoint.
 * @param {string} projectId - The project ID.
 * @param {string} checkpointId - The checkpoint ID to revert to.
 * @returns {Promise<Object>} Reverted project response.
 */
export const revertToCheckpoint = async (projectId, checkpointId) => {
  const response = await client.post(`/projects/${projectId}/revert?checkpoint_id=${checkpointId}`);
  return response.data;
};

/**
 * Export a project's working copy, optionally converting to another format.
 * @param {string} projectId - The project ID.
 * @param {string|Object} [options] - Target format extension or export options.
 * @param {string} [options.format] - Target format extension (e.g. "csv", "json").
 * @param {string} [options.delimiter] - CSV delimiter option: comma, tab, semicolon, or pipe.
 * @param {boolean} [options.includeHeader] - Whether to include the header row.
 * @param {string} [options.encoding] - Output encoding: utf-8, latin-1, ascii, or utf-16.
 * @returns {Promise<{blob: Blob, filename: string|null}>} The file blob and the
 *   server-provided download filename (parsed from Content-Disposition).
 */
export const exportProject = async (projectId, options) => {
  const exportOptions = typeof options === "string" ? { format: options } : options || {};
  const { format, delimiter, includeHeader, encoding } = exportOptions;
  const params = {
    ...(format ? { format } : {}),
    ...(delimiter ? { delimiter } : {}),
    ...(includeHeader !== undefined ? { include_header: includeHeader } : {}),
    ...(encoding ? { encoding } : {}),
  };

  try {
    const response = await client.get(`/projects/${projectId}/export`, {
      params: Object.keys(params).length > 0 ? params : undefined,
      responseType: "blob",
    });
    const disposition = response.headers["content-disposition"] || "";
    const match = disposition.match(/filename="?([^"]+)"?/);
    return { blob: response.data, filename: match ? match[1] : null };
  } catch (err) {
    // Under responseType:"blob" an error body arrives as a Blob, so the shared
    // interceptor can't read it. Surface the real backend detail (e.g. a 400
    // message) before re-throwing.
    const data = err?.response?.data;
    if (data instanceof Blob) {
      const detail = await data.text().catch(() => "");
      if (detail) console.error("Export failed:", err.response.status, detail);
    }
    throw err;
  }
};

/**
 * Delete a project and its associated files.
 * @param {string} projectId - The project ID.
 * @returns {Promise<Object>} Success confirmation.
 */
export const deleteProject = async (projectId) => {
  const response = await client.delete(`/projects/${projectId}`);
  return response.data;
};

/**
 * Rename a project.
 * @param {string} projectId - The project ID.
 * @param {string} name - The new project name.
 * @returns {Promise<Object>} Updated project response.
 */
export const renameProject = async (projectId, name) => {
  const response = await client.patch(`/projects/${projectId}/rename`, { name });
  return response.data;
};

/**
 * Search a project.
 * @param {string} query - The search query.
 * @returns {Promise<Object>} List of matched projects.
 */
export const searchProjects = async (query) => {
  const response = await client.get("/projects/search", { params: { q: query } });
  return response.data;
};

/**
 * Update project name and/or description.
 * @param {string} projectId
 * @param {{ name?: string, description?: string }} payload
 */
export const updateProject = async (projectId, { name, description } = {}) => {
  const response = await client.patch(`/projects/${projectId}`, {
    ...(name !== undefined ? { name } : {}),
    ...(description !== undefined ? { description } : {}),
  });
  return response.data;
};

/**
 * Fetch project metadata only — no row data.
 * @param {string} projectId - The project ID.
 * @returns {Promise<Object>} Project metadata.
 */
export const getProjectMeta = async (projectId) => {
  const response = await client.get(`/projects/${projectId}/meta`);
  return response.data;
};

/**
 * Fetch a list of projects with optional pagination.
 * @param {Object} options - Pagination options.
 * @param {number} options.limit - Number of projects to fetch.
 * @param {number} options.offset - Offset for pagination.
 * @returns {Promise<Object>} List of projects.
 */
export const getProjects = async ({ limit = 50, offset = 0 } = {}) => {
  const response = await client.get("/projects", {
    params: { limit, offset },
  });
  return response.data;
};
