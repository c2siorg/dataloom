import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { uploadDataset } from '../api';

const CreateProjectModal = ({ isOpen, onClose }) => {
  const [fileUpload, setFileUpload] = useState(null);
  const [formData, setFormData] = useState({
    projectName: "",
    projectDescription: ""
  });
  const [errors, setErrors] = useState({});
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // React Query mutation for uploading dataset
  const uploadMutation = useMutation({
    mutationFn: async ({ file, projectName, projectDescription }) => {
      return await uploadDataset(file, projectName, projectDescription);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(["recentProjects"]);
      toast.success("Project created successfully!");
      onClose();
      navigate("/data", { state: { datasetId: data.dataset_id, apiData: data } });
    },
    onError: (error) => {
      toast.error("Error creating project: " + error.message);
    },
  });

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateProjectModal;