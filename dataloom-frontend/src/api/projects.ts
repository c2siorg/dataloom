/**
 * API functions for project CRUD operations.
 * @module api/projects
 */
import client from "./client";
import type { Pagination, ProjectSummary, TableResponse } from "./types";

/** Backend `ProjectResponse` — full project payload with paginated rows. */
export interface ProjectDetails extends TableResponse, Pagination {
  filename: string;
  file_path: string;
  project_id: string;
}

/** Export options accepted by {@link exportProject}. */
export interface ExportOptions {
  /** Target format extension (e.g. "csv", "json"). */
  format?: string;
  /** CSV delimiter option: comma, tab, semicolon, or pipe. */
  delimiter?: string;
  /** Whether to include the header row. */
  includeHeader?: boolean;
  /** Output encoding: utf-8, latin-1, ascii, or utf-16. */
  encoding?: string;
}

/** The downloaded file plus the server-provided filename. */
export interface ExportResult {
  blob: Blob;
  filename: string | null;
}

/**
 * Upload a new project CSV file.
 * @param file - The CSV file to upload.
 * @param projectName - Name for the new project.
 * @param projectDescription - Description for the new project.
 * @returns The created project response.
 */
export const uploadProject = async (
  file: File,
  projectName: string,
  projectDescription: string,
): Promise<ProjectDetails> => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("projectName", projectName);
  formData.append("projectDescription", projectDescription);
  const response = await client.post("/projects/upload", formData);
  return response.data;
};

/**
 * Fetch full project details including rows and columns.
 * @param projectId - The project ID.
 * @param page - Current page.
 * @param pageSize - Elements per page.
 * @returns Project details with columns and rows.
 */
export const getProjectDetails = async (
  projectId: string,
  page?: number,
  pageSize?: number,
): Promise<ProjectDetails> => {
  const response = await client.get(`/projects/get/${projectId}`, {
    params: { page, pageSize },
  });
  return response.data;
};

/**
 * Fetch the most recently modified projects.
 * @returns List of recent project summaries.
 */
export const getRecentProjects = async (): Promise<ProjectSummary[]> => {
  const response = await client.get("/projects/recent");
  return response.data;
};

/**
 * Save the current project state as a checkpoint.
 * @param projectId - The project ID.
 * @param commitMessage - Description of changes.
 * @returns Updated project response.
 */
export const saveProject = async (projectId: string, commitMessage: string) => {
  const response = await client.post(
    `/projects/${projectId}/save?commit_message=${encodeURIComponent(commitMessage)}`,
  );
  return response.data;
};

/**
 * Revert project to a previous checkpoint.
 * @param projectId - The project ID.
 * @param checkpointId - The checkpoint ID to revert to.
 * @returns Reverted project response.
 */
export const revertToCheckpoint = async (projectId: string, checkpointId: string) => {
  const response = await client.post(`/projects/${projectId}/revert?checkpoint_id=${checkpointId}`);
  return response.data;
};

/**
 * Export a project's working copy, optionally converting to another format.
 * @param projectId - The project ID.
 * @param options - Target format extension or export options.
 * @returns The file blob and the server-provided download filename (parsed
 *   from Content-Disposition).
 */
export const exportProject = async (
  projectId: string,
  options?: string | ExportOptions,
): Promise<ExportResult> => {
  const exportOptions: ExportOptions =
    typeof options === "string" ? { format: options } : options || {};
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
    const disposition: string = response.headers["content-disposition"] || "";
    const match = disposition.match(/filename="?([^"]+)"?/);
    return { blob: response.data, filename: match?.[1] ?? null };
  } catch (err) {
    // Under responseType:"blob" an error body arrives as a Blob, so the shared
    // interceptor can't read it. Surface the real backend detail (e.g. a 400
    // message) before re-throwing.
    const response = (err as { response?: { status?: number; data?: unknown } } | null)?.response;
    const data = response?.data;
    if (data instanceof Blob) {
      const detail = await data.text().catch(() => "");
      if (detail) console.error("Export failed:", response?.status, detail);
    }
    throw err;
  }
};

/**
 * Delete a project and its associated files.
 * @param projectId - The project ID.
 * @returns Success confirmation.
 */
export const deleteProject = async (projectId: string) => {
  const response = await client.delete(`/projects/${projectId}`);
  return response.data;
};

/**
 * Rename a project.
 * @param projectId - The project ID.
 * @param name - The new project name.
 * @returns Updated project response.
 */
export const renameProject = async (projectId: string, name: string) => {
  const response = await client.patch(`/projects/${projectId}/rename`, { name });
  return response.data;
};

/**
 * Search a project.
 * @param query - The search query.
 * @returns List of matched projects.
 */
export const searchProjects = async (query: string): Promise<ProjectSummary[]> => {
  const response = await client.get("/projects/search", { params: { q: query } });
  return response.data;
};

/**
 * Update project name and/or description.
 */
export const updateProject = async (
  projectId: string,
  { name, description }: { name?: string; description?: string } = {},
) => {
  const response = await client.patch(`/projects/${projectId}`, {
    ...(name !== undefined ? { name } : {}),
    ...(description !== undefined ? { description } : {}),
  });
  return response.data;
};

/**
 * Fetch project metadata only — no row data.
 * @param projectId - The project ID.
 * @returns Project metadata.
 */
export const getProjectMeta = async (projectId: string): Promise<ProjectSummary> => {
  const response = await client.get(`/projects/${projectId}/meta`);
  return response.data;
};

/**
 * Fetch a list of projects with optional pagination.
 * @param options - Pagination options.
 * @returns List of projects.
 */
export const getProjects = async ({
  limit = 50,
  offset = 0,
}: { limit?: number; offset?: number } = {}): Promise<ProjectSummary[]> => {
  const response = await client.get("/projects", {
    params: { limit, offset },
  });
  return response.data;
};
