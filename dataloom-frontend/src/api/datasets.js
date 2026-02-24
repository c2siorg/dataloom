/**
 * API functions for dataset CRUD operations.
 * @module api/datasets
 */
import client from "./client";

/**
 * Upload a new dataset CSV file.
 * @param {File} file - The CSV file to upload.
 * @param {string} projectName - Name for the new project.
 * @param {string} projectDescription - Description for the new project.
 * @returns {Promise<Object>} The created dataset response.
 */
export const uploadDataset = async (file, projectName, projectDescription) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("projectName", projectName);
  formData.append("projectDescription", projectDescription);
  const response = await client.post("/datasets/upload", formData);
  return response.data;
};

/**
 * Fetch full dataset details including rows and columns.
 * @param {number} datasetId - The dataset ID.
 * @returns {Promise<Object>} Dataset details with columns and rows.
 */
export const getDatasetDetails = async (datasetId) => {
  const response = await client.get(`/datasets/get/${datasetId}`);
  return response.data;
};

/**
 * Fetch the most recently modified projects.
 * @returns {Promise<Array>} List of recent project summaries.
 */
export const getRecentProjects = async () => {
  const response = await client.get("/datasets/recent");
  return response.data;
};

/**
 * Save the current dataset state as a checkpoint.
 * @param {number} datasetId - The dataset ID.
 * @param {string} commitMessage - Description of changes.
 * @returns {Promise<Object>} Updated dataset response.
 */
export const saveDataset = async (datasetId, commitMessage) => {
  const response = await client.post(
    `/datasets/${datasetId}/save?commit_message=${encodeURIComponent(commitMessage)}`,
  );
  return response.data;
};

/**
 * Revert dataset to a previous checkpoint.
 * @param {number} datasetId - The dataset ID.
 * @param {number} checkpointId - The checkpoint ID to revert to.
 * @returns {Promise<Object>} Reverted dataset response.
 */
export const revertToCheckpoint = async (datasetId, checkpointId) => {
  const response = await client.post(`/datasets/${datasetId}/revert?checkpoint_id=${checkpointId}`);
  return response.data;
};
