import { useEffect, useState } from "react";
import { getUndoState, type UndoState } from "../api/transforms";
import { useHistoryRefreshTokens } from "../context/HistoryRefreshContext";

/**
 * Whether Undo and Redo have anything to act on, refetched on mount and
 * whenever a mutation bumps the logs token — every transform, undo, redo,
 * save, revert, pipeline run and file append does.
 *
 * `null` until the first answer arrives and after a failed fetch, so callers
 * leave the buttons enabled and the backend's 404 stays the guard. A response
 * that lands after a newer fetch started is ignored.
 */
export function useUndoState(projectId: string): UndoState | null {
  const { logsToken } = useHistoryRefreshTokens();
  const [undoState, setUndoState] = useState<UndoState | null>(null);

  useEffect(() => {
    let current = true;
    getUndoState(projectId)
      .then((state) => {
        if (current) setUndoState(state);
      })
      .catch((error) => {
        if (current) setUndoState(null);
        console.error("Error fetching undo state:", error);
      });
    return () => {
      current = false;
    };
  }, [projectId, logsToken]);

  return undoState;
}
