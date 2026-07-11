import { useState } from "react";
import PropTypes from "prop-types";
import useError from "../../hooks/useError";
import { transformProject } from "../../api";
import { PIVOT_TABLES } from "../../constants/operationTypes";
import FormErrorAlert from "../common/FormErrorAlert";
import ColumnSelect from "../common/ColumnSelect";
import ColumnMultiSelect from "../common/ColumnMultiSelect";
import Select from "../common/Select";
import { useProjectContext } from "../../context/ProjectContext";
import usePreviewSave from "../../hooks/usePreviewSave";
import Button from "../common/Button";
import { AGG_FUNCTIONS } from "../../constants/aggregations";

const PivotTableForm = ({ projectId, onClose }) => {
  const [index, setIndex] = useState([]);
  const [column, setColumn] = useState("");
  const [value, setValue] = useState("");
  const [aggfun, setAggfun] = useState("sum");
  const [loading, setLoading] = useState(false);
  const { error, setError, clearError, handleError } = useError();
  const { isPreviewMode, enterPreviewMode, cancelPreview } = useProjectContext();
  const { saving, handleSave } = usePreviewSave({ clearError, handleError, onClose });

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();

    if (index.length === 0) {
      setError("Please select at least one index column.");
      return;
    }

    if (!column || !value) {
      setError("Please select a column and a value.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        operation_type: PIVOT_TABLES,
        pivot_query: { index: index.join(","), column, value, aggfun },
      };
      const response = await transformProject(projectId, payload, { preview: true });
      enterPreviewMode(response.columns, response.rows, response.dtypes, { projectId, payload });
    } catch (err) {
      console.error("Error applying pivot table:", err.message);
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
          <label className="block text-sm font-medium text-foreground">Index:</label>
          <ColumnMultiSelect value={index} onChange={setIndex} required />
        </div>
        <div className="mb-3">
          <label className="block text-sm font-medium text-foreground">Column:</label>
          <ColumnSelect
            value={column}
            onChange={(value) => setColumn(value)}
            placeholder="Select column..."
          />
        </div>
        <div className="mb-3">
          <label className="block text-sm font-medium text-foreground">Value:</label>
          <ColumnSelect
            value={value}
            onChange={(value) => setValue(value)}
            placeholder="Select column..."
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-foreground">Aggregation Function:</label>
          <Select value={aggfun} onChange={setAggfun} options={AGG_FUNCTIONS} />
        </div>
        <div className="flex justify-between">
          <div className="flex gap-2">
            <Button type="submit" disabled={loading || saving || isPreviewMode}>
              {loading ? "Submitting..." : "Submit"}
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

PivotTableForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default PivotTableForm;
