/**
 * ProfilingPanel — displays per-column statistics returned by the upload
 * and GET /projects/:id endpoints.
 *
 * Receives the `profile` array from ProjectContext and renders a compact
 * stat card for each column. Numeric columns show min/max/mean/std and a
 * simple quartile bar. Categorical columns show the top-5 value distribution
 * as small frequency badges.
 *
 * The panel is collapsible so it does not crowd the main data table.
 */

import { useState } from "react";
import PropTypes from "prop-types";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a float for display, falling back to "—" for null / undefined. */
const fmt = (v, decimals = 2) => (v == null ? "—" : Number(v).toFixed(decimals));

/** Tailwind colour class for the dtype badge. */
const dtypeColor = (dtype) => {
  switch (dtype) {
    case "int":
    case "float":
      return "bg-blue-100 text-blue-800";
    case "bool":
      return "bg-purple-100 text-purple-800";
    case "datetime":
      return "bg-yellow-100 text-yellow-800";
    default:
      return "bg-gray-100 text-gray-700";
  }
};

// ── Sub-components ────────────────────────────────────────────────────────────

/** A single key/value stat row inside a card. */
const StatRow = ({ label, value }) => (
  <div className="flex justify-between items-center py-0.5">
    <span className="text-xs text-gray-500">{label}</span>
    <span className="text-xs font-medium text-gray-800 tabular-nums">{value}</span>
  </div>
);
StatRow.propTypes = { label: PropTypes.string.isRequired, value: PropTypes.string.isRequired };

/** Quartile bar — a simple horizontal bar with p25/p50/p75 markers. */
const QuartileBar = ({ min, p25, p50, p75, max }) => {
  if ([min, p25, p50, p75, max].some((v) => v == null)) return null;
  const range = max - min || 1;
  const pct = (v) => `${(((v - min) / range) * 100).toFixed(1)}%`;

  return (
    <div className="mt-2">
      <p className="text-xs text-gray-400 mb-1">Distribution (p25 / median / p75)</p>
      <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
        {/* IQR fill */}
        <div
          className="absolute h-full bg-blue-300 rounded-full"
          style={{ left: pct(p25), width: `${(((p75 - p25) / range) * 100).toFixed(1)}%` }}
        />
        {/* Median marker */}
        <div className="absolute h-full w-0.5 bg-blue-600" style={{ left: pct(p50) }} />
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-xs text-gray-400">{fmt(min)}</span>
        <span className="text-xs text-gray-400">{fmt(max)}</span>
      </div>
    </div>
  );
};
QuartileBar.propTypes = {
  min: PropTypes.number,
  p25: PropTypes.number,
  p50: PropTypes.number,
  p75: PropTypes.number,
  max: PropTypes.number,
};

/** Card for a single numeric column. */
const NumericCard = ({ col }) => (
  <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-center justify-between mb-2">
      <p className="text-sm font-semibold text-gray-900 truncate" title={col.column}>
        {col.column}
      </p>
      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${dtypeColor(col.dtype)}`}>
        {col.dtype}
      </span>
    </div>

    <StatRow label="Rows" value={String(col.count)} />
    <StatRow label="Nulls" value={`${col.null_count} (${col.null_pct}%)`} />
    <StatRow label="Unique" value={String(col.unique_count)} />
    <StatRow label="Mean" value={fmt(col.mean)} />
    <StatRow label="Std" value={fmt(col.std)} />
    <StatRow label="Min / Max" value={`${fmt(col.min)} / ${fmt(col.max)}`} />

    <QuartileBar min={col.min} p25={col.p25} p50={col.p50} p75={col.p75} max={col.max} />
  </div>
);
NumericCard.propTypes = { col: PropTypes.object.isRequired };

/** Card for a single categorical / string column. */
const CategoricalCard = ({ col }) => {
  const topValues = col.top_values || {};
  const entries = Object.entries(topValues);
  const maxCount = entries.length > 0 ? Math.max(...entries.map(([, v]) => v)) : 1;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-gray-900 truncate" title={col.column}>
          {col.column}
        </p>
        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${dtypeColor(col.dtype)}`}>
          {col.dtype}
        </span>
      </div>

      <StatRow label="Rows" value={String(col.count)} />
      <StatRow label="Nulls" value={`${col.null_count} (${col.null_pct}%)`} />
      <StatRow label="Unique" value={String(col.unique_count)} />

      {entries.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-gray-400 mb-1">Top values</p>
          <div className="space-y-1">
            {entries.map(([val, count]) => (
              <div key={val} className="flex items-center gap-1.5">
                <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-indigo-400 rounded-full"
                    style={{ width: `${((count / maxCount) * 100).toFixed(0)}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 truncate max-w-[80px]" title={val}>
                  {val}
                </span>
                <span className="text-xs font-medium text-gray-700 tabular-nums">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
CategoricalCard.propTypes = { col: PropTypes.object.isRequired };

// ── Main component ────────────────────────────────────────────────────────────

/**
 * ProfilingPanel
 *
 * @param {Object[]} profile - Array of ColumnProfile objects from the API.
 */
const ProfilingPanel = ({ profile }) => {
  const [open, setOpen] = useState(true);

  if (!profile || profile.length === 0) return null;

  const numericCols = profile.filter((c) => c.dtype === "int" || c.dtype === "float");
  const categoricalCols = profile.filter((c) => c.dtype !== "int" && c.dtype !== "float");

  return (
    <div className="mx-4 mb-4 border border-gray-200 rounded-lg bg-gray-50">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded-t-lg transition-colors"
        aria-expanded={open}
      >
        <span>
          Dataset Profile
          <span className="ml-2 text-xs font-normal text-gray-500">
            {profile.length} column{profile.length !== 1 ? "s" : ""}
            {" · "}
            {numericCols.length} numeric
            {" · "}
            {categoricalCols.length} categorical
          </span>
        </span>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Card grid */}
      {open && (
        <div className="p-4">
          {profile.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {profile.map((col) =>
                col.dtype === "int" || col.dtype === "float" ? (
                  <NumericCard key={col.column} col={col} />
                ) : (
                  <CategoricalCard key={col.column} col={col} />
                ),
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

ProfilingPanel.propTypes = {
  profile: PropTypes.arrayOf(PropTypes.object),
};

export default ProfilingPanel;
