import { useState } from "react";
import PropTypes from "prop-types";
import { LuChevronDown, LuDownload, LuSave, LuArrowDownUp } from "react-icons/lu";
import { transformProject, saveProject } from "../../api";
import { SORT } from "../../constants/operationTypes";
import TransformResultPreview from "./TransformResultPreview";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";
import ColumnSelect from "../common/ColumnSelect";
import { downloadCsv, downloadExcel, downloadJson, downloadPdf } from "../../utils/exportUtils";

const SortForm = ({ projectId, onClose, onTransform, onSave }) => {
  const [column, setColumn] = useState("");
  const [ascending, setAscending] = useState(true);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const { error, clearError, handleError } = useError();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    clearError();
    try {
      const response = await transformProject(projectId, {
        operation_type: SORT,
        sort_params: { column, ascending },
      });
      setResult(response);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSorted = async () => {
    if (!result) return;

    setSaving(true);
    try {
      const sortParams = { column, ascending };
      const commitMessage = await onSave(sortParams);
      if (!commitMessage) return;

      await transformProject(projectId, {
        operation_type: SORT,
        sort_params: sortParams,
        persist: true,
      });

      const savedProject = await saveProject(projectId, commitMessage);
      onTransform(savedProject);
      setResult(savedProject);
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  };

  const handleExportAs = (format) => {
    if (!result) return;
    const cols = result.columns || [];
    const rows = result.rows || [];
    const filename = `sorted-export.${format}`;

    switch (format) {
      case "csv":
        downloadCsv(filename, cols, rows);
        break;
      case "excel":
        downloadExcel(filename, cols, rows);
        break;
      case "pdf":
        downloadPdf(filename, cols, rows, "Sorted Dataset Export");
        break;
      case "json":
        downloadJson(filename, cols, rows);
        break;
      default:
        break;
    }
    setIsExportMenuOpen(false);
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm mb-8 mx-8 overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 shadow-sm ring-1 ring-inset ring-blue-100">
              <LuArrowDownUp className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                Sort Dataset
              </h3>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                Reorder your data based on a specific column&apos;s values.
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

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-gray-700">Column to Sort</label>
            <ColumnSelect
              value={column}
              onChange={(e) => setColumn(e.target.value)}
              placeholder="Select column..."
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none cursor-pointer"
            />
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-semibold text-gray-700">Sort Order</label>
            <div className="flex p-1 bg-gray-50 rounded-xl border border-gray-100">
              <button
                type="button"
                onClick={() => setAscending(true)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${
                  ascending
                    ? "bg-white text-blue-500 shadow-sm border border-gray-100"
                    : "text-gray-500 hover:text-gray-700 hover:bg-white/50"
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"
                  />
                </svg>
                Ascending
              </button>
              <button
                type="button"
                onClick={() => setAscending(false)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${
                  !ascending
                    ? "bg-white text-blue-500 shadow-sm border border-gray-100"
                    : "text-gray-500 hover:text-gray-700 hover:bg-white/50"
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 4h13M3 8h9m-9 4h9m5-1l4 4m0 0l4-4m-4 4V4"
                  />
                </svg>
                Descending
              </button>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-gray-50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 text-sm font-semibold text-gray-600 hover:text-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-8 py-2.5 rounded-lg font-bold text-sm shadow-lg shadow-blue-100 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
            disabled={loading || !column}
          >
            {loading ? "Sorting..." : "Apply Sort"}
          </button>
        </div>
      </form>
      <FormErrorAlert message={error} />
      {result && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm mt-8">
          <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                  <span className="text-blue-600">Sort Result</span>
                  <span className="text-gray-300 font-normal">/</span>
                  <span className="text-gray-600">{result.rows?.length || 0} rows reordered</span>
                </div>
                <p className="text-xs text-gray-500">Preview of the sorted data.</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveSorted}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-5 py-2 text-sm font-bold text-gray-700 transition-all hover:bg-gray-50 hover:border-gray-300 active:bg-gray-100"
                >
                  <LuSave className="h-4 w-4 text-blue-500" />
                  {saving ? "Saving..." : "Save result"}
                </button>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsExportMenuOpen((open) => !open)}
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-slate-100 transition-all hover:bg-slate-800 active:scale-95"
                  >
                    <LuDownload className="h-4 w-4" />
                    Export
                    <LuChevronDown
                      className={`h-4 w-4 transition-transform duration-200 ${isExportMenuOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {isExportMenuOpen && (
                    <div className="absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-lg border border-gray-100 bg-white p-1.5 shadow-2xl ring-1 ring-gray-900/5">
                      <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                        Select Format
                      </div>
                      {[
                        { label: "CSV", format: "csv", desc: "For spreadsheets & generic use" },
                        { label: "Excel", format: "excel", desc: "Microsoft Excel Worksheet" },
                        { label: "PDF", format: "pdf", desc: "Ready for printing & sharing" },
                        { label: "JSON", format: "json", desc: "For developers & API use" },
                      ].map((item) => (
                        <button
                          key={item.format}
                          type="button"
                          onClick={() => handleExportAs(item.format)}
                          className="flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-blue-50 group"
                        >
                          <span className="text-sm font-bold text-gray-700 group-hover:text-blue-700">
                            {item.label}
                          </span>
                          <span className="text-[10px] text-gray-400">{item.desc}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="p-1">
            <TransformResultPreview columns={result.columns} rows={result.rows} embedded />
          </div>
        </div>
      )}
    </div>
  );
};

SortForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onTransform: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
};

export default SortForm;
