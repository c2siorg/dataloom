import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  cancelJob,
  getJob,
  isTerminal,
  listProjectJobs,
  submitJob,
  type Job,
  type JobKind,
  type JobRequest,
} from "../api/jobs";
import useJob from "../hooks/useJob";
import { getErrorMessage } from "../utils/errorUtils";
import { useHistoryRefresh } from "./HistoryRefreshContext";
import { useProjectContext } from "./ProjectContext";
import { useToast } from "./ToastContext";

/** What each kind of job is doing, for the progress banner. */
// eslint-disable-next-line react-refresh/only-export-components
export const JOB_LABELS: Record<JobKind, string> = {
  pipelineRun: "Running pipeline",
  revert: "Reverting",
};

// The toasts the synchronous flows showed, reused so a job reads the same.
const DEFAULT_MESSAGES: Record<JobKind, Required<JobMessages>> = {
  pipelineRun: { success: "Pipeline applied.", failure: "Failed to apply pipeline." },
  revert: { success: "Project reverted successfully!", failure: "Failed to revert project." },
};

export const CANCELLED_MESSAGE = "Cancelled — nothing was changed";
export const TOO_LATE_MESSAGE = "Finished before it could be cancelled";
export const ALREADY_RUNNING_MESSAGE = "Another job is already running on this project.";
export const GONE_MESSAGE = "The job is no longer available.";

/** Toast text for a job's outcome, from whoever started it. */
export interface JobMessages {
  success?: string;
  failure?: string;
}

interface ActiveJobContextValue {
  /** The job rewriting this project right now, or null. Write controls stay disabled while set. */
  activeWriteJob: Job | null;
  /** Whether the check for a job already running (e.g. before a reload) has settled. */
  ready: boolean;
  /** A cancel was asked for and the job has not stopped yet. */
  cancelling: boolean;
  /**
   * Submit work as a job and follow it. Resolves with the queued job, or null
   * if it could not start (the reason has been toasted). The outcome — refresh
   * and toast — is handled here when the job ends, even after a reload.
   */
  startJob: (request: JobRequest, messages?: JobMessages) => Promise<Job | null>;
  /** Cancel the active job. */
  cancelActiveJob: () => Promise<void>;
}

interface Tracked {
  job: Job;
  messages: JobMessages;
}

interface ApiErrorLike {
  response?: { status?: number; data?: { active_job_id?: string } };
}

const ActiveJobContext = createContext<ActiveJobContextValue | null>(null);

/**
 * Access the workspace's active job. Must be used within an ActiveJobProvider.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useActiveJob(): ActiveJobContextValue {
  const context = useContext(ActiveJobContext);
  if (!context) throw new Error("useActiveJob must be used within an ActiveJobProvider");
  return context;
}

/** The job rewriting this project right now, or null (also outside a workspace). */
// eslint-disable-next-line react-refresh/only-export-components
export function useActiveWriteJob(): Job | null {
  return useContext(ActiveJobContext)?.activeWriteJob ?? null;
}

/**
 * Whether reads of the project should wait: until the check for a job started
 * before this workspace opened has settled, and while a job rewrites the
 * project. A read issued then would queue behind the job's write lock for as
 * long as the job runs; the job's completion bumps `dataVersion` and reloads
 * the table, so waiting readers refetch then. Always false outside a workspace.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useProjectReadsOnHold(): boolean {
  const context = useContext(ActiveJobContext);
  return context !== null && (!context.ready || context.activeWriteJob !== null);
}

/**
 * Tracks the one job that may be rewriting a project, for the workspace of that
 * project.
 *
 * On mount it asks the server for an active job, so a reload picks up the
 * progress of a job started before it. While a job runs it polls it (see
 * {@link useJob}); when the job ends it reloads the table, bumps the data
 * version so profiles and charts refetch, refreshes the logs, and toasts the
 * outcome.
 */
