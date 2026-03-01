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
 * Fetch checkpoints for a project.
 * @param {string} projectId - The project ID.
 * @returns {Promise<Array>} Checkpoint list (newest first).
 */
export const getCheckpoints = async (projectId) => {
  const response = await client.get(`/logs/checkpoints/${projectId}`);
  return response.data;
};
