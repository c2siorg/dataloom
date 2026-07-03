import { useState } from "react";
import PropTypes from "prop-types";
import { transformProject } from "../../api";
import { useProjectContext } from "../../context/ProjectContext";
import usePreviewSave from "../../hooks/usePreviewSave";
import { STRING_REPLACE } from "../../constants/operationTypes";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";
import ColumnSelect from "../common/ColumnSelect";
import Button from "../common/Button";

const StringReplaceForm = ({ projectId, onClose }) => {
  const { isPreviewMode, enterPreviewMode, cancelPreview } = useProjectContext();

  const [column, setColumn] = useState("");
  const [findValue, setFindValue] = useState("");
  const [replaceValue, setReplaceValue] = useState("");
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
        operation_type: STRING_REPLACE,
        string_replace_params: {
          column,
          find_value: findValue,
          replace_value: replaceValue,
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
          <ColumnSelect value={column} onChange={setColumn} required />
        </div>

        <div className="mb-4">
          <label htmlFor="find-value" className="block text-sm font-medium text-gray-700">
            Find:
          </label>
          <input
            id="find-value"
            type="text"
            placeholder="Text to find"
            value={findValue}
            onChange={(e) => setFindValue(e.target.value)}
            className="border border-gray-300 rounded-md w-full px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
            required
          />
        </div>

        <div className="mb-4">
          <label htmlFor="replace-value" className="block text-sm font-medium text-gray-700">
            Replace with:
          </label>
          <input
            id="replace-value"
            type="text"
            placeholder="Replacement text"
            value={replaceValue}
            onChange={(e) => setReplaceValue(e.target.value)}
            className="border border-gray-300 rounded-md w-full px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
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

StringReplaceForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default StringReplaceForm;
