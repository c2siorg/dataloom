/**
 * Module-level cache for derived profiling data, keyed by project and a data
 * version. Profiling is dataset-wide and expensive to recompute, so once fetched
 * it is reused until the project's contents change.
 *
 * The version is the `dataVersion` counter from ProjectContext, which bumps on
 * every content mutation (and never on pagination). A cached entry is only
 * served when its stored version matches the current one, so the cache can
 * never return stale data after an edit.
 *
 * The cache lives for the lifetime of the SPA session (module scope), so it
 * survives component unmounts — toggling a panel off/on or navigating away and
 * back is a cache hit as long as the data is unchanged.
 */

interface Entry<T> {
  version: number;
  data: T;
}

const caches = new Map<string, Map<string, Entry<unknown>>>();

function bucket(namespace: string): Map<string, Entry<unknown>> {
  let b = caches.get(namespace);
  if (!b) {
    b = new Map();
    caches.set(namespace, b);
  }
  return b;
}

/** Return the cached value for `projectId` if it was stored at `version`. */
export function getCached<T>(namespace: string, projectId: string, version: number): T | undefined {
  const entry = bucket(namespace).get(projectId);
  return entry && entry.version === version ? (entry.data as T) : undefined;
}

/** Store `data` for `projectId` at `version`, replacing any older entry. */
export function setCached<T>(namespace: string, projectId: string, version: number, data: T): void {
  bucket(namespace).set(projectId, { version, data });
}

/** Clear the entire profiling cache. Exposed for tests. */
export function clearProfilingCache(): void {
  caches.clear();
}
