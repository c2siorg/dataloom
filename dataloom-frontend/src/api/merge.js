/**
 * API functions for merge/join operations.
 * @module api/merge
 */
import client from "./client";

export const mergeProjects = async (projectId, params) => {
  const response = await client.post(`/projects/${projectId}/merge`, params);
  return response.data;
};

export const concatProjects = async (projectId, params) => {
  const response = await client.post(`/projects/${projectId}/concat`, params);
  return response.data;
};
