/**
 * logger.js — Structured Logging Utility
 *
 * Provides consistent, timestamped logging across all modules.
 * Each log line includes the module name for easy filtering.
 */

/**
 * Creates a namespaced logger for a specific module.
 *
 * @param {string} moduleName - Name of the calling module (e.g., 'AttendancePoller')
 * @returns {object} Logger with info, warn, error, debug methods
 *
 * @example
 *   const log = require('./logger')('AttendancePoller');
 *   log.info('Fetched 5 records');
 *   // → 2026-05-07T08:30:00.000Z [AttendancePoller] ℹ Fetched 5 records
 */
function createLogger(moduleName) {
  const prefix = () => `${new Date().toISOString()} [${moduleName}]`;

  return {
    info: (...args) => console.log(`${prefix()} ℹ`, ...args),
    warn: (...args) => console.warn(`${prefix()} ⚠`, ...args),
    error: (...args) => console.error(`${prefix()} ✖`, ...args),
    debug: (...args) => {
      if (process.env.DEBUG === 'true') {
        console.log(`${prefix()} 🐛`, ...args);
      }
    },
    success: (...args) => console.log(`${prefix()} ✔`, ...args),
  };
}

module.exports = createLogger;
