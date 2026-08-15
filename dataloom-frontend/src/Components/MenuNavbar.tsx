import { useState } from "react";
import InputDialog from "./common/InputDialog";
import ExportModal from "./ExportModal";
import Toast from "./common/Toast";
import { saveProject } from "../api/projects";
import { undoLastTransformation } from "../api/transforms";
import { LuSave, LuDownload, LuUndo2, LuColumns3 } from "react-icons/lu";
import { useProjectContext } from "../context/ProjectContext";
import { usePanel } from "../context/PanelContext";
import { useWorkspaceTabs } from "../context/WorkspaceTabsContext";
import { useHistoryRefresh } from "../context/HistoryRefreshContext";
import { useColumnProfilesView } from "../context/ColumnProfilesContext";
import { useColumnProfilesAction } from "./workspace/useProfilingMenu";
import { getFeatureMenu } from "./workspace/featureRegistry";
import type { ToastType } from "./common/Toast";
import type { IconType } from "react-icons";

// Ribbon skeleton: the top tabs and the group order within each. Features and the
// core items below slot their entries into these buckets; layout stays stable.
const RIBBON_LAYOUT: Record<string, string[]> = {
  File: ["Save", "Source", "History"],
  Data: ["Transform", "Query", "Pipeline"],
  Profiling: ["Profiling"],
};

interface ToastState {
  message: string;
  type: ToastType;
}

interface TooltipState {
  text: string;
  top: number;
  left: number;
}

/** A resolved ribbon button, from either the core list or a feature. */
interface RibbonItem {
  ribbon: string;
  group: string;
  order: number;
  label: string;
  icon: IconType;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  hover?: string;
}

interface MenuNavbarProps {
  projectId: string;
}

