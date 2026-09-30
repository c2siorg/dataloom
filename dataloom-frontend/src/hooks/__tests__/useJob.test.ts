import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useJob, { BACKOFF_AFTER_MS, POLL_INTERVAL_MS, SLOW_POLL_INTERVAL_MS } from "../useJob";
import { getJob, type Job, type JobStatus } from "../../api/jobs";

vi.mock("../../api/jobs", async () => {
  const actual = await vi.importActual<typeof import("../../api/jobs")>("../../api/jobs");
  return { ...actual, getJob: vi.fn() };
});

const mockGetJob = vi.mocked(getJob);

const job = (status: JobStatus, current = 0, id = "job-1"): Job => ({
  id,
  project_id: "p1",
  kind: "pipelineRun",
  is_exclusive: true,
  status,
  params: {},
  progress: { current, total: 10, message: `Step ${current} of 10 · Sort` },
  result: null,
  error: null,
  cancel_requested: false,
  created_at: "2026-09-30T00:00:00Z",
  started_at: null,
  finished_at: null,
});

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  mockGetJob.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useJob", () => {
  it("shows the seed, then polls every second", async () => {
    mockGetJob.mockResolvedValue(job("running", 3));

    const { result } = renderHook(() => useJob("job-1", job("queued")));

    expect(result.current.job?.status).toBe("queued");
    expect(mockGetJob).not.toHaveBeenCalled();

    await advance(POLL_INTERVAL_MS);
    expect(mockGetJob).toHaveBeenCalledTimes(1);
    expect(result.current.job?.progress.current).toBe(3);

    await advance(POLL_INTERVAL_MS);
    expect(mockGetJob).toHaveBeenCalledTimes(2);
  });

  it("backs off to every three seconds after thirty", async () => {
    mockGetJob.mockResolvedValue(job("running"));
    renderHook(() => useJob("job-1"));

    await advance(BACKOFF_AFTER_MS);
    const callsAtBackoff = mockGetJob.mock.calls.length;
    expect(callsAtBackoff).toBe(BACKOFF_AFTER_MS / POLL_INTERVAL_MS);

    await advance(POLL_INTERVAL_MS);
    expect(mockGetJob).toHaveBeenCalledTimes(callsAtBackoff); // not yet: now on the slow interval
    await advance(SLOW_POLL_INTERVAL_MS - POLL_INTERVAL_MS);
    expect(mockGetJob).toHaveBeenCalledTimes(callsAtBackoff + 1);
  });

  it("stops on a terminal status", async () => {
    mockGetJob.mockResolvedValueOnce(job("running", 5)).mockResolvedValueOnce(job("succeeded", 10));
    const { result } = renderHook(() => useJob("job-1"));

    await advance(POLL_INTERVAL_MS * 2);
    expect(result.current.job?.status).toBe("succeeded");

    await advance(POLL_INTERVAL_MS * 10);
    expect(mockGetJob).toHaveBeenCalledTimes(2);
  });

  it("does not poll a seed that has already finished", async () => {
    renderHook(() => useJob("job-1", job("failed")));

    await advance(POLL_INTERVAL_MS * 5);
    expect(mockGetJob).not.toHaveBeenCalled();
  });

  it("stops on unmount", async () => {
    mockGetJob.mockResolvedValue(job("running"));
    const { unmount } = renderHook(() => useJob("job-1"));

    await advance(POLL_INTERVAL_MS);
    unmount();
    await advance(POLL_INTERVAL_MS * 5);

    expect(mockGetJob).toHaveBeenCalledTimes(1);
  });

  it("treats a 404 as gone and stops", async () => {
    mockGetJob.mockRejectedValue({ response: { status: 404 } });
    const { result } = renderHook(() => useJob("job-1"));

    await advance(POLL_INTERVAL_MS);
    expect(result.current.gone).toBe(true);

    await advance(POLL_INTERVAL_MS * 5);
    expect(mockGetJob).toHaveBeenCalledTimes(1);
  });

  it("keeps polling through other errors, such as a server restart", async () => {
    mockGetJob
      .mockRejectedValueOnce(new Error("Network Error"))
      .mockRejectedValueOnce({ response: { status: 502 } })
      .mockResolvedValueOnce(job("failed"));
    const { result } = renderHook(() => useJob("job-1"));

    await advance(POLL_INTERVAL_MS * 3);

    expect(result.current.job?.status).toBe("failed");
    expect(result.current.gone).toBe(false);
  });

  it("starts over for a new job id", async () => {
    mockGetJob.mockImplementation(async (id: string) => job("running", 1, id));
    const { result, rerender } = renderHook(({ id }) => useJob(id), {
      initialProps: { id: "job-1" as string | null },
    });
    await advance(POLL_INTERVAL_MS);
    expect(result.current.job?.id).toBe("job-1");

    rerender({ id: null });
    expect(result.current.job).toBeNull();
    await advance(POLL_INTERVAL_MS * 3);
    expect(mockGetJob).toHaveBeenCalledTimes(1);
  });
});
