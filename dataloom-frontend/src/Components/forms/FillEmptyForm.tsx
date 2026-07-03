import { useState, FormEvent } from "react";
import { transformProject } from "../../api";
import { useProjectContext } from "../../context/ProjectContext";
import usePreviewSave from "../../hooks/usePreviewSave";
import { useToast } from "../../context/ToastContext";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";
import ColumnSelect from "../common/ColumnSelect";
import Select from "../common/Select";
import Button from "../common/Button";

const STRATEGIES = [
  { value: "custom", label: "Custom Value" },
  { value: "mean", label: "Mean" },
  { value: "median", label: "Median" },
  { value: "mode", label: "Mode" },
  { value: "ffill", label: "Forward Fill" },
  { value: "bfill", label: "Backward Fill" },
];

const FillEmptyForm = ({ projectId, onClose }: { projectId: string; onClose: () => void }) => {
  const { columns, isPreviewMode, enterPreviewMode, cancelPreview } = useProjectContext();
  const { showToast } = useToast();
  const { error, clearError, handleError } = useError();
  const [loading, setLoading] = useState(false);
  const { saving, handleSave } = usePreviewSave({ clearError, handleError, onClose });

  const [selectedColumn, setSelectedColumn] = useState("");
  const [strategy, setStrategy] = useState("custom");
  const [fillValue, setFillValue] = useState("");

  const requiresColumn = ["mean", "median", "mode"].includes(strategy);
  const isSubmitDisabled = requiresColumn && selectedColumn === "";

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    clearError();

    if (requiresColumn && selectedColumn === "") {
      showToast("Please select a column to use mean, median, or mode.", "error");
      return;
    }

    const columnIndex = selectedColumn !== "" ? columns.indexOf(selectedColumn) : null;

    setLoading(true);
    try {
      const payload = {
        operation_type: "fillEmpty",
        fill_empty_params: {
          index: columnIndex,
          strategy,
          fill_value: strategy === "custom" ? fillValue : null,
        },
      };
      const response = await transformProject(projectId, payload, { preview: true });
      enterPreviewMode(response.columns, response.rows, response.dtypes, { projectId, payload });
    } catch (err) {
      handleError(err);
      showToast(
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ||
          "Failed to fill empty cells.",
        "error",
      );
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
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Column:</label>
          <ColumnSelect
            value={selectedColumn}
            onChange={setSelectedColumn}
            includeEmptyOption
            emptyLabel="All columns"
            required={false}
          />
          <p className="text-xs text-gray-400 mt-1">
            Note: Mean, median, and mode require a specific column.
          </p>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Strategy:</label>
          <Select value={strategy} onChange={setStrategy} options={STRATEGIES} />
        </div>

        {strategy === "custom" && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Fill Value:</label>
            <input
              type="text"
              value={fillValue}
              onChange={(e) => setFillValue(e.target.value)}
              placeholder="Enter value"
              className="border border-gray-300 rounded-md w-full px-3 py-2 bg-white text-gray-900"
              required
            />
          </div>
        )}

        <FormErrorAlert message={error} />

        <div className="flex justify-between mt-2">
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={isSubmitDisabled || loading || saving || isPreviewMode}
            >
              {loading ? "Applying..." : "Apply"}
            </Button>
            {isPreviewMode && (
              <Button
                type="button"
                onClick={handleSave}
                disabled={saving}
                variant="success"
              >
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            )}
          </div>

          <Button
            type="button"
            onClick={handleCancel}
            variant="secondary"
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};

export default FillEmptyForm;
