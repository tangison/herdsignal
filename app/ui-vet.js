/* HerdSignal — vet views.
   vetQueue (#/vet)          : live queue of open cases with filters and an
                               outbreak-signal strip.
   vetCase  (#/vet/case/:id) : full case detail, lifecycle actions, suggested
                               vets and the case timeline.

   Plain UI over the frozen domain API (app/API.md). No frameworks, no
   external requests, no module-level caches of store data. */

(function () {
  'use strict';

  if (typeof window === 'undefined') return;

  window.HerdSignalUI = window.HerdSignalUI || {};
  window.HerdSignalUI.views = window.HerdSignalUI.views || {};
  window.HerdSignalUI.views.vetQueue = { title: 'Cases needing attention', render: renderVetQueue };
  window.HerdSignalUI.views.vetCase = { title: 'Case detail', render: renderVetCase };

  /* ---------- pure helpers ---------- */

  function levels() {
    return (window.HerdSignal && window.HerdSignal.URGENCY_LEVELS) ||
      ['emergency', 'urgent', 'routine'];
  }

  function effUrgency(report) {
    var triage = report.triage || {};
    return report.urgencyOverrule ? report.urgencyOverrule.to : triage.level;
  }

  function cap(text) {
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
  }

  function plural(value, word) {
    var n = Number(value) || 0;
    return n + ' ' + word + (n === 1 ? '' : 's');
  }

  function scoreText(score) {
    var n = Number(score);
    if (!isFinite(n)) return '';
    return String(Math.round(n * 10) / 10);
  }

  function countsText(livestock) {
    var c = (livestock && livestock.counts) || {};
    var num = function (v) { return Number(v) || 0; };
    /* 'sick', 'dead' and 'at risk' are adjectival and never take a plural s */
    var parts = [num(c.sick) + ' sick', num(c.dead) + ' dead'];
    if (num(c.atRisk) > 0) parts.push(num(c.atRisk) + ' at risk');
    return parts.join(' · ');
  }

  function durationText(livestock) {
    if (!livestock || !livestock.durationValue) return '';
    var unit = livestock.durationUnit === 'hours' ? 'hour'
      : (livestock.durationUnit === 'weeks' ? 'week' : 'day');
    return 'Sick for ' + plural(livestock.durationValue, unit);
  }

  function placeText(reporter) {
    if (!reporter) return '';
    var village = reporter.village ? reporter.village + ', ' : '';
    return village + (reporter.region || '');
  }

  function errText(err) {
    return (err && err.message) ? err.message : 'Something went wrong. Please try again.';
  }

  function distinct(values) {
    var seen = [];
    (values || []).forEach(function (v) {
      if (v && seen.indexOf(v) === -1) seen.push(v);
    });
    return seen.sort();
  }

  var STATUS_LABELS = {
    open: 'Waiting for a vet',
    responded: 'Vet responded',
    treatment_arranged: 'Treatment arranged',
    resolved: 'Resolved'
  };

  var KIND_LABELS = {
    created: 'Report received',
    takeover: 'Take over',
    guidance: 'Guidance',
    treatment: 'Treatment arranged',
    note: 'Internal note',
    overrule: 'Urgency overruled',
    outcome: 'Outcome'
  };

  var OUTCOME_OPTIONS = ['recovered', 'died', 'euthanised', 'referred'];

  /* ---------- small DOM builders (el comes from ctx) ---------- */

  function emptyPanel(el, title, hint, action) {
    var box = el('div', { class: 'empty v-empty' });
    var glyph = /no vet/i.test(title) ? 'stethoscope'
      : /no (open )?(cases|reports|signals)/i.test(title) ? 'inbox' : null;
    if (glyph) box.appendChild(window.hsIcon(glyph, 'hs-icon--disc'));
    box.appendChild(el('p', { class: 'v-empty-title' }, title));
    if (hint) box.appendChild(el('p', { class: 'muted' }, hint));
    if (action) box.appendChild(action);
    return box;
  }

  function actionLink(el, href, text) {
    return el('a', { class: 'v-btn-link', href: href }, text);
  }

  function badge(el, text, mod) {
    return el('span', { class: 'badge badge--' + mod }, text);
  }

  function urgencyBadge(el, report) {
    return badge(el, cap(effUrgency(report)), effUrgency(report));
  }

  function statusBadge(el, status) {
    return badge(el, STATUS_LABELS[status] || status, 'status-' + status);
  }

  function chipRow(el, chips) {
    var row = el('div', { class: 'v-chips' });
    chips.forEach(function (text) { row.appendChild(el('span', { class: 'chip' }, text)); });
    return row;
  }

  function fieldBlock(el, id, label, control, hint) {
    var wrap = el('div', { class: 'field' });
    wrap.appendChild(el('label', { for: id }, label));
    wrap.appendChild(control);
    if (hint) wrap.appendChild(el('p', { class: 'field__hint' }, hint));
    return wrap;
  }

  function errLine(el) {
    return el('p', { class: 'field__error', hidden: 'hidden' });
  }

  function fail(line, err) {
    line.hidden = false;
    line.textContent = errText(err);
  }

  function selectEl(el, id, options) {
    var s = el('select', { id: id });
    options.forEach(function (opt) {
      s.appendChild(el('option', { value: opt.value }, opt.label));
    });
    return s;
  }

  function fetchSignals(store) {
    try { return store.scanSignals() || []; } catch (err) { return []; }
  }

  function signalForReport(signals, reportId) {
    for (var i = 0; i < signals.length; i++) {
      var s = signals[i];
      if (s && s.reportIds && s.reportIds.indexOf(reportId) !== -1) return s;
    }
    return null;
  }

  function timelineList(el, fmt, report) {
    var list = el('ul', { class: 'timeline' });
    (report.timeline || []).forEach(function (entry) {
      var li = el('li', {});
      var head = el('div', { class: 'v-tl-head' });
      head.appendChild(el('strong', {}, KIND_LABELS[entry.kind] || cap(entry.kind || 'note')));
      head.appendChild(el('span', { class: 'muted' },
        (entry.actor === 'vet' ? 'Vet' : 'Farmer') + ' · ' + fmt.dateTime(entry.at)));
      li.appendChild(head);
      li.appendChild(el('p', { class: 'v-tl-text' }, entry.text || ''));
      list.appendChild(li);
    });
    return list;
  }

  /* ---------- vetQueue ---------- */

  function renderVetQueue(container, ctx) {
    var el = ctx.el;
    var store = ctx.store;
    var fmt = ctx.fmt;

    container.textContent = '';
    var root = el('div', { class: 'v-vet' });
    container.appendChild(root);

    root.appendChild(el('h1', {}, 'Cases needing attention'));
    root.appendChild(el('p', { class: 'muted' },
      'Open reports from farmers, most urgent first. The list updates as new reports arrive.'));

    if (!ctx.state || ctx.state.vetId == null) {
      root.appendChild(emptyPanel(el,
        'No vet is selected.',
        'Pick a vet in the switcher at the top of the page to work the case queue.',
        null));
      return;
    }

    var reports = [];
    try { reports = store.listReports({ status: 'open' }) || []; } catch (err) { reports = []; }
    var signals = fetchSignals(store);

    /* urgency counts over the whole open queue (effective urgency) */
    var counts = {};
    levels().forEach(function (lv) { counts[lv] = 0; });
    reports.forEach(function (r) {
      var lv = effUrgency(r);
      counts[lv] = (counts[lv] || 0) + 1;
    });

    var countsRow = el('div', { class: 'v-vet-counts' });
    levels().forEach(function (lv) {
      countsRow.appendChild(badge(el, cap(lv) + ' · ' + counts[lv], lv));
    });
    countsRow.appendChild(el('span', { class: 'muted v-vet-counts-total' },
      plural(reports.length, 'open case')));
    root.appendChild(countsRow);

    if (signals.length > 0) {
      var strip = el('div', { class: 'v-vet-signals' });
      strip.appendChild(el('strong', {}, plural(signals.length, 'active outbreak signal')));
      var areas = signals.map(function (s) { return (s && s.area) || ''; })
        .filter(function (a) { return a; }).join(' · ');
      if (areas) strip.appendChild(el('p', { class: 'v-vet-signals-areas' }, areas));
      strip.appendChild(actionLink(el, '#/dashboard', 'View on the dashboard'));
      root.appendChild(strip);
    } else {
      root.appendChild(el('p', { class: 'muted v-vet-nosignals' },
        'No outbreak signals right now.'));
    }

    /* filters — client-side over the fetched list */
    var selected = { region: [], species: [], urgency: [] };
    var regionValues = distinct(reports.map(function (r) { return r.reporter && r.reporter.region; }));
    var speciesValues = distinct(reports.map(function (r) { return r.livestock && r.livestock.species; }));

    var filterBox = el('div', { class: 'v-vet-filters' });
    filterBox.appendChild(el('h2', { class: 'v-vet-filters-title' }, 'Filter the queue'));
    var chipButtons = [];

    function chipGroup(title, groupName, values) {
      var group = el('div', {
        class: 'v-vet-filter',
        role: 'group',
        'aria-label': 'Filter by ' + title.toLowerCase()
      });
      group.appendChild(el('h3', { class: 'v-vet-filter-title' }, title));
      var row = el('div', { class: 'v-chips' });
      values.forEach(function (value) {
        var b = el('button', {
          type: 'button',
          class: 'chip',
          'aria-pressed': 'false',
          onClick: function () { toggle(groupName, value); }
        }, cap(value));
        chipButtons.push({ group: groupName, value: value, btn: b });
        row.appendChild(b);
      });
      group.appendChild(row);
      filterBox.appendChild(group);
    }

    function toggle(groupName, value) {
      var list = selected[groupName];
      var i = list.indexOf(value);
      if (i === -1) list.push(value); else list.splice(i, 1);
      syncChips();
      renderList();
    }

    function syncChips() {
      chipButtons.forEach(function (c) {
        var on = selected[c.group].indexOf(c.value) !== -1;
        c.btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        c.btn.className = on ? 'chip chip--on' : 'chip';
      });
    }

    chipGroup('Region', 'region', regionValues);
    chipGroup('Species', 'species', speciesValues);
    chipGroup('Urgency', 'urgency', levels());

    function passes(report) {
      var region = report.reporter && report.reporter.region;
      var species = report.livestock && report.livestock.species;
      if (selected.region.length && selected.region.indexOf(region) === -1) return false;
      if (selected.species.length && selected.species.indexOf(species) === -1) return false;
      if (selected.urgency.length && selected.urgency.indexOf(effUrgency(report)) === -1) return false;
      return true;
    }

    var showing = el('p', { class: 'muted v-vet-showing', hidden: 'hidden' });
    var listEl = el('div', { class: 'v-vet-list' });

    function card(report) {
      var a = el('a', { class: 'card card--pad v-vet-card', href: '#/vet/case/' + report.id });
      var top = el('div', { class: 'v-vet-card-top' });
      top.appendChild(urgencyBadge(el, report));
      top.appendChild(statusBadge(el, report.status));
      if (report.urgencyOverrule) {
        top.appendChild(el('span', { class: 'chip' }, 'Vet overruled'));
      }
      top.appendChild(el('span', { class: 'muted v-vet-card-when' }, fmt.ago(report.createdAt)));
      a.appendChild(top);

      a.appendChild(el('p', { class: 'v-vet-card-species' },
        el('span', { class: 'v-vet-card-avatar', 'aria-hidden': 'true' },
          window.hsSpeciesGlyph((report.livestock && report.livestock.species) || 'unknown')),
        el('span', { class: 'v-vet-card-speciesname' },
          cap((report.livestock && report.livestock.species) || 'unknown'))));
      a.appendChild(el('p', { class: 'v-vet-card-line' }, countsText(report.livestock)));

      var symptoms = (report.livestock && report.livestock.symptoms) || [];
      if (symptoms.length) {
        var shown = symptoms.slice(0, 3);
        if (symptoms.length > 3) {
          var more = el('span', { class: 'muted v-vet-more' },
            '+' + (symptoms.length - 3) + ' more');
          a.appendChild(chipRow(el, shown));
          a.lastChild.appendChild(more);
        } else {
          a.appendChild(chipRow(el, shown));
        }
      }

      var reporter = report.reporter || {};
      a.appendChild(el('p', { class: 'v-vet-card-line v-vet-card-who' },
        (reporter.name || 'Unknown reporter') + ' — ' + (placeText(reporter) || 'location not given')));
      var dur = durationText(report.livestock);
      if (dur) a.appendChild(el('p', { class: 'muted v-vet-card-line' }, dur));
      return a;
    }

    function renderList() {
      listEl.textContent = '';
      var anyFilter = selected.region.length + selected.species.length +
        selected.urgency.length > 0;
      var shownReports = reports.filter(passes);
      showing.hidden = !anyFilter;
      if (anyFilter) {
        showing.textContent = 'Showing ' + shownReports.length + ' of ' +
          reports.length + ' open cases.';
      }
      if (shownReports.length === 0) {
        var clearBtn = el('button', {
          type: 'button',
          class: 'btn btn--ghost',
          onClick: function () {
            selected.region = [];
            selected.species = [];
            selected.urgency = [];
            syncChips();
            renderList();
          }
        }, 'Clear filters');
        listEl.appendChild(emptyPanel(el,
          reports.length === 0 ? 'No open cases right now.' : 'No cases match the selected filters.',
          reports.length === 0
            ? 'New reports appear here as farmers send them.'
            : 'Loosen or clear the filters to see more of the queue.',
          clearBtn));
        return;
      }
      shownReports.forEach(function (r) { listEl.appendChild(card(r)); });
    }

    root.appendChild(filterBox);
    root.appendChild(showing);
    root.appendChild(listEl);
    renderList();

    /* Cases already answered but not resolved drop out of
       the open queue — keep them reachable so an outcome can still be recorded. */
    var handled = [];
    try { handled = store.listReports({}) || []; } catch (err) { handled = []; }
    handled = handled.filter(function (r) {
      return r.status === 'responded' || r.status === 'treatment_arranged';
    });
    if (handled.length) {
      var handledBox = el('div', { class: 'v-vet-handled', style: 'margin-top:24px' });
      handledBox.appendChild(el('h2', {}, 'Answered, not yet resolved'));
      handledBox.appendChild(el('p', { class: 'muted' },
        'Cases with guidance or treatment already arranged. They stay here until an outcome is recorded.'));
      handled.forEach(function (r) { handledBox.appendChild(card(r)); });
      root.appendChild(handledBox);
    }
  }

  /* ---------- vetCase ---------- */

  function renderVetCase(container, ctx) {
    var el = ctx.el;
    var store = ctx.store;
    var fmt = ctx.fmt;
    var vetId = (ctx.state && ctx.state.vetId != null) ? ctx.state.vetId : null;
    var caseId = (ctx.params && ctx.params.id != null) ? String(ctx.params.id) : '';

    var report = null;
    try { report = caseId ? store.getReport(caseId) : null; } catch (err) { report = null; }

    function refresh(message) {
      try { report = caseId ? store.getReport(caseId) : null; } catch (err) { report = null; }
      redraw();
      if (message && typeof ctx.toast === 'function') ctx.toast(message, 'ok');
    }

    function redraw() {
      container.textContent = '';
      if (!report) {
        var bare = el('div', { class: 'v-vet' });
        bare.appendChild(emptyPanel(el,
          'This case is not on record.',
          'It may have a different address. Go back to the queue and pick a case.',
          actionLink(el, '#/vet', 'Back to the case queue')));
        container.appendChild(bare);
        return;
      }
      container.appendChild(caseView());
    }

    function caseView() {
      var root = el('div', { class: 'v-vet' });
      var livestock = report.livestock || {};
      var reporter = report.reporter || {};
      var triage = report.triage || {};

      root.appendChild(el('a', { class: 'v-vet-back', href: '#/vet' }, 'All cases'));
      root.appendChild(el('h1', {},
        'Case: ' + cap(livestock.species || 'unknown') +
        (reporter.village ? ' in ' + reporter.village : '')));

      var headRow = el('div', { class: 'v-vet-card-top' });
      headRow.appendChild(urgencyBadge(el, report));
      headRow.appendChild(statusBadge(el, report.status));
      root.appendChild(headRow);

      var sections = el('div', { class: 'v-vet-sections' });

      /* ----- report card ----- */
      var repCard = el('div', { class: 'card card--pad' });
      repCard.appendChild(el('h2', {}, 'Report'));
      repCard.appendChild(el('p', { class: 'muted v-vet-meta' },
        'Reported ' + fmt.dateTime(report.createdAt) + ' (' + fmt.ago(report.createdAt) + ')'));

      function addDetail(grid, label, value) {
        grid.appendChild(el('div', { class: 'v-vet-detail-item' },
          el('span', { class: 'v-vet-detail-label' }, label),
          el('span', { class: 'v-vet-detail-value' }, value)));
      }

      var repGrid = el('div', { class: 'v-vet-detail' });
      addDetail(repGrid, 'Reported by',
        (reporter.name || 'Unknown') + (reporter.phone ? ' · ' + reporter.phone : ''));
      addDetail(repGrid, 'Location', placeText(reporter) || 'Not given');
      addDetail(repGrid, 'Animals',
        cap(livestock.species || 'unknown') + ' — ' + countsText(livestock));
      var dur = durationText(livestock);
      if (dur) addDetail(repGrid, 'Duration', dur);
      repCard.appendChild(repGrid);

      var symptoms = livestock.symptoms || [];
      if (symptoms.length) {
        repCard.appendChild(chipRow(el, symptoms));
      }
      if (livestock.photoRequested) {
        var photoRow = el('div', { class: 'v-chips' });
        photoRow.appendChild(el('span', { class: 'chip' }, 'Photos offered by the farmer'));
        repCard.appendChild(photoRow);
      }
      if (livestock.description && livestock.description.trim() !== '') {
        repCard.appendChild(el('h3', {}, 'What the farmer saw'));
        repCard.appendChild(el('p', { class: 'v-vet-description' }, livestock.description));
      }

      /* urgency: machine rating stays visible, vet overrule shown next to it */
      var urgBox = el('div', { class: 'v-vet-urgency' });
      urgBox.appendChild(el('h3', {}, 'Urgency'));
      var machineRow = el('div', { class: 'v-vet-card-top' });
      machineRow.appendChild(badge(el, cap(triage.level || 'routine'), triage.level || 'routine'));
      machineRow.appendChild(el('span', { class: 'muted' }, 'Machine rating'));
      if (triage.score != null) {
        machineRow.appendChild(el('span', { class: 'muted v-vet-score' },
          'Triage score ' + scoreText(triage.score)));
      }
      urgBox.appendChild(machineRow);
      var reasons = triage.reasons || [];
      if (reasons.length) {
        var ul = el('ul', { class: 'v-vet-reasons' });
        reasons.forEach(function (r) { ul.appendChild(el('li', {}, r)); });
        urgBox.appendChild(ul);
      }
      if (report.urgencyOverrule) {
        var ov = report.urgencyOverrule;
        var ovRow = el('div', { class: 'v-vet-card-top v-vet-overrule' });
        ovRow.appendChild(badge(el, cap(ov.to), ov.to));
        ovRow.appendChild(el('span', { class: 'muted' },
          'Vet rating — changed from ' + cap(ov.from || triage.level || 'routine') +
          ' · ' + fmt.ago(ov.at)));
        urgBox.appendChild(ovRow);
        urgBox.appendChild(el('p', { class: 'v-vet-overrule-reason' }, 'Reason: ' + ov.reason));
      }
      repCard.appendChild(urgBox);

      if (report.status === 'resolved' && report.outcome) {
        var outBox = el('div', { class: 'v-vet-urgency' });
        outBox.appendChild(el('h3', {}, 'Outcome'));
        var outRow = el('div', { class: 'v-vet-card-top' });
        outRow.appendChild(el('strong', {}, cap(report.outcome.result || 'Closed')));
        outRow.appendChild(el('span', { class: 'muted' },
          'Closed by ' + (report.outcome.actor === 'farmer' ? 'the farmer' : 'the vet') +
          ' · ' + fmt.dateTime(report.outcome.at)));
        outBox.appendChild(outRow);
        if (report.outcome.note) {
          outBox.appendChild(el('p', { class: 'v-vet-overrule-reason' },
            'Note: ' + report.outcome.note));
        }
        repCard.appendChild(outBox);
      }
      sections.appendChild(repCard);

      /* ----- cluster signal touching this case ----- */
      var signal = caseId ? signalForReport(fetchSignals(store), caseId) : null;
      if (signal) sections.appendChild(signalCard(signal));

      /* ----- actions ----- */
      sections.appendChild(actionsCard());

      /* ----- suggested vets ----- */
      sections.appendChild(vetsCard());

      /* ----- timeline ----- */
      var tlCard = el('div', { class: 'card card--pad' });
      tlCard.appendChild(el('h2', {}, 'Timeline'));
      if ((report.timeline || []).length === 0) {
        tlCard.appendChild(el('p', { class: 'muted' }, 'No entries yet.'));
      } else {
        tlCard.appendChild(timelineList(el, fmt, report));
      }
      sections.appendChild(tlCard);

      root.appendChild(sections);
      return root;

      function signalCard(signal) {
        var box = el('div', { class: 'card card--pad v-vet-signal' });
        box.appendChild(el('h2', {}, 'Outbreak signal'));
        box.appendChild(el('p', {},
          'This case is part of a possible outbreak: ' +
          plural((signal.reportIds || []).length, 'report') + ' from ' +
          plural((signal.reporters || []).length, 'reporter') + ' in ' +
          (signal.area || 'an unknown area') + '.'));
        var sym = signal.sharedSymptoms || [];
        if (sym.length) {
          box.appendChild(el('p', { class: 'v-vet-detail-label' }, 'Shared symptoms'));
          box.appendChild(chipRow(el, sym));
        }
        if ((signal.reporters || []).length) {
          box.appendChild(el('p', { class: 'muted' },
            'Reporters: ' + signal.reporters.join(', ') + '.'));
        }
        box.appendChild(el('p', { class: 'muted' },
          'First report ' + fmt.dateTime(signal.firstAt) + ' · latest ' +
          fmt.dateTime(signal.lastAt) + '.'));
        var members = el('ul', { class: 'v-vet-members' });
        (signal.reportIds || []).forEach(function (id) {
          var member = null;
          try { member = store.getReport(id); } catch (err) { member = null; }
          var label = 'Open case';
          if (member && member.livestock) {
            label = cap(member.livestock.species || 'case') +
              (member.reporter && member.reporter.village
                ? ' — ' + member.reporter.village : '');
          }
          if (id === caseId) label += ' (this case)';
          members.appendChild(el('li', {},
            el('a', { href: '#/vet/case/' + id }, label)));
        });
        box.appendChild(members);
        return box;
      }

      function actionsCard() {
        var card = el('div', { class: 'card card--pad' });
        card.appendChild(el('h2', {}, 'Act on this case'));

        if (vetId == null) {
          card.appendChild(emptyPanel(el,
            'No vet is selected.',
            'Pick a vet in the switcher at the top of the page to act on this case.',
            null));
          return card;
        }

        var resolved = report.status === 'resolved';
        if (resolved) {
          card.appendChild(el('p', { class: 'muted' },
            'This case is closed. Only internal notes can still be added.'));
        }

        if (!resolved && report.assignedVet !== vetId) {
          var takeErr = errLine(el);
          var doTake = function () {
            try {
              store.takeCase(caseId, vetId);
              refresh('Case taken over.');
            } catch (err) { fail(takeErr, err); }
          };
          var takeWrap = el('div', { class: 'v-vet-action' });
          if (report.assignedVet) {
            takeWrap.appendChild(el('p', { class: 'field__hint' },
              'Another vet is handling this case. Taking over moves it to you.'));
          }
          takeWrap.appendChild(el('button', {
            type: 'button', class: 'btn btn--primary', onClick: doTake
          }, 'Take over this case'));
          takeWrap.appendChild(takeErr);
          card.appendChild(takeWrap);
        } else if (!resolved && report.assignedVet === vetId) {
          card.appendChild(el('p', { class: 'muted' }, 'You are handling this case.'));
        }

        if (!resolved) {
          var gErr = errLine(el);
          var doGuidance = function () {
            try {
              store.postGuidance(caseId, vetId, gTa.value);
              refresh('Guidance posted.');
            } catch (err) { fail(gErr, err); }
          };
          var gTa = el('textarea', { id: 'v-guidance', rows: '3' });
          var gBox = el('div', { class: 'v-vet-action' });
          gBox.appendChild(fieldBlock(el, 'v-guidance', 'Guidance for the farmer', gTa,
            'The farmer sees this right away. Keep it short and plain.'));
          gBox.appendChild(el('button', {
            type: 'button', class: 'btn btn--primary', onClick: doGuidance
          }, 'Post guidance'));
          gBox.appendChild(gErr);
          card.appendChild(gBox);
        }

        if (!resolved) {
          var tErr = errLine(el);
          var doTreat = function () {
            try {
              store.arrangeTreatment(caseId, vetId, { what: whatIn.value, when: whenIn.value });
              refresh('Treatment recorded.');
            } catch (err) { fail(tErr, err); }
          };
          var whatIn = el('input', { id: 'v-treat-what', type: 'text' });
          var whenIn = el('input', { id: 'v-treat-when', type: 'text' });
          var tBox = el('div', { class: 'v-vet-action' });
          tBox.appendChild(fieldBlock(el, 'v-treat-what', 'Treatment agreed', whatIn,
            'For example: vaccinate the herd and dip the cattle.'));
          tBox.appendChild(fieldBlock(el, 'v-treat-when', 'When it happens', whenIn,
            'For example: Friday 14 June, morning.'));
          tBox.appendChild(el('button', {
            type: 'button', class: 'btn btn--primary', onClick: doTreat
          }, 'Record treatment arranged'));
          tBox.appendChild(tErr);
          card.appendChild(tBox);
        }

        if (!resolved) {
          var ovErr = errLine(el);
          var doOverrule = function () {
            try {
              store.overruleUrgency(caseId, vetId, ovSel.value, ovReason.value);
              refresh('Urgency rating saved.');
            } catch (err) { fail(ovErr, err); }
          };
          var ovSel = selectEl(el, 'v-overrule-level',
            levels().map(function (lv) { return { value: lv, label: cap(lv) }; }));
          ovSel.value = effUrgency(report);
          var ovReason = el('input', { id: 'v-overrule-reason', type: 'text' });
          var ovBox = el('div', { class: 'v-vet-action' });
          ovBox.appendChild(fieldBlock(el, 'v-overrule-level', 'New urgency level', ovSel,
            report.urgencyOverrule
              ? 'This replaces the vet rating shown above. The machine rating stays on record.'
              : 'Use this if the machine rating is wrong. It changes the queue order.'));
          ovBox.appendChild(fieldBlock(el, 'v-overrule-reason',
            'Reason for changing urgency', ovReason));
          ovBox.appendChild(el('button', {
            type: 'button', class: 'btn btn--primary', onClick: doOverrule
          }, 'Save urgency rating'));
          ovBox.appendChild(ovErr);
          card.appendChild(ovBox);
        }

        var noteErr = errLine(el);
        var doNote = function () {
          try {
            store.addInternalNote(caseId, vetId, noteTa.value);
            refresh('Note added.');
          } catch (err) { fail(noteErr, err); }
        };
        var noteTa = el('textarea', { id: 'v-note', rows: '2' });
        var noteBox = el('div', { class: 'v-vet-action' });
        noteBox.appendChild(fieldBlock(el, 'v-note', 'Internal note', noteTa,
          'For vet records only. The farmer does not see this.'));
        noteBox.appendChild(el('button', {
          type: 'button', class: 'btn btn--ghost', onClick: doNote
        }, 'Add note'));
        noteBox.appendChild(noteErr);
        card.appendChild(noteBox);

        if (!resolved) {
          var closeErr = errLine(el);
          var doClose = function () {
            try {
              store.closeCase(caseId, 'vet', outSel.value, outNote.value);
              refresh('Case closed.');
            } catch (err) { fail(closeErr, err); }
          };
          var outSel = selectEl(el, 'v-outcome',
            OUTCOME_OPTIONS.map(function (o) { return { value: o, label: cap(o) }; }));
          var outNote = el('input', { id: 'v-outcome-note', type: 'text' });
          var closeBox = el('div', { class: 'v-vet-action' });
          closeBox.appendChild(fieldBlock(el, 'v-outcome', 'Outcome', outSel));
          closeBox.appendChild(fieldBlock(el, 'v-outcome-note', 'Closing note (optional)', outNote));
          closeBox.appendChild(el('button', {
            type: 'button', class: 'btn', onClick: doClose
          }, 'Close this case'));
          closeBox.appendChild(closeErr);
          card.appendChild(closeBox);
        }

        return card;
      }

      function vetsCard() {
        var card = el('div', { class: 'card card--pad' });
        card.appendChild(el('h2', {}, 'Suggested vets'));
        card.appendChild(el('p', { class: 'muted' },
          'Ranked by distance, specialty fit and current caseload.'));
        var suggestions = [];
        try { suggestions = store.suggestVets(caseId) || []; } catch (err) { suggestions = []; }
        if (!suggestions.length) {
          card.appendChild(emptyPanel(el,
            'No vets on the roster yet.',
            'Once vets are added, ranked suggestions appear here.', null));
          return card;
        }
        var ol = el('ol', { class: 'v-vet-vets' });
        suggestions.forEach(function (entry, i) {
          var vet = (entry && entry.vet) || {};
          var li = el('li', { class: 'v-vet-vet' });
          var head = el('div', { class: 'v-vet-card-top' });
          head.appendChild(el('strong', {}, (i + 1) + '. ' + (vet.name || 'Vet')));
          head.appendChild(el('span', { class: 'muted' },
            fmt.km(entry && entry.distanceKm)));
          if (report.assignedVet && vet.id === report.assignedVet) {
            head.appendChild(el('span', { class: 'chip' }, 'Handling this case'));
          }
          li.appendChild(head);
          var reasons = (entry && entry.reasons) || [];
          if (reasons.length) {
            li.appendChild(el('p', { class: 'muted v-vet-vet-reasons' },
              reasons.join(' · ')));
          }
          ol.appendChild(li);
        });
        card.appendChild(ol);
        return card;
      }
    }

    redraw();
  }
})();
