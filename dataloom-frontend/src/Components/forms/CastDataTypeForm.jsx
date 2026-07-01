import { useState } from "react";
import PropTypes from "prop-types";
import { transformProject } from "../../api";
import { CAST_DATA_TYPE } from "../../constants/operationTypes";
import { useToast } from "../../context/ToastContext";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";
import ColumnSelect from "../common/ColumnSelect";
import Select from "../common/Select";
import { useProjectContext } from "../../context/ProjectContext";
import { useHistoryRefresh } from "../../context/HistoryRefreshContext";
import Button from "../common/Button";

const TARGET_TYPES = [
  { value: "string", label: "String" },
  { value: "integer", label: "Integer" },
  { value: "float", label: "Float" },
  { value: "boolean", label: "Boolean" },
  { value: "datetime", label: "DateTime" },
];

const CastDataTypeForm = ({ projectId, onClose }) => {
  const { showToast } = useToast();

  const [column, setColumn] = useState("");
  const [targetType, setTargetType] = useState("string");
  const { error, setError, clearError, handleError } = useError();
  const { updateData, refreshProject, pageSize } = useProjectContext();
  const { refreshLogs } = useHistoryRefresh();

  const handleSubmit = async (e) => {
    e.preventDefault();

    clearError();

    if (!column) {
      setError("Please select a column.");
      return;
    }

    try {
      const response = await transformProject(projectId, {
        operation_type: CAST_DATA_TYPE,
        cast_data_type_params: {
          column,
          target_type: targetType,
        },
      });

      updateData(response.columns, response.rows, {
        dtypes: response.dtypes,
        resetColumnOrder: false,
      });
      await refreshProject(projectId, 1, pageSize);
      refreshLogs();
      onClose();
    } catch (err) {
      console.error("Error casting data type:", err);
      showToast(err.response?.data?.detail || "Failed to cast data type.", "error");
      handleError(err);
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700">Column:</label>
          <ColumnSelect
            value={column}
            onChange={(value) => setColumn(value)}
            placeholder="Select column..."
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700">Target Type:</label>
          <Select value={targetType} onChange={setTargetType} options={TARGET_TYPES} />
        </div>

        <div className="flex justify-between">
          <Button type="submit">Apply</Button>

          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
        <FormErrorAlert message={error} />
      </form>
    </div>
  );
};

CastDataTypeForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default CastDataTypeForm;
