import { useState } from "react";
import PropTypes from "prop-types";
import { transformProject } from "../../api";
import TransformResultPreview from "./TransformResultPreview";

const DropDuplicateForm = ({ projectId, onClose, onTransform }) => {
  const [columns, setColumns] = useState("");
  const [keep, setKeep] = useState("first");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const transformationInput = {
      operation_type: "dropDuplicate",
      drop_duplicate: {
        columns: columns,
        keep: keep,
      },
    };

    try {
      const response = await transformProject(
        projectId,
        transformationInput
      );
      onTransform(response);
      setResult(response);
    } catch (err) {
      setError(err.response?.data?.detail || "An unexpected error occurred.");
    } finally {
      setLoading(false);
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
        {error && (
          <div className="mb-3 px-3 py-2 bg-red-50 border border-red-300 text-red-700 rounded-md text-sm">
            {error}
          </div>
        )}
        <div className="flex justify-between">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md font-medium transition-colors duration-150"
          >
            {loading ? "Applying..." : "Submit"}
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
      {result && <TransformResultPreview columns={result.columns} rows={result.rows} />}
    </div>
  );
};

DropDuplicateForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onTransform: PropTypes.func.isRequired,
};

export default DropDuplicateForm;
