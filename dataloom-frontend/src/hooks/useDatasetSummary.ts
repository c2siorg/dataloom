import { useCallback, useEffect, useState } from "react";
import { getDatasetSummary, type DatasetSummary } from "../api/profiling";
import { getCached, setCached } from "../utils/profilingCache";

interface UseDatasetSummaryResult {
  summary: DatasetSummary | null;
  error: boolean;
  /** Force a refetch (e.g. from a retry button), bypassing the cache. */
  refetch: () => void;
}

const NAMESPACE = "summary";

/**
 * Fetch the dataset-wide summary for the current project, cached by
 * `dataVersion`. While the cache holds the current version the hook serves it
 * without hitting the API; it refetches only after a content change bumps the
 * version. See {@link useColumnProfiles} for the shared caching rationale.
 *
 * `dataVersion` is ProjectContext's content-mutation counter (changes on any
 * edit, never on pagination).
 */
export default function useDatasetSummary(
  projectId: string | undefined,
  enabled: boolean,
  dataVersion: number,
): UseDatasetSummaryResult {
  const [summary, setSummary] = useState<DatasetSummary | null>(null);
  const [error, setError] = useState(false);
  // Bumped by refetch() to force a cache-bypassing reload from the same version.
  const [reloadToken, setReloadToken] = useState(0);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (!enabled || !projectId) return;

    if (reloadToken === 0) {
      const cached = getCached<DatasetSummary>(NAMESPACE, projectId, dataVersion);
      if (cached) {
        setSummary(cached);
        setError(false);
        return;
      }
    }

    let cancelled = false;
    setSummary(null);
    setError(false);

    getDatasetSummary(projectId)
      .then((data) => {
        if (cancelled) return;
        setCached(NAMESPACE, projectId, dataVersion, data);
        setSummary(data);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Error fetching dataset summary:", err);
        setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, enabled, dataVersion, reloadToken]);

  return { summary, error, refetch };
}
