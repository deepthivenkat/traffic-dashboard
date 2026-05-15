/**
 * Query Engine — Natural language insights from history + live data
 * =================================================================
 * Answers performance questions by analyzing trends, anomalies,
 * and changes in traffic sources, campaigns, and conversions.
 *
 * Usage: node src/dashboard.js query "why has performance declined"
 *        node src/dashboard.js query "how are campaigns doing"
 *        node src/dashboard.js query "what changed this week"
 */

const analytics = require('./analytics');
const history = require('./history');

// ── Main query handler ────────────────────────────────────────────

async function answer(question, days = 14) {
  const auth = analytics.getAuth();
  const data = await analytics.fetchAll(days, auth);
  
  // Save for future reference
  history.saveDailySnapshot(data);

  const hist = history.loadHistory();
  const entries = Object.keys(hist).sort();
  const recent = entries.slice(-7).filter(d => hist[d].visitors > 0);
  const prior = entries.slice(-14, -7).filter(d => hist[d].visitors > 0);

  console.log(`\n🔍 ${question}`);
  console.log('═'.repeat(60));

  // Always show current state first
  showCurrentState(data);

  // Analyze based on keywords
  const q = question.toLowerCase();

  if (q.includes('decline') || q.includes('drop') || q.includes('down') || q.includes('worse') || q.includes('decrease')) {
    analyzeDecline(data, hist, recent, prior);
  } else if (q.includes('campaign') || q.includes('ads') || q.includes('paid')) {
    analyzeCampaigns(data, recent, prior);
  } else if (q.includes('source') || q.includes('traffic') || q.includes('where')) {
    analyzeSources(data, recent, prior);
  } else if (q.includes('convert') || q.includes('form') || q.includes('booking') || q.includes('lead')) {
    analyzeConversions(data, recent, prior);
  } else if (q.includes('search') || q.includes('seo') || q.includes('google')) {
    analyzeSearch(data, recent, prior);
  } else if (q.includes('compare') || q.includes('change') || q.includes('week')) {
    analyzeTrends(hist, recent, prior);
  } else if (q.includes('all') || q.includes('overview') || q.includes('summary')) {
    analyzeTrends(hist, recent, prior);
    analyzeCampaigns(data, recent, prior);
    analyzeConversions(data, recent, prior);
  } else {
    // Default: give the most relevant analysis
    const hasDecline = checkForDecline(recent, prior);
    if (hasDecline) {
      analyzeDecline(data, hist, recent, prior);
    } else {
      analyzeTrends(hist, recent, prior);
      analyzeCampaigns(data, recent, prior);
    }
  }

  console.log('═'.repeat(60) + '\n');
}

// ── Current state snapshot ────────────────────────────────────────

function showCurrentState(data) {
  const total = data.visitors.reduce((s, d) => s + d.users, 0);
  const sessions = data.visitors.reduce((s, d) => s + d.sessions, 0);
  const formRate = total > 0 && data.contactForm.total ? ((data.contactForm.total / total) * 100).toFixed(1) : '—';

  console.log(`\n  📈 Current (${data.days}d): ${total} visitors, ${sessions} sessions, ${data.contactForm.total || 0} form clicks (${formRate}%)\n`);
}

// ── Decline analysis ─────────────────────────────────────────────

