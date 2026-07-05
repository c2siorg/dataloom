import { useState } from "react";
import InputDialog from "./common/InputDialog";
import ExportModal from "./ExportModal";
import Toast from "./common/Toast";
import { saveProject, undoLastTransformation } from "../api";
import proptype from "prop-types";
import { LuSave, LuDownload, LuUndo2, LuColumns3 } from "react-icons/lu";
import { useProjectContext } from "../context/ProjectContext";
import { usePanel } from "../context/PanelContext";
import { useWorkspaceTabs } from "../context/WorkspaceTabsContext";
import { useHistoryRefresh } from "../context/HistoryRefreshContext";
import { useColumnProfilesView } from "../context/ColumnProfilesContext";
import { DATASET_TAB } from "./workspace/DataSetTab";
import { getFeatureMenu } from "./workspace/featureRegistry";

// Ribbon skeleton: the top tabs and the group order within each. Features and the
// core items below slot their entries into these buckets; layout stays stable.
const RIBBON_LAYOUT = {
  File: ["Save", "Source", "History"],
  Data: ["Transform", "Query"],
  Profiling: ["Profiling"],
};

const MenuNavbar = ({ projectId }) => {
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState("File");

  const { updateData, refreshProject, pageSize, projectName, isPreviewMode } = useProjectContext();
  const { activePanel, openPanel, togglePanel, closePanel } = usePanel();
  const { openTab, activeTabId } = useWorkspaceTabs();
  const { refreshLogs, refreshCheckpoints } = useHistoryRefresh();
  const { showColumnProfiles, toggleColumnProfiles } = useColumnProfilesView();

  // Column profiles render inside the DataSet tab, so focus it when turning
  // them on (re-opens it if the tab was closed).
  const handleToggleColumnProfiles = () => {
    if (!showColumnProfiles) openTab(DATASET_TAB);
    toggleColumnProfiles();
  };

  const handleSave = () => setIsInputOpen(true);

  const handleSubmitCommit = async (message) => {
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
      if (error.response?.status === 404) {
        setToast({ message: "No transformations to undo.", type: "error" });
      } else {
        setToast({ message: "Failed to undo transformation.", type: "error" });
      }
    }
  };

  // Core ribbon items — the ones that need component-local state/handlers and so
  // can't be declared as (declarative) feature menu items.
  const coreItems = [
    {
      ribbon: "File",
      group: "Save",
      order: 0,
      label: "Save",
      icon: LuSave,
      onClick: handleSave,
      hover: "Save the current state of the project as a new checkpoint.",
    },
    {
      ribbon: "File",
      group: "Save",
      order: 1,
      label: "Export",
      icon: LuDownload,
      onClick: () => setShowExportModal(true),
      hover: "Export the data to a file.",
    },
    {
      ribbon: "File",
      group: "Save",
      order: 2,
      label: "Undo",
      icon: LuUndo2,
      onClick: handleUndo,
      hover: "Undo the last transformation.",
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
  const featureItems = getFeatureMenu().map((item) => ({
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

  return (
    <div className="bg-white border-b border-gray-200">
      <div className="flex items-center gap-0 border-b border-gray-200 px-8">
        {Object.keys(tabs).map((tabName) => (
          <button
            key={tabName}
            data-testid={`tab-${tabName.toLowerCase()}`}
            onClick={() => setActiveTab(tabName)}
            className={`px-4 py-1.5 text-sm font-medium ${
              activeTab === tabName
                ? "text-blue-600 border-b-2 border-blue-500"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tabName}
          </button>
        ))}
      </div>

      <div className="flex items-stretch gap-3 px-8 py-2 min-h-[64px] overflow-x-auto">
        {tabs[activeTab].map((section, sectionIdx) => (
          <div key={section.group} className="flex items-stretch gap-3">
            {sectionIdx > 0 && <div className="w-px bg-gray-200 self-stretch" />}
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-1 flex-1">
                {section.items.map((item) => {
                  const isActive = Boolean(item.active);
                  return (
                    <button
                      key={item.label}
                      data-testid={`toolbar-${item.label.toLowerCase().replace(/ /g, "-")}`}
                      onClick={item.onClick}
                      disabled={item.disabled}
                      title={item.hover}
                      className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-md transition-colors ${
                        isActive
                          ? "bg-blue-50 text-blue-600"
                          : "hover:bg-gray-100 disabled:hover:bg-transparent"
                      } ${item.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <item.icon
                        className={`w-5 h-5 ${isActive ? "text-blue-600" : "text-gray-600"}`}
                      />
                      <span className={`text-xs ${isActive ? "text-blue-600" : "text-gray-700"}`}>
                        {item.label}
                      </span>
                    </button>
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
    </div>
  );
};

MenuNavbar.propTypes = {
  projectId: proptype.string.isRequired,
};

export default MenuNavbar;
