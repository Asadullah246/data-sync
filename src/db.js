/**
 * db.js — PostgreSQL Database Client
 *
 * Manages a connection pool to the BioTime PostgreSQL database.
 * Provides methods to test connectivity and fetch new transaction records.
 */

const { Pool } = require('pg');
const config = require('./config');

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
  console.error('⚠️  Unexpected database pool error:', err.message);
});

/**
 * Tests the database connection by running a simple query.
 * @returns {Promise<boolean>} true if connection succeeds
 * @throws {Error} if connection fails
 */
async function testConnection() {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT NOW() AS server_time');
    console.log(`✅ Database connected — Server time: ${result.rows[0].server_time}`);
    return true;
  } finally {
    client.release();
  }
}

/**
 * Fetches all records from iclock_transaction where id > lastId.
 * Results are ordered by id ascending so the caller can safely
 * use the last row's id as the new high-water mark.
 *
 * @param {number} lastId - The high-water mark (last processed record id)
 * @returns {Promise<Array<Object>>} Array of transaction row objects
 */
async function fetchNewRecords(lastId) {
  const query = `
    SELECT *
    FROM ${config.tableName}
    WHERE id > $1
    ORDER BY id ASC
  `;

  const result = await pool.query(query, [lastId]);
  return result.rows;
}

/**
 * Gracefully shuts down the connection pool.
 * Should be called on process exit.
 */
async function closePool() {
  await pool.end();
  console.log('🔌 Database pool closed.');
}

module.exports = {
  testConnection,
  fetchNewRecords,
  closePool,
};
