/**
 * Table utility functions.
 * @module utils/tableUtils
 */

/**
 * Add serial number column to rows for display.
 * @param {Array[]} rows - The data rows.
 * @returns {Array[]} Rows with S.No. prepended.
 */
export function withSerialNumbers(rows) {
  return rows.map((row, index) => [index + 1, ...row]);
}
