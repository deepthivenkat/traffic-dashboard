#!/usr/bin/env node
/**
 * Silent data collector — runs daily via cron/launchd
 * ======================================================
 * Fetches GA4 + Search Console data and saves to history.
 * No console output (runs silently in background).
 *
 * Usage: node src/collector.js
 *
 * Logs to: data/collector.log (append)
 */

const path = require('path');
const fs = require('fs');

const LOG_PATH = path.resolve(__dirname, '..', 'data', 'collector.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  fs.appendFileSync(LOG_PATH, line + '\n');
  console.log(line);
}

async function main() {
  log('Collector starting...');

  try {
    const analytics = require('./modules/analytics');
    const history = require('./modules/history');

    const auth = analytics.getAuth();
    const data = await analytics.fetchAll(1, auth);
    history.saveDailySnapshot(data);

    const total = data.visitors.reduce((s, d) => s + d.users, 0);
    log(`Done: ${total} visitors, ${data.contactForm?.total || 0} form clicks`);
  } catch (err) {
    log(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
