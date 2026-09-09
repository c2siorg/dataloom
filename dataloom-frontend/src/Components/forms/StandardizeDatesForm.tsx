import { captureStep, type TransformFormProps } from "./transformFormProps";
import { useState, FormEvent } from "react";
import { transformProject } from "../../api";
import { useProjectContext } from "../../context/ProjectContext";
import usePreviewSave from "../../hooks/usePreviewSave";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";
import ColumnSelect from "../common/ColumnSelect";
import Select from "../common/Select";
import Button from "../common/Button";

/** Mirrors OperationType.standardizeDates in dataloom-backend/app/schemas.py. */
const STANDARDIZE_DATES = "standardizeDates";

const OUTPUT_FORMATS = [
  { value: "iso", label: "ISO (YYYY-MM-DD)" },
  { value: "dmy", label: "Day first (DD-MM-YYYY)" },
  { value: "mdy", label: "Month first (MM-DD-YYYY)" },
];

const StandardizeDatesForm = ({ projectId, onClose, onCapture }: TransformFormProps) => {
  const { pageSize, isPreviewMode, enterPreviewMode, cancelPreview } = useProjectContext();

  const [column, setColumn] = useState("");
  const [outputFormat, setOutputFormat] = useState("iso");
  const [loading, setLoading] = useState(false);
  const { error, setError, clearError, handleError } = useError();
  const { saving, handleSave } = usePreviewSave({ clearError, handleError, onClose });

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    clearError();

    if (!column) {
      setError("Please select a column.");
      return;
    }

    setLoading(true);

    try {
      const payload = {
        operation_type: STANDARDIZE_DATES,
        standardize_dates_params: {
          column,
          output_format: outputFormat,
        },
      };
      if (captureStep(onCapture, payload)) return;

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
    } catch (error) {
      handleError(error);
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
          <label className="block text-sm font-medium text-foreground">Column:</label>
          <ColumnSelect value={column} onChange={setColumn} placeholder="Select column..." />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-foreground">Output Format:</label>
          <Select value={outputFormat} onChange={setOutputFormat} options={OUTPUT_FORMATS} />
        </div>

        <div className="flex justify-between">
          <div className="flex gap-2">
            <Button type="submit" disabled={loading || saving || isPreviewMode}>
              {loading ? "Applying..." : "Apply"}
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

export default StandardizeDatesForm;
