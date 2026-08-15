import { useState } from "react";
import { deleteCheckpoint, type Checkpoint } from "../../api";
import Modal from "../common/Modal";
import { useToast } from "../../context/ToastContext";
import Button from "../common/Button";

interface CheckpointsPanelProps {
  projectId: string;
  checkpoints?: Checkpoint[] | null;
  onRevert: (checkpointId: string) => void;
  onCheckpointDeleted: () => Promise<void> | void;
}

const CheckpointsPanel = ({
  projectId,
  checkpoints,
  onRevert,
  onCheckpointDeleted,
}: CheckpointsPanelProps) => {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const { showToast } = useToast();

  const hasCheckpoints = Array.isArray(checkpoints) && checkpoints.length > 0;

  const handleDeleteConfirm = async () => {
    try {
      if (!confirmDeleteId) return;
      await deleteCheckpoint(projectId, confirmDeleteId);
      showToast("Checkpoint deleted successfully", "success");
      await onCheckpointDeleted();
    } catch (err) {
      console.error(err);
    } finally {
      setConfirmDeleteId(null);
    }
  };

  return (
    <div data-testid="checkpoints-panel">
      <div className="overflow-x-auto">
        <table className="min-w-full bg-surface rounded-lg overflow-hidden">
          <thead className="bg-surface border-b border-app-border sticky top-0">
            <tr>
              <th className="py-3 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Message
              </th>
              <th className="py-3 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Created At
              </th>
              <th className="py-3 px-4 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {hasCheckpoints ? (
              checkpoints.map((checkpoint) => (
                <tr
                  key={checkpoint.id}
                  className="border-b border-app-border hover:bg-surface-hover transition-colors duration-150"
                >
                  <td className="py-3 px-4 text-sm text-foreground">{checkpoint.message}</td>
                  <td className="py-3 px-4 text-sm text-muted-foreground">
                    {new Date(checkpoint.created_at).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Button size="sm" onClick={() => onRevert(checkpoint.id)}>
                        Revert
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => setConfirmDeleteId(checkpoint.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="py-4 px-4 text-center text-sm text-muted-foreground">
                  No checkpoints available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        title="Delete Checkpoint"
      >
        <p className="text-foreground text-sm mb-6">
          Are you sure you want to delete this checkpoint? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmDeleteId(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDeleteConfirm}>
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default CheckpointsPanel;
