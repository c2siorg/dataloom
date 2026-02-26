import { useState } from "react";
import PropTypes from "prop-types";
import TransformResultPreview from "./TransformResultPreview";
import { useTransform } from "../../hooks/useTransform";
import ErrorAlert from "../ui/ErrorAlert";

const AdvQueryFilterForm = ({ projectId, onClose }) => {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null);

  const { applyTransform, loading, error } = useTransform(projectId, (columns, rows) => {
    setResult({ columns, rows });
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log("Query:", query);
    await applyTransform({
      operation_type: "advQueryFilter",
      adv_query: { query },
    });
  };

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <form onSubmit={handleSubmit}>
        <h3 className="font-semibold text-gray-900 mb-2">Advanced Query</h3>
        <div className="mb-2">
          <label className="block text-sm font-medium text-gray-700">Query:</label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border border-gray-300 rounded-md w-full px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
            placeholder="e.g., col1 > 10 and col2 < 5"
            required
          />
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

        {/* Consistent error positioning with proper spacing */}
        {error && <div className="mt-4"><ErrorAlert message={error} /></div>}
      </form>
      {result && <TransformResultPreview columns={result.columns} rows={result.rows} />}
    </div>
  );
};

AdvQueryFilterForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default AdvQueryFilterForm;
