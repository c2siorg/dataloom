import { useState, FormEvent } from "react";
import { transformProject } from "../../api";
import { CAST_DATA_TYPE } from "../../constants/operationTypes";
import { useToast } from "../../context/ToastContext";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";
import ColumnSelect from "../common/ColumnSelect";
import Select from "../common/Select";
import { useProjectContext } from "../../context/ProjectContext";
import usePreviewSave from "../../hooks/usePreviewSave";
import Button from "../common/Button";

const TARGET_TYPES = [
  { value: "string", label: "String" },
  { value: "integer", label: "Integer" },
  { value: "float", label: "Float" },
  { value: "boolean", label: "Boolean" },
  { value: "datetime", label: "DateTime" },
];

const CastDataTypeForm = ({ projectId, onClose }: { projectId: string; onClose: () => void }) => {
  const { showToast } = useToast();

  const [column, setColumn] = useState("");
  const [targetType, setTargetType] = useState("string");
  const { error, setError, clearError, handleError } = useError();
  const { isPreviewMode, enterPreviewMode, cancelPreview } = useProjectContext();
  const [loading, setLoading] = useState(false);
  const { saving, handleSave } = usePreviewSave({
    clearError,
    handleError,
    onClose,
  });
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
        operation_type: CAST_DATA_TYPE,
        cast_data_type_params: {
          column,
          target_type: targetType,
        },
      };
      const response = await transformProject(projectId, payload, {
        preview: true,
      });

      enterPreviewMode(response.columns, response.rows, response.dtypes, {
        projectId,
        payload,
      });
    } catch (err) {
      console.error("Error casting data type:", err);
      showToast(
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ||
          "Failed to cast data type.",
        "error",
      );
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
          <label className="block text-sm font-medium text-foreground">Column:</label>
          <ColumnSelect
            value={column}
            onChange={(value) => setColumn(value)}
            placeholder="Select column..."
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-foreground">Target Type:</label>
          <Select value={targetType} onChange={setTargetType} options={TARGET_TYPES} />
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

export default CastDataTypeForm;
