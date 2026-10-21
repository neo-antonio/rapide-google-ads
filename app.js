/* Rapide Meta Ads Dashboard */
(function () {
  'use strict';

  /* ======================================================================
     CONFIG: paste your Apps Script Web app URL (ends in /exec)
     ====================================================================== */
  var CONFIG = {
    WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbwN5YHyiLQe7qsQmE9wLDbkkGQp93hsVvdXKOporM8iua_kHD_-ar3CNy5TlxnjX_2m/exec',
    TIMEOUT_MS: 30000
  };

  var TOKEN_KEY = 'rapide_dashboard_token';
  var COLORS = { orange: '#f29900', blue: '#3b82f6', vermilion: '#e8501b', gray: '#8a8f99' };

  /* ======================================================================
     Small helpers
     ====================================================================== */
  function $(s, el) { return (el || document).querySelector(s); }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function store(op, val) {
    try {
      if (op === 'get') return sessionStorage.getItem(TOKEN_KEY);
      if (op === 'set') sessionStorage.setItem(TOKEN_KEY, val);
      if (op === 'del') sessionStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* storage unavailable */ }
    return null;
  }

  /* ---------- Dates are handled as whole days since 1970-01-01 (UTC) ---------- */
  var DAY = 86400000;
  function dayOf(iso) {
    var p = iso.split('-');
    return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / DAY);
  }
  function isoOf(d) { return new Date(d * DAY).toISOString().slice(0, 10); }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function parts(d) {
    var t = new Date(d * DAY);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() };
  }
  function fmtShort(d) { var p = parts(d); return MON[p.m] + ' ' + p.d; }
  function fmtLong(d) { var p = parts(d); return MON[p.m] + ' ' + p.d + ', ' + p.y; }
  function fmtSpan(s, e) {
    if (s === e) return fmtLong(s);
    var a = parts(s), b = parts(e);
    return a.y === b.y ? fmtShort(s) + ' to ' + fmtLong(e) : fmtLong(s) + ' to ' + fmtLong(e);
  }
  function monthStart(d) { var p = parts(d); return Math.round(Date.UTC(p.y, p.m, 1) / DAY); }
  function monthEnd(d) { var p = parts(d); return Math.round(Date.UTC(p.y, p.m + 1, 0) / DAY); }
  function addMonths(d, n) {
    var p = parts(d);
    var last = new Date(Date.UTC(p.y, p.m + n + 1, 0)).getUTCDate();
    return Math.round(Date.UTC(p.y, p.m + n, Math.min(p.d, last)) / DAY);
  }

  /* ======================================================================
     Metrics
     pol: +1 higher is better, -1 lower is better, 0 neutral
     ====================================================================== */
  var RAW = ['cost', 'impressions', 'clicks', 'pageViews', 'getEstimate', 'addToCart',
             'checkout', 'bookings', 'freeBookings', 'convValue'];

  var M = {
    cost:         { label: 'Cost',          fmt: 'money', pol: 0 },
    cpm:          { label: 'CPM',           fmt: 'money', pol: -1 },
    impressions:  { label: 'Impressions',   fmt: 'int',   pol: 1 },
    clicks:       { label: 'Clicks',        fmt: 'int',   pol: 1 },
    convValue:    { label: 'Conv. Value',   fmt: 'money', pol: 1 },
    roas:         { label: 'ROAS',          fmt: 'x',     pol: 1 },
    pageViews:    { label: 'Page Views',    fmt: 'int',   pol: 1 },
    getEstimate:  { label: 'Get Estimate',  fmt: 'int',   pol: 1 },
    addToCart:    { label: 'Add to Cart',   fmt: 'int',   pol: 1 },
    checkout:     { label: 'Checkout',      fmt: 'int',   pol: 1 },
    bookings:     { label: 'Bookings',      fmt: 'int',   pol: 1 },
    cpb:          { label: 'Cost per Booking', fmt: 'money', pol: -1 },
    freeBookings: { label: 'Free Bookings', fmt: 'int',   pol: 1 },
    r1:  { label: 'Page View to Estimate',     fmt: 'pct', pol: 1 },
    r2:  { label: 'Estimate to Cart',   fmt: 'pct', pol: 1 },
    r3:  { label: 'Cart to Checkout',       fmt: 'pct', pol: 1 },
    r4:  { label: 'Checkout to Booking',           fmt: 'pct', pol: 1 },
    cvr: { label: 'Overall CVR',                   fmt: 'pct', pol: 1, tip: 'Bookings divided by page views' },
    ctr: { label: 'CTR',           fmt: 'pct',   pol: 1 },
    cpc: { label: 'Cost/Click',    fmt: 'money', pol: -1 }
  };

  var CARD_ORDER = ['cost', 'cpm', 'impressions', 'clicks', 'convValue', 'roas',
                    'pageViews', 'getEstimate', 'addToCart', 'checkout', 'bookings', 'cpb',
                    'freeBookings', 'r1', 'r2', 'r3', 'r4', 'cvr'];

  function div(a, b) { return b > 0 ? a / b : null; }

  function zero() {
    var t = {};
    RAW.forEach(function (k) { t[k] = 0; });
    return t;
  }
  function addInto(t, r) { RAW.forEach(function (k) { t[k] += r[k] || 0; }); }

  /** Raw sums -> every metric the dashboard shows */
  function derive(t) {
    var d = {};
    RAW.forEach(function (k) { d[k] = t[k]; });
    d.cpm = div(t.cost * 1000, t.impressions);
    d.ctr = div(t.clicks, t.impressions);
    d.cpc = div(t.cost, t.clicks);
    d.cpb = div(t.cost, t.bookings);
    d.roas = div(t.convValue, t.cost);
    d.r1 = div(t.getEstimate, t.pageViews);
    d.r2 = div(t.addToCart, t.getEstimate);
    d.r3 = div(t.checkout, t.addToCart);
    d.r4 = div(t.bookings, t.checkout);
    d.cvr = div(t.bookings, t.pageViews);
    return d;
  }

  /* ---------- Number formatting ---------- */
  function scaled(v, dec) {
    var a = Math.abs(v), unit = '', n = v;
    if (a >= 1e6) { n = v / 1e6; unit = 'M'; }
    else if (a >= 1e3) { n = v / 1e3; unit = 'K'; }
    var d = unit ? (Math.abs(n) < 10 ? 2 : 1) : dec;
    return (Math.round((n + (n < 0 ? -1e-9 : 1e-9)) * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d) + unit;
  }
  function fmtVal(type, v) {
    if (v == null || !isFinite(v)) return '–';
    switch (type) {
      case 'money': return v === 0 ? '₱0' : '₱' + scaled(v, Math.abs(v) < 100 ? 2 : 0);
      case 'int':   return scaled(v, 0);
      case 'pct':   return (v * 100).toFixed(1) + '%';
      case 'x':     return v.toFixed(2) + 'x';
    }
    return String(v);
  }
  function fmtFull(type, v) {
    if (v == null || !isFinite(v)) return 'No data';
    switch (type) {
      case 'money': return '₱' + v.toLocaleString('en-US', { maximumFractionDigits: 2 });
      case 'int':   return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
      case 'pct':   return (v * 100).toFixed(2) + '%';
      case 'x':     return v.toFixed(2) + 'x';
    }
    return String(v);
  }
  function fmtAbsDelta(type, diff) {
    var a = Math.abs(diff);
    if (type === 'pct') return (a * 100).toFixed(1) + ' pts';
    return fmtVal(type, a);
  }

  /** Compare two values. Returns null when there is nothing to compare. */
  function delta(m, cur, prev) {
    if (cur == null || prev == null) return null;
    var diff = cur - prev;
    var pct = prev !== 0 ? diff / Math.abs(prev) : null;
    var dir = Math.abs(diff) < 1e-9 ? 0 : (diff > 0 ? 1 : -1);
    var good = dir === 0 || m.pol === 0 ? 0 : (dir === m.pol ? 1 : -1);
    return { diff: diff, pct: pct, dir: dir, good: good };
  }
  function pctText(p) {
    if (p == null) return '';
    return (p > 0 ? '+' : p < 0 ? '−' : '') + Math.abs(p * 100).toFixed(1) + '%';
  }

  /* ======================================================================
     State
     ====================================================================== */
  var state = {
    rows: [],
    dataMin: 0,
    dataMax: 0,
    campaign: '',
    adGroup: '',
    rangePreset: 'last30',
    rangeCustom: null,
    cmpMode: 'off',
    cmpCustom: null,
    chartView: {},
    bdBy: 'campaign',
    bdMetric: 'cost',
    bdSort: { key: 'cost', dir: -1 },
    token: null,
    charts: {},
    bdChart: null
  };

  /* ======================================================================
     API
     ====================================================================== */
  function ApiError(kind, message, detail) {
    this.kind = kind;       // 'config' | 'network' | 'token' | 'server'
    this.message = message;
    this.detail = detail || '';
  }

  function fetchData(token) {
    if (!CONFIG.WEB_APP_URL || CONFIG.WEB_APP_URL.indexOf('PASTE_') === 0) {
      return Promise.reject(new ApiError('config', 'The dashboard has no data source yet.',
        'Set WEB_APP_URL at the top of app.js to your Apps Script Web app URL.'));
    }
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, CONFIG.TIMEOUT_MS);

    return fetch(CONFIG.WEB_APP_URL, {
      method: 'POST',
      // text/plain avoids a CORS preflight, which Apps Script can't answer
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: token }),
      redirect: 'follow',
      signal: ctrl.signal
    }).then(function (res) {
      clearTimeout(timer);
      return res.text().then(function (text) {
        var json;
        try { json = JSON.parse(text); } catch (e) {
          throw new ApiError('network', 'The server replied, but not with data.',
            'Check that the web app is deployed with access set to "Anyone" and the URL is the /exec link (HTTP ' + res.status + ').');
        }
        if (json && json.ok) return json;
        if (json && json.code === 'INVALID_TOKEN') throw new ApiError('token', 'That token is not correct.', 'Check it and try again.');
        if (json && json.code === 'NOT_CONFIGURED') throw new ApiError('server', 'The server has no token set.', json.message || '');
        throw new ApiError('server', 'The server could not load the data.', (json && json.message) || 'Unknown server error.');
      });
    }, function (err) {
      clearTimeout(timer);
      if (err && err.name === 'AbortError') {
        throw new ApiError('network', 'Could not connect: the request timed out.', 'Check your internet connection and try again.');
      }
      throw new ApiError('network', 'Could not connect to the data source.', 'Check your internet connection and that the web app URL is correct, then try again.');
    });
  }

  /* ======================================================================
     Sign in
     ====================================================================== */
  function showLoginError(err) {
    var box = $('#loginError');
    box.className = 'login-error ' + (err.kind === 'token' ? 'token' : err.kind === 'network' ? 'network' : 'server');
    $('#loginErrorTitle').textContent = err.kind === 'token' ? 'Wrong token' :
      err.kind === 'network' ? 'Connection problem' :
      err.kind === 'config' ? 'Setup needed' : 'Server error';
    $('#loginErrorBody').textContent = err.message + (err.detail ? ' ' + err.detail : '');
    box.hidden = false;
  }

  function connect(token) {
    var btn = $('#loginBtn');
    btn.disabled = true;
    btn.textContent = 'Connecting…';
    $('#loginError').hidden = true;

    return fetchData(token).then(function (json) {
      state.token = token;
      store('set', token);
      loadRows(json);
      $('#login').hidden = true;
      $('#app').hidden = false;
      $('#token').value = '';
      initUI();
      render();
    }).catch(function (err) {
      if (!(err instanceof ApiError)) {
        console.error(err);
        err = new ApiError('server', 'Something went wrong while building the dashboard.', String(err && err.message || err));
      }
      if (err.kind === 'token') store('del');
      showLoginError(err);
      $('#login').hidden = false;
      $('#app').hidden = true;
    }).then(function () {
      btn.disabled = false;
      btn.textContent = 'Connect';
    });
  }

  function refresh() {
    var b = $('#refresh');
    b.disabled = true;
    b.textContent = 'Refreshing…';
    $('#banner').hidden = true;
    fetchData(state.token).then(function (json) {
      loadRows(json);
      syncFilterOptions();
      render();
    }).catch(function (err) {
      if (err.kind === 'token') { signOut('The token is no longer valid. Sign in again.'); return; }
      var bn = $('#banner');
      bn.className = 'banner error';
      bn.textContent = (err.kind === 'network' ? 'Could not refresh: ' : 'Refresh failed: ') + err.message + ' Showing the last loaded data.';
      bn.hidden = false;
    }).then(function () {
      b.disabled = false;
      b.textContent = 'Refresh';
    });
  }

  function signOut(msg) {
    store('del');
    state.token = null;
    $('#app').hidden = true;
    $('#login').hidden = false;
    if (msg) showLoginError(new ApiError('token', msg, ''));
    $('#token').focus();
  }

  /* ======================================================================
     Data
     ====================================================================== */
  function loadRows(json) {
    var rows = (json.rows || []).map(function (r) {
      var o = { day: dayOf(String(r.date).slice(0, 10)), campaign: r.campaign || '', adGroup: r.adGroup || '' };
      RAW.forEach(function (k) { o[k] = Number(r[k]) || 0; });
      return o;
    }).filter(function (r) { return isFinite(r.day); });
    state.rows = rows;
    state.debug = json.debug || '';
    if (rows.length) {
      state.dataMin = Math.min.apply(null, rows.map(function (r) { return r.day; }));
      state.dataMax = Math.max.apply(null, rows.map(function (r) { return r.day; }));
    } else {
      state.dataMin = state.dataMax = dayOf(new Date().toISOString().slice(0, 10));
    }
    var t = new Date(json.updatedAt || Date.now());
    $('#updated').textContent = 'Updated ' + t.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function filteredRows() {
    return state.rows.filter(function (r) {
      return (!state.campaign || r.campaign === state.campaign) &&
             (!state.adGroup || r.adGroup === state.adGroup);
    });
  }

  function dayMapOf(rows) {
    var map = {};
    rows.forEach(function (r) {
      var t = map[r.day] || (map[r.day] = zero());
      addInto(t, r);
    });
    return map;
  }
  function sumRange(map, s, e) {
    var t = zero();
    for (var d = s; d <= e; d++) if (map[d]) addInto(t, map[d]);
    return t;
  }

  /* ---------- Ranges ---------- */
  function resolveRange() {
    var max = state.dataMax, min = state.dataMin, p = state.rangePreset;
    switch (p) {
      case 'last7':  return { s: max - 6, e: max };
      case 'last14': return { s: max - 13, e: max };
      case 'last30': return { s: max - 29, e: max };
      case 'last90': return { s: max - 89, e: max };
      case 'thisMonth': return { s: monthStart(max), e: max };
      case 'lastMonth':
        var prev = monthStart(max) - 1;
        return { s: monthStart(prev), e: prev };
      case 'all': return { s: min, e: max };
    }
    var c = state.rangeCustom || { s: max - 29, e: max };
    return c.s <= c.e ? c : { s: c.e, e: c.s };
  }

  function resolveCompare(range) {
    switch (state.cmpMode) {
      case 'wow': return { s: range.s - 7, e: range.e - 7 };
      case 'mom': return { s: addMonths(range.s, -1), e: addMonths(range.e, -1) };
      case 'custom':
        var c = state.cmpCustom;
        if (!c) {
          var len = range.e - range.s;
          c = { s: range.s - len - 1, e: range.s - 1 };
          state.cmpCustom = c;
        }
        return c.s <= c.e ? c : { s: c.e, e: c.s };
    }
    return null;
  }

  /* ======================================================================
     UI wiring
     ====================================================================== */
  var uiReady = false;

  function initUI() {
    if (uiReady) { syncFilterOptions(); syncInputs(); return; }
    uiReady = true;

    buildCards();
    buildChartCards();
    buildBdMetricOptions();
    syncFilterOptions();
    syncInputs();

    $('#fCampaign').addEventListener('change', function (e) {
      state.campaign = e.target.value;
      syncFilterOptions();
      render();
    });
    $('#fAdGroup').addEventListener('change', function (e) { state.adGroup = e.target.value; render(); });

    $('#fRange').addEventListener('change', function (e) {
      state.rangePreset = e.target.value;
      if (state.rangePreset === 'custom' && !state.rangeCustom) {
        var cur = resolveRange();
        state.rangeCustom = { s: cur.s, e: cur.e };
      }
      syncInputs();
      render();
    });
    function bindDate(id, obj, key) {
      $(id).addEventListener('change', function (e) {
        if (!e.target.value) return;
        state[obj] = state[obj] || { s: state.dataMin, e: state.dataMax };
        state[obj][key] = dayOf(e.target.value);
        render();
      });
    }
    bindDate('#rStart', 'rangeCustom', 's');
    bindDate('#rEnd', 'rangeCustom', 'e');
    bindDate('#cStart', 'cmpCustom', 's');
    bindDate('#cEnd', 'cmpCustom', 'e');

    $('#fCompare').addEventListener('change', function (e) {
      state.cmpMode = e.target.value;
      if (state.cmpMode === 'custom') state.cmpCustom = null;
      syncInputs();
      render();
    });

    $('#refresh').addEventListener('click', refresh);
    $('#signout').addEventListener('click', function () { signOut(); });

    $('#bdBy').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      state.bdBy = b.dataset.v;
      renderBreakdown();
    });
    $('#bdMetric').addEventListener('change', function (e) { state.bdMetric = e.target.value; renderBreakdown(); });
  }

  function syncFilterOptions() {
    var camps = uniq(state.rows.map(function (r) { return r.campaign; }));
    if (state.campaign && camps.indexOf(state.campaign) < 0) state.campaign = '';
    fillSelect($('#fCampaign'), camps, 'All campaigns', state.campaign);

    var groups = uniq(state.rows.filter(function (r) { return !state.campaign || r.campaign === state.campaign; })
      .map(function (r) { return r.adGroup; }));
    if (state.adGroup && groups.indexOf(state.adGroup) < 0) state.adGroup = '';
    fillSelect($('#fAdGroup'), groups, 'All ad groups', state.adGroup);
  }
  function uniq(a) {
    return a.filter(function (v, i) { return v && a.indexOf(v) === i; }).sort();
  }
  function fillSelect(sel, items, allLabel, value) {
    sel.innerHTML = '';
    var o = el('option'); o.value = ''; o.textContent = allLabel; sel.appendChild(o);
    items.forEach(function (v) { var x = el('option'); x.value = v; x.textContent = v; sel.appendChild(x); });
    sel.value = value;
  }

  function syncInputs() {
    $('#fRange').value = state.rangePreset;
    $('#fCompare').value = state.cmpMode;
    $('#rangeCustom').hidden = state.rangePreset !== 'custom';
    $('#cmpCustom').hidden = state.cmpMode !== 'custom';
    var r = resolveRange();
    $('#rStart').value = isoOf(r.s);
    $('#rEnd').value = isoOf(r.e);
    var c = resolveCompare(r);
    if (c && state.cmpMode === 'custom') { $('#cStart').value = isoOf(c.s); $('#cEnd').value = isoOf(c.e); }
  }

  /* ======================================================================
     Rendering
     ====================================================================== */
  var ctx = null; // computed once per render

  function render() {
    if (!state.rows.length) {
      var bn = $('#banner');
      bn.className = 'banner';
      bn.textContent = 'The Daily tab returned no rows. ' + (state.debug || '');
      bn.hidden = false;
    }
    var rows = filteredRows();
    var range = resolveRange();
    var cmp = resolveCompare(range);
    ctx = { rows: rows, map: dayMapOf(rows), range: range, cmp: cmp };

    // keep the date inputs showing the resolved range when a preset is used
    $('#rStart').value = isoOf(range.s);
    $('#rEnd').value = isoOf(range.e);
    if (cmp && state.cmpMode === 'custom') { $('#cStart').value = isoOf(cmp.s); $('#cEnd').value = isoOf(cmp.e); }

    var note = fmtSpan(range.s, range.e);
    if (cmp) note += '   compared with   ' + fmtSpan(cmp.s, cmp.e);
    $('#rangeNote').textContent = note;

    var cur = sumRange(ctx.map, range.s, range.e);
    var hasData = RAW.some(function (k) { return cur[k] > 0; });
    var bn2 = $('#banner');
    if (state.rows.length && !hasData) {
      bn2.className = 'banner';
      bn2.textContent = 'No data matches these filters in this date range.';
      bn2.hidden = false;
    } else if (state.rows.length && bn2.className.indexOf('error') < 0) {
      bn2.hidden = true;
    }

    renderCards();
    renderCharts();
    renderBreakdown();
  }

  /* ---------- Scorecards ---------- */
  function buildCards() {
    var wrap = $('#cards');
    wrap.innerHTML = '';
    CARD_ORDER.forEach(function (k) {
      var c = el('div', 'card');
      c.id = 'card-' + k;
      c.innerHTML = '<div class="label">' + esc(M[k].label) + '</div><div class="value"></div><div class="delta" hidden></div><div class="prev" hidden></div>';
      if (M[k].tip) c.title = M[k].tip;
      wrap.appendChild(c);
    });
  }

  function renderCards() {
    var cur = derive(sumRange(ctx.map, ctx.range.s, ctx.range.e));
    var prev = ctx.cmp ? derive(sumRange(ctx.map, ctx.cmp.s, ctx.cmp.e)) : null;

    CARD_ORDER.forEach(function (k) {
      var m = M[k], card = $('#card-' + k);
      var v = $('.value', card), d = $('.delta', card), p = $('.prev', card);
      v.textContent = fmtVal(m.fmt, cur[k]);
      v.title = fmtFull(m.fmt, cur[k]);

      if (!prev) { d.hidden = true; p.hidden = true; return; }

      var dl = delta(m, cur[k], prev[k]);
      d.hidden = false; p.hidden = false;
      p.textContent = 'vs ' + fmtVal(m.fmt, prev[k]);
      p.title = fmtFull(m.fmt, prev[k]);

      if (!dl) { d.className = 'delta'; d.textContent = '–'; return; }
      d.className = 'delta' + (dl.good > 0 ? ' up' : dl.good < 0 ? ' down' : '');
      var arrow = dl.dir > 0 ? '▲' : dl.dir < 0 ? '▼' : '–';
      d.innerHTML = arrow + ' ' + esc(fmtAbsDelta(m.fmt, dl.diff)) +
        (dl.pct != null ? '<span class="pct">' + esc(pctText(dl.pct)) + '</span>' : '');
    });
  }

  /* ---------- Chart cards ---------- */
  var CHARTS = [
    { id: 'ctr', title: 'CTR', series: [{ key: 'ctr', type: 'line', color: COLORS.orange, axis: 'y', fill: true }] },
    { id: 'imp', title: 'Impressions and CPM', series: [
      { key: 'impressions', type: 'line', color: COLORS.orange, axis: 'y' },
      { key: 'cpm', type: 'bar', color: COLORS.blue, axis: 'y1' }] },
    { id: 'clk', title: 'Clicks and Cost/Click', series: [
      { key: 'clicks', type: 'line', color: COLORS.orange, axis: 'y' },
      { key: 'cpc', type: 'bar', color: COLORS.blue, axis: 'y1' }] },
    { id: 'cpb', title: 'Cost per Booking', series: [{ key: 'cpb', type: 'line', color: COLORS.vermilion, axis: 'y', fill: true }] },
    { id: 'bks', title: 'Bookings and Spend', series: [
      { key: 'bookings', type: 'bar', color: COLORS.blue, axis: 'y1' },
      { key: 'cost', type: 'line', color: COLORS.vermilion, axis: 'y' }] },
    { id: 'roas', title: 'ROAS', series: [{ key: 'roas', type: 'line', color: COLORS.vermilion, axis: 'y', fill: true }] }
  ];
  var VIEWS = [['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly'], ['all', 'All time']];

  function buildChartCards() {
    var wrap = $('#charts');
    wrap.innerHTML = '';
    CHARTS.forEach(function (def) {
      state.chartView[def.id] = 'day';
      var card = el('div', 'chart-card');
      card.id = 'cc-' + def.id;
      var head = el('div', 'chart-head');
      head.appendChild(el('h3', null, esc(def.title)));
      var seg = el('div', 'seg');
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', def.title + ' time view');
      VIEWS.forEach(function (v) {
        var b = el('button', null, v[1]);
        b.type = 'button';
        b.dataset.v = v[0];
        b.setAttribute('aria-pressed', v[0] === 'day' ? 'true' : 'false');
        seg.appendChild(b);
      });
      seg.addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        state.chartView[def.id] = b.dataset.v;
        Array.prototype.forEach.call(seg.children, function (x) {
          x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
        });
        drawChart(def);
      });
      head.appendChild(seg);
      card.appendChild(head);
      card.appendChild(el('div', 'legend'));
      var body = el('div', 'chart-body');
      body.appendChild(document.createElement('canvas'));
      card.appendChild(body);
      wrap.appendChild(card);
    });
  }

  function renderCharts() { CHARTS.forEach(drawChart); }

  /** Split [s,e] into day / week / month buckets */
  function makeBuckets(view, s, e) {
    var out = [], d;
    if (view === 'day') {
      for (d = s; d <= e; d++) out.push({ s: d, e: d, short: fmtShort(d), long: fmtLong(d) });
    } else if (view === 'week') {
      for (d = s; d <= e; d += 7) {
        var be = Math.min(d + 6, e);
        out.push({ s: d, e: be, short: fmtShort(d), long: 'Week of ' + fmtSpan(d, be) });
      }
    } else {
      for (d = monthStart(s); d <= e; d = monthEnd(d) + 1) {
        var bs = Math.max(d, s), be2 = Math.min(monthEnd(d), e), p = parts(d);
        out.push({ s: bs, e: be2, short: MON[p.m] + ' ' + p.y, long: MON[p.m] + ' ' + p.y + (bs !== d || be2 !== monthEnd(d) ? ' (' + fmtSpan(bs, be2) + ')' : '') });
      }
    }
    return out;
  }

  function bucketData(buckets) {
    return buckets.map(function (b) { return derive(sumRange(ctx.map, b.s, b.e)); });
  }

  function rgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function tickFmt(fmtType) {
    return function (v) {
      if (fmtType === 'pct') return Math.round(v * 1000) / 10 + '%';
      if (fmtType === 'x') return v + 'x';
      return fmtVal(fmtType, v).replace(/(\.\d*?)0+(?=[KM]?$)/, '$1').replace(/\.(?=[KM]?$)/, '');
    };
  }

  function drawChart(def) {
    var card = $('#cc-' + def.id), canvas = $('canvas', card), body = $('.chart-body', card);
    var legend = $('.legend', card);
    var view = state.chartView[def.id];

    if (state.charts[def.id]) { state.charts[def.id].destroy(); state.charts[def.id] = null; }
    var oldMsg = $('.empty', body); if (oldMsg) oldMsg.remove();

    if (typeof Chart === 'undefined') {
      body.appendChild(el('div', 'empty', 'Charts could not load. Check your connection and refresh the page.'));
      return;
    }

    var range = view === 'all' ? { s: state.dataMin, e: state.dataMax } : ctx.range;
    var cmp = view === 'all' ? null : ctx.cmp;
    var bView = view === 'all' ? 'week' : view;

    var cur = makeBuckets(bView, range.s, range.e);
    var curD = bucketData(cur);
    var prev = null, prevD = null;
    if (cmp) {
      prev = makeBuckets(bView, cmp.s, cmp.e);
      prevD = bucketData(prev);
    }

    // legend
    var lg = '';
    def.series.forEach(function (s) {
      lg += '<span><i class="' + (s.type === 'bar' ? 'bar' : '') + '" style="background:' + s.color + '"></i>' + esc(M[s.key].label) + '</span>';
    });
    if (cmp) lg += '<span><i class="ghost" style="background:' + COLORS.gray + '"></i>Comparison period</span>';
    else if (view === 'all') lg += '<span>All data, date range ignored</span>';
    legend.innerHTML = lg;

    var n = cur.length;
    var showPts = n <= 31;
    var datasets = [];

    def.series.forEach(function (s, i) {
      var m = M[s.key];
      var curVals = curD.map(function (d) { return d[s.key]; });
      var isBar = s.type === 'bar';

      var ds = {
        type: s.type,
        label: m.label,
        data: curVals,
        yAxisID: s.axis,
        order: isBar ? 2 + i : i,
        borderColor: s.color,
        backgroundColor: isBar ? rgba(s.color, 0.9) : (s.fill ? rgba(s.color, 0.1) : s.color),
        borderWidth: isBar ? 0 : 2,
        pointRadius: showPts ? 2 : 0,
        pointHoverRadius: 4,
        pointBackgroundColor: s.color,
        tension: 0.15,
        spanGaps: false,
        fill: !isBar && s.fill ? 'origin' : false,
        _fmt: m.fmt
      };
      if (isBar) { ds.grouped = false; ds.barPercentage = 0.55; ds.categoryPercentage = 0.9; ds.maxBarThickness = 28; }
      datasets.push(ds);

      if (prevD) {
        var pv = [];
        for (var k = 0; k < n; k++) pv.push(prevD[k] ? prevD[k][s.key] : null);
        var g = {
          type: s.type,
          label: m.label + ' (comparison)',
          data: pv,
          yAxisID: s.axis,
          order: 10 + (isBar ? 2 + i : i),
          borderColor: rgba(s.color, 0.4),
          backgroundColor: isBar ? rgba(s.color, 0.22) : rgba(s.color, 0.14),
          borderWidth: isBar ? 0 : 1.5,
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.15,
          spanGaps: false,
          fill: !isBar ? 'origin' : false,
          _fmt: m.fmt,
          _ghost: true
        };
        if (isBar) { g.grouped = false; g.barPercentage = 0.95; g.categoryPercentage = 0.9; g.maxBarThickness = 40; }
        datasets.push(g);
      }
    });

    var axes = {};
    def.series.forEach(function (s) { if (!axes[s.axis]) axes[s.axis] = M[s.key].fmt; });

    var scales = {
      x: {
        grid: { display: false },
        ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 7, color: '#5d6471', font: { size: 11 } },
        border: { color: '#cfd1d6' }
      }
    };
    Object.keys(axes).forEach(function (a) {
      scales[a] = {
        position: a === 'y1' ? 'right' : 'left',
        beginAtZero: true,
        grid: { color: '#d9dade', drawOnChartArea: Object.keys(axes).length === 1 || a === 'y' },
        border: { display: false },
        ticks: { callback: tickFmt(axes[a]), color: '#5d6471', font: { size: 11 }, maxTicksLimit: 5 }
      };
    });
    // Two axes: a single-axis chart with only bars still draws gridlines on the left
    if (axes.y1 && !axes.y) { scales.y1.position = 'left'; scales.y1.grid.drawOnChartArea = true; }

    state.charts[def.id] = new Chart(canvas, {
      data: { labels: cur.map(function (b) { return b.short; }), datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: function (items) { return items.length ? cur[items[0].dataIndex].long : ''; },
              afterTitle: function (items) {
                if (!prev || !items.length) return '';
                var p = prev[items[0].dataIndex];
                return p ? 'Comparison: ' + p.long : 'Comparison: no matching period';
              },
              label: function (c) { return c.dataset.label + ': ' + fmtVal(c.dataset._fmt, c.parsed.y); }
            }
          }
        },
        scales: scales
      }
    });
  }

  /* ---------- Breakdown by campaign / ad group ---------- */
  var BD_COLS = ['cost', 'impressions', 'clicks', 'ctr', 'bookings', 'freeBookings', 'cpb', 'convValue', 'roas'];

  function buildBdMetricOptions() {
    var sel = $('#bdMetric');
    sel.innerHTML = '';
    BD_COLS.concat(['cpm']).forEach(function (k) {
      var o = el('option'); o.value = k; o.textContent = M[k].label; sel.appendChild(o);
    });
    sel.value = state.bdMetric;
  }

  function entityKey(r) {
    if (state.bdBy === 'campaign') return r.campaign;
    if (state.bdBy === 'adGroup') return r.adGroup;
    return r.campaign + ' › ' + r.adGroup;
  }

  function groupTotals(rows, s, e) {
    var g = {};
    rows.forEach(function (r) {
      if (r.day < s || r.day > e) return;
      var k = entityKey(r);
      addInto(g[k] || (g[k] = zero()), r);
    });
    return g;
  }

  function renderBreakdown() {
    Array.prototype.forEach.call($('#bdBy').children, function (b) {
      b.setAttribute('aria-pressed', b.dataset.v === state.bdBy ? 'true' : 'false');
    });
    $('#bdMetric').value = state.bdMetric;

    var rows = ctx.rows;
    var curG = groupTotals(rows, ctx.range.s, ctx.range.e);
    var prevG = ctx.cmp ? groupTotals(rows, ctx.cmp.s, ctx.cmp.e) : null;

    var names = Object.keys(curG);
    if (prevG) Object.keys(prevG).forEach(function (k) { if (names.indexOf(k) < 0) names.push(k); });

    var list = names.map(function (n) {
      return { name: n, cur: derive(curG[n] || zero()), prev: prevG ? derive(prevG[n] || zero()) : null };
    });

    var sk = state.bdSort.key, sd = state.bdSort.dir;
    list.sort(function (a, b) {
      if (sk === 'name') return sd * a.name.localeCompare(b.name);
      var x = a.cur[sk], y = b.cur[sk];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return sd * (x - y);
    });

    /* table */
    var tot = derive(sumRange(ctx.map, ctx.range.s, ctx.range.e));
    var totPrev = ctx.cmp ? derive(sumRange(ctx.map, ctx.cmp.s, ctx.cmp.e)) : null;

    var html = '<thead><tr>';
    var nameLabel = state.bdBy === 'campaign' ? 'Campaign' : state.bdBy === 'adGroup' ? 'Ad group' : 'Campaign › Ad group';
    html += th('name', nameLabel);
    BD_COLS.forEach(function (k) { html += th(k, M[k].label); });
    html += '</tr></thead><tbody>';
    list.forEach(function (it) {
      html += '<tr><td>' + esc(it.name) + '</td>';
      BD_COLS.forEach(function (k) { html += '<td>' + cell(k, it.cur, it.prev) + '</td>'; });
      html += '</tr>';
    });
    html += '</tbody><tfoot><tr><td>Total</td>';
    BD_COLS.forEach(function (k) { html += '<td>' + cell(k, tot, totPrev) + '</td>'; });
    html += '</tr></tfoot>';
    var table = $('#bdTable');
    table.innerHTML = html;
    Array.prototype.forEach.call(table.querySelectorAll('th'), function (h) {
      h.addEventListener('click', function () {
        var key = h.dataset.k;
        state.bdSort = { key: key, dir: state.bdSort.key === key ? -state.bdSort.dir : (key === 'name' ? 1 : -1) };
        renderBreakdown();
      });
    });

    drawBdChart(list);
  }

  function th(k, label) {
    var active = state.bdSort.key === k;
    var arrow = active ? (state.bdSort.dir < 0 ? '▼' : '▲') : '';
    return '<th data-k="' + k + '" aria-sort="' + (active ? (state.bdSort.dir < 0 ? 'descending' : 'ascending') : 'none') + '">' +
      esc(label) + ' <span class="sort">' + arrow + '</span></th>';
  }

  function cell(k, cur, prev) {
    var m = M[k], h = esc(fmtVal(m.fmt, cur[k]));
    if (!prev) return h;
    var dl = delta(m, cur[k], prev[k]);
    var cls = dl ? (dl.good > 0 ? ' up' : dl.good < 0 ? ' down' : '') : '';
    var dtxt = !dl ? '–' : (dl.dir > 0 ? '▲ ' : dl.dir < 0 ? '▼ ' : '') + (dl.pct != null ? pctText(dl.pct) : fmtAbsDelta(m.fmt, dl.diff));
    return h + '<span class="cell-delta' + cls + '">' + esc(dtxt) + '</span><span class="cell-prev">vs ' + esc(fmtVal(m.fmt, prev[k])) + '</span>';
  }

  function drawBdChart(list) {
    var wrap = $('#bdChartWrap');
    var canvas = $('#bdChart');
    if (state.bdChart) { state.bdChart.destroy(); state.bdChart = null; }
    var old = $('.empty', wrap); if (old) old.remove();
    if (typeof Chart === 'undefined') return;

    var k = state.bdMetric, m = M[k];
    var cmpOn = !!ctx.cmp;
    var h = Math.max(160, list.length * (cmpOn ? 62 : 40) + 44);
    wrap.style.height = h + 'px';

    if (!list.length) { wrap.appendChild(el('div', 'empty', 'No campaigns or ad groups match these filters.')); return; }

    var ds = [{
      label: 'Selected period',
      data: list.map(function (x) { return x.cur[k]; }),
      backgroundColor: rgba(COLORS.blue, 0.9),
      barPercentage: 0.8, categoryPercentage: 0.8, maxBarThickness: 22
    }];
    if (cmpOn) ds.push({
      label: 'Comparison period',
      data: list.map(function (x) { return x.prev[k]; }),
      backgroundColor: rgba(COLORS.gray, 0.45),
      barPercentage: 0.8, categoryPercentage: 0.8, maxBarThickness: 22
    });

    state.bdChart = new Chart(canvas, {
      type: 'bar',
      data: { labels: list.map(function (x) { return x.name; }), datasets: ds },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: cmpOn, position: 'top', align: 'end', labels: { boxWidth: 12, boxHeight: 12, color: '#5d6471', font: { size: 12 } } },
          tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ' + fmtVal(m.fmt, c.parsed.x); } } }
        },
        scales: {
          x: { beginAtZero: true, grid: { color: '#d9dade' }, border: { display: false },
               ticks: { callback: tickFmt(m.fmt), color: '#5d6471', font: { size: 11 }, maxTicksLimit: 6 } },
          y: { grid: { display: false }, ticks: { color: '#1d2129', font: { size: 12 } } }
        }
      }
    });
  }

  /* ======================================================================
     Boot
     ====================================================================== */
  function boot() {
    $('#loginForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var t = $('#token').value.trim();
      if (!t) {
        showLoginError(new ApiError('token', 'Enter your access token first.', ''));
        $('#loginErrorTitle').textContent = 'Token needed';
        return;
      }
      connect(t);
    });
    $('#toggleToken').addEventListener('click', function () {
      var i = $('#token'), show = i.type === 'password';
      i.type = show ? 'text' : 'password';
      this.textContent = show ? 'Hide' : 'Show';
      this.setAttribute('aria-pressed', show ? 'true' : 'false');
    });

    var saved = store('get');
    if (saved) connect(saved);
  }

  boot();
})();
