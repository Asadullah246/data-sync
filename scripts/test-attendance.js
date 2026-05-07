/**
 * test-attendance.js — Verify attendance date-range query
 *
 * Runs the exact same logic as the attendance poller but only
 * prints the results instead of sending to webhook.
 *
 * Usage:  node scripts/test-attendance.js
 */

const config = require('../src/config');
const db = require('../src/db');

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function main() {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const startDate = formatDate(yesterday);
  const endDate = formatDate(today);

  console.log('═══════════════════════════════════════════');
  console.log('  Attendance Query Test');
  console.log('═══════════════════════════════════════════');
  console.log(`  Now:        ${today.toISOString()}`);
  console.log(`  Yesterday:  ${startDate}`);
  console.log(`  Today:      ${endDate}`);
  console.log(`  Query:      WHERE punch_time >= '${startDate}' AND punch_time < '${endDate}' + 1 day`);
  console.log('═══════════════════════════════════════════\n');

  try {
    await db.testConnection();

    console.log(`\n🔍 Fetching records from ${startDate} to ${endDate}...\n`);
    const records = await db.fetchRecordsByDateRange(startDate, endDate);

    console.log(`📊 Found ${records.length} record(s)\n`);

    if (records.length > 0) {
      // Show summary table
      console.log('ID  | emp_code | punch_time                  | terminal');
      console.log('----|----------|-----------------------------|------------------');
      for (const r of records) {
        const id = String(r.id).padEnd(3);
        const emp = String(r.emp_code).padEnd(8);
        const time = String(r.punch_time).padEnd(27);
        const term = r.terminal_alias || r.terminal_sn || '-';
        console.log(`${id} | ${emp} | ${time} | ${term}`);
      }

      // Show date boundaries
      const dates = records.map((r) => new Date(r.punch_time));
      const earliest = new Date(Math.min(...dates));
      const latest = new Date(Math.max(...dates));
      console.log(`\n📅 Earliest punch: ${earliest.toISOString()}`);
      console.log(`📅 Latest punch:   ${latest.toISOString()}`);
    }

    // Also show what's OUTSIDE the range for comparison
    console.log('\n─── Verification: Records OUTSIDE this range ───');
    const outsideQuery = `
      SELECT COUNT(*) as count, MIN(punch_time) as earliest, MAX(punch_time) as latest
      FROM ${config.tableName}
      WHERE punch_time < $1::date OR punch_time >= ($2::date + INTERVAL '1 day')
    `;
    const { Pool } = require('pg');
    const pool = new Pool(config.db);
    const outside = await pool.query(outsideQuery, [startDate, endDate]);
    const row = outside.rows[0];
    console.log(`  Records outside range: ${row.count}`);
    if (parseInt(row.count) > 0) {
      console.log(`  Earliest outside: ${row.earliest}`);
      console.log(`  Latest outside:   ${row.latest}`);
    }
    await pool.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
  }

  await db.closePool();
}

main();
