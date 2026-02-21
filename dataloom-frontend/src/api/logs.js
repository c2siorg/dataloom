/**
 * API functions for activity logs and checkpoints.
 * @module api/logs
 */
import client from "./client";

/**
 * Fetch transformation logs for a dataset.
 * @param {number} datasetId - The dataset ID.
 * @returns {Promise<Array>} List of log entries.
 */
export const getLogs = async (datasetId) => {
  const response = await client.get(`/logs/${datasetId}`);
  return response.data;
};

/**
 * Fetch checkpoints for a dataset.
 * @param {number} datasetId - The dataset ID.
 * @returns {Promise<Object>} Checkpoint data.
 */
export const getCheckpoints = async (datasetId) => {
  const response = await client.get(`/logs/checkpoints/${datasetId}`);
  return response.data;
};
