import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { transformProject, getProjectDetails } from "../../api";
import { useProjectContext } from "../../context/ProjectContext";
import usePreviewSave from "../../hooks/usePreviewSave";
import ColumnMultiSelect from "../common/ColumnMultiSelect";
import Button from "../common/Button";

const MeltForm = ({ projectId, onClose }) => {
  const [columns, setColumns] = useState([]);
  const [idVars, setIdVars] = useState([]);
  const [valueVars, setValueVars] = useState([]);
  const [varName, setVarName] = useState("variable");
  const [valueName, setValueName] = useState("value");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { isPreviewMode, enterPreviewMode, cancelPreview } = useProjectContext();
  const { saving, handleSave } = usePreviewSave({
    clearError: () => setError(null),
    handleError: (err) => setError(err.response?.data?.detail || err.message),
    onClose,
  });

  useEffect(() => {
    const fetchProjectDetails = async () => {
      try {
        const data = await getProjectDetails(projectId);
        setColumns(data.columns || []);
      } catch (err) {
        console.error("Error fetching columns:", err);
        setError("Failed to load dataset columns. Please close and reopen the form.");
      }
    };
    fetchProjectDetails();
  }, [projectId]);

  const handleCancel = () => {
    if (isPreviewMode) {
      cancelPreview();
    } else {
      onClose();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validation: overlap
    if (idVars.length === 0) {
      setError("Please select at least one ID variable.");
      setLoading(false);
      return;
    }

    const effectiveValueVars =
      valueVars.length > 0 ? valueVars : columns.filter((col) => !idVars.includes(col));

    const overlap = idVars.filter((v) => effectiveValueVars.includes(v));
    if (overlap.length > 0) {
      setError(`Columns cannot be in both ID and Value variables: ${overlap.join(", ")}`);
      setLoading(false);
      return;
    }

    try {
      const finalVarName = varName.trim() || "variable";
      const finalValueName = valueName.trim() || "value";

      const payload = {
        operation_type: "melt",
        melt_params: {
          id_vars: idVars,
          value_vars: effectiveValueVars,
          var_name: finalVarName,
          value_name: finalValueName,
        },
      };
      const response = await transformProject(projectId, payload, { preview: true });
      enterPreviewMode(response.columns, response.rows, response.dtypes, { projectId, payload });
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-danger-bg text-danger p-2 rounded text-sm border border-danger-border">
            {typeof error === "string" ? error : JSON.stringify(error, null, 2)}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              ID Variables (Keep as columns):
            </label>
            <ColumnMultiSelect value={idVars} onChange={setIdVars} options={columns} />
            <p className="text-[10px] text-gray-400 mt-1">Columns that remain as identifiers.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Value Variables (to unpivot):
            </label>
            <ColumnMultiSelect value={valueVars} onChange={setValueVars} options={columns} />
            <p className="text-[10px] text-gray-400 mt-1">
              Leave empty to unpivot all non-ID columns.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Variable Name:</label>
            <input
              type="text"
              value={varName}
              onChange={(e) => setVarName(e.target.value)}
              className="border border-app-border rounded-md w-full px-3 py-2 bg-surface text-gray-900 focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="default: variable"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Value Name:</label>
            <input
              type="text"
              value={valueName}
              onChange={(e) => setValueName(e.target.value)}
              className="border border-app-border rounded-md w-full px-3 py-2 bg-surface text-foreground focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="default: value"
            />
          </div>
        </div>

        <div className="flex justify-between pt-2">
          <div className="flex gap-2">
            <Button type="submit" disabled={loading || saving || isPreviewMode}>
              {loading ? "Processing..." : "Apply Melt"}
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
      </form>
    </div>
  );
};

MeltForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default MeltForm;
