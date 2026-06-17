import { useState } from "react";
import PropTypes from "prop-types";
import { transformProject } from "../../api";
import { DROP_DUPLICATE } from "../../constants/operationTypes";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";
import { useProjectContext } from "../../context/ProjectContext";
import ColumnMultiSelect from "../common/ColumnMultiSelect";
import Button from "../common/Button";

const DropDuplicateForm = ({ projectId, onClose }) => {
  const [columns, setColumns] = useState([]);
  const [keep, setKeep] = useState("first");
  const { error, setError, clearError, handleError } = useError();
  const { updateData, refreshProject, pageSize } = useProjectContext();

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();

    if (columns.length === 0) {
      setError("Please select at least one column.");
      return;
    }

    const transformationInput = {
      operation_type: DROP_DUPLICATE,
      drop_duplicate: {
        columns: columns.join(","),
        keep: keep,
      },
    };

    try {
      const response = await transformProject(projectId, transformationInput);
      updateData(response.columns, response.rows, {
        dtypes: response.dtypes,
        resetColumnOrder: false,
      });
      await refreshProject(projectId, 1, pageSize);
      onClose(); // Close the form after submission
    } catch (err) {
      console.error("Error transforming project:", err);
      handleError(err);
    }
  };

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <form onSubmit={handleSubmit}>
        <h3 className="font-semibold text-gray-900 mb-2">Drop Duplicate</h3>
        <div className="flex space-x-2 mb-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700">Columns:</label>
            <ColumnMultiSelect value={columns} onChange={setColumns} required />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700">Keep:</label>
            <select
              value={keep}
              onChange={(e) => setKeep(e.target.value)}
              className="border border-gray-300 rounded-md w-full px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
            >
              <option value="first">First</option>
              <option value="last">Last</option>
            </select>
          </div>
        </div>
        <div className="flex justify-between">
          <Button type="submit">Submit</Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
      <FormErrorAlert message={error} />
    </div>
  );
};

DropDuplicateForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default DropDuplicateForm;
