import { useState } from "react";
import PropTypes from "prop-types";
import { createFormulaColumn } from "../api";
import { useProjectContext } from "../context/ProjectContext";
import FormErrorAlert from "./common/FormErrorAlert";
import useError from "../hooks/useError";

const FormulaPanel = ({ projectId, onClose, onTransform }) => {
  const { columns } = useProjectContext();
  const [name, setName] = useState("");
  const [expression, setExpression] = useState("");
  const [loading, setLoading] = useState(false);
  const { error, clearError, handleError } = useError();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    clearError();
    try {
      const response = await createFormulaColumn(projectId, { name, expression });
      onTransform(response);
      onClose();
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <form onSubmit={handleSubmit}>
        <h3 className="font-semibold text-gray-900 mb-2">Add Formula Column</h3>
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Column Name:</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border border-gray-300 rounded-md w-full px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
            placeholder="e.g., total_price"
            required
          />
        </div>
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Expression:</label>
          <input
            type="text"
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            className="border border-gray-300 rounded-md w-full px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
            placeholder="e.g., quantity * unit_price"
            required
          />
          <p className="text-xs text-gray-400 mt-1">
            Available columns: {columns.join(", ")}
          </p>
        </div>
        <div className="flex justify-between">
          <button
            type="submit"
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md font-medium transition-colors duration-150"
            disabled={loading}
          >
            {loading ? "Creating..." : "Create Column"}
          </button>
          <button type="button" onClick={onClose} className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-md font-medium transition-colors duration-150">
            Cancel
          </button>
        </div>
      </form>
      <FormErrorAlert message={error} />
    </div>
  );
};

FormulaPanel.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onTransform: PropTypes.func.isRequired,
};

export default FormulaPanel;
