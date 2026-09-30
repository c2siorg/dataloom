/**
 * API functions for background jobs: slow work (a pipeline Run, a revert) that
 * returns at once with a job to poll instead of holding one long request.
 * @module api/jobs
 */
import client from "./client";

/** The kinds of work that run as a job. */
export type JobKind = "pipelineRun" | "revert";

/** Where a job is in its life. The last three are terminal. */
export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

/** Statuses a job never leaves. */
export const TERMINAL_JOB_STATUSES: ReadonlySet<JobStatus> = new Set([
  "succeeded",
  "failed",
  "cancelled",
]);

/** How far a job has got. `total` is null while the amount of work is unknown. */
export interface JobProgress {
  current: number;
  total: number | null;
  message: string;
}

/** A job as the server reports it. */
export interface Job {
  id: string;
  project_id: string;
  kind: JobKind;
  /** Whether the job rewrites the project; at most one such job runs per project. */
  is_exclusive: boolean;
  status: JobStatus;
  params: Record<string, unknown>;
  progress: JobProgress;
  result: Record<string, unknown> | null;
  /** Already redacted by the server, safe to show. */
  error: string | null;
  /** Set once a cancel was asked for, even if the job finished anyway. */
  cancel_requested: boolean;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

/** The work to submit: the kind picks which parameters apply. */
export type JobRequest =
  | { kind: "pipelineRun"; pipeline_id: string }
  | { kind: "revert"; checkpoint_id: string | null };

/** Whether a job has finished, one way or another. */
export const isTerminal = (job: Pick<Job, "status">): boolean =>
  TERMINAL_JOB_STATUSES.has(job.status);

/**
 * Submit work to run as a job on a project.
 * @param projectId - The project to work on.
 * @param request - The kind of work and its parameters.
 * @returns The queued job (409 with `active_job_id` if another write job is active).
 */
export const submitJob = async (projectId: string, request: JobRequest): Promise<Job> => {
  const response = await client.post(`/projects/${projectId}/jobs`, request);
  return response.data;
};

/** Fetch one job's status and progress. */
export const getJob = async (jobId: string): Promise<Job> => {
  const response = await client.get(`/jobs/${jobId}`);
  return response.data;
};

/**
 * List a project's jobs, newest first.
 * @param projectId - The project.
 * @param options.active - Only queued and running jobs.
 */
export const listProjectJobs = async (
  projectId: string,
  options: { active?: boolean } = {},
): Promise<Job[]> => {
  const response = await client.get(`/projects/${projectId}/jobs`, {
    params: options.active ? { active: true } : undefined,
  });
  return response.data;
};

/** Cancel a queued job, or ask a running one to stop before it writes. */
export const cancelJob = async (jobId: string): Promise<Job> => {
  const response = await client.post(`/jobs/${jobId}/cancel`);
  return response.data;
};
