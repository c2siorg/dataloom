import type {
  IssueSeverity,
  QualityIssue,
  QualityRemediation,
  QualityReport,
} from "../../api/quality";
import type { QualityRunEntry } from "../../context/QualityViewContext";
import { usePanel } from "../../context/PanelContext";

const SEVERITY_ORDER: IssueSeverity[] = ["critical", "high", "medium", "low"];

/**
 * Docked form (by registered panel name) that applies each fixable operation,
 * with a clean button label. Operations without a form (review outliers, edit
 * mistyped values) get no action button.
 */
const OPERATION_ACTION: Record<string, { panel: string; label: string }> = {
  dropDuplicate: { panel: "DropDuplicateForm", label: "Drop duplicates" },
  fillEmpty: { panel: "FillEmptyForm", label: "Fill empty" },
  castDataType: { panel: "CastDataTypeForm", label: "Cast type" },
  trimWhitespace: { panel: "TrimWhitespaceForm", label: "Trim whitespace" },
  stringReplace: { panel: "StringReplaceForm", label: "Replace values" },
};

const SEVERITY_STYLE: Record<IssueSeverity, { label: string; dot: string; badge: string }> = {
  critical: {
    label: "Critical",
    dot: "bg-red-600",
    badge: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  },
  high: {
    label: "High",
    dot: "bg-orange-500",
    badge: "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
  },
  medium: {
    label: "Medium",
    dot: "bg-amber-400",
    badge: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  },
  low: {
    label: "Low",
    dot: "bg-gray-300 dark:bg-gray-600",
    badge: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  },
};

/** Proposal §9.4 score bands: excellent → critical. */
function scoreBand(score: number): { label: string; text: string; bar: string } {
  if (score >= 90)
    return { label: "Excellent", text: "text-green-600 dark:text-green-400", bar: "bg-green-500" };
  if (score >= 70)
    return { label: "Good", text: "text-lime-600 dark:text-lime-400", bar: "bg-lime-500" };
  if (score >= 50)
    return { label: "Fair", text: "text-amber-500 dark:text-amber-400", bar: "bg-amber-400" };
  if (score >= 30)
    return { label: "Poor", text: "text-orange-500 dark:text-orange-400", bar: "bg-orange-500" };
  return { label: "Critical", text: "text-red-600 dark:text-red-400", bar: "bg-red-500" };
}

function ScoreCard({ report }: { report: QualityReport }) {
  const band = scoreBand(report.overall_score);
  return (
    <div className="flex items-center gap-4 rounded-lg border border-app-border bg-surface p-4 shadow-xs">
      <div className="text-center">
        <div data-testid="overall-score" className={`text-4xl font-semibold ${band.text}`}>
          {Math.round(report.overall_score)}
        </div>
        <div className={`text-xs font-medium uppercase tracking-wider ${band.text}`}>
          {band.label}
        </div>
      </div>
      <div className="min-w-0 text-sm text-muted-foreground">
        <p>
          {report.issue_count === 0
            ? "No issues detected."
            : `${report.issue_count} issue(s) detected across the dataset.`}
        </p>
      </div>
    </div>
  );
}

function ColumnHealth({ scores }: { scores: Record<string, number> }) {
  const entries = Object.entries(scores).sort(([, a], [, b]) => a - b);
  if (entries.length === 0) return null;
  return (
    <section>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Column health
      </h3>
      <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {entries.map(([column, score]) => (
          <div key={column} className="flex items-center gap-2 text-sm">
            <span className="w-32 shrink-0 truncate text-foreground font-medium" title={column}>
              {column}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-hover">
              <div
                className={`h-full rounded-full ${scoreBand(score).bar}`}
                style={{ width: `${score}%` }}
              />
            </div>
            <span className="w-8 shrink-0 text-right text-xs text-muted-foreground">
              {Math.round(score)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function IssueList({ issues }: { issues: QualityIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <section>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Issues
      </h3>
      <div className="space-y-3">
        {SEVERITY_ORDER.map((severity) => {
          const group = issues.filter((issue) => issue.severity === severity);
          if (group.length === 0) return null;
          const style = SEVERITY_STYLE[severity];
          return (
            <div key={severity}>
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                {style.label} ({group.length})
              </div>
              <ul className="space-y-1">
                {/* detail is unique per issue within a report (type + column + counts) */}
                {group.map((issue) => (
                  <li
                    key={issue.detail}
                    className="rounded-md border border-app-border bg-surface px-3 py-2 text-sm text-foreground shadow-xs"
                  >
                    {issue.detail}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RemediationList({ remediations }: { remediations: QualityRemediation[] }) {
  const { openPanel } = usePanel();
  if (remediations.length === 0) return null;
  return (
    <section>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Suggested fixes
      </h3>
      <ul className="space-y-1">
        {/* suggestion mirrors its issue's detail, so it is unique within a report */}
        {remediations.map((remediation) => {
          const action = remediation.operation
            ? OPERATION_ACTION[remediation.operation]
            : undefined;
          return (
            <li
              key={remediation.suggestion}
              className="flex items-center justify-between gap-2 rounded-md border border-app-border bg-surface px-3 py-2 text-sm text-foreground shadow-xs"
            >
              <span className="min-w-0">{remediation.suggestion}</span>
              {action && (
                <button
                  type="button"
                  onClick={() => openPanel(action.panel)}
                  className="shrink-0 rounded-md border border-app-border px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 transition-colors hover:border-blue-300 dark:hover:border-blue-500 hover:bg-accent-subtle"
                >
                  {action.label}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function HistoryStrip({ history }: { history: QualityRunEntry[] }) {
  if (history.length < 2) return null; // a trend needs at least two points
  return (
    <section>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Score this session
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {history.map((entry) => (
          <span
            key={entry.at}
            title={new Date(entry.at).toLocaleTimeString()}
            className={`rounded-md border border-app-border bg-surface px-2 py-1 text-xs font-medium ${scoreBand(entry.score).text}`}
          >
            {Math.round(entry.score)}
          </span>
        ))}
      </div>
    </section>
  );
}

interface QualityReportViewProps {
  report: QualityReport;
  history: QualityRunEntry[];
}

/** Renders a scored quality report: score card, column health, issues, fixes, trend. */
export default function QualityReportView({ report, history }: QualityReportViewProps) {
  return (
    <div className="space-y-5">
      <ScoreCard report={report} />
      <ColumnHealth scores={report.column_scores} />
      <IssueList issues={report.issues} />
      <RemediationList remediations={report.remediations} />
      <HistoryStrip history={history} />
    </div>
  );
}
