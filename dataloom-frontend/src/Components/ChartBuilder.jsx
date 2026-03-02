import { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import { LuX, LuChartBar, LuChartLine, LuChartPie, LuChartScatter, LuChartColumn } from "react-icons/lu";
import {
  BarChart, Bar, LineChart, Line, ScatterChart, Scatter,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";
import { getChartColumns, getChartData } from "../api";

const CHART_TYPES = [
  { id: "bar", label: "Bar", icon: LuChartBar },
  { id: "line", label: "Line", icon: LuChartLine },
  { id: "scatter", label: "Scatter", icon: LuChartScatter },
  { id: "histogram", label: "Histogram", icon: LuChartColumn },
  { id: "pie", label: "Pie", icon: LuChartPie },
];

const AGG_OPTIONS = ["mean", "sum", "count", "min", "max", "median"];

const COLORS = [
  "#6366f1", "#06b6d4", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#3b82f6",
];

/** Dropdown select */
const Select = ({ label, value, onChange, options, placeholder, disabled }) => (
  <div className="space-y-1">
    <label className="text-[10px] uppercase tracking-widest text-gray-400 font-medium">{label}</label>
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300 disabled:opacity-30 cursor-pointer">
      <option value="">{placeholder || "Select..."}</option>
      {options.map((opt) => (
        <option key={opt.value || opt} value={opt.value || opt}>
          {opt.label || opt}
        </option>
      ))}
    </select>
  </div>
);

Select.propTypes = {
  label: PropTypes.string.isRequired, value: PropTypes.string, onChange: PropTypes.func.isRequired,
  options: PropTypes.array.isRequired, placeholder: PropTypes.string, disabled: PropTypes.bool,
};

/** Truncate long labels */
const truncLabel = (str, max = 14) => {
  if (typeof str !== "string") return str;
  return str.length > max ? str.slice(0, max) + "…" : str;
};

/** Custom X-axis tick that truncates and rotates neatly */
const CleanXTick = ({ x, y, payload }) => (
  <g transform={`translate(${x},${y})`}>
    <text x={0} y={0} dy={12} textAnchor="end" fill="#6b7280" fontSize={10}
      transform="rotate(-40)" style={{ fontFamily: "system-ui" }}>
      {truncLabel(payload.value, 16)}
    </text>
  </g>
);

CleanXTick.propTypes = { x: PropTypes.number, y: PropTypes.number, payload: PropTypes.object };

/** Shared tooltip style */
const tooltipStyle = {
  background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
  fontSize: 12, padding: "8px 12px", boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
};

/** Shared axis label style */
const axisLabelStyle = { fill: "#9ca3af", fontSize: 11, fontWeight: 500 };

/** Render the appropriate chart */
const ChartRenderer = ({ chartType, data, xColumn, yColumn, series }) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Select columns to see a chart preview
      </div>
    );
  }

  const margins = { top: 10, right: 30, left: 25, bottom: 80 };
  const scatterMargins = { top: 10, right: 30, left: 25, bottom: 50 };

  if (chartType === "bar") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={margins} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
          <XAxis dataKey="x" tick={<CleanXTick />} interval={0} height={70}
            label={{ value: xColumn, position: "insideBottom", offset: -5, style: axisLabelStyle }} />
          <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false}
            label={{ value: yColumn || "count", angle: -90, position: "insideLeft", offset: -10, style: axisLabelStyle }} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(99,102,241,0.06)" }} />
          <Legend wrapperStyle={{ paddingTop: 8 }} />
          {series ? (
            series.map((s, i) => <Bar key={s} dataKey={s} fill={COLORS[i % COLORS.length]} radius={[5, 5, 0, 0]} />)
          ) : (
            <Bar dataKey="y" fill={COLORS[0]} radius={[5, 5, 0, 0]} name={yColumn || "count"} />
          )}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "line") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={margins}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
          <XAxis dataKey="x" tick={<CleanXTick />} interval={0} height={70}
            label={{ value: xColumn, position: "insideBottom", offset: -5, style: axisLabelStyle }} />
          <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false}
            label={{ value: yColumn || "count", angle: -90, position: "insideLeft", offset: -10, style: axisLabelStyle }} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ paddingTop: 8 }} />
          {series ? (
            series.map((s, i) => <Line key={s} type="monotone" dataKey={s} stroke={COLORS[i % COLORS.length]} strokeWidth={2.5} dot={{ r: 3, strokeWidth: 2 }} activeDot={{ r: 5 }} />)
          ) : (
            <Line type="monotone" dataKey="y" stroke={COLORS[0]} strokeWidth={2.5} dot={{ r: 3, strokeWidth: 2 }} activeDot={{ r: 5 }} name={yColumn || "count"} />
          )}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "scatter") {
    if (Array.isArray(data)) {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={scatterMargins}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="x" name={xColumn} tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false}
              label={{ value: xColumn, position: "insideBottom", offset: -5, style: axisLabelStyle }} />
            <YAxis dataKey="y" name={yColumn} tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false}
              label={{ value: yColumn, angle: -90, position: "insideLeft", offset: -10, style: axisLabelStyle }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Scatter data={data} fill={COLORS[0]} shape="circle" />
          </ScatterChart>
        </ResponsiveContainer>
      );
    }
    const groups = Object.entries(data);
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={scatterMargins}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="x" name={xColumn} tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false}
            label={{ value: xColumn, position: "insideBottom", offset: -5, style: axisLabelStyle }} />
          <YAxis dataKey="y" name={yColumn} tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false}
            label={{ value: yColumn, angle: -90, position: "insideLeft", offset: -10, style: axisLabelStyle }} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ paddingTop: 8 }} />
          {groups.map(([name, points], i) => (
            <Scatter key={name} name={name} data={points} fill={COLORS[i % COLORS.length]} shape="circle" />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "histogram") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={margins} barCategoryGap="8%">
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
          <XAxis dataKey="bin" tick={<CleanXTick />} interval={0} height={70}
            label={{ value: xColumn, position: "insideBottom", offset: -5, style: axisLabelStyle }} />
          <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false}
            label={{ value: "count", angle: -90, position: "insideLeft", offset: -10, style: axisLabelStyle }} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(16,185,129,0.06)" }} />
          <Bar dataKey="count" fill={COLORS[2]} radius={[5, 5, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "pie") {
    const renderLabel = ({ name, percentage }) => {
      const short = truncLabel(name, 12);
      return `${short} (${percentage}%)`;
    };
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius="60%" innerRadius="30%"
            label={renderLabel} labelLine={{ stroke: "#d1d5db", strokeWidth: 1 }}
            paddingAngle={2} strokeWidth={2} stroke="#fff">
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  return null;
};

ChartRenderer.propTypes = {
  chartType: PropTypes.string.isRequired, data: PropTypes.any,
  xColumn: PropTypes.string, yColumn: PropTypes.string, series: PropTypes.array,
};

/** Main ChartBuilder panel */
const ChartBuilder = ({ projectId, onClose }) => {
  const [columns, setColumns] = useState([]);
  const [chartType, setChartType] = useState("bar");
  const [xColumn, setXColumn] = useState("");
  const [yColumn, setYColumn] = useState("");
  const [groupBy, setGroupBy] = useState("");
  const [aggFunction, setAggFunction] = useState("mean");
  const [chartData, setChartData] = useState(null);
  const [series, setSeries] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCols = async () => {
      try {
        const res = await getChartColumns(projectId);
        setColumns(res.columns || []);
      } catch (err) {
        console.error("Failed to fetch columns:", err);
      }
    };
    fetchCols();
  }, [projectId]);

  const numericCols = columns.filter((c) => c.dtype === "numeric");
  const allColOptions = columns.map((c) => ({ value: c.name, label: `${c.name} (${c.dtype})` }));
  const numericColOptions = numericCols.map((c) => ({ value: c.name, label: c.name }));

  const needsY = chartType === "bar" || chartType === "line" || chartType === "scatter";
  const needsAgg = chartType === "bar" || chartType === "line";

  const fetchChart = useCallback(async () => {
    if (!xColumn) return;
    if (chartType === "scatter" && !yColumn) return;

    setLoading(true);
    setError(null);
    try {
      const params = { chart_type: chartType, x_column: xColumn };
      if (yColumn) params.y_column = yColumn;
      if (groupBy) params.group_by = groupBy;
      if (needsAgg) params.agg_function = aggFunction;

      const res = await getChartData(projectId, params);
      setChartData(res.data);
      setSeries(res.series || null);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load chart");
      setChartData(null);
    } finally {
      setLoading(false);
    }
  }, [projectId, chartType, xColumn, yColumn, groupBy, aggFunction, needsAgg]);

  useEffect(() => {
    const timer = setTimeout(fetchChart, 300);
    return () => clearTimeout(timer);
  }, [fetchChart]);

  return (
    <div data-testid="chart-builder" className="w-full bg-white border-b border-gray-200 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <LuChartBar className="w-5 h-5 text-indigo-500" />
          <div>
            <h2 className="text-base font-bold text-gray-900 tracking-tight">Chart Builder</h2>
            <p className="text-[10px] text-gray-400">Visualize your data</p>
          </div>
        </div>
        <button data-testid="chart-builder-close" onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
          aria-label="Close chart builder">
          <LuX className="w-4 h-4" />
        </button>
      </div>

      <div className="flex gap-0 min-h-[400px]">
        {/* Left sidebar — controls */}
        <div className="w-64 flex-shrink-0 border-r border-gray-100 p-4 space-y-5 bg-gray-50/50">
          {/* Chart type picker */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-gray-400 font-medium">Chart Type</label>
            <div className="flex flex-col gap-1.5">
              {CHART_TYPES.map((ct) => (
                <button key={ct.id} onClick={() => setChartType(ct.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all border text-left ${
                    chartType === ct.id
                      ? "bg-indigo-50 border-indigo-200 text-indigo-600"
                      : "bg-white border-gray-100 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                  }`}
                  title={ct.label}>
                  <ct.icon className="w-4 h-4 flex-shrink-0" />
                  <span className="text-xs font-medium">{ct.label}</span>
                </button>
              ))}
            </div>
          </div>

          <Select label="X Axis" value={xColumn} onChange={setXColumn} options={allColOptions} placeholder="Select column..." />

          {needsY && (
            <Select label="Y Axis" value={yColumn} onChange={setYColumn}
              options={chartType === "scatter" ? allColOptions : numericColOptions}
              placeholder={chartType === "scatter" ? "Select column..." : "Optional (count if empty)"} />
          )}

          {chartType !== "histogram" && chartType !== "pie" && (
            <Select label="Group By" value={groupBy} onChange={setGroupBy} options={allColOptions} placeholder="None" />
          )}

          {needsAgg && yColumn && (
            <Select label="Aggregation" value={aggFunction} onChange={setAggFunction}
              options={AGG_OPTIONS.map((a) => ({ value: a, label: a.charAt(0).toUpperCase() + a.slice(1) }))} />
          )}
        </div>

        {/* Right — chart area */}
        <div className="flex-1 p-4 relative bg-white">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-10">
              <div className="text-gray-400 text-sm">Loading chart...</div>
            </div>
          )}
          {error && (
            <div className="absolute top-4 left-4 right-4 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-red-600 text-sm z-10">
              {error}
            </div>
          )}
          <ChartRenderer chartType={chartType} data={chartData} xColumn={xColumn} yColumn={yColumn} series={series} />
        </div>
      </div>
    </div>
  );
};

ChartBuilder.propTypes = {
  projectId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default ChartBuilder;
