import { useEffect, useState } from "react";
import { getJob, isTerminal, type Job } from "../api/jobs";

/** Delay between polls while a job is young. */
export const POLL_INTERVAL_MS = 1000;
/** Delay between polls once a job has been running a while. */
export const SLOW_POLL_INTERVAL_MS = 3000;
/** How long polling stays at the fast interval. */
export const BACKOFF_AFTER_MS = 30_000;

interface UseJobResult {
  /** The latest state of the job, or the seed until the first poll lands. */
  job: Job | null;
  /** The server no longer knows the job (404): deleted along with its project. */
  gone: boolean;
}

interface PollState extends UseJobResult {
  jobId: string | null;
}

function isNotFound(err: unknown): boolean {
  return (err as { response?: { status?: number } } | null)?.response?.status === 404;
}

/**
 * Poll a job until it finishes.
 *
 * Polls with a chain of timeouts rather than an interval, so a slow response
 * can never stack requests: every second at first, then every three seconds
 * once the job has run for thirty. Stops on a terminal status, on a 404
 * (reported as `gone`), on unmount, and when `jobId` changes. Any other error —
 * a network blip, or the server restarting — just waits for the next poll; a
 * job cut off by a restart then comes back as failed.
 *
 * @param jobId - The job to follow, or null for none.
 * @param seed - The job as already known (e.g. from the submit response), shown
 *   until the first poll. A terminal seed is not polled at all.
 */
export default function useJob(jobId: string | null, seed: Job | null = null): UseJobResult {
  const [state, setState] = useState<PollState>({ jobId, job: seed, gone: false });

  // Reset during render when the job changes, so a new job never shows the
  // previous one's state for a frame.
  if (state.jobId !== jobId) {
    setState({ jobId, job: seed, gone: false });
  }

  const seedIsTerminal = seed !== null && seed.id === jobId && isTerminal(seed);

  useEffect(() => {
    if (!jobId || seedIsTerminal) return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    const schedule = () => {
      const delay =
        Date.now() - startedAt >= BACKOFF_AFTER_MS ? SLOW_POLL_INTERVAL_MS : POLL_INTERVAL_MS;
      timer = setTimeout(poll, delay);
    };

    const poll = async () => {
      try {
        const next = await getJob(jobId);
        if (stopped) return;
        setState({ jobId, job: next, gone: false });
        if (isTerminal(next)) return;
      } catch (err) {
        if (stopped) return;
        if (isNotFound(err)) {
          setState((prev) => ({ ...prev, jobId, gone: true }));
          return;
        }
      }
      schedule();
    };

    schedule();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [jobId, seedIsTerminal]);

  return { job: state.job, gone: state.gone };
}
