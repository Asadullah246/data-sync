/**
 * test-mock.js — Local Test Mode (No PostgreSQL Required)
 *
 * Simulates the BioTime iclock_transaction table using a local JSON file
 * as a mock database. Lets you test the entire pipeline on any machine
 * without PostgreSQL or the ZKTeco device.
 *
 * Usage:
 *   node scripts/test-mock.js              → Runs with 10 sample records
 *   node scripts/test-mock.js --add 5      → Adds 5 more records (simulates new punches)
 *   node scripts/test-mock.js --reset      → Clears all test data and starts fresh
 */

const fs = require('fs');
const path = require('path');

// --- Paths ---
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const MOCK_DB_FILE = path.join(DATA_DIR, '_mock_db.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'records.jsonl');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// --- Sample Data Generator ---
const TERMINAL_SNS = ['VGU6251900138', 'VGU6251900245', 'VGU6251900367'];
const TERMINAL_ALIASES = ['Main Office', 'Ward A', 'Emergency', 'Reception'];
const AREA_ALIASES = ['Bonpara', 'Dhaka', 'Rajshahi'];
const COMPANY_CODES = ['CAA', 'CBB'];
const EMP_NAMES = [
  { code: 'EMP001', id: 1 },
  { code: 'EMP002', id: 2 },
  { code: 'EMP003', id: 3 },
  { code: 'EMP004', id: 4 },
  { code: 'EMP005', id: 5 },
  { code: 'EMP006', id: 6 },
  { code: 'EMP007', id: 7 },
  { code: 'EMP008', id: 8 },
];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateCRC() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 30; i++) {
    result += randomItem([...chars, ...'0123456789']);
  }
  return result;
}

/**
 * Generates a single mock iclock_transaction record.
 */
function generateRecord(id, baseTime) {
  const emp = randomItem(EMP_NAMES);
  const terminalIdx = Math.floor(Math.random() * TERMINAL_SNS.length);
  const punchTime = new Date(baseTime.getTime() + id * 60000 * Math.random() * 10);
  const uploadTime = new Date(punchTime.getTime() + Math.random() * 60000);

  return {
    id,
    emp_code: emp.code,
    punch_time: punchTime.toISOString(),
    punch_state: Math.random() > 0.5 ? 0 : 1,
    verify_type: 1,
    work_code: '',
    terminal_sn: TERMINAL_SNS[terminalIdx],
    terminal_alias: TERMINAL_ALIASES[terminalIdx] || 'Main Office',
    area_alias: randomItem(AREA_ALIASES),
    longitude: '',
    latitude: '',
    gps_location: '',
    mobile: '',
    source: '',
    purpose: '',
    crc: generateCRC(),
    is_attendance: 1,
    reserved: '',
    upload_time: uploadTime.toISOString(),
    sync_status: 0,
    sync_time: '',
    is_mask: 0,
    temperature: (36 + Math.random() * 1.5).toFixed(1),
    emp_id: emp.id,
    terminal_id: terminalIdx + 9,
    company_code: randomItem(COMPANY_CODES),
  };
}

// --- Mock Database Operations ---

function loadMockDB() {
  if (fs.existsSync(MOCK_DB_FILE)) {
    return JSON.parse(fs.readFileSync(MOCK_DB_FILE, 'utf-8'));
  }
  return { records: [], nextId: 1 };
}

function saveMockDB(db) {
  fs.writeFileSync(MOCK_DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

function addRecords(count) {
  const db = loadMockDB();
  const baseTime = new Date();
  const newRecords = [];

  for (let i = 0; i < count; i++) {
    const record = generateRecord(db.nextId, baseTime);
    db.records.push(record);
    newRecords.push(record);
    db.nextId++;
  }

  saveMockDB(db);
  return newRecords;
}

function resetAll() {
  // Remove mock db, output file, and state file
  [MOCK_DB_FILE, OUTPUT_FILE, STATE_FILE].forEach((f) => {
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
      console.log(`   🗑️  Deleted: ${path.basename(f)}`);
    }
  });
}

// --- Mock Poll (simulates the real poller logic) ---

function mockPoll(db) {
  // Load state
  let state = { lastId: 0 };
  if (fs.existsSync(STATE_FILE)) {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  }

  console.log(`\n🔄 Mock Poll — High-water mark: id = ${state.lastId}`);

  // Fetch records where id > lastId
  const newRecords = db.records.filter((r) => r.id > state.lastId);

  if (newRecords.length === 0) {
    console.log('   ✅ No new records found.');
    return;
  }

  // Append to JSONL
  const lines = newRecords.map((r) => JSON.stringify(r)).join('\n') + '\n';
  fs.appendFileSync(OUTPUT_FILE, lines, 'utf-8');

  // Update state
  const newLastId = newRecords[newRecords.length - 1].id;
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify({ lastId: newLastId, updatedAt: new Date().toISOString() }, null, 2),
    'utf-8'
  );

  console.log(`   ✅ Exported ${newRecords.length} new record(s)`);
  console.log(`   📊 New high-water mark: id = ${newLastId}`);

  // Count total lines in output
  const totalLines = fs
    .readFileSync(OUTPUT_FILE, 'utf-8')
    .split('\n')
    .filter((l) => l.trim()).length;
  console.log(`   📁 Total records in file: ${totalLines}`);
}

// --- CLI ---

function main() {
  const args = process.argv.slice(2);

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   BioTime Data Bridge — Test Mode (Mock DB)     ║');
  console.log('╚══════════════════════════════════════════════════╝');

  // Handle --reset
  if (args.includes('--reset')) {
    console.log('\n🔄 Resetting all test data...');
    resetAll();
    console.log('   ✅ Done. Run again without --reset to generate fresh data.\n');
    return;
  }

  // Handle --add N
  const addIdx = args.indexOf('--add');
  const countToAdd = addIdx !== -1 ? parseInt(args[addIdx + 1], 10) || 5 : 0;

  // If mock DB doesn't exist, seed with 10 records
  let db = loadMockDB();
  if (db.records.length === 0) {
    console.log('\n📦 No mock data found. Seeding with 10 sample records...');
    const seeded = addRecords(10);
    db = loadMockDB();
    console.log(`   ✅ Created ${seeded.length} records (ids: 1-${seeded.length})`);
  }

  // Add more records if requested
  if (countToAdd > 0) {
    console.log(`\n➕ Adding ${countToAdd} new record(s) to mock database...`);
    const added = addRecords(countToAdd);
    db = loadMockDB();
    console.log(
      `   ✅ Added ids: ${added[0].id}-${added[added.length - 1].id} (total: ${db.records.length})`
    );
  }

  console.log(`\n📋 Mock DB status: ${db.records.length} total records`);

  // Run mock poll
  mockPoll(db);

  // Show sample output
  console.log('\n📄 Sample record from output:');
  if (fs.existsSync(OUTPUT_FILE)) {
    const firstLine = fs.readFileSync(OUTPUT_FILE, 'utf-8').split('\n')[0];
    console.log('   ' + firstLine.substring(0, 120) + '...');
  }

  // Show dedup proof
  console.log('\n💡 To test deduplication, run:');
  console.log('   node scripts/test-mock.js              → Should show "No new records"');
  console.log('   node scripts/test-mock.js --add 3      → Should export only the 3 new ones');
  console.log('   node scripts/test-mock.js --reset       → Clear everything and start over\n');
}

main();
