/**
 * API functions for chart/visualization operations.
 * @module api/charts
 */
import client from "./client";

/**
 * Fetch available columns and their types for chart axis selection.
 * @param {string} projectId
 * @returns {Promise<Object>} { columns: [{ name, dtype }] }
 */
export const getChartColumns = async (projectId) => {
  const response = await client.get(`/projects/${projectId}/chart/columns`);
  return response.data;
};

/**
 * Fetch computed chart data.
 * @param {string} projectId
 * @param {Object} params - { chart_type, x_column, y_column?, group_by?, agg_function?, limit? }
 * @returns {Promise<Object>} Chart data response
 */
export const getChartData = async (projectId, params) => {
  const response = await client.get(`/projects/${projectId}/chart/data`, { params });
  return response.data;
};
