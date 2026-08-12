/**
 * Frontend mirror of the `OperationType` enum defined in:
 *   dataloom-backend/app/schemas.py
 *
 * ⚠️  Any change here MUST be kept in sync with the backend enum.
 *     String values are part of the API contract — do NOT rename them
 *     without a corresponding backend change.
 *
 * Values must match OperationType enum in dataloom-backend/app/schemas.py
 */

/** Filter rows by column condition */
export const FILTER = "filter";
/** Sort rows by column */
export const SORT = "sort";
/** Add a new row */
export const ADD_ROW = "addRow";
/** Delete a row by index */
export const DELETE_ROW = "delRow";
/** Add a new column */
export const ADD_COLUMN = "addCol";
/** Delete a column by index */
export const DELETE_COLUMN = "delCol";
/** Change a single cell value */
export const CHANGE_CELL_VALUE = "changeCellValue";
/** Fill empty cells */
export const FILL_EMPTY = "fillEmpty";
/** Drop duplicate rows */
export const DROP_DUPLICATE = "dropDuplicate";
/** Advanced pandas query filter */
export const ADV_QUERY_FILTER = "advQueryFilter";
/** Create a pivot table */
export const PIVOT_TABLES = "pivotTables";
/** Rename a column */
export const RENAME_COLUMN = "renameCol";
/** Cast column to different data type */
export const CAST_DATA_TYPE = "castDataType";
/** Trim whitespace from columns */
export const TRIM_WHITESPACE = "trimWhitespace";
export const GROUPBY = "groupby";
export const SAMPLE_ROWS = "sample";
/** Find and replace string values in a column */
export const STRING_REPLACE = "stringReplace";
/** Drop rows with missing values */
export const DROP_NA = "dropNa";
/** Melt wide columns into long form */
export const MELT = "melt";
/** Append another file's rows into the project */
export const ADD_FILE = "addFile";
/** Add a computed column from a formula expression */
export const ADD_FORMULA_COLUMN = "addFormulaCol";
