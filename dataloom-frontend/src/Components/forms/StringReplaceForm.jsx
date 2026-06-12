import { useState } from "react";
import PropTypes from "prop-types";
import { transformProject } from "../../api";
import { useProjectContext } from "../../context/ProjectContext";
import { useToast } from "../../context/ToastContext";
import { STRING_REPLACE } from "../../constants/operationTypes";
import Button from "../common/Button";

const StringReplaceForm = ({ projectId, onClose }) => {
  const { columns, updateData, refreshProject, pageSize } = useProjectContext();
  const { showToast } = useToast();

  const [column, setColumn] = useState("");
  const [findValue, setFindValue] = useState("");
  const [replaceValue, setReplaceValue] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await transformProject(projectId, {
        operation_type: STRING_REPLACE,
        string_replace_params: {
          column,
          find_value: findValue,
          replace_value: replaceValue,
        },
      });

      updateData(response.columns, response.rows, {
        dtypes: response.dtypes,
        resetColumnOrder: false,
      });
      await refreshProject(projectId, 1, pageSize);
      onClose();
    } catch (error) {
      console.error("Error replacing string:", error);
      const detail = error.response?.data?.detail;
      const message =
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail.map((e) => e.msg ?? JSON.stringify(e)).join(", ")
            : "Failed to replace string.";

      showToast(message, "error");
    }
  };

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <form onSubmit={handleSubmit}>
        <h3 className="font-semibold text-gray-900 mb-2">Find & Replace</h3>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700">Column:</label>
          <select
            value={column}
            onChange={(e) => setColumn(e.target.value)}
            className="border border-gray-300 rounded-md w-full px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
            required
          >
            <option value="">Select column...</option>
            {columns.map((col) => (
              <option key={col} value={col}>
                {col}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-4">
          <label htmlFor="find-value" className="block text-sm font-medium text-gray-700">
            Find:
          </label>
          <input
            id="find-value"
            type="text"
            placeholder="Text to find"
            value={findValue}
            onChange={(e) => setFindValue(e.target.value)}
            className="border border-gray-300 rounded-md w-full px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
            required
          />
        </div>

        <div className="mb-4">
          <label htmlFor="replace-value" className="block text-sm font-medium text-gray-700">
            Replace with:
          </label>
          <input
            id="replace-value"
            type="text"
            placeholder="Replacement text"
            value={replaceValue}
            onChange={(e) => setReplaceValue(e.target.value)}
            className="border border-gray-300 rounded-md w-full px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="flex justify-between">
          <Button type="submit">Apply</Button>

          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};

StringReplaceForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default StringReplaceForm;
