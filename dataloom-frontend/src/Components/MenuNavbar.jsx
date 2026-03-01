import { useState, useEffect, useCallback } from "react";
import FilterForm from "./forms/FilterForm";
import SortForm from "./forms/SortForm";
import DropDuplicateForm from "./forms/DropDuplicateForm";
import AdvQueryFilterForm from "./forms/AdvQueryFilterForm";
import PivotTableForm from "./forms/PivotTableForm";
import CastDataTypeForm from "./forms/CastDataTypeForm";
import TrimWhitespaceForm from "./forms/TrimWhitespaceForm";
import LogsPanel from "./history/LogsPanel";
import CheckpointsPanel from "./history/CheckpointsPanel";
import InputDialog from "./common/InputDialog";
import ConfirmDialog from "./common/ConfirmDialog";
import Toast from "./common/Toast";
import { saveProject, exportProject, getLogs, getCheckpoints, revertToCheckpoint } from "../api";
import proptype from "prop-types";
import {
  LuFilter,
  LuArrowUpDown,
  LuCopyMinus,
  LuCode,
  LuTable2,
  LuSave,
  LuHistory,
  LuBookmark,
  LuDownload,
  LuRefreshCw,
  LuScissors,
} from "react-icons/lu";

const Menu_NavBar = ({ projectId, onTransform }) => {
  const [showFilterForm, setShowFilterForm] = useState(false);
  const [showSortForm, setShowSortForm] = useState(false);
  const [showDropDuplicateForm, setShowDropDuplicateForm] = useState(false);
  const [showAdvQueryFilterForm, setShowAdvQueryFilterForm] = useState(false);
  const [showPivotTableForm, setShowPivotTableForm] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showCheckpoints, setShowCheckpoints] = useState(false);
  const [showCastDataTypeForm, setShowCastDataTypeForm] = useState(false);
  const [showTrimWhitespaceForm, setShowTrimWhitespaceForm] = useState(false);
  const [logs, setLogs] = useState([]);
  const [checkpoints, setCheckpoints] = useState(null);
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [confirmData, setConfirmData] = useState(null);
  const [toast, setToast] = useState(null);

  const fetchLogs = useCallback(async () => {
    try {
      const logsResponse = await getLogs(projectId);
      setLogs(logsResponse);
    } catch (error) {
      console.error("Error fetching logs:", error);
    }
  }, [projectId]);

  const fetchCheckpoints = useCallback(async () => {
    try {
      const checkpointsResponse = await getCheckpoints(projectId);
      console.log("CHECKPOINT RESPONSE:", checkpointsResponse);
      setCheckpoints(checkpointsResponse);
    } catch (error) {
      console.error("Error fetching checkpoints:", error);
    }
  }, [projectId]);

  useEffect(() => {
    if (showLogs) fetchLogs();
    if (showCheckpoints) fetchCheckpoints();
  }, [showLogs, showCheckpoints, fetchLogs, fetchCheckpoints]);

  const handleSave = () => {
    setIsInputOpen(true);
  };

  const handleSubmitCommit = async (message) => {
    setIsInputOpen(false);
    if (!message) return;

    try {
      await saveProject(projectId, message);
      setToast({ message: "Project saved successfully!", type: "success" });
    } catch {
      setToast({ message: "Failed to save project.", type: "error" });
    }
  };

  const handleExport = async () => {
    try {
      const blob = await exportProject(projectId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "export.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setToast({ message: "Failed to export project.", type: "error" });
    }
  };

  const handleRevert = (checkpointId) => {
    setConfirmData({
      message: "Are you sure you want to revert to this checkpoint?",
      onConfirm: async () => {
        try {
          const response = await revertToCheckpoint(projectId, checkpointId);
          onTransform(response);
          setToast({ message: "Project reverted successfully!", type: "success" });
        } catch {
          setToast({ message: "Failed to revert project.", type: "error" });
        }
        setConfirmData(null);
      },
    });
  };

  const handleMenuClick = (formType) => {
    setShowFilterForm(false);
    setShowSortForm(false);
    setShowDropDuplicateForm(false);
    setShowAdvQueryFilterForm(false);
    setShowPivotTableForm(false);
    setShowCastDataTypeForm(false);
    setShowTrimWhitespaceForm(false);
    setShowLogs(false);
    setShowCheckpoints(false);

    switch (formType) {
      case "FilterForm":
        setShowFilterForm(true);
        break;
      case "SortForm":
        setShowSortForm(true);
        break;
      case "DropDuplicateForm":
        setShowDropDuplicateForm(true);
        break;
      case "AdvQueryFilterForm":
        setShowAdvQueryFilterForm(true);
        break;
      case "PivotTableForm":
        setShowPivotTableForm(true);
        break;
      case "CastDataTypeForm":
        setShowCastDataTypeForm(true);
        break;
      case "TrimWhitespaceForm":
        setShowTrimWhitespaceForm(true);
        break;
      case "Logs":
        setShowLogs(true);
        break;
      case "Checkpoints":
        setShowCheckpoints(true);
        break;
      default:
        break;
    }
  };

  const [activeTab, setActiveTab] = useState("File");

  const tabs = {
    File: [
      {
        group: "Save",
        items: [
          { label: "Save", icon: LuSave, onClick: handleSave },
          { label: "Export", icon: LuDownload, onClick: handleExport },
        ],
      },
      {
        group: "History",
        items: [
          { label: "Logs", icon: LuHistory, onClick: () => handleMenuClick("Logs") },
          { label: "Checkpoints", icon: LuBookmark, onClick: () => handleMenuClick("Checkpoints") },
        ],
      },
    ],
    Data: [
      {
        group: "Transform",
        items: [
          { label: "Filter", icon: LuFilter, onClick: () => handleMenuClick("FilterForm") },
          { label: "Sort", icon: LuArrowUpDown, onClick: () => handleMenuClick("SortForm") },
          {
            label: "Drop Dup",
            icon: LuCopyMinus,
            onClick: () => handleMenuClick("DropDuplicateForm"),
          },
          {
            label: "Cast Type",
            icon: LuRefreshCw,
            onClick: () => handleMenuClick("CastDataTypeForm"),
          },
          {
            label: "Trim Space",
            icon: LuScissors,
            onClick: () => handleMenuClick("TrimWhitespaceForm"),
          },
        ],
      },
      {
        group: "Query",
        items: [
          {
            label: "Adv Query",
            icon: LuCode,
            onClick: () => handleMenuClick("AdvQueryFilterForm"),
          },
          {
            label: "Pivot Table",
            icon: LuTable2,
            onClick: () => handleMenuClick("PivotTableForm"),
          },
        ],
      },
    ],
  };

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

      <div className="flex items-stretch gap-3 px-8 py-2 min-h-[64px]">
        {tabs[activeTab].map((section, sectionIdx) => (
          <div key={section.group} className="flex items-stretch gap-3">
            {sectionIdx > 0 && <div className="w-px bg-gray-200 self-stretch" />}
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-1 flex-1">
                {section.items.map((item) => (
                  <button
                    key={item.label}
                    data-testid={`toolbar-${item.label.toLowerCase().replace(" ", "-")}`}
                    onClick={item.onClick}
                    className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-md hover:bg-gray-100"
                  >
                    <item.icon className="w-5 h-5 text-gray-600" />
                    <span className="text-xs text-gray-700">{item.label}</span>
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">
                {section.group}
              </span>
            </div>
          </div>
        ))}
      </div>

      {showFilterForm && (
        <FilterForm onClose={() => setShowFilterForm(false)} projectId={projectId} />
      )}
      {showSortForm && <SortForm onClose={() => setShowSortForm(false)} projectId={projectId} />}
      {showDropDuplicateForm && (
        <DropDuplicateForm
          projectId={projectId}
          onClose={() => setShowDropDuplicateForm(false)}
          onTransform={onTransform}
        />
      )}
      {showAdvQueryFilterForm && (
        <AdvQueryFilterForm
          onClose={() => setShowAdvQueryFilterForm(false)}
          projectId={projectId}
        />
      )}
      {showPivotTableForm && (
        <PivotTableForm onClose={() => setShowPivotTableForm(false)} projectId={projectId} />
      )}
      {showCastDataTypeForm && (
        <CastDataTypeForm
          projectId={projectId}
          onClose={() => setShowCastDataTypeForm(false)}
          onTransform={onTransform}
        />
      )}
      {showTrimWhitespaceForm && (
        <TrimWhitespaceForm
          projectId={projectId}
          onClose={() => setShowTrimWhitespaceForm(false)}
          onTransform={onTransform}
        />
      )}
      {showLogs && <LogsPanel logs={logs} onClose={() => setShowLogs(false)} />}
      {showCheckpoints && (
        <CheckpointsPanel
          checkpoints={checkpoints}
          onClose={() => setShowCheckpoints(false)}
          onRevert={handleRevert}
        />
      )}

      <InputDialog
        isOpen={isInputOpen}
        message="Enter a commit message for this save:"
        onSubmit={handleSubmitCommit}
        onCancel={() => setIsInputOpen(false)}
      />

      <ConfirmDialog
        isOpen={!!confirmData}
        message={confirmData?.message}
        onConfirm={confirmData?.onConfirm}
        onCancel={() => setConfirmData(null)}
      />

      {toast && (
        <div className="fixed bottom-4 right-4 z-50">
          <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
        </div>
      )}
    </div>
  );
};

Menu_NavBar.propTypes = {
  projectId: proptype.string.isRequired,
  onTransform: proptype.func.isRequired,
};

export default Menu_NavBar;
