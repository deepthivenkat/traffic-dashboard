/**
 * Leads — Track form submissions from ads, content, and search
 * ==============================================================
 * Records individual lead sources and tracks through the funnel:
 *   Site Visit → Form Click → Contacted → Booked
 *
 * Data stored in data/leads.json
 */

const path = require('path');
const fs = require('fs');

const LEADS_PATH = path.resolve(__dirname, '..', '..', 'data', 'leads.json');

function loadLeads() {
  try {
    if (fs.existsSync(LEADS_PATH)) return JSON.parse(fs.readFileSync(LEADS_PATH, 'utf8'));
  } catch (e) { /* reset */ }
  return [];
}

function saveLeads(leads) {
  const dir = path.dirname(LEADS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(LEADS_PATH, JSON.stringify(leads, null, 2));
}

// ── Add a lead ────────────────────────────────────────────────────

function addLead({ name, email, phone, source, campaign, landingPage, notes }) {
  const leads = loadLeads();
  const lead = {
    id: Date.now(),
    date: new Date().toISOString().slice(0, 10),
    name: name || 'Unknown',
    email: email || null,
    phone: phone || null,
    source: source || 'direct',     // ad, organic, referral, direct
    campaign: campaign || null,      // which ad campaign
    landingPage: landingPage || null, // first page they landed on
    status: 'new',                   // new, contacted, booked, lost
    notes: notes || '',
    createdAt: new Date().toISOString(),
  };
  leads.push(lead);
  saveLeads(leads);
  console.log(`\n✅ Lead logged: ${lead.name} (${lead.source})\n`);
  return lead;
}

// ── Update lead status ────────────────────────────────────────────

function updateStatus(id, status, notes) {
  const leads = loadLeads();
  const lead = leads.find(l => l.id === id);
  if (!lead) { console.log(`\n❌ Lead #${id} not found.\n`); return null; }

  const valid = ['new', 'contacted', 'booked', 'lost'];
  if (!valid.includes(status)) { console.log(`\n❌ Invalid status: ${status}. Use: ${valid.join(', ')}\n`); return null; }

  lead.status = status;
  if (notes) lead.notes = (lead.notes ? lead.notes + ' | ' : '') + notes;
  saveLeads(leads);
  console.log(`\n✅ Lead #${id} → ${status}\n`);
  return lead;
}

// ── Link a lead to a GA4 session source ───────────────────────────

function autoTagLead(leadId, data) {
  // When we have GA4 data, we can cross-reference the lead's date
  // to see which campaign/source was driving traffic that day
  const leads = loadLeads();
  const lead = leads.find(l => l.id === leadId);
  if (!lead) return null;

  // Find campaigns running on the lead's date
  const dayData = data?.campaigns || [];
  // Simple: tag with top campaign from that period
  lead.campaign = dayData.length > 0 ? dayData[0].campaign : lead.campaign;
  saveLeads(leads);
  return lead;
}

// ── Display ───────────────────────────────────────────────────────

function listLeads(statusFilter, daysBack) {
  let leads = loadLeads();
  if (statusFilter) leads = leads.filter(l => l.status === statusFilter);
  if (daysBack) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    leads = leads.filter(l => l.date >= cutoff.toISOString().slice(0, 10));
  }

  if (leads.length === 0) {
    console.log('\n📭 No leads found.\n');
    return;
  }

  const statusIcons = { new: '🆕', contacted: '📞', booked: '✅', lost: '❌' };
  console.log(`\n👤 Leads (${leads.length}):`);
  console.log('═'.repeat(70));
  leads.sort((a, b) => b.id - a.id).forEach(l => {
    const icon = statusIcons[l.status] || '❓';
    console.log(`  ${icon} #${l.id} ${l.name}${l.email ? ' · ' + l.email : ''}${l.phone ? ' · ' + l.phone : ''}`);
    console.log(`     Date: ${l.date}  Source: ${l.source}${l.campaign ? ' · Campaign: ' + l.campaign : ''}`);
    if (l.landingPage) console.log(`     Page: ${l.landingPage}`);
    if (l.notes) console.log(`     Notes: ${l.notes}`);
  });
  console.log(`\n${'═'.repeat(70)}\n`);
}

function funnelSummary() {
  const leads = loadLeads();
  const total = leads.length;
  const contacted = leads.filter(l => l.status === 'contacted' || l.status === 'booked').length;
  const booked = leads.filter(l => l.status === 'booked').length;
  const lost = leads.filter(l => l.status === 'lost').length;
  const new_ = leads.filter(l => l.status === 'new').length;

  // Source breakdown
  const sources = {};
  leads.forEach(l => { sources[l.source] = (sources[l.source] || 0) + 1; });

  console.log(`\n📊 Lead Funnel:`);
  console.log('═'.repeat(40));
  console.log(`  🆕 New:         ${new_}`);
  console.log(`  📞 Contacted:    ${contacted}`);
  console.log(`  ✅ Booked:       ${booked}`);
  console.log(`  ❌ Lost:         ${lost}`);
  console.log(`  ──────────────────────`);
  console.log(`  Total:         ${total}`);
  console.log(`  Book Rate:     ${total > 0 ? ((booked / total) * 100).toFixed(1) + '%' : '—'}`);
  console.log(`\n  By Source:`);
  Object.entries(sources).sort((a, b) => b[1] - a[1]).forEach(([src, count]) => {
    console.log(`    ${src}: ${count} (${((count / total) * 100).toFixed(0)}%)`);
  });
  console.log(`${'═'.repeat(40)}\n`);
}

module.exports = { addLead, updateStatus, autoTagLead, listLeads, funnelSummary, loadLeads };
