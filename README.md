# 📊 Traffic Dashboard

Website traffic analytics from **Google Analytics 4** + **Search Console**.

## Quick Start

```bash
# Install
npm install

# Authorize
node src/setup.js

# Run
node src/dashboard.js dashboard       # CLI traffic report
node src/dashboard.js html 14          # Interactive HTML dashboard
node src/dashboard.js bookings         # Appointments report
```

## Features
- Daily visitors & sessions with bar charts
- Traffic sources breakdown (Direct, Google Ads, Organic, etc.)
- Ads breakdown by campaign name (Search-4, P.Max, DSA, etc.)
- Conversion rate tracking (form clicks)
- Search Console top queries & pages
- Automated actionable insight at the top
- Self-contained HTML dashboard with Chart.js

## Defaults
- GA4 Property: `519369580` (joshualegal.com)
- Search Console: `sc-domain:joshualegal.com`
- Override via `GA4_PROPERTY_ID` and `SEARCH_CONSOLE_SITE` env vars

## GitHub
https://github.com/deepthivenkat/traffic-dashboard
