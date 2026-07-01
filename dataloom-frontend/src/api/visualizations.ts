/**
 * API functions for data visualization (chart suggestions + single charts).
 *
 * The backend computes aggregated chart data; every chart shares one
 * {@link ChartSpec} shape so the frontend maps `chart_type` to a renderer.
 * @module api/visualizations
 */
import client from "./client";

export type ChartType = "histogram" | "bar" | "line" | "area" | "scatter" | "pie";

/** Aggregation for a bar chart (matches the backend AggFunc enum). */
export type AggFunc = "sum" | "mean" | "median" | "min" | "max" | "count";

/** A single datum. x is a label, number, or ISO date; y is numeric. */
export interface ChartPoint {
  x: string | number | null;
  y: number | null;
}

/** A named set of points, optionally tinted with a color. */
export interface ChartSeries {
  name: string;
  data: ChartPoint[];
  color?: string | null;
}

/** Honesty flags about how the data was reduced for rendering. */
export interface ChartMeta {
  sampled?: boolean | null;
  truncated?: boolean | null;
  total_rows?: number | null;
  bins?: number | null;
}

/** Self-describing chart payload rendered as-is by the frontend. */
export interface ChartSpec {
  chart_type: ChartType;
  title: string;
  x_label: string;
  y_label: string;
  series: ChartSeries[];
  meta?: ChartMeta | null;
}

/** Parameters for {@link getChart}; required fields depend on `chart_type`. */
export interface ChartParams {
  chart_type: ChartType;
  /** Numeric column for a histogram. */
  column?: string;
  /** Grouping column for a bar/pie chart. */
  category?: string;
  /** Numeric value column for a bar/pie chart. */
  value?: string;
  /** X-axis column for a line/area/scatter chart. */
  x?: string;
  /** Y-axis column(s) for a line/area/scatter chart. */
  y?: string[];
  /** Optional color-grouping column for a scatter chart. */
  color?: string;
  /** Aggregation for a bar chart. */
  agg?: AggFunc;
  /** Bucket count for a histogram. */
  bins?: number;
}

/**
 * Fetch up to three charts recommended from the dataset's column shapes.
 * @param projectId - The project ID.
 * @returns Ready-to-render chart specs.
 */
export const getChartSuggestions = async (projectId: string): Promise<ChartSpec[]> => {
  const response = await client.get<{ suggestions: ChartSpec[] }>(
    `/projects/${projectId}/charts/suggest`,
  );
  return response.data.suggestions;
};

/**
 * Build a single chart from the project's dataset.
 * @param projectId - The project ID.
 * @param params - The chart configuration.
 * @returns The chart spec.
 */
export const getChart = async (projectId: string, params: ChartParams): Promise<ChartSpec> => {
  const response = await client.get<ChartSpec>(`/projects/${projectId}/charts`, {
    params,
    // FastAPI reads a repeated `y` (`y=a&y=b`); send it that way, not `y[]=`.
    paramsSerializer: { indexes: null },
  });
  return response.data;
};
