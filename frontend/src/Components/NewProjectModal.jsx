import { useState } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const NewProjectModal = ({ isOpen, onClose, onSubmit }) => {
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [fileUpload, setFileUpload] = useState(null);
  const [errors, setErrors] = useState({});
  const [isDragging, setIsDragging] = useState(false);

  const validateField = (field, value) => {
    let newErrors = { ...errors };
    switch (field) {
      case "projectName":
        if (!value.trim()) newErrors.projectName = "Project Name is required";
        else delete newErrors.projectName;
        break;
      case "projectDescription":
        if (!value.trim()) newErrors.projectDescription = "Project Description is required";
        else delete newErrors.projectDescription;
        break;
      case "fileUpload":
        if (!value) newErrors.fileUpload = "Please select a file to upload";
        else delete newErrors.fileUpload;
        break;
      default:
        break;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const isValid = validateField("projectName", projectName) && 
                    validateField("projectDescription", projectDescription) && 
                    validateField("fileUpload", fileUpload);
    if (!isValid) {
      const errorField = Object.keys(errors)[0];
      toast.error(errors[errorField], { position: "top-center" });
      return;
    }

    onSubmit({ fileUpload, projectName, projectDescription });
    setProjectName("");
    setProjectDescription("");
    setFileUpload(null);
    setErrors({});
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setFileUpload(file);
    validateField("fileUpload", file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    setFileUpload(file);
    validateField("fileUpload", file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="fixed inset-0 bg-black opacity-50" onClick={onClose}></div>
      <div className="bg-white rounded-lg p-8 shadow-xl z-50 w-full max-w-md">
        <h2 className="text-xl font-bold text-[#2D3748] mb-2">Project Name</h2>
        <input
          type="text"
          className={`w-full p-2 text-base border rounded-lg focus:outline-none focus:border-[#4A90E2] mb-2 ${
            errors.projectName ? "border-[#E53E3E] animate-shake" : "border-[#E2E8F0]"
          }`}
          value={projectName}
          onChange={(e) => {
            setProjectName(e.target.value);
            validateField("projectName", e.target.value);
          }}
        />
        {errors.projectName && (
          <p className="text-[#E53E3E] text-sm flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {errors.projectName}
          </p>
        )}

        <h2 className="text-xl font-bold text-[#2D3748] mt-4 mb-2">Upload Dataset</h2>
        <div
          className={`w-full p-4 border-2 rounded-lg text-base ${
            isDragging ? "border-[#4A90E2] bg-[#E2E8F0]" : errors.fileUpload ? "border-[#E53E3E] animate-shake" : "border-[#E2E8F0] hover:border-[#4A90E2]"
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <input
            type="file"
            className="hidden"
            id="fileUpload"
            onChange={handleFileChange}
          />
          <label
            htmlFor="fileUpload"
            className="flex flex-col items-center justify-center cursor-pointer text-[#2D3748]"
          >
            {fileUpload ? (
              <span className="text-sm truncate max-w-full">{fileUpload.name}</span>
            ) : (
              <>
                <svg className="w-8 h-8 mb-2 text-[#718096]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 0116 8a5 5 0 014.9 4H17a3 3 0 00-3 3v1m-7-4v4m0 0l-3-3m3 3l3-3" />
                </svg>
                <span>Drag & drop or click to upload</span>
              </>
            )}
          </label>
        </div>
        {errors.fileUpload && (
          <p className="text-[#E53E3E] text-sm flex items-center gap-1 mt-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {errors.fileUpload}
          </p>
        )}

        <h2 className="text-xl font-bold text-[#2D3748] mt-4 mb-2">Project Description</h2>
        <input
          type="text"
          className={`w-full p-2 text-base border rounded-lg focus:outline-none focus:border-[#4A90E2] mb-2 ${
            errors.projectDescription ? "border-[#E53E3E] animate-shake" : "border-[#E2E8F0]"
          }`}
          value={projectDescription}
          onChange={(e) => {
            setProjectDescription(e.target.value);
            validateField("projectDescription", e.target.value);
          }}
        />
        {errors.projectDescription && (
          <p className="text-[#E53E3E] text-sm flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {errors.projectDescription}
          </p>
        )}

        <div className="flex justify-end gap-4 mt-6">
          <button
            className="px-4 py-2 bg-[#50C878] text-white rounded-lg hover:bg-[#429E66] transition-all"
            onClick={handleSubmit}
          >
            Submit
          </button>
          <button
            className="px-4 py-2 bg-[#718096] text-white rounded-lg hover:bg-[#5A6678] transition-all"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
      <ToastContainer position="top-center" autoClose={3000} hideProgressBar />
    </div>
  );
};

export default NewProjectModal;