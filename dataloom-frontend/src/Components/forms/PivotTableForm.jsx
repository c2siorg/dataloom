import { useState } from "react";
import PropTypes from "prop-types";
import TransformResultPreview from "./TransformResultPreview";
import { transformProject } from "../../api";
import { PIVOT_TABLES } from "../../constants/operationTypes";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";
import ColumnSelect from "../common/ColumnSelect";

const PivotTableForm = ({ projectId, onClose }) => {
  const [index, setIndex] = useState("");
  const [column, setColumn] = useState("");
  const [value, setValue] = useState("");
  const [aggfun, setAggfun] = useState("sum");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const { error, clearError, handleError } = useError();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    clearError();
    try {
      const response = await transformProject(projectId, {
        operation_type: PIVOT_TABLES,
        pivot_query: { index, column, value, aggfun },
      });
      setResult(response);
      console.log("Pivot API response:", response);
    } catch (err) {
      console.error("Error applying pivot table:", err.message);
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface">
      <form onSubmit={handleSubmit}>
        <h3 className="font-semibold text-gray-900 dark:text-dark-text mb-2">Pivot Table</h3>
        <div className="flex space-x-2 mb-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-muted">
              Index:
            </label>
            <input
              type="text"
              value={index}
              onChange={(e) => setIndex(e.target.value)}
              className="border border-gray-300 dark:border-dark-border rounded-md w-full px-3 py-2 bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
              placeholder="e.g., col1,col2"
              required
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-muted">
              Column:
            </label>
            <ColumnSelect
              value={column}
              onChange={(e) => setColumn(e.target.value)}
              placeholder="Select column..."
            />
          </div>
        </div>
        <div className="flex space-x-2 mb-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-muted">
              Value:
            </label>
            <ColumnSelect
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Select column..."
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-muted">
              Aggregation Function:
            </label>
            <select
              value={aggfun}
              onChange={(e) => setAggfun(e.target.value)}
              className="border border-gray-300 dark:border-dark-border rounded-md w-full px-3 py-2 bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
            >
              <option value="sum">Sum</option>
              <option value="mean">Mean</option>
              <option value="count">Count</option>
              <option value="min">Min</option>
              <option value="max">Max</option>
            </select>
          </div>
        </div>
        <div className="flex justify-between">
          <button
            type="submit"
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md font-medium transition-colors duration-150"
            disabled={loading}
          >
            {loading ? "Loading..." : "Submit"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="bg-white dark:bg-dark-surface border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-border px-4 py-2 rounded-md font-medium transition-colors duration-150"
          >
            Cancel
          </button>
        </div>
      </form>
      <FormErrorAlert message={error} />
      {result && <TransformResultPreview columns={result.columns} rows={result.rows} />}
    </div>
  );
};

PivotTableForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default PivotTableForm;
