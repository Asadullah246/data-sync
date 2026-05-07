/**
 * scheduler.js — Fixed-Time Daily Scheduler
 *
 * Orchestrates both pollers on a fixed daily schedule:
 *
 *   Startup   → Instant pull for today (testing / verification)
 *   12:00 PM  → Pull today's data (mid-day snapshot)
 *   12:05 AM  → Pull yesterday's data (the day just ended — final catch-up)
 *
 * Each pull fetches exactly 1 day. The 12:05 AM pull captures any
 * late-night punches from the previous day that occurred after 12:00 PM.
 */

const cron = require('node-cron');
const { pollAttendance } = require('./attendance-poller');
const { pollTimecard } = require('./timecard-poller');
const createLogger = require('./logger');

const log = createLogger('Scheduler');

/** Active cron tasks (for graceful shutdown) */
const tasks = [];

// ─── Date Helpers ───────────────────────────────────────

/**
 * Returns today's date in YYYY-MM-DD format.
 * @returns {string}
 */
function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Returns yesterday's date in YYYY-MM-DD format.
 * @returns {string}
 */
function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Poll Runners ───────────────────────────────────────

/**
 * Runs both pollers for a given date.
 *
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {string} label - Human-readable label for logging
 */
async function runBothPollers(date, label) {
  log.info(`━━━ ${label} — fetching data for ${date} ━━━`);

  log.info('── Attendance Poll ──');
  await pollAttendance(date);

  log.info('── Timecard Poll ──');
  await pollTimecard(date);
}

/**
 * Runs initial polls at startup with today's date.
 * Provides instant feedback for testing and verification.
 */
async function runInitialPolls() {
  await runBothPollers(getToday(), 'Initial Pull (startup)');
}

/**
 * Starts the fixed-time cron scheduler.
 *
 * Schedule:
 *   12:00 PM  → today's data
 *   12:05 AM  → yesterday's data (the day that just ended)
 *
 * @returns {object} Scheduler control with stop() method
 */
function startScheduler() {
  log.info('Scheduler started — fixed daily schedule:');
  log.info('  12:00 PM  → today\'s data');
  log.info('  12:05 AM  → yesterday\'s data (catch-up)');

  // 1. Mid-day pull — 12:00 PM → fetch today
  const middayTask = cron.schedule('7 12 * * *', async () => {
    await runBothPollers(getToday(), 'Mid-Day Pull (12:00 PM)');
  });
  tasks.push(middayTask);

  // 2. Catch-up pull — 12:05 AM → fetch yesterday (the day that just ended)
  const catchUpTask = cron.schedule('5 0 * * *', async () => {
    await runBothPollers(getYesterday(), 'Catch-Up Pull (12:05 AM)');
  });
  tasks.push(catchUpTask);

  return {
    stop: () => {
      tasks.forEach((task) => task.stop());
      log.info('Scheduler stopped.');
    },
  };
}

module.exports = {
  runInitialPolls,
  startScheduler,
};
