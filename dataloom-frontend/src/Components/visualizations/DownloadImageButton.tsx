import { useRef, useState } from "react";
import { RiDownload2Fill } from "react-icons/ri";
import { downloadChartAsPng } from "../../utils/chartImage";
import { createLogger } from "../../utils/logger";

const log = createLogger("DownloadImageButton");

interface DownloadImageButtonProps {
  /**
   * Resolves what to export at click time — charts render lazily. Either the
   * container holding the rendered chart, or an SVG built for export.
   */
  getTarget: () => Element | null;
  /** Chart title: drawn as the caption and used for the file name. */
  title: string;
}

type Status = "idle" | "saving" | "error";

const LABEL: Record<Status, string> = {
  idle: "Download image",
  saving: "Saving…",
  error: "Couldn’t save — retry",
};

/**
 * Saves the visualization next to it as a PNG. Sits at the bottom of each chart
 * surface; failures stay on the button rather than interrupting the canvas.
 */
export default function DownloadImageButton({ getTarget, title }: DownloadImageButtonProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("idle");

  const handleClick = async () => {
    const target = getTarget();
    if (!target || !rootRef.current) {
      // Reachable while the chart is still inside its Suspense fallback, so it
      // leaves the same trace as a failed export rather than failing silently.
      log.error("No chart to export yet", { title, hasTarget: Boolean(target) });
      setStatus("error");
      return;
    }
    setStatus("saving");
    try {
      // The button sits inside the chart's surface, so it carries the theme.
      await downloadChartAsPng(target, title, rootRef.current);
      setStatus("idle");
    } catch (error) {
      log.error("Failed to export the chart as a PNG", error);
      setStatus("error");
    }
  };

  return (
    <div ref={rootRef} className="mt-3 flex justify-end">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "saving"}
        title={`Download “${title}” as a PNG`}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
          status === "error"
            ? "border-app-border text-red-600 dark:text-red-400"
            : "border-app-border bg-surface text-muted-foreground hover:border-app-border-hover hover:bg-surface-hover hover:text-foreground"
        }`}
      >
        <RiDownload2Fill className="h-3.5 w-3.5" />
        {LABEL[status]}
      </button>
    </div>
  );
}
