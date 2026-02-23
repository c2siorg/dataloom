/**
 * API functions for project profiling operations.
 * @module api/profiling
 */
import client from "./client";

/**
 * Fetch the statistical profile for a project's dataset.
 * @param {string} projectId - The project ID.
 * @returns {Promise<Object>} Profile response containing dataset summary and column profiles.
 */
export const getProjectProfile = async (projectId) => {
  const response = await client.get(`/projects/${projectId}/profile`);
  return response.data;
};
