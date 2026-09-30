import { JOB_LABELS, useActiveJob } from "../../context/ActiveJobContext";
import JobProgress from "../common/JobProgress";

/**
 * Workspace-wide progress for the job rewriting this project. Sits above the
 * tab bar so it is visible from every tab, and is the one place to cancel it.
 */
export default function JobBanner() {
  const { activeWriteJob, cancelling, cancelActiveJob } = useActiveJob();
  if (!activeWriteJob) return null;

  return (
    <section
      aria-label="Background job"
      data-testid="job-banner"
      className="shrink-0 border-b border-app-border bg-elevated px-4 py-2"
    >
      <JobProgress
        label={JOB_LABELS[activeWriteJob.kind] ?? "Working"}
        progress={activeWriteJob.progress}
        onCancel={cancelActiveJob}
        cancelling={cancelling || activeWriteJob.cancel_requested}
      />
    </section>
  );
}
