import { useState } from "react";
import PropTypes from "prop-types";
import TransformResultPreview from "./TransformResultPreview";
import { transformProject } from "../../api";
import { PIVOT_TABLES } from "../../constants/operationTypes";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";
import ColumnSelect from "../common/ColumnSelect";
import ColumnMultiSelect from "../common/ColumnMultiSelect";
import { useProjectContext } from "../../context/ProjectContext";
import Button from "../common/Button";

const PivotTableForm = ({ projectId, onClose }) => {
  const [index, setIndex] = useState([]);
  const [column, setColumn] = useState("");
  const [value, setValue] = useState("");
  const [aggfun, setAggfun] = useState("sum");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const { error, setError, clearError, handleError } = useError();
  const { updateData, refreshProject, pageSize } = useProjectContext();

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();

    if (index.length === 0) {
      setError("Please select at least one index column.");
      return;
    }

    if (!column || !value) {
      setError("Please select a column and a value.");
      return;
    }

    setLoading(true);
    try {
      const response = await transformProject(projectId, {
        operation_type: PIVOT_TABLES,
        pivot_query: { index: index.join(","), column, value, aggfun },
      });
      setResult(response);
      updateData(response.columns, response.rows, {
        dtypes: response.dtypes,
        resetColumnOrder: false,
      });
      await refreshProject(projectId, 1, pageSize);
    } catch (err) {
      console.error("Error applying pivot table:", err.message);
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <form onSubmit={handleSubmit}>
        <h3 className="font-semibold text-gray-900 mb-2">Pivot Table</h3>
        <div className="flex space-x-2 mb-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700">Index:</label>
            <ColumnMultiSelect value={index} onChange={setIndex} required />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700">Column:</label>
            <ColumnSelect
              value={column}
              onChange={(value) => setColumn(value)}
              placeholder="Select column..."
            />
          </div>
        </div>
        <div className="flex space-x-2 mb-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700">Value:</label>
            <ColumnSelect
              value={value}
              onChange={(value) => setValue(value)}
              placeholder="Select column..."
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700">Aggregation Function:</label>
            <select
              value={aggfun}
              onChange={(e) => setAggfun(e.target.value)}
              className="border border-gray-300 rounded-md w-full px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
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
          <Button type="submit" disabled={loading}>
            {loading ? "Submitting..." : "Submit"}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
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
