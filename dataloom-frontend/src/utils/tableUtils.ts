/**
 * Table utility functions.
 * @module utils/tableUtils
 */

/**
 * Add serial number column to rows for display.
 * @param rows - The data rows.
 * @returns Rows with S.No. prepended.
 */
export function withSerialNumbers(rows: unknown[][]): unknown[][] {
  return rows.map((row, index) => [index + 1, ...row]);
}
