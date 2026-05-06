const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE_PATH = path.join(DATA_DIR, 'timecard.json');
const API_URL = 'http://127.0.0.1:1020/att/api/totalTimeCardReportV2/?page=1&page_size=20&start_date=2026-05-01&end_date=2026-05-06&departments=1&areas=-1&groups=-1&employees=-1';

async function fetchTimeCardData() {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    
    console.log('\n--- Time Card API Poller ---');
    console.log(JSON.stringify(data, null, 2));

    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Save to file
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), 'utf8');
    console.log(`✅ Time card data saved to ${FILE_PATH}`);
  } catch (error) {
    console.error('❌ Error fetching time card data:', error.message);
  }
}

function startTimeCardPoller() {
  console.log('\n⏰ Starting Time Card Poller (Every 15 seconds)...');
  // Initial call
  fetchTimeCardData();
  
  // Set interval for every 15 seconds (15000 ms)
  setInterval(fetchTimeCardData, 15000);
}

module.exports = { startTimeCardPoller };
