/**
 * API functions for project transformation operations.
 * @module api/transforms
 */
import client from "./client";

/**
 * @typedef {Object} TransformResult
 * @property {string} project_id
 * @property {string} operation_type
 * @property {number} row_count
 * @property {string[]} columns
 * @property {any[][]} rows
 * @property {Object.<string, string>} dtypes
 * @property {number} [page]
 * @property {number} [page_size]
 * @property {number} [total_rows]
 * @property {number} [total_pages]
 */
/**
 * Apply a transformation (filter, sort, add/delete row/column, pivot, etc).
 * @param {string} projectId - The project ID.
 * @param {Object} transformationInput - The transformation parameters including operation_type.
 * @param {Object} options - Request options.
 * @param {boolean} options.preview - If true, return transformed data without persisting.
 * @param {number} [options.page] - Preview page number.
 * @param {number} [options.pageSize] - Number of preview rows per page.
 * @returns {Promise<TransformResult>} Transformation result with updated rows and columns.
 */
export const transformProject = async (
  projectId,
  transformationInput,
  { preview = false, page, pageSize } = {},
) => {
  const params = {
    ...(preview ? { preview: true } : {}),
    ...(preview && page !== undefined ? { page } : {}),
    ...(preview && pageSize !== undefined ? { page_size: pageSize } : {}),
  };

  const response = await client.post(`/projects/${projectId}/transform`, transformationInput, {
    params,
  });

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

/**
 * Undo the most recent transformation for a project.
 * Removes the last log entry and rebuilds data from original + remaining logs.
 * @param {string} projectId - The project ID.
 * @returns {Promise<Object>} Updated project data with rows and columns.
 */
export const undoLastTransformation = async (projectId) => {
  const response = await client.post(`/projects/${projectId}/undo`);
  return response.data;
};
