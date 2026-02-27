import { useState } from "react";
import PropTypes from "prop-types";
import ConfirmDialog from "../common/ConfirmDialog";

const CheckpointsPanel = ({ checkpoints, onClose, onRevert, loading = false, error = null }) => {
  const [confirmData, setConfirmData] = useState(null);
  const [revertingId, setRevertingId] = useState(null);

  const handleRevertClick = (checkpoint) => {
    setConfirmData({
      checkpoint,
      message: `Are you sure you want to revert to checkpoint "${checkpoint.message}"?\n\nThis action will restore the project to ${new Date(checkpoint.created_at).toLocaleString()} and remove all subsequent changes.`,
    });
  };

  const handleConfirmRevert = async () => {
    if (!confirmData?.checkpoint) return;

    setRevertingId(confirmData.checkpoint.id);
    setConfirmData(null);

    try {
      await onRevert(confirmData.checkpoint.id);
    } finally {
      setRevertingId(null);
    }
  };

  const handleCancelRevert = () => {
    setConfirmData(null);
  };

  const hasCheckpoints = checkpoints && checkpoints.length > 0;

  return (
    <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm mx-auto relative group">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">All Checkpoints</h3>
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

      <div className="overflow-x-auto">
        <div
          className="min-w-full bg-white rounded-lg overflow-hidden"
          style={{ maxHeight: "400px", overflowY: "auto" }}
        >
          <table className="min-w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Message
                </th>
                <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created At
                </th>
                <th className="py-3 px-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="3" className="py-4 px-4 text-center text-sm text-gray-500">
                    Loading checkpoints...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan="3" className="py-4 px-4 text-center text-sm text-red-500">
                    Error loading checkpoints: {error}
                  </td>
                </tr>
              ) : hasCheckpoints ? (
                checkpoints.map((checkpoint, index) => (
                  <tr
                    key={checkpoint.id}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors duration-150"
                  >
                    <td className="py-3 px-4 text-sm text-gray-700">
                      {checkpoint.message}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500">
                      {new Date(checkpoint.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleRevertClick(checkpoint)}
                        disabled={revertingId === checkpoint.id}
                        className={`text-sm font-medium px-3 py-1.5 rounded-md transition-colors duration-150 ${revertingId === checkpoint.id
                          ? "bg-gray-400 text-white cursor-not-allowed"
                          : "bg-blue-500 hover:bg-blue-600 text-white"
                          }`}
                      >
                        {revertingId === checkpoint.id ? "Reverting..." : "Revert"}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="3" className="py-4 px-4 text-center text-sm text-gray-500">
                    No checkpoints yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!confirmData}
        message={confirmData?.message}
        onConfirm={handleConfirmRevert}
        onCancel={handleCancelRevert}
      />
    </div>
  );
};

CheckpointsPanel.propTypes = {
  checkpoints: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      message: PropTypes.string.isRequired,
      created_at: PropTypes.string.isRequired,
    })
  ).isRequired,
  onClose: PropTypes.func.isRequired,
  onRevert: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  error: PropTypes.string,
};

export default CheckpointsPanel;
