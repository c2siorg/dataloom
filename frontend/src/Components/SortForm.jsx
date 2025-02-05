import { useState } from "react";
import PropTypes from "prop-types";
import { transformDataset } from "../api"; 
import TableDisplay from "./TableDisplay"; 

const SortForm = ({ datasetId, onClose }) => {
  const [column, setColumn] = useState("");
  const [ascending, setAscending] = useState(true);
  const [result, setResult] = useState(null); 
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log("Submitting sort with parameters:", { column, ascending });
    setLoading(true); 
    try {
      const response = await transformDataset(datasetId, {
        operation_type: "sort",
        sort_params: {
          column,
          ascending,
        },
      });
      setResult(response.data); 
      console.log("Sort API response:", response.data);
    } catch (error) {
      console.error(
        "Error applying sort:",
        error.response?.data || error.message
      );
    } finally {
      setLoading(false); 
    }
  };

  return (
    <div className="p-4 border border-green-500 rounded bg-gray-100 text-black">
      <form onSubmit={handleSubmit}>
        <h3 className="font-bold mb-2">Sort Dataset</h3>
        <div className="flex flex-wrap mb-4">
          <div className="w-full sm:w-1/2 mb-2">
            <label className="block mb-1">Column:</label>
            <input
              type="text"
              value={column}
              onChange={(e) => setColumn(e.target.value)}
              className="border border-gray-300 p-1 rounded w-full bg-white text-black"
              required
            />
          </div>
          <div className="w-full sm:w-1/2 mb-2 pl-2">
            <label className="block mb-1">Order:</label>
            <select
              value={ascending}
              onChange={(e) => setAscending(e.target.value === "true")}
              className="border border-gray-300 p-1 rounded w-full bg-white text-black"
            >
              <option value="true">Ascending</option>
              <option value="false">Descending</option>
            </select>
          </div>
        </div>
        <div className="flex justify-between">
          <button
            type="submit"
            className="bg-green-600 text-white px-3 py-1 rounded"
            disabled={loading} 
          >
            Submit
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
      {result && <TableDisplay columns={result.columns} rows={result.rows} />}
    </div>
  );
};

SortForm.propTypes = {
  datasetId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default SortForm;
