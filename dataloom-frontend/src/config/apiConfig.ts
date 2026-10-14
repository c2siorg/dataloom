/**
 * API configuration for the DataLoom frontend.
 * @module config/apiConfig
 */

/** Base URL for API requests. Defaults to localhost:4200 for development. */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4200";

/** Request timeout in milliseconds. */
export const API_TIMEOUT = Number(import.meta.env.VITE_API_TIMEOUT) || 30000;

/**
 * Upload request timeout in milliseconds. 0 (the default) means no timeout,
 * so a large file on a slow connection is not cut off by API_TIMEOUT.
 */
export const UPLOAD_TIMEOUT_MS = Number(import.meta.env.VITE_UPLOAD_TIMEOUT) || 0;
