import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getChart, type ChartParams, type ChartSpec } from "../api/visualizations";
import { useProjectContext } from "./ProjectContext";

/** What the Charts tab is currently showing. */
export type ChartMode = "empty" | "chart" | "heatmap";

interface ChartViewValue {
  spec: ChartSpec | null;
  mode: ChartMode;
  loading: boolean;
  error: boolean;
  /** Key of the selected suggestion/heatmap, for highlighting cards. */
  activeKey: string | null;
  /** Build a chart from builder params (re-fetches automatically on data change). */
  renderChart: (params: ChartParams, key?: string) => void;
  /** Show a pre-computed suggestion spec directly. */
  selectSuggestion: (spec: ChartSpec, key: string) => void;
  /** Switch to the correlation heatmap. */
  showHeatmap: () => void;
}

const ChartViewContext = createContext<ChartViewValue | null>(null);

/** Access the shared chart view. Bridges the docked builder and the Charts tab. */
// eslint-disable-next-line react-refresh/only-export-components
export function useChartView(): ChartViewValue {
  const context = useContext(ChartViewContext);
  if (!context) throw new Error("useChartView must be used within a ChartViewProvider");
  return context;
}

/**
 * Holds the current visualization so the side-panel builder (inputs) and the
 * Charts tab (output) stay in sync, and owns the `getChart` fetch. A chart built
 * from builder params re-fetches when the dataset changes (`dataVersion`), so it
 * always reflects the latest transforms; a clicked suggestion is a snapshot.
 */
export function ChartViewProvider({ children }: { children: ReactNode }) {
  const { projectId, dataVersion } = useProjectContext() as unknown as {
    projectId: string;
    dataVersion: number;
  };

  const [spec, setSpec] = useState<ChartSpec | null>(null);
  const [mode, setMode] = useState<ChartMode>("empty");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  // Last builder params, replayed when the dataset changes so the chart refreshes.
  const lastParams = useRef<ChartParams | null>(null);

  const fetchChart = useCallback(
    async (params: ChartParams) => {
      setLoading(true);
      setError(false);
      try {
        const result = await getChart(projectId, params);
        setSpec(result);
      } catch (err) {
        console.error("Error building chart:", err);
        setError(true);
        setSpec(null);
      } finally {
        setLoading(false);
      }
    },
    [projectId],
  );

  const renderChart = useCallback(
    (params: ChartParams, key?: string) => {
      lastParams.current = params;
      setMode("chart");
      setActiveKey(key ?? null);
      void fetchChart(params);
    },
    [fetchChart],
  );

  const selectSuggestion = useCallback((suggestion: ChartSpec, key: string) => {
    lastParams.current = null;
    setMode("chart");
    setError(false);
    setLoading(false);
    setSpec(suggestion);
    setActiveKey(key);
  }, []);

  const showHeatmap = useCallback(() => {
    lastParams.current = null;
    setMode("heatmap");
    setError(false);
    setSpec(null);
    setActiveKey("heatmap");
  }, []);

  // When the dataset changes, replay the last builder params so the shown chart
  // reflects the new data. Heatmap refreshes via its own dataVersion-keyed hook.
  useEffect(() => {
    if (mode === "chart" && lastParams.current) void fetchChart(lastParams.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion]);

  const value = useMemo<ChartViewValue>(
    () => ({ spec, mode, loading, error, activeKey, renderChart, selectSuggestion, showHeatmap }),
    [spec, mode, loading, error, activeKey, renderChart, selectSuggestion, showHeatmap],
  );

  return <ChartViewContext.Provider value={value}>{children}</ChartViewContext.Provider>;
}
