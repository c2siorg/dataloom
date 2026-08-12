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
