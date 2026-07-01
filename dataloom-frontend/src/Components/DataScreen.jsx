import { useParams } from "react-router-dom";
import { useEffect } from "react";
import PropTypes from "prop-types";
import { useProjectContext } from "../context/ProjectContext";
import { WorkspaceTabsProvider, useWorkspaceTabs } from "../context/WorkspaceTabsContext";
import { PanelProvider } from "../context/PanelContext";
import { HistoryRefreshProvider } from "../context/HistoryRefreshContext";
import { ColumnProfilesProvider } from "../context/ColumnProfilesContext";
import { ChartViewProvider } from "../context/ChartViewContext";
import { getTabComponent } from "./workspace/TabRegistry";
// Each feature module self-registers its tabs, panels, and menu items.
import { DATASET_TAB } from "./workspace/features/dataset";
import "./workspace/features/transforms";
import "./workspace/features/history";
import "./workspace/features/profiling";
import "./workspace/features/charts";
import WorkspaceTabBar from "./workspace/WorkspaceTabBar";
import RightPanel from "./workspace/RightPanel";
import MenuNavbar from "./MenuNavbar";

function WorkspaceContent({ projectId }) {
  const { activeTab, openTab } = useWorkspaceTabs();

  const renderActiveTab = () => {
    if (!activeTab) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-gray-500">No table open.</p>
          <button
            type="button"
            onClick={() => openTab(DATASET_TAB)}
            className="rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
          >
            Open DataSet
          </button>
        </div>
      );
    }

    // Every tab type — dataset, logs, checkpoints — resolves through the registry.
    const TabComponent = getTabComponent(activeTab.type);
    if (!TabComponent) {
      return (
        <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
          Unknown tab type: {activeTab.type}
        </div>
      );
    }
    return <TabComponent {...(activeTab.props ?? {})} tab={activeTab} />;
  };

  return (
    <>
      <MenuNavbar projectId={projectId} />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <WorkspaceTabBar onAddTab={() => openTab(DATASET_TAB)} />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{renderActiveTab()}</div>
        </div>
        <RightPanel projectId={projectId} />
      </div>
    </>
  );
}

WorkspaceContent.propTypes = {
  projectId: PropTypes.string,
};

export default function DataScreen() {
  const { projectId } = useParams();
  const { setProjectInfo, refreshProject } = useProjectContext();

  useEffect(() => {
    if (projectId) {
      setProjectInfo(projectId);
      refreshProject(projectId);
    }
  }, [projectId, setProjectInfo, refreshProject]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <WorkspaceTabsProvider projectId={projectId} initialTabs={[DATASET_TAB]}>
        <PanelProvider>
          <HistoryRefreshProvider>
            <ColumnProfilesProvider>
              <ChartViewProvider>
                <WorkspaceContent projectId={projectId} />
              </ChartViewProvider>
            </ColumnProfilesProvider>
          </HistoryRefreshProvider>
        </PanelProvider>
      </WorkspaceTabsProvider>
    </div>
  );
}
