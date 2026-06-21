import type { SelectOption } from "../Components/common/Select";

/** Aggregation functions shared by the Group By and Pivot Table forms. */
export const AGG_FUNCTIONS: SelectOption[] = [
  { value: "sum", label: "Sum" },
  { value: "mean", label: "Mean" },
  { value: "count", label: "Count" },
  { value: "min", label: "Min" },
  { value: "max", label: "Max" },
  { value: "median", label: "Median" },
];
