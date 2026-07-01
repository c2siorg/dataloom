import { useMemo, useState } from "react";
import type { AggFunc, ChartParams, ChartType } from "../../api/visualizations";
import { useChartView } from "../../context/ChartViewContext";
import { useProjectContext } from "../../context/ProjectContext";
import Button from "../common/Button";
import ColumnSelect from "../common/ColumnSelect";
import Select, { type SelectOption } from "../common/Select";
import { columnsFor, usesAgg, type Dtypes } from "./chartFields";

// "heatmap" is a builder-only option: correlation has its own renderer, so it
// doesn't go through the chart endpoint.
type BuilderType = ChartType | "heatmap";

const BASE_TYPES: SelectOption[] = [
  { value: "histogram", label: "Histogram" },
  { value: "bar", label: "Bar" },
  { value: "line", label: "Line" },
  { value: "area", label: "Area" },
  { value: "scatter", label: "Scatter" },
  { value: "pie", label: "Pie" },
];

const AGG_OPTIONS: SelectOption[] = (["sum", "mean", "median", "min", "max", "count"] as AggFunc[]).map(
  (a) => ({ value: a, label: a.charAt(0).toUpperCase() + a.slice(1) }),
);

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}

interface ChartBuilderPanelProps {
  onClose: () => void;
}

/**
 * No-code chart builder, docked in the right side panel like the transform
 * forms. Column dropdowns are filtered to the dtypes each chart type accepts and
 * irrelevant controls are hidden, so an invalid config can't be submitted.
 * On Render it hands the request to ChartViewContext, which renders it in the
 * Charts tab.
 */
export default function ChartBuilderPanel({ onClose }: ChartBuilderPanelProps) {
  const { columns, dtypes } = useProjectContext() as unknown as {
    columns: string[];
    dtypes: Dtypes;
  };
  const { renderChart, showHeatmap } = useChartView();

  const [chartType, setChartType] = useState<BuilderType>("histogram");
  const [column, setColumn] = useState("");
  const [category, setCategory] = useState("");
  const [value, setValue] = useState("");
  const [x, setX] = useState("");
  const [y, setY] = useState("");
  const [color, setColor] = useState("");
  const [agg, setAgg] = useState<AggFunc>("sum");
  const [bins, setBins] = useState(20);

  const numericCols = useMemo(() => columnsFor("value", columns, dtypes), [columns, dtypes]);
  const xCols = useMemo(() => columnsFor("x", columns, dtypes), [columns, dtypes]);

  // Correlation needs two numeric columns; only offer it when that's possible.
  const typeOptions = useMemo<SelectOption[]>(
    () =>
      numericCols.length >= 2
        ? [...BASE_TYPES, { value: "heatmap", label: "Correlation heatmap" }]
        : BASE_TYPES,
    [numericCols.length],
  );

  const params = useMemo<ChartParams | null>(() => {
    switch (chartType) {
      case "histogram":
        return column ? { chart_type: "histogram", column, bins } : null;
      case "bar":
        if (!category) return null;
        if (agg !== "count" && !value) return null;
        return { chart_type: "bar", category, value: agg === "count" ? undefined : value, agg };
      case "pie":
        return category ? { chart_type: "pie", category, value: value || undefined } : null;
      case "line":
      case "area":
        return x && y ? { chart_type: chartType, x, y: [y] } : null;
      case "scatter":
        return x && y ? { chart_type: "scatter", x, y: [y], color: color || undefined } : null;
      default:
        return null;
    }
  }, [chartType, column, category, value, x, y, color, agg, bins]);

  const canRender = chartType === "heatmap" || params !== null;

  const handleRender = () => {
    if (chartType === "heatmap") showHeatmap();
    else if (params) renderChart(params);
  };

  return (
    <div data-testid="chart-builder-panel">
      <Field label="Chart type">
        <Select
          data-testid="chart-type-select"
          value={chartType}
          onChange={(v) => setChartType(v as BuilderType)}
          options={typeOptions}
        />
      </Field>

      {chartType === "histogram" && (
        <>
          <Field label="Column">
            <ColumnSelect
              data-testid="histogram-column"
              value={column}
              onChange={setColumn}
              options={numericCols}
              placeholder="Select a numeric column…"
            />
          </Field>
          <Field label={`Bins: ${bins}`}>
            <input
              type="range"
              min={2}
              max={60}
              value={bins}
              onChange={(e) => setBins(Number(e.target.value))}
              className="w-full accent-blue-600"
            />
          </Field>
        </>
      )}

      {(chartType === "bar" || chartType === "pie") && (
        <Field label="Category">
          <ColumnSelect
            data-testid="category-select"
            value={category}
            onChange={setCategory}
            options={columns}
            placeholder="Select a column…"
          />
        </Field>
      )}

      {usesAgg(chartType) && (
        <Field label="Aggregation">
          <Select
            data-testid="agg-select"
            value={agg}
            onChange={(v) => setAgg(v as AggFunc)}
            options={AGG_OPTIONS}
          />
        </Field>
      )}

      {(chartType === "bar" || chartType === "pie") && (
        <Field label={chartType === "pie" ? "Value (optional)" : "Value"}>
          <ColumnSelect
            data-testid="value-select"
            value={value}
            onChange={setValue}
            options={numericCols}
            disabled={chartType === "bar" && agg === "count"}
            includeEmptyOption={chartType === "pie"}
            emptyLabel="Count"
            placeholder="Select a numeric column…"
          />
        </Field>
      )}

      {(chartType === "line" || chartType === "area" || chartType === "scatter") && (
        <>
          <Field label="X axis">
            <ColumnSelect
              data-testid="x-select"
              value={x}
              onChange={setX}
              options={chartType === "scatter" ? numericCols : xCols}
              placeholder="Select a column…"
            />
          </Field>
          <Field label="Y axis">
            <ColumnSelect
              data-testid="y-select"
              value={y}
              onChange={setY}
              options={numericCols}
              placeholder="Select a numeric column…"
            />
          </Field>
        </>
      )}

      {chartType === "scatter" && (
        <Field label="Color (optional)">
          <ColumnSelect
            data-testid="color-select"
            value={color}
            onChange={setColor}
            options={columns}
            includeEmptyOption
            emptyLabel="None"
            placeholder="None"
          />
        </Field>
      )}

      <div className="mt-4 flex justify-between">
        <Button type="button" onClick={handleRender} disabled={!canRender}>
          Render
        </Button>
        <Button type="button" variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
