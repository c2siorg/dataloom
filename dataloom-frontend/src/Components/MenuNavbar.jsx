import { useState, useEffect, useCallback } from "react";
import FilterForm from "./forms/FilterForm";
import SortForm from "./forms/SortForm";
import DropDuplicateForm from "./forms/DropDuplicateForm";
import AdvQueryFilterForm from "./forms/AdvQueryFilterForm";
import PivotTableForm from "./forms/PivotTableForm";
import MeltForm from "./forms/MeltForm";
import CastDataTypeForm from "./forms/CastDataTypeForm";
import TrimWhitespaceForm from "./forms/TrimWhitespaceForm";
import GroupByForm from "./forms/GroupByForm";
import StringReplaceForm from "./forms/StringReplaceForm";
import LogsPanel from "./history/LogsPanel";
import CheckpointsPanel from "./history/CheckpointsPanel";
import InputDialog from "./common/InputDialog";
import ConfirmDialog from "./common/ConfirmDialog";
import ExportModal from "./ExportModal";
import Toast from "./common/Toast";
import {
  saveProject,
  getLogs,
  getCheckpoints,
  revertToCheckpoint,
  undoLastTransformation,
} from "../api";
import proptype from "prop-types";
import SampleRowsForm from "./forms/SampleRowsForm";
import { LuDice5 } from "react-icons/lu";
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
  LuLayoutList,
  LuGroup,
  LuUndo2,
  LuReplace,
} from "react-icons/lu";
import { useProjectContext } from "../context/ProjectContext";

