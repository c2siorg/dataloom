import PropTypes from "prop-types";

const LogsPanel = ({ logs, onClose }) => {
  return (
    <div data-testid="logs-panel" className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm mx-auto relative group">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Logs</h3>
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

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full bg-white rounded-lg overflow-hidden">
          <thead className="bg-gray-50">
            <tr>
              <th className="py-3 px-4 border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Action Type
              </th>
              <th className="py-3 px-4 border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Timestamp
              </th>
              <th className="py-3 px-4 border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Checkpoint ID
              </th>
              <th className="py-3 px-4 border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Applied
              </th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr
                key={log.id}
                className="border-b border-gray-100 hover:bg-gray-50 transition-colors duration-150"
              >
                <td className="py-3 px-4 text-sm text-gray-700">{log.action_type}</td>
                <td className="py-3 px-4 text-sm text-gray-700">
                  {new Date(log.timestamp).toLocaleString()}
                </td>
                <td className="py-3 px-4 text-sm text-gray-700">{log.checkpoint_id || "-"}</td>
                <td className="py-3 px-4 text-sm text-gray-700">{log.applied ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

LogsPanel.propTypes = {
  logs: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.number.isRequired,
      action_type: PropTypes.string.isRequired,
      timestamp: PropTypes.string.isRequired,
      checkpoint_id: PropTypes.string,
      applied: PropTypes.bool.isRequired,
    }),
  ).isRequired,
  onClose: PropTypes.func.isRequired,
};

export default LogsPanel;
