// @ts-check

/**
 * API functions for project transformation operations.
 * @module api/transforms
 */
import client from "./client";

/**
 * Apply a transformation (filter, sort, add/delete row/column, pivot, etc).
 * @param {string} projectId - The project ID.
 * @param {import("./types").TransformationInput} transformationInput - The transformation parameters including operation_type.
 * @returns {Promise<import("./types").BasicQueryResponse>} Transformation result with updated rows and columns.
 */
export const transformProject = async (projectId, transformationInput) => {
  const response = await client.post(`/projects/${projectId}/transform`, transformationInput);
  return response.data;
};
