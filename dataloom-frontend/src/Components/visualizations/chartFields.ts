/**
 * Shared helpers describing which columns and controls each chart type accepts.
 * Drives the builder's enable/disable logic so invalid configurations can't be
 * submitted. Dtype labels are the backend's `map_dtype` output
 * (int/float/bool/datetime/str).
 */
export type Dtypes = Record<string, string>;

export const isNumeric = (dtype: string | undefined): boolean =>
  dtype === "int" || dtype === "float";

export const isCategorical = (dtype: string | undefined): boolean =>
  dtype === "str" || dtype === "bool";

export const isDatetime = (dtype: string | undefined): boolean => dtype === "datetime";

/** Columns valid as the numeric/category/x/y field for a given chart type. */
export function columnsFor(
  field: "histogram" | "category" | "value" | "x" | "y" | "color",
  columns: string[],
  dtypes: Dtypes,
): string[] {
  switch (field) {
    case "histogram":
    case "value":
    case "y":
      return columns.filter((c) => isNumeric(dtypes[c]));
    case "x":
      // Line/area read better with an ordered axis, but scatter needs numeric;
      // allow numeric or datetime and let the chart type narrow further.
      return columns.filter((c) => isNumeric(dtypes[c]) || isDatetime(dtypes[c]));
    case "category":
    case "color":
      return columns;
    default:
      return columns;
  }
}

/** Whether a chart type uses the aggregation control. */
export const usesAgg = (chartType: string): boolean => chartType === "bar";

/** Whether a chart type uses the bin-size control. */
export const usesBins = (chartType: string): boolean => chartType === "histogram";
