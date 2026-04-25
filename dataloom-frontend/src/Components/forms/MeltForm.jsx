import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { LuChevronDown, LuDownload, LuSave, LuColumns3 as LuColumns } from "react-icons/lu";
import TransformResultPreview from "./TransformResultPreview";
import { transformProject, getProjectDetails, saveProject } from "../../api";
import { downloadCsv, downloadExcel, downloadJson, downloadPdf } from "../../utils/exportUtils";

const MeltForm = ({ projectId, onClose, onTransform, onSave }) => {
  const [columns, setColumns] = useState([]);
  const [idVars, setIdVars] = useState([]);
  const [valueVars, setValueVars] = useState([]);
  const [varName, setVarName] = useState("variable");
  const [valueName, setValueName] = useState("value");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchProjectDetails = async () => {
      try {
        const data = await getProjectDetails(projectId);
        setColumns(data.columns || []);
      } catch (err) {
        console.error("Error fetching columns:", err);
        setError("Failed to load dataset columns. Please close and reopen the form.");
      }
    };
    fetchProjectDetails();
  }, [projectId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validation: overlap
    if (idVars.length === 0) {
      setError("Please select at least one ID variable.");
      setLoading(false);
      return;
    }

    const effectiveValueVars =
      valueVars.length > 0 ? valueVars : columns.filter((col) => !idVars.includes(col));

    const overlap = idVars.filter((v) => effectiveValueVars.includes(v));
    if (overlap.length > 0) {
      setError(`Columns cannot be in both ID and Value variables: ${overlap.join(", ")}`);
      setLoading(false);
      return;
    }

    try {
      const finalVarName = varName.trim() || "variable";
      const finalValueName = valueName.trim() || "value";

      const response = await transformProject(projectId, {
        operation_type: "melt",
        melt_params: {
          id_vars: idVars,
          value_vars: effectiveValueVars,
          var_name: finalVarName,
          value_name: finalValueName,
        },
      });
      setResult(response);
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };
  const handleSaveMelted = async () => {
    if (!result) return;

    setSaving(true);
    setError(null);
    try {
      const meltParams = {
        id_vars: idVars,
        value_vars:
          valueVars.length > 0 ? valueVars : columns.filter((col) => !idVars.includes(col)),
        var_name: varName.trim() || "variable",
        value_name: valueName.trim() || "value",
      };

      const commitMessage = await onSave(meltParams);
      if (!commitMessage) return;

      await transformProject(projectId, {
        operation_type: "melt",
        melt_params: meltParams,
        persist: true,
      });

      const savedProject = await saveProject(projectId, commitMessage);
      onTransform(savedProject);
      setResult(savedProject);
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleExportAs = (format) => {
    if (!result) return;
    const cols = result.columns || [];
    const rows = result.rows || [];
    const filename = `melted-export.${format}`;

    switch (format) {
      case "csv":
        downloadCsv(filename, cols, rows);
        break;
      case "excel":
        downloadExcel(filename, cols, rows);
        break;
      case "pdf":
        downloadPdf(filename, cols, rows, "Melted Dataset Export");
        break;
      case "json":
        downloadJson(filename, cols, rows);
        break;
      default:
        break;
    }
    setIsExportMenuOpen(false);
  };

  const handleIdVarsChange = (col) => {
    if (idVars.includes(col)) {
      setIdVars(idVars.filter((v) => v !== col));
    } else {
      setIdVars([...idVars, col]);
    }
  };

  const handleValueVarsChange = (col) => {
    if (valueVars.includes(col)) {
      setValueVars(valueVars.filter((v) => v !== col));
    } else {
      setValueVars([...valueVars, col]);
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm mb-8 mx-8 overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 shadow-sm ring-1 ring-inset ring-blue-100">
              <LuColumns className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                Melt (Unpivot)
              </h3>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                Transform wide datasets into a long format.
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
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100 mb-6">
              {typeof error === "string" ? error : JSON.stringify(error, null, 2)}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-tight">
                  ID Variables:
                </label>
                <button
                  type="button"
                  onClick={() => setIdVars(idVars.length === columns.length ? [] : [...columns])}
                  className="text-[10px] font-bold text-blue-600 hover:text-blue-700"
                >
                  {idVars.length === columns.length ? "Deselect All" : "Select All"}
                </button>
              </div>
              <div className="border border-slate-200 rounded-lg max-h-48 overflow-y-auto p-3 bg-slate-50/50 space-y-1">
                {columns.map((col) => (
                  <label
                    key={`id-${col}`}
                    className={`flex items-center gap-3 py-1.5 px-3 rounded-lg text-sm cursor-pointer transition-all ${
                      idVars.includes(col)
                        ? "bg-blue-50 text-blue-700 border border-blue-100 shadow-sm"
                        : "hover:bg-white hover:shadow-sm border border-transparent"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={idVars.includes(col)}
                      onChange={() => handleIdVarsChange(col)}
                      className="rounded text-blue-600 focus:ring-blue-500/20"
                    />
                    {col}
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-slate-400">Identifiers that remain as columns.</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-tight">
                  Value Variables:
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setValueVars(valueVars.length === columns.length ? [] : [...columns])
                  }
                  className="text-[10px] font-bold text-blue-600 hover:text-blue-700"
                >
                  {valueVars.length === columns.length ? "Deselect All" : "Select All"}
                </button>
              </div>
              <div className="border border-slate-200 rounded-lg max-h-48 overflow-y-auto p-3 bg-slate-50/50 space-y-1">
                {columns.map((col) => (
                  <label
                    key={`val-${col}`}
                    className={`flex items-center gap-3 py-1.5 px-3 rounded-lg text-sm cursor-pointer transition-all ${
                      valueVars.includes(col)
                        ? "bg-blue-50 text-blue-700 border border-blue-100 shadow-sm"
                        : "hover:bg-white hover:shadow-sm border border-transparent"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={valueVars.includes(col)}
                      onChange={() => handleValueVarsChange(col)}
                      className="rounded text-blue-600 focus:ring-blue-500/20"
                    />
                    {col}
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-slate-400">Columns to unpivot. Leave empty for all.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-tight">
                Variable Name:
              </label>
              <input
                type="text"
                value={varName}
                onChange={(e) => setVarName(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none transition-all"
                placeholder="default: variable"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-tight">
                Value Name:
              </label>
              <input
                type="text"
                value={valueName}
                onChange={(e) => setValueName(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none transition-all"
                placeholder="default: value"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-gray-50">
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
              {loading ? "Processing..." : "Apply Melt"}
            </button>
          </div>
        </form>

        {result && (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                    <span className="text-blue-600">Melted Result</span>
                    <span className="text-gray-300 font-normal">/</span>
                    <span className="text-gray-600">
                      {result.row_count || result.rows?.length || 0} rows generated
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">Preview of the reshaped data.</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveMelted}
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

MeltForm.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onTransform: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
};

export default MeltForm;
