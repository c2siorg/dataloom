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
 * @returns {Promise<Object>} Project details with columns and rows.
 */
export const getProjectDetails = async (projectId) => {
  const response = await client.get(`/projects/get/${projectId}`);
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
 * Export the current working copy of a project as a CSV or XLSX download.
 * @param {string} projectId - The project ID.
 * @param {"csv"|"xlsx"} format - Export format.
 * @returns {Promise<Blob>} The exported file as a Blob.
 */
export const exportProject = async (projectId, format = "csv") => {
  const response = await client.get(`/projects/${projectId}/export?format=${format}`, {
    responseType: "blob",
  });
  return response.data;
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
