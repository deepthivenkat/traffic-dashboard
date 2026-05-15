/**
 * Analytics — GA4 + Search Console query functions
 * ==================================================
 * Pure data-fetching layer. No display logic.
 * 
 * Depends on: core (for env), credentials.env, stored_token.json
 * Used by: dashboard.js (imports these functions)
 *
 * To enable:
 *   1. Enable APIs in GCP:
 *      - Google Analytics Data API
 *      - Google Search Console API
 *   2. Re-run: node src/setup.js (grants analytics + webmasters scopes)
 *   3. Set env vars or use defaults:
 *      GA4_PROPERTY_ID, SEARCH_CONSOLE_SITE
 */

const path = require('path');
const fs = require('fs');
const https = require('https');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', 'config', 'credentials.env') });

const TOKEN_PATH = path.resolve(__dirname, '..', '..', 'config', 'stored_token.json');
const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID || '519369580';
const SC_SITE_URL = process.env.SEARCH_CONSOLE_SITE || 'sc-domain:joshualegal.com';

// ── Internal: API helpers ──────────────────────────────────────────

function getAuth() {
  if (!fs.existsSync(TOKEN_PATH)) throw new Error('No OAuth token. Run: node src/setup.js');
  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  const auth = new OAuth2Client(process.env.GOOGLE_ADS_CLIENT_ID, process.env.GOOGLE_ADS_CLIENT_SECRET);
  auth.setCredentials(tokens);
  return auth;
}

async function getToken(auth) {
  return (await auth.getAccessToken()).token;
}

async function apiPost(url, reqBody, accessToken) {
  const payload = JSON.stringify(reqBody);
  const endpoint = new URL(url);
  return new Promise((resolve) => {
    const req = https.request({
      hostname: endpoint.hostname,
      path: endpoint.pathname + (endpoint.search || ''),
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(responseData) }); }
        catch (e) { resolve({ status: res.statusCode, body: responseData.slice(0, 500) }); }
      });
    });
    req.on('error', () => resolve({ status: 0, body: '' }));
    req.write(payload);
    req.end();
  });
}

async function ga4(body, token) {
  return apiPost(`https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`, body, token);
}

