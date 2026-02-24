import { useState } from "react";
import PropTypes from "prop-types";
import TransformResultPreview from "./TransformResultPreview";
import { complexTransformDataset } from "../../api";

const PivotTableForm = ({ datasetId, onClose }) => {
  const [index, setIndex] = useState("");
  const [column, setColumn] = useState("");
  const [value, setValue] = useState("");
  const [aggfun, setAggfun] = useState("sum");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await complexTransformDataset(datasetId, {
        operation_type: "pivotTables",
        pivot_query: { index, column, value, aggfun },
      });
      setResult(response);
      console.log("Pivot API response:", response);
    } catch (error) {
      console.error("Error applying pivot table:", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border border-green-500 rounded bg-gray-100 text-black">
      <form onSubmit={handleSubmit}>
        <h3 className="font-bold mb-2">Pivot Table</h3>
        <div className="flex space-x-2 mb-4">
          <div className="flex-1">
            <label className="block text-sm font-medium">Index:</label>
            <input
              type="text"
              value={index}
              onChange={(e) => setIndex(e.target.value)}
              className="border border-gray-300 rounded w-full p-2 bg-white text-black"
              placeholder="e.g., col1,col2"
              required
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium">Column:</label>
            <input
              type="text"
              value={column}
              onChange={(e) => setColumn(e.target.value)}
              className="border border-gray-300 rounded w-full p-2 bg-white text-black"
              required
            />
          </div>
        </div>
        <div className="flex space-x-2 mb-4">
          <div className="flex-1">
            <label className="block text-sm font-medium">Value:</label>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="border border-gray-300 rounded w-full p-2 bg-white text-black"
              required
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium">Aggregation Function:</label>
            <select
              value={aggfun}
              onChange={(e) => setAggfun(e.target.value)}
              className="border border-gray-300 rounded w-full p-2 bg-white text-black"
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
          <button
            type="submit"
            className="bg-green-600 text-white px-4 py-2 rounded"
            disabled={loading}
          >
            {loading ? "Loading..." : "Submit"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="bg-red-600 text-white px-4 py-2 rounded"
          >
            Cancel
          </button>
        </div>
      </form>
      {result && <TransformResultPreview columns={result.columns} rows={result.rows} />}
    </div>
  );
};

PivotTableForm.propTypes = {
  datasetId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default PivotTableForm;
