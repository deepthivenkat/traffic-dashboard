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

  if (!command || command === 'help') {
    console.log(`
📊 Traffic Dashboard

Commands:
  dashboard [days]           CLI traffic report (default: 7)
  dashboard [days] --tab <t> Show just one tab: traffic|ads|content|insights
  html [days]                Generate interactive HTML dashboard
  bookings [days]            Appointments & conversion report (default: 7)
  query <question>           Ask about performance trends
  setup                      Run OAuth authorization
  help                       Show this message

Examples:
  node src/dashboard.js dashboard 7
  node src/dashboard.js dashboard --tab ads
  node src/dashboard.js html 14
  node src/dashboard.js query "why has performance declined"
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