const MenuNavbar = ({ projectId }: MenuNavbarProps) => {
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [activeTab, setActiveTab] = useState("File");
  const [activeTooltip, setActiveTooltip] = useState<TooltipState | null>(null);

  const { updateData, refreshProject, pageSize, projectName, isPreviewMode } = useProjectContext();
  const { activePanel, openPanel, togglePanel, closePanel } = usePanel();
  const { openTab, activeTabId } = useWorkspaceTabs();
  const { refreshLogs, refreshCheckpoints } = useHistoryRefresh();
  const { showColumnProfiles } = useColumnProfilesView();

  const handleMouseEnter = (e: { currentTarget: Element }, hoverText?: string) => {
    if (!hoverText) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1024;
    const minX = 80;
    const maxX = Math.max(minX, viewportWidth - 80);
    const clampedLeft = Math.max(minX, Math.min(centerX, maxX));

    setActiveTooltip({
      text: hoverText,
      top: rect.bottom + 6,
      left: clampedLeft,
    });
  };

  const handleMouseLeave = () => {
    setActiveTooltip(null);
  };

  // Shared with the tab bar dropdown so both entry points behave identically.
  const handleToggleColumnProfiles = useColumnProfilesAction();

  const handleSave = () => setIsInputOpen(true);

  const handleSubmitCommit = async (message: string) => {
    if (!message || !message.trim()) {
      setToast({ message: "Commit message is required.", type: "error" });
      return;
    }
    setIsInputOpen(false);
    try {
      await saveProject(projectId, message);
      // Saving creates a checkpoint and marks pending logs as applied.
      refreshCheckpoints();
      refreshLogs();
      setToast({ message: "Project saved successfully!", type: "success" });
    } catch {
      setToast({ message: "Failed to save project.", type: "error" });
    }
  };

  const handleUndo = async () => {
    try {
      await undoLastTransformation(projectId);
      closePanel();
      updateData([], [], { resetColumnOrder: false });
      await refreshProject(projectId, 1, pageSize);
      // Undo removes the last log entry.
      refreshLogs();
      setToast({ message: "Last transformation undone!", type: "success" });
    } catch (error) {
      if ((error as { response?: { status?: number } })?.response?.status === 404) {
        setToast({ message: "No transformations to undo.", type: "error" });
      } else {
        setToast({ message: "Failed to undo transformation.", type: "error" });
      }
    }
  };

  const inPreview = isPreviewMode;

  // Core ribbon items — the ones that need component-local state/handlers and so
  // can't be declared as (declarative) feature menu items.
  const coreItems: RibbonItem[] = [
    {
      ribbon: "File",
      group: "Save",
      order: 0,
      label: "Save",
      icon: LuSave,
      onClick: handleSave,
      disabled: inPreview,
      hover: inPreview
        ? "Save is unavailable while previewing a transformation."
        : "Save the current state of the project as a new checkpoint.",
    },
    {
      ribbon: "File",
      group: "Save",
      order: 1,
      label: "Export",
      icon: LuDownload,
      onClick: () => setShowExportModal(true),
      disabled: inPreview,
      hover: inPreview
        ? "Export is unavailable while previewing a transformation."
        : "Export the data to a file.",
    },
    {
      ribbon: "File",
      group: "Save",
      order: 3,
      label: "Undo",
      icon: LuUndo2,
      onClick: handleUndo,
      disabled: inPreview,
      hover: inPreview
        ? "Undo is unavailable while previewing a transformation."
        : "Undo the last transformation.",
    },
    {
      ribbon: "Profiling",
      group: "Profiling",
      order: 1,
      label: "Column Profiles",
      icon: LuColumns3,
      onClick: handleToggleColumnProfiles,
      active: showColumnProfiles,
      hover: "View the profile of each column.",
    },
  ];

  // Feature-contributed items resolved against the workspace hooks.
  const featureItems: RibbonItem[] = getFeatureMenu().map((item) => ({
    ribbon: item.ribbon,
    group: item.group,
    order: item.order,
    label: item.label,
    icon: item.icon,
    onClick: () => {
      const { openTab: tab, openPanel: panel, togglePanel: toggle } = item.action;
      if (tab) openTab(tab);
      if (panel) openPanel(panel);
      if (toggle) togglePanel(toggle);
    },
    disabled: item.disabledInPreview ? isPreviewMode : false,
    active: item.activePanel
      ? activePanel === item.activePanel
      : item.action?.openTab
        ? activeTabId === item.action.openTab.id
        : false,
    hover: item.hover,
  }));

  const allItems = [...coreItems, ...featureItems];

  // Bucket items into the ribbon skeleton, dropping empty groups.
  const tabs = Object.fromEntries(
    Object.entries(RIBBON_LAYOUT).map(([ribbon, groups]) => [
      ribbon,
      groups
        .map((group) => ({
          group,
          items: allItems
            .filter((it) => it.ribbon === ribbon && it.group === group)
            .sort((a, b) => a.order - b.order),
        }))
        .filter((section) => section.items.length > 0),
    ]),
  );

  const TAB_DESCRIPTIONS: Record<string, string> = {
    File: "Manage project checkpoints, export data, and view history.",
    Data: "Apply transformations, filter, sort, and query the dataset.",
    Profiling: "Analyze dataset summary, column profiles, charts, and data quality.",
  };

  return (
    <div className="bg-background border-b border-app-border">
      <div className="flex items-center gap-0 border-b border-app-border px-8">
        {Object.keys(tabs).map((tabName) => (
          <button
            key={tabName}
            data-testid={`tab-${tabName.toLowerCase()}`}
            title={TAB_DESCRIPTIONS[tabName]}
            onClick={() => {
              handleMouseLeave();
              setActiveTab(tabName);
            }}
            onMouseEnter={(e) => handleMouseEnter(e, TAB_DESCRIPTIONS[tabName])}
            onMouseLeave={handleMouseLeave}
            onFocus={(e) => handleMouseEnter(e, TAB_DESCRIPTIONS[tabName])}
            onBlur={handleMouseLeave}
            className={`px-4 py-1.5 text-sm font-medium ${
              activeTab === tabName
                ? "text-blue-600 dark:text-blue-300 border-b-2 border-blue-500"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tabName}
          </button>
        ))}
      </div>

      <div className="flex items-stretch gap-3 px-8 py-2 min-h-16 overflow-x-auto">
        {(tabs[activeTab] ?? []).map((section, sectionIdx) => (
          <div key={section.group} className="flex items-stretch gap-3">
            {sectionIdx > 0 && <div className="w-px bg-app-border self-stretch" />}
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-1 flex-1">
                {section.items.map((item) => {
                  const isActive = Boolean(item.active);
                  return (
                    <div key={item.label} className="flex flex-col items-center">
                      <button
                        data-testid={`toolbar-${item.label.toLowerCase().replace(/ /g, "-")}`}
                        title={item.hover}
                        onClick={() => {
                          handleMouseLeave();
                          item.onClick();
                        }}
                        onMouseEnter={(e) => handleMouseEnter(e, item.hover)}
                        onMouseLeave={handleMouseLeave}
                        onFocus={(e) => handleMouseEnter(e, item.hover)}
                        onBlur={handleMouseLeave}
                        disabled={item.disabled}
                        className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-md transition-colors ${
                          isActive
                            ? "bg-accent-subtle text-accent"
                            : "hover:bg-surface-hover disabled:hover:bg-transparent"
                        } ${item.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        <item.icon
                          className={`w-5 h-5 ${isActive ? "text-accent" : "text-muted-foreground"}`}
                        />
                        <span
                          className={`text-xs ${isActive ? "text-accent" : "text-muted-foreground"}`}
                        >
                          {item.label}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        projectId={projectId}
        defaultName={projectName}
        onError={(message) => setToast({ message, type: "error" })}
      />

      <InputDialog
        isOpen={isInputOpen}
        message="Enter a commit message for this save:"
        required={true}
        onSubmit={handleSubmitCommit}
        onCancel={() => setIsInputOpen(false)}
      />

      {toast && (
        <div className="fixed bottom-4 right-4 z-50">
          <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
        </div>
      )}

      {activeTooltip && (
        <div
          role="tooltip"
          style={{
            top: `${activeTooltip.top}px`,
            left: `${activeTooltip.left}px`,
          }}
          className="fixed -translate-x-1/2 z-50 pointer-events-none px-2.5 py-1 text-xs text-foreground bg-surface border border-app-border rounded-md shadow-md max-w-xs text-center text-wrap"
        >
          {activeTooltip.text}
        </div>
      )}
    </div>
  );
};

export default MenuNavbar;
