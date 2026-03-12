/**
 * API functions for data quality assessment.
 * @module api/quality
 */
import client from "./client";

export const getQualityAssessment = async (projectId) => {
  const response = await client.get(`/projects/${projectId}/quality`);
  return response.data;
};

export const applyQualityFix = async (projectId, fixType, params = {}) => {
  const response = await client.post(`/projects/${projectId}/quality/fix`, {
    fix_type: fixType,
    params,
  });
  return response.data;
};
