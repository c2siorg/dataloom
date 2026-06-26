import { useState } from "react";
import { useProjectContext } from "../../context/ProjectContext";
import { useToast } from "../../context/ToastContext";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const EXPORT_FORMAT_OPTIONS = ["csv", "tsv", "json", "xlsx", "parquet"] as const;

type ExportFormat = (typeof EXPORT_FORMAT_OPTIONS)[number];

export default function SettingsPreferencesPage() {
  const { pageSize: currentPageSize, updatePageSizePreference } = useProjectContext();

  const [pageSize, setPageSize] = useState<number>(currentPageSize);
  const [exportFormat, setExportFormat] = useState<ExportFormat>(() => {
    return (localStorage.getItem("defaultExportFormat") as ExportFormat) || "csv";
  });

  const { showToast } = useToast();

  const handleSave = () => {
    updatePageSizePreference(pageSize);
    localStorage.setItem("defaultExportFormat", exportFormat);
    showToast("Preferences saved.", "success");
  };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-1">Preferences</h1>
      <p className="text-sm text-gray-500 mb-8">
        Manage default settings for your DataLoom experience.
      </p>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm max-w-lg">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default page size
            </label>
            <p className="text-xs text-gray-400 mb-2">
              Number of rows shown per page in the data table.
            </p>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
              className="block w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size} rows
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default export format
            </label>
            <p className="text-xs text-gray-400 mb-2">Format used when exporting a project.</p>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
              className="block w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {EXPORT_FORMAT_OPTIONS.map((fmt) => (
                <option key={fmt} value={fmt}>
                  {fmt.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-blue-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-600"
          >
            Save preferences
          </button>
        </div>
      </section>
    </div>
  );
}
