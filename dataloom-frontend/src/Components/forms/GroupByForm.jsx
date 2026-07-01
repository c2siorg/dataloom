import { useState } from "react";
import PropTypes from "prop-types";
import { transformProject } from "../../api";
import { GROUPBY } from "../../constants/operationTypes";
import TransformResultPreview from "./TransformResultPreview";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";
import { useProjectContext } from "../../context/ProjectContext";
import { useHistoryRefresh } from "../../context/HistoryRefreshContext";
import ColumnSelect from "../common/ColumnSelect";
import ColumnMultiSelect from "../common/ColumnMultiSelect";
import Select from "../common/Select";
import Button from "../common/Button";
import { AGG_FUNCTIONS } from "../../constants/aggregations";

const GroupByForm = ({ projectId, onClose }) => {
  const { columns: availableColumns, updateData, refreshProject, pageSize } = useProjectContext();
  const { refreshLogs } = useHistoryRefresh();
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [aggColumn, setAggColumn] = useState("");
  const [aggFunction, setAggFunction] = useState("sum");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const { error, clearError, handleError } = useError();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedColumns.length === 0) return;
    if (!aggColumn) return;

    setLoading(true);
    clearError();
    try {
      const response = await transformProject(projectId, {
        operation_type: GROUPBY,
        groupby_params: {
          columns: selectedColumns,
          agg_column: aggColumn,
          agg_function: aggFunction,
        },
      });
      setResult(response);
      updateData(response.columns, response.rows, {
        dtypes: response.dtypes,
        resetColumnOrder: false,
      });
      await refreshProject(projectId, 1, pageSize);
      refreshLogs();
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label className="block mb-1 text-sm font-medium text-gray-700">Group By Columns:</label>
          <ColumnMultiSelect
            value={selectedColumns}
            onChange={setSelectedColumns}
            options={availableColumns}
            required
          />
        </div>
        <div className="mb-3">
          <label className="block mb-1 text-sm font-medium text-gray-700">
            Aggregation Column:
          </label>
          <ColumnSelect
            value={aggColumn}
            onChange={setAggColumn}
            options={availableColumns.filter((col) => !selectedColumns.includes(col))}
            required
          />
        </div>
        <div className="mb-4">
          <label className="block mb-1 text-sm font-medium text-gray-700">Function:</label>
          <Select value={aggFunction} onChange={setAggFunction} options={AGG_FUNCTIONS} />
        </div>
        <div className="flex justify-between">
          <Button type="submit" disabled={loading || selectedColumns.length === 0 || !aggColumn}>
            Apply GroupBy
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
        <FormErrorAlert message={error} />
      </form>
      {result && <TransformResultPreview columns={result.columns} rows={result.rows} />}
    </div>
  );
};

GroupByForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default GroupByForm;
