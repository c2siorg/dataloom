import { useState, useMemo } from "react";
import { useProjectContext } from "../../context/ProjectContext";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ScatterChart,
    Scatter,
    LineChart,
    Line,
    PieChart,
    Pie,
    Cell,
    Legend,
} from "recharts";
import {
    BarChart3,
    ScatterChart as ScatterIcon,
    LineChart as LineIcon,
    PieChart as PieIcon,
    Settings2,
} from "lucide-react";

const CHART_COLORS = [
    "#6366f1", "#06b6d4", "#10b981", "#f59e0b", "#f43f5e",
    "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#3b82f6",
];

const chartTypes = [
    { key: "bar", label: "Bar Chart", icon: BarChart3 },
    { key: "histogram", label: "Histogram", icon: BarChart3 },
    { key: "scatter", label: "Scatter Plot", icon: ScatterIcon },
    { key: "line", label: "Line Chart", icon: LineIcon },
    { key: "pie", label: "Pie Chart", icon: PieIcon },
];

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-surface-800/95 backdrop-blur-sm border border-surface-700/50 rounded-xl px-4 py-3 shadow-glass">
            <p className="text-xs font-medium text-surface-300 mb-1">{label}</p>
            {payload.map((entry, i) => (
                <p key={i} className="text-sm font-semibold text-surface-200">
                    {entry.name}: {typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value}
                </p>
            ))}
        </div>
    );
};

/**
 * Interactive visualization panel with bar, histogram, scatter, line, and pie charts.
 */
