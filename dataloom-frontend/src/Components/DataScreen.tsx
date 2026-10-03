import { useParams } from "react-router-dom";
import { useEffect, useRef } from "react";
import { useProjectContext } from "../context/ProjectContext";
import { ActiveJobProvider, useActiveJob } from "../context/ActiveJobContext";
import { getProjectMeta } from "../api";
import { WorkspaceTabsProvider, useWorkspaceTabs } from "../context/WorkspaceTabsContext";
import { PanelProvider } from "../context/PanelContext";
import { HistoryRefreshProvider } from "../context/HistoryRefreshContext";
import { ColumnProfilesProvider } from "../context/ColumnProfilesContext";
import { ChartViewProvider } from "../context/ChartViewContext";
import { QualityViewProvider } from "../context/QualityViewContext";
import { ReportViewProvider } from "../context/ReportViewContext";
import { PipelineDraftProvider } from "../context/PipelineDraftContext";
import { getTabComponent } from "./workspace/TabRegistry";
// Each feature module self-registers its tabs, panels, and menu items.
import { DATASET_TAB } from "./workspace/features/dataset";
import "./workspace/features/transforms";
import "./workspace/features/history";
import "./workspace/features/profiling";
import "./workspace/features/charts";
import "./workspace/features/quality";
import "./workspace/features/addFile";
import "./workspace/features/pipelines";
import "./workspace/features/report";
import { SUMMARY_TAB } from "./workspace/SummaryTab";
import WorkspaceTabBar from "./workspace/WorkspaceTabBar";
import RightPanel from "./workspace/RightPanel";
import JobBanner from "./workspace/JobBanner";
import MenuNavbar from "./MenuNavbar";

// First entry is the tab active on load.
// eslint-disable-next-line react-refresh/only-export-components
export const INITIAL_TABS = [DATASET_TAB, SUMMARY_TAB];

function WorkspaceContent({ projectId }: { projectId: string }) {
  const { activeTab, openTab } = useWorkspaceTabs();

  const renderActiveTab = () => {
    if (!activeTab) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">No table open.</p>
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
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Unknown tab type: {activeTab.type}
        </div>
      );
    }
    return <TabComponent {...(activeTab.props ?? {})} tab={activeTab} />;
  };

  return (
    <>
      <MenuNavbar projectId={projectId} />
      <JobBanner />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <WorkspaceTabBar />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{renderActiveTab()}</div>
        </div>
        <RightPanel projectId={projectId} />
      </div>
    </>
  );
}

/**
 * Loads the project's table when the workspace opens or its page changes.
 *
 * Waits for the check for an already-running job, and skips the load while a
 * write job runs: the read would queue behind the job's write lock, for as long
 * as the job takes. The job's completion reloads the table instead, so the
 * flag is read through a ref and the job ending does not trigger a second load.
 * Meanwhile the project's name comes from its metadata, which takes no lock.
 */
export function ProjectLoader({ projectId }: { projectId: string }) {
  const { setProjectInfo, refreshProject } = useProjectContext();
  const { activeWriteJob, ready } = useActiveJob();
  const writeJobActive = useRef(false);
  writeJobActive.current = activeWriteJob !== null;

  useEffect(() => {
    if (projectId) setProjectInfo(projectId);
  }, [projectId, setProjectInfo]);

  useEffect(() => {
    if (!projectId || !ready) return;
    if (!writeJobActive.current) {
      refreshProject(projectId);
      return;
    }
    let cancelled = false;
    getProjectMeta(projectId)
      .then((meta) => {
        if (!cancelled) setProjectInfo(projectId, meta.name);
      })
      .catch(() => {
        // The name fills in when the job's completion reloads the project.
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, ready, refreshProject, setProjectInfo]);

  return null;
}

export default function DataScreen() {
  const { projectId } = useParams() as { projectId: string };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <WorkspaceTabsProvider projectId={projectId} initialTabs={INITIAL_TABS}>
        <PanelProvider>
          <HistoryRefreshProvider>
            <ActiveJobProvider projectId={projectId}>
              <ProjectLoader projectId={projectId} />
              <ColumnProfilesProvider>
                <ChartViewProvider>
                  <QualityViewProvider>
                    <PipelineDraftProvider>
                      <ReportViewProvider>
                        <WorkspaceContent projectId={projectId} />
                      </ReportViewProvider>
                    </PipelineDraftProvider>
                  </QualityViewProvider>
                </ChartViewProvider>
              </ColumnProfilesProvider>
            </ActiveJobProvider>
          </HistoryRefreshProvider>
        </PanelProvider>
      </WorkspaceTabsProvider>
    </div>
  );
}
