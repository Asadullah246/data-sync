/**
 * timecard-poller.js — BioTime Time Card Report Poller
 *
 * Fetches pre-calculated daily attendance summaries from the BioTime
 * REST API and forwards them to the main server. Features:
 *   - Fetches a single day's data (date passed by scheduler)
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

// ─── BioTime API Fetching ───────────────────────────────

/**
 * Builds the timecard API URL for a specific page and date.
 *
 * Uses a large page_size to fetch all records in a single request.
 * Still supports pagination in case the dataset exceeds one page.
 *
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {number} page - Page number (1-indexed)
 * @returns {string} Full API URL
 */
function buildTimecardUrl(date, page) {
  const pageSize = config.biotime.pageSize;
  const areaCode = config.biotime.areaCode;
  return (
    `${config.biotime.baseUrl}/att/api/totalTimeCardReportV2/` +
    `?page=${page}` +
    `&page_size=${pageSize}` +
    `&start_date=${date}` +
    `&end_date=${date}` +
    `&areas=${areaCode}` +
    `&departments=-1` +
    `&groups=-1`
  );
}


// http://127.0.0.1:1020/att/api/totalTimeCardReportV2/?page=1&page_size=10000&start_date=2026-05-01&end_date=2026-05-07&departments=-1&areas=2&groups=-1&employees=-1


/**
 * Fetches ALL pages of timecard data for the given date.
 * Loops through paginated results until `next` is null.
 *
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Array<Object>>} All timecard records combined
 */
async function fetchAllPages(date) {
  const allRecords = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = buildTimecardUrl(date, page);
    log.info(`Fetching page ${page} for ${date}...`);

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
 * Executes one timecard poll cycle for a specific date:
 *   1. Fetch all pages from BioTime API for that date
 *   2. Optionally save locally as a daily snapshot
 *   3. Send to main server webhook
 *
 * Server should upsert by (emp_code, att_date).
 *
 * @param {string} date - Date to fetch in YYYY-MM-DD format
 */
async function pollTimecard(date) {
  if (isPolling) {
    log.warn('Previous poll still running — skipping this cycle.');
    return;
  }

  isPolling = true;
  const startTime = Date.now();

  try {
    log.info(`Polling timecard data for: ${date}`);

    // 1. Fetch all pages from BioTime API
    const records = await fetchAllPages(date);

    if (records.length === 0) {
      log.info(`No timecard records found for ${date}.`);
      return;
    }

    log.info(`Fetched ${records.length} total timecard record(s) for ${date}.`);

    // 2. Save locally (if enabled)
    storage.saveTimecardSnapshot(date, records);

    // 3. Send to main server webhook
    if (config.webhook.timecardUrl) {
      log.info(`Forwarding ${records.length} timecard record(s) to webhook...`);

      const payload = {
        date,
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
