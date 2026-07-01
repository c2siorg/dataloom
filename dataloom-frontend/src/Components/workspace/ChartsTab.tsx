import { lazy, Suspense } from "react";
import { useParams } from "react-router-dom";
import { LuChartColumnBig, LuSparkles } from "react-icons/lu";
import type { ChartSpec, ChartType } from "../../api/visualizations";
import { useChartView } from "../../context/ChartViewContext";
import { useProjectContext } from "../../context/ProjectContext";
import useChartSuggestions from "../../hooks/useChartSuggestions";
import useCorrelation from "../../hooks/useCorrelation";
import CorrelationHeatmap from "../profiling/CorrelationHeatmap";
import { isNumeric } from "../visualizations/chartFields";
import SuggestionCard from "../visualizations/SuggestionCard";
import type { WorkspaceTab } from "../../context/WorkspaceTabsContext";

// Recharts is heavy; keep it in its own chunk, loaded when a chart first renders.
const ChartRenderer = lazy(() => import("../visualizations/ChartRenderer"));

const TYPE_LABEL: Record<ChartType, string> = {
  histogram: "Histogram",
  bar: "Bar",
  line: "Line",
  area: "Area",
  scatter: "Scatter",
  pie: "Pie",
};

// Subtle graph-paper backdrop for the empty canvas.
const GRID_BG = {
  backgroundImage:
    "linear-gradient(#f1f5f9 1px, transparent 1px), linear-gradient(90deg, #f1f5f9 1px, transparent 1px)",
  backgroundSize: "22px 22px",
};

/** Short, honest note about how the data was reduced for rendering. */
function MetaNote({ spec }: { spec: ChartSpec }) {
  const notes: string[] = [];
  if (spec.meta?.sampled) notes.push("showing a sample of the data");
  if (spec.meta?.truncated) notes.push("less frequent values grouped");
  if (notes.length === 0) return null;
  return <p className="mt-2 text-center text-xs italic text-gray-400">{notes.join(" · ")}</p>;
}

/**
 * Charts tab — the visualization display surface. The no-code builder lives in
 * the docked side panel (see ChartBuilderPanel); this tab shows the result plus
 * quick-start suggestion cards, sharing state via ChartViewContext.
 */
export function ChartsTab() {
  const { projectId } = useParams() as { projectId: string };
  const { columns, dtypes, dataVersion } = useProjectContext() as unknown as {
    columns: string[];
    dtypes: Record<string, string>;
    dataVersion: number;
  };
  const { spec, mode, loading, error, activeKey, selectSuggestion, showHeatmap } = useChartView();

  const { suggestions } = useChartSuggestions(projectId, true, dataVersion);
  const correlation = useCorrelation(projectId, mode === "heatmap", dataVersion);
  const hasCorrelation = columns.filter((c) => isNumeric(dtypes[c])).length >= 2;

  const suggestionCards = (
    <>
      {hasCorrelation && (
        <SuggestionCard
          typeLabel="Heatmap"
          title="Correlation between numeric columns"
          active={activeKey === "heatmap"}
          onSelect={showHeatmap}
        />
      )}
      {suggestions?.map((suggestion, i) => (
        <SuggestionCard
          key={i}
          typeLabel={TYPE_LABEL[suggestion.chart_type]}
          title={suggestion.title}
          active={activeKey === `s${i}`}
          onSelect={() => selectSuggestion(suggestion, `s${i}`)}
        />
      ))}
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
      {/* Suggestions strip */}
      {(hasCorrelation || (suggestions && suggestions.length > 0)) && (
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-gray-400">
            <LuSparkles className="h-3.5 w-3.5" />
            Suggestions
          </div>
          <div className="flex flex-wrap gap-2">{suggestionCards}</div>
        </div>
      )}

      {/* Canvas */}
      <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-gray-200 bg-white p-4">
        {mode === "heatmap" ? (
          <CorrelationHeatmap
            correlation={correlation.correlation}
            error={correlation.error}
            onRetry={correlation.refetch}
          />
        ) : error ? (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
            Couldn’t build that chart.
          </div>
        ) : loading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
            Building chart…
          </div>
        ) : mode === "chart" && spec ? (
          <div>
            <h3 className="mb-1 text-center text-sm font-medium text-gray-700">{spec.title}</h3>
            <Suspense
              fallback={
                <div className="flex h-80 items-center justify-center text-sm text-gray-400">
                  Loading chart…
                </div>
              }
            >
              <ChartRenderer spec={spec} />
            </Suspense>
            <MetaNote spec={spec} />
          </div>
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

/** Quiet placeholder canvas shown before a chart is built (the builder is docked). */
function EmptyState() {
  return (
    <div style={GRID_BG} className="flex flex-1 items-center justify-center rounded-md">
      <LuChartColumnBig className="h-10 w-10 text-gray-200" />
    </div>
  );
}

export const CHARTS_TAB: WorkspaceTab = {
  id: "charts",
  title: "Charts",
  type: "charts",
  closeable: true,
};
