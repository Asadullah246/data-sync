/**
 * poller.js — Scheduler & Orchestration
 *
 * Orchestrates the fetch-deduplicate-save cycle and schedules it
 * to run periodically via node-cron.
 */

const cron = require('node-cron');
const config = require('./config');
const db = require('./db');
const storage = require('./storage');

/** Flag to prevent overlapping poll cycles */
let isPolling = false;

/**
 * Executes one fetch-and-save cycle:
 * 1. Load the high-water mark from state file
 * 2. Query the database for records with id > lastId
 * 3. Append new records to the JSONL file
 * 4. Update the high-water mark
 */
async function poll() {
  // Guard against overlapping executions
  if (isPolling) {
    console.log('⏳ Previous poll still running, skipping this cycle.');
    return;
  }

  isPolling = true;
  const startTime = Date.now();

  try {
    // 1. Load current high-water mark
    const state = storage.loadState();
    console.log(`\n🔄 Polling — High-water mark: id = ${state.lastId}`);

    // 2. Fetch new records from database
    const records = await db.fetchNewRecords(state.lastId);

    if (records.length === 0) {
      console.log('   ✅ No new records found.');
      return;
    }

    // 3. Append new records to JSONL file
    storage.appendRecords(records);

    // 4. Send records to the Webhook
    if (config.webhook.url && config.webhook.apiKey) {
      console.log(`\n🚀 Forwarding ${records.length} records to webhook...`);
      try {
        const webhookResponse = await fetch(config.webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.webhook.apiKey
          },
          body: JSON.stringify(records)
        });

        if (!webhookResponse.ok) {
          const errText = await webhookResponse.text().catch(() => 'No response body');
          console.error(`   ❌ Webhook failed! Status: ${webhookResponse.status} ${webhookResponse.statusText}`);
          console.error(`      Webhook Response: ${errText}`);
        } else {
          const successText = await webhookResponse.text().catch(() => 'No Content');
          console.log(`   ✅ Data successfully sent to webhook!`);
          console.log(`      Webhook Response:`, successText);
        }
      } catch (webhookError) {
        console.error(`   ❌ Webhook network error:`, webhookError.message);
      }
    }

    // 5. Update high-water mark to the max id from this batch
    const newLastId = records[records.length - 1].id;
    storage.saveState(newLastId);

    // Log summary
    const elapsed = Date.now() - startTime;
    const totalRecords = storage.getRecordCount();
    console.log(`   ✅ Fetched ${records.length} new record(s) in ${elapsed}ms`);
    console.log(`   📊 New high-water mark: id = ${newLastId}`);
    console.log(`   📁 Total records in file: ${totalRecords}`);
  } catch (err) {
    console.error(`   ❌ Poll failed: ${err.message}`);
  } finally {
    isPolling = false;
  }
}

/**
 * Starts the cron scheduler.
 * Runs poll() at the configured interval (default: every 30 minutes).
 */
function startScheduler() {
  const intervalMinutes = config.pollIntervalMinutes;

  // Build cron expression: "every N minutes"
  // e.g., 30 → "*/30 * * * *"
  const cronExpression = `*/${intervalMinutes} * * * *`;

  console.log(`\n⏰ Scheduler started — polling every ${intervalMinutes} minute(s)`);
  console.log(`   Cron expression: ${cronExpression}`);
  console.log(`   Next poll will run at the next ${intervalMinutes}-minute mark.\n`);

  const task = cron.schedule(cronExpression, () => {
    const timestamp = new Date().toISOString();
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`⏰ Scheduled poll triggered at ${timestamp}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    poll();
  });

  return task;
}

module.exports = {
  poll,
  startScheduler,
};
