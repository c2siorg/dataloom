import { useState } from "react";
import PropTypes from "prop-types";
import { transformProject } from "../../api";
import { FILTER } from "../../constants/operationTypes";
import useError from "../../hooks/useError";
import usePreviewSave from "../../hooks/usePreviewSave";
import FormErrorAlert from "../common/FormErrorAlert";
import ColumnSelect from "../common/ColumnSelect";
import Select from "../common/Select";
import { useProjectContext } from "../../context/ProjectContext";
import Button from "../common/Button";

const CONDITIONS = [
  { value: "=", label: "=" },
  { value: "!=", label: "!= (not equal)" },
  { value: ">", label: ">" },
  { value: "<", label: "<" },
  { value: ">=", label: ">=" },
  { value: "<=", label: "<=" },
  { value: "contains", label: "contains" },
];

const FilterForm = ({ projectId, onClose }) => {
  const [filterParams, setFilterParams] = useState({
    column: "",
    condition: "=",
    value: "",
  });
  const [loading, setLoading] = useState(false);
  const { error, setError, clearError, handleError } = useError();
  const { isPreviewMode, enterPreviewMode, cancelPreview } = useProjectContext();
  const { saving, handleSave } = usePreviewSave({
    clearError,
    handleError,
    onClose,
  });

  const handleInputChange = (e) => {
    setFilterParams({
      ...filterParams,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();

    if (!filterParams.column) {
      setError("Please select a column.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        operation_type: FILTER,
        parameters: filterParams,
      };
      const response = await transformProject(projectId, payload, {
        preview: true,
      });
      enterPreviewMode(response.columns, response.rows, response.dtypes, {
        projectId,
        payload,
      });
    } catch (err) {
      console.error("Error applying filter:", err.response?.data || err.message);
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (isPreviewMode) {
      cancelPreview();
    }
    onClose();
  };

  return (
    <div data-testid="filter-form">
      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label className="block mb-1 text-sm font-medium text-gray-700">Column:</label>
          <ColumnSelect
            name="column"
            data-testid="filter-column"
            value={filterParams.column}
            onChange={(value) => setFilterParams((p) => ({ ...p, column: value }))}
            placeholder="Select column to filter..."
          />
        </div>
        <div className="mb-3">
          <label className="block mb-1 text-sm font-medium text-gray-700">Condition:</label>
          <Select
            value={filterParams.condition}
            onChange={(value) => setFilterParams((p) => ({ ...p, condition: value }))}
            options={CONDITIONS}
          />
        </div>
        <div className="mb-4">
          <label className="block mb-1 text-sm font-medium text-gray-700">Value:</label>
          <input
            type="text"
            name="value"
            data-testid="filter-value"
            value={filterParams.value}
            onChange={handleInputChange}
            className="border border-gray-300 rounded-md px-3 py-2 w-full bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
            required
          />
        </div>
        <div className="flex justify-between">
          <div className="flex gap-2">
            <Button type="submit" disabled={loading || saving || isPreviewMode}>
              Apply Filter
            </Button>
            {isPreviewMode && (
              <Button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="bg-green-600 hover:bg-green-700 focus:ring-green-600"
              >
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            )}
          </div>
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
        </div>
        <FormErrorAlert message={error} />
      </form>
    </div>
  );
};

FilterForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default FilterForm;
