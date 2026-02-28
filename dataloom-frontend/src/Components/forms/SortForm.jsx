import { useState, useCallback } from "react";
import PropTypes from "prop-types";
import { transformProject } from "../../api";
import TransformResultPreview from "./TransformResultPreview";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";

/**
 * SortForm component for multi-column sorting.
 * Allows users to add, remove, and reorder multiple sort criteria.
 */
const SortForm = ({ projectId, columns = [], onClose }) => {
  // Initialize with one empty criterion
  const [criteria, setCriteria] = useState([{ id: 1, column: "", ascending: true }]);
  const [nextId, setNextId] = useState(2);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const { error, clearError, handleError } = useError();

  /**
   * Add a new sort criterion row.
   */
  const addCriterion = useCallback(() => {
    setCriteria((prev) => [...prev, { id: nextId, column: "", ascending: true }]);
    setNextId((prev) => prev + 1);
  }, [nextId]);

  /**
   * Remove a sort criterion by id.
   */
  const removeCriterion = useCallback((id) => {
    setCriteria((prev) => {
      if (prev.length <= 1) {
        // Keep at least one criterion, just clear it instead
        return prev.map((c) => (c.id === id ? { ...c, column: "" } : c));
      }
      return prev.filter((c) => c.id !== id);
    });
  }, []);

  /**
   * Update a specific criterion's column.
   */
  const updateCriterionColumn = useCallback((id, column) => {
    setCriteria((prev) =>
      prev.map((c) => (c.id === id ? { ...c, column } : c))
    );
  }, []);

  /**
   * Update a specific criterion's sort direction.
   */
  const updateCriterionOrder = useCallback((id, ascending) => {
    setCriteria((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ascending } : c))
    );
  }, []);

  /**
   * Move a criterion up in priority (earlier in the list).
   */
  const moveUp = useCallback((index) => {
    if (index === 0) return;
    setCriteria((prev) => {
      const newCriteria = [...prev];
      [newCriteria[index - 1], newCriteria[index]] = [
        newCriteria[index],
        newCriteria[index - 1],
      ];
      return newCriteria;
    });
  }, []);

  /**
   * Move a criterion down in priority (later in the list).
   */
  const moveDown = useCallback((index) => {
    setCriteria((prev) => {
      if (index >= prev.length - 1) return prev;
      const newCriteria = [...prev];
      [newCriteria[index], newCriteria[index + 1]] = [
        newCriteria[index + 1],
        newCriteria[index],
      ];
      return newCriteria;
    });
  }, []);

  /**
   * Validate that all criteria have selected columns.
   */
  const validateCriteria = useCallback(() => {
    const emptyCriteria = criteria.filter((c) => !c.column || c.column.trim() === "");
    if (emptyCriteria.length > 0) {
      return "Please select a column for all sort criteria";
    }
    return null;
  }, [criteria]);

  /**
   * Handle form submission.
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const validationError = validateCriteria();
    if (validationError) {
      setError(validationError);
      return;
    }

    // Build the criteria list for the API
    const criteriaList = criteria.map((c) => ({
      column: c.column,
      ascending: c.ascending,
    }));

    setLoading(true);
    clearError();
    try {
      const response = await transformProject(projectId, {
        operation_type: "sort",
        sort_params: {
          criteria: criteriaList,
        },
      });
      setResult(response);
      console.log("Sort API response:", response);
    } catch (err) {
      console.error("Error applying sort:", err.response?.data || err.message);
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  // Determine if columns should be shown as dropdown or text input
  const hasColumnList = Array.isArray(columns) && columns.length > 0;

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <form onSubmit={handleSubmit}>
        <h3 className="font-semibold text-gray-900 mb-2">Sort Dataset</h3>
        <p className="text-sm text-gray-600 mb-4">
          Add multiple sort criteria. Priority is determined by order (top = primary sort).
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-3 mb-4">
          {criteria.map((criterion, index) => (
            <div
              key={criterion.id}
              className="flex items-center gap-2 p-3 bg-gray-50 rounded-md border border-gray-200"
            >
              <span className="text-sm font-medium text-gray-500 w-6">
                {index + 1}.
              </span>

              <div className="flex-1">
                {hasColumnList ? (
                  <select
                    value={criterion.column}
                    onChange={(e) => updateCriterionColumn(criterion.id, e.target.value)}
                    className="border border-gray-300 rounded-md px-3 py-2 w-full bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none text-sm"
                    required
                  >
                    <option value="">Select column...</option>
                    {columns.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={criterion.column}
                    onChange={(e) => updateCriterionColumn(criterion.id, e.target.value)}
                    placeholder="Column name"
                    className="border border-gray-300 rounded-md px-3 py-2 w-full bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none text-sm"
                    required
                  />
                )}
              </div>

              <select
                value={criterion.ascending}
                onChange={(e) =>
                  updateCriterionOrder(criterion.id, e.target.value === "true")
                }
                className="border border-gray-300 rounded-md px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none text-sm w-32"
              >
                <option value="true">Ascending</option>
                <option value="false">Descending</option>
              </select>

              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                  className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Move up in priority"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => moveDown(index)}
                  disabled={index === criteria.length - 1}
                  className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Move down in priority"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => removeCriterion(criterion.id)}
                  className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  title="Remove criterion"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addCriterion}
          className="mb-4 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-2 rounded-md transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Sort Criterion
        </button>

        <div className="flex justify-between pt-4 border-t border-gray-200">
          <button
            type="submit"
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md font-medium transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading || criteria.length === 0}
          >
            {loading ? "Applying..." : "Apply Sort"}
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

SortForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  columns: PropTypes.arrayOf(PropTypes.string),
  onClose: PropTypes.func.isRequired,
};

export default SortForm;
