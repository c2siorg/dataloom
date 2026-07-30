import type { TransformFormProps } from "./transformFormProps";
import { useState, FormEvent } from "react";
import { transformProject } from "../../api";
import { useProjectContext } from "../../context/ProjectContext";
import usePreviewSave from "../../hooks/usePreviewSave";
import { useToast } from "../../context/ToastContext";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";
import Button from "../common/Button";
import { ADD_FORMULA_COLUMN } from "../../constants/operationTypes";

const FormulaColumnForm = ({ projectId, onClose, onCapture }: TransformFormProps) => {
  const { columns, pageSize, isPreviewMode, enterPreviewMode, cancelPreview } = useProjectContext();
  const { showToast } = useToast();
  const { error, clearError, handleError } = useError();
  const [loading, setLoading] = useState(false);
  const { saving, handleSave } = usePreviewSave({ clearError, handleError, onClose });

  const [columnName, setColumnName] = useState("");
  const [expression, setExpression] = useState("");

  const insertColumn = (col: string) => {
    setExpression((prev) =>
      prev === "" || prev.endsWith(" ") ? `${prev}${col}` : `${prev} ${col}`,
    );
  };

  const isSubmitDisabled = columnName.trim() === "" || expression.trim() === "";

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    clearError();

    setLoading(true);
    try {
      const payload = {
        operation_type: ADD_FORMULA_COLUMN,
        formula_col_params: {
          column_name: columnName.trim(),
          expression: expression.trim(),
        },
      };
      if (onCapture) {
        onCapture({ action_type: payload.operation_type, action_details: payload });
        return;
      }

      const response = await transformProject(projectId, payload, {
        preview: true,
        page: 1,
        pageSize,
      });
      enterPreviewMode(
        response.columns,
        response.rows,
        response.dtypes,
        { projectId, payload },
        {
          total_rows: response.total_rows,
          total_pages: response.total_pages,
          page: response.page,
          page_size: response.page_size,
        },
      );
    } catch (err) {
      handleError(err);
      showToast(
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ||
          "Failed to add formula column.",
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
          <label className="block text-sm font-medium text-foreground mb-1">New Column Name:</label>
          <input
            type="text"
            value={columnName}
            onChange={(e) => setColumnName(e.target.value)}
            placeholder="e.g. total"
            className="border border-app-border rounded-md w-full px-3 py-2 bg-surface text-foreground focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
            required
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-foreground mb-1">Formula:</label>
          <input
            type="text"
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            placeholder="e.g. price * quantity"
            className="border border-app-border rounded-md w-full px-3 py-2 bg-surface text-foreground font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
            required
          />
          <p className="text-xs text-muted-foreground mt-1">
            Arithmetic (+ - * / % **), comparisons, and and/or on existing columns.
          </p>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-foreground mb-1">Insert Column:</label>
          <div className="flex flex-wrap gap-1">
            {columns.map((col: string) => (
              <button
                key={col}
                type="button"
                onClick={() => insertColumn(col)}
                className="text-xs border border-app-border rounded px-2 py-0.5 bg-surface text-secondary-foreground hover:bg-surface-hover transition-colors"
              >
                {col}
              </button>
            ))}
          </div>
        </div>

        <FormErrorAlert message={error} />

        <div className="flex justify-between mt-2">
          <div className="flex gap-2">
            <Button type="submit" disabled={isSubmitDisabled || loading || saving || isPreviewMode}>
              {loading ? "Applying..." : "Apply"}
            </Button>
            {isPreviewMode && (
              <Button type="button" onClick={handleSave} disabled={saving} variant="success">
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            )}
          </div>

          <Button type="button" onClick={handleCancel} variant="secondary">
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};

export default FormulaColumnForm;
