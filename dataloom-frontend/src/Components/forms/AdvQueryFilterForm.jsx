import { useState } from "react";
import PropTypes from "prop-types";
import { LuChevronDown, LuDownload, LuSave, LuCode } from "react-icons/lu";
import TransformResultPreview from "./TransformResultPreview";
import { transformProject, saveProject } from "../../api";
import { ADV_QUERY_FILTER } from "../../constants/operationTypes";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";
import { downloadCsv, downloadExcel, downloadJson, downloadPdf } from "../../utils/exportUtils";

const AdvQueryFilterForm = ({ projectId, onClose, onTransform, onSave }) => {
  const [query, setQuery] = useState("");
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
        operation_type: ADV_QUERY_FILTER,
        adv_query: { query },
      });
      setResult(response);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveQueried = async () => {
    if (!result) return;

    setSaving(true);
    try {
      const advQuery = { query };
      const commitMessage = await onSave(advQuery);
      if (!commitMessage) return;

      await transformProject(projectId, {
        operation_type: ADV_QUERY_FILTER,
        adv_query: advQuery,
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
    const filename = `query-export.${format}`;

    switch (format) {
      case "csv":
        downloadCsv(filename, cols, rows);
        break;
      case "excel":
        downloadExcel(filename, cols, rows);
        break;
      case "pdf":
        downloadPdf(filename, cols, rows, "Advanced Query Export");
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
              <LuCode className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                Advanced Query
              </h3>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                Apply complex filters using logical expressions.
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
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-tight">
              Expression:
            </label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none transition-all"
              placeholder="e.g., col1 > 10 and col2 < 5"
              required
            />
            <p className="text-[10px] text-slate-400 font-mono">
              Syntax: column [operator] value [and/or] ...
            </p>
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
              className="bg-blue-500 hover:bg-blue-600 text-white px-8 py-2 rounded-lg font-bold text-sm shadow-lg shadow-blue-100 transition-all active:scale-95 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? "Processing..." : "Run Query"}
            </button>
          </div>
        </form>

        {error && (
          <div className="mt-6">
            <FormErrorAlert message={error} />
          </div>
        )}

        {result && (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm mt-8">
            <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                    <span className="text-blue-600">Query Result</span>
                    <span className="text-gray-300 font-normal">/</span>
                    <span className="text-gray-600">{result.rows?.length || 0} rows found</span>
                  </div>
                  <p className="text-xs text-gray-500">Preview of the matching data rows.</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveQueried}
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
    </div>
  );
};

AdvQueryFilterForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onTransform: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
};

export default AdvQueryFilterForm;
