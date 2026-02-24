import { useState } from "react";
import PropTypes from "prop-types";
import { transformDataset } from "../../api";
import TransformResultPreview from "./TransformResultPreview";

const FilterForm = ({ datasetId, onClose }) => {
  const [filterParams, setFilterParams] = useState({
    column: "",
    condition: "=",
    value: "",
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleInputChange = (e) => {
    setFilterParams({
      ...filterParams,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log("Submitting filter with parameters:", filterParams);
    setLoading(true);
    try {
      const response = await transformDataset(datasetId, {
        operation_type: "filter",
        parameters: filterParams,
      });
      setResult(response);
      console.log("Filter API response:", response);
    } catch (error) {
      console.error("Error applying filter:", error.response?.data || error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border border-green-500 rounded bg-gray-100 text-black">
      <form onSubmit={handleSubmit}>
        <h3 className="font-bold mb-2">Filter Dataset</h3>
        <div className="flex flex-wrap mb-4 ">
          <div className="w-full sm:w-1/3 mb-2 ">
            <label className="block mb-1">Column:</label>
            <input
              type="text"
              name="column"
              value={filterParams.column}
              onChange={handleInputChange}
              className="border border-gray-300 p-1 rounded w-full bg-white text-black"
              required
            />
          </div>
          <div className="w-full sm:w-1/3 mb-2 pl-2">
            <label className="block mb-1">Condition:</label>
            <select
              name="condition"
              value={filterParams.condition}
              onChange={handleInputChange}
              className="border border-gray-300 p-1 rounded w-full bg-white text-black"
              required
            >
              <option value="=">=</option>
              <option value=">">&gt;</option>
              <option value="<">&lt;</option>
              <option value=">=">&gt;=</option>
              <option value="<=">&lt;=</option>
            </select>
          </div>
          <div className="w-full sm:w-1/3 mb-2 pl-2">
            <label className="block mb-1 ">Value:</label>
            <input
              type="text"
              name="value"
              value={filterParams.value}
              onChange={handleInputChange}
              className="border border-gray-300 p-1 rounded w-full bg-white text-black"
              required
            />
          </div>
        </div>
        <div className="flex justify-between">
          <button
            type="submit"
            className="bg-green-600 text-white px-3 py-1 rounded"
            disabled={loading}
          >
            Apply Filter
          </button>
          <button
            type="button"
            onClick={onClose}
            className="bg-red-600 text-white px-3 py-1 rounded"
          >
            Cancel
          </button>
        </div>
      </form>
      {result && <TransformResultPreview columns={result.columns} rows={result.rows} />}
    </div>
  );
};

FilterForm.propTypes = {
  datasetId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default FilterForm;
