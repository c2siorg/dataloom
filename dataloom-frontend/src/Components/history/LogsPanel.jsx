import PropTypes from "prop-types";

const LogsPanel = ({ logs, onClose }) => {
  return (
    <div className="p-4 bg-gray-100 text-black shadow-md mx-auto relative group">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-xl">Logs</h3>
        <button
          onClick={onClose}
          className="text-red-600 hover:text-black  font-bold  transition-opacity opacity-0 group-hover:opacity-100"
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
        <table className="min-w-full bg-white rounded-lg overflow-hidden shadow-md">
          <thead className="bg-green-300">
            <tr>
              <th className="py-2 px-4 border-b text-left font-semibold">Action Type</th>
              <th className="py-2 px-4 border-b text-left font-semibold">Timestamp</th>
              <th className="py-2 px-4 border-b text-left font-semibold">Checkpoint ID</th>
              <th className="py-2 px-4 border-b text-left font-semibold">Applied</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-gray-100 transition duration-300">
                <td className="py-2 px-4 border-b">{log.action_type}</td>
                <td className="py-2 px-4 border-b">{new Date(log.timestamp).toLocaleString()}</td>
                <td className="py-2 px-4 border-b">{log.checkpoint_id || "-"}</td>
                <td className="py-2 px-4 border-b">{log.applied ? "Yes" : "No"}</td>
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
      checkpoint_id: PropTypes.number,
      applied: PropTypes.bool.isRequired,
    }),
  ).isRequired,
  onClose: PropTypes.func.isRequired,
};

export default LogsPanel;
