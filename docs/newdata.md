    {
            "id": "1ba76b18-0ff9-40af-99d8-3e4b334cbd66",
            "emp_id": 2,
            "emp_code": "2",
            "first_name": "j",
            "last_name": null,
            "nick_name": null,
            "gender": null,
            "company_code": "1",
            "company_name": "Company",
            "dept_code": "1",
            "dept_name": "Department 1",
            "position_code": null,
            "position_name": null,
            "att_date": "2026-05-05",
            "weekday": "Tuesday",
            "time_table_alias": "Timetable standard",
            "check_in": "09:00",
            "check_out": "18:00",
            "work_day": "1.0",
            "clock_in": "12:05",
            "clock_out": null,
            "break_out": null,
            "break_in": null,
            "att_date_normal": "2026-05-05",
            "time_table_id": 1,
            "full_attendance": 0,
            "duration": "09:00",
            "duty_duration": "08:00",
            "total_hrs": "",
            "worked_hrs": "03:55",
            "actual_worked": "",
            "break_duration": "01:00",
            "break_total_hrs": "01:00",
            "break_hrs": "01:00",
            "actual_break": "",
            "approval_hrs": "",
            "early_in": "",
            "late_out": "",
            "unschedule": "",
            "remaining": "04:05",
            "total_ot": "",
            "rule_total_ot": "",
            "total_leave": "",
            "paycode_1": "3.9",
            "paycode_2": "",
            "paycode_3": 60,
            "paycode_4": "3.1",
            "paycode_5": "",
            "paycode_6": "",
            "paycode_7": "",
            "paycode_8": "",
            "paycode_9": "",
            "paycode_10": "",
            "paycode_11": "",
            "paycode_12": "",
            "paycode_13": "",
            "paycode_14": "",
            "paycode_15": "",
            "paycode_16": "",
            "paycode_17": "",
            "paycode_18": ""
        }

       
       http://127.0.0.1:1020/att/api/totalTimeCardReportV2/?page=1&page_size=20&start_date=2026-05-01&end_date=2026-05-06&departments=1&areas=-1&groups=-1&employees=-1


















BioTime Data Bridge — Centralized Refactoring Plan
Background
The current application has two independent data flows that are loosely coupled and inconsistently structured:

Attendance Log Poller (poller.js) — Reads raw punch records from BioTime's PostgreSQL database (iclock_transaction) and forwards them to the main server webhook.
Time Card Report Poller (timecardPoller.js) — Fetches pre-calculated daily attendance summaries from BioTime's REST API and saves them locally (webhook sending is commented out).
Current Problems Identified
Problem	Where
Duplicate config loading — timecardPoller.js calls dotenv.config() again, duplicates env reading	
timecardPoller.js
Hardcoded API date range (start_date=2026-05-01&end_date=2026-05-06)	
timecardPoller.js:12
Timecard uses setInterval while attendance uses node-cron — inconsistent scheduling	Both pollers
No shared HTTP client — fetch logic duplicated across files	
poller.js
, 
timecardPoller.js
BioTime auth token managed only in timecardPoller.js, not shared	
timecardPoller.js
No retry/backoff on webhook failures	
poller.js:53-73
Timecard webhook URL not yet defined / separate from attendance webhook	.env
No overlap guard on timecard poller (only attendance poller has isPolling)	
timecardPoller.js
15-second polling for timecard is far too aggressive	.env (TIMECARD_POLL_INTERVAL_SECONDS=15)
Attendance logs have no mechanism to detect duplicates beyond the high-water mark	
poller.js
User Review Required
IMPORTANT

Webhook URLs — The attendance log webhook is https://hms-srv-dev.genify.live/api/v1/hr/attendance-transactions/webhook. You mentioned the timecard report webhook URL is "not built yet" on the main server. I will structure the code to use a separate env variable TIMECARD_WEBHOOK_URL. When your backend is ready, you just set that variable.

IMPORTANT

Authentication to Main Server — Both data types currently use the same x-api-key header. Should the timecard endpoint use the same API key, or will it have a different one?

Open Questions
IMPORTANT

Q1: Timecard date range — Currently the API URL has hardcoded dates. My plan is to dynamically set start_date and end_date to "today" on each poll cycle, so every 30 minutes we re-fetch today's data (which reflects any new punches). For past days, we can run an initial backfill on startup for "yesterday" too, in case an employee's last punch was after the previous day's final poll. Is this acceptable, or do you want to always fetch a wider window (e.g., last 7 days)?

IMPORTANT

Q2: Departments — The current timecard API call uses departments=1. Should this be configurable via .env, or should we fetch all departments (departments=-1)?

IMPORTANT

Q3: Main server response — When the main server receives attendance logs, does it respond with any acknowledgment (like accepted record IDs)? This would let us confirm which records were successfully ingested and only advance the high-water mark for confirmed records.

WARNING

Q4: Data volume — Approximately how many employees do you have? This affects pagination strategy for the timecard API (currently page_size=20). If you have 100+ employees, we need to paginate through all pages.

