import { useState } from "react";
import PropTypes from "prop-types";
import { LuType } from "react-icons/lu";
import { transformProject } from "../../api";
import { CAST_DATA_TYPE } from "../../constants/operationTypes";
import { useToast } from "../../context/ToastContext";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";
import ColumnSelect from "../common/ColumnSelect";

const CastDataTypeForm = ({ projectId, onClose, onTransform }) => {
  const { showToast } = useToast();

  const [column, setColumn] = useState("");
  const [targetType, setTargetType] = useState("string");
  const { error, clearError, handleError } = useError();

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

      onTransform(response);
      onClose();
    } catch (err) {
      console.error("Error casting data type:", err);
      showToast(err.response?.data?.detail || "Failed to cast data type.", "error");
      handleError(err);
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm mb-8 mx-8 overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 shadow-sm ring-1 ring-inset ring-blue-100">
              <LuType className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                Cast Data Type
              </h3>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                Convert a column to a different data type.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-200/50 rounded-lg transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-tight">
                Column:
              </label>
              <ColumnSelect
                value={column}
                onChange={(e) => setColumn(e.target.value)}
                placeholder="Select column..."
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-tight">
                Target Type:
              </label>
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none transition-all appearance-none cursor-pointer"
              >
                <option value="string">String</option>
                <option value="integer">Integer</option>
                <option value="float">Float</option>
                <option value="boolean">Boolean</option>
                <option value="datetime">DateTime</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-50">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 text-sm font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-50 rounded-lg transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-blue-500 hover:bg-blue-600 text-white px-8 py-2 rounded-lg font-bold text-sm shadow-lg shadow-blue-100 transition-all active:scale-95"
            >
              Apply Cast
            </button>
          </div>
        </form>
        {error && (
          <div className="mt-6">
            <FormErrorAlert message={error} />
          </div>
        )}
      </div>
    </div>
  );
};

CastDataTypeForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onTransform: PropTypes.func.isRequired,
};

export default CastDataTypeForm;
