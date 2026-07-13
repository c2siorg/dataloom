import { useParams } from "react-router-dom";
import { useColumnProfilesView } from "../../context/ColumnProfilesContext";
import type { WorkspaceTab } from "../../context/WorkspaceTabsContext";
import Table from "../Table";

/**
 * The pinned, built-in tab descriptor for the project's working table. Lives
 * here next to the component so both DataScreen (initial tab, "+") and the
 * Profiling menu (focusing the table) share one definition.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const DATASET_TAB: WorkspaceTab = {
  id: "dataset",
  title: "DataSet",
  type: "dataset",
  closeable: true,
};

/**
 * DataSet tab — the built-in tab showing the project's working table. Reads
 * `projectId` from the route like the other tab adapters, so it renders through
 * the same registry seam rather than a special case in the workspace. The
 * inline column-profile row is driven by the shared Profiling toggle.
 */
export function DataSetTab() {
  const { projectId } = useParams() as { projectId: string };
  const { showColumnProfiles } = useColumnProfilesView();
  return <Table projectId={projectId} showColumnProfiles={showColumnProfiles} />;
}
