import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { mergeProjects, getRecentProjects } from "../api";
import FormErrorAlert from "./common/FormErrorAlert";
import useError from "../hooks/useError";

const MergePanel = ({ projectId, onClose, onTransform }) => {
  const [projects, setProjects] = useState([]);
  const [rightProjectId, setRightProjectId] = useState("");
  const [joinType, setJoinType] = useState("inner");
  const [joinOn, setJoinOn] = useState("");
  const [leftOn, setLeftOn] = useState("");
  const [rightOn, setRightOn] = useState("");
  const [useCommonCol, setUseCommonCol] = useState(true);
  const [loading, setLoading] = useState(false);
  const { error, clearError, handleError } = useError();

  useEffect(() => {
    getRecentProjects().then(setProjects).catch(console.error);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    clearError();
    try {
      const params = {
        right_project_id: rightProjectId,
        how: joinType,
      };
      if (joinType !== "cross") {
        if (useCommonCol) {
          params.on = joinOn;
        } else {
          params.left_on = leftOn;
          params.right_on = rightOn;
        }
      }
      const response = await mergeProjects(projectId, params);
      onTransform(response);
      onClose();
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const otherProjects = projects.filter((p) => String(p.project_id) !== projectId);

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <form onSubmit={handleSubmit}>
        <h3 className="font-semibold text-gray-900 mb-2">Merge / Join Datasets</h3>
        <div className="flex space-x-2 mb-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Right Dataset:</label>
            <select
              value={rightProjectId}
              onChange={(e) => setRightProjectId(e.target.value)}
              className="border border-gray-300 rounded-md w-full px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
              required
            >
              <option value="">Select project...</option>
              {otherProjects.map((p) => (
                <option key={p.project_id} value={p.project_id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Join Type:</label>
            <select
              value={joinType}
              onChange={(e) => setJoinType(e.target.value)}
              className="border border-gray-300 rounded-md w-full px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
            >
              <option value="inner">Inner</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
              <option value="outer">Outer</option>
              <option value="cross">Cross</option>
            </select>
          </div>
        </div>
        {joinType !== "cross" && (
          <div className="mb-3">
            <label className="flex items-center gap-2 text-sm text-gray-700 mb-2">
              <input
                type="checkbox"
                checked={useCommonCol}
                onChange={(e) => setUseCommonCol(e.target.checked)}
              />
              Use common column name
            </label>
            {useCommonCol ? (
              <input
                type="text"
                value={joinOn}
                onChange={(e) => setJoinOn(e.target.value)}
                placeholder="Common column name (e.g., id)"
                className="border border-gray-300 rounded-md w-full px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
                required
              />
            ) : (
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={leftOn}
                  onChange={(e) => setLeftOn(e.target.value)}
                  placeholder="Left column"
                  className="border border-gray-300 rounded-md flex-1 px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
                  required
                />
                <input
                  type="text"
                  value={rightOn}
                  onChange={(e) => setRightOn(e.target.value)}
                  placeholder="Right column"
                  className="border border-gray-300 rounded-md flex-1 px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
            )}
          </div>
        )}
        <div className="flex justify-between">
          <button
            type="submit"
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md font-medium transition-colors duration-150"
            disabled={loading}
          >
            {loading ? "Merging..." : "Merge"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-md font-medium transition-colors duration-150"
          >
            Cancel
          </button>
        </div>
      </form>
      <FormErrorAlert message={error} />
    </div>
  );
};

MergePanel.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onTransform: PropTypes.func.isRequired,
};

export default MergePanel;
