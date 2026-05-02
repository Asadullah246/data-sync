/**
 * storage.js — File I/O & State Management
 *
 * Manages the JSONL output file and the high-water mark state file.
 * - JSONL: one JSON object per line, append-only (no full-file reads needed)
 * - State: small JSON file tracking the last processed record id
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');

/**
 * Ensures the parent directory of a file path exists.
 * Creates it recursively if it doesn't.
 * @param {string} filePath - Absolute path to a file
 */
function ensureDirectory(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created directory: ${dir}`);
  }
}

/**
 * Loads the high-water mark state from disk.
 * Returns a default state if the file doesn't exist or is corrupted.
 *
 * @returns {{ lastId: number, updatedAt: string | null }}
 */
function loadState() {
  try {
    if (fs.existsSync(config.stateFile)) {
      const raw = fs.readFileSync(config.stateFile, 'utf-8');
      const state = JSON.parse(raw);

      // Validate the loaded state
      if (typeof state.lastId === 'number' && state.lastId >= 0) {
        return state;
      }

      console.warn('⚠️  State file has invalid format. Resetting to default.');
    }
  } catch (err) {
    console.warn(`⚠️  Could not read state file: ${err.message}. Resetting to default.`);
  }

  return { lastId: 0, updatedAt: null };
}

/**
 * Persists the high-water mark state to disk.
 * Writes atomically by writing to a temp file first, then renaming.
 *
 * @param {number} lastId - The new high-water mark
 */
function saveState(lastId) {
  ensureDirectory(config.stateFile);

  const state = {
    lastId,
    updatedAt: new Date().toISOString(),
  };

  // Atomic write: write to temp file, then rename
  const tempFile = `${config.stateFile}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf-8');
  fs.renameSync(tempFile, config.stateFile);
}

/**
 * Appends an array of records to the JSONL output file.
 * Each record is serialized as a single JSON line.
 *
 * @param {Array<Object>} records - Array of database row objects
 */
function appendRecords(records) {
  if (!records || records.length === 0) {
    return;
  }

  ensureDirectory(config.outputFile);

  // Build JSONL content: one JSON object per line
  const lines = records.map((record) => JSON.stringify(record)).join('\n') + '\n';

  fs.appendFileSync(config.outputFile, lines, 'utf-8');
}

/**
 * Returns the current record count in the JSONL file.
 * Useful for logging/diagnostics.
 *
 * @returns {number} Number of lines (records) in the output file
 */
function getRecordCount() {
  try {
    if (!fs.existsSync(config.outputFile)) {
      return 0;
    }

    const content = fs.readFileSync(config.outputFile, 'utf-8');
    // Count non-empty lines
    return content.split('\n').filter((line) => line.trim().length > 0).length;
  } catch {
    return 0;
  }
}

module.exports = {
  loadState,
  saveState,
  appendRecords,
  getRecordCount,
};
