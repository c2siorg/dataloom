import { useState } from "react";
import PropTypes from "prop-types";
import { transformProject } from "../../api";
import { SORT } from "../../constants/operationTypes";
import TransformResultPreview from "./TransformResultPreview";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";
import ColumnSelect from "../common/ColumnSelect";

const SortForm = ({ projectId, onClose }) => {
  const [column, setColumn] = useState("");
  const [ascending, setAscending] = useState(true);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const { error, clearError, handleError } = useError();

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log("Submitting sort with parameters:", { column, ascending });
    setLoading(true);
    clearError();
    try {
      const response = await transformProject(projectId, {
        operation_type: SORT,
        sort_params: {
          column,
          ascending,
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

  return (
    <div className="p-4 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface">
      <form onSubmit={handleSubmit}>
        <h3 className="font-semibold text-gray-900 dark:text-dark-text mb-2">Sort Dataset</h3>
        <div className="flex flex-wrap mb-4">
          <div className="w-full sm:w-1/2 mb-2">
            <label className="block mb-1 text-sm font-medium text-gray-700 dark:text-dark-muted">
              Column:
            </label>
            <ColumnSelect
              value={column}
              onChange={(e) => setColumn(e.target.value)}
              placeholder="Select column to sort by..."
            />
          </div>
          <div className="w-full sm:w-1/2 mb-2 pl-2">
            <label className="block mb-1 text-sm font-medium text-gray-700 dark:text-dark-muted">
              Order:
            </label>
            <select
              value={ascending}
              onChange={(e) => setAscending(e.target.value === "true")}
              className="border border-gray-300 dark:border-dark-border rounded-md px-3 py-2 w-full bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
            >
              <option value="true">Ascending</option>
              <option value="false">Descending</option>
            </select>
          </div>
        </div>
        <div className="flex justify-between">
          <button
            type="submit"
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md font-medium transition-colors duration-150"
            disabled={loading}
          >
            Submit
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

SortForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default SortForm;
