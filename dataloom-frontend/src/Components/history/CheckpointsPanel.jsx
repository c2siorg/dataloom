import PropTypes from "prop-types";

const CheckpointsPanel = ({ checkpoints, onClose, onRevert }) => {
  const hasCheckpoints =
    checkpoints && Array.isArray(checkpoints)
      ? checkpoints.length > 0
      : checkpoints && checkpoints.id;

  return (
    <div className="p-4 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-lg shadow-sm mx-auto relative group">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text">Last Checkpoint</h3>
        <button
          onClick={onClose}
          className="text-gray-400 dark:text-dark-muted hover:text-gray-600 dark:hover:text-dark-text font-medium transition-opacity opacity-0 group-hover:opacity-100"
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
        <table className="min-w-full bg-white dark:bg-dark-surface rounded-lg overflow-hidden">
          <thead className="bg-gray-50 dark:bg-dark-bg">
            <tr>
              <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 dark:text-dark-muted uppercase tracking-wider">
                Message
              </th>
              <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 dark:text-dark-muted uppercase tracking-wider">
                Created At
              </th>
              <th className="py-3 px-4 text-center text-xs font-medium text-gray-500 dark:text-dark-muted uppercase tracking-wider">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {hasCheckpoints ? (
              <tr className="border-b border-gray-100 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg transition-colors duration-150">
                <td className="py-3 px-4 text-sm text-gray-700 dark:text-dark-text">
                  {checkpoints.message}
                </td>
                <td className="py-3 px-4 text-sm text-gray-500 dark:text-dark-muted">
                  {new Date(checkpoints.created_at).toLocaleString()}
                </td>
                <td className="py-3 px-4 text-center">
                  <button
                    onClick={() => onRevert(checkpoints.id)}
                    className="bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium px-3 py-1.5 rounded-md transition-colors duration-150"
                  >
                    Revert
                  </button>
                </td>
              </tr>
            ) : (
              <tr>
                <td
                  colSpan="3"
                  className="py-4 px-4 text-center text-sm text-gray-500 dark:text-dark-muted"
                >
                  No checkpoint available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

CheckpointsPanel.propTypes = {
  checkpoints: PropTypes.shape({
    id: PropTypes.string,
    message: PropTypes.string,
    created_at: PropTypes.string,
  }),
  onClose: PropTypes.func.isRequired,
  onRevert: PropTypes.func.isRequired,
};

export default CheckpointsPanel;
