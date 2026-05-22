import { useState } from "react";
import PropTypes from "prop-types";
import { transformProject } from "../../api";
import { SAMPLE_ROWS } from "../../constants/operationTypes";
import TransformResultPreview from "./TransformResultPreview";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";
import { useProjectContext } from "../../context/ProjectContext";

const SampleRowsForm = ({ projectId, onClose, onTransform }) => {
  const { updateData } = useProjectContext();
  const [sampleSize, setSampleSize] = useState("");
  const [randomSeed, setRandomSeed] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const { error, clearError, handleError } = useError();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const size = parseInt(sampleSize, 10);

    if (!sampleSize || isNaN(size) || size <= 0) {
      handleError({ response: { data: { detail: "Sample size must be a positive integer" } } });
      return;
    }

    setLoading(true);
    clearError();
    try {
      const params = { sample_size: size };

      if (randomSeed) {
        const seed = parseInt(randomSeed, 10);
        if (isNaN(seed) || seed < 0 || seed > 4294967295) {
          handleError({
            response: { data: { detail: "Random seed must be between 0 and 4294967295" } },
          });
          setLoading(false);
          return;
        }
        params.random_seed = seed;
      }

      const response = await transformProject(projectId, {
        operation_type: SAMPLE_ROWS,
        sample_params: params,
      });
      setResult(response);
      if (onTransform) onTransform(response);
      updateData(response.columns, response.rows, response.dtypes);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <form onSubmit={handleSubmit}>
        <h3 className="font-semibold text-gray-900 mb-2">Sample Rows</h3>
        <div className="flex flex-wrap mb-4">
          <div className="w-full sm:w-1/2 mb-2">
            <label className="block mb-1 text-sm font-medium text-gray-700">Sample Size:</label>
            <input
              type="number"
              min="1"
              step="1"
              value={sampleSize}
              onChange={(e) => setSampleSize(e.target.value)}
              placeholder="e.g., 100"
              className="border border-gray-300 rounded-md px-3 py-2 w-full bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
              required
            />
          </div>
          <div className="w-full sm:w-1/2 mb-2 pl-2">
            <label className="block mb-1 text-sm font-medium text-gray-700">
              Random Seed (Optional):
            </label>
            <input
              type="number"
              min="0"
              max="4294967295"
              step="1"
              value={randomSeed}
              onChange={(e) => setRandomSeed(e.target.value)}
              placeholder="e.g., 42"
              className="border border-gray-300 rounded-md px-3 py-2 w-full bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex justify-between">
          <button
            type="submit"
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md font-medium transition-colors duration-150"
            disabled={loading || !sampleSize}
          >
            Apply Sample
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

SampleRowsForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onTransform: PropTypes.func,
};

export default SampleRowsForm;
