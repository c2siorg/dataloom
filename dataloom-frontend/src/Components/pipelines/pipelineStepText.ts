/**
 * Human-readable descriptions of pipeline / change-log steps.
 *
 * A step stores `{ action_type, action_details }`, where action_details is the
 * serialized transform payload (`operation_type` plus one op-specific params bag).
 * These helpers turn that into a friendly label and a one-line parameter summary
 * for the draft list and the saved-pipeline library.
 */

import type { PipelineCompatibility } from "../../api/pipelines";
import * as OP from "../../constants/operationTypes";

const LABELS: Record<string, string> = {
  [OP.FILTER]: "Filter",
  [OP.SORT]: "Sort",
  [OP.GROUPBY]: "Group by",
  [OP.ADD_ROW]: "Add row",
  [OP.DELETE_ROW]: "Delete row",
  [OP.ADD_COLUMN]: "Add column",
  [OP.DELETE_COLUMN]: "Delete column",
  [OP.FILL_EMPTY]: "Fill empty",
  [OP.DROP_DUPLICATE]: "Drop duplicates",
  [OP.ADV_QUERY_FILTER]: "Advanced query",
  [OP.PIVOT_TABLES]: "Pivot table",
  [OP.CHANGE_CELL_VALUE]: "Edit cell",
  [OP.RENAME_COLUMN]: "Rename column",
  [OP.CAST_DATA_TYPE]: "Cast type",
  [OP.TRIM_WHITESPACE]: "Trim whitespace",
  [OP.DROP_NA]: "Drop missing",
  [OP.MELT]: "Melt",
  [OP.SAMPLE_ROWS]: "Sample",
  [OP.STRING_REPLACE]: "Replace",
  [OP.ADD_FILE]: "Add file",
  [OP.ADD_FORMULA_COLUMN]: "Formula column",
};

/** Friendly, title-cased name for an operation (falls back to the raw type). */
export function stepLabel(actionType: string): string {
  return LABELS[actionType] ?? actionType;
}

/**
 * The one-line reason a dry run failed, naming the first failing step.
 * Shared by the draft eligibility check and the saved-pipeline card, so both
 * report an incompatible pipeline the same way.
 */
export function stepFailureMessage(result: PipelineCompatibility): string {
  const position = (result.failing_step ?? 0) + 1;
  return `Step ${position} (${stepLabel(result.action_type ?? "")}) would fail: ${result.reason}`;
}

type Details = Record<string, unknown>;

const asRecord = (value: unknown): Details | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Details) : null;

const str = (value: unknown): string => (value == null ? "" : String(value));

/**
 * The step's parameter bag. A transform payload is `operation_type` plus exactly
 * one op-specific object (`sort_params`, `pivot_query`, `drop_duplicate`, …), so
 * reading the first object value keeps the backend's field names out of here.
 */
const params = (details: Details): Details | null => {
  for (const [key, value] of Object.entries(details)) {
    if (key === "operation_type") continue;
    const record = asRecord(value);
    if (record) return record;
  }
  return null;
};

/**
 * A short summary of a step's parameters, e.g. `age > 26` or `price → float`.
 * Returns "" when there's nothing legible to show, so callers can render the
 * label alone.
 */
export function stepSummary(actionType: string, details: Details): string {
  switch (actionType) {
    case OP.FILTER: {
      const p = params(details);
      if (!p) return "";
      return [str(p.column), str(p.condition), str(p.value)].filter(Boolean).join(" ");
    }
    case OP.SORT: {
      const p = params(details);
      const criteria = Array.isArray(p?.criteria) ? (p!.criteria as Details[]) : null;
      if (criteria?.length) {
        return criteria
          .map((c) => `${str(c.column)} ${c.ascending === false ? "↓" : "↑"}`)
          .join(", ");
      }
      if (p?.column) return `${str(p.column)} ${p.ascending === false ? "↓" : "↑"}`;
      return "";
    }
    case OP.CAST_DATA_TYPE: {
      const p = params(details);
      if (!p?.column) return "";
      return `${str(p.column)} → ${str(p.target_type)}`;
    }
    case OP.TRIM_WHITESPACE: {
      const p = params(details);
      return str(p?.column);
    }
    case OP.STRING_REPLACE: {
      const p = params(details);
      if (!p?.column) return "";
      return `${str(p.column)}: "${str(p.find_value)}" → "${str(p.replace_value)}"`;
    }
    case OP.GROUPBY: {
      const p = params(details);
      if (!p) return "";
      const by = Array.isArray(p.columns) ? p.columns.join(", ") : str(p.columns);
      const agg =
        p.agg_function && p.agg_column ? `${str(p.agg_function)}(${str(p.agg_column)})` : "";
      return [by && `by ${by}`, agg].filter(Boolean).join(" · ");
    }
    case OP.PIVOT_TABLES: {
      const p = params(details);
      if (!p) return "";
      return [str(p.value), p.column && `by ${str(p.column)}`].filter(Boolean).join(" ");
    }
    case OP.ADV_QUERY_FILTER: {
      const p = params(details);
      return p?.query ? `"${str(p.query)}"` : "";
    }
    case OP.DROP_DUPLICATE: {
      const p = params(details);
      const cols = str(p?.columns);
      return cols || "all columns";
    }
    case OP.ADD_FORMULA_COLUMN: {
      const p = params(details);
      if (!p) return "";
      return [str(p.column_name), p.expression && `= ${str(p.expression)}`]
        .filter(Boolean)
        .join(" ");
    }
    case OP.FILL_EMPTY: {
      const p = params(details);
      return p?.strategy ? str(p.strategy) : "";
    }
    default:
      return "";
  }
}
