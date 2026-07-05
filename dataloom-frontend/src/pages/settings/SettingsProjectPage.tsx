import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { deleteProject } from "../../api";
import { getProjectMeta, updateProject } from "../../api/projects";
import { AlertTriangle } from "lucide-react";
import Modal from "../../Components/common/Modal";
import { useToast } from "../../context/ToastContext";
import type { Project, ProjectDetails } from "./types";

export default function SettingsProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [description, setDescription] = useState("");
  const [savingDescription, setSavingDescription] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);

  const fetchProject = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = (await getProjectMeta(projectId)) as Project;
      setProject(data);
      setName(data.name || "");
      setDescription(data.description || "");
    } catch (error) {
      console.error("Error fetching project:", error);
      showToast("Failed to load project.", "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, showToast]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const handleSave = async (field: "name" | "description") => {
    const isName = field === "name";

    if (isName && !name.trim()) {
      showToast("Project name cannot be empty.", "error");
      return;
    }

    isName ? setSavingName(true) : setSavingDescription(true);

    try {
      await updateProject(projectId!, {
        ...(isName ? { name: name.trim() } : { description: description.trim() }),
      });

      setProject((prev) =>
        prev
          ? {
              ...prev,
              ...(isName ? { name: name.trim() } : { description: description.trim() }),
            }
          : prev,
      );

      showToast(isName ? "Project name updated." : "Project description updated.", "success");
    } catch {
      showToast(
        isName ? "Failed to update project name." : "Failed to update project description.",
        "error",
      );
    } finally {
      isName ? setSavingName(false) : setSavingDescription(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!projectId) return;
    setDeletingProject(true);
    try {
      await deleteProject(projectId);
      navigate("/settings");
    } catch {
      showToast("Failed to delete project.", "error");
      setDeletingProject(false);
    }
  };

  if (loading) return <p className="text-sm text-gray-500">Loading...</p>;
  if (!project) return <p className="text-sm text-gray-500">Project not found.</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-1">{project.name}</h1>
      <p className="text-sm text-gray-500 mb-8">Manage settings for this project.</p>

      <div className="space-y-6 max-w-lg">
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Project name</h2>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="block w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 mb-3"
            placeholder="Project name"
          />
          <button
            type="button"
            onClick={() => handleSave("name")}
            disabled={savingName}
            className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-60"
          >
            {savingName ? "Saving..." : "Save name"}
          </button>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Description</h2>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="block w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y mb-3"
            placeholder="Brief description of this dataset"
          />
          <button
            type="button"
            onClick={() => handleSave("description")}
            disabled={savingDescription}
            className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-60"
          >
            {savingDescription ? "Saving..." : "Save description"}
          </button>
        </section>

        <section className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Danger zone</h2>
              <p className="text-xs text-gray-500">
                Permanently delete this project and all its data.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
          >
            Delete project
          </button>
        </section>
      </div>

      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Project"
      >
        <p className="text-sm text-gray-700 mb-6">
          Are you sure you want to delete <strong>{project.name}</strong>? This will permanently
          remove all checkpoints, logs, and data. This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setShowDeleteModal(false)}
            disabled={deletingProject}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDeleteProject}
            disabled={deletingProject}
            className="px-4 py-2 text-sm text-white bg-red-500 hover:bg-red-600 rounded-md disabled:opacity-60"
          >
            {deletingProject ? "Deleting..." : "Delete project"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
