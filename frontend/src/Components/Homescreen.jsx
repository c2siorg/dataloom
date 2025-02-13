import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { uploadDataset, getRecentProjects, getDatasetDetails } from "../api.js";

const HomeScreen = () => {
  const [showModal, setShowModal] = useState(false);
  const [fileUpload, setFileUpload] = useState(null);
  const [formData, setFormData] = useState({
    projectName: "",
    projectDescription: ""
  });
  const [errors, setErrors] = useState({});
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // React Query for fetching recent projects
  const { data: recentProjects = [] } = useQuery({
    queryKey: ["recentProjects"],
    queryFn: async () => {
      const response = await getRecentProjects();
      return response.data;
    },
  });

  // React Query mutation for uploading dataset
  const uploadMutation = useMutation({
    mutationFn: async ({ file, projectName, projectDescription }) => {
      return await uploadDataset(file, projectName, projectDescription);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(["recentProjects"]);
      toast.success("Project created successfully!");
      setShowModal(false);
      navigate("/data", { state: { datasetId: data.dataset_id, apiData: data } });
    },
    onError: (error) => {
      toast.error("Error creating project: " + error.message);
    },
  });

  const handleNewProjectClick = () => setShowModal(true);
  const handleCloseModal = () => {
    setShowModal(false);
    setFormData({ projectName: "", projectDescription: "" });
    setErrors({});
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.projectName.trim()) {
      newErrors.projectName = "Project name is required";
    }
    if (!formData.projectDescription.trim()) {
      newErrors.projectDescription = "Project description is required";
    }
    if (!fileUpload) {
      newErrors.file = "Please select a file to upload";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    uploadMutation.mutate({
      file: fileUpload,
      projectName: formData.projectName,
      projectDescription: formData.projectDescription,
    });
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    setFileUpload(file);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleRecentProjectClick = async (datasetId) => {
    if (!datasetId) {
      toast.error("No project selected");
      return;
    }

    try {
      const data = await getDatasetDetails(datasetId);
      navigate("/data", { state: { datasetId, apiData: data } });
    } catch (error) {
      toast.error("Error fetching project details");
    }
  };

  // Default project names for buttons
  const defaultProjectNames = ["No Project", "No Project", "No Project"];
  const projectNames = recentProjects
    .map((project) => project.name)
    .concat(defaultProjectNames)
    .slice(0, 3);

  return (
    <div className="flex flex-col mr-64 mt-32 items-center min-h-screen bg-white">
      <div>
        <h1 className="text-5xl">
          Welcome to{" "}
          <span className="text-blue-600 font-semibold">DataLoom</span>
        </h1>
        <h1 className="text-4xl mt-2">
          your one-stop for{" "}
          <span className="text-green-600 font-semibold">
            Dataset Transformations
          </span>
        </h1>
      </div>

      <div className="mt-20 mr-32 grid grid-cols-2 gap-10 justify-start w-2/5">
        <button
          className="h-16 text-lg bg-gradient-to-r from-green-400 to-blue-500 hover:from-green-500 hover:to-blue-600 text-white rounded-lg"
          onClick={handleNewProjectClick}
        >
          New Project
        </button>
        {[0, 1, 2].map((index) => (
          <button
            key={index}
            className="h-16 text-lg bg-gradient-to-r from-green-400 to-blue-500 hover:from-green-500 hover:to-blue-600 text-white rounded-lg"
            onClick={() => handleRecentProjectClick(recentProjects[index]?.dataset_id)}
          >
            {projectNames[index]}
          </button>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-8 max-w-md w-full">
            <h2 className="text-2xl font-bold mb-6">Create New Project</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project Name
                </label>
                <input
                  type="text"
                  name="projectName"
                  value={formData.projectName}
                  onChange={handleInputChange}
                  placeholder="Enter project name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
                {errors.projectName && (
                  <p className="text-red-500 text-sm mt-1">{errors.projectName}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Upload Dataset
                </label>
                <input
                  type="file"
                  onChange={handleFileUpload}
                  className="w-full cursor-pointer"
                />
                {errors.file && (
                  <p className="text-red-500 text-sm mt-1">{errors.file}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project Description
                </label>
                <textarea
                  name="projectDescription"
                  value={formData.projectDescription}
                  onChange={handleInputChange}
                  placeholder="Enter project description"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md resize-none h-32"
                />
                {errors.projectDescription && (
                  <p className="text-red-500 text-sm mt-1">{errors.projectDescription}</p>
                )}
              </div>

              <div className="flex justify-end gap-4 mt-6">
                <button
                  type="submit"
                  disabled={uploadMutation.isLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {uploadMutation.isLoading ? "Creating..." : "Create Project"}
                </button>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeScreen;