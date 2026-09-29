interface UploadProgressProps {
  /** Fraction of the file sent so far, from 0 to 1. */
  progress: number;
  onCancel: () => void;
}

/**
 * Progress bar for a file upload. Cancel is offered only while bytes are
 * still being sent: once the whole file is on the server it is already being
 * processed, and aborting the request would not stop that.
 */
const UploadProgress = ({ progress, onCancel }: UploadProgressProps) => {
  const percent = Math.round(Math.min(progress, 1) * 100);
  const sending = progress < 1;

  return (
    <div data-testid="upload-progress" className="mt-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
        <span>{sending ? `Uploading… ${percent}%` : "Processing…"}</span>
        {sending && (
          <button
            type="button"
            onClick={onCancel}
            className="font-medium text-red-600 dark:text-red-400 hover:underline"
          >
            Cancel upload
          </button>
        )}
      </div>
      <div
        role="progressbar"
        aria-label="Upload progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 w-full overflow-hidden rounded-full bg-elevated"
      >
        <div
          className="h-full rounded-full bg-blue-500 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};

export default UploadProgress;
