/* HerdSignal shell.
   Bootstraps the domain store over localStorage, seeds demo data on first run,
   routes hash URLs to the view modules, owns the header (role/persona
   switcher), toasts, cross-tab sync and the "How it works" explainer.
   View modules register themselves on window.HerdSignalUI.views. */

(function () {
  'use strict';

  var DATA_KEY = 'herdsignal.data.v1';
  var SESSION_KEY = 'herdsignal.session.v1';
  var UID_KEY = 'herdsignal.uid.v1';

  window.HerdSignalUI = window.HerdSignalUI || {};
  var views = (window.HerdSignalUI.views = window.HerdSignalUI.views || {});

  /* ---------- injected dependencies for the store ---------- */

  function localStorageAdapter() {
    return {
      read: function () {
        try {
          var raw = window.localStorage.getItem(DATA_KEY);
          return raw ? JSON.parse(raw) : null;
        } catch (err) {
          return null;
        }
      },
      write: function (state) {
        window.localStorage.setItem(DATA_KEY, JSON.stringify(state));
      }
    };
  }

  /* Collision-free across reloads AND store rebuilds: a persistent random
     install prefix plus a counter kept in localStorage (prefix:count). */
  function makeUid() {
    return function () {
      var raw = '';
      try { raw = window.localStorage.getItem(UID_KEY) || ''; } catch (err) { /* ignore */ }
      var parts = raw.split(':');
      var prefix = parts[0] || 'u' + Math.random().toString(36).slice(2, 10);
      var n = Number(parts[1] || 0) + 1;
      try { window.localStorage.setItem(UID_KEY, prefix + ':' + n); } catch (err) { /* ignore */ }
      return prefix + '-' + n;
    };
  }

  /* Clock the shell controls while seeding so records get staggered,
     plausible timestamps; then it goes live. */
  function makeClock() {
    var frozen = null;
    return {
      now: function () {
        return frozen === null ? Date.now() : frozen;
      },
      freeze: function (ts) {
        frozen = ts;
      },
      advance: function (ms) {
        frozen = (frozen === null ? Date.now() : frozen) + ms;
      },
      live: function () {
        frozen = null;
      }
    };
  }

  /* ---------- bootstrap ---------- */

  var clock = makeClock();

  /* The store hydrates from storage only at construction, so cross-tab
     updates rebuild it from storage before re-rendering (storage handler). */
  function buildStore() {
    return window.HerdSignal.createStore({
      storage: localStorageAdapter(),
      now: function () { return clock.now(); },
      uid: makeUid()
    });
  }

  var store = buildStore();

  var bootRaw = localStorageAdapter().read();
  /* createStore persists its empty state at construction, so a fresh browser
     has state already — and the domain serializes collections as maps keyed
     by id, so test emptiness shape-agnostically. Seeding a completely empty
     store also makes Reset demo work. */
  function storedCount(value) {
    if (!value) return 0;
    return Array.isArray(value) ? value.length : Object.keys(value).length;
  }
  var emptyStore = !bootRaw ||
    (storedCount(bootRaw.reports) === 0 && storedCount(bootRaw.vets) === 0);
  if (emptyStore) {
    window.HerdSignalSeed.run(store, clock);
    clock.live();
  }

  /* ---------- demo session (role + personas) ---------- */

  function loadSession() {
    try {
      var raw = window.localStorage.getItem(SESSION_KEY);
      if (raw) return JSON.parse(raw);
    } catch (err) { /* fall through to defaults */ }
    return { role: 'farmer', personaIdx: 0, vetId: null };
  }

  var session = loadSession();
  var vetRoster = store.listVets();
  if (!session.vetId && vetRoster.length) session.vetId = vetRoster[0].id;

  function saveSession() {
    try { window.localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (err) { /* storage may be unavailable */ }
  }

  function currentPersona() {
    var list = window.HerdSignalSeed.PERSONAS;
    var p = list[session.personaIdx] || list[0];
    return {
      name: p.name, phone: p.phone, region: p.region, village: p.village, lat: p.lat, lng: p.lng
    };
  }

  /* ---------- shared helpers handed to views ---------- */

  function el(tag, attrs) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (key) {
      var val = attrs[key];
      if (val === null || val === undefined || val === false) return;
      if (key === 'class') node.className = val;
      else if (key.slice(0, 2) === 'on' && typeof val === 'function') node.addEventListener(key.slice(2).toLowerCase(), val);
      else if (key === 'checked' || key === 'disabled' || key === 'selected' || key === 'value') node[key] = val;
      else node.setAttribute(key, val === true ? '' : String(val));
    });
    for (var i = 2; i < arguments.length; i++) appendChild(node, arguments[i]);
    return node;
  }

  function appendChild(node, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { appendChild(node, c); }); return; }
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }

  var fmt = {
    dateTime: function (ts) {
      if (!ts) return '—';
      return new Date(ts).toLocaleString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    },
    ago: function (ts) {
      if (!ts) return '—';
      var mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
      if (mins < 1) return 'just now';
      if (mins < 60) return mins + ' min ago';
      var hours = Math.round(mins / 60);
      if (hours < 24) return hours + ' h ago';
      var days = Math.round(hours / 24);
      return days + ' d ago';
    },
    km: function (km) {
      if (km === null || km === undefined) return 'distance unknown';
      if (km < 1) return 'under 1 km';
      return Math.round(km) + ' km';
    }
  };

  var draft = {
    save: function (key, value) {
      try { window.localStorage.setItem('herdsignal.draft.' + key, JSON.stringify(value)); } catch (err) { /* ignore */ }
    },
    load: function (key) {
      try {
        var raw = window.localStorage.getItem('herdsignal.draft.' + key);
        return raw ? JSON.parse(raw) : null;
      } catch (err) { return null; }
    },
    clear: function (key) {
      try { window.localStorage.removeItem('herdsignal.draft.' + key); } catch (err) { /* ignore */ }
    }
  };

  function toast(message, kind) {
    var host = document.getElementById('toaster');
    if (!host) return;
    var node = el('div', { class: 'toast' + (kind ? ' toast--' + kind : ''), role: 'status' }, message);
    host.appendChild(node);
    window.setTimeout(function () { node.remove(); }, 3800);
  }

  /* ---------- routing ---------- */

  var ROUTES = [
    { match: /^farmer$/, view: 'farmerHome', role: 'farmer' },
    { match: /^farmer\/report$/, view: 'farmerReport', role: 'farmer' },
    { match: /^farmer\/reports$/, view: 'farmerReports', role: 'farmer' },
    { match: /^vet$/, view: 'vetQueue', role: 'vet' },
    { match: /^vet\/case\/([^/]+)$/, view: 'vetCase', role: 'vet' },
    { match: /^dashboard$/, view: 'dashboard', role: null },
    { match: /^about$/, view: 'about', role: null }
  ];

  var ROLE_HOME = { farmer: '/farmer', vet: '/vet', authority: '/dashboard' };

  function go(path) {
    if (path.charAt(0) !== '/') path = '/' + path;
    window.location.hash = '#' + path;
  }

  function currentRoute() {
    var hash = window.location.hash.replace(/^#\/?/, '');
    if (!hash) return null;
    for (var i = 0; i < ROUTES.length; i++) {
      var m = hash.match(ROUTES[i].match);
      if (m) return { route: ROUTES[i], params: { id: m[1] } };
    }
    return { route: null, params: {} };
  }

  function switchRole(role) {
    session.role = role;
    saveSession();
    go(ROLE_HOME[role]);
    render();
  }

  function resetDemo() {
    try {
      [DATA_KEY, SESSION_KEY, UID_KEY].forEach(function (k) { window.localStorage.removeItem(k); });
      Object.keys(window.localStorage).forEach(function (k) {
        if (k.indexOf('herdsignal.draft.') === 0) window.localStorage.removeItem(k);
      });
    } catch (err) { /* ignore */ }
    window.location.reload();
  }

  /* ---------- header ---------- */

  function buildHeader() {
    function roleBtn(role, label) {
      return el('button', {
        class: 'role-switch__btn', type: 'button',
        'aria-pressed': session.role === role ? 'true' : 'false',
        onClick: function () { switchRole(role); }
      }, label);
    }

    var personaPicker = null;
    if (session.role === 'farmer') {
      personaPicker = el('label', { class: 'row', style: 'gap:6px' },
        el('span', { class: 'muted' }, 'Acting as:'),
        el('select', {
          class: 'persona-select', 'aria-label': 'Choose the farmer persona you are acting as',
          onChange: function (e) { session.personaIdx = Number(e.target.value); saveSession(); render(); }
        },
        window.HerdSignalSeed.PERSONAS.map(function (p, i) {
          return el('option', { value: String(i), selected: session.personaIdx === i }, p.name + ' — ' + p.village);
        })));
    } else if (session.role === 'vet') {
      var roster = store.listVets();
      personaPicker = el('label', { class: 'row', style: 'gap:6px' },
        el('span', { class: 'muted' }, 'Acting as:'),
        el('select', {
          class: 'persona-select', 'aria-label': 'Choose the veterinarian you are acting as',
          onChange: function (e) { session.vetId = e.target.value; saveSession(); render(); }
        },
        roster.map(function (v) {
          return el('option', { value: v.id, selected: session.vetId === v.id }, v.name + ' — ' + v.region);
        })));
    }

    return el('header', { class: 'app-header' },
      el('div', { class: 'app-header__inner' },
        el('a', { class: 'brand', href: '#' + ROLE_HOME[session.role] },
          el('span', { class: 'brand__mark', 'aria-hidden': 'true' }, window.hsIcon('pulse')),
          el('span', { class: 'brand__text' },
            el('span', { class: 'brand__name' }, 'HerdSignal'),
            el('span', { class: 'brand__tag' }, 'Livestock care, connected — Namibia'))),
        el('nav', { class: 'role-switch', 'aria-label': 'Choose your role' },
          roleBtn('farmer', 'Farmer'),
          roleBtn('vet', 'Vet'),
          roleBtn('authority', 'Authority')),
        personaPicker,
        el('a', { class: 'btn btn--ghost btn--sm', href: '#/about' }, 'How it works'),
        el('button', { class: 'btn btn--sm', type: 'button', onClick: resetDemo }, 'Reset demo')));
  }

  function buildFooter() {
    return el('footer', { class: 'app-footer' },
      el('p', null, 'HerdSignal demonstration build. All data stays in this browser (no server, no accounts). ',
        el('a', { href: '#/about' }, 'How it works'), '. ',
        'Guidance shown here is generic first aid, not veterinary advice.'));
  }

  function roleGuardPanel(view) {
    return el('section', { class: 'card card--pad', 'aria-labelledby': 'guard-title' },
      el('h2', { id: 'guard-title' }, 'This screen belongs to the ' + (view.role === 'vet' ? 'veterinary team' : 'farmer') + ' view'),
      el('p', { class: 'muted' }, 'Switch role in the header to continue, or explore the dashboard.'),
      el('p', null,
        el('button', {
          class: 'btn btn--primary', type: 'button',
          onClick: function () { switchRole(view.role); }
        }, 'Switch to ' + (view.role === 'vet' ? 'Vet' : 'Farmer')),
        ' ',
        el('a', { class: 'btn', href: '#/dashboard' }, 'Open dashboard')));
  }

  function notFoundPanel() {
    return el('section', { class: 'card card--pad empty' },
      el('span', { class: 'empty__glyph', 'aria-hidden': 'true' }, window.hsIcon('inbox', 'hs-icon--disc')),
      el('p', { class: 'empty__title' }, 'That page does not exist'),
      el('p', null, el('a', { class: 'btn btn--primary', href: '#' + ROLE_HOME[session.role] }, 'Go to my home screen')));
  }

  /* ---------- render loop ---------- */

  var app = document.getElementById('app');

  function render() {
    if (!app) return;
    var found = currentRoute();
    var main = el('main', { class: 'app-main', id: 'main', tabindex: '-1' });

    if (!found || !found.route) {
      main.appendChild(notFoundPanel());
    } else {
      var key = found.route.view;
      var view = views[key];
      if (!view) {
        main.appendChild(notFoundPanel());
      } else if (found.route.role && found.route.role !== session.role) {
        main.appendChild(roleGuardPanel(found.route));
      } else {
        var ctx = {
          store: store,
          params: found.params,
          state: {
            role: session.role,
            farmerPersona: currentPersona(),
            vetId: session.vetId,
            now: Date.now()
          },
          go: go,
          toast: toast,
          el: el,
          fmt: fmt,
          draft: draft
        };
        try {
          view.render(main, ctx);
        } catch (err) {
          main.appendChild(el('section', { class: 'card card--pad' },
            el('h2', null, 'Something went wrong drawing this screen'),
            el('p', { class: 'muted' }, 'Try reloading the page. Nothing was lost.'),
            el('p', { class: 'mono muted' }, String(err && err.message ? err.message : err))));
        }
      }
    }

    app.textContent = '';
    app.appendChild(buildHeader());
    app.appendChild(main);
    app.appendChild(buildFooter());
    main.focus({ preventScroll: true });
  }

  window.addEventListener('hashchange', render);
  window.addEventListener('storage', function (e) {
    if (e.key === DATA_KEY) {
      store = buildStore();
      render();
    }
  });
  document.addEventListener('DOMContentLoaded', function () {
    if (!window.location.hash) {
      window.location.replace('#' + ROLE_HOME[session.role]);
    }
    render();
  });

  /* ---------- authored icon family (geometric SVG, one 1.75 stroke) ---------- */

  var ICONS = {
    cattle: '<path d="M5.5 5C4.2 5.9 3.5 7.3 3.5 9"/><path d="M18.5 5c1.3.9 2 2.3 2 4"/><path d="M8 5.8C8 4.6 9.6 4 12 4s4 .6 4 1.8V12a4 4 0 0 1-8 0Z"/><circle cx="10.3" cy="12.6" r=".5"/><circle cx="13.7" cy="12.6" r=".5"/>',
    goats: '<path d="M6.8 4.2C5.2 4.9 4.2 6.5 4.2 8.4"/><path d="M17.2 4.2c1.6.7 2.6 2.3 2.6 4.2"/><path d="M8.6 5.5c0-1 1.5-1.5 3.4-1.5s3.4.5 3.4 1.5V11a3.4 3.4 0 0 1-6.8 0Z"/><path d="M12 14.5v4.5"/>',
    sheep: '<path d="M7.2 9.6a2.9 2.9 0 0 1 2.3-2.8A3.4 3.4 0 0 1 12 5a3.4 3.4 0 0 1 2.5 1.8 2.9 2.9 0 0 1 2.3 2.8 2.9 2.9 0 0 1-1.6 2.6H8.8a2.9 2.9 0 0 1-1.6-2.6Z"/><path d="M10.3 12.2v2.6M13.7 12.2v2.6"/>',
    poultry: '<path d="M5.5 13.5A6.5 6.5 0 0 1 12 7h1"/><circle cx="15.2" cy="6" r="1.9"/><path d="M17.1 5.4h2.6l-2.1 1.7"/><path d="M5.5 13.5c0 4.2 3.1 6.9 7.5 6.9H19"/>',
    donkeys: '<path d="M9.4 20c-1.6-1.9-2.4-4-2.4-6.2C7 10.6 9.2 8.6 12 8.6s5 2 5 5.2c0 2.2-.8 4.3-2.4 6.2"/><path d="M9.6 8.9 6.8 3.4c2.3-.5 4 .8 4.5 3.1"/><path d="M14.4 8.9l2.8-5.5c-2.3-.5-4 .8-4.5 3.1"/>',
    pigs: '<rect x="4.5" y="7.5" width="15" height="10" rx="5"/><path d="M7.2 7.8 5.6 4.9l3.8 1.4M16.8 7.8l1.6-2.9-3.8 1.4"/><ellipse cx="12" cy="12.5" rx="2.4" ry="1.9"/><circle cx="11.2" cy="12.5" r=".4"/><circle cx="12.8" cy="12.5" r=".4"/>',
    dogs: '<path d="M8.6 15.6c-1.7-1-2.8-3-2.8-5.3l1-6.3 3.6 2.7h3.2L17.2 4l1 6.3c0 2.3-1.1 4.3-2.8 5.3a5.4 5.4 0 0 1-6.8 0Z"/><circle cx="10" cy="10.6" r=".5"/><circle cx="14" cy="10.6" r=".5"/>',
    paw: '<circle cx="7.5" cy="8.5" r="1.6"/><circle cx="16.5" cy="8.5" r="1.6"/><circle cx="5" cy="12.8" r="1.4"/><circle cx="19" cy="12.8" r="1.4"/><path d="M12 10.8c2.9 0 4.8 2.2 4.8 4.6 0 2.1-1.5 3.8-4.8 3.8s-4.8-1.7-4.8-3.8c0-2.4 1.9-4.6 4.8-4.6Z"/>',
    clipboard: '<rect x="5.5" y="5.5" width="13" height="15" rx="2"/><path d="M9 5.5v-1A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5v1"/><path d="M9 10.5h6M9 14h6M9 17.5h3.5"/>',
    stethoscope: '<path d="M5.5 4v4.5a4.5 4.5 0 0 0 9 0V4"/><path d="M5.5 4H7M13 4h1.5"/><path d="M10 13v2.5a4.5 4.5 0 0 0 9 0v-.5"/><circle cx="19" cy="12.5" r="2"/>',
    chart: '<path d="M4 20h16"/><path d="M7.5 20v-6M12 20V9.5M16.5 20v-4"/>',
    pulse: '<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>',
    alert: '<path d="M12 4.5 21 19H3Z"/><path d="M12 10v4"/><circle cx="12" cy="16.5" r=".5"/>',
    check: '<path d="M4.5 12.5 10 18 19.5 7"/>',
    phone: '<path d="M7 3.5h3l1.5 4.5-2 1.5a12.5 12.5 0 0 0 5.5 5.5l1.5-2 4.5 1.5v3a2 2 0 0 1-2.2 2A16.8 16.8 0 0 1 5 5.7 2 2 0 0 1 7 3.5Z"/>',
    pin: '<path d="M12 21s-6.5-5.6-6.5-10.4a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21Z"/><circle cx="12" cy="10.4" r="2.2"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    camera: '<rect x="3.5" y="7" width="17" height="13" rx="2.5"/><path d="M8.5 7 10 4.5h4L15.5 7"/><circle cx="12" cy="13.2" r="3.2"/>',
    inbox: '<path d="M4 13.5 6.5 5h11L20 13.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19Z"/><path d="M4 13.5h4.5a3.5 3.5 0 0 0 7 0H20"/>'
  };

  window.hsIcon = function (name, cls) {
    var span = document.createElement('span');
    span.className = 'hs-icon' + (cls ? ' ' + cls : '');
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' +
      (ICONS[name] || ICONS.pulse) + '</svg>';
    return span;
  };

  window.hsSpeciesGlyph = function (species) {
    var known = ['cattle', 'goats', 'sheep', 'poultry', 'donkeys', 'pigs', 'dogs'];
    var name = known.indexOf((species || '').toLowerCase()) >= 0
      ? species.toLowerCase() : 'paw';
    return window.hsIcon(name, 'hs-icon--inline');
  };

  /* ---------- "How it works" explainer (shell-owned view) ---------- */

  views.about = {
    title: 'How HerdSignal works',
    render: function (container, ctx) {
      var root = el('div', { class: 'prose' });
      container.appendChild(root);
      container = root;

      function section(title) {
        var box = el('section', { class: 'card card--pad', style: 'margin-bottom:16px' });
        box.appendChild(el('h2', null, title));
        container.appendChild(box);
        return box;
      }
      function ul(items) {
        return el('ul', null, items.map(function (t) { return el('li', null, t); }));
      }

      container.appendChild(el('h1', null, 'How HerdSignal works'));

      if (window.HS_HERO2) {
        container.appendChild(el('figure', { class: 'about-photo' },
          el('img', {
            src: window.HS_HERO2,
            alt: 'Cattle drinking at a savanna waterhole in golden evening light'
          }),
          el('figcaption', null,
            'Cattle at a waterhole at dusk — demonstration photograph.')));
      }

      var s1 = section('What this is');
      s1.appendChild(el('p', null, 'HerdSignal connects livestock farmers with veterinary professionals across Namibia. A farmer reports sick animals with symptoms and location; the report is triaged at once and lands in a live queue for vets, who respond with guidance, arrange treatment, and record the outcome. When several farms report similar signs close together in a short time, the platform raises an outbreak signal so problems are caught early.'));
      s1.appendChild(el('p', null, 'This is a demonstration build: everything runs in your browser, and the data never leaves it. Use the role switcher in the header to act as a farmer, a vet, or a veterinary authority — opening a second browser tab lets you role-play both sides of a case.'));

      var s2 = section('How urgency is decided (triage)');
      s2.appendChild(el('p', null, 'Every report gets a score the moment it is submitted. The most severe symptom counts fully, extra symptoms add half their weight, and the score is scaled by how sensitive the species is (poultry and cattle score higher than dogs). Known dangerous pairings — like sudden death in poultry — add a bonus, and so do spread factors: any deaths, many animals affected, or a grave sign that appeared within hours.'));
      s2.appendChild(ul([
        'Score 14 or more → emergency: act now, a vet is alerted at the top of the queue.',
        'Score 8 to 13 → urgent: same-day attention.',
        'Below 8 → routine: the queue still shows it, at the bottom.'
      ]));
      s2.appendChild(el('p', null, 'Each rating comes with the reasons that triggered it, shown to both the farmer and the vet. A vet may overrule the rating; the original machine rating stays visible next to it.'));

      var s3 = section('How vets are suggested (matching)');
      s3.appendChild(el('p', null, 'For every case the platform ranks the veterinary roster: 40% straight-line distance to the farm, 40% specialty fit with the species, 20% how busy the vet already is. The right specialty therefore beats raw closeness. Every suggestion shows its plain-language reasons, like "15 km away" or "treats cattle". The vet always decides — suggestions are never automatic.'));

      var s4 = section('How outbreak signals are raised');
      s4.appendChild(el('p', null, 'Open reports with coordinates are grouped when they sit within 25 km of the group\'s centre and within 7 days of its earliest report. A group becomes a signal when at least 3 different farms (different phone numbers) share at least one symptom. Signals appear on the vet queue and the authority dashboard, list their member reports, and disappear once the cases are resolved.'));

      var s5 = section('What the dashboard counts');
      s5.appendChild(ul([
        'Open cases by urgency — every case not yet resolved, at its effective urgency.',
        'Reports this week — new reports in the last 7 days.',
        'Median response — the middle minutes-from-report-to-first-vet-action across answered cases.',
        'Resolution rate — resolved cases as a share of all reports.'
      ]));

      var s6 = section('Try the full round-trip');
      s6.appendChild(ul([
        'As a Farmer (persona preselected), report a sick animal — watch the triage result appear straight away.',
        'Open a second tab, switch to Vet, and find the new case at the top of the queue.',
        'Take over the case and post guidance — the farmer\'s tab updates on its own.',
        'Switch to Authority to see the case counted on the dashboard, and check the poultry cluster signal raised around Oshakati in the seed data.'
      ]));
      s6.appendChild(el('p', null, 'Reset demo in the header restores the original dataset.'));

      var s7 = section('Limits of this demo');
      s7.appendChild(ul([
        'No accounts, server, or SMS — all data lives in this browser\'s storage and can be wiped with Reset demo.',
        'Photos: the report records that photos are offered; there is no upload in a single-file build.',
        'Guidance strings are generic first aid. This build is not veterinary advice and not a diagnostic tool.',
        'Distances are straight-line; real routes are longer.'
      ]));
    }
  };
})();
