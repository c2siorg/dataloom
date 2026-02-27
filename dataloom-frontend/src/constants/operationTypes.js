/**
 * Constants for transformation operation type strings.
 * @module constants/operationTypes
 */

/** @type {string} Filter rows by column condition */
export const FILTER = "filter";
/** @type {string} Sort rows by column */
export const SORT = "sort";
/** @type {string} Add a new row */
export const ADD_ROW = "addRow";
/** @type {string} Delete a row by index */
export const DELETE_ROW = "delRow";
/** @type {string} Add a new column */
export const ADD_COLUMN = "addCol";
/** @type {string} Delete a column by index */
export const DELETE_COLUMN = "delCol";
/** @type {string} Change a single cell value */
export const CHANGE_CELL_VALUE = "changeCellValue";
/** @type {string} Fill empty cells */
export const FILL_EMPTY = "fillEmpty";
/** @type {string} Drop duplicate rows */
export const DROP_DUPLICATE = "dropDuplicate";
/** @type {string} Advanced pandas query filter */
export const ADV_QUERY_FILTER = "advQueryFilter";
/** @type {string} Create a pivot table */
export const PIVOT_TABLE = "pivotTables";
/** @type {string} Rename a column */
export const RENAME_COLUMN = "renameCol";
/** @type {string} Cast column to different data type */
export const CAST_DATA_TYPE = "castDataType";
/** @type {string} Trim whitespace from columns */
export const TRIM_WHITESPACE = "trimWhitespace";
/** @type {string} Find and replace string values in a column */
export const STRING_REPLACE = "stringReplace";