export default function VisualizationPanel() {
    const { columns, rows, dtypes } = useProjectContext();
    const [chartType, setChartType] = useState("bar");
    const [xColumn, setXColumn] = useState("");
    const [yColumn, setYColumn] = useState("");
    const [showConfig, setShowConfig] = useState(true);

    // Detect numeric columns
    const numericColumns = useMemo(
        () =>
            columns.filter((col) => {
                const dtype = dtypes[col]?.toLowerCase() || "";
                return dtype.includes("int") || dtype.includes("float") || dtype.includes("num");
            }),
        [columns, dtypes]
    );

    // Also try inferring from data
    const inferredNumericColumns = useMemo(() => {
        if (rows.length === 0 || columns.length === 0) return [];
        return columns.filter((col, idx) => {
            const sampleValues = rows.slice(0, 20).map((row) => row[idx]);
            return sampleValues.every((v) => v === null || v === "" || !isNaN(Number(v)));
        });
    }, [columns, rows]);

    const allNumericColumns = useMemo(() => {
        const set = new Set([...numericColumns, ...inferredNumericColumns]);
        return Array.from(set);
    }, [numericColumns, inferredNumericColumns]);

    // Build chart data
    const chartData = useMemo(() => {
        if (!columns.length || !rows.length) return [];
        const xIdx = columns.indexOf(xColumn);
        const yIdx = columns.indexOf(yColumn);

        if (chartType === "histogram" && xIdx >= 0) {
            // Build histogram
            const values = rows
                .map((row) => Number(row[xIdx]))
                .filter((v) => !isNaN(v));
            if (values.length === 0) return [];

            const min = Math.min(...values);
            const max = Math.max(...values);
            const binCount = Math.min(20, Math.ceil(Math.sqrt(values.length)));
            const binWidth = (max - min) / binCount || 1;

            const bins = Array.from({ length: binCount }, (_, i) => ({
                range: `${(min + i * binWidth).toFixed(1)}`,
                count: 0,
            }));

            values.forEach((v) => {
                const idx = Math.min(Math.floor((v - min) / binWidth), binCount - 1);
                bins[idx].count++;
            });

            return bins;
        }

        if (chartType === "pie" && xIdx >= 0) {
            // Count occurrences
            const counts = {};
            rows.forEach((row) => {
                const val = String(row[xIdx] ?? "");
                counts[val] = (counts[val] || 0) + 1;
            });
            return Object.entries(counts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([name, value]) => ({ name, value }));
        }

        if (xIdx < 0) return [];

        return rows.slice(0, 200).map((row, i) => ({
            x: row[xIdx] ?? "",
            y: yIdx >= 0 ? Number(row[yIdx]) || 0 : 0,
            name: String(row[xIdx] ?? `Row ${i}`),
        }));
    }, [columns, rows, xColumn, yColumn, chartType]);

    // Auto-select columns
    useState(() => {
        if (columns.length > 0 && !xColumn) {
            setXColumn(columns[0]);
            if (allNumericColumns.length > 0) {
                setYColumn(allNumericColumns[0] !== columns[0] ? allNumericColumns[0] : allNumericColumns[1] || "");
            }
        }
    });

    const renderChart = () => {
        if (chartData.length === 0) {
            return (
                <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                        <BarChart3 className="w-12 h-12 text-surface-600 mx-auto mb-3" />
                        <p className="text-surface-400">
                            Select columns and chart type to visualize
                        </p>
                    </div>
                </div>
            );
        }

        const commonProps = {
            margin: { top: 20, right: 30, bottom: 60, left: 60 },
        };

        switch (chartType) {
            case "bar":
                return (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} {...commonProps}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis
                                dataKey="x"
                                tick={{ fill: "#94a3b8", fontSize: 11 }}
                                angle={-45}
                                textAnchor="end"
                                height={60}
                            />
                            <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="y" name={yColumn} fill="#6366f1" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                );

            case "histogram":
                return (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} {...commonProps}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis
                                dataKey="range"
                                tick={{ fill: "#94a3b8", fontSize: 11 }}
                                angle={-45}
                                textAnchor="end"
                                height={60}
                            />
                            <YAxis
                                tick={{ fill: "#94a3b8", fontSize: 11 }}
                                label={{ value: "Count", angle: -90, position: "insideLeft", fill: "#94a3b8" }}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="count" name="Frequency" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                );

            case "scatter":
                return (
                    <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart {...commonProps}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis
                                dataKey="x"
                                type="number"
                                name={xColumn}
                                tick={{ fill: "#94a3b8", fontSize: 11 }}
                            />
                            <YAxis
                                dataKey="y"
                                type="number"
                                name={yColumn}
                                tick={{ fill: "#94a3b8", fontSize: 11 }}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Scatter name="Data" data={chartData} fill="#8b5cf6" />
                        </ScatterChart>
                    </ResponsiveContainer>
                );

            case "line":
                return (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} {...commonProps}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis
                                dataKey="x"
                                tick={{ fill: "#94a3b8", fontSize: 11 }}
                                angle={-45}
                                textAnchor="end"
                                height={60}
                            />
                            <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                            <Tooltip content={<CustomTooltip />} />
                            <Line
                                type="monotone"
                                dataKey="y"
                                name={yColumn}
                                stroke="#10b981"
                                strokeWidth={2}
                                dot={{ fill: "#10b981", r: 3 }}
                                activeDot={{ r: 5 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                );

            case "pie":
                return (
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={chartData}
                                cx="50%"
                                cy="50%"
                                outerRadius="70%"
                                innerRadius="40%"
                                dataKey="value"
                                nameKey="name"
                                paddingAngle={2}
                            >
                                {chartData.map((_, idx) => (
                                    <Cell
                                        key={idx}
                                        fill={CHART_COLORS[idx % CHART_COLORS.length]}
                                    />
                                ))}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                );

            default:
                return null;
        }
    };

    return (
        <div className="h-full flex flex-col gap-4">
            {/* Config panel */}
            <div className="glass-card p-4">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Settings2 className="w-4 h-4 text-surface-400" />
                        Chart Configuration
                    </h2>
                    <button
                        onClick={() => setShowConfig(!showConfig)}
                        className="btn-ghost text-xs"
                    >
                        {showConfig ? "Hide" : "Show"}
                    </button>
                </div>

                {showConfig && (
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 animate-fade-in">
                        {/* Chart Type */}
                        <div>
                            <label className="block text-xs font-medium text-surface-400 mb-1.5">
                                Chart Type
                            </label>
                            <div className="flex flex-wrap gap-1">
                                {chartTypes.map(({ key, label, icon: Icon }) => (
                                    <button
                                        key={key}
                                        onClick={() => setChartType(key)}
                                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${chartType === key
                                                ? "bg-brand-500/20 text-brand-400 border border-brand-500/30"
                                                : "text-surface-400 hover:text-surface-200 hover:bg-surface-800/60 border border-transparent"
                                            }`}
                                        title={label}
                                    >
                                        <Icon className="w-3.5 h-3.5" />
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* X Column */}
                        <div>
                            <label className="block text-xs font-medium text-surface-400 mb-1.5">
                                {chartType === "histogram" ? "Column" : chartType === "pie" ? "Category" : "X Axis"}
                            </label>
                            <select
                                value={xColumn}
                                onChange={(e) => setXColumn(e.target.value)}
                                className="input-field text-sm"
                            >
                                <option value="">Select column</option>
                                {columns.map((col) => (
                                    <option key={col} value={col}>{col}</option>
                                ))}
                            </select>
                        </div>

                        {/* Y Column (not for histogram/pie) */}
                        {chartType !== "histogram" && chartType !== "pie" && (
                            <div>
                                <label className="block text-xs font-medium text-surface-400 mb-1.5">
                                    Y Axis
                                </label>
                                <select
                                    value={yColumn}
                                    onChange={(e) => setYColumn(e.target.value)}
                                    className="input-field text-sm"
                                >
                                    <option value="">Select column</option>
                                    {columns.map((col) => (
                                        <option key={col} value={col}>{col}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Chart area */}
            <div className="flex-1 glass-card p-4 min-h-[300px]">
                {renderChart()}
            </div>
        </div>
    );
}
