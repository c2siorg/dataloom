import { useState, useEffect, useCallback, useMemo } from "react";
import FilterForm from "./forms/FilterForm";
import SortForm from "./forms/SortForm";
import DropDuplicateForm from "./forms/DropDuplicateForm";
import AdvQueryFilterForm from "./forms/AdvQueryFilterForm";
import PivotTableForm from "./forms/PivotTableForm";
import CastDataTypeForm from "./forms/CastDataTypeForm";
import TrimWhitespaceForm from "./forms/TrimWhitespaceForm";
import StringReplaceForm from "./forms/StringReplaceForm";
import LogsPanel from "./history/LogsPanel";
import CheckpointsPanel from "./history/CheckpointsPanel";
import InputDialog from "./common/InputDialog";
import ConfirmDialog from "./common/ConfirmDialog";
import Toast from "./common/Toast";
import { saveProject, exportProject, getLogs, getCheckpoints, revertToCheckpoint } from "../api";
import PropTypes from "prop-types";
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
  LuReplace,
} from "react-icons/lu";

const MenuButton = ({ icon: Icon, label, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-md ${
      isActive ? "bg-blue-50 text-blue-600" : "hover:bg-gray-100"
    }`}
  >
    <Icon className={`w-5 h-5 ${isActive ? "text-blue-600" : "text-gray-600"}`} />
    <span className={`text-xs ${isActive ? "text-blue-600" : "text-gray-700"}`}>{label}</span>
  </button>
);

MenuButton.propTypes = {
  icon: PropTypes.elementType.isRequired,
  label: PropTypes.string.isRequired,
  isActive: PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired,
};

const MenuNavbar = ({ projectId, onTransform }) => {
  const [activeForm, setActiveForm] = useState(null);
  const [activeTab, setActiveTab] = useState("File");
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
      setCheckpoints(checkpointsResponse);
    } catch (error) {
      console.error("Error fetching checkpoints:", error);
    }
  }, [projectId]);

  useEffect(() => {
    if (activeForm === "Logs") fetchLogs();
    if (activeForm === "Checkpoints") fetchCheckpoints();
  }, [activeForm, fetchLogs, fetchCheckpoints]);

  const handleClose = useCallback(() => setActiveForm(null), []);

  const handleMenuClick = useCallback((formType) => {
    setActiveForm((prev) => (prev === formType ? null : formType));
  }, []);

  const handleSave = useCallback(() => {
    setIsInputOpen(true);
  }, []);

  const handleSubmitCommit = useCallback(
    async (message) => {
      setIsInputOpen(false);
      if (!message) return;

      try {
        await saveProject(projectId, message);
        setToast({ message: "Project saved successfully!", type: "success" });
      } catch {
        setToast({ message: "Failed to save project.", type: "error" });
      }
    },
    [projectId],
  );

  const handleExport = useCallback(async () => {
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
  }, [projectId]);

  const handleRevert = useCallback(
    (checkpointId) => {
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
    },
    [projectId, onTransform],
  );

  // Maps each activeForm value to its component + props.
  // Every entry also receives onClose={handleClose} at render time.
  const formRegistry = useMemo(
    () => ({
      FilterForm: { component: FilterForm, props: { projectId } },
      SortForm: { component: SortForm, props: { projectId } },
      DropDuplicateForm: { component: DropDuplicateForm, props: { projectId, onTransform } },
      AdvQueryFilterForm: { component: AdvQueryFilterForm, props: { projectId } },
      PivotTableForm: { component: PivotTableForm, props: { projectId } },
      CastDataTypeForm: { component: CastDataTypeForm, props: { projectId, onTransform } },
      TrimWhitespaceForm: { component: TrimWhitespaceForm, props: { projectId, onTransform } },
      StringReplaceForm: { component: StringReplaceForm, props: { projectId, onTransform } },
      Logs: { component: LogsPanel, props: { logs } },
      Checkpoints: { component: CheckpointsPanel, props: { checkpoints, onRevert: handleRevert } },
    }),
    [projectId, onTransform, logs, checkpoints, handleRevert],
  );

  const tabs = useMemo(
    () => ({
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
            { label: "Logs", icon: LuHistory, formType: "Logs" },
            { label: "Checkpoints", icon: LuBookmark, formType: "Checkpoints" },
          ],
        },
      ],
      Data: [
        {
          group: "Transform",
          items: [
            { label: "Filter", icon: LuFilter, formType: "FilterForm" },
            { label: "Sort", icon: LuArrowUpDown, formType: "SortForm" },
            { label: "Drop Dup", icon: LuCopyMinus, formType: "DropDuplicateForm" },
            { label: "Cast Type", icon: LuRefreshCw, formType: "CastDataTypeForm" },
            { label: "Trim Space", icon: LuScissors, formType: "TrimWhitespaceForm" },
            { label: "Replace", icon: LuReplace, formType: "StringReplaceForm" },
          ],
        },
        {
          group: "Query",
          items: [
            { label: "Adv Query", icon: LuCode, formType: "AdvQueryFilterForm" },
            { label: "Pivot Table", icon: LuTable2, formType: "PivotTableForm" },
          ],
        },
      ],
    }),
    [handleSave, handleExport],
  );

  const renderActiveForm = () => {
    const entry = activeForm && formRegistry[activeForm];
    if (!entry) return null;
    const { component: FormComponent, props } = entry;
    return <FormComponent {...props} onClose={handleClose} />;
  };

  return (
    <div className="bg-white border-b border-gray-200">
      <div className="flex items-center gap-0 border-b border-gray-200 px-8">
        {Object.keys(tabs).map((tabName) => (
          <button
            key={tabName}
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
                  <MenuButton
                    key={item.label}
                    icon={item.icon}
                    label={item.label}
                    isActive={!!item.formType && activeForm === item.formType}
                    onClick={item.onClick ?? (() => handleMenuClick(item.formType))}
                  />
                ))}
              </div>
              <span className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">
                {section.group}
              </span>
            </div>
          </div>
        ))}
      </div>

      {renderActiveForm()}

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

MenuNavbar.propTypes = {
  projectId: PropTypes.string.isRequired,
  onTransform: PropTypes.func.isRequired,
};

export default MenuNavbar;
