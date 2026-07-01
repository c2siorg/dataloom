import { useState } from "react";
import PropTypes from "prop-types";
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

const DropDuplicateForm = ({ projectId, onClose }) => {
  const [columns, setColumns] = useState([]);
  const [keep, setKeep] = useState("first");
  const { error, setError, clearError, handleError } = useError();
  const { isPreviewMode, enterPreviewMode, cancelPreview } = useProjectContext();
  const { saving, handleSave } = usePreviewSave({
    clearError,
    handleError,
    onClose,
  });

  const handleSubmit = async (e) => {
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

  const handleClose = () => {
    if (isPreviewMode) {
      cancelPreview();
    }
    onClose();
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700">Columns:</label>
          <ColumnMultiSelect value={columns} onChange={setColumns} required />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700">Keep:</label>
          <Select value={keep} onChange={setKeep} options={KEEP_OPTIONS} />
        </div>
        <div className="flex justify-between">
          <div className="flex gap-2">
            <Button type="submit" disabled={saving || isPreviewMode}>
              Submit
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

DropDuplicateForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default DropDuplicateForm;
