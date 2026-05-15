#!/usr/bin/env node
/**
 * 📊 Traffic Dashboard — CLI entry point
 * =======================================
 * Website traffic analytics from GA4 + Search Console.
 *
 * Usage: node src/dashboard.js <command>
 *
 * Commands:
 *   dashboard [days]    CLI traffic report
 *   html [days]         Generate interactive HTML dashboard
 *   bookings [days]     Appointments & conversion report
 *   setup               Run OAuth authorization
 *   help                Show this message
 */

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const tabIdx = args.indexOf('--tab');
  const tabFilter = tabIdx >= 0 ? args[tabIdx + 1] : null;
  const sub = args[1];

  if (!command || command === 'help') {
    console.log(`
📊 Traffic Dashboard

Commands:
  dashboard [days]           CLI traffic report (default: 7)
  dashboard [days] --tab <t> Show just one tab: traffic|ads|content|insights
  html [days]                Generate interactive HTML dashboard
  bookings [days]            Appointments & conversion report (default: 7)
  query <question>           Ask about performance trends
  clients list               List all client firms
  clients add                Add a new client firm
  clients show <id>          Show client details
  setup                      Run OAuth authorization
  help                       Show this message

Examples:
  node src/dashboard.js dashboard 7
  node src/dashboard.js dashboard --tab ads
  node src/dashboard.js html 14
  node src/dashboard.js query "why has performance declined"
  node src/dashboard.js clients list
`);
    return;
  }

  if (command === 'setup') {
    require('./setup');
    return;
  }

  const dash = require('./modules/dashboard');

  switch (command) {
    case 'dashboard':
    case 'traffic':
      await dash.dashboard(parseInt(args[1]) || 7, tabFilter);
      break;
    case 'html':
      await dash.generateHTML(parseInt(args[1]) || 14);
      break;
    case 'bookings':
    case 'appointments':
      await dash.appointmentsReport(parseInt(args[1]) || 7);
      break;
    case 'query':
    case 'ask':
    case 'why':
      const question = args.slice(1).join(' ') || 'how are things looking';
      const query = require('./modules/query');
      await query.answer(question);
      break;
    case 'clients':
    case 'client':
    case 'users':
      const users = require('./modules/users');
      if (sub === 'list') { users.listClients(); }
      else if (sub === 'show') { if (!args[2]) console.log('Usage: clients show <id>'); else users.showClient(parseInt(args[2])); }
      else if (sub === 'add') {
        if (!args[2]) { console.log('Usage: clients add <name> --domain <domain> [--ga4 <id>] [--ads <cid>] [--sc <url>] [--contact <name>] [--email <email>]'); process.exit(1); }
        const dIdx = args.indexOf('--domain'); const gIdx = args.indexOf('--ga4'); const aIdx = args.indexOf('--ads');
        const sIdx = args.indexOf('--sc'); const coIdx = args.indexOf('--contact'); const eIdx = args.indexOf('--email');
        users.addClient({ name: args[2], domain: dIdx >= 0 ? args[dIdx+1] : null,
          ga4PropertyId: gIdx >= 0 ? args[gIdx+1] : null, googleAdsCustomerId: aIdx >= 0 ? args[aIdx+1] : null,
          scSiteUrl: sIdx >= 0 ? args[sIdx+1] : null, contacts: coIdx >= 0 ? [{name: args[coIdx+1], email: eIdx >= 0 ? args[eIdx+1] : null}] : [] });
      }
      else { console.log('Usage: clients list|show|add'); }
      break;
    default:
      console.error(`❌ Unknown command: ${command}`);
      console.log('Run `node src/dashboard.js help` for usage.');
      process.exit(1);
  }
}

main().catch(error => {
  console.error(`\n❌ Error: ${error?.message || error}\n`);
  process.exit(1);
});
