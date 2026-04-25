import { useState } from "react";
import PropTypes from "prop-types";
import { LuTrash2 } from "react-icons/lu";
import { transformProject } from "../../api";
import { DROP_DUPLICATE } from "../../constants/operationTypes";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";

const DropDuplicateForm = ({ projectId, onClose, onTransform }) => {
  const [columns, setColumns] = useState("");
  const [keep, setKeep] = useState("first");
  const { error, clearError, handleError } = useError();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const transformationInput = {
      operation_type: DROP_DUPLICATE,
      drop_duplicate: {
        columns: columns,
        keep: keep,
      },
    };

    clearError();
    try {
      const response = await transformProject(projectId, transformationInput);
      console.log("Transformation response:", response);
      onTransform(response); // Pass data to parent component
      onClose(); // Close the form after submission
    } catch (err) {
      console.error("Error transforming project:", err);
      handleError(err);
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm mb-8 mx-8 overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 shadow-sm ring-1 ring-inset ring-blue-100">
              <LuTrash2 className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                Drop Duplicate
              </h3>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                Remove duplicate rows based on specific columns.
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
                Columns:
              </label>
              <input
                type="text"
                value={columns}
                onChange={(e) => setColumns(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none transition-all"
                placeholder="e.g., col1,col2"
                required
              />
              <p className="text-[10px] text-slate-400">Separate multiple columns with commas.</p>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-tight">
                Keep:
              </label>
              <select
                value={keep}
                onChange={(e) => setKeep(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none transition-all appearance-none cursor-pointer"
              >
                <option value="first">First Instance</option>
                <option value="last">Last Instance</option>
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
              Drop Duplicates
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

DropDuplicateForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onTransform: PropTypes.func.isRequired,
};

export default DropDuplicateForm;
