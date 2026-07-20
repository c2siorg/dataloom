import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  Suspense,
  lazy,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { WorkspaceTab } from "../../context/WorkspaceTabsContext";
import { useProjectContext } from "../../context/ProjectContext";
import { getProjects, getProjectDetails } from "../../api/projects";
import { getChart } from "../../api/visualizations";
import type { AggFunc, ChartParams, ChartSpec, ChartType } from "../../api/visualizations";
import useDatasetSummary from "../../hooks/useDatasetSummary";
import useColumnProfiles from "../../hooks/useColumnProfiles";
import { isDatetime, isNumeric, usesAgg } from "../visualizations/chartFields";
import { LuTable, LuLayoutDashboard, LuColumns3, LuChartColumnBig } from "react-icons/lu";
import DtypeBadge from "../common/DtypeBadge";
import ColumnProfileCard from "../profiling/ColumnProfileCard";
import type { DatasetSummary } from "../../api/profiling";

// Lazy import ChartRenderer to avoid bundling recharts in main chunk
const ChartRenderer = lazy(() => import("../visualizations/ChartRenderer"));

// Module-scoped so every compare selection across the whole session gets a
// version the shared profiling cache (utils/profilingCache.ts) has never
// seen, rather than a hardcoded constant that could collide with another
// consumer's cached entry for the same project.
let compareVersionCounter = 0;

// eslint-disable-next-line react-refresh/only-export-components
export const COMPARE_TAB: WorkspaceTab = {
  id: "compare",
  title: "Compare",
  type: "compare",
  closeable: true,
};

type Mode = "table" | "summary" | "columns" | "charts";
type Cell = string | number | null | undefined;

