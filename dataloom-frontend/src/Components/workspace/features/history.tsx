import { LuBookmark, LuHistory } from "react-icons/lu";
import type { WorkspaceTab } from "../../../context/WorkspaceTabsContext";
import { CheckpointsTab, LogsTab } from "../HistoryTabs";
import { registerFeature } from "../featureRegistry";

const LOGS_TAB: WorkspaceTab = { id: "logs", title: "Logs", type: "logs", closeable: true };
const CHECKPOINTS_TAB: WorkspaceTab = {
  id: "checkpoints",
  title: "Checkpoints",
  type: "checkpoints",
  closeable: true,
};

/** History feature — the Logs and Checkpoints tabs and their File-ribbon menu. */
registerFeature({
  id: "history",
  tabs: [
    { type: "logs", component: LogsTab },
    { type: "checkpoints", component: CheckpointsTab },
  ],
  menu: [
    {
      ribbon: "File",
      group: "History",
      order: 0,
      label: "Logs",
      icon: LuHistory,
      action: { openTab: LOGS_TAB },
    },
    {
      ribbon: "File",
      group: "History",
      order: 1,
      label: "Checkpoints",
      icon: LuBookmark,
      action: { openTab: CHECKPOINTS_TAB },
    },
  ],
});
