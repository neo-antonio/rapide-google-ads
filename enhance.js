/* Loads after Chart.js and before app.js: smooth charts, animation, polished tooltips, count-up cards */
(function () {
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (window.Chart) {
    var D = Chart.defaults;
    D.font.family = 'Inter, system-ui, sans-serif';
    D.font.size = 12;
    D.color = '#737373';
    D.borderColor = '#eeeeee';
    D.maintainAspectRatio = false;
    // adjust, never replace: replacing defaults.animation breaks Chart.js internals
    D.animation.duration = reduce ? 0 : 1000;
    D.animation.easing = 'easeOutQuart';
    D.interaction = { mode: 'index', intersect: false };

    // smooth, overshoot-free curves
    D.elements.line.cubicInterpolationMode = 'monotone';
    D.elements.line.tension = 0.4;
    D.elements.line.borderWidth = 2.5;
    D.elements.line.borderCapStyle = 'round';
    D.elements.line.borderJoinStyle = 'round';
    D.elements.point.radius = 0;
    D.elements.point.hoverRadius = 5;
    D.elements.point.hitRadius = 14;
    D.elements.point.borderWidth = 2;
    D.elements.point.hoverBorderWidth = 2;
    D.elements.bar.borderRadius = 6;
    D.elements.bar.borderSkipped = false;

    var t = D.plugins.tooltip;
    t.backgroundColor = '#171717';
    t.titleColor = '#fff';
    t.bodyColor = '#e5e5e5';
    t.padding = 12;
    t.cornerRadius = 10;
    t.boxPadding = 5;
    t.usePointStyle = true;
    t.caretSize = 0;
    t.displayColors = true;
    t.titleFont = { weight: '600', size: 12 };
    D.plugins.legend.labels.usePointStyle = true;
    D.plugins.legend.labels.boxWidth = 8;
  }

  // count-up on scorecard values
  var cards = document.getElementById('cards');
  if (!cards || reduce || !window.MutationObserver) return;

  function countUp(el) {
    var txt = el.textContent, m = txt.match(/\d[\d,]*\.?\d*/);
    if (!m) return;
    var raw = m[0], end = parseFloat(raw.replace(/,/g, ''));
    if (!isFinite(end) || end === 0) return;
    var dec = (raw.split('.')[1] || '').length, comma = raw.indexOf(',') > -1;
    var pre = txt.slice(0, m.index), post = txt.slice(m.index + raw.length);
    function fmt(v) {
      var s = v.toFixed(dec);
      if (comma) { var p = s.split('.'); s = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (p[1] ? '.' + p[1] : ''); }
      return pre + s + post;
    }
    var start = performance.now(), dur = 900;
    (function tick(now) {
      var k = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - k, 4);
      el.textContent = k < 1 ? fmt(end * e) : txt;
      if (k < 1) requestAnimationFrame(tick);
    })(start);
  }

  new MutationObserver(function () {
    cards.querySelectorAll('.value').forEach(countUp);
  }).observe(cards, { childList: true });
})();
