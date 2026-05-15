/**
 * 📊 Dashboard — CLI & HTML presentation layer
 * =============================================
 * Pure display logic. All data fetching delegated to analytics.js.
 *
 * Depends on: analytics.js (data), core.js (helpers)
 * Used by: ads-client.js (commands: dashboard, html, bookings)
 *
 * File structure:
 *   - parseGADate, fmtDate, fmt, bar, divider — display helpers
 *   - dashboard() — CLI report
 *   - generateHTML() — self-contained HTML file with Chart.js
 *   - appointmentsReport() — bookings-focused CLI report
 */

const path = require('path');
const fs = require('fs');
const analytics = require('./analytics');
const history = require('./history');

// ── Display helpers ───────────────────────────────────────────────────

function parseGADate(ymd) {
  if (!ymd || ymd.length !== 8) return new Date();
  return new Date(parseInt(ymd.slice(0, 4)), parseInt(ymd.slice(4, 6)) - 1, parseInt(ymd.slice(6, 8)));
}
function fmtDate(ymd) { return parseGADate(ymd).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
function fmt(n) { return (parseInt(n) || 0).toLocaleString(); }
function bar(val, max, w) { if (!max || max === 0) return ' '.repeat(w); return '█'.repeat(Math.round((val / max) * w)) + '░'.repeat(w - Math.round((val / max) * w)); }
function divider(ch = '─', len = 70) { return ch.repeat(len); }

// ── Insight Engine ────────────────────────────────────────────────────

function generateInsight(data) {
  const { visitors, pages, contactForm, campaigns, adSources, searchPerf } = data;
  const total = visitors.reduce((s, d) => s + d.users, 0);

  // Priority 1: High-performing keyword with low investment
  if (searchPerf.queries && searchPerf.queries.length > 0) {
    const best = searchPerf.queries.find(q => parseFloat(q.position) <= 3 && parseFloat(q.ctr) > 5 && q.clicks > 0);
    if (best) {
      const pages_ = (searchPerf.pages || []).filter(p => p.clicks > 0).slice(0, 3);
      return {
        icon: '🚀',
        title: 'Keyword Opportunity: "' + best.query + '"',
        body: 'Already ranking #' + best.position + ' with ' + best.ctr + ' CTR. ' +
          'Create a dedicated landing page and sitelink for this query to capture more traffic. ' +
          (pages_.length > 0 ? 'Top page: ' + pages_[0].page.replace('https://joshualegal.com','').replace('https://www.joshualegal.com','') || '/' : '') + '.',
        action: 'node src/dashboard.js sitelinks build top5',
      };
    }
  }

  // Priority 2: Low conversion rate
  if (contactForm.eventName && total > 50) {
    const rate = (contactForm.total / total) * 100;
    if (rate < 5) {
      const contactViews = (pages || []).find(p => p.path === '/contact' || p.path.startsWith('/contact'));
      return {
        icon: '📝',
        title: 'Conversion Rate at ' + rate.toFixed(1) + '%',
        body: 'Only ' + contactForm.total + ' form clicks from ' + total + ' visitors. ' +
          (contactViews ? 'Contact page only has ' + contactViews.views + ' views. ' : '') +
          'Add a prominent "Free Consultation" CTA button to the homepage and key service pages.',
        action: 'Add CTA button to homepage header + all service pages',
      };
    }
  }

  // Priority 3: Campaign imbalance
  if (adSources && adSources.campaigns.length >= 2) {
    const top = adSources.campaigns[0];
    const rest = adSources.campaigns.slice(1).reduce((s, c) => s + c.sessions, 0);
    if (rest > 0 && top.sessions / (top.sessions + rest) > 0.6) {
      return {
        icon: '📢',
        title: 'Ad Spend Concentration',
        body: '"' + top.campaign + '" drives ' + ((top.sessions / (top.sessions + rest)) * 100).toFixed(0) + '% of paid traffic. ' +
          'Test reallocating 20% budget to underperforming campaigns with different ad copy or landing pages.',
        action: 'node src/ads-client.js budget optimize',
      };
    }
  }

  // Priority 4: High direct traffic (brand awareness opportunity)
  if (total > 50) {
    const directPct = (sources || []).find(s => s.source === 'Direct');
    if (directPct && parseFloat(directPct.pct) > 40) {
      return {
        icon: '🔗',
        title: 'High Direct Traffic (' + directPct.pct + '%)',
        body: 'Nearly half your traffic has no tracked source. ' +
          'Ensure Google Ads auto-tagging is on, verify GA4 tracking across all pages, ' +
          'and add UTM parameters to all external links.',
        action: 'Check: Google Ads → Tools → Conversions → Auto-tagging',
      };
    }
  }

  // Fallback
  return {
    icon: '📊',
    title: 'All Systems Normal',
    body: 'Review full dashboard data below for optimization opportunities.',
    action: 'Run: node src/ads-client.js insights',
  };
}

// ── CLI Dashboard ─────────────────────────────────────────────────────

async function dashboard(days = 7, tabFilter = null) {
  const auth = analytics.getAuth();
  const { visitors, sources, pages, contactForm, countries, campaigns, adSources, searchPerf } = await analytics.fetchAll(days, auth);
  const total = visitors.reduce((s, d) => s + d.users, 0);
  const sessions = visitors.reduce((s, d) => s + d.sessions, 0);

  function showSection(name) { return !tabFilter || tabFilter === name; }

  console.log(`\n⚡ LeadSurgeGen — joshualegal.com (Last ${days} Days)`); console.log(divider('═'));

  // Actionable insight at the top
  const insight = generateInsight({ visitors, sources, pages, contactForm, countries, campaigns, adSources, searchPerf });
  console.log(`  ${insight.icon} ${insight.title}`);
  console.log(`  ${insight.body}`);
  console.log(`  ▶ ${insight.action}`);
  console.log(divider('─'));

  // History: save today's snapshot + show comparison
  const histData = { visitors, sources, contactForm, adSources, searchPerf };
  const hist = history.saveDailySnapshot(histData);
  const comparison = history.generateComparison(hist);
  history.printComparison(comparison);
  console.log(divider('─'));

  console.log(`\n  📈 Visitors: ${fmt(total)}  Sessions: ${fmt(sessions)}`);
  console.log(divider());

  // Daily visitors
  const maxV = Math.max(...visitors.map(d => d.users), 1);
  console.log(`\n  📅 Daily:`);
  visitors.forEach(d => console.log(`  ${(fmtDate(d.date)+':').padEnd(17)} ${fmt(d.users).padStart(4)} ${bar(d.users, maxV, 28)} ${d.sessions} sessions`));

  // Traffic sources
  if (showSection('traffic')) {
    const sourceLabels = {
    'Direct': 'Direct',
    'Paid Search': 'Google Ads',
    'Organic Search': 'Organic Search',
    'Display': 'Display',
    'Cross-network': 'Cross-network',
    'Referral': 'Referral',
    'Organic Social': 'Social (Organic)',
    'Unassigned': 'Unassigned',
  };
  const maxSrc = Math.max(...sources.map(s => s.users), 1);
  console.log(`\n  🔗 Sources:`);
  sources.forEach(s => {
    const label = sourceLabels[s.source] || s.source;
    console.log(`  ${(label+':').padEnd(22)} ${fmt(s.users).padStart(4)} (${s.pct}%) ${bar(s.users, maxSrc, 25)}`);
  });
  } // end traffic tab

  // Ads breakdown
  if (showSection('ads') || !tabFilter) {
    if (adSources && adSources.totalSessions > 0) {
      console.log(`\n  📢 Ads (${adSources.totalUsers} users, ${adSources.totalSessions} sessions):`);
      const maxAd = Math.max(...adSources.campaigns.map(a => a.sessions), 1);
      adSources.campaigns.forEach(a => {
        const label = a.campaign !== '(not set)' ? a.campaign : a.source;
        console.log(`  ${(label+':').padEnd(30)} ${fmt(a.sessions).padStart(4)} sessions ${bar(a.sessions, maxAd, 20)}`);
      });
    }
  }

  // Conversion rate
  if (showSection('insights') || !tabFilter) {
    console.log(`\n  📅 Conversion Report:`); console.log(divider());
  if (contactForm.eventName) {
    const rate = total > 0 ? ((contactForm.total / total) * 100).toFixed(1) : '0';
    console.log(`  Visitors: ${fmt(total)}  Form Clicks: ${contactForm.total}  Rate: ${rate}%`);
    visitors.forEach(v => {
      const fc = contactForm.daily.find(c => c.date === v.date)?.count || 0;
      console.log(`  ${(fmtDate(v.date)+':').padEnd(17)} Visits: ${fmt(v.users).padStart(3)}  Form: ${fc} ${'●'.repeat(Math.min(fc * 4, 20))}`);
    });
  } else {
    console.log(`  Visitors: ${fmt(total)}  No form events detected.`);
  }
  } // end insights tab

  // Campaign attribution
  if (showSection('ads') || !tabFilter) {
    console.log(`\n  📢 Campaign Attribution:`); console.log(divider());
  if (campaigns.length > 0) {
    const maxCamp = Math.max(...campaigns.map(c => c.sessions), 1);
    campaigns.forEach(c => console.log(`  ${(c.campaign+':').padEnd(30)} ${fmt(c.sessions).padStart(4)} sessions (${c.pct}%) ${bar(c.sessions, maxCamp, 20)}`));
  } else {
    console.log(`  No campaign-attributed traffic found.\n  Verify Google Ads auto-tagging is on in Tools → Conversions.`);
  }
  } // end ads tab

  // Top pages
  if (showSection('content') || !tabFilter) {
    console.log(`\n  📄 Top Pages:`);
    pages.slice(0, 8).forEach(p => console.log(`  ${fmt(p.views).padStart(5)} views  ${p.path}`));

    if (searchPerf.queries.length > 0) {
      console.log(`\n  🔍 Search Console — Queries:`);
      searchPerf.queries.forEach(q => console.log(`  "${q.query}" — ${q.clicks} clks  ${q.impressions} impr  CTR ${q.ctr}  Pos ${q.position}`));
      console.log(`\n  🔍 Search Console — Pages:`);
      searchPerf.pages.slice(0, 5).forEach(p => {
        const l = p.page.replace('https://joshualegal.com', '').replace('https://www.joshualegal.com', '') || '/';
        console.log(`  ${p.clicks} clks  ${p.impressions} impr  CTR ${p.ctr}  ${l}`);
      });
    }
  } // end content tab
  console.log(`\n${divider('═')}\n`);
  return { visitors, sources, pages, contactForm, countries, campaigns, searchPerf };
}

// ── HTML Dashboard ────────────────────────────────────────────────────

async function generateHTML(days = 14) {
  const auth = analytics.getAuth();
  const data = await analytics.fetchAll(days, auth);
  history.saveDailySnapshot(data);

  const script = `function parseDate(ymd){if(!ymd||ymd.length!==8)return new Date();return new Date(parseInt(ymd.slice(0,4)),parseInt(ymd.slice(4,6))-1,parseInt(ymd.slice(6,8)))}
var D = `;
  const script2 = `;
var tv = D.visitors.reduce(function(s,d){return s+d.users},0);
var ts = D.visitors.reduce(function(s,d){return s+d.sessions},0);
var convRate = D.contactForm.total&&tv?((D.contactForm.total/tv)*100).toFixed(1)+'%':'—';
var campTotal = (D.campaigns||[]).reduce(function(s,c){return s+c.sessions},0);

// Tab switching
function switchTab(tab,btn){var i=document.querySelectorAll('.tabp');i.forEach(function(p){p.style.display='none'});document.getElementById('tab'+tab).style.display='';var b=document.querySelectorAll('.tab-btn');b.forEach(function(x){x.className='tab-btn'});btn.className='tab-btn active'}

// Insight
function genInsight(D){var q=D.searchPerf.queries||[];for(var i=0;i<q.length;i++){var p=parseFloat(q[i].position);var ctr=parseFloat(q[i].ctr);if(p<=3&&ctr>5&&q[i].clicks>0){return{icon:'🚀',title:'Keyword Opportunity: "'+q[i].query+'"',body:'Ranking #'+q[i].position+' with '+q[i].ctr+' CTR.',action:'Create landing page for this query'}}}var t=0;for(var i=0;i<D.visitors.length;i++)t+=D.visitors[i].users;if(D.contactForm.eventName&&t>50&&((D.contactForm.total||0)/t*100)<5){var cv=(D.pages||[]).find(function(p){return p.path==='/contact'});return{icon:'📝',title:'Conversion Rate '+((D.contactForm.total||0)/t*100).toFixed(1)+'%',body:'Only '+D.contactForm.total+' form clicks from '+t+' visitors.'+(cv?' Contact page: '+cv.views+' views.':''),action:'Add CTA to homepage'}}return{icon:'📊',title:'All Systems Normal',body:'Review data below.',action:'Run: query'}}
var I=genInsight(D);document.getElementById('insightTitle').innerHTML=I.icon+' '+I.title;document.getElementById('insightBody').innerHTML=I.body;document.getElementById('insightAction').innerHTML='▶ '+I.action;

// Stats cards
var SL={'Direct':'Direct','Paid Search':'Google Ads','Organic Search':'Organic Search','Display':'Display','Cross-network':'Cross-network','Referral':'Referral','Organic Social':'Social (Organic)','Unassigned':'Unassigned'};
document.getElementById('stats').innerHTML = [
  {l:'Visitors',v:tv.toLocaleString(),s:'Unique visitors ('+D.days+'d)'},
  {l:'Sessions',v:ts.toLocaleString(),s:'Total sessions'},
  {l:'Form Clicks',v:(D.contactForm.total||0).toLocaleString(),s:'Conv rate: '+convRate},
  {l:'Campaigns',v:campTotal.toLocaleString(),s:'Paid sessions'},
].map(function(c){return '<div class=card><h3>'+c.l+'</h3><div class=val>'+c.v+'</div><div class=sub>'+c.s+'</div></div>'}).join('');

// Chart instances holder
var charts = {};

// ── TAB 1: Traffic ──
new Chart(document.getElementById('vChart'),{type:'bar',data:{labels:D.visitors.map(function(d){var dt=parseDate(d.date);return dt.toLocaleDateString('en',{weekday:'short',month:'short',day:'numeric'})}),datasets:[
{label:'Visitors',data:D.visitors.map(function(d){return d.users}),backgroundColor:'#4f46e5',borderRadius:4},
{label:'Sessions',data:D.visitors.map(function(d){return d.sessions}),backgroundColor:'#10b981',borderRadius:4}]},
options:{responsive:true,plugins:{legend:{position:'top'}},scales:{y:{beginAtZero:true,grid:{color:'#f0f0f0'}},x:{grid:{display:false}}}}});

new Chart(document.getElementById('sChart'),{type:'doughnut',data:{labels:D.sources.map(function(s){return SL[s.source]||s.source}),datasets:[{data:D.sources.map(function(s){return s.users}),backgroundColor:['#4f46e5','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6']}]},options:{responsive:true,plugins:{legend:{position:'right'}}}});

// ── TAB 2: Ads ──
if(D.campaigns&&D.campaigns.length){new Chart(document.getElementById('campChart'),{type:'bar',data:{labels:D.campaigns.map(function(c){return c.campaign}),datasets:[{label:'Sessions',data:D.campaigns.map(function(c){return c.sessions}),backgroundColor:'#8b5cf6',borderRadius:4}]},options:{indexAxis:'y',responsive:true,plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,grid:{color:'#f0f0f0'}},y:{grid:{display:false}}}}})}

(D.adSources&&D.adSources.campaigns||[]).forEach(function(c){var tr=document.createElement('tr');tr.innerHTML='<td>'+c.campaign+'</td><td>'+c.sessions+'</td><td>'+c.users+'</td><td>'+c.source+'</td>';document.getElementById('adCampTable').appendChild(tr)});

// ── TAB 3: Content ──
function addRows(tid,rows,cols){rows.forEach(function(r){var tr=document.createElement('tr');tr.innerHTML=cols.map(function(c){return '<td>'+r[c]+'</td>'}).join('');document.getElementById(tid).appendChild(tr)})}
addRows('sqTable',D.searchPerf.queries||[],['query','clicks','impressions','ctr','position']);
addRows('spTable',(D.searchPerf.pages||[]).map(function(p){return{page:(p.page.replace('https://joshualegal.com','').replace('https://www.joshualegal.com','')||'/'),clicks:p.clicks,impressions:p.impressions,ctr:p.ctr}}),['page','clicks','impressions','ctr']);
addRows('pvTable',(D.pages||[]).map(function(p){return{views:p.views,page:p.path}}),['views','page']);

// ── TAB 4: Insights ──
var convRows = [];
for(var i=0;i<D.visitors.length;i++){var v=D.visitors[i];var fc=0;for(var j=0;j<D.contactForm.daily.length;j++){if(D.contactForm.daily[j].date===v.date){fc=D.contactForm.daily[j].count;break}}convRows.push({day:parseDate(v.date).toLocaleDateString('en',{weekday:'short',month:'short',day:'numeric'}),visits:v.users,form:fc})}
var convTotal = D.contactForm.total||0; var hist = D.history||[];
addRows('crTable',convRows,['day','visits','form']);

document.getElementById('convSummary').innerHTML = 'Visitors: '+tv+' | Form Clicks: '+convTotal+' | Rate: '+convRate+' | '+(hist.days||'N/A')+' days of history';

// History trend
if(hist.comparison){var h=hist.comparison;var ht='<table><tr><th>Metric</th><th>Recent</th><th>Prior</th><th>Change</th></tr>';
h.metrics.forEach(function(m){ht+='<tr><td>'+m.label+'</td><td>'+m.recent+'</td><td>'+m.prior+'</td><td>'+m.arrow+' '+(m.pct||'—')+'%</td></tr>'});ht+='</table>';document.getElementById('histTable').innerHTML=ht}

// Make default tab active
switchTab('traffic',document.querySelector('.tab-btn'));
</script>

`;

  const outPath = path.resolve(__dirname, '..', '..', 'dashboard.html');

  // Also load history for the insights tab
  const hist = history.loadHistory();
  const comparison = history.generateComparison(hist);
  const enriched = { ...data, history: { days: Object.keys(hist).length, comparison } };

  const html = `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>LeadSurgeGen — Client Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,system-ui,sans-serif;background:#f0f2f5;color:#1a1a2e;padding:20px}
.container{max-width:1300px;margin:0 auto}
h1{font-size:26px;margin-bottom:4px}
.sub{color:#666;margin-bottom:16px;font-size:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px}
.card{background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.card h3{font-size:12px;color:#666;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
.card .val{font-size:30px;font-weight:700}
.card .sub{font-size:12px;color:#888;margin-top:2px}
.chart-card{background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:12px}
.chart-card h3{font-size:15px;margin-bottom:10px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:768px){.two{grid-template-columns:1fr}}

/* Tabs */
.tab-bar{display:flex;gap:4px;margin-bottom:16px;background:#fff;border-radius:10px;padding:4px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.tab-btn{padding:10px 20px;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:500;background:transparent;color:#666;transition:all .2s}
.tab-btn:hover{background:#f0f0f0;color:#333}
.tab-btn.active{background:#4f46e5;color:#fff}
.tabp{display:none}

/* Insight banner */
.insight-banner{border-left:4px solid #4f46e5;margin-bottom:12px}
.insight-banner h3{font-size:15px;margin-bottom:4px}
.insight-banner p{font-size:14px;line-height:1.5;color:#444}
.insight-banner .action{font-size:12px;color:#888;margin-top:6px;font-family:monospace}

table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:6px 10px;border-bottom:2px solid #eee;color:#666;font-size:11px;text-transform:uppercase}
td{padding:6px 10px;border-bottom:1px solid #f0f0f0}
h4{font-size:13px;color:#444;margin:12px 0 6px}
</style></head><body>
<div class="container">
<h1>⚡ LeadSurgeGen</h1>
<p class="sub">📊 joshualegal.com · Fred A. Joshua, P.C. · Last ${days} days · ${new Date().toLocaleDateString()}</p>

<div class="chart-card insight-banner" id="insight"><h3 id="insightTitle"></h3><p id="insightBody"></p><p class="action" id="insightAction"></p></div>

<div class="grid" id="stats"></div>

<div class="tab-bar">
  <button class="tab-btn" onclick="switchTab('traffic',this)">📈 Traffic</button>
  <button class="tab-btn" onclick="switchTab('ads',this)">📢 Ads</button>
  <button class="tab-btn" onclick="switchTab('content',this)">📄 Content</button>
  <button class="tab-btn" onclick="switchTab('insights',this)">💡 Insights</button>
</div>

<div id="tabtraffic" class="tabp">
  <div class="two">
    <div class="chart-card"><h3>📈 Daily Visitors</h3><canvas id="vChart" height="200"></canvas></div>
    <div class="chart-card"><h3>🔗 Traffic Sources</h3><canvas id="sChart" height="200"></canvas></div>
  </div>
  <div class="chart-card"><h3>📅 Conversion Rate</h3><table id="crTable"><thead><tr><th>Day</th><th>Visits</th><th>Form</th></tr></thead><tbody></tbody></table></div>
</div>

<div id="tabads" class="tabp">
  <div class="chart-card"><h3>📢 Campaign Attribution</h3><canvas id="campChart" height="200"></canvas></div>
  <div class="chart-card"><h3>Ads Breakdown</h3><table id="adCampTable"><thead><tr><th>Campaign</th><th>Sessions</th><th>Users</th><th>Source</th></tr></thead><tbody></tbody></table></div>
  <div class="two">
    <div class="chart-card"><h3>💰 Budget (from Google Ads)</h3><p style="color:#888;font-size:14px">Requires Google Ads API token upgrade</p></div>
    <div class="chart-card"><h3>🌍 Campaign × Country</h3><p style="color:#888;font-size:14px" id="adCountryMsg">No non-US paid traffic detected</p></div>
  </div>
</div>

<div id="tabcontent" class="tabp">
  <div class="two">
    <div class="chart-card"><h3>🔍 Search Console — Queries</h3><table id="sqTable"><thead><tr><th>Query</th><th>Clicks</th><th>Impr</th><th>CTR</th><th>Pos</th></tr></thead><tbody></tbody></table></div>
    <div class="chart-card"><h3>🔍 Search Console — Pages</h3><table id="spTable"><thead><tr><th>Page</th><th>Clicks</th><th>Impr</th><th>CTR</th></tr></thead><tbody></tbody></table></div>
  </div>
  <div class="chart-card"><h3>📄 Top Pages (GA4)</h3><table id="pvTable"><thead><tr><th>Views</th><th>Page</th></tr></thead><tbody></tbody></table></div>
</div>

<div id="tabinsights" class="tabp">
  <div class="grid" style="grid-template-columns:1fr">
    <div class="chart-card"><h3>📊 Conversion Summary</h3><p id="convSummary" style="font-size:15px"></p></div>
  </div>
  <div class="two">
    <div class="chart-card"><h3>📉 vs History</h3><div id="histTable"><p style="color:#888">Need more data — run daily to build history.</p></div></div>
    <div class="chart-card"><h3>📋 Recommendations</h3><p id="recBody" style="font-size:14px;line-height:1.6"></p></div>
  </div>
  <div class="chart-card"><h3>📜 Past Queries</h3><table id="queryLogTable"><thead><tr><th>Date</th><th>Question</th></tr></thead><tbody></tbody></table></div>
</div>

</div>
<script>`;

  // Build recommendations from data
  const totalVisitors = data.visitors.reduce((s,d) => s + d.users, 0);
  const computedRate = data.contactForm.total && totalVisitors > 0 ? ((data.contactForm.total / totalVisitors) * 100).toFixed(1) + '%' : '—';
  let recs = '• <strong>Conversion Rate:</strong> ' + computedRate + ' (' + (data.contactForm.total||0) + ' form clicks from ' + totalVisitors + ' visitors)\n';
  if (data.searchPerf.queries && data.searchPerf.queries.length > 0) {
    const best = data.searchPerf.queries.find(q => parseFloat(q.position) <= 3);
    if (best) recs += '• <strong>Keyword Opportunity:</strong> "' + best.query + '" at position ' + best.position + ' with ' + best.ctr + ' CTR\n';
  }
  if (data.adSources && data.adSources.campaigns.length > 0) {
    const top = data.adSources.campaigns[0];
    recs += '• <strong>Top Campaign:</strong> "' + top.campaign + '" driving ' + top.sessions + ' sessions\n';
    if (data.adSources.campaigns.length > 1) {
      const rest = data.adSources.campaigns.slice(1).reduce((s, c) => s + c.sessions, 0);
      if (top.sessions > rest * 2) recs += '• <strong>Concentration Risk:</strong> Top campaign dominates — test reallocating budget\n';
    }
  }

  const bodyWithRecs = html + script + JSON.stringify(enriched) + script2;
  // Inject recommendations
  const finalHtml = bodyWithRecs.replace('id="recBody" style="font-size:14px;line-height:1.6"></p>', 'id="recBody" style="font-size:14px;line-height:1.6">' + recs.replace(/\n/g, '<br>') + '</p>');

  fs.writeFileSync(outPath, finalHtml);
  console.log(`\n✅ Dashboard: ${outPath}\n   open ${outPath}\n`);
}

// ── Bookings Report ───────────────────────────────────────────────────

async function appointmentsReport(days = 7) {
  const auth = analytics.getAuth();
  const data = await analytics.fetchAll(days, auth);
  history.saveDailySnapshot(data);
  const total = data.visitors.reduce((s, d) => s + d.users, 0);

  console.log(`\n📅 Appointments Report — Last ${days} Days`);
  console.log(divider('═'));
  console.log(`\n  Visitors: ${fmt(total)}  Form Clicks: ${data.contactForm.total}  Rate: ${total > 0 ? ((data.contactForm.total / total) * 100).toFixed(1) + '%' : '—'}\n`);
  data.visitors.forEach(v => {
    const fc = data.contactForm.daily.find(c => c.date === v.date)?.count || 0;
    console.log(`  ${(fmtDate(v.date)+':').padEnd(17)} Visitors: ${fmt(v.users).padStart(4)}  Form: ${fc} ${'●'.repeat(Math.min(fc * 4, 20))}`);
  });
  console.log(`\n${divider('═')}\n`);
}

module.exports = { dashboard, generateHTML, appointmentsReport };
