// @ts-check

/**
 * API functions for activity logs and checkpoints.
 * @module api/logs
 */
import client from "./client";

/**
 * Fetch transformation logs for a project.
 * @param {string} projectId - The project ID.
 * @returns {Promise<import("./types").LogResponse[]>} List of log entries.
 */
export const getLogs = async (projectId) => {
  const response = await client.get(`/logs/${projectId}`);
  return response.data;
};

/**
 * Fetch checkpoints for a project.
 * @param {string} projectId - The project ID.
 * @returns {Promise<import("./types").CheckpointResponse>} Checkpoint data.
 */
export const getCheckpoints = async (projectId) => {
  const response = await client.get(`/logs/checkpoints/${projectId}`);
  return response.data;
};
