/**
 * API functions for dataset transformation operations.
 * @module api/transforms
 */
import client from "./client";

/**
 * Apply a basic transformation (filter, sort, add/delete row/column, etc).
 * @param {number} datasetId - The dataset ID.
 * @param {Object} transformationInput - The transformation parameters including operation_type.
 * @returns {Promise<Object>} Transformation result with updated rows and columns.
 */
export const transformDataset = async (datasetId, transformationInput) => {
  const response = await client.post(
    `/datasets/${datasetId}/transform`,
    transformationInput
  );
  return response.data;
};

/**
 * Apply a complex transformation (drop duplicates, advanced query, pivot table).
 * @param {number} datasetId - The dataset ID.
 * @param {Object} transformationInput - The transformation parameters including operation_type.
 * @returns {Promise<Object>} Transformation result with updated rows and columns.
 */
export const complexTransformDataset = async (datasetId, transformationInput) => {
  const response = await client.post(
    `/datasets/${datasetId}/Complextransform`,
    transformationInput
  );
  return response.data;
};
