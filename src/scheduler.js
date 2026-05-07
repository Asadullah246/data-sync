/**
 * scheduler.js — Unified Cron Scheduler
 *
 * Orchestrates both pollers on a single, consistent schedule.
 * Both run every N minutes (default: 30), staggered by 1 minute
 * to avoid concurrent network/CPU pressure.
 *
 * Schedule (example with 30-min interval):
 *   Attendance Logs:   :00, :30  (on the minute mark)
 *   Timecard Reports:  :01, :31  (1 minute after)
 */

const cron = require('node-cron');
const config = require('./config');
const { pollAttendance } = require('./attendance-poller');
const { pollTimecard } = require('./timecard-poller');
const createLogger = require('./logger');

const log = createLogger('Scheduler');

/** Active cron tasks (for graceful shutdown) */
const tasks = [];

/**
 * Runs initial polls at startup.
 * Both pollers always fetch yesterday + today, so no special
 * backfill logic is needed.
 */
async function runInitialPolls() {
  log.info('Running initial polls at startup...');

  // 1. Attendance
  log.info('─── Initial Attendance Poll ───');
  await pollAttendance();

  // 2. Timecard
  log.info('─── Initial Timecard Poll ───');
  await pollTimecard();
}

/**
 * Starts the cron scheduler for both pollers.
 *
 * @returns {object} Scheduler control with stop() method
 */
function startScheduler() {
  const interval = config.pollIntervalMinutes;

  // Attendance: "*/30 * * * *" → runs at :00, :30
  const attendanceCron = `*/${interval} * * * *`;

  // Timecard: staggered by 1 minute → runs at :01, :31
  const timecardOffset = 1;
  const timecardCron = `${timecardOffset}-59/${interval} * * * *`;

  log.info(`Scheduler started — polling every ${interval} minute(s)`);
  log.info(`  Attendance:  ${attendanceCron}`);
  log.info(`  Timecard:    ${timecardCron}`);

  // Schedule attendance poller
  const attendanceTask = cron.schedule(attendanceCron, async () => {
    log.info('━━━ Scheduled Attendance Poll ━━━');
    await pollAttendance();
  });
  tasks.push(attendanceTask);

  // Schedule timecard poller
  const timecardTask = cron.schedule(timecardCron, async () => {
    log.info('━━━ Scheduled Timecard Poll ━━━');
    await pollTimecard();
  });
  tasks.push(timecardTask);

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
