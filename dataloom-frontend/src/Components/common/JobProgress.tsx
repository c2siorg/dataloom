import type { JobProgress as JobProgressState } from "../../api/jobs";

interface JobProgressProps {
  /** What the job is doing, e.g. "Running pipeline". */
  label: string;
  progress: JobProgressState;
  /** Omit to hide the Cancel button. */
  onCancel?: () => void;
  /** A cancel was asked for and the job has not stopped yet. */
  cancelling?: boolean;
}

/**
 * Progress of a background job: a bar, the current step, and Cancel.
 *
 * Determinate while the job knows how many steps it has ("Step 12 of 45 ·
 * Sort"), indeterminate while it does not (reading the data). Cancel stays
 * available until the job finishes, because cancelling a job — unlike aborting
 * a request — really stops the work, and the server decides whether it was
 * still in time.
 */
export default function JobProgress({
  label,
  progress,
  onCancel,
  cancelling = false,
}: JobProgressProps) {
  const { current, total, message } = progress;
  const determinate = total !== null && total > 0;
  const percent = determinate ? Math.round(Math.min(current / total, 1) * 100) : undefined;

  return (
    <div data-testid="job-progress" className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <p className="min-w-0 truncate text-muted-foreground">
          <span className="font-medium text-foreground">{label}</span>
          {message && <span> · {message}</span>}
        </p>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelling}
            className="shrink-0 font-medium text-danger hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:no-underline"
          >
            {cancelling ? "Cancelling…" : "Cancel"}
          </button>
        )}
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={message || undefined}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover"
      >
        {determinate ? (
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        ) : (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
        )}
      </div>
    </div>
  );
}
