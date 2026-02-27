import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { uploadProject, getRecentProjects, deleteProject } from "../api";
import { useToast } from "../context/ToastContext";
import ConfirmDialog from "./common/ConfirmDialog";

const ProjectCard = ({ project, onClick, onDelete }) => {
  const modified = new Date(project.last_modified).toLocaleDateString(
    undefined,
    { year: "numeric", month: "short", day: "numeric" }
  );

  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col items-start gap-3 rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition-all duration-300 hover:border-accent/30 hover:shadow-premium hover:-translate-y-1"
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(project.project_id);
        }}
        className="absolute top-3 right-3 text-slate-400 hover:text-red-500 transition-colors duration-150 p-1.5 rounded-lg hover:bg-red-50 z-10"
        aria-label="Delete project"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      </button>

      <div className="w-10 h-10 rounded-lg bg-accent/5 flex items-center justify-center group-hover:bg-accent/10 transition-colors duration-200">
        <span className="text-accent font-bold text-lg">{project.name.charAt(0).toUpperCase()}</span>
      </div>
      <div className="w-full pr-8">
        <h3 className="text-base font-semibold text-slate-900 truncate w-full group-hover:text-accent transition-colors duration-200">
          {project.name}
        </h3>
        {project.description && (
          <p className="mt-1 text-sm text-slate-500 line-clamp-2 leading-relaxed">
            {project.description}
          </p>
        )}
      </div>
      <div className="mt-auto pt-4 flex items-center justify-between w-full border-t border-slate-50">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{modified}</span>
        <span className="text-accent opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-sm font-semibold">Open →</span>
      </div>
    </button>
  );
};

const NewProjectCard = ({ onClick }) => (
  <button
    onClick={onClick}
    className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 text-center transition-all duration-300 hover:border-accent hover:bg-accent/[0.02] hover:shadow-premium group"
  >
    <div className="w-12 h-12 rounded-full border-2 border-slate-200 flex items-center justify-center group-hover:border-accent group-hover:scale-110 transition-all duration-300">
      <span className="text-2xl leading-none text-slate-400 group-hover:text-accent">+</span>
    </div>
    <span className="text-sm font-semibold text-slate-600 group-hover:text-accent">Create New Project</span>
  </button>
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
      const data = await uploadProject(
        fileUpload,
        projectName,
        projectDescription
      );
      console.log("Backend response data:", data);

      const projectId = data.project_id;
      console.log("Project ID:", projectId);

      if (projectId) {
        navigate(`/workspace/${projectId}`);
      } else {
        console.error("Project ID is undefined.");
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
    console.log(file);
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
    <div className="flex flex-col items-center min-h-screen px-6 py-12">
      <div className="w-full max-w-5xl">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-6xl font-extrabold text-slate-900 tracking-tight mb-4">
            Transform your data with{" "}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-accent to-indigo-600">
              DataLoom
            </span>
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            The professional toolset for seamless dataset transformations,
            cleaning, and analysis. All in one unified workspace.
          </p>
        </div>

        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl font-bold text-slate-800">
            Recent Projects
          </h2>
          <button className="text-sm font-semibold text-accent hover:text-accent-hover transition-colors">
            View all projects
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
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
      </div>

      <ConfirmDialog
        isOpen={deleteConfirm.open}
        message="Are you sure you want to delete this project? This action cannot be undone."
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] p-4">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
            onClick={handleCloseModal}
          ></div>
          <div className="bg-white rounded-2xl shadow-2xl p-8 z-[110] max-w-md w-full relative transform transition-all border border-slate-100">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Create New Project</h2>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Project Name</label>
                <input
                  type="text"
                  placeholder="e.g. Q4 Sales Analysis"
                  className="block w-full text-base text-slate-900 border border-slate-200 rounded-xl px-4 py-2.5 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Upload Dataset (CSV/JSON)</label>
                <div className="relative">
                  <input
                    type="file"
                    className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-accent/10 file:text-accent hover:file:bg-accent/20 cursor-pointer transition-all border border-slate-200 rounded-xl p-1"
                    onChange={handleFileUpload}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Description</label>
                <textarea
                  rows="3"
                  placeholder="Briefly describe the project goals..."
                  className="block w-full text-base text-slate-900 border border-slate-200 rounded-xl px-4 py-2.5 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all resize-none"
                  onChange={(e) => setProjectDescription(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-row gap-3 mt-8">
              <button
                className="flex-1 btn-primary"
                onClick={handleSubmitModal}
              >
                Create Project
              </button>
              <button
                className="flex-1 btn-secondary"
                onClick={handleCloseModal}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeScreen;
