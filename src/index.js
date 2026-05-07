/**
 * index.js — Application Entry Point
 *
 * BioTime Data Bridge — Centralized attendance data synchronization.
 *
 * This service runs as a daemon and:
 *   1. Polls BioTime's PostgreSQL database for raw attendance punch logs
 *   2. Polls BioTime's REST API for pre-calculated timecard reports
 *   3. Forwards both data types to the main server
 *
 * Both pollers always fetch yesterday + today to handle overnight gaps,
 * regardless of the poll interval setting.
 */

const config = require('./config');
const db = require('./db');
const { runInitialPolls, startScheduler } = require('./scheduler');
const biotimeAuth = require('./biotime-auth');
const createLogger = require('./logger');

const log = createLogger('Main');

/** Scheduler reference for graceful shutdown */
let scheduler = null;

/**
 * Prints a startup banner with configuration summary.
 */
function printBanner() {
  const maskedPassword = config.db.password
    ? config.db.password[0] + '*'.repeat(config.db.password.length - 1)
    : '(not set)';

  console.log(`
╔═══════════════════════════════════════════════════════╗
║   BioTime Data Bridge  v2.1                           ║
║   Attendance Logs + Timecard Reports → Main Server    ║
╚═══════════════════════════════════════════════════════╝

📦 Data Source — PostgreSQL:
   Database:    ${config.db.database}@${config.db.host}:${config.db.port}
   User:        ${config.db.user}
   Password:    ${maskedPassword}
   Table:       ${config.tableName}

🌐 Data Source — BioTime API:
   URL:         ${config.biotime.baseUrl}
   User:        ${config.biotime.username}
   Page Size:   ${config.biotime.pageSize}

🔗 Webhooks:
   Attendance:  ${config.webhook.attendanceUrl || '(not configured)'}
   Timecard:    ${config.webhook.timecardUrl || '(not configured)'}

⏰ Schedule:    Every ${config.pollIntervalMinutes} minute(s)
💾 Local Save:  ${config.saveLocal ? 'ON' : 'OFF'}
`);
}

/**
 * Graceful shutdown handler.
 * Stops the scheduler, closes the DB pool, and exits cleanly.
 */
async function shutdown(signal) {
  log.info(`Received ${signal}. Shutting down gracefully...`);

  try {
    if (scheduler) {
      scheduler.stop();
    }
    biotimeAuth.clearToken();
    await db.closePool();
  } catch (err) {
    log.error(`Error during shutdown: ${err.message}`);
  }

  process.exit(0);
}

/**
 * Main application bootstrap.
 */
async function main() {
  printBanner();

  // 1. Test database connectivity
  try {
    await db.testConnection();
  } catch (err) {
    log.error(`Failed to connect to database: ${err.message}`);
    log.error('Please verify your .env configuration and ensure PostgreSQL is running.');
    process.exit(1);
  }

  // 2. Run initial polls at startup
  await runInitialPolls();

  // 3. Start the recurring scheduler
  scheduler = startScheduler();

  // 4. Register graceful shutdown handlers
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  log.success('Service is running. Press Ctrl+C to stop.');
}

// Boot the application
main().catch((err) => {
  log.error(`Fatal error during startup: ${err.message}`);
  console.error(err);
  process.exit(1);
});
