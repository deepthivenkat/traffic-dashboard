# 📊 Traffic Dashboard — Architecture

## Overview
CLI + HTML dashboard for website traffic analytics. Pulls from **Google Analytics 4 (GA4)** and **Google Search Console**.

## Directory Structure
```
traffic-dashboard/
├── config/
│   ├── credentials.env      # GCP OAuth credentials (gitignored)
│   └── stored_token.json    # OAuth tokens (gitignored)
├── src/
│   ├── dashboard.js         # CLI entry point (routing only)
│   ├── setup.js             # OAuth authorization flow
│   └── modules/
│       ├── analytics.js     # GA4 + Search Console queries (data layer)
│       └── dashboard.js     # CLI + HTML display (presentation layer)
├── ARCHITECTURE.md
└── README.md
```

## Data Flow
```
User → src/dashboard.js  →  modules/dashboard.js (display)
                                  ↑ imports
                            modules/analytics.js (queries GA4 + SC APIs)
                                  ↑ auth
                            config/stored_token.json
```

## Key Rules
- `analytics.js` = data fetching only, no display logic
- `dashboard.js` = display only, imports analytics.js
- Files stay under 300 lines
- Single responsibility per module

## Setup
1. Enable APIs in GCP Console:
   - Google Analytics Data API
   - Google Search Console API
2. Run: `node src/setup.js`
3. Set env vars or edit defaults in analytics.js