Proposed Architecture
External
BioTime Data Bridge (Node.js Service)
Persistence
Pollers
Core Services
Data Sources
config.jsCentralized Config
PostgreSQL DB(iclock_transaction)
BioTime REST API(Time Card Report)
biotime-auth.jsJWT Token Manager
http-client.jsShared Fetch + Retry
db.jsPostgreSQL Client
attendance-poller.jsRaw Punch Logs
timecard-poller.jsDaily Report Data
state.jsHigh-water Mark + Sent IDs
storage.jsLocal JSONL Backup
scheduler.jsUnified Cron Scheduler
index.jsBootstrap + Shutdown
Main Server(HMS Backend)
Proposed Changes
Answers to Your Key Questions (Built Into the Design)
1. Polling Interval — Every 30 Minutes for Both
Both pollers will run on the same 30-minute cron cycle, but staggered by 1 minute to avoid concurrent load:

Poller	Cron Expression	Runs At
Attendance Logs (PostgreSQL)	*/30 * * * *	:00, :30
Time Card Reports (API)	1-59/30 * * * *	:01, :31
Both also run once at startup (attendance first, timecard 5 seconds later).

2. Preventing Duplicate Attendance Logs
Two-layer deduplication:

High-Water Mark (already exists) — We query WHERE id > lastId. This prevents re-reading rows from PostgreSQL. Works well because the id column is auto-incrementing.

Server-side idempotency key — Each record has a unique id (the PostgreSQL primary key) which maps to bioTimeId in your Prisma schema (marked @unique). Your main server should use this for upsert/ignore-on-conflict. The bridge doesn't need to track what was "accepted" — it just sends everything above the high-water mark, and the server handles duplicates.

Only advance high-water mark after successful webhook response — Currently the code advances the mark even if the webhook fails. We'll fix this: only update state.json after a 2xx response from the main server.

3. Timecard Report Strategy — Upsert Today's Data Every 30 Minutes
Since timecard data changes when an employee punches (e.g., clock_out updates, worked_hrs recalculates):

Every 30 minutes: Fetch today's full timecard report (all employees, today's date)
Send the complete day snapshot to the main server
Main server should upsert by (emp_code, att_date) composite key — replacing the previous snapshot for that employee+date combination
No dedup needed on the bridge side — it's an intentional full-replace of today's data
On startup: Also fetch yesterday's report (in case the last punch happened after the final poll of the previous day)
Component 1: Centralized Configuration
[MODIFY] 
config.js
Expand to include all configuration in one place. Add BioTime API config, separate webhook URLs, timecard settings.

js
// New config structure:
config = {
  db: { host, port, user, password, database },
  tableName,
  pollIntervalMinutes: 30,
  outputDir: './data',
  stateFile: './data/state.json',
  biotime: {
    baseUrl,
    username,
    password,
    departments: '1',     // configurable
    pageSize: 100,         // fetch all employees
  },
  webhook: {
    attendanceUrl,         // existing URL
    timecardUrl,           // NEW — separate endpoint
    apiKey,
    timeoutMs: 30000,
    maxRetries: 3,
  },
}
[MODIFY] 
.env
 / 
.env.example
diff
- TIMECARD_POLL_INTERVAL_SECONDS=15
+ # Unified poll interval for both data sources
+ POLL_INTERVAL_MINUTES=30
+ # Separate webhook URLs
+ ATTENDANCE_WEBHOOK_URL=https://hms-srv-dev.genify.live/api/v1/hr/attendance-transactions/webhook
+ TIMECARD_WEBHOOK_URL=https://hms-srv-dev.genify.live/api/v1/hr/timecard-reports/webhook
+ 
+ # BioTime API Settings
+ BIOTIME_DEPARTMENTS=1
+ BIOTIME_PAGE_SIZE=100
Component 2: Shared HTTP Client with Retry
[NEW] 
http-client.js
A centralized fetch wrapper with:

Exponential backoff retry (3 attempts, delays: 2s → 4s → 8s)
Timeout support (30s default)
Structured error handling with clear log messages
Used by both pollers for webhook calls
Component 3: BioTime Auth Manager
[NEW] 
biotime-auth.js
Encapsulates JWT token lifecycle:

