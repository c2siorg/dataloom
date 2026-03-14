import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { useProjectContext } from "../context/ProjectContext";
import SpreadsheetTable from "../Components/workspace/SpreadsheetTable";
import TransformationBuilder from "../Components/workspace/TransformationBuilder";
import VersionHistoryPanel from "../Components/workspace/VersionHistoryPanel";
import VisualizationPanel from "../Components/workspace/VisualizationPanel";
import { Table2, Wand2, History, BarChart3 } from "lucide-react";
import Menu_NavBar from "../Components/MenuNavbar";

/**
 * Main workspace view with tabbed panels for table, transformations, history, and charts.
 */
export default function Workspace() {
    const { projectId } = useParams();
    const { setProjectInfo, refreshProject, loading } = useProjectContext();
    const [tableData, setTableData] = useState(null);
    const [activePanel, setActivePanel] = useState("table");

    useEffect(() => {
        if (projectId) {
            setProjectInfo(projectId);
            refreshProject(projectId);
        }
    }, [projectId, setProjectInfo, refreshProject]);

    const handleTransform = (data) => {
        setTableData(data);
    };

    const panels = [
        { key: "table", label: "Data Table", icon: Table2 },
        { key: "transform", label: "Transformations", icon: Wand2 },
        { key: "visualize", label: "Visualize", icon: BarChart3 },
        { key: "history", label: "History", icon: History },
    ];

    return (
        <div className="h-full flex flex-col animate-fade-in">
            {projectId && (
                <div className="mb-4">
                    <Menu_NavBar projectId={projectId} onTransform={handleTransform} />
                </div>
            )}
            {/* Panel Tabs */}
            <div className="flex items-center gap-1 mb-4 bg-surface-900/50 backdrop-blur rounded-xl p-1 border border-surface-800/50 w-fit">
                {panels.map(({ key, label, icon: Icon }) => (
                    <button
                        key={key}
                        onClick={() => setActivePanel(key)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${activePanel === key
                            ? "bg-brand-500/20 text-brand-400 shadow-inner"
                            : "text-surface-400 hover:text-surface-200 hover:bg-surface-800/40"
                            }`}
                        id={`workspace-tab-${key}`}
                    >
                        <Icon className="w-4 h-4" />
                        {label}
                    </button>
                ))}
            </div>

            {/* Panel Content */}
            <div className="flex-1 min-h-0">
                {loading ? (
                    <div className="h-full flex items-center justify-center">
                        <div className="text-center">
                            <div className="w-10 h-10 border-2 border-brand-400/30 border-t-brand-400 rounded-full animate-spin mx-auto mb-4" />
                            <p className="text-surface-400 text-sm">Loading dataset...</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {activePanel === "table" && (
                            <SpreadsheetTable
                                projectId={projectId}
                                data={tableData}
                            />
                        )}
                        {activePanel === "transform" && (
                            <TransformationBuilder
                                projectId={projectId}
                                onTransform={handleTransform}
                            />
                        )}
                        {activePanel === "visualize" && (
                            <VisualizationPanel projectId={projectId} />
                        )}
                        {activePanel === "history" && (
                            <VersionHistoryPanel
                                projectId={projectId}
                                onRevert={handleTransform}
                            />
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
