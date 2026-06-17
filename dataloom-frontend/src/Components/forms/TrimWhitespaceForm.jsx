import { useState } from "react";
import PropTypes from "prop-types";
import { transformProject } from "../../api";
import { TRIM_WHITESPACE } from "../../constants/operationTypes";
import { useProjectContext } from "../../context/ProjectContext";
import { useToast } from "../../context/ToastContext";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";
import ColumnSelect from "../common/ColumnSelect";
import Button from "../common/Button";

const TrimWhitespaceForm = ({ projectId, onClose }) => {
  const { columns, updateData, refreshProject, pageSize } = useProjectContext();
  const { showToast } = useToast();

  const [column, setColumn] = useState("");
  const [loading, setLoading] = useState(false);
  const { error, setError, clearError } = useError();

  const handleSubmit = async (e) => {
    e.preventDefault();

    clearError();

    if (!column) {
      setError("Please select a column.");
      return;
    }

    setLoading(true);

    try {
      const response = await transformProject(projectId, {
        operation_type: TRIM_WHITESPACE,
        trim_whitespace_params: {
          column,
        },
      });

      updateData(response.columns, response.rows, {
        dtypes: response.dtypes,
        resetColumnOrder: false,
      });
      await refreshProject(projectId, 1, pageSize);
      onClose();
    } catch (error) {
      console.error("Error trimming whitespace:", error);

      showToast(error.response?.data?.detail || "Failed to trim whitespace.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <form onSubmit={handleSubmit}>
        <h3 className="font-semibold text-gray-900 mb-2">Trim Whitespace</h3>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700">Column:</label>
          <ColumnSelect
            value={column}
            onChange={setColumn}
            options={["All string columns", ...columns]}
            required
          />
        </div>

        <div className="flex justify-between">
          <Button type="submit" disabled={loading}>
            {loading ? "Applying..." : "Apply"}
          </Button>

          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
      <FormErrorAlert message={error} />
    </div>
  );
};

TrimWhitespaceForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default TrimWhitespaceForm;