function analyzeDecline(data, hist, recent, prior) {
  if (recent.length === 0 || prior.length === 0) {
    console.log(`  Not enough history data yet. Run the dashboard daily to build trends.\n`);
    return;
  }

  const avgRecent = avgMetrics(recent, hist);
  const avgPrior = avgMetrics(prior, hist);

  console.log(`  📉 Performance Comparison (last ${recent.length}d vs prior ${prior.length}d):\n`);

  const deltas = [];
  if (avgPrior.visitors > 0) {
    const pct = ((avgRecent.visitors - avgPrior.visitors) / avgPrior.visitors * 100);
    deltas.push({ metric: 'Visitors', recent: avgRecent.visitors.toFixed(0), prior: avgPrior.visitors.toFixed(0), pct: pct.toFixed(1), worse: pct < 0 });
  }
  if (avgPrior.sessions > 0) {
    const pct = ((avgRecent.sessions - avgPrior.sessions) / avgPrior.sessions * 100);
    deltas.push({ metric: 'Sessions', recent: avgRecent.sessions.toFixed(0), prior: avgPrior.sessions.toFixed(0), pct: pct.toFixed(1), worse: pct < 0 });
  }
  if (avgPrior.formClicks > 0) {
    const pct = ((avgRecent.formClicks - avgPrior.formClicks) / avgPrior.formClicks * 100);
    deltas.push({ metric: 'Form Clicks', recent: avgRecent.formClicks.toFixed(1), prior: avgPrior.formClicks.toFixed(1), pct: pct.toFixed(1), worse: pct < 0 });
  }
  if (avgPrior.scClicks > 0) {
    const pct = ((avgRecent.scClicks - avgPrior.scClicks) / avgPrior.scClicks * 100);
    deltas.push({ metric: 'Search Clicks', recent: avgRecent.scClicks.toFixed(0), prior: avgPrior.scClicks.toFixed(0), pct: pct.toFixed(1), worse: pct < 0 });
  }

  // Sort by worst decline first
  deltas.sort((a, b) => parseFloat(a.pct) - parseFloat(b.pct));

  deltas.forEach(d => {
    const icon = d.worse ? '🔴' : '🟢';
    const dir = d.worse ? '↓' : '↑';
    console.log(`  ${icon} ${d.metric.padEnd(14)} ${d.recent.padStart(6)} avg vs ${d.prior.padStart(6)} avg  ${dir} ${Math.abs(parseFloat(d.pct)).toFixed(1)}%`);
  });

  // Root cause analysis
  console.log(`\n  🔍 Root cause check:\n`);

  // Check if sources changed
  const recentSources = aggregateSources(recent, hist);
  const priorSources = aggregateSources(prior, hist);
  if (recentSources.length > 0 && priorSources.length > 0) {
    recentSources.forEach(rs => {
      const ps = priorSources.find(s => s.source === rs.source);
      if (ps && ps.pct > 5) {
        const diff = rs.pct - ps.pct;
        if (Math.abs(diff) > 5) {
          console.log(`  ${diff < 0 ? '🔴' : '🟢'} ${rs.source}: ${ps.pct.toFixed(0)}% → ${rs.pct.toFixed(0)}% of traffic${diff < 0 ? ' (lost share)' : ' (gained share)'}`);
        }
      }
    });
  }

  // Check if campaigns changed
  const recentCamps = aggregateCampaigns(recent, hist);
  const priorCamps = aggregateCampaigns(prior, hist);
  recentCamps.forEach(rc => {
    const pc = priorCamps.find(c => c.campaign === rc.campaign);
    if (pc) {
      const diff = rc.sessions - pc.sessions;
      if (Math.abs(diff) > 2) {
        console.log(`  ${diff < 0 ? '🔴' : '🟢'} Campaign "${rc.campaign}": ${pc.sessions.toFixed(0)} → ${rc.sessions.toFixed(0)} avg sessions${diff < 0 ? ' (↓)' : ' (↑)'}`);
      }
    }
  });

  console.log('');
}

// ── Campaign analysis ────────────────────────────────────────────

function analyzeCampaigns(data, recent, prior) {
  if (!data.adSources || !data.adSources.campaigns.length) {
    console.log(`  📢 No paid campaign data available.\n`);
    return;
  }

  console.log(`  📢 Campaign Performance:\n`);
  data.adSources.campaigns.forEach(c => {
    // Check if this campaign changed vs history
    let trend = '';
    if (recent.length > 0 && prior.length > 0) {
      const recentAvg = recent.reduce((s, d) => s + ((hist[d].campaigns || {})[c.campaign] || 0), 0) / recent.length;
      const priorAvg = prior.reduce((s, d) => s + ((hist[d].campaigns || {})[c.campaign] || 0), 0) / prior.length;
      if (priorAvg > 0) {
        const pct = ((recentAvg - priorAvg) / priorAvg) * 100;
        trend = ` ${pct > 5 ? '↑' : pct < -5 ? '↓' : '→'} ${Math.abs(pct).toFixed(0)}%`;
      }
    }
    console.log(`  ${c.sessions.toString().padStart(4)} sessions  "${c.campaign}"${trend}`);
  });
  console.log('');
}

