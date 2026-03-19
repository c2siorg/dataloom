/**
 * API functions for project transformation operations.
 * @module api/transforms
 */
import client from "./client";

/**
 * Apply a transformation (filter, sort, add/delete row/column, pivot, etc).
 * @param {string} projectId - The project ID.
 * @param {Object} transformationInput - The transformation parameters including operation_type.
 * @returns {Promise<Object>} Transformation result with updated rows and columns.
 */
export const transformProject = async (projectId, transformationInput) => {
  const response = await client.post(`/projects/${projectId}/transform`, transformationInput);
  return response.data;
};

/**
 * Apply a groupby aggregation transformation.
 * @param {string} projectId - The project ID.
 * @param {Object} params - GroupBy parameters.
 * @returns {Promise<Object>} Aggregated result.
 */
export const groupByTransform = async (projectId, params) => {
  const response = await client.post(`/projects/${projectId}/transform`, {
    operation_type: "groupby",
    groupby_params: params,
  });
  return response.data;
};
