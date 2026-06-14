import { useState } from "react";
import { deleteCheckpoint } from "../../api";
import PropTypes from "prop-types";
import Modal from "../common/Modal";
import { useToast } from "../../context/ToastContext";
import Button from "../common/Button";

const CheckpointsPanel = ({ projectId, checkpoints, onClose, onRevert, onCheckpointDeleted }) => {
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const { showToast } = useToast();

  const hasCheckpoints = Array.isArray(checkpoints) && checkpoints.length > 0;

  const handleDeleteConfirm = async () => {
    try {
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
    <div
      data-testid="checkpoints-panel"
      className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm mx-auto relative group"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Checkpoints</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 font-medium transition-opacity opacity-0 group-hover:opacity-100"
          style={{
            transition: "opacity 0.3s",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>

      <div className="overflow-x-auto overflow-y-auto max-h-72">
        <table className="min-w-full bg-white rounded-lg overflow-hidden">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Message
              </th>
              <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created At
              </th>
              <th className="py-3 px-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {hasCheckpoints ? (
              checkpoints.map((checkpoint) => (
                <tr
                  key={checkpoint.id}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors duration-150"
                >
                  <td className="py-3 px-4 text-sm text-gray-700">{checkpoint.message}</td>
                  <td className="py-3 px-4 text-sm text-gray-500">
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
                <td colSpan="3" className="py-4 px-4 text-center text-sm text-gray-500">
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
        <p className="text-gray-700 text-sm mb-6">
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

CheckpointsPanel.propTypes = {
  projectId: PropTypes.string.isRequired,
  checkpoints: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      message: PropTypes.string.isRequired,
      created_at: PropTypes.string.isRequired,
    }),
  ),
  onClose: PropTypes.func.isRequired,
  onRevert: PropTypes.func.isRequired,
  onCheckpointDeleted: PropTypes.func.isRequired,
};

export default CheckpointsPanel;
