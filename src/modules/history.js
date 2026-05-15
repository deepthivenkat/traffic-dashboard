/**
 * History Engine — Persistent deduplicated daily snapshots
 * =========================================================
 * Saves dashboard results to data/history.json on every run.
 * Shows "last 3 days vs prior period" comparison.
 *
 * Depends on: analytics.js (fetchAll)
 * Used by: dashboard.js (dashboard, generateHTML)
 */

const path = require('path');
const fs = require('fs');

const HISTORY_PATH = path.resolve(__dirname, '..', '..', 'data', 'history.json');

// ── Ensure data directory exists ──────────────────────────────────

function ensureDir() {
  const dir = path.dirname(HISTORY_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── Load history ──────────────────────────────────────────────────

function loadHistory() {
  ensureDir();
  if (!fs.existsSync(HISTORY_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
  } catch (e) {
    return {};
  }
}

// ── Save history (deduplicated — one entry per day) ───────────────

function saveDailySnapshot(data) {
  const { visitors, sources, contactForm, adSources, searchPerf } = data;
  const history = loadHistory();

  // Get today's date
  const today = new Date().toISOString().slice(0, 10);

  // Aggregate yesterday's search console (it reports previous day data)
  const scClicks = (searchPerf?.queries || []).reduce((s, q) => s + q.clicks, 0);
  const scImpr = (searchPerf?.queries || []).reduce((s, q) => s + q.impressions, 0);
  const totalVisitors = visitors.reduce((s, d) => s + d.users, 0);
  const totalSessions = visitors.reduce((s, d) => s + d.sessions, 0);

  // Source breakdown as a flat object
  const sourcesMap = {};
  (sources || []).forEach(s => { sourcesMap[s.source] = s.users; });

  // Campaign breakdown
  const campaignsMap = {};
  (adSources?.campaigns || []).forEach(c => { campaignsMap[c.campaign] = c.sessions; });

  // Build daily entry (deduped by date key)
  history[today] = {
    visitors: totalVisitors,
    sessions: totalSessions,
    formClicks: contactForm?.total || 0,
    formEvent: contactForm?.eventName || null,
    scClicks,
    scImpressions: scImpr,
    sources: sourcesMap,
    campaigns: campaignsMap,
    updatedAt: new Date().toISOString(),
  };

  // Clean up old entries (keep last 90 days)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  Object.keys(history).forEach(dateKey => {
    if (dateKey < cutoff.toISOString().slice(0, 10)) delete history[dateKey];
  });

  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
  return history;
}

// ── Generate comparison report ───────────────────────────────────

function generateComparison(history, recentDays = 3, compareDays = 7) {
  const entries = Object.keys(history).sort().reverse();

  if (entries.length < 2) return null;

  // Recent period: last N days with data
  const recent = entries.slice(0, recentDays).filter(d => history[d].visitors > 0);
  // Prior period: the N days before that  
  const prior = entries.slice(recentDays, recentDays + compareDays).filter(d => history[d].visitors > 0);

  if (recent.length === 0 || prior.length === 0) return null;

  function avg(entries, key) {
    const vals = entries.map(d => history[d][key]).filter(v => v != null);
    return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  }

  function change(recentAvg, priorAvg) {
    if (priorAvg === 0) return { pct: null, arrow: '→' };
    const diff = ((recentAvg - priorAvg) / priorAvg) * 100;
    const arrow = diff > 5 ? '↑' : diff < -5 ? '↓' : '→';
    return { pct: diff.toFixed(1), arrow };
  }

  const recentVisitors = avg(recent, 'visitors');
  const priorVisitors = avg(prior, 'visitors');
  const recentSessions = avg(recent, 'sessions');
  const priorSessions = avg(prior, 'sessions');
  const recentForm = avg(recent, 'formClicks');
  const priorForm = avg(prior, 'formClicks');
  const recentSC = avg(recent, 'scClicks');
  const priorSC = avg(prior, 'scClicks');

  return {
    periods: {
      recent: { label: `Last ${recentDays} days`, entries: recent.length, dates: recent.join(', ') },
      prior: { label: `Prior ${compareDays} days`, entries: prior.length, dates: prior.join(', ') },
    },
    metrics: [
      { label: 'Visitors', recent: recentVisitors.toFixed(0), prior: priorVisitors.toFixed(0), ...change(recentVisitors, priorVisitors) },
      { label: 'Sessions', recent: recentSessions.toFixed(0), prior: priorSessions.toFixed(0), ...change(recentSessions, priorSessions) },
      { label: 'Form Clicks', recent: recentForm.toFixed(1), prior: priorForm.toFixed(1), ...change(recentForm, priorForm) },
      { label: 'Search Clicks', recent: recentSC.toFixed(0), prior: priorSC.toFixed(0), ...change(recentSC, priorSC) },
    ],
    recentDays,
  };
}

// ── Display comparison in CLI ────────────────────────────────────

function printComparison(comparison) {
  if (!comparison) {
    console.log(`  📊 History: Need more data — run the dashboard daily to build history.\n`);
    return;
  }

  const { metrics, periods } = comparison;
  console.log(`  📊 vs History (${periods.recent.label} vs ${periods.prior.label}):`);
  metrics.forEach(m => {
    const color = m.arrow === '↑' ? '' : m.arrow === '↓' ? '' : '';
    console.log(`    ${m.label.padEnd(14)} ${m.recent.padStart(6)} avg  vs  ${m.prior.padStart(6)} avg  ${m.arrow} ${m.pct != null ? m.pct + '%' : '—'}`);
  });
}

module.exports = {
  saveDailySnapshot,
  loadHistory,
  generateComparison,
  printComparison,
};
