import { useCallback, useEffect, useState } from "react";
import { getChartSuggestions, type ChartSpec } from "../api/visualizations";
import { getCached, setCached } from "../utils/profilingCache";

interface UseChartSuggestionsResult {
  suggestions: ChartSpec[] | null;
  error: boolean;
  /** Force a refetch (e.g. from a retry button), bypassing the cache. */
  refetch: () => void;
}

const NAMESPACE = "chart-suggestions";

/**
 * Fetch the dataset's auto-suggested charts, cached by `dataVersion`. While the
 * cache holds the current version the hook serves it without hitting the API; it
 * refetches only after a content change bumps the version. Mirrors
 * {@link useCorrelation}'s caching.
 *
 * `dataVersion` is ProjectContext's content-mutation counter (changes on any
 * edit, never on pagination).
 */
export default function useChartSuggestions(
  projectId: string | undefined,
  enabled: boolean,
  dataVersion: number,
): UseChartSuggestionsResult {
  const [suggestions, setSuggestions] = useState<ChartSpec[] | null>(null);
  const [error, setError] = useState(false);
  // Bumped by refetch() to force a cache-bypassing reload from the same version.
  const [reloadToken, setReloadToken] = useState(0);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (!enabled || !projectId) return;

    if (reloadToken === 0) {
      const cached = getCached<ChartSpec[]>(NAMESPACE, projectId, dataVersion);
      if (cached) {
        setSuggestions(cached);
        setError(false);
        return;
      }
    }

    let cancelled = false;
    setSuggestions(null);
    setError(false);

    getChartSuggestions(projectId)
      .then((data) => {
        if (cancelled) return;
        setCached(NAMESPACE, projectId, dataVersion, data);
        setSuggestions(data);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Error fetching chart suggestions:", err);
        setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, enabled, dataVersion, reloadToken]);

  return { suggestions, error, refetch };
}
