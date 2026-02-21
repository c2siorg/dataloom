import PropTypes from "prop-types";

const CheckpointsPanel = ({ checkpoints, onClose, onRevert }) => {
  const hasCheckpoints = checkpoints && Array.isArray(checkpoints) ? checkpoints.length > 0 : checkpoints && checkpoints.id;

  return (
    <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm mx-auto relative group">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Last Checkpoint</h3>
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
        <table className="min-w-full bg-white rounded-lg overflow-hidden">
          <thead className="bg-gray-50">
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
            {hasCheckpoints ? (
              <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors duration-150">
                <td className="py-3 px-4 text-sm text-gray-700">
                  {checkpoints.message}
                </td>
                <td className="py-3 px-4 text-sm text-gray-500">
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
                <td colSpan="3" className="py-4 px-4 text-center text-sm text-gray-500">
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
