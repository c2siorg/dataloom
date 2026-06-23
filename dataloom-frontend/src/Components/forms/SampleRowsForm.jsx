import { useState } from "react";
import PropTypes from "prop-types";
import { transformProject } from "../../api";
import { SAMPLE_ROWS } from "../../constants/operationTypes";
import useError from "../../hooks/useError";
import usePreviewSave from "../../hooks/usePreviewSave";
import FormErrorAlert from "../common/FormErrorAlert";
import { useProjectContext } from "../../context/ProjectContext";
import Button from "../common/Button";

const SampleRowsForm = ({ projectId, onClose }) => {
  const { isPreviewMode, enterPreviewMode, cancelPreview } = useProjectContext();
  const [sampleSize, setSampleSize] = useState("");
  const [randomSeed, setRandomSeed] = useState("");
  const [loading, setLoading] = useState(false);
  const { error, clearError, handleError } = useError();
  const { saving, handleSave } = usePreviewSave({
    clearError,
    handleError,
    onClose,
  });

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
      } else {
        // Auto-generate a seed so the preview and the final save produce
        // identical results (avoids the double-request divergence bug).
        const autoSeed = Math.floor(Math.random() * 4294967295);
        params.random_seed = autoSeed;
      }

      const payload = {
        operation_type: SAMPLE_ROWS,
        sample_params: params,
      };
      const response = await transformProject(projectId, payload, { preview: true });
      enterPreviewMode(response.columns, response.rows, response.dtypes, { projectId, payload });
    } catch (err) {
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
          <div className="flex gap-2">
            <Button type="submit" disabled={loading || saving || !sampleSize || isPreviewMode}>
              Apply Sample
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

SampleRowsForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default SampleRowsForm;