// ── Source analysis ──────────────────────────────────────────────

function analyzeSources(data, recent, prior) {
  console.log(`  🔗 Traffic Sources:\n`);
  data.sources.forEach(s => {
    let trend = '';
    if (recent.length > 0 && prior.length > 0) {
      const recentPct = recent.reduce((sum, d) => sum + ((hist[d].sources || {})[s.source] || 0), 0);
      const recentTotal = recent.reduce((sum, d) => sum + (hist[d].visitors || 0), 0);
      const priorPct = prior.reduce((sum, d) => sum + ((hist[d].sources || {})[s.source] || 0), 0);
      const priorTotal = prior.reduce((sum, d) => sum + (hist[d].visitors || 0), 0);
      const rPct = recentTotal > 0 ? (recentPct / recentTotal) * 100 : 0;
      const pPct = priorTotal > 0 ? (priorPct / priorTotal) * 100 : 0;
      if (pPct > 0) {
        const diff = rPct - pPct;
        trend = ` ${diff > 2 ? '↑' : diff < -2 ? '↓' : '→'} ${Math.abs(diff).toFixed(1)}pp`;
      }
    }
    console.log(`  ${s.users.toString().padStart(4)} users (${s.pct}%)  ${s.source}${trend}`);
  });
  console.log('');
}

// ── Conversion analysis ─────────────────────────────────────────

function analyzeConversions(data, recent, prior) {
  const total = data.visitors.reduce((s, d) => s + d.users, 0);
  const rate = total > 0 && data.contactForm.total ? ((data.contactForm.total / total) * 100).toFixed(1) : '—';

  console.log(`  📝 Conversion Analysis:\n`);
  console.log(`  Form clicks: ${data.contactForm.total || 0}  Rate: ${rate}%`);

  if (data.contactForm.eventName) {
    console.log(`  Event tracked: "${data.contactForm.eventName}"`);
  }

  if (recent.length > 0 && prior.length > 0) {
    const recentRate = recent.reduce((s, d) => s + (hist[d].formClicks || 0), 0) / recent.reduce((s, d) => s + (hist[d].visitors || 1), 0) * 100;
    const priorRate = prior.reduce((s, d) => s + (hist[d].formClicks || 0), 0) / prior.reduce((s, d) => s + (hist[d].visitors || 1), 0) * 100;
    if (priorRate > 0) {
      const diff = recentRate - priorRate;
      console.log(`  Rate trend: ${priorRate.toFixed(1)}% → ${recentRate.toFixed(1)}% (${diff > 0 ? '↑ improving' : '↓ declining'})`);
    }
  }

  // Daily breakdown
  if (data.contactForm.daily.length > 0) {
    console.log(`  Daily: ${data.contactForm.daily.map(d => `${d.date.slice(-2)}/${d.date.slice(4,6)}:${d.count}`).join(', ')}`);
  }
  console.log('');
}

// ── Search Console analysis ─────────────────────────────────────

