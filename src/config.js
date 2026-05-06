/**
 * config.js — Environment Configuration Loader
 *
 * Loads and validates all required environment variables.
 * Fails fast with a clear error message if anything is missing.
 */

const path = require('path');
const dotenv = require('dotenv');

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

/** Required environment variable names */
const REQUIRED_VARS = [
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'TABLE_NAME',
];

// Validate that all required vars are present
const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`\n❌ Missing required environment variables:\n   ${missing.join(', ')}\n`);
  console.error('   Please check your .env file. See .env.example for reference.\n');
  process.exit(1);
}

/**
 * Frozen configuration object.
 * All values are resolved once at startup.
 */
const config = Object.freeze({
  db: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },
  tableName: process.env.TABLE_NAME,
  pollIntervalMinutes: parseInt(process.env.POLL_INTERVAL_MINUTES, 10) || 30,
  outputFile: path.resolve(__dirname, '..', process.env.OUTPUT_FILE || './data/records.jsonl'),
  stateFile: path.resolve(__dirname, '..', process.env.STATE_FILE || './data/state.json'),
  webhook: {
    url: process.env.WEBHOOK_URL,
    apiKey: process.env.WEBHOOK_API_KEY,
  }
});

module.exports = config;
