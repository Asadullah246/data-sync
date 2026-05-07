/**
 * biotime-auth.js — BioTime JWT Token Manager
 *
 * Manages the lifecycle of the JWT authentication token
 * for the BioTime REST API. Features:
 *   - Lazy token acquisition (only fetches when needed)
 *   - Automatic retry on 401 (expired token)
 *   - Token cached in memory (short-lived, no need to persist)
 */

const config = require('./config');
const createLogger = require('./logger');

const log = createLogger('BioTimeAuth');

/** Cached JWT token */
let cachedToken = null;

/**
 * Authenticates with the BioTime API and returns a JWT token.
 *
 * @returns {Promise<string|null>} JWT token string, or null on failure
 */
async function authenticate() {
  try {
    log.info('Authenticating with BioTime API...');

    const response = await fetch(config.biotime.authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: config.biotime.username,
        password: config.biotime.password,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      log.error(`Authentication failed: ${response.status} ${response.statusText}`);
      log.error(`  Response: ${errorText.substring(0, 300)}`);
      cachedToken = null;
      return null;
    }

    const data = await response.json();
    cachedToken = data.token;
    log.success('BioTime authentication successful.');
    return cachedToken;
  } catch (err) {
    log.error(`Authentication error: ${err.message}`);
    cachedToken = null;
    return null;
  }
}

/**
 * Returns the current token, fetching a new one if needed.
 *
 * @returns {Promise<string|null>} JWT token
 */
async function getToken() {
  if (cachedToken) {
    return cachedToken;
  }
  return authenticate();
}

/**
 * Forces a token refresh (e.g., after receiving a 401).
 *
 * @returns {Promise<string|null>} New JWT token
 */
async function refreshToken() {
  log.info('Refreshing expired token...');
  cachedToken = null;
  return authenticate();
}

/**
 * Makes an authenticated GET request to the BioTime API.
 * Automatically retries once with a fresh token if the first attempt
 * returns 401 Unauthorized.
 *
 * @param {string} url - Full BioTime API URL
 * @returns {Promise<{success: boolean, data: any, status: number}>}
 */
async function authenticatedGet(url) {
  const token = await getToken();
  if (!token) {
    return { success: false, data: null, status: 0 };
  }

  try {
    let response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `JWT ${token}`,
      },
    });

    // Handle expired token — retry once with a fresh token
    if (response.status === 401) {
      const newToken = await refreshToken();
      if (!newToken) {
        return { success: false, data: null, status: 401 };
      }

      response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `JWT ${newToken}`,
        },
      });
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      log.error(`GET ${url} → ${response.status} ${response.statusText}`);
      log.error(`  Response: ${errorText.substring(0, 300)}`);
      return { success: false, data: null, status: response.status };
    }

    const data = await response.json();
    return { success: true, data, status: response.status };
  } catch (err) {
    log.error(`Request failed: ${err.message}`);
    return { success: false, data: null, status: 0 };
  }
}

/**
 * Clears the cached token. Useful for shutdown/testing.
 */
function clearToken() {
  cachedToken = null;
}

module.exports = {
  getToken,
  refreshToken,
  authenticatedGet,
  clearToken,
};