async function scQuery(body, token) {
  return apiPost(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SC_SITE_URL)}/searchAnalytics/query`, body, token);
}

// ── GA4 Queries ────────────────────────────────────────────────────

async function getVisitors(token, days) {
  const resp = await ga4({
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
    dimensions: [{ name: 'date' }],
    orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }],
  }, token);
  return (resp.body?.rows || []).map(row => ({
    date: row.dimensionValues[0].value,
    users: parseInt(row.metricValues[0].value) || 0,
    sessions: parseInt(row.metricValues[1].value) || 0,
  }));
}

async function getSources(token, days) {
  const resp = await ga4({
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    metrics: [{ name: 'activeUsers' }],
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
  }, token);
  const rows = resp.body?.rows || [];
  const total = rows.reduce((sum, row) => sum + (parseInt(row.metricValues[0].value) || 0), 0);
  return rows.map(row => ({
    source: row.dimensionValues[0].value,
    users: parseInt(row.metricValues[0].value) || 0,
    pct: total > 0 ? ((parseInt(row.metricValues[0].value) / total) * 100).toFixed(1) : '0',
  }));
}

async function getCountries(token, days) {
  const resp = await ga4({
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    metrics: [{ name: 'activeUsers' }],
    dimensions: [{ name: 'country' }],
    orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
  }, token);
  const rows = resp.body?.rows || [];
  const total = rows.reduce((sum, row) => sum + (parseInt(row.metricValues[0].value) || 0), 0);
  return rows.map(row => ({
    country: row.dimensionValues[0].value,
    users: parseInt(row.metricValues[0].value) || 0,
    pct: total > 0 ? ((parseInt(row.metricValues[0].value) / total) * 100).toFixed(1) : '0',
  }));
}

async function getPages(token, days) {
  const resp = await ga4({
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    metrics: [{ name: 'screenPageViews' }],
    dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 10,
  }, token);
  return (resp.body?.rows || []).map(row => ({
    path: row.dimensionValues[0].value,
    title: row.dimensionValues[1].value,
    views: parseInt(row.metricValues[0].value) || 0,
  }));
}

async function getFormClicks(token, days) {
  const eventNames = ['contact_form_click', 'form_submit', 'form_start', 'contact_submit', 'book_appointment'];
  for (const eventName of eventNames) {
    try {
      const resp = await ga4({
        dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
        metrics: [{ name: 'eventCount' }],
        dimensions: [{ name: 'date' }],
        dimensionFilter: {
          filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: eventName } },
        },
        orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }],
      }, token);
      if (resp.body?.rows?.length > 0) {
        const rows = resp.body.rows;
        return {
          eventName,
          daily: rows.map(row => ({ date: row.dimensionValues[0].value, count: parseInt(row.metricValues[0].value) || 0 })),
          total: rows.reduce((sum, row) => sum + (parseInt(row.metricValues[0].value) || 0), 0),
        };
      }
    } catch (e) { /* try next */ }
  }
  return { eventName: null, daily: [], total: 0 };
}

async function getCampaignAttribution(token, days) {
  try {
    const resp = await ga4({
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
      metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
      dimensions: [{ name: 'sessionCampaignName' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    }, token);
    const rows = resp.body?.rows || [];
    if (rows.length === 0 || (rows.length === 1 && rows[0].dimensionValues[0].value === '(not set)')) return [];
    const total = rows.reduce((sum, row) => sum + (parseInt(row.metricValues[1].value) || 0), 0);
    return rows
      .filter(row => row.dimensionValues[0].value !== '(not set)')
      .map(row => ({
        campaign: row.dimensionValues[0].value,
        users: parseInt(row.metricValues[0].value) || 0,
        sessions: parseInt(row.metricValues[1].value) || 0,
        pct: total > 0 ? ((parseInt(row.metricValues[1].value) / total) * 100).toFixed(1) : '0',
      }));
  } catch (e) { return []; }
}

async function getCampaignByCountry(token, days) {
  try {
    const resp = await ga4({
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
      metrics: [{ name: 'sessions' }],
      dimensions: [{ name: 'sessionCampaignName' }, { name: 'country' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 20,
    }, token);
    const rows = resp.body?.rows || [];
    return rows
      .filter(r => r.dimensionValues[0].value !== '(not set)'
        && r.dimensionValues[0].value !== '(direct)'
        && r.dimensionValues[0].value !== '(organic)'
        && r.dimensionValues[1].value !== 'United States')
      .map(r => ({
        campaign: r.dimensionValues[0].value,
        country: r.dimensionValues[1].value,
        sessions: parseInt(r.metricValues[0].value) || 0,
      }));
  } catch (e) { return []; }
}

async function getAdSources(token, days) {
  try {
    const resp = await ga4({
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
      metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
      dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }, { name: 'sessionCampaignName' }],
      dimensionFilter: {
        filter: { fieldName: 'sessionMedium', stringFilter: { matchType: 'EXACT', value: 'cpc' } },
      },
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    }, token);
    const rows = resp.body?.rows || [];
    const totalSessions = rows.reduce((sum, row) => sum + (parseInt(row.metricValues[0].value) || 0), 0);
    const totalUsers = rows.reduce((sum, row) => sum + (parseInt(row.metricValues[1].value) || 0), 0);
    return {
      totalSessions,
      totalUsers,
      campaigns: rows.map(row => ({
        source: row.dimensionValues[0].value,
        medium: row.dimensionValues[1].value,
        campaign: row.dimensionValues[2].value,
        sessions: parseInt(row.metricValues[0].value) || 0,
        users: parseInt(row.metricValues[1].value) || 0,
      })),
    };
  } catch (e) { return { totalSessions: 0, totalUsers: 0, campaigns: [] }; }
}

async function getSearchData(token, days) {
  try {
    const startDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const endDate = new Date().toISOString().slice(0, 10);
    const [queryRes, pageRes] = await Promise.all([
      scQuery({ startDate, endDate, dimensions: ['query'], rowLimit: 10 }, token),
      scQuery({ startDate, endDate, dimensions: ['page'], rowLimit: 10 }, token),
    ]);
    return {
      queries: (queryRes.body?.rows || []).map(r => ({
        query: r.keys[0], clicks: r.clicks || 0, impressions: r.impressions || 0,
        ctr: r.ctr ? (r.ctr * 100).toFixed(1) + '%' : '0%',
        position: r.position ? r.position.toFixed(1) : '-',
      })),
      pages: (pageRes.body?.rows || []).map(r => ({
        page: r.keys[0], clicks: r.clicks || 0, impressions: r.impressions || 0,
        ctr: r.ctr ? (r.ctr * 100).toFixed(1) + '%' : '0%',
        position: r.position ? r.position.toFixed(1) : '-',
      })),
    };
  } catch (e) { return { queries: [], pages: [] }; }
}

// ── Batch fetcher (single token, all queries in parallel) ─────────

async function fetchAll(days = 14, auth) {
  const token = await getToken(auth || getAuth());
  const [visitors, sources, pages, contactForm, countries, campaigns, byCountry, adSources, searchPerf] = await Promise.all([
    getVisitors(token, days), getSources(token, days), getPages(token, days),
    getFormClicks(token, days), getCountries(token, days), getCampaignAttribution(token, days),
    getCampaignByCountry(token, days), getAdSources(token, days), getSearchData(token, days),
  ]);
  return { visitors, sources, pages, contactForm, countries, campaigns, byCountry, adSources, searchPerf, days };
}

module.exports = {
  fetchAll,
  getAuth,
  getToken,
  getVisitors, getSources, getCountries, getPages,
  getFormClicks, getCampaignAttribution, getCampaignByCountry, getAdSources, getSearchData,
};
