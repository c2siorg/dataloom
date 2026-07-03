import { useState, useCallback } from "react";
import PropTypes from "prop-types";
import { transformProject } from "../../api";
import { SORT } from "../../constants/operationTypes";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";
import ColumnSelect from "../common/ColumnSelect";
import Select from "../common/Select";
import { useProjectContext } from "../../context/ProjectContext";
import usePreviewSave from "../../hooks/usePreviewSave";
import Button from "../common/Button";

const ORDER_OPTIONS = [
  { value: "true", label: "Ascending" },
  { value: "false", label: "Descending" },
];

/**
 * SortForm component for multi-column sorting.
 * Allows users to add, remove, and reorder multiple sort criteria.
 */
const SortForm = ({ projectId, onClose }) => {
  const { isPreviewMode, enterPreviewMode, cancelPreview } = useProjectContext();
  const [criteria, setCriteria] = useState([{ id: 1, column: "", ascending: true }]);
  const [nextId, setNextId] = useState(2);
  const [loading, setLoading] = useState(false);
  const { error, setError, clearError, handleError } = useError();
  const { saving, handleSave } = usePreviewSave({ clearError, handleError, onClose });

  const addCriterion = useCallback(() => {
    setCriteria((prev) => [...prev, { id: nextId, column: "", ascending: true }]);
    setNextId((prev) => prev + 1);
  }, [nextId]);

  const removeCriterion = useCallback((id) => {
    setCriteria((prev) => {
      if (prev.length <= 1) {
        return prev.map((c) => (c.id === id ? { ...c, column: "" } : c));
      }
      return prev.filter((c) => c.id !== id);
    });
  }, []);

  const updateCriterionColumn = useCallback((id, column) => {
    setCriteria((prev) => prev.map((c) => (c.id === id ? { ...c, column } : c)));
  }, []);

  const updateCriterionOrder = useCallback((id, ascending) => {
    setCriteria((prev) => prev.map((c) => (c.id === id ? { ...c, ascending } : c)));
  }, []);

  const moveUp = useCallback((index) => {
    if (index === 0) return;
    setCriteria((prev) => {
      const newCriteria = [...prev];
      [newCriteria[index - 1], newCriteria[index]] = [newCriteria[index], newCriteria[index - 1]];
      return newCriteria;
    });
  }, []);

  const moveDown = useCallback((index) => {
    setCriteria((prev) => {
      if (index >= prev.length - 1) return prev;
      const newCriteria = [...prev];
      [newCriteria[index], newCriteria[index + 1]] = [newCriteria[index + 1], newCriteria[index]];
      return newCriteria;
    });
  }, []);

  const validateCriteria = useCallback(() => {
    const emptyCriteria = criteria.filter((c) => !c.column || c.column.trim() === "");
    if (emptyCriteria.length > 0) {
      return "Please select a column for all sort criteria";
    }
    return null;
  }, [criteria]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = validateCriteria();
    if (validationError) {
      setError(validationError);
      return;
    }
    const criteriaList = criteria.map((c) => ({
      column: c.column,
      ascending: c.ascending,
    }));
    setLoading(true);
    clearError();
    try {
      const payload = {
        operation_type: SORT,
        sort_params: {
          criteria: criteriaList,
        },
      };
      const response = await transformProject(projectId, payload, { preview: true });
      enterPreviewMode(response.columns, response.rows, response.dtypes, { projectId, payload });
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (isPreviewMode) {
      cancelPreview();
    } else {
      onClose();
    }
  };

  return (
    <div data-testid="sort-form">
      <form onSubmit={handleSubmit}>
        <p className="text-sm text-gray-600 mb-4">
          Add multiple sort criteria. Priority is determined by order (top = primary sort).
        </p>
        <div className="space-y-3 mb-4">
          {criteria.map((criterion, index) => (
            <div
              key={criterion.id}
              className="flex items-center gap-2 p-3 bg-gray-50 rounded-md border border-gray-200"
            >
              <span className="text-sm font-medium text-gray-500 w-6">{index + 1}.</span>
              <div className="flex-1">
                <ColumnSelect
                  value={criterion.column}
                  onChange={(value) => updateCriterionColumn(criterion.id, value)}
                  placeholder="Select column..."
                  required
                  data-testid={index === 0 ? "sort-column" : undefined}
                />
              </div>
              <Select
                value={String(criterion.ascending)}
                onChange={(value) => updateCriterionOrder(criterion.id, value === "true")}
                options={ORDER_OPTIONS}
                className="w-32 shrink-0"
              />
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                  className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Move up in priority"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 15l7-7 7 7"
                    />
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
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => removeCriterion(criterion.id)}
                  className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  title="Remove criterion"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
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
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={loading || saving || isPreviewMode || criteria.length === 0}
            >
              {loading ? "Applying..." : "Apply Sort"}
            </Button>
            {isPreviewMode && (
              <Button type="button" onClick={handleSave} disabled={saving} variant="success">
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            )}
          </div>
          <Button type="button" variant="secondary" onClick={handleCancel}>
            Cancel
          </Button>
        </div>
        <FormErrorAlert message={error} />
      </form>
    </div>
  );
};

SortForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default SortForm;
