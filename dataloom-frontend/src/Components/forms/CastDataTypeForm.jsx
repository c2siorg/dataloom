import { useState } from "react";
import PropTypes from "prop-types";
import { transformProject } from "../../api";
import { CAST_DATA_TYPE } from "../../constants/operationTypes";
import { useToast } from "../../context/ToastContext";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";
import ColumnSelect from "../common/ColumnSelect";
import { useProjectContext } from "../../context/ProjectContext";
import Button from "../common/Button";

const CastDataTypeForm = ({ projectId, onClose }) => {
  const { showToast } = useToast();

  const [column, setColumn] = useState("");
  const [targetType, setTargetType] = useState("string");
  const { error, clearError, handleError } = useError();
  const { updateData, refreshProject, pageSize } = useProjectContext();

  const handleSubmit = async (e) => {
    e.preventDefault();

    clearError();
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
              onChange={(e) => setColumn(e.target.value)}
              placeholder="Select column..."
            />
          </div>

          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700">Target Type:</label>
            <select
              value={targetType}
              onChange={(e) => setTargetType(e.target.value)}
              className="border border-gray-300 rounded-md w-full px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
            >
              <option value="string">String</option>
              <option value="integer">Integer</option>
              <option value="float">Float</option>
              <option value="boolean">Boolean</option>
              <option value="datetime">DateTime</option>
            </select>
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
