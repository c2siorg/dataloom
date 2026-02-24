import PropTypes from "prop-types";

const CheckpointsPanel = ({ checkpoints, onClose, onRevert }) => {
  const hasCheckpoints =
    checkpoints && Array.isArray(checkpoints)
      ? checkpoints.length > 0
      : checkpoints && checkpoints.id;

  return (
    <div className="p-4 bg-gray-100 text-black shadow-md mx-auto relative group">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-xl">Last Checkpoint</h3>
        <button
          onClick={onClose}
          className="text-red-600 hover:text-black font-bold transition-opacity opacity-0 group-hover:opacity-100"
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
        <table className="min-w-full bg-white rounded-lg overflow-hidden shadow-md">
          <thead className="bg-green-300">
            <tr>
              <th className="py-3 px-6 text-left font-semibold text-black">Message</th>
              <th className="py-3 px-6 text-left font-semibold text-black">Created At</th>
              <th className="py-3 px-6 text-center font-semibold text-black">Action</th>
            </tr>
          </thead>
          <tbody>
            {hasCheckpoints ? (
              <tr className="bg-gray-50 hover:bg-gray-100 transition duration-300">
                <td className="py-4 px-6 text-gray-800">{checkpoints.message}</td>
                <td className="py-4 px-6 text-gray-600">
                  {new Date(checkpoints.created_at).toLocaleString()}
                </td>
                <td className="py-4 px-6 text-center">
                  <button
                    onClick={() => onRevert(checkpoints.id)}
                    className="bg-blue-500 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg transition duration-300"
                  >
                    Revert
                  </button>
                </td>
              </tr>
            ) : (
              <tr>
                <td colSpan="3" className="py-4 px-6 text-center text-gray-600">
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
    id: PropTypes.number,
    message: PropTypes.string,
    created_at: PropTypes.string,
  }),
  onClose: PropTypes.func.isRequired,
  onRevert: PropTypes.func.isRequired,
};

export default CheckpointsPanel;
