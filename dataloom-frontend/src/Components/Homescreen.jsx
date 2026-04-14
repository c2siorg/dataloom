import { useState, useEffect, useCallback,useRef } from "react";
import { useNavigate } from "react-router-dom";
import { LuPlus, LuTable2, LuUpload } from "react-icons/lu";
import { uploadProject, getRecentProjects, deleteProject, renameProject } from "../api";
import { useToast } from "../context/ToastContext";
import ConfirmDialog from "./common/ConfirmDialog";
import InputDialog from "./common/InputDialog";

function formatFileSize(bytes) {
  if (bytes == null || bytes === 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

function formatShortDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const ProjectCard = ({
  project,
  isMenuOpen,
  onToggleMenu,
  onOpenProject,
  onRename,
  onDeleteRequest,
}) => {
  const created = project.upload_date || project.last_modified;
  const rows = project.row_count ?? 0;
  const cols = project.column_count ?? 0;
  const sizeBytes = project.file_size_bytes ?? 0;

  const handleKeyCard = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpenProject();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenProject}
      onKeyDown={handleKeyCard}
      className="group relative flex flex-col items-stretch gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm outline-none transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 cursor-pointer"
    >
      <div className="absolute top-2 right-2 z-10">
        <button
          type="button"
          className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="Project actions"
          aria-expanded={isMenuOpen}
          aria-haspopup="true"
          onClick={(e) => {
            e.stopPropagation();
            onToggleMenu();
          }}
        >
          <span className="block text-lg leading-none font-bold tracking-tight">⋮</span>
        </button>
        {isMenuOpen && (
          <ul
            className="absolute right-0 mt-1 min-w-[9rem] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
            role="menu"
          >
            <li>
              <button
                type="button"
                role="menuitem"
                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                onClick={(e) => {
                  e.stopPropagation();
                  onRename();
                }}
              >
                Rename
              </button>
            </li>
            <li>
              <button
                type="button"
                role="menuitem"
                className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteRequest();
                }}
              >
                Delete
              </button>
            </li>
          </ul>
        )}
      </div>

      <div className="pr-8">
        <h3 className="text-lg font-semibold text-gray-900 truncate">{project.name}</h3>
        {project.description ? (
          <p className="mt-1 text-sm text-gray-500 line-clamp-2">{project.description}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
          {rows} rows
        </span>
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
          {cols} cols
        </span>
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
          {formatFileSize(sizeBytes)}
        </span>
        <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
          Created {formatShortDate(created)}
        </span>
      </div>

      <span className="mt-auto text-xs text-gray-400 border-t border-gray-100 pt-2">
        Modified {formatShortDate(project.last_modified)}
      </span>
    </div>
  );
};

