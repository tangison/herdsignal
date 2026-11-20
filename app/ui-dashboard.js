/* HerdSignal — authority dashboard.
   dashboard (#/dashboard): headline stats, open-case breakdowns by region and
   species, and the active outbreak signals with their member reports.

   Plain UI over the frozen domain API (app/API.md). No frameworks, no chart
   libraries, no external requests, no module-level caches of store data. */

(function () {
  'use strict';

  if (typeof window === 'undefined') return;

  window.HerdSignalUI = window.HerdSignalUI || {};
  window.HerdSignalUI.views = window.HerdSignalUI.views || {};
  window.HerdSignalUI.views.dashboard = { title: 'Authority dashboard', render: renderDashboard };

  /* ---------- pure helpers ---------- */

  function cap(text) {
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
  }

  function plural(value, word) {
    var n = Number(value) || 0;
    return n + ' ' + word + (n === 1 ? '' : 's');
  }

  function entries(map) {
    return Object.keys(map || {}).map(function (k) {
      return { label: k, value: Number(map[k]) || 0 };
    }).sort(function (a, b) {
      return b.value - a.value || (a.label < b.label ? -1 : 1);
    });
  }

  /* ---------- small DOM builders (el comes from ctx) ---------- */

  function emptyPanel(el, title, hint) {
    var box = el('div', { class: 'empty v-empty' });
    box.appendChild(el('p', { class: 'v-empty-title' }, title));
    if (hint) box.appendChild(el('p', { class: 'muted' }, hint));
    return box;
  }

  function statCard(el, num, label, numClass) {
    var card = el('div', { class: 'stat-card' });
    card.appendChild(el('div', {
      class: 'stat-num' + (numClass ? ' ' + numClass : '')
    }, String(num)));
    card.appendChild(el('div', { class: 'stat-label' }, label));
    return card;
  }

  function barRow(el, entry, max, speciesIcon) {
    var row = el('div', { class: 'bar-row' });
    row.appendChild(el('span', { class: 'v-dash-bar-label' },
      speciesIcon ? window.hsSpeciesGlyph(entry.label) : null,
      cap(entry.label)));
    var track = el('span', { class: 'bar-track' });
    var pct = Math.round((entry.value / max) * 100);
    track.appendChild(el('span', {
      class: 'bar-fill',
      style: 'width:' + pct + '%',
      'aria-hidden': 'true'
    }));
    row.appendChild(track);
    row.appendChild(el('span', { class: 'v-dash-bar-value' }, String(entry.value)));
    return row;
  }

  function barGroup(el, map, emptyText, speciesIcons) {
    var wrap = el('div', { class: 'v-dash-bars' });
    var list = entries(map);
    if (!list.length) {
      wrap.appendChild(el('p', { class: 'muted' }, emptyText));
      return wrap;
    }
    var max = 0;
    list.forEach(function (en) { if (en.value > max) max = en.value; });
    if (max <= 0) max = 1;
    list.forEach(function (en) { wrap.appendChild(barRow(el, en, max, speciesIcons)); });
    return wrap;
  }

  function section(el, title, content) {
    var sec = el('section', { class: 'v-dash-section' });
    sec.appendChild(el('h2', {}, title));
    var card = el('div', { class: 'card card--pad' });
    card.appendChild(content);
    sec.appendChild(card);
    return sec;
  }

  function signalCard(el, store, fmt, signal) {
    var card = el('div', { class: 'card card--pad v-dash-signal' });

    var head = el('div', { class: 'v-dash-signal-head' });
    head.appendChild(window.hsIcon('alert', 'hs-icon--signal'));
    head.appendChild(el('h3', {}, 'Possible outbreak — ' + (signal.area || 'unknown area')));
    head.appendChild(el('span', { class: 'chip' },
      plural((signal.reportIds || []).length, 'report')));
    card.appendChild(head);

    card.appendChild(el('p', { class: 'muted' },
      'First report ' + fmt.dateTime(signal.firstAt) + ' · latest ' +
      fmt.dateTime(signal.lastAt) + '.'));

    var reporters = signal.reporters || [];
    if (reporters.length) {
      card.appendChild(el('p', {}, 'Reporters: ' + reporters.join(', ') + '.'));
    }

    var sym = signal.sharedSymptoms || [];
    if (sym.length) {
      var row = el('div', { class: 'v-chips' });
      sym.forEach(function (s) { row.appendChild(el('span', { class: 'chip' }, s)); });
      card.appendChild(row);
    }

    var list = el('ul', { class: 'v-dash-members' });
    (signal.reportIds || []).forEach(function (id) {
      var rep = null;
      try { rep = store.getReport(id); } catch (err) { rep = null; }
      var label = 'case';
      if (rep && rep.livestock) {
        label = cap(rep.livestock.species || 'case') +
          (rep.reporter && rep.reporter.village ? ' — ' + rep.reporter.village : '');
      }
      list.appendChild(el('li', {},
        el('a', { class: 'v-dash-case-link', href: '#/vet/case/' + id },
          'Open case: ' + label)));
    });
    card.appendChild(list);
    return card;
  }

  /* ---------- dashboard ---------- */

  function renderDashboard(container, ctx) {
    var el = ctx.el;
    var store = ctx.store;
    var fmt = ctx.fmt;

    container.textContent = '';
    var root = el('div', { class: 'v-dashboard' });
    container.appendChild(root);

    root.appendChild(el('h1', {}, 'Authority dashboard'));
    root.appendChild(el('p', { class: 'muted' },
      'Live overview of open cases, response times and outbreak signals across the regions.'));

    var stats = null;
    try { stats = store.stats(); } catch (err) { stats = null; }

    if (!stats) {
      root.appendChild(emptyPanel(el,
        'The overview is not available right now.',
        'Please try again in a moment.'));
      return;
    }

    /* headline numbers — all from store.stats(), nothing hardcoded */
    var obu = stats.openByUrgency || {};
    var openTotal = (obu.emergency || 0) + (obu.urgent || 0) + (obu.routine || 0);

    var grid = el('div', { class: 'stat-grid' });
    grid.appendChild(statCard(el, openTotal, 'Open cases in total', ''));
    grid.appendChild(statCard(el, obu.emergency || 0, 'Open — emergency', 'v-dash-num--emergency'));
    grid.appendChild(statCard(el, obu.urgent || 0, 'Open — urgent', ''));
    grid.appendChild(statCard(el, obu.routine || 0, 'Open — routine', ''));
    grid.appendChild(statCard(el, stats.weekCount || 0, 'Reports this week', ''));
    grid.appendChild(statCard(el, stats.medianResponseMins || 0,
      'Median response time (min)', ''));
    grid.appendChild(statCard(el, Math.round((stats.resolutionRate || 0) * 100) + '%',
      'Resolution rate', ''));
    root.appendChild(grid);

    /* breakdowns of open cases */
    root.appendChild(section(el, 'Open cases by region',
      barGroup(el, stats.byRegion, 'No open cases yet.')));
    root.appendChild(section(el, 'Open cases by species',
      barGroup(el, stats.bySpecies, 'No open cases yet.', true)));

    /* active outbreak signals */
    var signals = [];
    try { signals = store.scanSignals() || []; } catch (err) { signals = []; }

    var sigSec = el('section', { class: 'v-dash-section' });
    sigSec.appendChild(el('h2', {}, 'Active outbreak signals'));
    if (!signals.length) {
      var sigEmpty = el('div', { class: 'card card--pad' });
      sigEmpty.appendChild(emptyPanel(el,
        'No outbreak signals right now.',
        'When three or more farmers in one area report similar signs within a week, the signal appears here.'));
      sigSec.appendChild(sigEmpty);
    } else {
      var wrap = el('div', { class: 'v-dash-signals' });
      signals.forEach(function (s) {
        if (s) wrap.appendChild(signalCard(el, store, fmt, s));
      });
      sigSec.appendChild(wrap);
    }
    root.appendChild(sigSec);
  }
})();
