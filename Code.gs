/**
 * Rapide Meta Ads Dashboard - data API
 *
 * Reads the "Daily" tab of the spreadsheet this script is attached to and
 * returns it as JSON, but only when the caller sends the correct token.
 *
 * SETUP
 * 1. Open the spreadsheet > Extensions > Apps Script, paste this file in.
 * 2. Project Settings (gear icon) > Script properties > Add script property:
 *      DASHBOARD_TOKEN = <the password you want to use>
 *    (Optional) SPREADSHEET_ID = <id>, only if this script is NOT attached to the sheet.
 * 3. Deploy > New deployment > type "Web app"
 *      Execute as: Me
 *      Who has access: Anyone
 *    Copy the Web app URL into WEB_APP_URL at the top of app.js.
 * 4. After editing this file later, use Deploy > Manage deployments > Edit >
 *    New version, otherwise the live URL keeps running the old code.
 *
 * RESPONSES (always JSON)
 *   { ok: true, updatedAt, rows: [...] }
 *   { ok: false, code: 'INVALID_TOKEN' }        wrong or missing token
 *   { ok: false, code: 'NOT_CONFIGURED', ... }  DASHBOARD_TOKEN property not set
 *   { ok: false, code: 'SERVER_ERROR', message } sheet missing, columns renamed, etc.
 */

var SHEET_NAME = 'Daily';
var TOKEN_PROPERTY = 'DASHBOARD_TOKEN';
var SPREADSHEET_ID_PROPERTY = 'SPREADSHEET_ID';

// Sheet column header -> key sent to the dashboard
var COLUMNS = {
  'Date': 'date',
  'Campaign': 'campaign',
  'Ad Group': 'adGroup',
  'Cost': 'cost',
  'Impressions': 'impressions',
  'Clicks': 'clicks',
  'Page View': 'pageViews',
  'Get Estimate': 'getEstimate',
  'Add to Cart': 'addToCart',
  'Checkout': 'checkout',
  'Purchase': 'bookings',
  'Free Booking': 'freeBookings',
  'Conv. Value': 'convValue'
};

/** Opening the URL in a browser just confirms the deployment is alive. */
function doGet() {
  return respond_({ ok: true, service: 'rapide-dashboard', message: 'Online. Send a POST request with a token.' });
}

function doPost(e) {
  try {
    var expected = PropertiesService.getScriptProperties().getProperty(TOKEN_PROPERTY);
    if (!expected) {
      return respond_({
        ok: false,
        code: 'NOT_CONFIGURED',
        message: 'No token is set on the server. Add a ' + TOKEN_PROPERTY + ' script property.'
      });
    }

    var body;
    try {
      body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    } catch (err) {
      return respond_({ ok: false, code: 'BAD_REQUEST', message: 'Request body must be JSON.' });
    }

    if (!safeEqual_(String(body.token || ''), String(expected))) {
      return respond_({ ok: false, code: 'INVALID_TOKEN' });
    }

    return respond_({ ok: true, updatedAt: new Date().toISOString(), rows: readDaily_() });
  } catch (err) {
    return respond_({ ok: false, code: 'SERVER_ERROR', message: String((err && err.message) || err) });
  }
}

function readDaily_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(SPREADSHEET_ID_PROPERTY);
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No spreadsheet found. Attach this script to the sheet or set SPREADSHEET_ID.');

  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Tab "' + SHEET_NAME + '" was not found.');

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  // Map header names to column positions (trimmed, case-insensitive)
  var headerIndex = {};
  values[0].forEach(function (h, i) {
    headerIndex[String(h).trim().toLowerCase()] = i;
  });

  var cols = [];
  var missing = [];
  Object.keys(COLUMNS).forEach(function (header) {
    var idx = headerIndex[header.toLowerCase()];
    if (idx === undefined) missing.push(header);
    else cols.push({ idx: idx, key: COLUMNS[header] });
  });
  if (missing.length) throw new Error('Missing column(s) in "' + SHEET_NAME + '": ' + missing.join(', '));

  var tz = ss.getSpreadsheetTimeZone();
  var rows = [];

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var out = {};
    cols.forEach(function (c) { out[c.key] = row[c.idx]; });

    var date = toIsoDate_(out.date, tz);
    if (!date || !out.campaign) continue; // skips blank / footer rows

    out.date = date;
    out.campaign = String(out.campaign).trim();
    out.adGroup = String(out.adGroup || '').trim();
    ['cost', 'impressions', 'clicks', 'pageViews', 'getEstimate', 'addToCart',
     'checkout', 'bookings', 'freeBookings', 'convValue'].forEach(function (k) {
      var n = Number(out[k]);
      out[k] = isFinite(n) ? n : 0;
    });
    rows.push(out);
  }
  return rows;
}

function toIsoDate_(v, tz) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return null;
}

/** Compares strings without bailing out at the first mismatch. */
function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function respond_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
