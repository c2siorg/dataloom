import { useCallback, useEffect, useState } from "react";
import { getLogs, type LogEntry } from "../api";
import { useHistoryRefreshTokens } from "../context/HistoryRefreshContext";

export type { LogEntry };

/**
 * A project's change log, refetched on mount and whenever a mutation bumps the
 * logs token. Shared by the Logs tab and the pipeline builder's history picker,
 * so both see the same rows under the same refresh contract.
 */
export function useLogs(projectId: string): LogEntry[] {
  const { logsToken } = useHistoryRefreshTokens();
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const fetchLogs = useCallback(async () => {
    try {
      setLogs(await getLogs(projectId));
    } catch (error) {
      // Keep the rows already on screen; the next token bump retries.
      console.error("Error fetching logs:", error);
    }
  }, [projectId]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs, logsToken]);

  return logs;
}
