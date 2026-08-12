/**
 * Lightweight logging utility with tagged output and environment-aware filtering.
 * @module utils/logger
 */

const isDev = import.meta.env.DEV;

/**
 * Create a tagged logger instance for a component or module.
 * In development, all levels are logged. In production, only warn and error.
 *
 * @param tag - The module/component name for log prefixing.
 */
export const createLogger = (tag: string) => ({
  debug: (...args: unknown[]) => isDev && console.debug(`[${tag}]`, ...args),
  info: (...args: unknown[]) => isDev && console.info(`[${tag}]`, ...args),
  warn: (...args: unknown[]) => console.warn(`[${tag}]`, ...args),
  error: (...args: unknown[]) => console.error(`[${tag}]`, ...args),
});
