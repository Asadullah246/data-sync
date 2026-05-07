/**
 * storage.js — Local File Storage (Optional)
 *
 * Saves data locally for backup/debugging purposes.
 * Controlled by SAVE_LOCAL env variable:
 *   - true  → writes attendance JSONL and timecard snapshots to disk
 *   - false → all write operations are no-ops (production mode)
 *
 * File types:
 *   - attendance.jsonl          → append-only punch log backup
 *   - timecard-YYYY-MM-DD.json → daily timecard report snapshots
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');
const createLogger = require('./logger');

const log = createLogger('Storage');

// ─── Helpers ────────────────────────────────────────────

/**
 * Ensures the parent directory of a file path exists.
 * @param {string} filePath - Absolute path to a file
 */
function ensureDirectory(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    log.info(`Created directory: ${dir}`);
  }
}

// ─── Attendance Log Storage ─────────────────────────────

/**
 * Returns the path to the attendance JSONL file.
 * @returns {string}
 */
function getAttendanceFilePath() {
  return path.join(config.storage.outputDir, 'attendance.jsonl');
}

/**
 * Appends attendance records to the JSONL backup file.
 * No-op when SAVE_LOCAL is false.
 *
 * @param {Array<Object>} records - Array of attendance transaction objects
 */
function appendAttendanceRecords(records) {
  if (!config.saveLocal) return;
  if (!records || records.length === 0) return;

  const filePath = getAttendanceFilePath();
  ensureDirectory(filePath);

  const lines = records.map((record) => JSON.stringify(record)).join('\n') + '\n';
  fs.appendFileSync(filePath, lines, 'utf-8');

  log.info(`Appended ${records.length} attendance record(s) to ${path.basename(filePath)}`);
}

// ─── Timecard Report Storage ────────────────────────────

/**
 * Returns the path to a timecard snapshot file for a specific date.
 * @param {string} date - Date string in YYYY-MM-DD format
 * @returns {string}
 */
function getTimecardFilePath(date) {
  return path.join(config.storage.outputDir, `timecard-${date}.json`);
}

/**
 * Saves a timecard snapshot for a specific date.
 * Overwrites any existing snapshot (data updates throughout the day).
 * No-op when SAVE_LOCAL is false.
 *
 * @param {string} date - Date string in YYYY-MM-DD format
 * @param {Array<Object>} records - Array of timecard report records
 */
function saveTimecardSnapshot(date, records) {
  if (!config.saveLocal) return;
  if (!records) return;

  const filePath = getTimecardFilePath(date);
  ensureDirectory(filePath);

  const snapshot = {
    date,
    fetchedAt: new Date().toISOString(),
    recordCount: records.length,
    records,
  };

  // Atomic write
  const tempFile = `${filePath}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(snapshot, null, 2), 'utf-8');
  fs.renameSync(tempFile, filePath);

  log.info(`Saved ${records.length} timecard record(s) for ${date} to ${path.basename(filePath)}`);
}

module.exports = {
  appendAttendanceRecords,
  saveTimecardSnapshot,
};
