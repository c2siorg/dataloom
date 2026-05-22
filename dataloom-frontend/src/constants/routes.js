/**
 * Route path constants and helpers.
 * @module constants/routes
 */

export const ROUTES = {
  /** Projects listing page path */
  home: "/projects",
  /** Sign-in page path */
  signin: "/signin",
  /** Sign-up page path */
  signup: "/signup",
  /** Workspace view path */
  workspace: "/workspace/:projectId",
  /**
   * Generate workspace path for a specific project.
   * @param {string} id - The project UUID.
   * @returns {string} The full route path.
   */
  workspacePath: (id) => `/workspace/${id}`,
};
