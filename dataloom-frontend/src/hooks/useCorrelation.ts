import { useCallback, useEffect, useState } from "react";
import { getCorrelationMatrix, type Correlation } from "../api/profiling";
import { getCached, setCached } from "../utils/profilingCache";

interface UseCorrelationResult {
  correlation: Correlation | null;
  error: boolean;
  /** Force a refetch (e.g. from a retry button), bypassing the cache. */
  refetch: () => void;
}

const NAMESPACE = "correlation";

/**
 * Fetch the pairwise Pearson correlation matrix over the project's numeric
 * columns, cached by `dataVersion`. While the cache holds the current version
 * the hook serves it without hitting the API; it refetches only after a content
 * change bumps the version. See {@link useDatasetSummary} for the shared caching
 * rationale.
 *
 * `dataVersion` is ProjectContext's content-mutation counter (changes on any
 * edit, never on pagination).
 */
export default function useCorrelation(
  projectId: string | undefined,
  enabled: boolean,
  dataVersion: number,
): UseCorrelationResult {
  const [correlation, setCorrelation] = useState<Correlation | null>(null);
  const [error, setError] = useState(false);
  // Bumped by refetch() to force a cache-bypassing reload from the same version.
  const [reloadToken, setReloadToken] = useState(0);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (!enabled || !projectId) return;

    if (reloadToken === 0) {
      const cached = getCached<Correlation>(NAMESPACE, projectId, dataVersion);
      if (cached) {
        setCorrelation(cached);
        setError(false);
        return;
      }
    }

    let cancelled = false;
    setCorrelation(null);
    setError(false);

    getCorrelationMatrix(projectId)
      .then((data) => {
        if (cancelled) return;
        setCached(NAMESPACE, projectId, dataVersion, data);
        setCorrelation(data);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Error fetching correlation matrix:", err);
        setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, enabled, dataVersion, reloadToken]);

  return { correlation, error, refetch };
}
