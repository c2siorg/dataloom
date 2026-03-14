import { useState, useEffect, useCallback } from "react";
import {
    getLogs,
    getCheckpoints,
    saveProject,
    exportProject,
    revertToCheckpoint,
} from "../../api";
import { useToast } from "../../context/ToastContext";
import InputDialog from "../common/InputDialog";
import ConfirmDialog from "../common/ConfirmDialog";
import {
    Save,
    Download,
    RotateCcw,
    Clock,
    GitCommit,
    CheckCircle2,
    XCircle,
    ChevronRight,
} from "lucide-react";

/**
 * Version History panel with logs, checkpoints, save, export, and revert.
 */
export default function VersionHistoryPanel({ projectId, onRevert }) {
    const { showToast } = useToast();
    const [logs, setLogs] = useState([]);
    const [checkpoint, setCheckpoint] = useState(null);
    const [showSaveInput, setShowSaveInput] = useState(false);
    const [confirmRevert, setConfirmRevert] = useState(null);
    const [activeTab, setActiveTab] = useState("logs");

    const fetchLogs = useCallback(async () => {
        try {
            const data = await getLogs(projectId);
            setLogs(data);
        } catch {
            console.error("Error fetching logs");
        }
    }, [projectId]);

    const fetchCheckpoints = useCallback(async () => {
        try {
            const data = await getCheckpoints(projectId);
            setCheckpoint(data);
        } catch {
            console.error("Error fetching checkpoints");
        }
    }, [projectId]);

    useEffect(() => {
        fetchLogs();
        fetchCheckpoints();
    }, [fetchLogs, fetchCheckpoints]);

    const handleSave = async (message) => {
        setShowSaveInput(false);
        if (!message) return;
        try {
            await saveProject(projectId, message);
            showToast("Project saved successfully!", "success");
            fetchCheckpoints();
            fetchLogs();
        } catch {
            showToast("Failed to save project.", "error");
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
            showToast("Exported successfully!", "success");
        } catch {
            showToast("Failed to export project.", "error");
        }
    };

    const handleRevert = async () => {
        if (!confirmRevert) return;
        try {
            const response = await revertToCheckpoint(projectId, confirmRevert);
            onRevert(response);
            showToast("Reverted successfully!", "success");
            fetchLogs();
            fetchCheckpoints();
        } catch {
            showToast("Failed to revert.", "error");
        }
        setConfirmRevert(null);
    };

    return (
        <div className="h-full overflow-auto">
            <div className="max-w-4xl mx-auto space-y-6">
                {/* Header with actions */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-semibold text-white">
                            Version History
                        </h2>
                        <p className="text-sm text-surface-400 mt-1">
                            Track changes, save checkpoints, and revert
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowSaveInput(true)}
                            className="btn-primary flex items-center gap-2 text-sm"
                            id="history-save-btn"
                        >
                            <Save className="w-4 h-4" />
                            Save Checkpoint
                        </button>
                        <button
                            onClick={handleExport}
                            className="btn-secondary flex items-center gap-2 text-sm"
                            id="history-export-btn"
                        >
                            <Download className="w-4 h-4" />
                            Export CSV
                        </button>
                    </div>
                </div>

                {/* Tab toggle */}
                <div className="flex items-center bg-surface-900/50 rounded-xl p-1 border border-surface-800/50 w-fit">
                    <button
                        onClick={() => setActiveTab("logs")}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${activeTab === "logs"
                                ? "bg-brand-500/20 text-brand-400"
                                : "text-surface-400 hover:text-surface-200"
                            }`}
                    >
                        Activity Logs
                    </button>
                    <button
                        onClick={() => setActiveTab("checkpoint")}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${activeTab === "checkpoint"
                                ? "bg-brand-500/20 text-brand-400"
                                : "text-surface-400 hover:text-surface-200"
                            }`}
                    >
                        Last Checkpoint
                    </button>
                </div>

                {/* Logs */}
                {activeTab === "logs" && (
                    <div className="glass-card overflow-hidden">
                        {logs.length === 0 ? (
                            <div className="p-8 text-center">
                                <Clock className="w-10 h-10 text-surface-600 mx-auto mb-3" />
                                <p className="text-surface-400 text-sm">
                                    No activity logs yet
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y divide-surface-800/40">
                                {logs.map((log) => (
                                    <div
                                        key={log.id}
                                        className="flex items-center gap-4 px-5 py-3 hover:bg-surface-800/30 transition-colors animate-fade-in-up"
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center flex-shrink-0">
                                            <GitCommit className="w-4 h-4 text-brand-400" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-surface-200">
                                                {log.action_type}
                                            </p>
                                            <p className="text-xs text-surface-500 mt-0.5">
                                                {new Date(log.timestamp).toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            {log.applied ? (
                                                <span className="flex items-center gap-1 text-xs text-emerald-400">
                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                    Applied
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1 text-xs text-surface-500">
                                                    <XCircle className="w-3.5 h-3.5" />
                                                    Skipped
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Checkpoint */}
                {activeTab === "checkpoint" && (
                    <div className="glass-card p-6">
                        {checkpoint && checkpoint.id ? (
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                                    <GitCommit className="w-6 h-6 text-emerald-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-surface-200">
                                        {checkpoint.message || "Checkpoint"}
                                    </p>
                                    <p className="text-xs text-surface-500 mt-0.5">
                                        {new Date(checkpoint.created_at).toLocaleString()}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setConfirmRevert(checkpoint.id)}
                                    className="btn-secondary flex items-center gap-2 text-sm"
                                    id="history-revert-btn"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                    Revert
                                </button>
                            </div>
                        ) : (
                            <div className="text-center py-8">
                                <GitCommit className="w-10 h-10 text-surface-600 mx-auto mb-3" />
                                <p className="text-surface-400 text-sm">
                                    No checkpoint available
                                </p>
                                <p className="text-surface-500 text-xs mt-1">
                                    Save a checkpoint to enable reverting
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Save Dialog */}
            <InputDialog
                isOpen={showSaveInput}
                message="Enter a commit message for this save:"
                onSubmit={handleSave}
                onCancel={() => setShowSaveInput(false)}
            />

            {/* Revert Confirmation */}
            <ConfirmDialog
                isOpen={!!confirmRevert}
                message="Are you sure you want to revert to this checkpoint? Current unsaved changes will be lost."
                onConfirm={handleRevert}
                onCancel={() => setConfirmRevert(null)}
            />
        </div>
    );
}
