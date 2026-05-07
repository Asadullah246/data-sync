/**
 * timecard-poller.js — BioTime Time Card Report Poller
 *
 * Fetches pre-calculated daily attendance summaries from the BioTime
 * REST API and forwards them to the main server. Features:
 *   - Always fetches yesterday + today (handles overnight gaps)
 *   - Fetches ALL categories (departments=-1, areas=-1, groups=-1, employees=-1)
 *   - Auto-pagination (loops until all pages are fetched)
 *   - Authenticated via biotime-auth.js (auto-retry on 401)
 *   - Overlap protection
 *   - Optional local backup (controlled by SAVE_LOCAL)
 */

const config = require('./config');
const biotimeAuth = require('./biotime-auth');
const httpClient = require('./http-client');
const storage = require('./storage');
const createLogger = require('./logger');

const log = createLogger('TimecardPoller');

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
 * Returns yesterday + today as a date range.
 * Always includes yesterday to handle overnight gaps when the
 * poll interval is large (e.g., 4-12 hours).
 *
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

// ─── BioTime API Fetching ───────────────────────────────

/**
 * Builds the timecard API URL for a specific page and date range.
 *
 * Uses -1 for all filter params (departments, areas, groups, employees)
 * which means "fetch all" in BioTime's API convention.
 *
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {number} page - Page number (1-indexed)
 * @returns {string} Full API URL
 */
function buildTimecardUrl(startDate, endDate, page) {
  const pageSize = config.biotime.pageSize;
  return (
    `${config.biotime.baseUrl}/att/api/totalTimeCardReportV2/` +
    `?page=${page}` +
    `&page_size=${pageSize}` +
    `&start_date=${startDate}` +
    `&end_date=${endDate}` +
    `&departments=-1` +
    `&areas=-1` +
    `&groups=-1` +
    `&employees=-1`
  );
}

/**
 * Fetches ALL pages of timecard data for the given date range.
 * Loops through paginated results until `next` is null.
 *
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Array<Object>>} All timecard records combined
 */
async function fetchAllPages(startDate, endDate) {
  const allRecords = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = buildTimecardUrl(startDate, endDate, page);
    log.info(`Fetching page ${page}: ${startDate} → ${endDate}`);

    const result = await biotimeAuth.authenticatedGet(url);

    if (!result.success) {
      log.error(`Failed to fetch page ${page}.`);
      break;
    }

    const data = result.data;

    // BioTime paginates with { count, next, previous, data: [...] }
    if (data && Array.isArray(data.data)) {
      allRecords.push(...data.data);
      log.info(`Page ${page}: ${data.data.length} record(s) (total so far: ${allRecords.length}/${data.count || '?'})`);

      // Check if there are more pages
      hasMore = !!data.next;
      page++;
    } else if (data && Array.isArray(data)) {
      // Some BioTime versions return a flat array
      allRecords.push(...data);
      hasMore = false;
    } else {
      log.warn(`Unexpected response format on page ${page}.`);
      hasMore = false;
    }
  }

  return allRecords;
}

// ─── Poll Function ──────────────────────────────────────

/**
 * Executes one timecard poll cycle:
 *   1. Determine date range (yesterday + today)
 *   2. Fetch all pages from BioTime API
 *   3. Optionally save locally as daily snapshots
 *   4. Send to main server webhook
 *
 * Always includes yesterday to handle overnight gaps.
 * Server should upsert by (emp_code, att_date).
 */
async function pollTimecard() {
  if (isPolling) {
    log.warn('Previous poll still running — skipping this cycle.');
    return;
  }

  isPolling = true;
  const startTime = Date.now();

  try {
    // 1. Date range: yesterday + today
    const { startDate, endDate } = getDateRange();
    log.info(`Polling timecard data: ${startDate} → ${endDate}`);

    // 2. Fetch all pages from BioTime API
    const records = await fetchAllPages(startDate, endDate);

    if (records.length === 0) {
      log.info('No timecard records found for the date range.');
      return;
    }

    log.info(`Fetched ${records.length} total timecard record(s).`);

    // 3. Save locally (if enabled) — grouped by date
    if (config.saveLocal) {
      const recordsByDate = {};
      for (const record of records) {
        const date = record.att_date || record.att_date_normal || startDate;
        if (!recordsByDate[date]) {
          recordsByDate[date] = [];
        }
        recordsByDate[date].push(record);
      }

      for (const [date, dateRecords] of Object.entries(recordsByDate)) {
        storage.saveTimecardSnapshot(date, dateRecords);
      }
    }

    // 4. Send to main server webhook
    if (config.webhook.timecardUrl) {
      log.info(`Forwarding ${records.length} timecard record(s) to webhook...`);

      const payload = {
        dateRange: { startDate, endDate },
        fetchedAt: new Date().toISOString(),
        records,
      };

      const result = await httpClient.post(config.webhook.timecardUrl, payload);

      if (result.success) {
        const elapsed = Date.now() - startTime;
        log.success(`Delivered ${records.length} timecard record(s) in ${elapsed}ms`);
      } else {
        log.error('Webhook delivery failed — data is saved locally.');
      }
    } else {
      log.warn('No TIMECARD_WEBHOOK_URL configured — data saved locally only.');
    }
  } catch (err) {
    log.error(`Poll failed: ${err.message}`);
  } finally {
    isPolling = false;
  }
}

module.exports = { pollTimecard };
