import { useState, useEffect } from "react";
import FilterForm from "./forms/FilterForm";
import SortForm from "./forms/SortForm";
import DropDuplicateForm from "./forms/DropDuplicateForm";
import AdvQueryFilterForm from "./forms/AdvQueryFilterForm";
import PivotTableForm from "./forms/PivotTableForm";
import TrimWhitespaceForm from "./forms/TrimWhitespaceForm";
import CastDataTypeForm from "./forms/CastDataTypeForm";
import LogsPanel from "./history/LogsPanel";
import CheckpointsPanel from "./history/CheckpointsPanel";
import {
  saveProject,
  getLogs,
  getCheckpoints,
  revertToCheckpoint,
  getProjectProfile,
} from "../api";
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
  LuChartColumn,
  LuChartBar,
  LuMerge,
  LuCalculator,
  LuShieldCheck,
  LuDownload,
  LuWorkflow,
  LuScissors,
  LuRefreshCw,
} from "react-icons/lu";
import ProfilePanel from "./ProfilePanel";
import ChartBuilder from "./ChartBuilder";
import MergePanel from "./MergePanel";
import FormulaPanel from "./FormulaPanel";
import QualityPanel from "./QualityPanel";
import ExportPanel from "./ExportPanel";
import PipelinePanel from "./PipelinePanel";