// SplitDivider component for resizing panes. Focusable and arrow-key
// resizable per the WAI-ARIA APG separator pattern, not just mouse-draggable.
function SplitDivider({
  leftPct,
  onDrag,
  onResizeBy,
}: {
  leftPct: number;
  onDrag: (clientX: number) => void;
  onResizeBy: (deltaPct: number) => void;
}) {
  const dragging = useRef(false);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (dragging.current) onDrag(e.clientX);
    };
    const handleUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [onDrag]);

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onResizeBy(-2);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onResizeBy(2);
    }
  };

  return (
    <div
      onMouseDown={() => {
        dragging.current = true;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      className="w-1.5 shrink-0 cursor-col-resize bg-gray-200 hover:bg-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={Math.round(leftPct)}
      aria-valuemin={20}
      aria-valuemax={80}
      aria-label="Resize panes"
    />
  );
}

// ModeSwitcher Component
function ModeSwitcher({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const modes = [
    { id: "table", icon: LuTable, label: "Data" },
    { id: "summary", icon: LuLayoutDashboard, label: "Summary" },
    { id: "columns", icon: LuColumns3, label: "Columns" },
    { id: "charts", icon: LuChartColumnBig, label: "Charts" },
  ] as const;

  return (
    <div className="flex bg-gray-100 p-1 rounded-md mb-4 gap-1 self-start">
      {modes.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          onClick={() => setMode(id)}
          title={label}
          className={`px-3 py-1.5 rounded-sm text-sm font-medium flex items-center gap-2 transition-colors ${
            mode === id ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Icon className="w-4 h-4" />
          {label}
        </button>
      ))}
    </div>
  );
}

// PreviewTable Component
function PreviewTable({
  columns,
  rows,
  dtypes,
}: {
  columns: string[];
  rows: Cell[][];
  dtypes?: Record<string, string>;
}) {
  if (columns.length === 0) return <div className="p-4 text-gray-500">No data to display.</div>;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto border border-gray-200 rounded">
      <table className="min-w-full bg-white border-separate border-spacing-0">
        <thead className="sticky top-0 z-10 bg-gray-50 shadow-sm">
          <tr>
            {columns.map((column, i) => (
              <th
                key={i}
                className="h-6 px-3 py-1.5 border-b border-r border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50"
              >
                {column}
                {dtypes && dtypes[column] && (
                  <DtypeBadge dtype={dtypes[column]} className="ml-1.5" />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 50).map((row, rIdx) => (
            <tr key={rIdx} className="hover:bg-gray-50">
              {row.map((cell, cIdx) => (
                <td
                  key={cIdx}
                  className="h-6 px-3 py-1.5 text-xs border-b border-r border-gray-200 text-gray-700 whitespace-nowrap"
                >
                  {cell?.toString() ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// SummaryStats Component (adapted from DatasetSummaryPanel)
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
    <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 flex flex-col">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="mt-0.5 text-lg font-semibold text-gray-900">{value}</span>
    </div>
  );
}

function SummaryStats({ summary, loading }: { summary: DatasetSummary | null; loading: boolean }) {
  if (loading || !summary) return <div className="p-4 text-gray-500">Loading summary...</div>;

  return (
    <div className="flex flex-col gap-4 overflow-auto min-h-0 min-w-0 p-1">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
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
        <StatCard label="Numeric cols" value={summary.numeric_columns.length.toLocaleString()} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-500 uppercase">Column types:</span>
        {Object.entries(summary.dtype_counts).map(([dtype, count]) => (
          <span key={dtype} className="inline-flex items-center gap-1">
            <DtypeBadge dtype={dtype} className="" />
            <span className="text-sm text-gray-700">{count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// Main CompareTab Component
// `tab` is unused here but keeps this structurally assignable to
// TabComponentProps, which every registered tab component receives it as.
export function CompareTab({
  projectId: routeProjectId,
}: {
  projectId?: string;
  tab?: WorkspaceTab;
}) {
  // Left pane data from ProjectContext
  const ctx = useProjectContext() as any;
  // `|| []`/`|| {}` fallbacks would build a new reference every render,
  // defeating the useMemo hooks below that key off these values.
  const currentColumns: string[] = useMemo(() => ctx?.columns || [], [ctx?.columns]);
  const currentRows: Cell[][] = ctx?.rows || [];
  const currentDtypes: Record<string, string> = useMemo(() => ctx?.dtypes || {}, [ctx?.dtypes]);
  const projectId = routeProjectId || ctx?.projectId;
  const dataVersion = ctx?.dataVersion || 0;

  // Layout state
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftPct, setLeftPct] = useState(50);
  const handleDrag = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setLeftPct(Math.min(80, Math.max(20, pct)));
  }, []);
  const handleResizeBy = useCallback((deltaPct: number) => {
    setLeftPct((p) => Math.min(80, Math.max(20, p + deltaPct)));
  }, []);

  const [mode, setMode] = useState<Mode>("table");

  // Right pane data state
  const [projectsList, setProjectsList] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  // Fresh cache-busting version each time a different dataset is selected —
  // see the compareVersionCounter comment above.
  const [compareVersion, setCompareVersion] = useState(0);
  useEffect(() => {
    compareVersionCounter += 1;
    setCompareVersion(compareVersionCounter);
  }, [selectedProjectId]);
  const [preview, setPreview] = useState<{
    columns: string[];
    rows: Cell[][];
    dtypes: Record<string, string>;
  } | null>(null);
  const [projectsListError, setProjectsListError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Chart config state — mirrors ChartBuilderPanel's field-per-type logic so
  // Compare offers the same chart types with the same required fields.
  const [chartType, setChartType] = useState<ChartType>("histogram");
  const [chartColumn, setChartColumn] = useState("");
  const [chartCategory, setChartCategory] = useState("");
  const [chartValue, setChartValue] = useState("");
  const [chartX, setChartX] = useState("");
  const [chartY, setChartY] = useState("");
  const [chartColor, setChartColor] = useState("");
  const [chartAgg, setChartAgg] = useState<AggFunc>("sum");
  const [chartBins, setChartBins] = useState(20);
  const [leftChartResult, setLeftChartResult] = useState<{
    spec?: ChartSpec;
    loading: boolean;
    error?: string;
  }>({ loading: false });
  const [rightChartResult, setRightChartResult] = useState<{
    spec?: ChartSpec;
    loading: boolean;
    error?: string;
  }>({ loading: false });

  // Fetch right pane project list
  useEffect(() => {
    let ignore = false;
    setProjectsListError(null);
    getProjects({ limit: 50, offset: 0 })
      .then((res: any) => {
        if (ignore) return;
        setProjectsList((res || []).filter((p: any) => p.project_id !== projectId));
      })
      .catch((err: unknown) => {
        if (ignore) return;
        console.error(err);
        setProjectsListError("Failed to load projects. Please try again.");
      });
    return () => {
      ignore = true;
    };
  }, [projectId]);

  // Fetch right pane preview data when selected
  useEffect(() => {
    if (!selectedProjectId) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    let ignore = false;
    setPreviewError(null);
    getProjectDetails(selectedProjectId, 1, 50)
      .then((res: any) => {
        if (ignore) return;
        const rows = res.rows.map((r: any) => (Array.isArray(r) ? r : Object.values(r)));
        setPreview({ columns: res.columns, rows, dtypes: res.dtypes || {} });
      })
      .catch((err: unknown) => {
        if (ignore) return;
        console.error(err);
        setPreview(null);
        setPreviewError("Failed to load dataset preview. Please try again.");
      });
    return () => {
      ignore = true;
    };
  }, [selectedProjectId]);

  // Data fetching hooks for summary & columns modes
  const { summary: leftSummary, error: leftSummaryError } = useDatasetSummary(
    projectId,
    mode === "summary",
    dataVersion,
  );
  const leftSummaryLoading = !leftSummary && !leftSummaryError;

  // The compared project has no live dataVersion here (it's a one-off
  // snapshot, not a ProjectContext) — passing a constant like 0 would let the
  // module-level profiling cache (keyed by projectId + version) return another
  // session's stale entry for the same project. compareVersion is a fresh
  // nonce per selection so each compare pick always fetches current data.
  const { summary: rightSummary, error: rightSummaryError } = useDatasetSummary(
    selectedProjectId || undefined,
    mode === "summary" && !!selectedProjectId,
    compareVersion,
  );
  const rightSummaryLoading = !rightSummary && !rightSummaryError;

  const { profiles: leftProfiles, loading: leftProfilesLoading } = useColumnProfiles(
    projectId,
    mode === "columns",
    dataVersion,
  );
  const { profiles: rightProfiles, loading: rightProfilesLoading } = useColumnProfiles(
    selectedProjectId || undefined,
    mode === "columns" && !!selectedProjectId,
    compareVersion,
  );

  // Columns present in both datasets, since a chart is rendered from the same
  // params against each project. "Numeric"/"x-axis" columns additionally
  // require a matching dtype on both sides, not just the left pane's.
  const commonColumns = useMemo(() => {
    return preview ? currentColumns.filter((c) => preview.columns.includes(c)) : [];
  }, [currentColumns, preview]);

  const commonNumericColumns = useMemo(
    () =>
      commonColumns.filter(
        (c) => isNumeric(currentDtypes[c]) && preview && isNumeric(preview.dtypes[c]),
      ),
    [commonColumns, currentDtypes, preview],
  );

  const commonXColumns = useMemo(
    () =>
      commonColumns.filter((c) => {
        const left = currentDtypes[c];
        const right = preview?.dtypes[c];
        return (isNumeric(left) || isDatetime(left)) && (isNumeric(right) || isDatetime(right));
      }),
    [commonColumns, currentDtypes, preview],
  );

  // Assemble ChartParams for the current chart type, mirroring
  // ChartBuilderPanel's per-type field requirements. null while incomplete.
  const chartParams = useMemo<ChartParams | null>(() => {
    switch (chartType) {
      case "histogram":
        return chartColumn
          ? { chart_type: "histogram", column: chartColumn, bins: chartBins }
          : null;
      case "bar":
        if (!chartCategory) return null;
        if (chartAgg !== "count" && !chartValue) return null;
        return {
          chart_type: "bar",
          category: chartCategory,
          value: chartAgg === "count" ? undefined : chartValue,
          agg: chartAgg,
        };
      case "pie":
        return chartCategory
          ? { chart_type: "pie", category: chartCategory, value: chartValue || undefined }
          : null;
      case "line":
      case "area":
        return chartX && chartY ? { chart_type: chartType, x: chartX, y: [chartY] } : null;
      case "scatter":
        return chartX && chartY
          ? { chart_type: "scatter", x: chartX, y: [chartY], color: chartColor || undefined }
          : null;
      default:
        return null;
    }
  }, [
    chartType,
    chartColumn,
    chartCategory,
    chartValue,
    chartX,
    chartY,
    chartColor,
    chartAgg,
    chartBins,
  ]);

  // Trigger chart generation for both sides
  const handleRenderCharts = async () => {
    if (!projectId || !selectedProjectId || !chartParams) return;
    const params = chartParams;

    setLeftChartResult({ loading: true });
    setRightChartResult({ loading: true });

    const [leftRes, rightRes] = await Promise.allSettled([
      getChart(projectId, params),
      getChart(selectedProjectId, params),
    ]);

    if (leftRes.status === "fulfilled") {
      setLeftChartResult({ loading: false, spec: leftRes.value });
    } else {
      setLeftChartResult({ loading: false, error: "Failed to generate chart" });
    }

    if (rightRes.status === "fulfilled") {
      setRightChartResult({ loading: false, spec: rightRes.value });
    } else {
      setRightChartResult({ loading: false, error: "Failed to generate chart" });
    }
  };

  const renderContent = (
    cols: string[],
    rowsData: Cell[][],
    dtypesData: Record<string, string>,
    summary: DatasetSummary | null,
    summaryLoading: boolean,
    profiles: Record<string, any>,
    profilesLoading: boolean,
    chartResult: typeof leftChartResult,
  ) => {
    switch (mode) {
      case "table":
        return <PreviewTable columns={cols} rows={rowsData} dtypes={dtypesData} />;
      case "summary":
        return <SummaryStats summary={summary} loading={summaryLoading} />;
      case "columns":
        if (profilesLoading) return <div className="p-4 text-gray-500">Loading columns...</div>;
        return (
          <div className="flex flex-col gap-2 overflow-auto min-h-0 min-w-0 pr-2">
            {cols.map((col) => (
              <ColumnProfileCard key={col} profile={profiles[col]} loading={false} />
            ))}
          </div>
        );
      case "charts":
        if (chartResult.loading)
          return <div className="p-4 text-gray-500">Generating chart...</div>;
        if (chartResult.error) return <div className="p-4 text-red-500">{chartResult.error}</div>;
        if (!chartResult.spec)
          return <div className="p-4 text-gray-500">Configure and render a chart below.</div>;
        return (
          <div className="flex-1 min-h-0 min-w-0 border border-gray-200 rounded p-2">
            <Suspense fallback={<div>Loading renderer...</div>}>
              <ChartRenderer spec={chartResult.spec} />
            </Suspense>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col flex-1 h-full p-4 overflow-hidden">
      <ModeSwitcher mode={mode} setMode={setMode} />

      {/* Chart Config Panel (shared) */}
      {mode === "charts" && preview && (
        <div className="mb-4 p-3 bg-white border border-gray-200 rounded shadow-sm flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1">
            <label htmlFor="compare-chart-type" className="text-xs font-medium text-gray-700">
              Type
            </label>
            <select
              id="compare-chart-type"
              value={chartType}
              onChange={(e) => setChartType(e.target.value as ChartType)}
              className="border border-gray-300 rounded px-2 py-1 text-sm"
            >
              <option value="histogram">Histogram</option>
              <option value="bar">Bar</option>
              <option value="line">Line</option>
              <option value="area">Area</option>
              <option value="scatter">Scatter</option>
              <option value="pie">Pie</option>
            </select>
          </div>

          {chartType === "histogram" && (
            <>
              <div className="flex flex-col gap-1">
                <label htmlFor="compare-chart-column" className="text-xs font-medium text-gray-700">
                  Column
                </label>
                <select
                  id="compare-chart-column"
                  value={chartColumn}
                  onChange={(e) => setChartColumn(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                >
                  <option value="">Select numeric...</option>
                  {commonNumericColumns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="compare-chart-bins" className="text-xs font-medium text-gray-700">
                  Bins: {chartBins}
                </label>
                <input
                  id="compare-chart-bins"
                  type="range"
                  min={2}
                  max={60}
                  value={chartBins}
                  onChange={(e) => setChartBins(Number(e.target.value))}
                  className="w-32 accent-blue-600"
                />
              </div>
            </>
          )}

          {(chartType === "bar" || chartType === "pie") && (
            <div className="flex flex-col gap-1">
              <label htmlFor="compare-chart-category" className="text-xs font-medium text-gray-700">
                Category
              </label>
              <select
                id="compare-chart-category"
                value={chartCategory}
                onChange={(e) => setChartCategory(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              >
                <option value="">Select column...</option>
                {commonColumns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          {usesAgg(chartType) && (
            <div className="flex flex-col gap-1">
              <label htmlFor="compare-chart-agg" className="text-xs font-medium text-gray-700">
                Aggregation
              </label>
              <select
                id="compare-chart-agg"
                value={chartAgg}
                onChange={(e) => setChartAgg(e.target.value as AggFunc)}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              >
                {(["sum", "mean", "median", "min", "max", "count"] as AggFunc[]).map((a) => (
                  <option key={a} value={a}>
                    {a.charAt(0).toUpperCase() + a.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(chartType === "bar" || chartType === "pie") && (
            <div className="flex flex-col gap-1">
              <label htmlFor="compare-chart-value" className="text-xs font-medium text-gray-700">
                {chartType === "pie" ? "Value (optional)" : "Value"}
              </label>
              <select
                id="compare-chart-value"
                value={chartValue}
                onChange={(e) => setChartValue(e.target.value)}
                disabled={chartType === "bar" && chartAgg === "count"}
                className="border border-gray-300 rounded px-2 py-1 text-sm disabled:opacity-50"
              >
                <option value="">{chartType === "pie" ? "Count" : "Select numeric..."}</option>
                {commonNumericColumns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(chartType === "line" || chartType === "area" || chartType === "scatter") && (
            <>
              <div className="flex flex-col gap-1">
                <label htmlFor="compare-chart-x" className="text-xs font-medium text-gray-700">
                  X axis
                </label>
                <select
                  id="compare-chart-x"
                  value={chartX}
                  onChange={(e) => setChartX(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                >
                  <option value="">Select column...</option>
                  {(chartType === "scatter" ? commonNumericColumns : commonXColumns).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="compare-chart-y" className="text-xs font-medium text-gray-700">
                  Y axis
                </label>
                <select
                  id="compare-chart-y"
                  value={chartY}
                  onChange={(e) => setChartY(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                >
                  <option value="">Select numeric...</option>
                  {commonNumericColumns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {chartType === "scatter" && (
            <div className="flex flex-col gap-1">
              <label htmlFor="compare-chart-color" className="text-xs font-medium text-gray-700">
                Color (optional)
              </label>
              <select
                id="compare-chart-color"
                value={chartColor}
                onChange={(e) => setChartColor(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              >
                <option value="">None</option>
                {commonColumns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={handleRenderCharts}
            disabled={!chartParams}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Render Charts
          </button>
        </div>
      )}

      {/* Split panes */}
      <div ref={containerRef} className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Pane */}
        <div style={{ width: `${leftPct}%` }} className="flex flex-col min-h-0 pr-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-2 truncate">Currently Open</h2>
          {renderContent(
            currentColumns,
            currentRows,
            currentDtypes,
            leftSummary,
            leftSummaryLoading,
            leftProfiles,
            leftProfilesLoading,
            leftChartResult,
          )}
        </div>

        <SplitDivider leftPct={leftPct} onDrag={handleDrag} onResizeBy={handleResizeBy} />

        {/* Right Pane */}
        <div className="flex flex-col flex-1 min-h-0 min-w-0 pl-4">
          <div className="flex items-center gap-2 mb-2 min-w-0">
            <h2 className="text-sm font-semibold text-gray-700 shrink-0">Compare with:</h2>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm min-w-0 flex-1 truncate"
            >
              <option value="">-- Select dataset --</option>
              {projectsList.map((p) => (
                <option key={p.project_id} value={p.project_id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          {projectsListError && (
            <div className="mb-2 text-xs text-red-500">{projectsListError}</div>
          )}

          {!selectedProjectId ? (
            <div className="flex flex-1 items-center justify-center border border-dashed border-gray-300 rounded bg-gray-50">
              <span className="text-gray-500 text-sm">Select a dataset to compare</span>
            </div>
          ) : previewError ? (
            <div className="flex flex-1 items-center justify-center border border-dashed border-gray-300 rounded bg-gray-50">
              <span className="text-red-500 text-sm">{previewError}</span>
            </div>
          ) : (
            renderContent(
              preview?.columns || [],
              preview?.rows || [],
              preview?.dtypes || {},
              rightSummary,
              rightSummaryLoading,
              rightProfiles,
              rightProfilesLoading,
              rightChartResult,
            )
          )}
        </div>
      </div>
    </div>
  );
}
