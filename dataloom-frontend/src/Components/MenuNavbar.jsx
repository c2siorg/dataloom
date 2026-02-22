import { useState, useEffect } from "react";
import FilterForm from "./forms/FilterForm";
import SortForm from "./forms/SortForm";
import DropDuplicateForm from "./forms/DropDuplicateForm";
import AdvQueryFilterForm from "./forms/AdvQueryFilterForm";
import PivotTableForm from "./forms/PivotTableForm";
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
} from "react-icons/lu";
import ProfilePanel from "./ProfilePanel";

const Menu_NavBar = ({ projectId, onTransform, onColumnClick }) => {
  const [showFilterForm, setShowFilterForm] = useState(false);
  const [showSortForm, setShowSortForm] = useState(false);
  const [showDropDuplicateForm, setShowDropDuplicateForm] = useState(false);
  const [showAdvQueryFilterForm, setShowAdvQueryFilterForm] = useState(false);
  const [showPivotTableForm, setShowPivotTableForm] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showCheckpoints, setShowCheckpoints] = useState(false);
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [profileData, setProfileData] = useState(null);
  const [logs, setLogs] = useState([]);
  const [checkpoints, setCheckpoints] = useState([]);

  useEffect(() => {
    if (showLogs) {
      fetchLogs();
    }
    if (showCheckpoints) {
      fetchCheckpoints();
    }
  }, [showLogs, showCheckpoints]);

  const fetchLogs = async () => {
    try {
      const logsResponse = await getLogs(projectId);
      setLogs(logsResponse);
    } catch (error) {
      console.error("Error fetching logs:", error);
    }
  };

  const fetchCheckpoints = async () => {
    try {
      const checkpointsResponse = await getCheckpoints(projectId);
      setCheckpoints(checkpointsResponse);
    } catch (error) {
      console.error("Error fetching checkpoints:", error);
    }
  };

  const fetchProfileData = async () => {
    try {
      const data = await getProjectProfile(projectId);
      setProfileData(data);
    } catch (error) {
      console.error("Error fetching profile data:", error);
    }
  };

  const handleSave = async () => {
    const commitMessage = prompt("Enter a commit message for this save:");
    if (commitMessage) {
      try {
        const response = await saveProject(projectId, commitMessage);
        console.log("Save response:", response);
        alert("Project saved successfully!");
      } catch (error) {
        console.error("Error saving project:", error);
        alert("Failed to save project.");
      }
    }
  };

  const handleRevert = async (checkpointId) => {
    if (window.confirm("Are you sure you want to revert to this checkpoint?")) {
      try {
        const response = await revertToCheckpoint(projectId, checkpointId);
        console.log("Revert response:", response);
        onTransform(response);
        alert("Project reverted successfully!");
      } catch (error) {
        console.error("Error reverting project:", error);
        alert("Failed to revert project.");
      }
    }
  };

  const handleMenuClick = (formType) => {
    setShowFilterForm(false);
    setShowSortForm(false);
    setShowDropDuplicateForm(false);
    setShowAdvQueryFilterForm(false);
    setShowPivotTableForm(false);
    setShowLogs(false);
    setShowCheckpoints(false);
    setShowProfilePanel(false);

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
      case "Logs":
        setShowLogs(true);
        break;
      case "Checkpoints":
        setShowCheckpoints(true);
        break;
      case "ProfilePanel":
        setShowProfilePanel(true);
        fetchProfileData();
        break;
      default:
        break;
    }
  };

  const [activeTab, setActiveTab] = useState("Data");

  const tabs = {
    Data: [
      {
        group: "Transform",
        items: [
          {
            label: "Filter",
            icon: LuFilter,
            onClick: () => handleMenuClick("FilterForm"),
          },
          {
            label: "Sort",
            icon: LuArrowUpDown,
            onClick: () => handleMenuClick("SortForm"),
          },
          {
            label: "Drop Dup",
            icon: LuCopyMinus,
            onClick: () => handleMenuClick("DropDuplicateForm"),
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
      {
        group: "Analyze",
        items: [
          {
            label: "Profile",
            icon: LuChartColumn,
            "data-testid": "profile-button",
            onClick: () => {
              if (showProfilePanel) {
                setShowProfilePanel(false);
              } else {
                handleMenuClick("ProfilePanel");
              }
            },
          },
        ],
      },
    ],
    File: [
      {
        group: "Save",
        items: [
          { label: "Save", icon: LuSave, onClick: handleSave },
        ],
      },
      {
        group: "History",
        items: [
          {
            label: "Logs",
            icon: LuHistory,
            onClick: () => handleMenuClick("Logs"),
          },
          {
            label: "Checkpoints",
            icon: LuBookmark,
            onClick: () => handleMenuClick("Checkpoints"),
          },
        ],
      },
    ],
  };

  return (
    <div className="bg-white border-b border-gray-200">
      {/* Tab bar */}
      <div className="flex items-center gap-0 border-b border-gray-200 px-2">
        {Object.keys(tabs).map((tabName) => (
          <button
            key={tabName}
            onClick={() => setActiveTab(tabName)}
            className={`px-4 py-1.5 text-sm font-medium transition-colors duration-150 ${
              activeTab === tabName
                ? "text-blue-600 border-b-2 border-blue-500"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tabName}
          </button>
        ))}
      </div>

      {/* Ribbon body */}
      <div className="flex items-stretch gap-3 px-3 py-2 min-h-[64px]">
        {tabs[activeTab].map((section, sectionIdx) => (
          <div key={section.group} className="flex items-stretch gap-3">
            {sectionIdx > 0 && (
              <div className="w-px bg-gray-200 self-stretch" />
            )}
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
                    <span className="text-xs text-gray-700">
                      {item.label}
                    </span>
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
        <FilterForm
          onClose={() => setShowFilterForm(false)}
          projectId={projectId}
        />
      )}
      {showSortForm && (
        <SortForm
          onClose={() => setShowSortForm(false)}
          projectId={projectId}
        />
      )}
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
        <PivotTableForm
          onClose={() => setShowPivotTableForm(false)}
          projectId={projectId}
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
      {showProfilePanel && (
        <ProfilePanel
          profileData={profileData}
          onClose={() => setShowProfilePanel(false)}
          onColumnClick={(columnName) => {
            if (onColumnClick && profileData) {
              const columnProfile = profileData.columns.find(
                (col) => col.name === columnName
              );
              if (columnProfile) {
                onColumnClick(columnProfile);
              }
            }
          }}
        />
      )}
    </div>
  );
};

Menu_NavBar.propTypes = {
  projectId: proptype.string.isRequired,
  onTransform: proptype.func.isRequired,
  onColumnClick: proptype.func,
};

export default Menu_NavBar;
