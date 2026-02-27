import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { uploadProject, getRecentProjects, deleteProject } from "../api";
import { useToast } from "../context/ToastContext";
import ConfirmDialog from "./common/ConfirmDialog";

const ProjectCard = ({ project, onClick, onDelete }) => {
  const modified = new Date(project.last_modified).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <button
      onClick={onClick}
      className="relative flex flex-col items-start gap-2 rounded-lg border border-gray-200 bg-white p-5 text-left shadow-sm transition-all duration-200 hover:border-blue-300 hover:shadow-md"
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(project.project_id);
        }}
        className="absolute top-2 right-2 text-gray-400 hover:text-red-500 transition-colors duration-150 p-1 rounded-md hover:bg-red-50"
        aria-label="Delete project"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      <h3 className="text-lg font-semibold text-gray-900 truncate w-full pr-6">{project.name}</h3>
      {project.description && (
        <p className="text-sm text-gray-500 line-clamp-2">{project.description}</p>
      )}
      <span className="mt-auto text-xs text-gray-400">{modified}</span>
    </button>
  );
};

const NewProjectCard = ({ onClick }) => (
  <button
    onClick={onClick}
    className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-blue-300 bg-blue-50 p-5 text-center transition-all duration-200 hover:border-blue-500 hover:bg-blue-100"
  >
    <span className="text-3xl leading-none text-blue-500">+</span>
    <span className="text-sm font-medium text-blue-600">New Project</span>
  </button>
);

const EmptyState = ({ onClick }) => (
  <div className="flex flex-col items-center justify-center py-16 px-6 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-center">
    <div className="mb-4 flex items-center justify-center w-16 h-16 rounded-full bg-blue-50">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 11v4m-2-2h4" />
      </svg>
    </div>
    <h3 className="text-lg font-semibold text-gray-800 mb-1">No projects yet</h3>
    <p className="text-sm text-gray-500 mb-6 max-w-xs">
      Upload a CSV file to get started. Your recent projects will appear here.
    </p>
    <button
      onClick={onClick}
      className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors duration-150 shadow-sm"
    >
      Create your first project
    </button>
  </div>
);

const HomeScreen = () => {
  const [showModal, setShowModal] = useState(false);
  const [fileUpload, setFileUpload] = useState(null);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [recentProjects, setRecentProjects] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, projectId: null });
  const navigate = useNavigate();
  const { showToast } = useToast();

  useEffect(() => {
    fetchRecentProjects();
  }, []);

  const fetchRecentProjects = async () => {
    try {
      const response = await getRecentProjects();
      setRecentProjects(response);
    } catch (error) {
      console.error("Error fetching recent projects:", error);
    }
  };

  const handleNewProjectClick = () => {
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
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
      console.error("Error uploading file:", error);
      showToast("Error uploading file. Please try again.", "error");
    }

    setShowModal(false);
    fetchRecentProjects();
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    setFileUpload(file);
  };

  const handleDeleteClick = (projectId) => {
    setDeleteConfirm({ open: true, projectId });
  };

  const handleDeleteConfirm = async () => {
    try {
      await deleteProject(deleteConfirm.projectId);
      showToast("Project deleted successfully", "success");
      fetchRecentProjects();
    } catch (error) {
      console.error("Error deleting project:", error);
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

  return (
    <div className="flex flex-col items-center min-h-screen bg-white px-6 pt-24">
      <div className="w-full max-w-4xl">
        <h1 className="text-5xl text-gray-900">
          Welcome to <span className="text-blue-500 font-bold">DataLoom</span>,
        </h1>
        <p className="text-4xl mt-2 text-gray-900">
          your one-stop for{" "}
          <span className="text-gray-900 font-semibold">
            Dataset Transformations
          </span>
          .
        </p>

        <div className="flex items-center justify-between mt-12 mb-4">
          <h2 className="text-lg font-medium text-gray-700">Recent Projects</h2>
          {recentProjects.length > 0 && (
            <button
              onClick={handleNewProjectClick}
              className="px-4 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors duration-150"
            >
              + New Project
            </button>
          )}
        </div>

        {recentProjects.length === 0 ? (
          <EmptyState onClick={handleNewProjectClick} />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <NewProjectCard onClick={handleNewProjectClick} />
            {recentProjects.map((project) => (
              <ProjectCard
                key={project.project_id}
                project={project}
                onClick={() => handleRecentProjectClick(project.project_id)}
                onDelete={handleDeleteClick}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={deleteConfirm.open}
        message="Are you sure you want to delete this project? This action cannot be undone."
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="fixed inset-0 bg-black/50" onClick={handleCloseModal}></div>
          <div className="bg-white rounded-xl shadow-xl p-8 z-50 max-w-lg w-full mx-4">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">New Project</h2>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sales Analysis Q1"
                  className="block w-full text-sm text-gray-900 border border-gray-300 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  placeholder="Brief description of this dataset"
                  className="block w-full text-sm text-gray-900 border border-gray-300 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  onChange={(e) => setProjectDescription(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Upload Dataset <span className="text-gray-400 font-normal">(CSV)</span>
                </label>
                <input
                  type="file"
                  accept=".csv"
                  className="block w-full text-sm text-gray-900 border border-gray-300 rounded-md px-3 py-2 bg-white cursor-pointer focus:outline-none"
                  onChange={handleFileUpload}
                />
              </div>
            </div>
            <div className="flex flex-row justify-end gap-3 mt-6">
              <button
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md text-sm font-medium transition-colors duration-150"
                onClick={handleCloseModal}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md text-sm font-medium transition-colors duration-150"
                onClick={handleSubmitModal}
              >
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeScreen;
