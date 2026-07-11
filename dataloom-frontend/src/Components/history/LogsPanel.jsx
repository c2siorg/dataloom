import PropTypes from "prop-types";

const LogsPanel = ({ logs }) => {
  return (
    <div data-testid="logs-panel">
      <div className="overflow-x-auto">
        <table className="min-w-full bg-surface rounded-lg overflow-hidden">
          <thead className="bg-surface">
            <tr>
              <th className="py-3 px-4 border-b border-app-border text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Action Type
              </th>
              <th className="py-3 px-4 border-b border-app-border text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Timestamp
              </th>
              <th className="py-3 px-4 border-b border-app-border text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Checkpoint ID
              </th>
              <th className="py-3 px-4 border-b border-app-border text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Applied
              </th>
            </tr>
          </thead>
          <tbody>
            {logs.length > 0 ? (
              logs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-app-border hover:bg-surface-hover transition-colors duration-150"
                >
                  <td className="py-3 px-4 text-sm text-foreground">{log.action_type}</td>
                  <td className="py-3 px-4 text-sm text-foreground">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-sm text-foreground">{log.checkpoint_id || "-"}</td>
                  <td className="py-3 px-4 text-sm text-foreground">{log.applied ? "Yes" : "No"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4" className="py-4 px-4 text-center text-sm text-muted-foreground">
                  No logs available
                </td>
              </tr>
            )}
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
};

export default LogsPanel;
