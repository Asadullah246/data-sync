/**
 * db.js — PostgreSQL Database Client
 *
 * Manages a connection pool to the BioTime PostgreSQL database.
 * Provides methods to test connectivity and fetch attendance records.
 */

const { Pool } = require('pg');
const config = require('./config');
const createLogger = require('./logger');

const log = createLogger('Database');

/** Connection pool — reused across all queries */
const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  // Pool settings for a lightweight polling service
  max: 3,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Log pool-level errors (e.g., unexpected disconnects)
pool.on('error', (err) => {
  log.error('Unexpected database pool error:', err.message);
});

/**
 * Tests the database connection by running a simple query.
 *
 * @returns {Promise<boolean>} true if connection succeeds
 * @throws {Error} if connection fails
 */
async function testConnection() {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT NOW() AS server_time');
    log.success(`Database connected — Server time: ${result.rows[0].server_time}`);
    return true;
  } finally {
    client.release();
  }
}

/**
 * Fetches all attendance records for a date range (by punch_time).
 * Returns records from startDate 00:00:00 through endDate 23:59:59.
 *
 * This approach sends the full day's data each cycle. The main server
 * handles deduplication via the unique bioTimeId (record `id`).
 *
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @returns {Promise<Array<Object>>} Array of transaction row objects
 */
async function fetchRecordsByDateRange(startDate, endDate) {
  const query = `
    SELECT *
    FROM ${config.tableName}
    WHERE punch_time >= $1::date
      AND punch_time < ($2::date + INTERVAL '1 day')
    ORDER BY id ASC
  `;

  const result = await pool.query(query, [startDate, endDate]);
  return result.rows;
}

/**
 * Gracefully shuts down the connection pool.
 * Should be called on process exit.
 */
async function closePool() {
  await pool.end();
  log.info('Database pool closed.');
}

module.exports = {
  testConnection,
  fetchRecordsByDateRange,
  closePool,
};
