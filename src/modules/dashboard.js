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
        action: 'node src/ads-client.js sitelinks build top5',
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

async function dashboard(days = 7) {
  const auth = analytics.getAuth();
  const { visitors, sources, pages, contactForm, countries, campaigns, adSources, searchPerf } = await analytics.fetchAll(days, auth);
  const total = visitors.reduce((s, d) => s + d.users, 0);
  const sessions = visitors.reduce((s, d) => s + d.sessions, 0);

  console.log(`\n📊 Traffic Dashboard — Last ${days} Days`); console.log(divider('═'));

  // Actionable insight at the top
  const insight = generateInsight({ visitors, sources, pages, contactForm, countries, campaigns, adSources, searchPerf });
  console.log(`  ${insight.icon} ${insight.title}`);
  console.log(`  ${insight.body}`);
  console.log(`  ▶ ${insight.action}`);
  console.log(divider('─'));

  console.log(`\n  📈 Visitors: ${fmt(total)}  Sessions: ${fmt(sessions)}`);
  console.log(divider());

  // Daily visitors
  const maxV = Math.max(...visitors.map(d => d.users), 1);
  console.log(`\n  📅 Daily:`);
  visitors.forEach(d => console.log(`  ${(fmtDate(d.date)+':').padEnd(17)} ${fmt(d.users).padStart(4)} ${bar(d.users, maxV, 28)} ${d.sessions} sessions`));

  // Traffic sources
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

  // Ads breakdown
  if (adSources && adSources.totalSessions > 0) {
    console.log(`\n  📢 Ads (${adSources.totalUsers} users, ${adSources.totalSessions} sessions):`);
    const maxAd = Math.max(...adSources.campaigns.map(a => a.sessions), 1);
    adSources.campaigns.forEach(a => {
      const label = a.campaign !== '(not set)' ? a.campaign : a.source;
      console.log(`  ${(label+':').padEnd(30)} ${fmt(a.sessions).padStart(4)} sessions ${bar(a.sessions, maxAd, 20)}`);
    });
  }

  // Conversion rate
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

  // Campaign attribution
  console.log(`\n  📢 Campaign Attribution:`); console.log(divider());
  if (campaigns.length > 0) {
    const maxCamp = Math.max(...campaigns.map(c => c.sessions), 1);
    campaigns.forEach(c => console.log(`  ${(c.campaign+':').padEnd(30)} ${fmt(c.sessions).padStart(4)} sessions (${c.pct}%) ${bar(c.sessions, maxCamp, 20)}`));
  } else {
    console.log(`  No campaign-attributed traffic found.\n  Verify Google Ads auto-tagging is on in Tools → Conversions.`);
  }

  // Top pages
  console.log(`\n  📄 Top Pages:`);
  pages.slice(0, 8).forEach(p => console.log(`  ${fmt(p.views).padStart(5)} views  ${p.path}`));

  // Search Console
  if (searchPerf.queries.length > 0) {
    console.log(`\n  🔍 Search Console — Queries:`);
    searchPerf.queries.forEach(q => console.log(`  "${q.query}" — ${q.clicks} clks  ${q.impressions} impr  CTR ${q.ctr}  Pos ${q.position}`));
    console.log(`\n  🔍 Search Console — Pages:`);
    searchPerf.pages.slice(0, 5).forEach(p => {
      const l = p.page.replace('https://joshualegal.com', '').replace('https://www.joshualegal.com', '') || '/';
      console.log(`  ${p.clicks} clks  ${p.impressions} impr  CTR ${p.ctr}  ${l}`);
    });
  }
  console.log(`\n${divider('═')}\n`);
  return { visitors, sources, pages, contactForm, countries, campaigns, searchPerf };
}

// ── HTML Dashboard ────────────────────────────────────────────────────