const NewProjectCard = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="group flex min-h-[11rem] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-blue-300 bg-gradient-to-b from-blue-50/80 to-white p-5 text-center transition-all duration-200 hover:border-blue-500 hover:from-blue-100/90 hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
  >
    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600 transition-colors group-hover:bg-blue-200">
      <LuPlus className="h-7 w-7" aria-hidden />
    </span>
    <span className="text-sm font-semibold text-blue-700">New Project</span>
    <span className="flex items-center gap-1.5 text-xs text-gray-500">
      <LuUpload className="h-3.5 w-3.5" aria-hidden />
      Upload a CSV
    </span>
  </button>
);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const HomeScreen = () => {
  const fileInputRef = useRef(null);
  const [showModal, setShowModal] = useState(false);
  const [fileUpload, setFileUpload] = useState(null);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [recentProjects, setRecentProjects] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, projectId: null });
  const [menuOpenFor, setMenuOpenFor] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const fetchRecentProjects = useCallback(async () => {
    try {
      const response = await getRecentProjects();
      setRecentProjects(response);
    } catch (error) {
      showToast(error?.response?.data?.detail || "Could not load projects", "error");
    }
  }, [showToast]);

  useEffect(() => {
    fetchRecentProjects();
  }, [fetchRecentProjects]);

  useEffect(() => {
    if (menuOpenFor == null) return;
    const close = () => setMenuOpenFor(null);
    const t = setTimeout(() => document.addEventListener("click", close), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", close);
    };
  }, [menuOpenFor]);

  const handleNewProjectClick = () => {
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setProjectName("");
    setProjectDescription("");
    setFileUpload(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmitModal = async (event) => {
    event.preventDefault();

    if (!fileUpload) {
      showToast("Please select a file to upload", "warning");
      return;
    }

    if (!projectName.trim()) {
      showToast("Project Name cannot be empty", "warning");
      return;
    }

    if (!projectDescription.trim()) {
      showToast("Project Description cannot be empty", "warning");
      return;
    }

    try {
      const data = await uploadProject(fileUpload, projectName, projectDescription);

      const projectId = data.project_id;

      if (projectId) {
        navigate(`/workspace/${projectId}`);
      } else {
        showToast("Error: Project ID is undefined.", "error");
      }
    } catch (error) {
      const message = error?.response?.data?.detail || "Error uploading file. Please try again.";
      showToast(message, "error");
    }

    handleCloseModal();
    fetchRecentProjects();
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file && file.size > MAX_FILE_SIZE_BYTES) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      showToast(`File too large (${sizeMB} MB). Maximum allowed size is 10 MB.`, "warning");
      event.target.value = "";
      setFileUpload(null);
      return;
    }
    setFileUpload(file);
  };

  const handleDeleteRequest = useCallback((projectId) => {
    setDeleteConfirm({ open: true, projectId });
  }, []);

  const handleDeleteConfirm = async () => {
    try {
      await deleteProject(deleteConfirm.projectId);
      showToast("Project deleted successfully", "success");
      fetchRecentProjects();
    } catch (error) {
      showToast("Failed to delete project", "error");
    }
    setDeleteConfirm({ open: false, projectId: null });
  };

  const handleDeleteCancel = () => {
    setDeleteConfirm({ open: false, projectId: null });
  };

  const handleRecentProjectClick = (projectId) => {
    if (!projectId) return;
    navigate(`/workspace/${projectId}`);
  };

  const handleRenameSubmit = async (newName) => {
    if (!renameTarget || !newName?.trim()) {
      setRenameTarget(null);
      return;
    }
    try {
      await renameProject(renameTarget.project_id, newName.trim());
      showToast("Project renamed", "success");
      fetchRecentProjects();
    } catch (error) {
      const message = error?.response?.data?.detail || "Failed to rename project";
      showToast(typeof message === "string" ? message : "Failed to rename project", "error");
    }
    setRenameTarget(null);
  };

  return (
    <div className="flex flex-col items-center min-h-screen bg-white px-6 py-24 ">
      <div className="w-full max-w-5xl">
        <h1 className="text-5xl text-gray-900">
          Welcome to <span className="text-blue-500 font-bold">DataLoom</span>,
        </h1>
        <h1 className="text-4xl mt-2 text-gray-900">
          your one-stop for{" "}
          <span className="text-gray-900 font-semibold">Dataset Transformations</span>.
        </h1>

        <h2 className="mt-12 mb-4 flex items-center gap-2 text-lg font-medium text-gray-700">
          <LuTable2 className="h-5 w-5 text-gray-500" aria-hidden />
          Projects
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <NewProjectCard onClick={handleNewProjectClick} />
          {recentProjects.map((project) => (
            <ProjectCard
              key={project.project_id}
              project={project}
              isMenuOpen={menuOpenFor === project.project_id}
              onToggleMenu={() =>
                setMenuOpenFor((prev) => (prev === project.project_id ? null : project.project_id))
              }
              onOpenProject={() => {
                setMenuOpenFor(null);
                handleRecentProjectClick(project.project_id);
              }}
              onRename={() => {
                setMenuOpenFor(null);
                setRenameTarget({ project_id: project.project_id, name: project.name });
              }}
              onDeleteRequest={() => handleDeleteRequest(project.project_id)}
            />
          ))}
        </div>

        {recentProjects.length === 0 && (
          <div className="flex flex-col items-center justify-center mt-16 text-center text-gray-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-14 w-14 mb-4 text-gray-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 10h18M3 6h18M3 14h18M3 18h18"
              />
            </svg>
            <p className="text-xl font-medium text-gray-500">No projects yet!</p>
            <p className="text-md text-gray-400 mt-1">
              Click <span className="text-blue-500 font-medium">+ New Project</span> to upload a CSV
              and get started.
            </p>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={deleteConfirm.open}
        message="Are you sure you want to delete this project? This action cannot be undone."
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />

      <InputDialog
        isOpen={!!renameTarget}
        message="Enter a new name for this project:"
        defaultValue={renameTarget?.name ?? ""}
        onSubmit={handleRenameSubmit}
        onCancel={() => setRenameTarget(null)}
      />

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="fixed inset-0 bg-black/50" onClick={handleCloseModal}></div>
          <div className="bg-white rounded-xl shadow-xl p-8 z-50 max-w-lg w-full mx-4">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Project Name</h2>
            <input
              type="text"
              className="block w-full text-lg text-gray-900 border border-gray-300 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-4"
              onChange={(e) => setProjectName(e.target.value)}
            />
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Upload Dataset</h2>
            <input
              type="file"
              ref={fileInputRef}
              className="block w-full text-lg text-gray-900 border border-gray-300 rounded-md px-3 py-2 bg-white cursor-pointer focus:outline-none mb-4"
              onChange={handleFileUpload}
            />
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Project Description</h2>
            <input
              type="text"
              className="block w-full text-lg text-gray-900 border border-gray-300 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-4"
              onChange={(e) => setProjectDescription(e.target.value)}
            />
            <div className="flex flex-row justify-between">
              <button
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md font-medium transition-colors duration-150"
                onClick={handleSubmitModal}
              >
                Submit
              </button>
              <button
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium transition-colors duration-150"
                onClick={handleCloseModal}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeScreen;
