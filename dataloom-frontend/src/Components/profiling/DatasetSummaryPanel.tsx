import type { DatasetSummary } from "../../api/profiling";
import DtypeBadge from "../common/DtypeBadge";

interface DatasetSummaryPanelProps {
  summary: DatasetSummary | null;
  /** True when the summary fetch failed; takes precedence over the loading state. */
  error?: boolean;
  onRetry?: () => void;
  onClose: () => void;
}

/** Humanize a byte count to KB/MB/GB with one decimal. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-app-border bg-surface px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

/**
 * Top-level dataset overview. Rendered by MenuNavbar just above the table,
 * matching the existing forms/Logs/Checkpoints panel chrome (see LogsPanel).
 */
export default function DatasetSummaryPanel({
  summary,
  error = false,
  onRetry,
  onClose,
}: DatasetSummaryPanelProps) {
  return (
    <div
      data-testid="dataset-summary-panel"
      className="p-4 bg-surface border border-app-border rounded-lg shadow-sm mx-auto relative group"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Overview</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground font-medium opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          style={{
            transition: "opacity 0.3s",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>

      {error ? (
        <div className="py-4 text-center text-sm text-muted-foreground">
          <p>Couldn’t load the dataset summary.</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 text-blue-600 hover:text-blue-800 font-medium"
              style={{ background: "transparent", border: "none", cursor: "pointer" }}
            >
              Retry
            </button>
          )}
        </div>
      ) : !summary ? (
        <div className="py-4 text-center text-sm text-muted-foreground">Loading summary…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Rows" value={summary.row_count.toLocaleString()} />
            <StatCard label="Columns" value={summary.column_count.toLocaleString()} />
            <StatCard
              label="Missing cells"
              value={`${summary.total_missing_cells.toLocaleString()} (${Number(
                summary.missing_cell_percentage.toFixed(1),
              )}%)`}
            />
            <StatCard label="Duplicate rows" value={summary.duplicate_row_count.toLocaleString()} />
            <StatCard label="Memory" value={formatBytes(summary.memory_usage_bytes)} />
            <StatCard
              label="Numeric cols"
              value={summary.numeric_columns.length.toLocaleString()}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Column types
            </span>
            {Object.entries(summary.dtype_counts).map(([dtype, count]) => (
              <span key={dtype} className="inline-flex items-center gap-1">
                <DtypeBadge dtype={dtype} className="" />
                <span className="text-sm text-foreground">{count}</span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
