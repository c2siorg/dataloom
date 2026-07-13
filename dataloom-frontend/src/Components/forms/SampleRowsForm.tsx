import { useState, FormEvent } from "react";
import { transformProject } from "../../api";
import { SAMPLE_ROWS } from "../../constants/operationTypes";
import useError from "../../hooks/useError";
import usePreviewSave from "../../hooks/usePreviewSave";
import FormErrorAlert from "../common/FormErrorAlert";
import { useProjectContext } from "../../context/ProjectContext";
import Button from "../common/Button";

const SampleRowsForm = ({ projectId, onClose }: { projectId: string; onClose: () => void }) => {
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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const size = parseInt(sampleSize, 10);

    if (!sampleSize || isNaN(size) || size <= 0) {
      handleError({ response: { data: { detail: "Sample size must be a positive integer" } } });
      return;
    }

    setLoading(true);
    clearError();
    try {
      const params: { sample_size: number; random_seed?: number } = { sample_size: size };

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

  const handleCancel = () => {
    if (isPreviewMode) {
      cancelPreview();
    } else {
      onClose();
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label className="block mb-1 text-sm font-medium text-foreground">Sample Size:</label>
          <input
            type="number"
            min="1"
            step="1"
            value={sampleSize}
            onChange={(e) => setSampleSize(e.target.value)}
            placeholder="e.g., 100"
            className="border border-app-border rounded-md px-3 py-2 w-full bg-surface text-foreground focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
            required
          />
        </div>
        <div className="mb-4">
          <label className="block mb-1 text-sm font-medium text-foreground">
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
            className="border border-app-border rounded-md px-3 py-2 w-full bg-surface text-foreground focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="flex justify-between">
          <div className="flex gap-2">
            <Button type="submit" disabled={loading || saving || !sampleSize || isPreviewMode}>
              Apply Sample
            </Button>
            {isPreviewMode && (
              <Button type="button" onClick={handleSave} disabled={saving} variant="success">
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            )}
          </div>
          <Button type="button" variant="secondary" onClick={handleCancel}>
            Cancel
          </Button>
        </div>
        <FormErrorAlert message={error} />
      </form>
    </div>
  );
};

export default SampleRowsForm;
