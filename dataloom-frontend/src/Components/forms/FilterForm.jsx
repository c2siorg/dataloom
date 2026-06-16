import { useState } from "react";
import PropTypes from "prop-types";
import { transformProject } from "../../api";
import { FILTER } from "../../constants/operationTypes";
import TransformResultPreview from "./TransformResultPreview";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";
import ColumnSelect from "../common/ColumnSelect";
import { useProjectContext } from "../../context/ProjectContext";
import Button from "../common/Button";

const FilterForm = ({ projectId, onClose }) => {
  const [filterParams, setFilterParams] = useState({
    column: "",
    condition: "=",
    value: "",
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const { error, clearError, handleError } = useError();
  const { updateData, setPaginationData } = useProjectContext();
  const { updateData, refreshProject, pageSize } = useProjectContext();

  const handleInputChange = (e) => {
    setFilterParams({
      ...filterParams,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    clearError();
    try {
      const response = await transformProject(projectId, {
        operation_type: FILTER,
        parameters: filterParams,
      });
      setResult(response);
      updateData(response.columns, response.rows, {
        dtypes: response.dtypes,
        resetColumnOrder: false,
      });
      if (response.pagination) {
        setPaginationData(response.pagination);
      }
      await refreshProject(projectId, 1, pageSize);
    } catch (err) {
      console.error("Error applying filter:", err.response?.data || err.message);
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-testid="filter-form" className="p-4 border border-gray-200 rounded-lg bg-white">
      <form onSubmit={handleSubmit}>
        <h3 className="font-semibold text-gray-900 mb-2">Filter Dataset</h3>
        <div className="flex flex-wrap mb-4">
          <div className="w-full sm:w-1/3 mb-2">
            <label className="block mb-1 text-sm font-medium text-gray-700">Column:</label>
            <ColumnSelect
              name="column"
              data-testid="filter-column"
              value={filterParams.column}
              onChange={handleInputChange}
              placeholder="Select column to filter..."
            />
          </div>
          <div className="w-full sm:w-1/3 mb-2 pl-2">
            <label className="block mb-1 text-sm font-medium text-gray-700">Condition:</label>
            <select
              name="condition"
              value={filterParams.condition}
              onChange={handleInputChange}
              className="border border-gray-300 rounded-md px-3 py-2 w-full bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
              required
            >
              <option value="=">=</option>
              <option value="!=">!= (not equal)</option>
              <option value=">">&gt;</option>
              <option value="<">&lt;</option>
              <option value=">=">&gt;=</option>
              <option value="<=">&lt;=</option>
              <option value="contains">contains</option>
            </select>
          </div>
          <div className="w-full sm:w-1/3 mb-2 pl-2">
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
        </div>
        <div className="flex justify-between">
          <Button type="submit" disabled={loading}>
            Apply Filter
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

FilterForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default FilterForm;
