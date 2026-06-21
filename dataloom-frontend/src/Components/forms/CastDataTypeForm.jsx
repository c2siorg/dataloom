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
      onClose();
    } catch (err) {
      console.error("Error casting data type:", err);
      showToast(err.response?.data?.detail || "Failed to cast data type.", "error");
      handleError(err);
    }
  };

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <form onSubmit={handleSubmit}>
        <h3 className="font-semibold text-gray-900 mb-2">Cast Data Type</h3>

        <div className="flex space-x-2 mb-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700">Column:</label>
            <ColumnSelect
              value={column}
              onChange={(value) => setColumn(value)}
              placeholder="Select column..."
            />
          </div>

          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700">Target Type:</label>
            <Select value={targetType} onChange={setTargetType} options={TARGET_TYPES} />
          </div>
        </div>

        <div className="flex justify-between">
          <Button type="submit">Apply</Button>

          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
      <FormErrorAlert message={error} />
    </div>
  );
};

CastDataTypeForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default CastDataTypeForm;
