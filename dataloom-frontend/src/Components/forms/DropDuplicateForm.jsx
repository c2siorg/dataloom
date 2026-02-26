import { useState } from "react";
import PropTypes from "prop-types";
import { useTransform } from "../../hooks/useTransform";
import ErrorAlert from "../ui/ErrorAlert";

const DropDuplicateForm = ({ projectId, onClose, onTransform }) => {
  const [columns, setColumns] = useState("");
  const [keep, setKeep] = useState("first");

  const { applyTransform, error } = useTransform(projectId, (columns, rows) => {
    onTransform({ columns, rows });
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const transformationInput = {
      operation_type: "dropDuplicate",
      drop_duplicate: {
        columns: columns,
        keep: keep,
      },
    };

    const result = await applyTransform(transformationInput);
    // Only close if transformation succeeded
    if (result) {
      onClose();
    }
  };

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <form onSubmit={handleSubmit}>
        <h3 className="font-semibold text-gray-900 mb-2">Drop Duplicate</h3>
        <div className="flex space-x-2 mb-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700">Columns:</label>
            <input
              type="text"
              value={columns}
              onChange={(e) => setColumns(e.target.value)}
              className="border border-gray-300 rounded-md w-full px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
              placeholder="e.g., col1,col2"
              required
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700">Keep:</label>
            <select
              value={keep}
              onChange={(e) => setKeep(e.target.value)}
              className="border border-gray-300 rounded-md w-full px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
            >
              <option value="first">First</option>
              <option value="last">Last</option>
            </select>
          </div>
        </div>
        <div className="flex justify-between">
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

        {/* Consistent error positioning with proper spacing */}
        {error && <div className="mt-4"><ErrorAlert message={error} /></div>}
      </form>
    </div>
  );
};

DropDuplicateForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onTransform: PropTypes.func.isRequired,
};

export default DropDuplicateForm;
