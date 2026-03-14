import { useState } from "react";
import PropTypes from "prop-types";
import { transformProject } from "../../api";
import { useProjectContext } from "../../context/ProjectContext";
import { useToast } from "../../context/ToastContext";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";

const STRATEGIES = [
  { value: "custom", label: "Custom Value" },
  { value: "mean", label: "Mean" },
  { value: "median", label: "Median" },
  { value: "mode", label: "Mode (Most Frequent)" },
  { value: "ffill", label: "Forward Fill" },
  { value: "bfill", label: "Backward Fill" },
];

const FillEmptyForm = ({ projectId, onClose, onTransform }) => {
  const { columns } = useProjectContext();
  const { showToast } = useToast();
  const { error, clearError, handleError } = useError();

  const [selectedColumn, setSelectedColumn] = useState("");
  const [strategy, setStrategy] = useState("custom");
  const [fillValue, setFillValue] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();

    const columnIndex = selectedColumn !== "" ? columns.indexOf(selectedColumn) : null;

    try {
      const response = await transformProject(projectId, {
        operation_type: "fillEmpty",
        fill_empty_params: {
          index: columnIndex,
          strategy,
          fill_value: strategy === "custom" ? fillValue : null,
        },
      });

      onTransform(response);
      onClose();
    } catch (err) {
      console.error("Error filling empty cells:", err);
      showToast(err.response?.data?.detail || "Failed to fill empty cells.", "error");
      handleError(err);
    }
  };

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <form onSubmit={handleSubmit}>
        <h3 className="font-semibold text-gray-900 mb-4">Fill Empty Cells</h3>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Column:</label>
          <select
            value={selectedColumn}
            onChange={(e) => setSelectedColumn(e.target.value)}
            className="border border-gray-300 rounded-md w-full px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-gray-300 focus:border-gray-300 focus:outline-none"
          >
            <option value="">All columns</option>
            {columns.map((col) => (
              <option key={col} value={col}>
                {col}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            Leave blank to apply to all columns (only supported for custom, forward fill, and
            backward fill).
          </p>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Strategy:</label>
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            className="border border-gray-300 rounded-md w-full px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-gray-300 focus:border-gray-300 focus:outline-none"
            required
          >
            {STRATEGIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {strategy === "custom" && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Fill Value:</label>
            <input
              type="text"
              value={fillValue}
              onChange={(e) => setFillValue(e.target.value)}
              placeholder="Enter value to fill with..."
              className="border border-gray-300 rounded-md w-full px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-gray-300 focus:border-gray-300 focus:outline-none"
              required
            />
          </div>
        )}

        <FormErrorAlert message={error} />

        <div className="flex justify-between mt-2">
          <button
            type="submit"
            className="bg-white hover:bg-gray-100 border border-gray-300 text-gray-900 px-4 py-2 rounded-md font-medium transition-colors duration-150"
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

FillEmptyForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onTransform: PropTypes.func.isRequired,
};

export default FillEmptyForm;
