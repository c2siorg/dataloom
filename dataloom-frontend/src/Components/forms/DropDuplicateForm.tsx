import { useState, FormEvent } from "react";
import { transformProject } from "../../api";
import { DROP_DUPLICATE } from "../../constants/operationTypes";
import useError from "../../hooks/useError";
import usePreviewSave from "../../hooks/usePreviewSave";
import FormErrorAlert from "../common/FormErrorAlert";
import { useProjectContext } from "../../context/ProjectContext";
import ColumnMultiSelect from "../common/ColumnMultiSelect";
import Select from "../common/Select";
import Button from "../common/Button";

const KEEP_OPTIONS = [
  { value: "first", label: "First" },
  { value: "last", label: "Last" },
];

const DropDuplicateForm = ({ projectId, onClose }: { projectId: string; onClose: () => void }) => {
  const [columns, setColumns] = useState<string[]>([]);
  const [keep, setKeep] = useState("first");
  const { error, setError, clearError, handleError } = useError();
  const { isPreviewMode, enterPreviewMode, cancelPreview } = useProjectContext();
  const { saving, handleSave } = usePreviewSave({
    clearError,
    handleError,
    onClose,
  });

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    clearError();

    if (columns.length === 0) {
      setError("Please select at least one column.");
      return;
    }

    const transformationInput = {
      operation_type: DROP_DUPLICATE,
      drop_duplicate: {
        columns: columns.join(","),
        keep: keep,
      },
    };

    try {
      const response = await transformProject(projectId, transformationInput, { preview: true });
      enterPreviewMode(response.columns, response.rows, response.dtypes, {
        projectId,
        payload: transformationInput,
      });
    } catch (err) {
      console.error("Error transforming project:", err);
      handleError(err);
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
          <label className="block text-sm font-medium text-foreground">Columns:</label>
          <ColumnMultiSelect value={columns} onChange={setColumns} required />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-foreground">Keep:</label>
          <Select value={keep} onChange={setKeep} options={KEEP_OPTIONS} />
        </div>
        <div className="flex justify-between">
          <div className="flex gap-2">
            <Button type="submit" disabled={saving || isPreviewMode}>
              Submit
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

export default DropDuplicateForm;
