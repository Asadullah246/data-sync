const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE_PATH = path.join(DATA_DIR, 'timecard.json');

require('dotenv').config();

// BioTime Config
const BASE_URL = process.env.BIOTIME_BASE_URL;
const AUTH_URL = process.env.BIOTIME_AUTH_URL || `${BASE_URL}/jwt-api-token-auth/`;
const API_URL = `${BASE_URL}/att/api/totalTimeCardReportV2/?page=1&page_size=20&start_date=2026-05-01&end_date=2026-05-06&departments=1&areas=-1&groups=-1&employees=-1`;
const USERNAME = process.env.BIOTIME_USERNAME;
const PASSWORD = process.env.BIOTIME_PASSWORD;
const POLL_INTERVAL_SECONDS = parseInt(process.env.TIMECARD_POLL_INTERVAL_SECONDS) || 15;

// Webhook Config
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const WEBHOOK_API_KEY = process.env.WEBHOOK_API_KEY;

let currentToken = null;

async function getAuthToken() {
  try {
    const response = await fetch(AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username: USERNAME, password: PASSWORD })
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Could not read response body');
      console.error(`\n❌ Auth failed! status: ${response.status} ${response.statusText}`);
      console.error(`   Response body: ${errorText}`);
      return null;
    }
    
    const data = await response.json();
    return data.token;
  } catch (error) {
    console.error('\n❌ Error fetching auth token:', error.message);
    return null;
  }
}

async function fetchTimeCardData() {
  try {
    // 1. Get or refresh token if we don't have one
    if (!currentToken) {
      currentToken = await getAuthToken();
      if (!currentToken) return; // Stop if login failed
    }

    // 2. Fetch data from BioTime
    let response = await fetch(API_URL, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `JWT ${currentToken}`
      }
    });

    // 3. Handle expired token (401 Unauthorized)
    if (response.status === 401) {
      console.log('🔄 Token expired, fetching a new one...');
      currentToken = await getAuthToken();
      if (!currentToken) return;

      // Retry the request with the new token
      response = await fetch(API_URL, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `JWT ${currentToken}`
        }
      });
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Could not read response body');
      console.error(`\n❌ HTTP error! status: ${response.status} ${response.statusText}`);
      console.error(`   Response body: ${errorText}`);
      return; // Stop execution for this poll cycle
    }
    
    const data = await response.json();
    
    console.log('\n--- Time Card API Poller ---');
    console.log(`✅ BioTime data retrieved successfully!`);

    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Save to local file
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), 'utf8');
    console.log(`✅ Time card data saved locally to ${FILE_PATH}`);

    // 4. Send the data to the Webhook
    console.log('\n🚀 Forwarding data to webhook...');
    // try {
    //   const webhookResponse = await fetch(WEBHOOK_URL, {
    //     method: 'POST',
    //     headers: {
    //       'Content-Type': 'application/json',
    //       'x-api-key': WEBHOOK_API_KEY
    //     },
    //     body: JSON.stringify(data)
    //   });

    //   if (!webhookResponse.ok) {
    //     const errText = await webhookResponse.text().catch(() => 'No response body');
    //     console.error(`❌ Webhook failed! Status: ${webhookResponse.status} ${webhookResponse.statusText}`);
    //     console.error(`   Webhook Response: ${errText}`);
    //   } else {
    //     // Parse the response as text first, just in case it's empty or not JSON
    //     const successText = await webhookResponse.text().catch(() => 'No Content');
    //     console.log(`✅ Data successfully sent to webhook!`);
    //     console.log(`   Webhook Response:`, successText);
    //   }
    // } catch (webhookError) {
    //   console.error(`❌ Webhook network error:`, webhookError.message);
    // }

  } catch (error) {
    console.error('\n❌ Error fetching time card data (Detailed):');
    console.error('Message:', error.message);
    if (error.cause) console.error('Cause:', error.cause);
    console.error('Full Error Object:', error);
  }
}

function startTimeCardPoller() {
  const intervalMs = POLL_INTERVAL_SECONDS * 1000;
  console.log(`\n⏰ Starting Time Card Poller (Every ${POLL_INTERVAL_SECONDS} seconds)...`);
  // Initial call
  fetchTimeCardData();
  
  // Set interval dynamically
  setInterval(fetchTimeCardData, intervalMs);
}

module.exports = { startTimeCardPoller };
