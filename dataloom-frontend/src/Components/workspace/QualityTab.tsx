import { useEffect, useRef } from "react";
import { LuTriangleAlert } from "react-icons/lu";
import { useQualityView } from "../../context/QualityViewContext";
import QualityReportView from "../quality/QualityReportView";
import Button from "../common/Button";
import type { WorkspaceTab } from "../../context/WorkspaceTabsContext";

/**
 * Quality tab — the assessment display surface. Detector configuration lives in
 * the docked side panel (see QualityConfigPanel); this tab shows the scored
 * report, sharing state via QualityViewContext.
 *
 * Opening the tab starts a default-config run automatically — assessment is
 * stateless on the backend, so there is no cost to running unprompted. Later
 * runs stay explicit: after a transform the report is marked stale and offered
 * a re-run instead of refreshing itself.
 */
export function QualityTab() {
  const { report, loading, error, stale, run, runHistory } = useQualityView();

  // Auto-run once per mount at most; the ref keeps a failed run from looping
  // (the error state offers a manual retry instead).
  const autoRan = useRef(false);
  useEffect(() => {
    if (!autoRan.current && report === null && !loading && !error) {
      autoRan.current = true;
      run();
    }
  }, [report, loading, error, run]);

  return (
    <div className="flex-1 overflow-auto p-4">
      {stale && report && (
        <div className="mb-4 flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-400">
          <span className="flex items-center gap-1.5">
            <LuTriangleAlert className="h-4 w-4 shrink-0" />
            The data changed after this assessment ran.
          </span>
          <Button type="button" variant="secondary" onClick={() => run()} disabled={loading}>
            Run again
          </Button>
        </div>
      )}

      {error ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          Couldn’t run the assessment.
          <Button type="button" variant="secondary" onClick={() => run()}>
            Try again
          </Button>
        </div>
      ) : report ? (
        <QualityReportView report={report} history={runHistory} />
      ) : (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          Assessing data quality…
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const QUALITY_TAB: WorkspaceTab = {
  id: "quality",
  title: "Quality",
  type: "quality",
  closeable: true,
};
