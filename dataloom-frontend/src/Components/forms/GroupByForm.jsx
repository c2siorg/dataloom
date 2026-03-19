import { useState } from "react";
import PropTypes from "prop-types";
import { transformProject } from "../../api";
import { GROUPBY } from "../../constants/operationTypes";
import TransformResultPreview from "./TransformResultPreview";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";
import { useProjectContext } from "../../context/ProjectContext";

const GroupByForm = ({ projectId, onClose, onTransform }) => {
  const { columns: availableColumns, updateData } = useProjectContext();
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [aggColumn, setAggColumn] = useState("");
  const [aggFunction, setAggFunction] = useState("sum");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const { error, clearError, handleError } = useError();

  const handleColumnToggle = (col) => {
    setSelectedColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col],
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedColumns.length === 0) return;
    if (!aggColumn) return;

    setLoading(true);
    clearError();
    try {
      const response = await transformProject(projectId, {
        operation_type: GROUPBY,
        groupby_params: {
          columns: selectedColumns,
          agg_column: aggColumn,
          agg_function: aggFunction,
        },
      });
      setResult(response);
      if (onTransform) onTransform(response);
      updateData(response.columns, response.rows, response.dtypes);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <form onSubmit={handleSubmit}>
        <h3 className="font-semibold text-gray-900 mb-2">GroupBy Aggregation</h3>
        <div className="flex flex-wrap mb-4">
          <div className="w-full sm:w-1/3 mb-2">
            <label className="block mb-1 text-sm font-medium text-gray-700">
              Group By Columns:
            </label>
            <div className="border border-gray-300 rounded-md p-2 max-h-32 overflow-y-auto bg-white">
              {availableColumns.map((col) => (
                <label key={col} className="flex items-center gap-2 py-0.5 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={selectedColumns.includes(col)}
                    onChange={() => handleColumnToggle(col)}
                    className="rounded border-gray-300"
                  />
                  {col}
                </label>
              ))}
            </div>
          </div>
          <div className="w-full sm:w-1/3 mb-2 pl-2">
            <label className="block mb-1 text-sm font-medium text-gray-700">
              Aggregation Column:
            </label>
            <select
              value={aggColumn}
              onChange={(e) => setAggColumn(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 w-full bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
              required
            >
              <option value="">Select column...</option>
              {availableColumns
                .filter((col) => !selectedColumns.includes(col))
                .map((col) => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
            </select>
          </div>
          <div className="w-full sm:w-1/3 mb-2 pl-2">
            <label className="block mb-1 text-sm font-medium text-gray-700">Function:</label>
            <select
              value={aggFunction}
              onChange={(e) => setAggFunction(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 w-full bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
            >
              <option value="sum">Sum</option>
              <option value="mean">Mean</option>
              <option value="count">Count</option>
              <option value="min">Min</option>
              <option value="max">Max</option>
              <option value="median">Median</option>
            </select>
          </div>
        </div>
        <div className="flex justify-between">
          <button
            type="submit"
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md font-medium transition-colors duration-150"
            disabled={loading || selectedColumns.length === 0 || !aggColumn}
          >
            Apply GroupBy
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
      {result && <TransformResultPreview columns={result.columns} rows={result.rows} />}
    </div>
  );
};

GroupByForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onTransform: PropTypes.func,
};

export default GroupByForm;
