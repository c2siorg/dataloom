import { useEffect, useState } from "react";
import { getColumnProfiles, type ColumnProfile } from "../api/profiling";
import { getCached, setCached } from "../utils/profilingCache";

interface UseColumnProfilesResult {
  /** Profiles keyed by column name. Empty if the fetch failed. */
  profiles: Record<string, ColumnProfile>;
  loading: boolean;
}

type ProfileMap = Record<string, ColumnProfile>;

const NAMESPACE = "columns";

/**
 * Fetch per-column profiles for the current project, keyed by column name.
 *
 * Profiles are dataset-wide (the backend reads the whole working copy), so all
 * columns are fetched in a single batch request that reads the data once, then
 * cached by `dataVersion`. While the cache holds the current version the hook
 * serves it without hitting the API; it refetches only after a content change
 * bumps the version. A failed request leaves `profiles` empty rather than
 * throwing.
 *
 * `dataVersion` is ProjectContext's content-mutation counter — it changes on any
 * edit (and never on pagination), so the cache invalidates exactly when the data
 * does.
 */
export default function useColumnProfiles(
  projectId: string | undefined,
  enabled: boolean,
  dataVersion: number,
): UseColumnProfilesResult {
  const [profiles, setProfiles] = useState<ProfileMap>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !projectId) {
      // Avoid an extra render (and act() warning in tests) when already empty.
      setProfiles((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }

    const cached = getCached<ProfileMap>(NAMESPACE, projectId, dataVersion);
    if (cached) {
      setProfiles(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    getColumnProfiles(projectId)
      .then((results) => {
        if (cancelled) return;
        const next: ProfileMap = {};
        for (const profile of results) {
          next[profile.column] = profile;
        }
        setCached(NAMESPACE, projectId, dataVersion, next);
        setProfiles(next);
      })
      .catch(() => {
        if (!cancelled) setProfiles({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, enabled, dataVersion]);

  return { profiles, loading };
}