getToken() — returns cached token or fetches a new one
refreshToken() — force-refresh after 401
makeAuthenticatedRequest(url, options) — wraps fetch with auto-retry on 401
Token stored in memory (not persisted — it's short-lived anyway)
Component 4: Refactored Attendance Poller
[MODIFY] 
poller.js
 → renamed to attendance-poller.js
Changes:

Remove scheduling logic (moved to scheduler.js)
Remove inline fetch — use shared http-client.js
Only advance high-water mark after successful webhook delivery
Export a single pollAttendance() function
Add structured logging with timestamps
js
// Core flow:
async function pollAttendance() {
  const state = loadState();
  const records = await db.fetchNewRecords(state.lastId);
  if (records.length === 0) return;
  
  // Save locally first (backup)
  storage.appendRecords('attendance', records);
  
  // Send to main server
  const success = await httpClient.post(config.webhook.attendanceUrl, records, {
    headers: { 'x-api-key': config.webhook.apiKey }
  });
  
  // Only advance mark on success
  if (success) {
    saveState(records[records.length - 1].id);
  }
}
Component 5: Refactored Timecard Poller
[MODIFY] 
timecardPoller.js
 → renamed to timecard-poller.js
Changes:

Remove duplicate dotenv.config() — use centralized config.js
Remove inline auth — use biotime-auth.js
Dynamic date calculation — always fetch today (and yesterday on startup)
Paginate properly — loop through all pages if count > page_size
Remove scheduling logic (moved to scheduler.js)
Remove setInterval — will be driven by cron
Add overlap guard (isPolling flag)
js
// Core flow:
async function pollTimecard(options = {}) {
  const { startDate, endDate } = options.dates || getTodayRange();
  
  // Fetch all pages from BioTime API
  const allRecords = await fetchAllPages(startDate, endDate);
  
  // Save locally (full replace for the date range)
  storage.saveTimecardSnapshot(startDate, allRecords);
  
  // Send to main server (upsert semantics)
  if (config.webhook.timecardUrl) {
    await httpClient.post(config.webhook.timecardUrl, {
      dateRange: { startDate, endDate },
      records: allRecords,
    }, {
      headers: { 'x-api-key': config.webhook.apiKey }
    });
  }
}
Component 6: Unified Scheduler
[NEW] 
scheduler.js
Single scheduler that orchestrates both pollers:

Uses node-cron for both (consistent approach)
Staggered execution (1 minute apart)
Overlap protection per poller
Clean start/stop lifecycle
Component 7: Improved Storage
[MODIFY] 
storage.js
Add timecard snapshot support:

appendRecords(type, records) — append to data/attendance.jsonl
saveTimecardSnapshot(date, records) — overwrite data/timecard-YYYY-MM-DD.json
Keep state management as-is (it works well)
Component 8: Updated Entry Point
[MODIFY] 
index.js
Import and bootstrap both pollers via the unified scheduler
Run initial polls at startup (attendance first, then timecard with yesterday+today)
Enhanced banner showing both data source configs
Graceful shutdown for all resources
Component 9: Cleanup
[DELETE] 
timecardPoller.md
Hardcoded credentials and inline code — will be replaced by proper implementation.

New File Structure
Hospital/
├── .env
├── .env.example
├── package.json
├── data/
│   ├── state.json              # Attendance high-water mark
│   ├── attendance.jsonl        # Attendance log backup (renamed from records.jsonl)
│   └── timecard-2026-05-06.json  # Daily timecard snapshots
├── src/
│   ├── index.js                # Entry point (bootstrap + shutdown)
│   ├── config.js               # Centralized configuration
│   ├── scheduler.js            # NEW — Unified cron scheduler
│   ├── db.js                   # PostgreSQL client (minimal changes)
│   ├── http-client.js          # NEW — Shared fetch with retry
│   ├── biotime-auth.js         # NEW — JWT token manager
│   ├── attendance-poller.js    # Refactored from poller.js
│   ├── timecard-poller.js      # Refactored from timecardPoller.js
│   └── storage.js              # Enhanced file I/O
└── scripts/
    └── test-mock.js            # Updated paths
Summary of Key Design Decisions
Decision	Rationale
30-min interval for both	Balances data freshness vs. resource usage. Timecard data only meaningfully changes when someone punches — 30 min is reasonable.
High-water mark is sufficient for attendance dedup	The PostgreSQL id is auto-incrementing. Combined with server-side bioTimeId @unique, duplicates are impossible.
Full-replace for timecard (not incremental)	Timecard records mutate throughout the day (clock_out, worked_hrs update). Sending the full day snapshot and upserting on (emp_code, att_date) is simpler and more reliable than diffing.
Staggered polling	Prevents both pollers from competing for network/CPU at the same instant.
Only advance high-water mark on webhook success	If the webhook is down, the next poll will re-fetch and re-send the same records. Combined with server-side dedup, this guarantees zero data loss.
Shared HTTP client	DRY principle — retry logic, timeouts, and error formatting written once.
Separate webhook URLs	Clean separation. Different data, different endpoints, different server-side processing.
Verification Plan
Automated Tests
Unit test http-client.js — mock fetch to test retry logic, timeout, error handling
Unit test biotime-auth.js — mock auth endpoint, test 401 re-auth flow
Integration test — update scripts/test-mock.js to test the full pipeline with mocked endpoints
Run node src/index.js — verify both pollers start, log correctly, and respect the 30-min schedule
Manual Verification
Verify attendance records appear on the main server (existing webhook URL)
Verify timecard data is saved locally with correct date naming
Verify the high-water mark only advances after successful webhook delivery
Test graceful shutdown with Ctrl+C
Test token expiry handling by manually invalidating the BioTime token