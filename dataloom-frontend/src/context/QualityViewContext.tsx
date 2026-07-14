import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { runQualityAssessment, type QualityAssessConfig, type QualityReport } from "../api/quality";
import { useProjectContext } from "./ProjectContext";

/** One completed run this session: its score and when it finished. */
export interface QualityRunEntry {
  score: number;
  at: number;
}

interface QualityViewValue {
  report: QualityReport | null;
  loading: boolean;
  error: boolean;
  /** True when the data changed after the shown report was produced. */
  stale: boolean;
  /** Scores of this session's runs, oldest first (reports aren't persisted). */
  runHistory: QualityRunEntry[];
  /** Run an assessment; no config re-runs with the last-used config. */
  run: (config?: QualityAssessConfig) => void;
}

const QualityViewContext = createContext<QualityViewValue | null>(null);

/** Access the shared quality view. Bridges the docked config panel and the Quality tab. */
// eslint-disable-next-line react-refresh/only-export-components
export function useQualityView(): QualityViewValue {
  const context = useContext(QualityViewContext);
  if (!context) throw new Error("useQualityView must be used within a QualityViewProvider");
  return context;
}

/**
 * Holds the latest quality report so the side-panel config (inputs) and the
 * Quality tab (results) stay in sync, and owns the assessment call. Reports are
 * computed on demand and never persisted; `runHistory` keeps this session's
 * scores in memory so the user can watch the score climb as they clean. The
 * tab auto-runs its first assessment on open; after that runs are manual — the
 * report is flagged `stale` when the dataset changes and the tab offers a
 * re-run, rather than re-running on every transform.
 */
export function QualityViewProvider({ children }: { children: ReactNode }) {
  const { projectId, dataVersion } = useProjectContext() as unknown as {
    projectId: string;
    dataVersion: number;
  };

  const [report, setReport] = useState<QualityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [versionAtRun, setVersionAtRun] = useState(0);
  const [runHistory, setRunHistory] = useState<QualityRunEntry[]>([]);
  // Last-used config, so "Run again" after a transform keeps the user's rules.
  const lastConfig = useRef<QualityAssessConfig>({});

  const run = useCallback(
    async (config?: QualityAssessConfig) => {
      if (config) lastConfig.current = config;
      setLoading(true);
      setError(false);
      try {
        const result = await runQualityAssessment(projectId, lastConfig.current);
        setReport(result);
        setVersionAtRun(dataVersion);
        setRunHistory((prev) => [...prev, { score: result.overall_score, at: Date.now() }]);
      } catch (err) {
        console.error("Error running quality assessment:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [projectId, dataVersion],
  );

  const value = useMemo<QualityViewValue>(
    () => ({
      report,
      loading,
      error,
      stale: report !== null && dataVersion !== versionAtRun,
      runHistory,
      run: (config?: QualityAssessConfig) => void run(config),
    }),
    [report, loading, error, dataVersion, versionAtRun, runHistory, run],
  );

  return <QualityViewContext.Provider value={value}>{children}</QualityViewContext.Provider>;
}
