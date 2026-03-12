/**
 * API functions for multi-format export and quality reports.
 * @module api/exportApi
 */
import client from "./client";

export const exportProject = async (projectId, format = "csv") => {
  const response = await client.get(`/projects/${projectId}/export`, {
    params: { fmt: format },
    responseType: "blob",
  });
  return response;
};

export const downloadQualityReport = async (projectId) => {
  const response = await client.get(`/projects/${projectId}/quality-report`, {
    responseType: "blob",
  });
  return response;
};
