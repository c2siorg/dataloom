import { useState } from "react";
import PropTypes from "prop-types";
import { transformProject } from "../../api";
import { ADV_QUERY_FILTER } from "../../constants/operationTypes";
import useError from "../../hooks/useError";
import usePreviewSave from "../../hooks/usePreviewSave";
import FormErrorAlert from "../common/FormErrorAlert";
import { useProjectContext } from "../../context/ProjectContext";
import Button from "../common/Button";

const AdvQueryFilterForm = ({ projectId, onClose }) => {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const { error, clearError, handleError } = useError();
  const { isPreviewMode, enterPreviewMode, cancelPreview } = useProjectContext();
  const { saving, handleSave } = usePreviewSave({
    clearError,
    handleError,
    onClose,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    clearError();
    try {
      const payload = {
        operation_type: ADV_QUERY_FILTER,
        adv_query: { query },
      };
      const response = await transformProject(projectId, payload, { preview: true });
      enterPreviewMode(response.columns, response.rows, response.dtypes, { projectId, payload });
    } catch (err) {
      console.error("Error applying query:", err.message);
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
        <div className="mb-2">
          <label className="block text-sm font-medium text-foreground">Query:</label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border border-app-border rounded-md w-full px-3 py-2 bg-surface text-foreground focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
            placeholder="e.g., col1 > 10 and col2 < 5"
            required
          />
        </div>
        <div className="flex justify-between">
          <div className="flex gap-2">
            <Button disabled={loading || saving || isPreviewMode} type="submit">
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

AdvQueryFilterForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default AdvQueryFilterForm;
