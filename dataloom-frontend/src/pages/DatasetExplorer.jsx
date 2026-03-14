import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { uploadProject, getRecentProjects, deleteProject } from "../api";
import { useToast } from "../context/ToastContext";
import ConfirmDialog from "../Components/common/ConfirmDialog";
import {
    Plus,
    Upload,
    Database,
    Trash2,
    Clock,
    FileSpreadsheet,
    Search,
    Grid3X3,
    List,
    CloudUpload,
} from "lucide-react";
import { useDropzone } from "react-dropzone";

/**
 * Dataset Explorer — browse, upload, and manage all projects.
 */
export default function DatasetExplorer() {
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [file, setFile] = useState(null);
    const [projectName, setProjectName] = useState("");
    const [projectDescription, setProjectDescription] = useState("");
    const [recentProjects, setRecentProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState({
        open: false,
        projectId: null,
    });
    const [searchQuery, setSearchQuery] = useState("");
    const [viewMode, setViewMode] = useState("grid");
    const navigate = useNavigate();
    const { showToast } = useToast();

    useEffect(() => {
        fetchRecentProjects();
    }, []);

    const fetchRecentProjects = async () => {
        try {
            const response = await getRecentProjects();
            setRecentProjects(response);
        } catch {
            console.error("Error fetching projects");
        } finally {
            setLoading(false);
        }
    };

    const onDrop = useCallback((acceptedFiles) => {
        if (acceptedFiles.length > 0) {
            setFile(acceptedFiles[0]);
            setShowUploadModal(true);
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { "text/csv": [".csv"] },
        noClick: true,
        noKeyboard: true,
    });

    const handleSubmitUpload = async (e) => {
        e.preventDefault();
        if (!file) {
            showToast("Please select a file to upload", "warning");
            return;
        }
        if (!projectName.trim()) {
            showToast("Project name is required", "warning");
            return;
        }
        if (!projectDescription.trim()) {
            showToast("Project description is required", "warning");
            return;
        }

        setUploading(true);
        try {
            const data = await uploadProject(file, projectName, projectDescription);
            if (data.project_id) {
                showToast("Dataset uploaded successfully!", "success");
                navigate(`/workspace/${data.project_id}`);
            } else {
                showToast("Error: Project ID is undefined.", "error");
            }
        } catch {
            showToast("Error uploading file. Please try again.", "error");
        } finally {
            setUploading(false);
            setShowUploadModal(false);
            fetchRecentProjects();
        }
    };

    const handleDeleteConfirm = async () => {
        try {
            await deleteProject(deleteConfirm.projectId);
            showToast("Project deleted successfully", "success");
            fetchRecentProjects();
        } catch {
            showToast("Failed to delete project", "error");
        }
        setDeleteConfirm({ open: false, projectId: null });
    };

    const filteredProjects = recentProjects.filter(
        (p) =>
            p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div {...getRootProps()} className="max-w-7xl mx-auto space-y-6 animate-fade-in relative">
            <input {...getInputProps()} />

            {/* Drag overlay */}
            {isDragActive && (
                <div className="fixed inset-0 z-50 bg-surface-950/80 backdrop-blur-sm flex items-center justify-center">
                    <div className="glass-card gradient-border p-12 text-center animate-scale-in">
                        <CloudUpload className="w-16 h-16 text-brand-400 mx-auto mb-4 animate-float" />
                        <h3 className="text-xl font-bold text-white mb-2">
                            Drop your CSV here
                        </h3>
                        <p className="text-surface-400">
                            Release to upload your dataset
                        </p>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Dataset Explorer</h1>
                    <p className="text-surface-400 text-sm mt-1">
                        Manage and explore your datasets
                    </p>
                </div>
                <button
                    onClick={() => setShowUploadModal(true)}
                    className="btn-primary flex items-center gap-2"
                    id="dataset-upload-btn"
                >
                    <Plus className="w-4 h-4" />
                    New Dataset
                </button>
            </div>

            {/* Search + View Toggle */}
            <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
                    <input
                        type="text"
                        placeholder="Search datasets..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="input-field pl-10"
                        id="dataset-search"
                    />
                </div>
                <div className="flex items-center bg-surface-800/60 rounded-xl border border-surface-700/50 p-1">
                    <button
                        onClick={() => setViewMode("grid")}
                        className={`p-2 rounded-lg transition-all duration-200 ${viewMode === "grid"
                            ? "bg-brand-500/20 text-brand-400"
                            : "text-surface-400 hover:text-surface-200"
                            }`}
                        aria-label="Grid view"
                    >
                        <Grid3X3 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setViewMode("list")}
                        className={`p-2 rounded-lg transition-all duration-200 ${viewMode === "list"
                            ? "bg-brand-500/20 text-brand-400"
                            : "text-surface-400 hover:text-surface-200"
                            }`}
                        aria-label="List view"
                    >
                        <List className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Drag-and-drop zone */}
            <button
                onClick={() => setShowUploadModal(true)}
                className="w-full border-2 border-dashed border-surface-700/60 hover:border-brand-500/50 rounded-2xl p-8 text-center transition-all duration-300 hover:bg-brand-500/5 group"
                id="dataset-dropzone"
            >
                <Upload className="w-8 h-8 text-surface-500 group-hover:text-brand-400 mx-auto mb-3 transition-colors" />
                <p className="text-surface-300 font-medium">
                    Drag & drop a CSV file here
                </p>
                <p className="text-surface-500 text-sm mt-1">
                    or click to browse files
                </p>
            </button>

            {/* Projects Grid/List */}
            {loading ? (
                <div className={viewMode === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" : "space-y-2"}>
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className={`shimmer rounded-2xl ${viewMode === "grid" ? "h-40" : "h-16"}`} />
                    ))}
                </div>
            ) : filteredProjects.length === 0 ? (
                <div className="text-center py-16">
                    <Database className="w-16 h-16 text-surface-700 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-surface-300">
                        {searchQuery ? "No matching datasets" : "No datasets yet"}
                    </h3>
                    <p className="text-surface-500 mt-2 max-w-sm mx-auto text-sm">
                        {searchQuery
                            ? "Try a different search term"
                            : "Upload a CSV file to start exploring and transforming your data"}
                    </p>
                </div>
            ) : viewMode === "grid" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredProjects.map((project) => (
                        <div
                            key={project.project_id}
                            className="glass-card-hover p-5 flex flex-col gap-3 relative group animate-fade-in-up cursor-pointer"
                            onClick={() => navigate(`/workspace/${project.project_id}`)}
                            id={`project-card-${project.project_id}`}
                        >
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteConfirm({
                                        open: true,
                                        projectId: project.project_id,
                                    });
                                }}
                                className="absolute top-3 right-3 p-1.5 rounded-lg text-surface-500 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-all duration-200"
                                aria-label="Delete project"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>

                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500/20 to-violet-500/20 flex items-center justify-center">
                                <FileSpreadsheet className="w-5 h-5 text-brand-400" />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-sm font-semibold text-surface-200 truncate group-hover:text-white transition-colors">
                                    {project.name}
                                </h3>
                                {project.description && (
                                    <p className="text-xs text-surface-500 line-clamp-2 mt-1">
                                        {project.description}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-auto pt-2 border-t border-surface-800/40">
                                <Clock className="w-3 h-3 text-surface-600" />
                                <span className="text-xs text-surface-500">
                                    {new Date(project.last_modified).toLocaleDateString(
                                        undefined,
                                        { month: "short", day: "numeric", year: "numeric" }
                                    )}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="space-y-2">
                    {filteredProjects.map((project) => (
                        <button
                            key={project.project_id}
                            onClick={() => navigate(`/workspace/${project.project_id}`)}
                            className="w-full flex items-center gap-4 p-4 glass-card-hover group animate-fade-in-up"
                            id={`project-list-${project.project_id}`}
                        >
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-brand-500/20 to-cyan-500/20 flex items-center justify-center flex-shrink-0">
                                <FileSpreadsheet className="w-5 h-5 text-brand-400" />
                            </div>
                            <div className="flex-1 min-w-0 text-left">
                                <p className="text-sm font-medium text-surface-200 truncate group-hover:text-white transition-colors">
                                    {project.name}
                                </p>
                                {project.description && (
                                    <p className="text-xs text-surface-500 truncate mt-0.5">
                                        {project.description}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                <Clock className="w-3.5 h-3.5 text-surface-500" />
                                <span className="text-xs text-surface-500">
                                    {new Date(project.last_modified).toLocaleDateString(
                                        undefined,
                                        { month: "short", day: "numeric" }
                                    )}
                                </span>
                            </div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteConfirm({
                                        open: true,
                                        projectId: project.project_id,
                                    });
                                }}
                                className="p-1.5 rounded-lg text-surface-500 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-all"
                                aria-label="Delete project"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </button>
                    ))}
                </div>
            )}

            {/* Upload Modal */}
            {showUploadModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={() => setShowUploadModal(false)}
                    />
                    <div className="glass-card w-full max-w-lg z-50 animate-scale-in overflow-hidden">
                        <div className="px-6 py-5 border-b border-surface-800/60">
                            <h2 className="text-lg font-semibold text-white">
                                Upload New Dataset
                            </h2>
                            <p className="text-sm text-surface-400 mt-1">
                                Import a CSV file to start transforming
                            </p>
                        </div>

                        <form onSubmit={handleSubmitUpload} className="p-6 space-y-5">
                            {/* Project Name */}
                            <div>
                                <label className="block text-sm font-medium text-surface-300 mb-2">
                                    Project Name
                                </label>
                                <input
                                    type="text"
                                    value={projectName}
                                    onChange={(e) => setProjectName(e.target.value)}
                                    placeholder="My Dataset"
                                    className="input-field"
                                    id="upload-project-name"
                                />
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-sm font-medium text-surface-300 mb-2">
                                    Description
                                </label>
                                <textarea
                                    value={projectDescription}
                                    onChange={(e) => setProjectDescription(e.target.value)}
                                    placeholder="Describe your dataset..."
                                    rows={3}
                                    className="input-field resize-none"
                                    id="upload-project-desc"
                                />
                            </div>

                            {/* File Upload */}
                            <div>
                                <label className="block text-sm font-medium text-surface-300 mb-2">
                                    CSV File
                                </label>
                                <label
                                    className="flex flex-col items-center gap-3 p-6 border-2 border-dashed border-surface-600/50 rounded-xl hover:border-brand-500/50 hover:bg-brand-500/5 transition-all duration-200 cursor-pointer"
                                    htmlFor="file-upload"
                                >
                                    <Upload className="w-8 h-8 text-surface-400" />
                                    {file ? (
                                        <div className="text-center">
                                            <p className="text-sm font-medium text-brand-400">
                                                {file.name}
                                            </p>
                                            <p className="text-xs text-surface-500 mt-1">
                                                {(file.size / 1024).toFixed(1)} KB
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="text-center">
                                            <p className="text-sm text-surface-300">
                                                Click to select a file
                                            </p>
                                            <p className="text-xs text-surface-500 mt-1">
                                                CSV files only
                                            </p>
                                        </div>
                                    )}
                                </label>
                                <input
                                    id="file-upload"
                                    type="file"
                                    accept=".csv"
                                    className="hidden"
                                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                                />
                            </div>

                            {/* Actions */}
                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowUploadModal(false);
                                        setFile(null);
                                        setProjectName("");
                                        setProjectDescription("");
                                    }}
                                    className="btn-secondary"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={uploading}
                                    className="btn-primary flex items-center gap-2"
                                    id="upload-submit-btn"
                                >
                                    {uploading ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Uploading...
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="w-4 h-4" />
                                            Upload
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            <ConfirmDialog
                isOpen={deleteConfirm.open}
                message="Are you sure you want to delete this project? This action cannot be undone."
                onConfirm={handleDeleteConfirm}
                onCancel={() => setDeleteConfirm({ open: false, projectId: null })}
            />
        </div>
    );
}
