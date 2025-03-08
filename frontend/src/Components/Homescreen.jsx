import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { uploadDataset, getRecentProjects, getDatasetDetails } from "../api.js";
import NewProjectModal from "./NewProjectModal.jsx";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const HomeScreen = () => {
  const [showModal, setShowModal] = useState(false);
  const [recentProjects, setRecentProjects] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchRecentProjects();
  }, []);

  const fetchRecentProjects = async () => {
    try {
      const response = await getRecentProjects();
      setRecentProjects(response.data);
    } catch (error) {
      console.error("Error fetching recent projects:", error);
      toast.error("Failed to fetch recent projects.");
    }
  };

  const handleNewProjectClick = () => setShowModal(true);
  const handleCloseModal = () => setShowModal(false);

  const handleSubmitModal = async (formData) => {
    const { fileUpload, projectName, projectDescription } = formData;
    try {
      const data = await uploadDataset(fileUpload, projectName, projectDescription);
      const datasetId = data.dataset_id;
      if (datasetId) {
        toast.success("Dataset uploaded successfully!");
        navigate("/data", { state: { datasetId, apiData: data } });
      } else {
        throw new Error("Dataset ID is undefined");
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      toast.error("Error uploading file. Please try again.");
    }
    setShowModal(false);
    fetchRecentProjects();
  };

  const handleRecentProjectClick = async (datasetId) => {
    try {
      const data = await getDatasetDetails(datasetId);
      navigate("/data", { state: { datasetId, apiData: data } });
    } catch (error) {
      console.error("Error fetching dataset details:", error);
      toast.error("Error fetching dataset details.");
    }
  };

  const defaultProjectNames = ["No Project", "No Project", "No Project"];
  const projectNames = recentProjects
    .map((project) => project.name)
    .concat(defaultProjectNames)
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-12">
        <h1 className="font-poppins text-4xl md:text-6xl text-gray-900 font-bold mb-6 leading-tight">
          Welcome to <br className="hidden md:block" />
          <span className="text-blue-400">DataLoom</span>
        </h1>
        <h2 className="text-3xl font-medium text-[#2D3748] mt-2">
          Your one-stop for{" "}
          <span className="text-[#50C878]">Dataset Transformations</span>
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-4 w-full max-w-md">
        <button
          className="px-4 py-3 bg-[#4A90E2] text-white text-lg font-medium rounded-lg shadow-md hover:bg-[#2B6CB0] transition-all hover:scale-105"
          onClick={handleNewProjectClick}
        >
          New Project
        </button>
        {projectNames.map((name, index) => (
          <button
            key={index}
            className="px-4 py-3 bg-white text-[#2D3748] text-lg font-medium rounded-lg shadow-md hover:bg-[#E2E8F0] transition-all hover:scale-105"
            onClick={() => handleRecentProjectClick(recentProjects[index]?.dataset_id)}
          >
            {name}
          </button>
        ))}
      </div>

      {showModal && (
        <NewProjectModal isOpen={showModal} onClose={handleCloseModal} onSubmit={handleSubmitModal} />
      )}
      
      <ToastContainer position="top-center" autoClose={3000} hideProgressBar />
    </div>
  );
};

export default HomeScreen;
