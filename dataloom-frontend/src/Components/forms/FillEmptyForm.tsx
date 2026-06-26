import { useState, FormEvent } from "react";
import { transformProject } from "../../api";
import { useProjectContext } from "../../context/ProjectContext";
import { useHistoryRefresh } from "../../context/HistoryRefreshContext";
import { useToast } from "../../context/ToastContext";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";
import ColumnSelect from "../common/ColumnSelect";
import Select from "../common/Select";

const STRATEGIES = [
  { value: "custom", label: "Custom Value" },
  { value: "mean", label: "Mean" },
  { value: "median", label: "Median" },
  { value: "mode", label: "Mode" },
  { value: "ffill", label: "Forward Fill" },
  { value: "bfill", label: "Backward Fill" },
];

const FillEmptyForm = ({ projectId, onClose }: { projectId: string; onClose: () => void }) => {
  const { columns, refreshProject, pageSize } = useProjectContext();
  const { refreshLogs } = useHistoryRefresh();
  const { showToast } = useToast();
  const { error, clearError, handleError } = useError();

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

    try {
      await transformProject(projectId, {
        operation_type: "fillEmpty",
        fill_empty_params: {
          index: columnIndex,
          strategy,
          fill_value: strategy === "custom" ? fillValue : null,
        },
      });

      await refreshProject(projectId, 1, pageSize);
      refreshLogs();
      onClose();
    } catch (err) {
      handleError(err);
      showToast(
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ||
          "Failed to fill empty cells.",
        "error",
      );
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
          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md font-medium transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Apply
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
    </div>
  );
};

export default FillEmptyForm;