async function generateHTML(days = 14) {
  const auth = analytics.getAuth();
  const data = await analytics.fetchAll(days, auth);

  const html = `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>📊 Traffic Dashboard — joshualegal.com</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,system-ui,sans-serif;background:#f0f2f5;color:#1a1a2e;padding:20px}
.container{max-width:1200px;margin:0 auto}
h1{font-size:28px;margin-bottom:5px}
.sub{color:#666;margin-bottom:20px;font-size:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-bottom:24px}
.card{background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.1)}
.card h3{font-size:13px;color:#666;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px}
.card .val{font-size:36px;font-weight:700}
.card .sub{font-size:13px;color:#888;margin-top:4px}
.chart-card{background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.1);margin-bottom:16px}
.chart-card h3{font-size:16px;margin-bottom:12px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
table{width:100%;border-collapse:collapse;font-size:14px}
th{text-align:left;padding:8px 12px;border-bottom:2px solid #eee;color:#666;font-size:12px;text-transform:uppercase}
td{padding:8px 12px;border-bottom:1px solid #f0f0f0}
h4{font-size:14px;color:#444;margin:16px 0 8px}
@media(max-width:768px){.two{grid-template-columns:1fr}}
</style></head><body>
<div class="container">
<h1>📊 joshualegal.com — Traffic Dashboard</h1>
<p class="sub">Last ${days} days · ${new Date().toLocaleDateString()}</p>

<div class="chart-card" id="insight" style="border-left:4px solid #4f46e5;margin-bottom:16px"><h3 id="insightTitle"></h3><p id="insightBody" style="font-size:15px;line-height:1.5"></p><p id="insightAction" style="font-size:13px;color:#666;margin-top:8px;font-family:monospace"></p></div>

<div class="grid" id="stats"></div>

<div class="two">
  <div class="chart-card"><h3>📈 Daily Visitors</h3><canvas id="visitorChart" height="200"></canvas></div>
  <div class="chart-card"><h3>🔗 Traffic Sources</h3><canvas id="sourceChart" height="200"></canvas></div>
</div>

<div class="two">
  <div class="chart-card">
    <h3>🔍 Search Console</h3>
    <h4>Top Queries</h4>
    <table id="searchQueryTable"><thead><tr><th>Query</th><th>Clicks</th><th>Impr</th><th>CTR</th><th>Pos</th></tr></thead><tbody></tbody></table>
    <h4>Top Pages</h4>
    <table id="searchPageTable"><thead><tr><th>Page</th><th>Clicks</th><th>Impr</th><th>CTR</th></tr></thead><tbody></tbody></table>
  </div>
</div>

<div class="two">
  <div class="chart-card"><h3>📅 Conversion Rate</h3>
    <table id="convTable"><thead><tr><th>Day</th><th>Visits</th><th>Form</th></tr></thead><tbody></tbody></table>
  </div>
  <div class="chart-card"><h3>📢 Campaign Attribution</h3><canvas id="campChart" height="200"></canvas></div>
</div>

<div class="two">
  <div class="chart-card"><h3>📄 Top Pages (GA4)</h3><table id="pagesTable"><thead><tr><th>Views</th><th>Page</th></tr></thead><tbody></tbody></table></div>
</div>
</div>

<script>
function parseDate(ymd){if(!ymd||ymd.length!==8)return new Date();return new Date(parseInt(ymd.slice(0,4)),parseInt(ymd.slice(4,6))-1,parseInt(ymd.slice(6,8)))}
var D = `;
  const html2 = `;
var tv = D.visitors.reduce(function(s,d){return s+d.users},0);
var ts = D.visitors.reduce(function(s,d){return s+d.sessions},0);
var convRate = D.contactForm.total&&tv?((D.contactForm.total/tv)*100).toFixed(1)+'%':'—';
var campTotal = (D.campaigns||[]).reduce(function(s,c){return s+c.sessions},0);
// Generate insight on the client side
function genInsight(D){var q=D.searchPerf.queries||[];for(var i=0;i<q.length;i++){var p=parseFloat(q[i].position);var ctr=parseFloat(q[i].ctr);if(p<=3&&ctr>5&&q[i].clicks>0){return{icon:'🚀',title:'Keyword Opportunity: "'+q[i].query+'"',body:'Ranking #'+q[i].position+' with '+q[i].ctr+' CTR. Create a dedicated landing page and sitelink.',action:'node src/ads-client.js sitelinks build top5'}}}var t=0;for(var i=0;i<D.visitors.length;i++)t+=D.visitors[i].users;if(D.contactForm.eventName&&t>50){var r=((D.contactForm.total||0)/t*100);if(r<5){var cv=(D.pages||[]).find(function(p){return p.path==='/contact'});return{icon:'📝',title:'Conversion Rate at '+r.toFixed(1)+'%',body:'Only '+D.contactForm.total+' form clicks from '+t+' visitors.'+(cv?' Contact page has '+cv.views+' views.':'')+' Add CTA to homepage.',action:'Add "Free Consultation" button to header'}}}return{icon:'📊',title:'All Systems Normal',body:'Review data below for opportunities.',action:'Run: insights'}}
var I=genInsight(D);document.getElementById('insightTitle').innerHTML=I.icon+' '+I.title;document.getElementById('insightBody').innerHTML=I.body;document.getElementById('insightAction').innerHTML='▶ '+I.action;

document.getElementById('stats').innerHTML = [
  {l:'Visitors',v:tv.toLocaleString(),s:'Unique visitors ('+D.days+'d)'},
  {l:'Sessions',v:ts.toLocaleString(),s:'Total sessions'},
  {l:'Form Clicks',v:(D.contactForm.total||0).toLocaleString(),s:'Conv rate: '+convRate},
  {l:'Campaign Sessions',v:campTotal.toLocaleString(),s:'Tracked by Google Ads'},
].map(function(c){return '<div class=card><h3>'+c.l+'</h3><div class=val>'+c.v+'</div><div class=sub>'+c.s+'</div></div>'}).join('');

new Chart(document.getElementById('visitorChart'),{type:'bar',data:{labels:D.visitors.map(function(d){var dt=parseDate(d.date);return dt.toLocaleDateString('en',{weekday:'short',month:'short',day:'numeric'})}),datasets:[
{label:'Visitors',data:D.visitors.map(function(d){return d.users}),backgroundColor:'#4f46e5',borderRadius:4},
{label:'Sessions',data:D.visitors.map(function(d){return d.sessions}),backgroundColor:'#10b981',borderRadius:4}]},
options:{responsive:true,plugins:{legend:{position:'top'}},scales:{y:{beginAtZero:true,grid:{color:'#f0f0f0'}},x:{grid:{display:false}}}}});

var SL={'Direct':'Direct','Paid Search':'Google Ads','Organic Search':'Organic Search','Display':'Display','Cross-network':'Cross-network','Referral':'Referral','Organic Social':'Social (Organic)','Unassigned':'Unassigned'};
new Chart(document.getElementById('sourceChart'),{type:'doughnut',data:{labels:D.sources.map(function(s){return SL[s.source]||s.source}),datasets:[{data:D.sources.map(function(s){return s.users}),backgroundColor:['#4f46e5','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899']}]},options:{responsive:true,plugins:{legend:{position:'right'}}}});

if(D.campaigns&&D.campaigns.length){new Chart(document.getElementById('campChart'),{type:'bar',data:{labels:D.campaigns.map(function(c){return c.campaign}),datasets:[{label:'Sessions',data:D.campaigns.map(function(c){return c.sessions}),backgroundColor:'#8b5cf6',borderRadius:4}]},options:{indexAxis:'y',responsive:true,plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,grid:{color:'#f0f0f0'}},y:{grid:{display:false}}}}})}

function addRows(tid,rows,cols){rows.forEach(function(r){var tr=document.createElement('tr');tr.innerHTML=cols.map(function(c){return '<td>'+r[c]+'</td>'}).join('');document.getElementById(tid).appendChild(tr)})}
addRows('searchQueryTable',D.searchPerf.queries||[],['query','clicks','impressions','ctr','position']);
addRows('searchPageTable',(D.searchPerf.pages||[]).map(function(p){return{page:(p.page.replace('https://joshualegal.com','').replace('https://www.joshualegal.com','')||'/'),clicks:p.clicks,impressions:p.impressions,ctr:p.ctr}}),['page','clicks','impressions','ctr']);
addRows('pagesTable',(D.pages||[]).map(function(p){return{views:p.views,page:p.path}}),['views','page']);
var convRows = [];
for(var i=0;i<D.visitors.length;i++){var v=D.visitors[i];var fc=0;for(var j=0;j<D.contactForm.daily.length;j++){if(D.contactForm.daily[j].date===v.date){fc=D.contactForm.daily[j].count;break}}convRows.push({day:parseDate(v.date).toLocaleDateString('en',{weekday:'short',month:'short',day:'numeric'}),visits:v.users,form:fc})}
addRows('convTable',convRows,['day','visits','form']);
</script></body></html>`;

  const outPath = path.resolve(__dirname, '..', '..', 'dashboard.html');
  fs.writeFileSync(outPath, html + JSON.stringify(data) + html2);
  console.log(`\n✅ Dashboard: ${outPath}\n   open ${outPath}\n`);
}

// ── Bookings Report ───────────────────────────────────────────────────

async function appointmentsReport(days = 7) {
  const auth = analytics.getAuth();
  const data = await analytics.fetchAll(days, auth);
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
