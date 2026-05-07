/**
 * attendance-poller.js — Attendance Transaction Poller
 *
 * Fetches raw punch records from BioTime's PostgreSQL database
 * and forwards them to the main server. Features:
 *   - Fetches a single day's data (date passed by scheduler)
 *   - No high-water mark needed — server deduplicates via bioTimeId @unique
 *   - Overlap protection
 *   - Optional local backup (controlled by SAVE_LOCAL)
 */

const config = require('./config');
const db = require('./db');
const storage = require('./storage');
const httpClient = require('./http-client');
const createLogger = require('./logger');

const log = createLogger('AttendancePoller');

/** Flag to prevent overlapping poll cycles */
let isPolling = false;

/**
 * Executes one attendance poll cycle for a specific date:
 *   1. Query PostgreSQL for all records on that date
 *   2. Optionally save locally
 *   3. Send all records to the main server webhook
 *
 * The main server handles deduplication via bioTimeId @unique.
 *
 * @param {string} date - Date to fetch in YYYY-MM-DD format
 */
async function pollAttendance(date) {
  if (isPolling) {
    log.warn('Previous poll still running — skipping this cycle.');
    return;
  }

  isPolling = true;
  const startTime = Date.now();

  try {
    log.info(`Polling attendance records for: ${date}`);

    // 1. Fetch records from PostgreSQL for this date
    const records = await db.fetchRecordsByDateRange(date, date);

    if (records.length === 0) {
      log.info(`No attendance records found for ${date}.`);
      return;
    }

    log.info(`Found ${records.length} attendance record(s) for ${date}.`);

    // 2. Save locally (if enabled)
    storage.appendAttendanceRecords(records);

    // 3. Send to main server webhook
    if (config.webhook.attendanceUrl) {
      log.info(`Forwarding ${records.length} record(s) to webhook...`);

      const result = await httpClient.post(config.webhook.attendanceUrl, records);

      if (result.success) {
        const elapsed = Date.now() - startTime;
        log.success(`Delivered ${records.length} record(s) in ${elapsed}ms`);
      } else {
        log.error('Webhook delivery failed.');
      }
    } else {
      log.warn('No ATTENDANCE_WEBHOOK_URL configured — data saved locally only.');
    }
  } catch (err) {
    log.error(`Poll failed: ${err.message}`);
  } finally {
    isPolling = false;
  }
}

module.exports = { pollAttendance };
