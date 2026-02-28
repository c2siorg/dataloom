import { useState } from "react";
import PropTypes from "prop-types";
import { transformProject } from "../../api";
import TransformResultPreview from "./TransformResultPreview";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";

const SortForm = ({ projectId, onClose, onTransform }) => {
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
        operation_type: "sort",
        sort_params: {
          column,
          ascending,
        },
      });
      setResult(response);
      onTransform(response); // Update parent component with sorted data
      console.log("Sort API response:", response);
    } catch (err) {
      console.error("Error applying sort:", err.response?.data || err.message);
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <form onSubmit={handleSubmit}>
        <h3 className="font-semibold text-gray-900 mb-2">Sort Dataset</h3>
        <div className="flex flex-wrap mb-4">
          <div className="w-full sm:w-1/2 mb-2">
            <label className="block mb-1 text-sm font-medium text-gray-700">Column:</label>
            <input
              type="text"
              value={column}
              onChange={(e) => setColumn(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 w-full bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
              required
            />
          </div>
          <div className="w-full sm:w-1/2 mb-2 pl-2">
            <label className="block mb-1 text-sm font-medium text-gray-700">Order:</label>
            <select
              value={ascending}
              onChange={(e) => setAscending(e.target.value === "true")}
              className="border border-gray-300 rounded-md px-3 py-2 w-full bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
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
  onClose: PropTypes.func.isRequired,
  onTransform: PropTypes.func.isRequired,
};

export default SortForm;
