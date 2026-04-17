import { useState } from "react";
import PropTypes from "prop-types";
import { transformProject } from "../../api";
import { DROP_NA } from "../../constants/operationTypes";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";

const DropNaForm = ({ projectId, onClose, onTransform }) => {
  const [mode, setMode] = useState("all");
  const [columns, setColumns] = useState("");
  const { error, clearError, handleError } = useError();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const transformationInput = {
      operation_type: DROP_NA,
      drop_na_params: {
        columns: mode === "all" ? null : columns,
      },
    };

    clearError();
    try {
      const response = await transformProject(projectId, transformationInput);
      console.log("Transformation response:", response);
      onTransform(response); // Pass data to parent component
      onClose(); // Close the form after submission
    } catch (err) {
      console.error("Error transforming project:", err);
      handleError(err);
    }
  };

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <h3 className="font-semibold text-gray-900 mb-1">Drop Missing Values</h3>
          <p className="text-sm text-gray-500 mb-4">
            Remove rows that contain empty or NaN values.
          </p>

          <div className="flex space-x-4 mb-3">
            <label className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="radio"
                checked={mode === "all"}
                onChange={() => setMode("all")}
                className="text-blue-500 focus:ring-blue-500 w-4 h-4 cursor-pointer"
              />
              <span>All columns</span>
            </label>
            <label className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="radio"
                checked={mode === "specific"}
                onChange={() => setMode("specific")}
                className="text-blue-500 focus:ring-blue-500 w-4 h-4 cursor-pointer"
              />
              <span>Specific columns</span>
            </label>
          </div>

          {mode === "specific" && (
            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Columns:</label>
              <input
                type="text"
                value={columns}
                onChange={(e) => setColumns(e.target.value)}
                className="border border-gray-300 rounded-md w-full px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
                placeholder="e.g., col1,col2"
                required={mode === "specific"}
              />
            </div>
          )}
        </div>

        <div className="flex justify-between mt-4">
          <button
            type="submit"
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md font-medium transition-colors duration-150"
          >
            Submit
          </button>
          <button
            type="button"
            onClick={onClose}
            className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-md font-medium transition-colors duration-150"
          >
            Cancel
          </button>
        </div>
      </form>
      <FormErrorAlert message={error} />
    </div>
  );
};

DropNaForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onTransform: PropTypes.func.isRequired,
};

export default DropNaForm;
