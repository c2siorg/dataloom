/**
 * Lightweight logging utility with tagged output and environment-aware filtering.
 * @module utils/logger
 */

const isDev = import.meta.env.DEV;

/**
 * Create a tagged logger instance for a component or module.
 * In development, all levels are logged. In production, only warn and error.
 *
 * @param {string} tag - The module/component name for log prefixing.
 * @returns {{ debug: Function, info: Function, warn: Function, error: Function }}
 */
export const createLogger = (tag) => ({
  debug: (...args) => isDev && console.debug(`[${tag}]`, ...args),
  info: (...args) => isDev && console.info(`[${tag}]`, ...args),
  warn: (...args) => console.warn(`[${tag}]`, ...args),
  error: (...args) => console.error(`[${tag}]`, ...args),
});
