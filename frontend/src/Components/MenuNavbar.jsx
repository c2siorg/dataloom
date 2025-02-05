// NavBar.js
import { useState, useEffect } from "react";
import FilterForm from "./FilterForm";
import SortForm from "./SortForm";
import DropDuplicateForm from "./DropDuplicateForm";
import AdvQueryFilterForm from "./AdvQueryFilterForm";
import PivotTableForm from "./PivotTableForm";
import LogsTable from "./LogsTable"; // Import LogsTable component
import CheckpointsTable from "./CheckpointsTable"; // Import CheckpointsTable component
import {
  saveDataset,
  getLogs,
  getCheckpoints,
  revertToCheckpoint,
} from "../api"; // Import API functions
import proptype from "prop-types";

const Menu_NavBar = ({ datasetId, onTransform }) => {
  const [activeTab, setActiveTab] = useState("File");
  const [showFilterForm, setShowFilterForm] = useState(false);
  const [showSortForm, setShowSortForm] = useState(false);
  const [showDropDuplicateForm, setShowDropDuplicateForm] = useState(false);
  const [showAdvQueryFilterForm, setShowAdvQueryFilterForm] = useState(false);
  const [showPivotTableForm, setShowPivotTableForm] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showCheckpoints, setShowCheckpoints] = useState(false);
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
      const logsResponse = await getLogs(datasetId);
      setLogs(logsResponse.data);
    } catch (error) {
      console.error("Error fetching logs:", error);
    }
  };

  const fetchCheckpoints = async () => {
    try {
      const checkpointsResponse = await getCheckpoints(datasetId);
      setCheckpoints(checkpointsResponse.data);
    } catch (error) {
      console.error("Error fetching checkpoints:", error);
    }
  };

  const handleSave = async () => {
    const commitMessage = prompt("Enter a commit message for this save:");
    if (commitMessage) {
      try {
        const response = await saveDataset(datasetId, commitMessage);
        console.log("Save response:", response.data);
        alert("Dataset saved successfully!");
      } catch (error) {
        console.error("Error saving dataset:", error);
        alert("Failed to save dataset.");
      }
    }
  };

  const handleRevert = async (checkpointId) => {
    if (window.confirm("Are you sure you want to revert to this checkpoint?")) {
      try {
        const response = await revertToCheckpoint(datasetId, checkpointId);
        console.log("Revert response:", response.data);
        onTransform(response.data); // Update table with reverted data
        alert("Dataset reverted successfully!");
      } catch (error) {
        console.error("Error reverting dataset:", error);
        alert("Failed to revert dataset.");
      }
    }
  };

  // General function to handle menu clicks
  const handleMenuClick = (formType) => {
    // Reset all states to false
    setShowFilterForm(false);
    setShowSortForm(false);
    setShowDropDuplicateForm(false);
    setShowAdvQueryFilterForm(false);
    setShowPivotTableForm(false);
    setShowLogs(false);
    setShowCheckpoints(false);

    // Set the specific form type to true
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
      default:
        break;
    }
  };

  const menuOptions = {
    File: [
      {
        name: "File Operations 1",
        options: [
          {
            name: "Filter Dataset",
            icon: "🔍",
            onClick: () => handleMenuClick("FilterForm"),
          },
          {
            name: "Sort Dataset",
            icon: "🔢",
            onClick: () => handleMenuClick("SortForm"),
          },
          {
            name: "Join Dataset",
            icon: "📌",
          },
          {
            name: "Save Dataset",
            icon: "📤",
            onClick: handleSave,
          },
          {
            name: "View Logs",
            icon: "📥",
            onClick: () => handleMenuClick("Logs"),
          },
          {
            name: "View Checkpoints",
            icon: "🕒",
            onClick: () => handleMenuClick("Checkpoints"),
          },
        ],
      },
      {
        name: "Complex Query",
        options: [
          {
            name: "Drop Duplicate",
            icon: "❌",
            onClick: () => handleMenuClick("DropDuplicateForm"),
          },
          {
            name: "Advanced Query",
            icon: "🧠",
            onClick: () => handleMenuClick("AdvQueryFilterForm"),
          },
          {
            name: "Pivot Tables",
            icon: "📊",
            onClick: () => handleMenuClick("PivotTableForm"),
          },
        ],
      },
      {
        name: "Future Options",
        options: [
          { name: "Future Item", icon: "🛠️" },
          { name: "Future Item", icon: "🛠️" },
          { name: "Future Item", icon: "🛠️" },
        ],
      },
    ],
    Home: [
      {
        name: "Clipboard 1 ",
        options: [
          { name: "Cut", icon: "✂️" },
          { name: "Copy", icon: "📋" },
          { name: "Paste", icon: "📌" },
          { name: "Edit", icon: "✏️" },
          { name: "Save", icon: "💾" },
          { name: "Last Checkpoint", icon: "↪️" },
        ],
      },
      {
        name: "Future Options",
        options: [
          { name: "Future Item", icon: "🛠️" },
          { name: "Future Item", icon: "🛠️" },
          { name: "Future Item", icon: "🛠️" },
        ],
      },
      {
        name: "Future Options",
        options: [
          { name: "Future Item", icon: "🛠️" },
          { name: "Future Item", icon: "🛠️" },
          { name: "Future Item", icon: "🛠️" },
        ],
      },
    ],
    Insert: [
      {
        name: "Cells 1",
        options: [
          { name: "Add Row", icon: "➕" },
          { name: "Add Column", icon: "↔️" },
          { name: "Edit Item", icon: "✍️" },
          { name: "Remove Item", icon: "🗑️" },
          { name: "Highlight Cell", icon: "🖍️" },
          { name: "Highlight Complete Bar", icon: "🎨" },
        ],
      },
      {
        name: "Future Options",
        options: [
          { name: "Future Item", icon: "🛠️" },
          { name: "Future Item", icon: "🛠️" },
          { name: "Future Item", icon: "🛠️" },
        ],
      },
      {
        name: "Future Options",
        options: [
          { name: "Future Item", icon: "🛠️" },
          { name: "Future Item", icon: "🛠️" },
          { name: "Future Item", icon: "🛠️" },
        ],
      },
    ],
    "Page Layout": [
      {
        name: "Page Setup 1",
        options: [
          { name: "Margins", icon: "↔️" },
          { name: "Orientation", icon: "🔄" },
          { name: "Size", icon: "📏" },
          { name: "Notes", icon: "🔖" },
          { name: "Text Color", icon: "🎨" },
          { name: "Font Size", icon: "🔠" },
        ],
      },
      {
        name: "Future Options",
        options: [
          { name: "Future Item", icon: "🛠️" },
          { name: "Future Item", icon: "🛠️" },
          { name: "Future Item", icon: "🛠️" },
        ],
      },
      {
        name: "Future Options",
        options: [
          { name: "Future Item", icon: "🛠️" },
          { name: "Future Item", icon: "🛠️" },
          { name: "Future Item", icon: "🛠️" },
        ],
      },
    ],
    Formulas: [
      {
        name: "Function Library 1",
        options: [
          { name: "AutoSum", icon: "Σ" },
          { name: "Average", icon: "📊" },
          { name: "Count", icon: "🔢" },
          { name: "Max", icon: "🔝" },
          { name: "Min", icon: "🔽" },
          { name: "Recently Used", icon: "🕒" },
        ],
      },
      {
        name: "Future Options",
        options: [
          { name: "Future Item", icon: "🛠️" },
          { name: "Future Item", icon: "🛠️" },
          { name: "Future Item", icon: "🛠️" },
        ],
      },
      {
        name: "Future Options",
        options: [
          { name: "Future Item", icon: "🛠️" },
          { name: "Future Item", icon: "🛠️" },
          { name: "Future Item", icon: "🛠️" },
        ],
      },
    ],
    Data: [
      {
        name: "Sort & Filter",
        options: [
          { name: "Filter", icon: "🔍" },
          { name: "Sort", icon: "🔢" },
          { name: "Sort Ascending", icon: "🔼" },
          { name: "Find", icon: "🔎" },
          { name: "Group", icon: "📊" },
          { name: "Sort Descending", icon: "🔽" },
        ],
      },
      {
        name: "Future Options",
        options: [
          { name: "Future Item", icon: "🛠️" },
          { name: "Future Item", icon: "🛠️" },
          { name: "Future Item", icon: "🛠️" },
        ],
      },
      {
        name: "Future Options",
        options: [
          { name: "Future Item", icon: "🛠️" },
          { name: "Future Item", icon: "🛠️" },
          { name: "Future Item", icon: "🛠️" },
        ],
      },
    ],
    Export: [
      {
        name: "Download 1",
        options: [
          { name: "Select Rows and Column", icon: "📝" },
          { name: "Complete Download", icon: "📚" },
          { name: "Download Last Savepoint", icon: "🔢" },
          { name: "Print Document", icon: "🖨️" },
          { name: "Share Document", icon: "🔗" },
          { name: "Undo Changes", icon: "↩️" },
        ],
      },
      {
        name: "Future Options",
        options: [
          { name: "Future Item", icon: "🛠️" },
          { name: "Future Item", icon: "🛠️" },
          { name: "Future Item", icon: "🛠️" },
        ],
      },
      {
        name: "Future Options",
        options: [
          { name: "Future Item", icon: "🛠️" },
          { name: "Future Item", icon: "🛠️" },
          { name: "Future Item", icon: "🛠️" },
        ],
      },
    ],
    Help: [
      {
        name: "Help 1",
        options: [
          { name: "Tutorial", icon: "💬" },
          { name: "Community Blogs", icon: "❓" },
          { name: "FAQ", icon: "📚" },
          { name: "Help Center", icon: "🆘" },
          { name: "Video Guide", icon: "🎥" },
          { name: "User Manual", icon: "📖" },
        ],
      },
      {
        name: "Help 2",
        options: [
          { name: "Tutorial", icon: "💬" },
          { name: "Community Blogs", icon: "❓" },
          { name: "Community Blogs", icon: "❓" },
        ],
      },
      {
        name: "Help 3",
        options: [
          { name: "Tutorial", icon: "💬" },
          { name: "Community Blogs", icon: "❓" },
          { name: "Community Blogs", icon: "❓" },
        ],
      },
    ],
  };

  return (
    <div className="bg-green-700 text-white h-400">
      <div className="flex justify-between border-b border-green-600">
        {Object.keys(menuOptions).map((tab) => (
          <button
            key={tab}
            className={`px-4 py-2 text-sm font-medium hover:bg-green-600 ${
              activeTab === tab
                ? "bg-green-600 border-t border-x border-green-500"
                : ""
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="bg-white text-black p-2 h-40">
        <div className="flex space-x-2">
          {menuOptions[activeTab]?.map((group, groupIndex) => (
            <div
              key={groupIndex}
              className="bg-gray-100 rounded p-2 flex flex-col items-center border border-green-500 w-1/3"
            >
              <div className="text-xs font-bold mb-2">{group.name}</div>
              <div className="grid grid-cols-3 font-semibold gap-2">
                {group.options.map((option, optionIndex) => (
                  <div
                    key={optionIndex}
                    className="flex flex-row items-center justify-center p-1 hover:bg-green-300 rounded cursor-pointer"
                    onClick={option.onClick} // Attach onClick event here
                  >
                    <div className="text-lg mb-1 mr-1 ">{option.icon}</div>
                    <div className="text-xs text-center">{option.name}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Render forms based on their respective state */}
      {showFilterForm && (
        <FilterForm
          onClose={() => setShowFilterForm(false)}
          datasetId={datasetId}
        />
      )}
      {showSortForm && (
        <SortForm
          onClose={() => setShowSortForm(false)}
          datasetId={datasetId}
        />
      )}
      {showDropDuplicateForm && (
        <DropDuplicateForm
          datasetId={datasetId}
          onClose={() => setShowDropDuplicateForm(false)}
          onTransform={onTransform}
        />
      )}
      {showAdvQueryFilterForm && (
        <AdvQueryFilterForm
          onClose={() => setShowAdvQueryFilterForm(false)}
          datasetId={datasetId}
        />
      )}
      {showPivotTableForm && (
        <PivotTableForm
          onClose={() => setShowPivotTableForm(false)}
          datasetId={datasetId}
        />
      )}
      {showLogs && <LogsTable logs={logs} onClose={() => setShowLogs(false)} />}
      {showCheckpoints && (
        <CheckpointsTable
          checkpoints={checkpoints}
          onClose={() => setShowCheckpoints(false)}
          onRevert={handleRevert}
        />
      )}
    </div>
  );
};

Menu_NavBar.propTypes = {
  datasetId: proptype.string.isRequired,
  onTransform: proptype.func.isRequired,
};

export default Menu_NavBar;
