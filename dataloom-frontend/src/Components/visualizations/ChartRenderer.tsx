import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { ChartSpec } from "../../api/visualizations";

// The project's accent (blue-500). Single-series charts use it alone.
const ACCENT = "#3b82f6";
// Restrained palette for multi-series charts, anchored on the accent and kept
// calm to match the app's blue/gray system.
const SERIES = [ACCENT, "#64748b", "#0d9488", "#f59e0b", "#a855f7"];
// Pie slices read as one monochrome blue ramp (dark → light) rather than a
// rainbow; the "Other" bucket is muted gray.
const PIE_FROM = [29, 78, 216]; // blue-700
const PIE_TO = [191, 219, 254]; // blue-200
const OTHER_COLOR = "#cbd5e1"; // slate-300

const HEIGHT = 320;
const TEXT = "#6b7280"; // gray-500, for axis ticks and titles
const AXIS_FONT = 11;
const tooltipStyle = { fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" } as const;
const legendStyle = { fontSize: 12 } as const;

/** Color for pie slice `i` of `n`: a step along the blue ramp ("Other" → gray). */
function pieColor(i: number, n: number, label: unknown): string {
  if (label === "Other") return OTHER_COLOR;
  const t = n <= 1 ? 0 : i / (n - 1);
  const c = PIE_FROM.map((from, k) => Math.round(from + ((PIE_TO[k] ?? from) - from) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/**
 * Merge multi-series line/area data into one row set keyed by x, so each series
 * becomes a column the chart can plot against a shared axis.
 */
function mergeByX(spec: ChartSpec): Array<Record<string, string | number | null>> {
  const rows = new Map<string | number, Record<string, string | number | null>>();
  for (const series of spec.series) {
    for (const point of series.data) {
      const key = point.x ?? "";
      const row = rows.get(key) ?? { x: point.x };
      row[series.name] = point.y;
      rows.set(key, row);
    }
  }
  return Array.from(rows.values());
}

/** Render a backend ChartSpec with the matching Recharts component. */
export default function ChartRenderer({ spec }: { spec: ChartSpec }) {
  const axisProps = { tick: { fontSize: AXIS_FONT, fill: TEXT }, stroke: "#d1d5db" } as const;
  // Recharts renders these as the visible axis titles; widened margins below
  // leave room so they aren't clipped.
  const xLabel = {
    value: spec.x_label,
    position: "insideBottom" as const,
    offset: -8,
    fontSize: AXIS_FONT,
    fill: TEXT,
  };
  const yLabel = {
    value: spec.y_label,
    angle: -90,
    position: "insideLeft" as const,
    style: { textAnchor: "middle" as const },
    fontSize: AXIS_FONT,
    fill: TEXT,
  };
  const margin = { top: 8, right: 24, bottom: 36, left: 20 };

  switch (spec.chart_type) {
    case "histogram":
    case "bar": {
      const data = spec.series[0]?.data ?? [];
      return (
        <ResponsiveContainer width="100%" height={HEIGHT}>
          <BarChart data={data} margin={margin}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="x" label={xLabel} {...axisProps} />
            <YAxis label={yLabel} {...axisProps} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="y" fill={ACCENT} radius={[2, 2, 0, 0]} name={spec.series[0]?.name} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    case "line":
    case "area": {
      const data = mergeByX(spec);
      const ChartComp = spec.chart_type === "line" ? LineChart : AreaChart;
      return (
        <ResponsiveContainer width="100%" height={HEIGHT}>
          <ChartComp data={data} margin={margin}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="x" label={xLabel} {...axisProps} />
            <YAxis label={yLabel} {...axisProps} />
            <Tooltip contentStyle={tooltipStyle} />
            {spec.series.length > 1 && <Legend wrapperStyle={legendStyle} />}
            {spec.series.map((series, i) =>
              spec.chart_type === "line" ? (
                <Line
                  key={series.name}
                  type="monotone"
                  dataKey={series.name}
                  stroke={SERIES[i % SERIES.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ) : (
                <Area
                  key={series.name}
                  type="monotone"
                  dataKey={series.name}
                  stroke={SERIES[i % SERIES.length]}
                  fill={SERIES[i % SERIES.length]}
                  fillOpacity={0.2}
                />
              ),
            )}
          </ChartComp>
        </ResponsiveContainer>
      );
    }

    case "scatter":
      return (
        <ResponsiveContainer width="100%" height={HEIGHT}>
          <ScatterChart margin={margin}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis type="number" dataKey="x" name={spec.x_label} label={xLabel} {...axisProps} />
            <YAxis type="number" dataKey="y" name={spec.y_label} label={yLabel} {...axisProps} />
            <ZAxis range={[36, 36]} />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={tooltipStyle} />
            {spec.series.length > 1 && <Legend wrapperStyle={legendStyle} />}
            {spec.series.map((series, i) => (
              <Scatter
                key={series.name}
                name={series.name}
                data={series.data}
                fill={SERIES[i % SERIES.length]}
                fillOpacity={0.6}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      );

    case "pie": {
      const data = spec.series[0]?.data ?? [];
      return (
        <ResponsiveContainer width="100%" height={HEIGHT}>
          <PieChart>
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={legendStyle} />
            <Pie
              data={data}
              dataKey="y"
              nameKey="x"
              outerRadius={110}
              stroke="#fff"
              strokeWidth={1}
            >
              {data.map((point, i) => (
                <Cell key={i} fill={pieColor(i, data.length, point.x)} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      );
    }

    default:
      return null;
  }
}