function analyzeSearch(data, recent, prior) {
  if (!data.searchPerf || !data.searchPerf.queries.length) {
    console.log(`  🔍 No search console data available.\n`);
    return;
  }

  const totalClicks = data.searchPerf.queries.reduce((s, q) => s + q.clicks, 0);
  const totalImpr = data.searchPerf.queries.reduce((s, q) => s + q.impressions, 0);

  console.log(`  🔍 Search Console: ${totalClicks} clicks, ${totalImpr} impressions\n`);

  if (recent.length > 0 && prior.length > 0) {
    const recentClicks = recent.reduce((s, d) => s + (hist[d].scClicks || 0), 0) / recent.length;
    const priorClicks = prior.reduce((s, d) => s + (hist[d].scClicks || 0), 0) / prior.length;
    if (priorClicks > 0) {
      const pct = ((recentClicks - priorClicks) / priorClicks) * 100;
      console.log(`  Trend: ${priorClicks.toFixed(0)} → ${recentClicks.toFixed(0)} avg clicks/day (${pct > 0 ? '↑' : '↓'} ${Math.abs(pct).toFixed(1)}%)\n`);
    }
  }

  console.log(`  Top queries:`);
  data.searchPerf.queries.slice(0, 5).forEach(q => {
    console.log(`  "${q.query}" — ${q.clicks} clks, ${q.impressions} impr, pos ${q.position}`);
  });
  console.log('');
}

// ── Trend analysis (general) ─────────────────────────────────────

function analyzeTrends(hist, recent, prior) {
  if (recent.length === 0 || prior.length === 0) {
    console.log(`  📊 Need more history data. Run the dashboard daily.\n`);
    return;
  }

  const r = avgMetrics(recent, hist);
  const p = avgMetrics(prior, hist);

  console.log(`  📊 Trend Summary (${recent.length}d vs prior ${prior.length}d):\n`);
  const items = [
    { label: 'Visitors', r: r.visitors, p: p.visitors },
    { label: 'Sessions', r: r.sessions, p: p.sessions },
    { label: 'Form Clicks', r: r.formClicks, p: p.formClicks },
    { label: 'Search Clicks', r: r.scClicks, p: p.scClicks },
  ];

  items.forEach(item => {
    if (item.p === 0) return;
    const pct = ((item.r - item.p) / item.p) * 100;
    const icon = pct > 5 ? '🟢' : pct < -5 ? '🔴' : '⚪';
    const arrow = pct > 5 ? '↑' : pct < -5 ? '↓' : '→';
    console.log(`  ${icon} ${item.label.padEnd(14)} ${item.r.toFixed(1).padStart(6)} avg  ${item.p.toFixed(1).padStart(6)} avg  ${arrow} ${Math.abs(pct).toFixed(1)}%`);
  });
  console.log('');
}

// ── Helpers ───────────────────────────────────────────────────────

function avgMetrics(dates, hist) {
  const visitors = dates.reduce((s, d) => s + (hist[d]?.visitors || 0), 0) / dates.length;
  const sessions = dates.reduce((s, d) => s + (hist[d]?.sessions || 0), 0) / dates.length;
  const formClicks = dates.reduce((s, d) => s + (hist[d]?.formClicks || 0), 0) / dates.length;
  const scClicks = dates.reduce((s, d) => s + (hist[d]?.scClicks || 0), 0) / dates.length;
  return { visitors, sessions, formClicks, scClicks };
}

function checkForDecline(recent, prior) {
  if (recent.length === 0 || prior.length === 0) return false;
  const r = avgMetrics(recent, { ...recent.reduce((acc, d) => { acc[d] = { visitors: 1 }; return acc; }, {}) });
  return false;
}

function aggregateSources(dates, hist) {
  const agg = {};
  let total = 0;
  dates.forEach(d => {
    const src = hist[d]?.sources || {};
    Object.keys(src).forEach(s => { agg[s] = (agg[s] || 0) + src[s]; total += src[s]; });
  });
  return Object.keys(agg).map(s => ({ source: s, users: agg[s], pct: total > 0 ? (agg[s] / total) * 100 : 0 }));
}

function aggregateCampaigns(dates, hist) {
  const agg = {};
  dates.forEach(d => {
    const camps = hist[d]?.campaigns || {};
    Object.keys(camps).forEach(c => { agg[c] = (agg[c] || 0) + camps[c]; });
  });
  const count = dates.length || 1;
  return Object.keys(agg).map(c => ({ campaign: c, sessions: agg[c] / count }));
}

module.exports = { answer };