const MenuNavbar = ({ projectId }) => {
  const [showGroupByForm, setShowGroupByForm] = useState(false);
  const [showFilterForm, setShowFilterForm] = useState(false);
  const [showSortForm, setShowSortForm] = useState(false);
  const [showDropDuplicateForm, setShowDropDuplicateForm] = useState(false);
  const [showAdvQueryFilterForm, setShowAdvQueryFilterForm] = useState(false);
  const [showPivotTableForm, setShowPivotTableForm] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showCheckpoints, setShowCheckpoints] = useState(false);
  const [showCastDataTypeForm, setShowCastDataTypeForm] = useState(false);
  const [showTrimWhitespaceForm, setShowTrimWhitespaceForm] = useState(false);
  const [showMeltForm, setShowMeltForm] = useState(false);
  const [showSampleRowsForm, setShowSampleRowsForm] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showStringReplaceForm, setShowStringReplaceForm] = useState(false);
  const [logs, setLogs] = useState([]);
  const [checkpoints, setCheckpoints] = useState(null);
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [confirmData, setConfirmData] = useState(null);
  const [toast, setToast] = useState(null);

  const { updateData, refreshProject, pageSize, projectName } = useProjectContext();

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
      console.log(checkpointsResponse);
      if (Array.isArray(checkpointsResponse)) {
        setCheckpoints(checkpointsResponse);
      } else if (checkpointsResponse?.id) {
        setCheckpoints([checkpointsResponse]);
      } else {
        setCheckpoints([]);
      }
    } catch (error) {
      console.error("Error fetching checkpoints:", error);
      setCheckpoints(null);
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
    if (!message || !message.trim()) {
      setToast({ message: "Commit message is required.", type: "error" });
      return;
    }

    setIsInputOpen(false);

    try {
      await saveProject(projectId, message);
      await fetchCheckpoints();
      setToast({ message: "Project saved successfully!", type: "success" });
    } catch {
      setToast({ message: "Failed to save project.", type: "error" });
    }
  };

  const handleUndo = async () => {
    try {
      await undoLastTransformation(projectId);
      setShowFilterForm(false);
      setShowSortForm(false);
      setActiveForm(null);
      updateData([], [], { resetColumnOrder: false });
      await refreshProject(projectId, 1, pageSize);
      await fetchLogs();
      setToast({ message: "Last transformation undone!", type: "success" });
    } catch (error) {
      if (error.response?.status === 404) {
        setToast({ message: "No transformations to undo.", type: "error" });
      } else {
        setToast({ message: "Failed to undo transformation.", type: "error" });
      }
    }
  };

  const handleRevert = (checkpointId) => {
    setConfirmData({
      message: "Are you sure you want to revert to this checkpoint?",
      onConfirm: async () => {
        try {
          const response = await revertToCheckpoint(projectId, checkpointId);
          updateData(response.columns, response.rows, {
            dtypes: response.dtypes,
            resetColumnOrder: false,
          });
          setToast({ message: "Project reverted successfully!", type: "success" });
        } catch {
          setToast({ message: "Failed to revert project.", type: "error" });
        }
        setConfirmData(null);
      },
    });
  };

  const [activeForm, setActiveForm] = useState(null);

  const handleMenuClick = (formType) => {
    // If clicking the same form that's already open, close it
    if (activeForm === formType) {
      setActiveForm(null);
      setShowFilterForm(false);
      setShowSortForm(false);
      setShowDropDuplicateForm(false);
      setShowAdvQueryFilterForm(false);
      setShowPivotTableForm(false);
      setShowCastDataTypeForm(false);
      setShowTrimWhitespaceForm(false);
      setShowMeltForm(false);
      setShowLogs(false);
      setShowCheckpoints(false);
      setShowGroupByForm(false);
      setShowSampleRowsForm(false);
      return;
    }

    setShowSampleRowsForm(false);
    setShowFilterForm(false);
    setShowSortForm(false);
    setShowDropDuplicateForm(false);
    setShowAdvQueryFilterForm(false);
    setShowPivotTableForm(false);
    setShowCastDataTypeForm(false);
    setShowTrimWhitespaceForm(false);
    setShowMeltForm(false);
    setShowStringReplaceForm(false);
    setShowLogs(false);
    setShowCheckpoints(false);
    setShowGroupByForm(false);

    setActiveForm(formType);

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
      case "MeltForm":
        setShowMeltForm(true);
        break;
      case "StringReplaceForm":
        setShowStringReplaceForm(true);
        break;
      case "Logs":
        setShowLogs(true);
        break;
      case "Checkpoints":
        setShowCheckpoints(true);
        break;
      case "GroupByForm":
        setShowGroupByForm(true);
        break;
      case "SampleRowsForm":
        setShowSampleRowsForm(true);
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
          { label: "Export", icon: LuDownload, onClick: () => setShowExportModal(true) },
          { label: "Undo", icon: LuUndo2, onClick: handleUndo },
        ],
      },
      {
        group: "History",
        items: [
          {
            label: "Logs",
            icon: LuHistory,
            formType: "Logs",
            onClick: () => handleMenuClick("Logs"),
          },
          {
            label: "Checkpoints",
            icon: LuBookmark,
            formType: "Checkpoints",
            onClick: () => handleMenuClick("Checkpoints"),
          },
        ],
      },
    ],
    Data: [
      {
        group: "Transform",
        items: [
          {
            label: "Filter",
            icon: LuFilter,
            formType: "FilterForm",
            onClick: () => handleMenuClick("FilterForm"),
          },
          {
            label: "Sample",
            icon: LuDice5,
            formType: "SampleRowsForm",
            onClick: () => handleMenuClick("SampleRowsForm"),
          },
          {
            label: "Sort",
            icon: LuArrowUpDown,
            formType: "SortForm",
            onClick: () => handleMenuClick("SortForm"),
          },
          {
            label: "Drop Dup",
            icon: LuCopyMinus,
            formType: "DropDuplicateForm",
            onClick: () => handleMenuClick("DropDuplicateForm"),
          },
          {
            label: "GroupBy",
            icon: LuGroup,
            formType: "GroupByForm",
            onClick: () => handleMenuClick("GroupByForm"),
          },
          {
            label: "Cast Type",
            icon: LuRefreshCw,
            formType: "CastDataTypeForm",
            onClick: () => handleMenuClick("CastDataTypeForm"),
          },
          {
            label: "Trim Space",
            icon: LuScissors,
            formType: "TrimWhitespaceForm",
            onClick: () => handleMenuClick("TrimWhitespaceForm"),
          },
          {
            label: "Replace",
            icon: LuReplace,
            formType: "StringReplaceForm",
            onClick: () => handleMenuClick("StringReplaceForm"),
          },
        ],
      },
      {
        group: "Query",
        items: [
          {
            label: "Adv Query",
            icon: LuCode,
            formType: "AdvQueryFilterForm",
            onClick: () => handleMenuClick("AdvQueryFilterForm"),
          },
          {
            label: "Pivot Table",
            icon: LuTable2,
            formType: "PivotTableForm",
            onClick: () => handleMenuClick("PivotTableForm"),
          },
          {
            label: "Melt (Unpivot)",
            icon: LuLayoutList,
            onClick: () => handleMenuClick("MeltForm"),
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

      <div className="flex items-stretch gap-3 px-8 py-2 min-h-[64px] overflow-x-auto">
        {tabs[activeTab].map((section, sectionIdx) => (
          <div key={section.group} className="flex items-stretch gap-3">
            {sectionIdx > 0 && <div className="w-px bg-gray-200 self-stretch" />}
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-1 flex-1">
                {section.items.map((item) => {
                  const isActive = item.formType && activeForm === item.formType;
                  return (
                    <button
                      key={item.label}
                      data-testid={`toolbar-${item.label.toLowerCase().replace(/ /g, "-")}`}
                      onClick={item.onClick}
                      className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-md ${
                        isActive ? "bg-blue-50 text-blue-600" : "hover:bg-gray-100"
                      }`}
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
              <span className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">
                {section.group}
              </span>
            </div>
          </div>
        ))}
      </div>

      {showFilterForm && (
        <FilterForm
          onClose={() => {
            setShowFilterForm(false);
            setActiveForm(null);
          }}
          projectId={projectId}
        />
      )}
      {showSortForm && (
        <SortForm
          onClose={() => {
            setShowSortForm(false);
            setActiveForm(null);
          }}
          projectId={projectId}
        />
      )}
      {showDropDuplicateForm && (
        <DropDuplicateForm
          projectId={projectId}
          onClose={() => {
            setShowDropDuplicateForm(false);
            setActiveForm(null);
          }}
        />
      )}
      {showAdvQueryFilterForm && (
        <AdvQueryFilterForm
          onClose={() => {
            setShowAdvQueryFilterForm(false);
            setActiveForm(null);
          }}
          projectId={projectId}
        />
      )}
      {showPivotTableForm && (
        <PivotTableForm
          onClose={() => {
            setShowPivotTableForm(false);
            setActiveForm(null);
          }}
          projectId={projectId}
        />
      )}
      {showMeltForm && <MeltForm onClose={() => setShowMeltForm(false)} projectId={projectId} />}
      {showCastDataTypeForm && (
        <CastDataTypeForm
          projectId={projectId}
          onClose={() => {
            setShowCastDataTypeForm(false);
            setActiveForm(null);
          }}
        />
      )}
      {showTrimWhitespaceForm && (
        <TrimWhitespaceForm
          projectId={projectId}
          onClose={() => {
            setShowTrimWhitespaceForm(false);
            setActiveForm(null);
          }}
        />
      )}
      {showStringReplaceForm && (
        <StringReplaceForm
          projectId={projectId}
          onClose={() => {
            setShowStringReplaceForm(false);
            setActiveForm(null);
          }}
        />
      )}
      {showLogs && (
        <LogsPanel
          logs={logs}
          onClose={() => {
            setShowLogs(false);
            setActiveForm(null);
          }}
        />
      )}
      {showCheckpoints && (
        <CheckpointsPanel
          projectId={projectId}
          checkpoints={checkpoints}
          onClose={() => {
            setShowCheckpoints(false);
            setActiveForm(null);
          }}
          onRevert={handleRevert}
          onCheckpointDeleted={fetchCheckpoints}
        />
      )}
      {showGroupByForm && (
        <GroupByForm
          projectId={projectId}
          onClose={() => {
            setShowGroupByForm(false);
            setActiveForm(null);
          }}
        />
      )}
      {showSampleRowsForm && (
        <SampleRowsForm
          projectId={projectId}
          onClose={() => {
            setShowSampleRowsForm(false);
            setActiveForm(null);
          }}
        />
      )}

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

MenuNavbar.propTypes = {
  projectId: proptype.string.isRequired,
};

export default MenuNavbar;
