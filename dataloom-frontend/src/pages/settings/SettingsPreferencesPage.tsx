import { useState } from "react";
import { useProjectContext } from "../../context/ProjectContext";
import { useToast } from "../../context/ToastContext";
import { useTheme } from "../../context/ThemeContext";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const EXPORT_FORMAT_OPTIONS = ["csv", "tsv", "json", "xlsx", "parquet"] as const;

type ExportFormat = (typeof EXPORT_FORMAT_OPTIONS)[number];

const ThemeToggle = () => {
  const { isDarkMode, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDarkMode}
      onClick={toggleTheme}
      aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
      title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
      className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-app-border bg-surface text-secondary-foreground transition-colors hover:border-app-border-hover hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:pointer-events-none disabled:opacity-50"
    >
      {isDarkMode ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="size-5"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.42 1.42" />
          <path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m6.34 17.66-1.41 1.41" />
          <path d="m19.07 4.93-1.41 1.42" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="size-5"
          aria-hidden="true"
        >
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      )}
    </button>
  );
};

export default function SettingsPreferencesPage() {
  const { pageSize: currentPageSize, updatePageSizePreference } = useProjectContext();

  const { isDarkMode } = useTheme();
  const { showToast } = useToast();

  const [pageSize, setPageSize] = useState<number>(currentPageSize);
  const [exportFormat, setExportFormat] = useState<ExportFormat>(() => {
    const savedFormat = localStorage.getItem("defaultExportFormat");

    return EXPORT_FORMAT_OPTIONS.includes(savedFormat as ExportFormat)
      ? (savedFormat as ExportFormat)
      : "csv";
  });

  const handleSave = () => {
    updatePageSizePreference(pageSize);
    localStorage.setItem("defaultExportFormat", exportFormat);
    showToast("Preferences saved.", "success");
  };

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-foreground">Preferences</h1>

      <p className="mb-8 text-sm text-muted-foreground">
        Manage default settings for your DataLoom experience.
      </p>

      <section className="max-w-lg rounded-2xl border border-app-border bg-surface p-6 shadow-sm">
        <div className="divide-y divide-app-border">
          <div className="space-y-6 pb-6">
            <div>
              <label
                htmlFor="default-page-size"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Default page size
              </label>

              <p className="mb-2 text-xs text-muted-foreground">
                Number of rows shown per page in the data table.
              </p>

              <select
                id="default-page-size"
                value={pageSize}
                onChange={(event) => setPageSize(Number.parseInt(event.target.value, 10))}
                className="block w-full rounded-lg border border-app-border bg-surface px-3.5 py-2.5 text-sm text-foreground transition-colors hover:border-app-border-hover focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size} rows
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="default-export-format"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Default export format
              </label>

              <p className="mb-2 text-xs text-muted-foreground">
                Format used when exporting a project.
              </p>

              <select
                id="default-export-format"
                value={exportFormat}
                onChange={(event) => setExportFormat(event.target.value as ExportFormat)}
                className="block w-full rounded-lg border border-app-border bg-surface px-3.5 py-2.5 text-sm text-foreground transition-colors hover:border-app-border-hover focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                {EXPORT_FORMAT_OPTIONS.map((format) => (
                  <option key={format} value={format}>
                    {format.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleSave}
              className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:pointer-events-none disabled:opacity-50"
            >
              Save preferences
            </button>
          </div>

          <div className="pt-6">
            <div className="flex items-center justify-between gap-6">
              <div>
                <h2 className="text-sm font-medium text-foreground">Appearance</h2>

                <p className="mt-1 text-xs text-muted-foreground">
                  Currently using {isDarkMode ? "dark" : "light"} mode.
                </p>
              </div>

              <ThemeToggle />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
