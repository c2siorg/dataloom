import { useParams } from "react-router-dom";
import { useWorkspaceTabs, type WorkspaceTab } from "../../context/WorkspaceTabsContext";
import { useProjectContext } from "../../context/ProjectContext";
import useDatasetSummary from "../../hooks/useDatasetSummary";
import DatasetSummaryPanel from "../profiling/DatasetSummaryPanel";

// eslint-disable-next-line react-refresh/only-export-components
export const SUMMARY_TAB: WorkspaceTab = {
  id: "summary",
  title: "Summary",
  type: "summary",
  closeable: true,
};

/**
 * Summary tab — the dataset-wide overview (row/column counts, dtypes, memory).
 * Re-homes the profiling overview into the workspace tab system: it fetches via
 * useDatasetSummary (cached by dataVersion) and renders the same panel upstream
 * docked above the table.
 */
export function SummaryTab() {
  const { projectId } = useParams() as { projectId: string };
  const { dataVersion } = useProjectContext();
  const { closeTab } = useWorkspaceTabs();
  // The tab only mounts while active, so it is always "enabled" when rendered.
  const { summary, error, refetch } = useDatasetSummary(projectId, true, dataVersion);

  return (
    <div className="flex-1 overflow-auto p-4">
      <DatasetSummaryPanel
        summary={summary}
        error={error}
        onRetry={refetch}
        onClose={() => closeTab("summary")}
      />
    </div>
  );
}
