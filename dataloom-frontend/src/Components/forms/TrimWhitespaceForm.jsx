import { useState } from "react";
import PropTypes from "prop-types";
import { LuScissors } from "react-icons/lu";
import { transformProject } from "../../api";
import { TRIM_WHITESPACE } from "../../constants/operationTypes";
import { useProjectContext } from "../../context/ProjectContext";
import { useToast } from "../../context/ToastContext";

const TrimWhitespaceForm = ({ projectId, onClose, onTransform }) => {
  const { columns } = useProjectContext();
  const { showToast } = useToast();

  const [column, setColumn] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await transformProject(projectId, {
        operation_type: TRIM_WHITESPACE,
        trim_whitespace_params: {
          column,
        },
      });

      onTransform(response);
      onClose();
    } catch (error) {
      console.error("Error trimming whitespace:", error);

      showToast(error.response?.data?.detail || "Failed to trim whitespace.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm mb-8 mx-8 overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 shadow-sm ring-1 ring-inset ring-blue-100">
              <LuScissors className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                Trim Whitespace
              </h3>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                Remove leading and trailing spaces from text.
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
          <div className="max-w-md space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-tight">
              Column:
            </label>
            <div className="relative">
              <select
                value={column}
                onChange={(e) => setColumn(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none transition-all appearance-none cursor-pointer"
                required
              >
                <option value="">Select column...</option>
                <option value="All string columns">All string columns</option>
                {columns.map((col) => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-slate-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
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
              disabled={loading}
              className="bg-blue-500 hover:bg-blue-600 text-white px-8 py-2 rounded-lg font-bold text-sm shadow-lg shadow-blue-100 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Trimming..." : "Apply Trim"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

TrimWhitespaceForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onTransform: PropTypes.func.isRequired,
};

export default TrimWhitespaceForm;
