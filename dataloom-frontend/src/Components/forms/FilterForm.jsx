import { useState } from "react";
import PropTypes from "prop-types";
import { LuChevronDown, LuDownload, LuFilter, LuSave } from "react-icons/lu";
import { saveProject, transformProject } from "../../api";
import { FILTER } from "../../constants/operationTypes";
import TransformResultPreview from "./TransformResultPreview";
import useError from "../../hooks/useError";
import FormErrorAlert from "../common/FormErrorAlert";
import ColumnSelect from "../common/ColumnSelect";
import { downloadCsv, downloadExcel, downloadJson, downloadPdf } from "../../utils/exportUtils";

const FilterForm = ({ projectId, onClose, onTransform, onSave }) => {
  const [filterParams, setFilterParams] = useState({
    column: "",
    condition: "=",
    value: "",
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const { error, clearError, handleError } = useError();

  const handleInputChange = (e) => {
    setFilterParams({
      ...filterParams,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log("Submitting filter with parameters:", filterParams);
    setLoading(true);
    clearError();
    try {
      const response = await transformProject(projectId, {
        operation_type: FILTER,
        parameters: filterParams,
        persist: false,
      });
      setResult(response);
      console.log("Filter API response:", response);
    } catch (err) {
      console.error("Error applying filter:", err.response?.data || err.message);
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportFilteredAs = (format) => {
    if (!result) return;

    const columns = result.columns || [];
    const rows = result.rows || [];

    switch (format) {
      case "csv":
        downloadCsv("filtered-export.csv", columns, rows);
        break;
      case "excel":
        downloadExcel("filtered-export.xlsx", columns, rows);
        break;
      case "pdf":
        downloadPdf("filtered-export.pdf", columns, rows, "Filtered Dataset Export");
        break;
      case "json":
        downloadJson("filtered-export.json", columns, rows);
        break;
      default:
        break;
    }

    setIsExportMenuOpen(false);
  };

  const handleSaveFiltered = async () => {
    if (!result) return;

    setSaving(true);
    clearError();
    try {
      const commitMessage = await onSave(filterParams);
      if (!commitMessage) return;

      await transformProject(projectId, {
        operation_type: FILTER,
        parameters: filterParams,
        persist: true,
      });

      const savedProject = await saveProject(projectId, commitMessage);
      onTransform(savedProject);
      setResult(savedProject);
    } catch (err) {
      console.error("Error saving filtered result:", err.response?.data || err.message);
      handleError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 px-8 pb-10">
      <div className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm">
        <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 shadow-sm ring-1 ring-inset ring-blue-100">
                <LuFilter className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                  Filter Dataset
                </h3>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Narrow down rows based on specific criteria.
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

        <form onSubmit={handleSubmit} className="p-6 bg-white">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">Column</label>
              <ColumnSelect
                name="column"
                value={filterParams.column}
                onChange={handleInputChange}
                placeholder="Select column..."
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">Condition</label>
              <select
                name="condition"
                value={filterParams.condition}
                onChange={handleInputChange}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                required
              >
                <option value="=">Equals (=)</option>
                <option value="!=">Not Equals (!=)</option>
                <option value=">">Greater Than (&gt;)</option>
                <option value="<">Less Than (&lt;)</option>
                <option value=">=">Greater or Equal (&gt;=)</option>
                <option value="<=">Less or Equal (&lt;=)</option>
                <option value="contains">Contains Text</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">Value</label>
              <input
                type="text"
                name="value"
                value={filterParams.value}
                onChange={handleInputChange}
                placeholder="Search value..."
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                required
              />
            </div>
          </div>
          <div className="mt-8 flex items-center justify-end gap-3 border-t border-gray-100 pt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 text-sm font-semibold text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-10 py-2.5 rounded-lg font-bold text-sm shadow-lg shadow-blue-100 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
              disabled={loading || !filterParams.column}
            >
              {loading ? "Applying..." : "Apply Filter"}
            </button>
          </div>
        </form>
      </div>

      <FormErrorAlert message={error} />

      {result && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                  <span className="text-blue-600">Filtered Result</span>
                  <span className="text-gray-300 font-normal">/</span>
                  <span className="text-gray-600">{result.rows?.length ?? 0} matches found</span>
                </div>
                <p className="text-xs text-gray-500">Preview of the matching data rows.</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveFiltered}
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
                          onClick={() => handleExportFilteredAs(item.format)}
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

FilterForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onTransform: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
};

export default FilterForm;
