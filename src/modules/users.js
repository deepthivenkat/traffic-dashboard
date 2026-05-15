/**
 * Clients & CRM — Law firm account management
 * =============================================
 * Tracks client firms, contacts, domains, and links to analytics.
 * Data stored in data/clients.json (kept, not gitignored).
 *
 * Used by: dashboard.js, dashboard CLI (commands: clients, user)
 */

const path = require('path');
const fs = require('fs');

const CLIENTS_PATH = path.resolve(__dirname, '..', '..', 'data', 'clients.json');

// ── Load / Save ───────────────────────────────────────────────────

function loadClients() {
  try {
    if (fs.existsSync(CLIENTS_PATH)) return JSON.parse(fs.readFileSync(CLIENTS_PATH, 'utf8'));
  } catch (e) { /* corrupt file, reset */ }
  return [];
}

function saveClients(clients) {
  const dir = path.dirname(CLIENTS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CLIENTS_PATH, JSON.stringify(clients, null, 2));
}

// ── CRUD ──────────────────────────────────────────────────────────

function addClient({ name, domain, ga4PropertyId, scSiteUrl, googleAdsCustomerId, contacts, notes }) {
  const clients = loadClients();
  const id = clients.length > 0 ? Math.max(...clients.map(c => c.id)) + 1 : 1;

  // Check for duplicates
  if (clients.find(c => c.domain === domain)) {
    console.log(`\n⚠️  Client with domain "${domain}" already exists.\n`);
    return null;
  }

  const client = {
    id, name, domain,
    ga4PropertyId: ga4PropertyId || null,
    scSiteUrl: scSiteUrl || null,
    googleAdsCustomerId: googleAdsCustomerId || null,
    contacts: contacts || [],
    notes: notes || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  clients.push(client);
  saveClients(clients);
  console.log(`\n✅ Client added: ${name} (${domain})\n`);
  return client;
}

function updateClient(id, updates) {
  const clients = loadClients();
  const idx = clients.findIndex(c => c.id === id);
  if (idx === -1) { console.log(`\n❌ Client #${id} not found.\n`); return null; }

  clients[idx] = { ...clients[idx], ...updates, id: clients[idx].id, updatedAt: new Date().toISOString() };
  saveClients(clients);
  console.log(`\n✅ Client #${id} updated.\n`);
  return clients[idx];
}

function removeClient(id) {
  const clients = loadClients();
  const idx = clients.findIndex(c => c.id === id);
  if (idx === -1) { console.log(`\n❌ Client #${id} not found.\n`); return; }

  const name = clients[idx].name;
  clients.splice(idx, 1);
  saveClients(clients);
  console.log(`\n🗑️  Client removed: ${name}\n`);
}

function addContact(clientId, { name, email, phone, role }) {
  const clients = loadClients();
  const client = clients.find(c => c.id === clientId);
  if (!client) { console.log(`\n❌ Client #${clientId} not found.\n`); return null; }

  const contact = { id: Date.now(), name, email: email || null, phone: phone || null, role: role || null };
  client.contacts.push(contact);
  client.updatedAt = new Date().toISOString();
  saveClients(clients);
  console.log(`\n✅ Contact added: ${name} → ${client.name}\n`);
  return contact;
}

// ── Display ───────────────────────────────────────────────────────

function listClients() {
  const clients = loadClients();
  if (clients.length === 0) {
    console.log('\n📭 No clients yet. Add with: node src/dashboard.js clients add\n');
    return;
  }

  console.log(`\n📋 Clients (${clients.length}):`);
  console.log('═'.repeat(70));
  clients.forEach(c => {
    console.log(`  #${c.id} ${c.name}`);
    console.log(`     Domain: ${c.domain}`);
    if (c.ga4PropertyId) console.log(`     GA4: ${c.ga4PropertyId}`);
    if (c.googleAdsCustomerId) console.log(`     Ads: ${c.googleAdsCustomerId}`);
    if (c.contacts.length > 0) {
      c.contacts.forEach(ct => {
        console.log(`     Contact: ${ct.name}${ct.email ? ' · ' + ct.email : ''}${ct.phone ? ' · ' + ct.phone : ''}${ct.role ? ' (' + ct.role + ')' : ''}`);
      });
    }
    if (c.notes) console.log(`     Notes: ${c.notes}`);
  });
  console.log(`\n${'═'.repeat(70)}\n`);
}

function showClient(id) {
  const clients = loadClients();
  const c = clients.find(c => c.id === id);
  if (!c) { console.log(`\n❌ Client #${id} not found.\n`); return; }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  #${c.id} ${c.name}`);
  console.log(`  Domain: ${c.domain}`);
  if (c.ga4PropertyId) console.log(`  GA4 Property: ${c.ga4PropertyId}`);
  if (c.scSiteUrl) console.log(`  Search Console: ${c.scSiteUrl}`);
  if (c.googleAdsCustomerId) console.log(`  Google Ads CID: ${c.googleAdsCustomerId}`);
  console.log(`  Contacts:`);
  c.contacts.forEach(ct => {
    console.log(`    • ${ct.name}${ct.role ? ' (' + ct.role + ')' : ''}`);
    if (ct.email) console.log(`      Email: ${ct.email}`);
    if (ct.phone) console.log(`      Phone: ${ct.phone}`);
  });
  if (c.notes) console.log(`  Notes: ${c.notes}`);
  console.log(`  Created: ${new Date(c.createdAt).toLocaleDateString()}`);
  console.log(`  Updated: ${new Date(c.updatedAt).toLocaleDateString()}`);
  console.log(`${'═'.repeat(60)}\n`);
}

// ── Get default client (for current dashboard context) ────────────

function getDefaultClient() {
  const clients = loadClients();
  if (clients.length === 0) return null;
  return clients[0]; // First client is the default
}

module.exports = { addClient, updateClient, removeClient, addContact, listClients, showClient, loadClients, getDefaultClient };
