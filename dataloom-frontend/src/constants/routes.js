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
  /** Forgot-password page path */
  forgotPassword: "/forgot-password",
  /** Reset-password page path */
  resetPassword: "/reset-password",
  /** Workspace view path */
  workspace: "/workspace/:projectId",
  /**
   * Generate workspace path for a specific project.
   * @param {string} id - The project UUID.
   * @returns {string} The full route path.
   */
  workspacePath: (id) => `/workspace/${id}`,
  /** Settings path */
  settings: "/settings",
  /** Account settings path */
  settingsAccount: "/settings/account",
  /** User preference settings path */
  settingsPreferences: "/settings/preferences",
  /**
   * Generate settings path for a specific project.
   * @param {string} id - The project UUID.
   * @returns {string} The full route path.
   */
  settingsProject: (id) => `/settings/projects/${id}`,
};
