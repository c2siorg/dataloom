import { useState } from "react";
import PropTypes from "prop-types";
import { LuChevronDown, LuDownload, LuSave, LuLayers } from "react-icons/lu";
import { transformProject, saveProject } from "../../api";
import { GROUPBY } from "../../constants/operationTypes";
import TransformResultPreview from "./TransformResultPreview";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";
import { useProjectContext } from "../../context/ProjectContext";
import { downloadCsv, downloadExcel, downloadJson, downloadPdf } from "../../utils/exportUtils";

const GroupByForm = ({ projectId, onClose, onTransform, onSave }) => {
  const { columns: availableColumns } = useProjectContext();
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [aggColumn, setAggColumn] = useState("");
  const [aggFunction, setAggFunction] = useState("sum");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const { error, clearError, handleError } = useError();

  const handleColumnToggle = (col) => {
    setSelectedColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col],
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedColumns.length === 0) return;
    if (!aggColumn) return;

    setLoading(true);
    clearError();
    try {
      const response = await transformProject(projectId, {
        operation_type: GROUPBY,
        groupby_params: {
          columns: selectedColumns,
          agg_column: aggColumn,
          agg_function: aggFunction,
        },
      });
      setResult(response);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGrouped = async () => {
    if (!result) return;

    setSaving(true);
    try {
      const groupbyParams = {
        columns: selectedColumns,
        agg_column: aggColumn,
        agg_function: aggFunction,
      };
      const commitMessage = await onSave(groupbyParams);
      if (!commitMessage) return;

      await transformProject(projectId, {
        operation_type: GROUPBY,
        groupby_params: groupbyParams,
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
    const filename = `groupby-export.${format}`;

    switch (format) {
      case "csv":
        downloadCsv(filename, cols, rows);
        break;
      case "excel":
        downloadExcel(filename, cols, rows);
        break;
      case "pdf":
        downloadPdf(filename, cols, rows, "GroupBy Aggregation Export");
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
              <LuLayers className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                GroupBy Aggregation
              </h3>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                Collapse rows by grouping unique values and calculating statistics.
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

      <form onSubmit={handleSubmit} className="p-6 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Column 1: Group By */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-50 text-blue-600 text-[10px]">
                  1
                </span>
                Group By Columns
              </label>
              <button
                type="button"
                onClick={() =>
                  setSelectedColumns(
                    selectedColumns.length === availableColumns.length ? [] : [...availableColumns],
                  )
                }
                className="text-[10px] font-bold text-blue-600 hover:text-blue-700"
              >
                {selectedColumns.length === availableColumns.length ? "Deselect All" : "Select All"}
              </button>
            </div>
            <div className="border border-gray-200 rounded-xl p-3 max-h-48 overflow-y-auto bg-gray-50/30 space-y-1">
              {availableColumns.map((col) => (
                <label
                  key={col}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer transition-all ${
                    selectedColumns.includes(col)
                      ? "bg-blue-50 text-blue-700 font-medium border border-blue-100"
                      : "text-gray-600 hover:bg-white hover:shadow-sm border border-transparent"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedColumns.includes(col)}
                    onChange={() => handleColumnToggle(col)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  {col}
                </label>
              ))}
            </div>
          </div>

          {/* Column 2: Aggregation Column */}
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-50 text-blue-600 text-[10px]">
                2
              </span>
              Value to Aggregate
            </label>
            <div className="space-y-1">
              <select
                value={aggColumn}
                onChange={(e) => setAggColumn(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none transition-all appearance-none cursor-pointer"
                required
              >
                <option value="">Select column...</option>
                {availableColumns
                  .filter((col) => !selectedColumns.includes(col))
                  .map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
              </select>
              <p className="text-[10px] text-gray-400 pl-1">
                The numeric column you want to calculate.
              </p>
            </div>
          </div>

          {/* Column 3: Function */}
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-50 text-blue-600 text-[10px]">
                3
              </span>
              Calculation Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {["sum", "mean", "count", "min", "max", "median"].map((func) => (
                <button
                  key={func}
                  type="button"
                  onClick={() => setAggFunction(func)}
                  className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all capitalize ${
                    aggFunction === func
                      ? "bg-blue-500 text-white border-blue-500 shadow-md shadow-blue-100"
                      : "bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-500"
                  }`}
                >
                  {func}
                </button>
              ))}
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
            disabled={loading || selectedColumns.length === 0 || !aggColumn}
          >
            {loading ? (
              <>
                <svg
                  className="animate-spin h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Processing...
              </>
            ) : (
              "Apply GroupBy"
            )}
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
                  <span className="text-blue-600">Aggregation Result</span>
                  <span className="text-gray-300 font-normal">/</span>
                  <span className="text-gray-600">{result.rows?.length || 0} unique groups</span>
                </div>
                <p className="text-xs text-gray-500">Preview of the aggregated data.</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveGrouped}
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

GroupByForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onTransform: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
};

export default GroupByForm;
