/**
 * index.js — Application Entry Point
 *
 * BioTime Attendance Data Bridge
 * Connects to the ZKTeco BioTime PostgreSQL database,
 * pulls attendance transactions, and saves them to a local JSONL file.
 */

const config = require('./config');
const db = require('./db');
const { poll, startScheduler } = require('./poller');

/**
 * Prints a startup banner with configuration summary.
 * Masks the database password for security.
 */
function printBanner() {
  const maskedPassword = config.db.password
    ? config.db.password[0] + '*'.repeat(config.db.password.length - 1)
    : '(not set)';

  console.log(`
╔══════════════════════════════════════════════════╗
║   BioTime Attendance Data Bridge                 ║
║   ZKTeco → PostgreSQL → JSONL                    ║
╚══════════════════════════════════════════════════╝

📋 Configuration:
   Database:   ${config.db.database}@${config.db.host}:${config.db.port}
   User:       ${config.db.user}
   Password:   ${maskedPassword}
   Table:      ${config.tableName}
   Interval:   Every ${config.pollIntervalMinutes} minute(s)
   Output:     ${config.outputFile}
   State:      ${config.stateFile}
`);
}

/**
 * Graceful shutdown handler.
 * Closes the database pool and exits cleanly.
 */
async function shutdown(signal) {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
  try {
    await db.closePool();
  } catch (err) {
    console.error('   Error during shutdown:', err.message);
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
    console.error(`\n❌ Failed to connect to database: ${err.message}`);
    console.error('   Please verify your .env configuration and ensure PostgreSQL is running.\n');
    process.exit(1);
  }

  // 2. Run an immediate poll on startup
  console.log('\n🚀 Running initial data pull...');
  await poll();

  // 3. Start the recurring scheduler
  startScheduler();

  // 4. Register graceful shutdown handlers
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  console.log('🟢 Service is running. Press Ctrl+C to stop.\n');
}

// Boot the application
main().catch((err) => {
  console.error('💥 Fatal error during startup:', err);
  process.exit(1);
});