const MenuNavbar = ({ projectId, onTransform, onColumnClick }) => {
  const [activePanel, setActivePanel] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [logs, setLogs] = useState([]);
  const [checkpoints, setCheckpoints] = useState([]);

  useEffect(() => {
    if (activePanel === "Logs") fetchLogs();
    if (activePanel === "Checkpoints") fetchCheckpoints();
  }, [activePanel]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchLogs = async () => {
    try { setLogs(await getLogs(projectId)); } catch (e) { console.error(e); }
  };
  const fetchCheckpoints = async () => {
    try { setCheckpoints(await getCheckpoints(projectId)); } catch (e) { console.error(e); }
  };
  const fetchProfileData = async () => {
    try { setProfileData(await getProjectProfile(projectId)); } catch (e) { console.error(e); }
  };

  const handleSave = async () => {
    const msg = prompt("Enter a commit message for this save:");
    if (msg) {
      try {
        await saveProject(projectId, msg);
        alert("Project saved successfully!");
      } catch (e) { console.error(e); alert("Failed to save project."); }
    }
  };

  const handleRevert = async (checkpointId) => {
    if (window.confirm("Are you sure you want to revert to this checkpoint?")) {
      try {
        const response = await revertToCheckpoint(projectId, checkpointId);
        onTransform(response);
        alert("Project reverted successfully!");
      } catch (e) { console.error(e); alert("Failed to revert project."); }
    }
  };

  const handleMenuClick = (panel) => {
    if (activePanel === panel) { setActivePanel(null); return; }
    setActivePanel(panel);
    if (panel === "ProfilePanel") fetchProfileData();
  };

  const closePanel = () => setActivePanel(null);

  const [activeTab, setActiveTab] = useState("Data");

  const tabs = {
    Data: [
      {
        group: "Transform",
        items: [
          { label: "Filter", icon: LuFilter, onClick: () => handleMenuClick("FilterForm") },
          { label: "Sort", icon: LuArrowUpDown, onClick: () => handleMenuClick("SortForm") },
          { label: "Drop Dup", icon: LuCopyMinus, onClick: () => handleMenuClick("DropDuplicateForm") },
          { label: "Trim", icon: LuScissors, onClick: () => handleMenuClick("TrimWhitespaceForm") },
          { label: "Cast Type", icon: LuRefreshCw, onClick: () => handleMenuClick("CastDataTypeForm") },
        ],
      },
      {
        group: "Query",
        items: [
          { label: "Adv Query", icon: LuCode, onClick: () => handleMenuClick("AdvQueryFilterForm") },
          { label: "Pivot Table", icon: LuTable2, onClick: () => handleMenuClick("PivotTableForm") },
          { label: "Formula", icon: LuCalculator, onClick: () => handleMenuClick("FormulaPanel") },
        ],
      },
      {
        group: "Combine",
        items: [
          { label: "Merge", icon: LuMerge, onClick: () => handleMenuClick("MergePanel") },
          { label: "Pipeline", icon: LuWorkflow, onClick: () => handleMenuClick("PipelinePanel") },
        ],
      },
      {
        group: "Analyze",
        items: [
          { label: "Profile", icon: LuChartColumn, "data-testid": "profile-button", onClick: () => handleMenuClick("ProfilePanel") },
          { label: "Visualize", icon: LuChartBar, "data-testid": "visualize-button", onClick: () => handleMenuClick("ChartBuilder") },
          { label: "Quality", icon: LuShieldCheck, onClick: () => handleMenuClick("QualityPanel") },
        ],
      },
    ],
    File: [
      {
        group: "Save",
        items: [{ label: "Save", icon: LuSave, onClick: handleSave }],
      },
      {
        group: "History",
        items: [
          { label: "Logs", icon: LuHistory, onClick: () => handleMenuClick("Logs") },
          { label: "Checkpoints", icon: LuBookmark, onClick: () => handleMenuClick("Checkpoints") },
        ],
      },
      {
        group: "Export",
        items: [
          { label: "Export", icon: LuDownload, onClick: () => handleMenuClick("ExportPanel") },
        ],
      },
    ],
  };

  return (
    <div className="bg-white border-b border-gray-200">
      <div className="flex items-center gap-0 border-b border-gray-200 px-2">
        {Object.keys(tabs).map((tabName) => (
          <button
            key={tabName}
            onClick={() => setActiveTab(tabName)}
            className={`px-4 py-1.5 text-sm font-medium transition-colors duration-150 ${
              activeTab === tabName ? "text-blue-600 border-b-2 border-blue-500" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tabName}
          </button>
        ))}
      </div>

      <div className="flex items-stretch gap-3 px-3 py-2 min-h-[64px]">
        {tabs[activeTab].map((section, sectionIdx) => (
          <div key={section.group} className="flex items-stretch gap-3">
            {sectionIdx > 0 && <div className="w-px bg-gray-200 self-stretch" />}
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-1 flex-1">
                {section.items.map((item) => (
                  <button
                    key={item.label}
                    onClick={item.onClick}
                    data-testid={item["data-testid"]}
                    className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-md hover:bg-gray-100 transition-colors duration-150"
                  >
                    <item.icon className="w-5 h-5 text-gray-600" />
                    <span className="text-xs text-gray-700">{item.label}</span>
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">{section.group}</span>
            </div>
          </div>
        ))}
      </div>

      {activePanel === "FilterForm" && <FilterForm onClose={closePanel} projectId={projectId} />}
      {activePanel === "SortForm" && <SortForm onClose={closePanel} projectId={projectId} />}
      {activePanel === "DropDuplicateForm" && <DropDuplicateForm projectId={projectId} onClose={closePanel} onTransform={onTransform} />}
      {activePanel === "TrimWhitespaceForm" && <TrimWhitespaceForm projectId={projectId} onClose={closePanel} onTransform={onTransform} />}
      {activePanel === "CastDataTypeForm" && <CastDataTypeForm projectId={projectId} onClose={closePanel} onTransform={onTransform} />}
      {activePanel === "AdvQueryFilterForm" && <AdvQueryFilterForm onClose={closePanel} projectId={projectId} />}
      {activePanel === "PivotTableForm" && <PivotTableForm onClose={closePanel} projectId={projectId} />}
      {activePanel === "FormulaPanel" && <FormulaPanel projectId={projectId} onClose={closePanel} onTransform={onTransform} />}
      {activePanel === "MergePanel" && <MergePanel projectId={projectId} onClose={closePanel} onTransform={onTransform} />}
      {activePanel === "PipelinePanel" && <PipelinePanel projectId={projectId} onClose={closePanel} onTransform={onTransform} />}
      {activePanel === "Logs" && <LogsPanel logs={logs} onClose={closePanel} />}
      {activePanel === "Checkpoints" && <CheckpointsPanel checkpoints={checkpoints} onClose={closePanel} onRevert={handleRevert} />}
      {activePanel === "ProfilePanel" && (
        <ProfilePanel
          profileData={profileData}
          onClose={closePanel}
          onColumnClick={(columnName) => {
            if (onColumnClick && profileData) {
              const columnProfile = profileData.columns.find((col) => col.name === columnName);
              if (columnProfile) onColumnClick(columnProfile);
            }
          }}
        />
      )}
      {activePanel === "ChartBuilder" && <ChartBuilder projectId={projectId} onClose={closePanel} />}
      {activePanel === "QualityPanel" && <QualityPanel projectId={projectId} onClose={closePanel} onTransform={onTransform} />}
      {activePanel === "ExportPanel" && <ExportPanel projectId={projectId} onClose={closePanel} />}
    </div>
  );
};

MenuNavbar.propTypes = {
  projectId: proptype.string.isRequired,
  onTransform: proptype.func.isRequired,
  onColumnClick: proptype.func,
};

export default MenuNavbar;
