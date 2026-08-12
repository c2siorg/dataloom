/**
 * API functions for project transformation operations.
 * @module api/transforms
 */
import client from "./client";
import type { Pagination, TableResponse } from "./types";

/** Backend `BasicQueryResponse` — pagination is present on preview requests. */
export interface TransformResult extends TableResponse, Partial<Pagination> {
  project_id: string;
  operation_type: string;
}

/** A transformation request body. `operation_type` selects the operation. */
export interface TransformationInput {
  operation_type: string;
  [key: string]: unknown;
}

/** Request options for {@link transformProject}. */
export interface TransformOptions {
  /** If true, return transformed data without persisting. */
  preview?: boolean;
  /** Preview page number. */
  page?: number;
  /** Number of preview rows per page. */
  pageSize?: number;
}

/**
 * Apply a transformation (filter, sort, add/delete row/column, pivot, etc).
 * @param projectId - The project ID.
 * @param transformationInput - The transformation parameters including operation_type.
 * @param options - Request options.
 * @returns Transformation result with updated rows and columns.
 */
export const transformProject = async (
  projectId: string,
  transformationInput: TransformationInput,
  { preview = false, page, pageSize }: TransformOptions = {},
): Promise<TransformResult> => {
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
 * @param projectId - The project ID.
 * @param params - GroupBy parameters.
 * @returns Aggregated result.
 */
export const groupByTransform = async (
  projectId: string,
  params: Record<string, unknown>,
): Promise<TransformResult> => {
  const response = await client.post(`/projects/${projectId}/transform`, {
    operation_type: "groupby",
    groupby_params: params,
  });
  return response.data;
};

/**
 * Undo the most recent transformation for a project.
 * Removes the last log entry and rebuilds data from original + remaining logs.
 * @param projectId - The project ID.
 * @returns Updated project data with rows and columns.
 */
export const undoLastTransformation = async (projectId: string): Promise<TransformResult> => {
  const response = await client.post(`/projects/${projectId}/undo`);
  return response.data;
};
