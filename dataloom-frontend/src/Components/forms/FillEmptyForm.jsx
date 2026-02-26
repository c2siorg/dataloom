import { useState } from "react";
import PropTypes from "prop-types";
import { transformProject } from "../../api";
import { useProjectContext } from "../../context/ProjectContext";

const STRATEGIES = [
  { value: "custom", label: "Custom Value" },
  { value: "mean", label: "Mean" },
  { value: "median", label: "Median" },
  { value: "mode", label: "Mode (Most Frequent)" },
  { value: "forward_fill", label: "Forward Fill (ffill)" },
  { value: "backward_fill", label: "Backward Fill (bfill)" },
];

const FillEmptyForm = ({ projectId, onClose, onTransform }) => {
  const { columns } = useProjectContext();
  const [strategy, setStrategy] = useState("custom");
  const [fillValue, setFillValue] = useState("");
  const [selectedColumn, setSelectedColumn] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Resolve 0-based column index from name, or null for all columns
    const columnIndex =
      selectedColumn !== "" ? columns.indexOf(selectedColumn) : null;

    const fillEmptyParams = {
      index: columnIndex,
      strategy,
      fill_value: strategy === "custom" ? fillValue : null,
    };

    try {
      const response = await transformProject(projectId, {
        operation_type: "fillEmpty",
        fill_empty_params: fillEmptyParams,
      });
      onTransform(response);
    } catch (err) {
      const msg =
        err.response?.data?.detail || err.message || "An error occurred.";
      console.error("Error applying fill empty:", msg);
      alert(msg);
    }
    onClose();
  };

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <form onSubmit={handleSubmit}>
        <h3 className="font-semibold text-gray-900 mb-2">Fill Empty Values</h3>
        <div className="flex space-x-2 mb-4">

          {/* Column selector */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700">Column:</label>
            <select
              value={selectedColumn}
              onChange={(e) => setSelectedColumn(e.target.value)}
              className="border border-gray-300 rounded-md w-full px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
            >
              <option value="">All columns</option>
              {columns.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
          </div>

          {/* Strategy dropdown */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700">Strategy:</label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              className="border border-gray-300 rounded-md w-full px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
            >
              {STRATEGIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Custom value input — only shown when strategy is "custom" */}
          {strategy === "custom" && (
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700">Fill Value:</label>
              <input
                type="text"
                value={fillValue}
                onChange={(e) => setFillValue(e.target.value)}
                placeholder="e.g. 0 or N/A"
                className="border border-gray-300 rounded-md w-full px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
                required
              />
            </div>
          )}
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

FillEmptyForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onTransform: PropTypes.func.isRequired,
};

export default FillEmptyForm;
