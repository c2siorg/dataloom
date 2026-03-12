import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { getQualityAssessment, applyQualityFix } from "../api";

const ScoreBadge = ({ score }) => {
  const color = score >= 80 ? "bg-green-100 text-green-800" : score >= 50 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800";
  return <span className={`text-2xl font-bold px-4 py-2 rounded-lg ${color}`}>{score}/100</span>;
};

ScoreBadge.propTypes = { score: PropTypes.number.isRequired };

const QualityPanel = ({ projectId, onClose, onTransform }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fixing, setFixing] = useState(null);

  useEffect(() => {
    fetchQuality();
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchQuality = async () => {
    setLoading(true);
    try {
      const result = await getQualityAssessment(projectId);
      setData(result);
    } catch (err) {
      console.error("Error fetching quality:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleFix = async (suggestion) => {
    setFixing(suggestion.fix_type);
    try {
      const result = await applyQualityFix(projectId, suggestion.fix_type, suggestion.params);
      onTransform(result);
      await fetchQuality();
    } catch (err) {
      console.error("Error applying fix:", err);
    } finally {
      setFixing(null);
    }
  };

  if (loading) {
    return (
      <div className="p-4 border border-gray-200 rounded-lg bg-white">
        <p className="text-gray-500">Analyzing data quality...</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white max-h-96 overflow-y-auto">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-gray-900">Data Quality Assessment</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <ScoreBadge score={data.overall_score} />
        <span className="text-sm text-gray-500">Composite quality score</span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4 text-sm">
        <div className="bg-gray-50 p-2 rounded">
          <div className="text-gray-500">Duplicates</div>
          <div className="font-semibold">{data.duplicates.exact_duplicate_count} ({data.duplicates.duplicate_percentage}%)</div>
        </div>
        <div className="bg-gray-50 p-2 rounded">
          <div className="text-gray-500">Outliers</div>
          <div className="font-semibold">{data.outliers.total_outlier_count} ({data.outliers.total_outlier_percentage}%)</div>
        </div>
        <div className="bg-gray-50 p-2 rounded">
          <div className="text-gray-500">Missing</div>
          <div className="font-semibold">{data.missing.total_missing} ({data.missing.missing_percentage}%)</div>
        </div>
      </div>

      {data.pattern_issues.issues.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-gray-700 mb-1">Pattern Issues</h4>
          {data.pattern_issues.issues.map((issue, i) => (
            <div key={i} className="text-xs text-gray-600 bg-yellow-50 p-2 rounded mb-1">
              {issue.column}: {issue.issue.replace(/_/g, " ")} ({issue.count} values)
            </div>
          ))}
        </div>
      )}

      {data.suggestions.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-1">Suggested Fixes</h4>
          {data.suggestions.map((sug, i) => (
            <div key={i} className="flex items-center justify-between bg-blue-50 p-2 rounded mb-1">
              <span className="text-sm text-gray-700">{sug.description}</span>
              <button
                onClick={() => handleFix(sug)}
                disabled={fixing === sug.fix_type}
                className="text-xs bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded transition-colors"
              >
                {fixing === sug.fix_type ? "Fixing..." : "Fix"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

QualityPanel.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onTransform: PropTypes.func.isRequired,
};

export default QualityPanel;
