import { useState } from "react";
import PropTypes from "prop-types";
import { transformProject } from "../../api";
import { TRIM_WHITESPACE } from "../../constants/operationTypes";
import { useProjectContext } from "../../context/ProjectContext";
import usePreviewSave from "../../hooks/usePreviewSave";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";
import ColumnSelect from "../common/ColumnSelect";
import Button from "../common/Button";
const TrimWhitespaceForm = ({ projectId, onClose }) => {
  const { columns, isPreviewMode, enterPreviewMode, cancelPreview } = useProjectContext();

  const [column, setColumn] = useState("");
  const [loading, setLoading] = useState(false);
  const { error, setError, clearError, handleError } = useError();
  const { saving, handleSave } = usePreviewSave({ clearError, handleError, onClose });

  const handleSubmit = async (e) => {
    e.preventDefault();

    clearError();

    if (!column) {
      setError("Please select a column.");
      return;
    }

    setLoading(true);

    try {
      const payload = {
        operation_type: TRIM_WHITESPACE,
        trim_whitespace_params: {
          column,
        },
      };
      const response = await transformProject(projectId, payload, { preview: true });
      enterPreviewMode(response.columns, response.rows, response.dtypes, { projectId, payload });
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
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700">Column:</label>
          <ColumnSelect
            value={column}
            onChange={setColumn}
            options={["All string columns", ...columns]}
            required
          />
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

TrimWhitespaceForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default TrimWhitespaceForm;