export function ActiveJobProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) {
  const { refreshProject, markDataChanged, page, pageSize } = useProjectContext();
  const { refreshLogs } = useHistoryRefresh();
  const { showToast } = useToast();

  const [tracked, setTracked] = useState<Tracked | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const [forProject, setForProject] = useState(projectId);
  const handled = useRef<string | null>(null);

  // A different project: forget the previous one's job (reset during render,
  // so the new workspace never shows it for a frame).
  if (forProject !== projectId) {
    setForProject(projectId);
    setTracked(null);
    setCancelling(false);
  }

  const { job: polled, gone } = useJob(tracked?.job.id ?? null, tracked?.job ?? null);

  // The freshest view of the tracked job: a terminal state from an action
  // (cancelling a queued job) wins over an older poll.
  let current: Job | null = null;
  if (tracked) {
    current = !isTerminal(tracked.job) && polled?.id === tracked.job.id ? polled : tracked.job;
  }

  // Resume: find a job started before this workspace was opened.
  useEffect(() => {
    let cancelled = false;
    listProjectJobs(projectId, { active: true })
      .then((jobs) => {
        if (cancelled) return;
        const running = jobs.find((job) => job.is_exclusive && !isTerminal(job));
        if (running) setTracked((prev) => prev ?? { job: running, messages: {} });
      })
      .catch(() => {
        // Nothing to resume is the safe reading of a failed check.
      })
      .finally(() => {
        if (!cancelled) setReadyFor(projectId);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const finish = useCallback(
    async (job: Job, jobGone: boolean, messages: JobMessages) => {
      const defaults = DEFAULT_MESSAGES[job.kind] ?? DEFAULT_MESSAGES.pipelineRun;
      if (jobGone) {
        showToast(GONE_MESSAGE, "warning");
        return;
      }
      if (job.status === "succeeded") {
        await refreshProject(projectId, page, pageSize);
        markDataChanged();
        refreshLogs();
        if (job.cancel_requested) showToast(TOO_LATE_MESSAGE, "info");
        else showToast(messages.success ?? defaults.success, "success");
      } else if (job.status === "cancelled") {
        showToast(CANCELLED_MESSAGE, "info");
      } else {
        showToast(job.error || messages.failure || defaults.failure, "error");
      }
    },
    [projectId, page, pageSize, refreshProject, markDataChanged, refreshLogs, showToast],
  );

  useEffect(() => {
    if (!tracked || !current) return;
    if (!gone && !isTerminal(current)) return;
    if (handled.current === current.id) return;
    handled.current = current.id;
    setTracked(null);
    setCancelling(false);
    void finish(current, gone, tracked.messages);
  }, [tracked, current, gone, finish]);

  const startJob = useCallback(
    async (request: JobRequest, messages: JobMessages = {}) => {
      try {
        const job = await submitJob(projectId, request);
        setCancelling(false);
        setTracked({ job, messages });
        return job;
      } catch (err) {
        const response = (err as ApiErrorLike | null)?.response;
        const activeId = response?.status === 409 ? response.data?.active_job_id : undefined;
        if (activeId) {
          // Started elsewhere (another tab): follow it rather than fail silently.
          showToast(ALREADY_RUNNING_MESSAGE, "info");
          try {
            const other = await getJob(activeId);
            if (!isTerminal(other)) setTracked((prev) => prev ?? { job: other, messages: {} });
          } catch {
            // The other job ended or vanished meanwhile; nothing to follow.
          }
          return null;
        }
        const fallback = messages.failure ?? DEFAULT_MESSAGES[request.kind].failure;
        showToast(getErrorMessage(err, fallback), "error");
        return null;
      }
    },
    [projectId, showToast],
  );

  const trackedId = tracked?.job.id;
  const cancelActiveJob = useCallback(async () => {
    if (!trackedId) return;
    setCancelling(true);
    try {
      const job = await cancelJob(trackedId);
      setTracked((prev) => (prev && prev.job.id === job.id ? { ...prev, job } : prev));
    } catch (err) {
      // 409: it finished first; the next poll reports how.
      if ((err as ApiErrorLike | null)?.response?.status !== 409) {
        setCancelling(false);
        showToast(getErrorMessage(err, "Could not cancel the job."), "error");
      }
    }
  }, [trackedId, showToast]);

  const activeWriteJob = current && current.is_exclusive && !isTerminal(current) ? current : null;
  const ready = readyFor === projectId;

  const value = useMemo<ActiveJobContextValue>(
    () => ({ activeWriteJob, ready, cancelling, startJob, cancelActiveJob }),
    [activeWriteJob, ready, cancelling, startJob, cancelActiveJob],
  );

  return <ActiveJobContext.Provider value={value}>{children}</ActiveJobContext.Provider>;
}
