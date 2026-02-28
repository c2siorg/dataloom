/**
 * API functions for project transformation operations.
 * @module api/transforms
 */
import client from "./client";

/**
 * Apply a transformation (filter, sort, add/delete row/column, pivot, etc).
 * @param {string} projectId - The project ID.
 * @param {Object} transformationInput - The transformation parameters including operation_type.
 * @param {number} [page=1] - Page number (1-indexed).
 * @param {number} [pageSize=50] - Number of rows per page.
 * @returns {Promise<Object>} Transformation result with updated rows and columns.
 */
export const transformProject = async (projectId, transformationInput, page = 1, pageSize = 50) => {
  const response = await client.post(`/projects/${projectId}/transform`, transformationInput, {
    params: { page, page_size: pageSize },
  });
  return response.data;
};

/**
 * Apply a complex transformation (drop duplicates, advanced query, pivot table).
 * @param {string} projectId - The project ID.
 * @param {Object} transformationInput - The transformation parameters including operation_type.
 * @param {number} [page=1] - Page number (1-indexed).
 * @param {number} [pageSize=50] - Number of rows per page.
 * @returns {Promise<Object>} Transformation result with updated rows and columns.
 */
export const complexTransformProject = async (
  projectId,
  transformationInput,
  page = 1,
  pageSize = 50,
) => {
  const response = await client.post(
    `/projects/${projectId}/Complextransform`,
    transformationInput,
    { params: { page, page_size: pageSize } },
  );
  return response.data;
};
