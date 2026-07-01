import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface HistoryRefreshActions {
  /** Signal that an open Logs tab should refetch (after a transform, undo, save, or revert). */
  refreshLogs: () => void;
  /** Signal that an open Checkpoints tab should refetch (after a save). */
  refreshCheckpoints: () => void;
}

interface HistoryRefreshTokens {
  /** Bumps whenever the change log may have changed; consume in a fetch effect's deps. */
  logsToken: number;
  /** Bumps whenever the checkpoint list may have changed; consume in a fetch effect's deps. */
  checkpointsToken: number;
}

// Two contexts so the (stable) refresh actions and the (changing) tokens are
// subscribed to independently. Mutation sites only need the actions, so they
// never re-render when a token bumps; only the Logs/Checkpoints tabs read the
// tokens and refetch. See rerender-defer-reads.
const HistoryRefreshActionsContext = createContext<HistoryRefreshActions | null>(null);
const HistoryRefreshTokensContext = createContext<HistoryRefreshTokens | null>(null);

/**
 * Access the history-refresh actions. Mutation sites (forms, save/undo/revert)
 * call `refreshLogs`/`refreshCheckpoints` to signal that history changed.
 *
 * Must be used within a HistoryRefreshProvider.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useHistoryRefresh(): HistoryRefreshActions {
  const context = useContext(HistoryRefreshActionsContext);
  if (!context) throw new Error("useHistoryRefresh must be used within a HistoryRefreshProvider");
  return context;
}

/**
 * Access the history-refresh tokens. The Logs and Checkpoints tabs read the
 * matching token to know when to refetch.
 *
 * Must be used within a HistoryRefreshProvider.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useHistoryRefreshTokens(): HistoryRefreshTokens {
  const context = useContext(HistoryRefreshTokensContext);
  if (!context)
    throw new Error("useHistoryRefreshTokens must be used within a HistoryRefreshProvider");
  return context;
}

/** Holds the refresh tokens for the workspace's Logs and Checkpoints tabs. */
export function HistoryRefreshProvider({ children }: { children: ReactNode }) {
  const [logsToken, setLogsToken] = useState(0);
  const [checkpointsToken, setCheckpointsToken] = useState(0);

  const refreshLogs = useCallback(() => setLogsToken((n) => n + 1), []);
  const refreshCheckpoints = useCallback(() => setCheckpointsToken((n) => n + 1), []);

  // Stable for the lifetime of the provider, so action-only consumers never
  // re-render in response to a token bump.
  const actions = useMemo<HistoryRefreshActions>(
    () => ({ refreshLogs, refreshCheckpoints }),
    [refreshLogs, refreshCheckpoints],
  );
  const tokens = useMemo<HistoryRefreshTokens>(
    () => ({ logsToken, checkpointsToken }),
    [logsToken, checkpointsToken],
  );

  return (
    <HistoryRefreshActionsContext.Provider value={actions}>
      <HistoryRefreshTokensContext.Provider value={tokens}>
        {children}
      </HistoryRefreshTokensContext.Provider>
    </HistoryRefreshActionsContext.Provider>
  );
}
