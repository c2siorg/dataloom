/**
 * Route path constants and helpers.
 * @module constants/routes
 */

export const ROUTES = {
  /** Login page path */
  login: "/login",
  /** Register page path */
  register: "/register",
  /** Projects listing page path */
  home: "/projects",
  /** Workspace view path */
  workspace: "/workspace/:projectId",
  /**
   * Generate workspace path for a specific project.
   * @param {string} id - The project UUID.
   * @returns {string} The full route path.
   */
  workspacePath: (id) => `/workspace/${id}`,
};
