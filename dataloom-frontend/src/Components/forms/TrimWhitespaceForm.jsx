import { useState } from "react";
import PropTypes from "prop-types";
import { transformProject } from "../../api";
import { TRIM_WHITESPACE } from "../../constants/operationTypes";
import { useProjectContext } from "../../context/ProjectContext";
import { useToast } from "../../context/ToastContext";

const TrimWhitespaceForm = ({ projectId, onClose, onTransform }) => {
  const { columns } = useProjectContext();
  const { showToast } = useToast();

  const [column, setColumn] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await transformProject(projectId, {
        operation_type: TRIM_WHITESPACE,
        trim_whitespace_params: {
          column,
        },
      });

      onTransform(response);
    } catch (error) {
      console.error("Error trimming whitespace:", error);

      showToast(error.response?.data?.detail || "Failed to trim whitespace.", "error");
    }

    onClose();
  };

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <form onSubmit={handleSubmit}>
        <h3 className="font-semibold text-gray-900 mb-2">Trim Whitespace</h3>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700">Column:</label>
          <select
            value={column}
            onChange={(e) => setColumn(e.target.value)}
            className="border border-gray-300 rounded-md w-full px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
            required
          >
            <option value="">Select column...</option>
            <option value="All string columns">All string columns</option>
            {columns.map((col) => (
              <option key={col} value={col}>
                {col}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-between">
          <button
            type="submit"
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md font-medium transition-colors duration-150"
          >
            Apply
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
    </div>
  );
};

TrimWhitespaceForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onTransform: PropTypes.func.isRequired,
};

export default TrimWhitespaceForm;
