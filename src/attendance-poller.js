/**
 * attendance-poller.js — Attendance Transaction Poller
 *
 * Fetches raw punch records from BioTime's PostgreSQL database
 * and forwards them to the main server. Features:
 *   - Date-based fetching (always yesterday + today)
 *   - No high-water mark needed — server deduplicates via bioTimeId
 *   - Overlap protection
 *   - Optional local backup (controlled by SAVE_LOCAL)
 *
 * Why yesterday + today?
 *   If the poll interval is large (e.g., 4 hours), the last poll of one day
 *   might miss late-night punches. By always including yesterday, we guarantee
 *   those records are sent on the next cycle. The server deduplicates via
 *   the unique record `id` (mapped to bioTimeId @unique in Prisma).
 */

const config = require('./config');
const db = require('./db');
const storage = require('./storage');
const httpClient = require('./http-client');
const createLogger = require('./logger');

const log = createLogger('AttendancePoller');

/** Flag to prevent overlapping poll cycles */
let isPolling = false;

// ─── Date Utilities ─────────────────────────────────────

/**
 * Returns a date string in YYYY-MM-DD format.
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns yesterday and today as a date range.
 * @returns {{ startDate: string, endDate: string }}
 */
function getDateRange() {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  return {
    startDate: formatDate(yesterday),
    endDate: formatDate(today),
  };
}

// ─── Poll Function ──────────────────────────────────────

/**
 * Executes one attendance poll cycle:
 *   1. Determine date range (yesterday + today)
 *   2. Query PostgreSQL for all records in that range
 *   3. Optionally save locally
 *   4. Send all records to the main server webhook
 *
 * The main server handles deduplication — we intentionally send
 * the full day's data every cycle for simplicity and reliability.
 */
async function pollAttendance() {
  if (isPolling) {
    log.warn('Previous poll still running — skipping this cycle.');
    return;
  }

  isPolling = true;
  const startTime = Date.now();

  try {
    // 1. Get date range (yesterday + today)
    const { startDate, endDate } = getDateRange();
    log.info(`Polling attendance records: ${startDate} → ${endDate}`);

    // 2. Fetch records from PostgreSQL by date range
    const records = await db.fetchRecordsByDateRange(startDate, endDate);

    if (records.length === 0) {
      log.info('No attendance records found for the date range.');
      return;
    }

    log.info(`Found ${records.length} attendance record(s).`);

    // 3. Save locally (if enabled)
    storage.appendAttendanceRecords(records);

    // 4. Send to main server webhook
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
