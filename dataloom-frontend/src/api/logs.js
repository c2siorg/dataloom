/**
 * API functions for activity logs and checkpoints.
 * @module api/logs
 */
import client from "./client";

/**
 * Fetch transformation logs for a project.
 * @param {string} projectId - The project ID.
 * @returns {Promise<Array>} List of log entries.
 */
export const getLogs = async (projectId) => {
  const response = await client.get(`/logs/${projectId}`);
  return response.data;
};

/**
 * Fetch all checkpoints for a project.
 * @param {string} projectId - The project ID.
 * @returns {Promise<Array>} List of checkpoints ordered by creation time.
 */
export const getCheckpoints = async (projectId) => {
  const response = await client.get(`/logs/checkpoints/${projectId}`);
  return response.data;
};

/**
 * Delete a checkpoint.
 * @param {string} projectId - The project ID.
 * @param {string} checkpointId - The checkpoint ID to delete.
 * @returns {Promise<Object>} Success confirmation.
 */
export const deleteCheckpoint = async (projectId, checkpointId) => {
  const response = await client.delete(`/logs/checkpoints/${projectId}/${checkpointId}`);
  return response.data;
};
