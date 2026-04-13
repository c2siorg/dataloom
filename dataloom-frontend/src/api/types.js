/**
 * Shared JSDoc typedefs for frontend API responses/requests.
 * @module api/types
 */

/**
 * @typedef {Object} ProjectResponse
 * @property {string} filename
 * @property {string} file_path
 * @property {string} project_id
 * @property {string[]} columns
 * @property {number} row_count
 * @property {unknown[][]} rows
 * @property {Record<string, string>} dtypes
 */

/**
 * @typedef {Object} BasicQueryResponse
 * @property {string} project_id
 * @property {string} operation_type
 * @property {number} row_count
 * @property {string[]} columns
 * @property {unknown[][]} rows
 * @property {Record<string, string>} dtypes
 */

/**
 * @typedef {Object} RecentProjectResponse
 * @property {string} project_id
 * @property {string} name
 * @property {string | null} description
 * @property {string} last_modified
 */

/**
 * @typedef {Object} CheckpointResponse
 * @property {string} id
 * @property {string} message
 * @property {string} created_at
 */

/**
 * @typedef {Object} LogResponse
 * @property {number} id
 * @property {string} action_type
 * @property {Record<string, unknown>} action_details
 * @property {string} timestamp
 * @property {string | null} checkpoint_id
 * @property {boolean} applied
 */

/**
 * @typedef {{ operation_type: string } & Record<string, unknown>} TransformationInput
 */

export {};