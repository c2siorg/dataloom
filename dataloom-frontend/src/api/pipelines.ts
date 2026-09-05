/**
 * API functions for reusable transformation pipelines.
 * @module api/pipelines
 */
import client from "./client";
import type { CellValue } from "./types";

/** A step to save into a pipeline: an operation plus its serialized parameters. */
export interface PipelineStepInput {
  action_type: string;
  action_details: Record<string, unknown>;
}

/** One stored step of a pipeline: the same pair, plus its position in the run order. */
export interface PipelineStep extends PipelineStepInput {
  step_order: number;
}

/** A saved pipeline with its ordered steps. */
export interface Pipeline {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  steps: PipelineStep[];
}

/** Result of dry-running a pipeline against a project. */
export interface PipelineCompatibility {
  compatible: boolean;
  failing_step: number | null;
  action_type: string | null;
  reason: string | null;
}

/** Acknowledgement returned by a delete. */
export interface DeleteResult {
  success: boolean;
  message: string;
}

/** Response of applying a pipeline (same shape as a transform response). */
export interface PipelineApplyResult {
  row_count: number;
  total_rows?: number;
  total_pages?: number;
  page?: number;
  page_size?: number;
  columns: string[];
  rows: CellValue[][];
}

/**
 * Save an ordered list of steps as a named pipeline.
 * @param projectId - The project the pipeline is authored against (ownership scope).
 * @param name - Pipeline name.
 * @param steps - The ordered steps to store (from logs and/or the step builder).
 * @param description - Optional note describing what the pipeline does.
 */
export const createPipeline = async (
  projectId: string,
  name: string,
  steps: PipelineStepInput[],
  description?: string,
): Promise<Pipeline> => {
  const response = await client.post("/pipelines", {
    name,
    description: description?.trim() || null,
    project_id: projectId,
    steps,
  });
  return response.data;
};

/** List the current user's pipelines, newest first. */
export const getPipelines = async (): Promise<Pipeline[]> => {
  const response = await client.get("/pipelines");
  return response.data;
};

/** Delete a pipeline. */
export const deletePipeline = async (pipelineId: string): Promise<DeleteResult> => {
  const response = await client.delete(`/pipelines/${pipelineId}`);
  return response.data;
};

/** Dry-run a pipeline against a project without changing anything. */
export const checkPipeline = async (
  pipelineId: string,
  projectId: string,
): Promise<PipelineCompatibility> => {
  const response = await client.post(`/pipelines/${pipelineId}/check`, { project_id: projectId });
  return response.data;
};

/** Dry-run an unsaved list of draft steps against a project (before saving). */
export const checkDraftPipelineSteps = async (
  projectId: string,
  steps: PipelineStepInput[],
): Promise<PipelineCompatibility> => {
  const response = await client.post("/pipelines/check-steps", {
    project_id: projectId,
    steps,
  });
  return response.data;
};

/** Apply a pipeline's steps to a project. */
export const applyPipeline = async (
  pipelineId: string,
  projectId: string,
  page?: number,
  pageSize?: number,
): Promise<PipelineApplyResult> => {
  const params = new URLSearchParams();
  if (page !== undefined) params.append("page", String(page));
  if (pageSize !== undefined) params.append("page_size", String(pageSize));

  const response = await client.post(`/pipelines/${pipelineId}/apply?${params.toString()}`, {
    project_id: projectId,
  });
  return response.data;
};
