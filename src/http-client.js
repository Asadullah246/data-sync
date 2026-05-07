/**
 * http-client.js — Shared HTTP Client with Retry
 *
 * Centralized fetch wrapper used by all modules that communicate
 * with the main server. Features:
 *   - Automatic x-api-key header injection
 *   - Exponential backoff retry (configurable attempts)
 *   - Request timeout via AbortController
 *   - Structured error logging
 */

const config = require('./config');
const createLogger = require('./logger');

const log = createLogger('HttpClient');

/**
 * Delays execution for the specified duration.
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sends a POST request to the main server.
 *
 * @param {string} url - Target endpoint URL
 * @param {object|Array} body - JSON payload
 * @param {object} [options] - Additional options
 * @param {object} [options.headers] - Extra headers to merge
 * @param {number} [options.maxRetries] - Override default retry count
 * @param {number} [options.timeoutMs] - Override default timeout
 * @returns {Promise<{success: boolean, data: any, status: number}>}
 */
async function post(url, body, options = {}) {
  if (!url) {
    log.warn('No URL provided — skipping request.');
    return { success: false, data: null, status: 0 };
  }

  const maxRetries = options.maxRetries ?? config.webhook.maxRetries;
  const timeoutMs = options.timeoutMs ?? config.webhook.timeoutMs;

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': config.webhook.apiKey,
    ...options.headers,
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseText = await response.text().catch(() => '');

      if (response.ok) {
        let data = null;
        try {
          data = JSON.parse(responseText);
        } catch {
          data = responseText;
        }

        log.success(`POST ${url} → ${response.status} (attempt ${attempt})`);
        return { success: true, data, status: response.status };
      }

      // Non-retryable client errors (4xx except 429)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        log.error(`POST ${url} → ${response.status} ${response.statusText}`);
        log.error(`  Response: ${responseText.substring(0, 500)}`);
        return { success: false, data: responseText, status: response.status };
      }

      // Server error or rate limit — retry with backoff
      log.warn(`POST ${url} → ${response.status} (attempt ${attempt}/${maxRetries})`);
    } catch (err) {
      if (err.name === 'AbortError') {
        log.warn(`POST ${url} → Timeout after ${timeoutMs}ms (attempt ${attempt}/${maxRetries})`);
      } else {
        log.warn(`POST ${url} → Network error: ${err.message} (attempt ${attempt}/${maxRetries})`);
      }
    }

    // Exponential backoff: 2s, 4s, 8s, ...
    if (attempt < maxRetries) {
      const backoffMs = Math.pow(2, attempt) * 1000;
      log.info(`  Retrying in ${backoffMs / 1000}s...`);
      await delay(backoffMs);
    }
  }

  log.error(`POST ${url} → All ${maxRetries} attempts failed.`);
  return { success: false, data: null, status: 0 };
}

module.exports = { post };
