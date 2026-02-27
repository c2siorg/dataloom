/**
 * API functions for project transformation operations.
 * @module api/transforms
 */
import client from "./client";

/**
 * Apply a basic transformation (filter, sort, add/delete row/column, etc).
 * @param {string} projectId - The project ID.
 * @param {Object} transformationInput - The transformation parameters including operation_type.
 * @returns {Promise<Object>} Transformation result with updated rows and columns.
 */
export const transformProject = async (projectId, transformationInput) => {
  const response = await client.post(
    `/projects/${projectId}/transform`,
    transformationInput
  );
  return response.data;
};

/**
 * Apply a complex transformation (drop duplicates, advanced query, pivot table).
 * @param {string} projectId - The project ID.
 * @param {Object} transformationInput - The transformation parameters including operation_type.
 * @returns {Promise<Object>} Transformation result with updated rows and columns.
 */
export const complexTransformProject = async (projectId, transformationInput) => {
  const response = await client.post(
    `/projects/${projectId}/Complextransform`,
    transformationInput
  );
  return response.data;
};

/**
 * Undo the most recent transformation.
 * Removes the last log entry and rebuilds data from the original file.
 * @param {string} projectId - The project ID.
 * @returns {Promise<Object>} Updated project data with columns and rows after undo.
 */
export const undoProject = async (projectId) => {
  const response = await client.post(`/projects/${projectId}/undo`);
  return response.data;
};
