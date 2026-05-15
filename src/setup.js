/**
 * OAuth Setup — Dashboard only (analytics + webmasters scopes)
 * ============================================================
 * Run this first to authorize access to GA4 and Search Console.
 *
 * Usage: node src/setup.js
 */

const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config({ path: path.resolve(__dirname, '..', 'config', 'credentials.env') });

const TOKEN_PATH = path.resolve(__dirname, '..', 'config', 'stored_token.json');

// Only need analytics + search console scopes
const SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/webmasters.readonly',
];

async function main() {
  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║   📊 Traffic Dashboard — OAuth Setup         ║');
  console.log('╚═══════════════════════════════════════════════╝\n');

  const oAuth2Client = new OAuth2Client(
    process.env.GOOGLE_ADS_CLIENT_ID,
    process.env.GOOGLE_ADS_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
  );

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  console.log('🔗 Authorize by visiting this URL:\n');
  console.log('─'.repeat(60));
  console.log(authUrl);
  console.log('─'.repeat(60));
  console.log('\nSign in, grant permissions, then paste the code below.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise(resolve => rl.question('✏️  Code: ', answer => { rl.close(); resolve(answer.trim()); }));

  if (!code) { console.error('\n❌ No code provided.\n'); process.exit(1); }

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), 'utf8');
    console.log('\n✅ Tokens saved to config/stored_token.json\n');
    console.log('You can now use:\n');
    console.log('  node src/dashboard.js dashboard');
    console.log('  node src/dashboard.js html 14\n');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
