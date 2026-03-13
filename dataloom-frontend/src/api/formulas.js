/**
 * API functions for formula columns and pipelines.
 * @module api/formulas
 */
import client from "./client";

export const createFormulaColumn = async (projectId, params) => {
  const response = await client.post(`/projects/${projectId}/formula`, params);
  return response.data;
};

export const savePipeline = async (params) => {
  const response = await client.post("/projects/pipelines", params);
  return response.data;
};

export const listPipelines = async () => {
  const response = await client.get("/projects/pipelines");
  return response.data;
};

export const runPipeline = async (projectId, pipelineId) => {
  const response = await client.post(`/projects/${projectId}/pipelines/${pipelineId}/run`);
  return response.data;
};
