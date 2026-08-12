/**
 * Shared response shapes for the DataLoom API, mirroring the backend's
 * Pydantic schemas in dataloom-backend/app/schemas.py.
 *
 * ⚠️  These must be kept in sync with the backend. Types owned by a single
 *     endpoint module live in that module (see api/profiling.ts); only shapes
 *     two or more modules share belong here.
 *
 * @module api/types
 */

/**
 * A single table cell. The backend serialises every cell as a JSON scalar;
 * `undefined` arises on the client from sparse index access.
 */
export type CellValue = string | number | null | undefined;

/** Tabular payload common to transform and project responses. */
export interface TableResponse {
  columns: string[];
  rows: CellValue[][];
  row_count: number;
  dtypes: Record<string, string>;
}

/** Pagination fields the backend attaches to paged table payloads. */
export interface Pagination {
  page: number;
  page_size: number;
  total_rows: number;
  total_pages: number;
}

/** Backend `LastResponse` / `ProjectMetaResponse` — a project summary. */
export interface ProjectSummary {
  project_id: string;
  name: string;
  description: string | null;
  last_modified: string;
}
