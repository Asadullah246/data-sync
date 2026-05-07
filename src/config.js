/**
 * config.js — Centralized Environment Configuration
 *
 * Single source of truth for all application settings.
 * Loads from .env, validates required variables, and exports
 * a frozen config object used by all modules.
 */

const path = require('path');
const dotenv = require('dotenv');

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// ─── Validation ─────────────────────────────────────────

/** Required environment variable names */
const REQUIRED_VARS = [
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'TABLE_NAME',
  'BIOTIME_BASE_URL',
  'BIOTIME_USERNAME',
  'BIOTIME_PASSWORD',
  'WEBHOOK_API_KEY',
];

const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`\n❌ Missing required environment variables:\n   ${missing.join(', ')}\n`);
  console.error('   Please check your .env file. See .env.example for reference.\n');
  process.exit(1);
}

// ─── Config Object ──────────────────────────────────────

/**
 * Frozen configuration object.
 * All values are resolved once at startup.
 */
const config = Object.freeze({
  /** PostgreSQL connection settings */
  db: Object.freeze({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  }),

  /** Target table name in BioTime database */
  tableName: process.env.TABLE_NAME,

  /** Polling interval in minutes (default: 30) */
  pollIntervalMinutes: parseInt(process.env.POLL_INTERVAL_MINUTES, 10) || 30,

  /** BioTime REST API settings */
  biotime: Object.freeze({
    baseUrl: process.env.BIOTIME_BASE_URL,
    authUrl: `${process.env.BIOTIME_BASE_URL}/jwt-api-token-auth/`,
    username: process.env.BIOTIME_USERNAME,
    password: process.env.BIOTIME_PASSWORD,
    pageSize: parseInt(process.env.BIOTIME_PAGE_SIZE, 10) || 200,
  }),

  /** Webhook endpoints on the main server */
  webhook: Object.freeze({
    apiKey: process.env.WEBHOOK_API_KEY,
    attendanceUrl: process.env.ATTENDANCE_WEBHOOK_URL || '',
    timecardUrl: process.env.TIMECARD_WEBHOOK_URL || '',
    timeoutMs: 30000,
    maxRetries: 3,
  }),

  /** Local file storage settings */
  saveLocal: (process.env.SAVE_LOCAL || 'false').toLowerCase() === 'true',
  storage: Object.freeze({
    outputDir: path.resolve(__dirname, '..', process.env.OUTPUT_DIR || './data'),
  }),
});

module.exports = config;
