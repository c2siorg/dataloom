import { act } from "@testing-library/react";
import { vi } from "vitest";
import type { Job } from "../api/jobs";

/** A job as the server would report it, with overrides. */
export const makeJob = (overrides: Partial<Job> = {}): Job => ({
  id: "job-1",
  project_id: "proj-1",
  kind: "pipelineRun",
  is_exclusive: true,
  status: "queued",
  params: {},
  progress: { current: 0, total: null, message: "Queued" },
  result: null,
  error: null,
  cancel_requested: false,
  created_at: "2026-09-30T00:00:00Z",
  started_at: null,
  finished_at: null,
  ...overrides,
});

/** Advance fake timers inside act, flushing the promises they resolve. */
export const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
