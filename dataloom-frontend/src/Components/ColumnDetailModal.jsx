import { useEffect } from "react";
import PropTypes from "prop-types";
import { LuX } from "react-icons/lu";

/**
 * Format a number for display: integers get locale formatting, floats get 2 decimal places.
 */
const formatNumber = (value) => {
  if (value == null) return "N/A";
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toFixed(2);
};

/**
 * Badge color mapping for data types.
 */
const dtypeBadgeColors = {
  numeric: "bg-blue-100 text-blue-700",
  categorical: "bg-green-100 text-green-700",
  datetime: "bg-purple-100 text-purple-700",
  boolean: "bg-yellow-100 text-yellow-700",
};

/**
 * Full numeric stats table for the detail modal.
 */
const NumericDetailStats = ({ stats }) => {
  const rows = [
    { label: "Mean", value: stats.mean },
    { label: "Median", value: stats.median },
    { label: "Std Dev", value: stats.std },
    { label: "Min", value: stats.min },
    { label: "Max", value: stats.max },
    { label: "Q1 (25%)", value: stats.q1 },
    { label: "Q3 (75%)", value: stats.q3 },
    { label: "Skewness", value: stats.skewness },
  ];

  return (
    <div data-testid="numeric-detail-stats">
      <h3 className="text-sm font-medium text-gray-700 mb-2">Numeric Statistics</h3>
      <div className="bg-gray-50 rounded-lg divide-y divide-gray-200">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between px-4 py-2 text-sm">
            <span className="text-gray-600">{row.label}</span>
            <span className="font-medium text-gray-900">{formatNumber(row.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

NumericDetailStats.propTypes = {
  stats: PropTypes.shape({
    mean: PropTypes.number,
    median: PropTypes.number,
    std: PropTypes.number,
    min: PropTypes.number,
    max: PropTypes.number,
    q1: PropTypes.number,
    q3: PropTypes.number,
    skewness: PropTypes.number,
  }).isRequired,
};

/**
 * Full categorical stats for the detail modal: top 5 values + mode.
 */
const CategoricalDetailStats = ({ stats }) => {
  const topFive = (stats.top_values || []).slice(0, 5);

  return (
    <div data-testid="categorical-detail-stats">
      <h3 className="text-sm font-medium text-gray-700 mb-2">Categorical Statistics</h3>

      {topFive.length > 0 && (
        <div className="bg-gray-50 rounded-lg divide-y divide-gray-200 mb-3">
          {topFive.map((item) => (
            <div key={item.value} className="flex justify-between px-4 py-2 text-sm">
              <span className="text-gray-600 truncate mr-2">{item.value}</span>
              <span className="font-medium text-gray-900 flex-shrink-0">
                {item.count.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      <div data-testid="categorical-detail-mode" className="flex justify-between px-4 py-2 text-sm bg-gray-50 rounded-lg">
        <span className="text-gray-600">Mode</span>
        <span className="font-medium text-gray-900">{stats.mode ?? "N/A"}</span>
      </div>
    </div>
  );
};

CategoricalDetailStats.propTypes = {
  stats: PropTypes.shape({
    top_values: PropTypes.arrayOf(
      PropTypes.shape({
        value: PropTypes.string.isRequired,
        count: PropTypes.number.isRequired,
      })
    ),
    mode: PropTypes.string,
  }).isRequired,
};

/**
 * ColumnDetailModal — modal overlay showing expanded stats for a single column.
 *
 * Closes on outside click (backdrop) or Escape key.
 * Returns null if columnProfile is null/undefined.
 */
const ColumnDetailModal = ({ columnProfile, onClose }) => {
  useEffect(() => {
    if (!columnProfile) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [columnProfile, onClose]);

  if (!columnProfile) return null;

  const badgeColor =
    dtypeBadgeColors[columnProfile.dtype] || "bg-gray-100 text-gray-700";

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      data-testid="column-detail-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${columnProfile.name} column details`}
        className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <h2
              data-testid="column-detail-name"
              className="text-lg font-semibold text-gray-900"
            >
              {columnProfile.name}
            </h2>
            <span
              data-testid="column-detail-dtype"
              className={`text-xs font-medium px-2 py-0.5 rounded ${badgeColor}`}
            >
              {columnProfile.dtype}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors duration-150"
            aria-label="Close"
          >
            <LuX className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Base stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500">Missing</div>
              <div className="text-sm font-semibold text-gray-800">
                {columnProfile.missing_count.toLocaleString()} ({columnProfile.missing_percentage.toFixed(1)}%)
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500">Unique</div>
              <div className="text-sm font-semibold text-gray-800">
                {columnProfile.unique_count.toLocaleString()}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500">Type</div>
              <div className="text-sm font-semibold text-gray-800">
                {columnProfile.dtype}
              </div>
            </div>
          </div>

          {/* Type-specific stats */}
          {columnProfile.dtype === "numeric" && columnProfile.numeric_stats && (
            <NumericDetailStats stats={columnProfile.numeric_stats} />
          )}
          {columnProfile.dtype === "categorical" && columnProfile.categorical_stats && (
            <CategoricalDetailStats stats={columnProfile.categorical_stats} />
          )}
        </div>
      </div>
    </div>
  );
};

ColumnDetailModal.propTypes = {
  columnProfile: PropTypes.shape({
    name: PropTypes.string.isRequired,
    dtype: PropTypes.string.isRequired,
    missing_count: PropTypes.number.isRequired,
    missing_percentage: PropTypes.number.isRequired,
    unique_count: PropTypes.number.isRequired,
    numeric_stats: PropTypes.shape({
      mean: PropTypes.number,
      median: PropTypes.number,
      std: PropTypes.number,
      min: PropTypes.number,
      max: PropTypes.number,
      q1: PropTypes.number,
      q3: PropTypes.number,
      skewness: PropTypes.number,
    }),
    categorical_stats: PropTypes.shape({
      top_values: PropTypes.arrayOf(
        PropTypes.shape({
          value: PropTypes.string.isRequired,
          count: PropTypes.number.isRequired,
        })
      ),
      mode: PropTypes.string,
    }),
  }),
  onClose: PropTypes.func.isRequired,
};

export default ColumnDetailModal;
