import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useProjectContext } from "../../context/ProjectContext";
import { useHistoryRefresh, useHistoryRefreshTokens } from "../../context/HistoryRefreshContext";
import { getLogs, getCheckpoints, revertToCheckpoint } from "../../api";
import LogsPanel from "../history/LogsPanel";
import CheckpointsPanel from "../history/CheckpointsPanel";
import ConfirmDialog from "../common/ConfirmDialog";
import Toast from "../common/Toast";

interface LogEntry {
  id: number;
  action_type: string;
  timestamp: string;
  checkpoint_id?: string | null;
  applied: boolean;
}

interface CheckpointEntry {
  id: string;
  message: string;
  created_at: string;
  [key: string]: unknown;
}

// revert/checkpoint API helpers are authored in JS (typed as Object); narrow
// the response shapes this module reads.
interface RevertResponse {
  columns: string[];
  rows: unknown[];
  dtypes: Record<string, string>;
}

interface ToastState {
  message: string;
  type: "success" | "error" | "info" | "warning";
}

interface ConfirmData {
  message: string;
  onConfirm: () => void | Promise<void>;
}

// ProjectContext is authored in JS; narrow the one slice this module uses.
type UpdateData = (
  columns: string[],
  rows: unknown[],
  options?: { dtypes?: Record<string, string>; resetColumnOrder?: boolean },
) => void;

/** Logs tab — fetches the project's change log and refreshes on transform events. */
export function LogsTab() {
  const { projectId } = useParams() as { projectId: string };
  const { logsToken } = useHistoryRefreshTokens();
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const fetchLogs = useCallback(async () => {
    try {
      setLogs(await getLogs(projectId));
    } catch (error) {
      console.error("Error fetching logs:", error);
    }
  }, [projectId]);

  // Refetch on mount and whenever a mutation bumps the logs token.
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs, logsToken]);

  return (
    <div className="flex-1 overflow-auto p-4">
      <LogsPanel logs={logs} />
    </div>
  );
}

/** Checkpoints tab — lists checkpoints and handles revert/delete. */
export function CheckpointsTab() {
  const { projectId } = useParams() as { projectId: string };
  const { updateData } = useProjectContext() as unknown as { updateData: UpdateData };
  const { refreshLogs } = useHistoryRefresh();
  const { checkpointsToken } = useHistoryRefreshTokens();
  const [checkpoints, setCheckpoints] = useState<CheckpointEntry[] | null>(null);
  const [confirmData, setConfirmData] = useState<ConfirmData | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const fetchCheckpoints = useCallback(async () => {
    try {
      const response = (await getCheckpoints(projectId)) as
        | CheckpointEntry
        | CheckpointEntry[]
        | null;
      if (Array.isArray(response)) {
        setCheckpoints(response);
      } else if (response?.id) {
        setCheckpoints([response]);
      } else {
        setCheckpoints([]);
      }
    } catch (error) {
      console.error("Error fetching checkpoints:", error);
      setCheckpoints(null);
    }
  }, [projectId]);

  // Refetch on mount and whenever a save bumps the checkpoints token.
  useEffect(() => {
    fetchCheckpoints();
  }, [fetchCheckpoints, checkpointsToken]);

  const handleRevert = (checkpointId: string) => {
    setConfirmData({
      message: "Are you sure you want to revert to this checkpoint?",
      onConfirm: async () => {
        try {
          const response = (await revertToCheckpoint(projectId, checkpointId)) as RevertResponse;
          updateData(response.columns, response.rows, {
            dtypes: response.dtypes,
            resetColumnOrder: false,
          });
          // Reverting un-applies later logs, so refresh any open Logs tab.
          refreshLogs();
          setToast({ message: "Project reverted successfully!", type: "success" });
        } catch {
          setToast({ message: "Failed to revert project.", type: "error" });
        }
        setConfirmData(null);
      },
    });
  };

  return (
    <div className="flex-1 overflow-auto p-4">
      <CheckpointsPanel
        projectId={projectId}
        checkpoints={checkpoints}
        onRevert={handleRevert}
        onCheckpointDeleted={fetchCheckpoints}
      />

      <ConfirmDialog
        isOpen={!!confirmData}
        message={confirmData?.message ?? ""}
        onConfirm={confirmData?.onConfirm ?? (() => {})}
        onCancel={() => setConfirmData(null)}
      />

      {toast && (
        <div className="fixed bottom-4 right-4 z-50">
          <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
        </div>
      )}
    </div>
  );
}
