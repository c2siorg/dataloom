import { LuDownload, LuRefreshCw } from "react-icons/lu";
import type { ReportSection } from "../../api/reports";
import { useReportView } from "../../context/ReportViewContext";
import Button from "../common/Button";

/** Sections offered to the user, in the order they print. */
const SECTIONS: { value: ReportSection; label: string; description: string }[] = [
  {
    value: "profiles",
    label: "Column profiles",
    description: "One row per column: type, nulls, unique values, key statistics.",
  },
  {
    value: "quality",
    label: "Data quality",
    description: "Score, the issues found, and the fixes suggested for them.",
  },
  {
    value: "provenance",
    label: "Provenance",
    description: "Source files and the transformations applied, grouped by checkpoint.",
  },
];

/**
 * Report configuration, docked in the right side panel like the transform forms
 * and the quality config. Section choices are gathered here; the Report tab shows
 * the resulting PDF. State is shared through ReportViewContext.
 */
export default function ReportConfigPanel() {
  const { sections, toggleSection, generate, download, loading, stale, blob } = useReportView();

  return (
    <div data-testid="report-config-panel">
      <fieldset className="mb-4">
        <legend className="mb-1 block text-sm font-medium text-foreground">Sections</legend>
        <p className="mb-2 text-xs text-muted-foreground">
          The dataset overview always prints. Choose what follows it.
        </p>
        <ul className="space-y-2">
          {SECTIONS.map((section) => (
            <li key={section.value}>
              <label className="flex cursor-pointer gap-2 rounded-md border border-app-border bg-surface p-2 hover:bg-surface-hover">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                  checked={sections.includes(section.value)}
                  onChange={() => toggleSection(section.value)}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{section.label}</span>
                  <span className="block text-xs text-muted-foreground">{section.description}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Button type="button" onClick={generate} disabled={loading}>
          <span className="flex items-center justify-center gap-2">
            <LuRefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Building…" : stale ? "Update preview" : "Rebuild preview"}
          </span>
        </Button>
        <Button type="button" variant="secondary" onClick={download} disabled={!blob || loading}>
          <span className="flex items-center justify-center gap-2">
            <LuDownload className="h-4 w-4" />
            Download PDF
          </span>
        </Button>
      </div>
    </div>
  );
}
