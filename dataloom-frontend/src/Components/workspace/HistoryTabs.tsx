import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useHistoryRefreshTokens } from "../../context/HistoryRefreshContext";
import { useActiveJob } from "../../context/ActiveJobContext";
import { getCheckpoints } from "../../api";
import { useLogs } from "../../hooks/useLogs";
import LogsPanel from "../history/LogsPanel";
import CheckpointsPanel from "../history/CheckpointsPanel";
import ConfirmDialog from "../common/ConfirmDialog";

interface CheckpointEntry {
  id: string;
  message: string;
  created_at: string;
  [key: string]: unknown;
}

interface ConfirmData {
  message: string;
  onConfirm: () => void | Promise<void>;
}

/** Logs tab — fetches the project's change log and refreshes on transform events. */
export function LogsTab() {
  const { projectId } = useParams() as { projectId: string };
  const logs = useLogs(projectId);

  return (
    <div className="flex-1 overflow-auto p-4">
      <LogsPanel logs={logs} />
    </div>
  );
}

/**
 * Checkpoints tab — lists checkpoints and handles revert/delete.
 *
 * A revert runs as a background job: the workspace banner shows its progress
 * and Cancel, and the job's completion reloads the table, the logs and the
 * toast. Revert stays disabled while any job is rewriting the project.
 */
export function CheckpointsTab() {
  const { projectId } = useParams() as { projectId: string };
  const { startJob, activeWriteJob } = useActiveJob();
  const { checkpointsToken } = useHistoryRefreshTokens();
  const [checkpoints, setCheckpoints] = useState<CheckpointEntry[] | null>(null);
  const [confirmData, setConfirmData] = useState<ConfirmData | null>(null);

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
        setConfirmData(null);
        await startJob(
          { kind: "revert", checkpoint_id: checkpointId },
          { success: "Project reverted successfully!", failure: "Failed to revert project." },
        );
      },
    });
  };

  return (
    <div className="flex-1 overflow-auto p-4">
      <CheckpointsPanel
        projectId={projectId}
        checkpoints={checkpoints}
        onRevert={handleRevert}
        revertDisabled={activeWriteJob !== null}
        onCheckpointDeleted={fetchCheckpoints}
      />

      <ConfirmDialog
        isOpen={!!confirmData}
        message={confirmData?.message ?? ""}
        onConfirm={confirmData?.onConfirm ?? (() => {})}
        onCancel={() => setConfirmData(null)}
      />
    </div>
  );
}
