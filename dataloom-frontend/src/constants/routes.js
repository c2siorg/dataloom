/**
 * Route path constants and helpers.
 * @module constants/routes
 */

export const ROUTES = {
  /** Home page path */
  home: "/",
  /** Data view base path */
  data: "/data/:datasetId",
  /**
   * Generate data page path for a specific dataset.
   * @param {number|string} id - The dataset ID.
   * @returns {string} The full route path.
   */
  dataPath: (id) => `/data/${id}`,
};
