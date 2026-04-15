import { useState } from "react";
import PropTypes from "prop-types";
import { transformProject } from "../../api";
import { SORT } from "../../constants/operationTypes";
import TransformResultPreview from "./TransformResultPreview";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";
import { useProjectContext } from "../../context/ProjectContext";
import { LuChevronUp, LuChevronDown, LuX, LuPlus } from "react-icons/lu";

const emptyRow = () => ({ column: "", ascending: true });

const SortForm = ({ projectId, onClose }) => {
  const { columns } = useProjectContext();
  const [criteria, setCriteria] = useState([emptyRow()]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const { error, clearError, handleError } = useError();

  const updateCriterion = (index, field, value) => {
    setCriteria((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  };

  const addCriterion = () => setCriteria((prev) => [...prev, emptyRow()]);

  const removeCriterion = (index) => setCriteria((prev) => prev.filter((_, i) => i !== index));

  const moveCriterion = (index, direction) => {
    const next = index + direction;
    if (next < 0 || next >= criteria.length) return;
    setCriteria((prev) => {
      const arr = [...prev];
      [arr[index], arr[next]] = [arr[next], arr[index]];
      return arr;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const emptyIndex = criteria.findIndex((c) => c.column === "");
    if (emptyIndex !== -1) {
      handleError({
        message: `Row ${emptyIndex + 1}: Please select a column before submitting.`,
      });
      return;
    }

    setLoading(true);
    clearError();
    try {
      const response = await transformProject(projectId, {
        operation_type: SORT,
        sort_params: {
          sort_criteria: criteria,
        },
      });
      setResult(response);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <form onSubmit={handleSubmit}>
        <h3 className="font-semibold text-gray-900 mb-1">Sort Dataset</h3>
        <p className="text-xs text-gray-500 mb-3">
          Add multiple sort criteria. Priority is determined by order (top = primary sort).
        </p>

        <div className="space-y-2 mb-3">
          {criteria.map((criterion, index) => (
            <div key={index} className="flex items-center gap-2">
              {/* Row number */}
              <span className="text-xs text-gray-400 w-5 shrink-0">{index + 1}.</span>

              {/* Column dropdown */}
              <select
                value={criterion.column}
                onChange={(e) => updateCriterion(index, "column", e.target.value)}
                className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 bg-white text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
              >
                <option value="">Column name</option>
                {columns.map((col) => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>

              {/* Direction select */}
              <select
                value={criterion.ascending}
                onChange={(e) => updateCriterion(index, "ascending", e.target.value === "true")}
                className="border border-gray-300 rounded-md px-3 py-1.5 bg-white text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
              >
                <option value="true">Ascending</option>
                <option value="false">Descending</option>
              </select>

              {/* Reorder buttons */}
              <button
                type="button"
                onClick={() => moveCriterion(index, -1)}
                disabled={index === 0}
                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Move up"
              >
                <LuChevronUp className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => moveCriterion(index, 1)}
                disabled={index === criteria.length - 1}
                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Move down"
              >
                <LuChevronDown className="w-4 h-4" />
              </button>

              {/* Remove button */}
              <button
                type="button"
                onClick={() => removeCriterion(index)}
                disabled={criteria.length === 1}
                className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Remove"
              >
                <LuX className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Add criterion */}
        <button
          type="button"
          onClick={addCriterion}
          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 mb-4"
        >
          <LuPlus className="w-4 h-4" />
          Add Sort Criterion
        </button>

        <div className="flex justify-between">
          <button
            type="submit"
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-150"
            disabled={loading}
          >
            {loading ? "Sorting…" : "Apply Sort"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-md text-sm font-medium transition-colors duration-150"
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

SortForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default SortForm;
