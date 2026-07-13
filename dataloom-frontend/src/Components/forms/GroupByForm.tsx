import { useState, useRef, useEffect, FormEvent } from "react";
import { transformProject } from "../../api";
import { GROUPBY } from "../../constants/operationTypes";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";
import { useProjectContext } from "../../context/ProjectContext";
import usePreviewSave from "../../hooks/usePreviewSave";
import ColumnSelect from "../common/ColumnSelect";
import ColumnMultiSelect from "../common/ColumnMultiSelect";
import Select from "../common/Select";
import Button from "../common/Button";
import { AGG_FUNCTIONS } from "../../constants/aggregations";

const GroupByForm = ({ projectId, onClose }: { projectId: string; onClose: () => void }) => {
  const {
    columns: availableColumns,
    isPreviewMode,
    enterPreviewMode,
    cancelPreview,
  } = useProjectContext();
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [aggColumn, setAggColumn] = useState("");
  const [aggFunction, setAggFunction] = useState("sum");
  const [loading, setLoading] = useState(false);
  const { error, clearError, handleError } = useError();
  const { saving, handleSave } = usePreviewSave({ clearError, handleError, onClose });
  const cancelledRef = useRef(false);
  const cancelPreviewRef = useRef(cancelPreview);
  const isPreviewModeRef = useRef(isPreviewMode);
  cancelPreviewRef.current = cancelPreview;
  isPreviewModeRef.current = isPreviewMode;

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (isPreviewModeRef.current) {
        cancelPreviewRef.current();
      }
    };
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (selectedColumns.length === 0) return;
    if (!aggColumn) return;

    setLoading(true);
    clearError();
    try {
      const payload = {
        operation_type: GROUPBY,
        groupby_params: {
          columns: selectedColumns,
          agg_column: aggColumn,
          agg_function: aggFunction,
        },
      };
      const response = await transformProject(projectId, payload, { preview: true });
      if (cancelledRef.current) return;
      enterPreviewMode(response.columns, response.rows, response.dtypes, { projectId, payload });
    } catch (err) {
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
    <div data-testid="groupby-form">
      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label className="block mb-1 text-sm font-medium text-foreground">
            Group By Columns:
          </label>
          <ColumnMultiSelect
            value={selectedColumns}
            onChange={setSelectedColumns}
            options={availableColumns}
            required
          />
        </div>
        <div className="mb-3">
          <label className="block mb-1 text-sm font-medium text-foreground">
            Aggregation Column:
          </label>
          <ColumnSelect
            value={aggColumn}
            onChange={setAggColumn}
            options={availableColumns.filter((col: string) => !selectedColumns.includes(col))}
            required
            data-testid="groupby-agg-column"
          />
        </div>
        <div className="mb-4">
          <label className="block mb-1 text-sm font-medium text-foreground">Function:</label>
          <Select value={aggFunction} onChange={setAggFunction} options={AGG_FUNCTIONS} />
        </div>
        <div className="flex justify-between">
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={
                loading || saving || isPreviewMode || selectedColumns.length === 0 || !aggColumn
              }
            >
              {loading ? "Applying..." : "Apply GroupBy"}
            </Button>
            {isPreviewMode && (
              <Button type="button" onClick={handleSave} disabled={saving} variant="success">
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            )}
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={handleCancel}
            disabled={loading || saving}
          >
            Cancel
          </Button>
        </div>
        <FormErrorAlert message={error} />
      </form>
    </div>
  );
};

export default GroupByForm;
