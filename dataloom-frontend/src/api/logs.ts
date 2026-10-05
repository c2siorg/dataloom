/**
 * API functions for activity logs and checkpoints.
 * @module api/logs
 */
import client from "./client";

/** Backend `LogResponse` — one change-log entry. */
export interface LogEntry {
  id: number;
  action_type: string;
  action_details: Record<string, unknown>;
  timestamp: string;
  checkpoint_id: string | null;
  applied: boolean;
}

/** Backend `CheckpointResponse` — one save point. */
export interface Checkpoint {
  id: string;
  message: string;
  created_at: string;
}

/**
 * Fetch transformation logs for a project.
 * @param projectId - The project ID.
 * @returns List of log entries.
 */
export const getLogs = async (projectId: string): Promise<LogEntry[]> => {
  const response = await client.get(`/logs/${projectId}`);
  return response.data;
};

/**
 * Fetch all checkpoints for a project.
 * @param projectId - The project ID.
 * @returns List of checkpoints ordered by creation time.
 */
export const getCheckpoints = async (projectId: string): Promise<Checkpoint[]> => {
  const response = await client.get(`/logs/checkpoints/${projectId}`);
  return response.data;
};

/**
 * Delete a checkpoint.
 * @param projectId - The project ID.
 * @param checkpointId - The checkpoint ID to delete.
 * @returns Success confirmation.
 */
export const deleteCheckpoint = async (projectId: string, checkpointId: string) => {
  const response = await client.delete(`/logs/checkpoints/${projectId}/${checkpointId}`);
  return response.data;
};
/** Backend `DatasetComparisonResponse` — checkpoint vs current dataset. */
export interface DatasetComparison {
  summary: {
    checkpoint_rows: number;
    current_rows: number;
    checkpoint_columns: number;
    current_columns: number;
    added_rows: number;
    removed_rows: number;
    changed_cells: number;
    affected_rows: number;
    affected_columns: number;
  };
  columns: {
    added: string[];
    removed: string[];
    dtype_changed: {
      name: string;
      before: string;
      after: string;
    }[];
  };
  rows: {
    type: string;
    row: unknown;
    checkpoint_index: number | null;
    current_index: number | null;
  }[];
  cells: {
    row: unknown;
    column: string;
    checkpoint_value: unknown;
    current_value: unknown;
  }[];
  total_rows: number;
  total_cells: number;
  page: number;
  page_size: number;
  total_pages: number;
  matching_strategy: string;
}

/**
 * Compare a checkpoint dataset with the current working dataset.
 */
export const compareCheckpoint = async (
  projectId: string,
  checkpointId: string,
  page = 1,
  pageSize = 50,
  matchColumn?: string,
): Promise<DatasetComparison> => {
  const response = await client.get(`/logs/checkpoints/${projectId}/${checkpointId}/compare`, {
    params: {
      page,
      page_size: pageSize,
      ...(matchColumn ? { match_column: matchColumn } : {}),
    },
  });

  return response.data;
};
