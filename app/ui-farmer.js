/* HerdSignal — farmer-facing views.
   Registers farmerHome, farmerReport and farmerReports on
   window.HerdSignalUI.views. See app/CONTRACT.md (shell integration) and
   app/API.md (domain calls). Builds all DOM through ctx.el; no innerHTML. */

(function () {
  'use strict';

  window.HerdSignalUI = window.HerdSignalUI || {};
  var views = window.HerdSignalUI.views = window.HerdSignalUI.views || {};

  /* Namibian regions for the report form picker (PRD: real region names). */
  var REGIONS = [
    'Erongo', 'Hardap', 'ǁKaras', 'Khomas', 'Kunene',
    'Kavango East', 'Kavango West', 'Omaheke', 'Omusati',
    'Oshana', 'Oshikoto', 'Ohangwena', 'Otjozondjupa', 'Zambezi'
  ];

  // ---------- tiny helpers ----------

  function D() {
    return window.HerdSignal || {
      SPECIES: [], SYMPTOMS: [], DURATION_UNITS: [], URGENCY_LEVELS: []
    };
  }

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
  function text(v) { return v === undefined || v === null ? '' : String(v); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function intOf(v) {
    var n = parseInt(v, 10);
    return isNaN(n) ? 0 : Math.max(0, n);
  }
  function floatOf(v) {
    var n = parseFloat(v);
    return isNaN(n) || !isFinite(n) ? 0 : n;
  }

  /* Wrapper around ctx.el that skips null/false children and flattens
     one level of arrays, so conditional children stay readable. */
  function makeH(el) {
    function flat(arr, out) {
      for (var i = 0; i < arr.length; i++) {
        var c = arr[i];
        if (c === null || c === undefined || c === false) continue;
        if (Array.isArray(c)) { flat(c, out); continue; }
        out.push(c);
      }
      return out;
    }
    return function (tag, attrs) {
      var rest = flat(Array.prototype.slice.call(arguments, 2), []);
      return el.apply(null, [tag, attrs].concat(rest));
    };
  }

  function effectiveLevel(report) {
    if (report && report.urgencyOverrule && report.urgencyOverrule.to) {
      return report.urgencyOverrule.to;
    }
    return report && report.triage && report.triage.level
      ? report.triage.level
      : 'routine';
  }

  function statusLabel(status) {
    return {
      open: 'Waiting for a vet',
      responded: 'Vet responded',
      treatment_arranged: 'Treatment arranged',
      resolved: 'Resolved'
    }[status] || text(status);
  }

  function outcomeLabel(result) {
    return {
      recovered: 'Recovered', died: 'Died',
      euthanised: 'Euthanised', referred: 'Referred'
    }[result] || text(result);
  }

  function kindLabel(kind) {
    return {
      created: 'Reported', takeover: 'Vet took the case', guidance: 'Guidance',
      treatment: 'Treatment', note: 'Note', overrule: 'Urgency changed',
      outcome: 'Closed'
    }[kind] || text(kind);
  }

  function countsSummary(c) {
    if (!c || typeof c !== 'object') return '';
    var bits = [];
    if (c.sick > 0) bits.push(c.sick + ' sick');
    if (c.dead > 0) bits.push(c.dead + ' dead');
    if (c.atRisk > 0) bits.push(c.atRisk + ' at risk');
    return bits.join(', ');
  }

  function coordsText(rep) {
    if (!rep || !isNum(rep.lat) || !isNum(rep.lng)) return '';
    return 'Map point ' + rep.lat.toFixed(3) + ', ' + rep.lng.toFixed(3);
  }

  function personaOf(ctx) {
    return (ctx.state && ctx.state.farmerPersona) || {};
  }

  // ---------- farmerHome ----------

  function renderFarmerHome(container, ctx) {
    var el = ctx.el;
    var h = makeH(el);
    var persona = personaOf(ctx);
    var name = text(persona.name);
    var phone = text(persona.phone);
    var where = [text(persona.village), text(persona.region)]
      .filter(Boolean).join(', ');

    var root = el('div', { class: 'v-farmer' });

    var personaBits = [];
    if (name) personaBits.push(name);
    if (phone) personaBits.push(phone);
    if (where) personaBits.push(where);

    if (window.HS_HERO) {
      root.appendChild(el('figure', { class: 'v-farmer__photofigure' },
        el('img', {
          class: 'v-farmer__photoimg',
          src: window.HS_HERO,
          alt: 'Cattle herd grazing near a waterhole in northern Namibia'
        }),
        el('figcaption', { class: 'v-farmer__photocaption muted' },
          'Cattle at a waterhole, northern Namibia — demonstration photograph.')));
    }

    root.appendChild(h('section', { class: 'card card--pad v-farmer__hero' },
      h('h1', { class: 'v-farmer__title' },
        name ? 'Hello, ' + name : 'Welcome to HerdSignal'),
      h('p', { class: 'v-farmer__lead' },
        'Seen a sick animal? Send one short report. A vet near you is told ' +
        'at once, and you get first-aid steps to follow while you wait.'),
      el('button', {
        class: 'btn btn--primary v-farmer__cta', type: 'button',
        onClick: function () { ctx.go('/farmer/report'); }
      }, 'Report a sick animal'),
      el('button', {
        class: 'btn btn--ghost v-farmer__secondary', type: 'button',
        onClick: function () { ctx.go('/farmer/reports'); }
      }, 'My reports'),
      personaBits.length
        ? h('p', { class: 'muted v-farmer__persona' },
            'You are reporting as ' + personaBits.join(' · ') + '.')
        : null,
      h('p', { class: 'muted v-farmer__lochint' },
        window.hsIcon('pin'),
        where
          ? ' Home area ' + where + '. Share your exact location in the form ' +
            'to help a vet find the farm.'
          : ' Pick your region and village in the form, or share your exact ' +
            'location, so a vet can find you.')
    ));

    /* A gentle nudge when cases are still open (only when we can filter). */
    if (phone) {
      var open = [];
      try {
        open = (ctx.store.listReports({ reporterPhone: phone }) || [])
          .filter(function (r) { return r && r.status !== 'resolved'; });
      } catch (e) { open = []; }
      if (open.length) {
        root.appendChild(h('section', { class: 'card card--pad' },
          h('p', { class: 'v-farmer__openline' },
            'You have ' + open.length + ' open case' +
            (open.length === 1 ? '' : 's') + ' with a vet right now.'),
          el('button', {
            class: 'btn btn--ghost btn--sm', type: 'button',
            onClick: function () { ctx.go('/farmer/reports'); }
          }, 'Check my reports')));
      }
    }

    root.appendChild(h('section', { class: 'card card--pad' },
      h('h2', { class: 'v-farmer__h2' }, 'How it works'),
      h('ol', { class: 'v-farmer__steps' },
        h('li', { class: 'v-farmer__step' },
          h('span', { class: 'v-farmer__stepnum', 'aria-label': 'Step 1' },
            window.hsIcon('clipboard')),
          h('span', { class: 'v-farmer__steptext' },
            h('strong', {}, 'Report.'),
            ' The animal, how many, the signs you see, where you are — ' +
            'under two minutes.')),
        h('li', { class: 'v-farmer__step' },
          h('span', { class: 'v-farmer__stepnum', 'aria-label': 'Step 2' },
            window.hsIcon('pulse')),
          h('span', { class: 'v-farmer__steptext' },
            h('strong', {}, 'Triage.'),
            ' HerdSignal rates the urgency and shows what to do while ' +
            'you wait for a vet.')),
        h('li', { class: 'v-farmer__step' },
          h('span', { class: 'v-farmer__stepnum', 'aria-label': 'Step 3' },
            window.hsIcon('stethoscope')),
          h('span', { class: 'v-farmer__steptext' },
            h('strong', {}, 'A vet responds.'),
            ' Guidance or treatment arranged. Follow it all under ' +
            'My reports.')))));

    container.appendChild(root);
  }

  // ---------- farmerReport ----------

  function renderFarmerReport(container, ctx) {
    var el = ctx.el;
    var h = makeH(el);
    var store = ctx.store;
    var persona = personaOf(ctx);
    var dom = D();
    var root = el('div', { class: 'v-farmer' });

    root.appendChild(h('header', { class: 'v-farmer__pagehead' },
      h('h1', { class: 'v-farmer__title' }, 'Report a sick animal')));

    /* Draft restore (drafts only — case data always comes from the store).
       Stale or malformed drafts fall back to persona defaults field by field. */
    var draft = null;
    try { draft = ctx.draft.load('report'); } catch (e) { draft = null; }
    if (!draft || typeof draft !== 'object') draft = {};

    function fromDraft(key, fallback) {
      var v = draft[key];
      return v === undefined || v === null ? fallback : v;
    }
    function numFromDraft(key, fallback) {
      return isNum(draft[key]) ? draft[key] : fallback;
    }

    var draftSpecies = fromDraft('species', '');
    if (dom.SPECIES.indexOf(draftSpecies) === -1) draftSpecies = '';
    var draftUnit = fromDraft('durationUnit', 'days');
    if (dom.DURATION_UNITS.indexOf(draftUnit) === -1) draftUnit = 'days';

    var model = {
      name: text(fromDraft('name', persona.name)),
      phone: text(fromDraft('phone', persona.phone)),
      region: text(fromDraft('region', persona.region)),
      village: text(fromDraft('village', persona.village)),
      lat: null,
      lng: null,
      species: draftSpecies,
      sick: Math.max(0, Math.floor(numFromDraft('sick', 0))),
      dead: Math.max(0, Math.floor(numFromDraft('dead', 0))),
      atRisk: Math.max(0, Math.floor(numFromDraft('atRisk', 0))),
      symptoms: (Array.isArray(draft.symptoms) ? draft.symptoms : [])
        .filter(function (s) { return dom.SYMPTOMS.indexOf(s) !== -1; }),
      description: text(fromDraft('description', '')),
      durationValue: numFromDraft('durationValue', 1) > 0
        ? numFromDraft('durationValue', 1) : 1,
      durationUnit: draftUnit,
      photoRequested: draft.photoRequested === true
    };
    if (isNum(draft.lat) && isNum(draft.lng)) {
      model.lat = draft.lat; model.lng = draft.lng;
    } else if (isNum(persona.lat) && isNum(persona.lng)) {
      model.lat = persona.lat; model.lng = persona.lng;
    }

    // ---- validation-error plumbing (err.field -> slot next to the field) ----

    var errSlots = {};
    var errControls = {};

    function errorSlot(key) {
      var s = el('p', { class: 'field__error', hidden: true });
      errSlots[key] = s;
      return s;
    }

    function fieldWrap(key, labelTxt, control, hint) {
      var id = 'fr-' + key.replace('.', '-');
      control.setAttribute('id', id);
      errControls[key] = control;
      return h('div', { class: 'field' },
        el('label', { for: id }, labelTxt),
        control,
        hint ? el('p', { class: 'field__hint' }, hint) : null,
        errorSlot(key));
    }

    function clearErrors() {
      Object.keys(errSlots).forEach(function (k) {
        errSlots[k].hidden = true;
        errSlots[k].textContent = '';
      });
      Object.keys(errControls).forEach(function (k) {
        errControls[k].removeAttribute('aria-invalid');
      });
    }

    function setFieldError(key, message) {
      if (!errSlots[key]) key = 'general';
      errSlots[key].textContent = message;
      errSlots[key].hidden = false;
      if (errControls[key]) errControls[key].setAttribute('aria-invalid', 'true');
    }

    function firstErrorControl() {
      var order = ['name', 'phone', 'region', 'species', 'counts.sick',
        'counts.dead', 'counts.atRisk', 'counts', 'symptoms',
        'durationValue', 'durationUnit'];
      for (var i = 0; i < order.length; i++) {
        var s = errSlots[order[i]];
        if (s && !s.hidden && errControls[order[i]]) return errControls[order[i]];
      }
      return null;
    }

    function mapField(f) {
      var m = {
        'reporter.name': 'name',
        'reporter.phone': 'phone',
        'reporter.region': 'region',
        'livestock.species': 'species',
        'livestock.counts': 'counts',
        'livestock.counts.sick': 'counts.sick',
        'livestock.counts.dead': 'counts.dead',
        'livestock.counts.atRisk': 'counts.atRisk',
        'livestock.symptoms': 'symptoms',
        'livestock.durationValue': 'durationValue',
        'livestock.durationUnit': 'durationUnit'
      };
      return (f && m[f]) ? m[f] : 'general';
    }

    // ---- controls (values set as properties; labels bound in fieldWrap) ----

    var nameInput = el('input', { type: 'text', autocomplete: 'name' });
    var phoneInput = el('input', { type: 'tel', autocomplete: 'tel' });
    var regionSelect = el('select', {});
    var villageInput = el('input', { type: 'text' });
    var speciesSelect = el('select', {});
    var sickInput = el('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric' });
    var deadInput = el('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric' });
    var atRiskInput = el('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric' });
    var descInput = el('textarea', { rows: '3' });
    var durationInput = el('input', { type: 'number', min: '1', step: '1', inputmode: 'numeric' });
    var unitSelect = el('select', {});
    var photoInput = el('input', { type: 'checkbox' });

    nameInput.value = model.name;
    phoneInput.value = model.phone;
    villageInput.value = model.village;
    descInput.value = model.description;
    sickInput.value = String(model.sick);
    deadInput.value = String(model.dead);
    atRiskInput.value = String(model.atRisk);
    durationInput.value = String(model.durationValue);
    photoInput.checked = model.photoRequested;

    regionSelect.appendChild(el('option', { value: '' }, 'Choose your region'));
    var regionList = REGIONS.slice();
    if (model.region && regionList.indexOf(model.region) === -1) {
      regionList.push(model.region);
    }
    regionList.forEach(function (rg) {
      regionSelect.appendChild(el('option', { value: rg }, rg));
    });
    regionSelect.value = model.region;

    speciesSelect.appendChild(el('option', { value: '' }, 'Choose the animal type'));
    dom.SPECIES.forEach(function (sp) {
      speciesSelect.appendChild(el('option', { value: sp }, cap(sp)));
    });
    speciesSelect.value = model.species;

    dom.DURATION_UNITS.forEach(function (u) {
      unitSelect.appendChild(el('option', { value: u }, u));
    });
    unitSelect.value = model.durationUnit;

    // ---- draft persistence on every change ----

    function collect() {
      return {
        name: nameInput.value,
        phone: phoneInput.value,
        region: regionSelect.value,
        village: villageInput.value,
        lat: model.lat,
        lng: model.lng,
        species: speciesSelect.value,
        sick: intOf(sickInput.value),
        dead: intOf(deadInput.value),
        atRisk: intOf(atRiskInput.value),
        symptoms: model.symptoms.slice(),
        description: descInput.value,
        durationValue: floatOf(durationInput.value),
        durationUnit: unitSelect.value,
        photoRequested: photoInput.checked
      };
    }

    function saveDraft() {
      try { ctx.draft.save('report', collect()); }
      catch (e) { /* storage unavailable; the form still works this session */ }
    }

    [nameInput, phoneInput, villageInput, descInput,
      sickInput, deadInput, atRiskInput, durationInput
    ].forEach(function (inp) { inp.addEventListener('input', saveDraft); });
    [regionSelect, speciesSelect, unitSelect].forEach(function (s) {
      s.addEventListener('change', saveDraft);
    });
    photoInput.addEventListener('change', saveDraft);

    // ---- optional device location (never blocks submission) ----

    var locNote = el('p', { class: 'v-farmer__locnote muted', 'aria-live': 'polite' });

    function refreshLocNote() {
      if (isNum(model.lat) && isNum(model.lng)) {
        locNote.textContent = 'Location saved (' + model.lat.toFixed(3) + ', ' +
          model.lng.toFixed(3) + '). A vet can use it to find the farm.';
      } else {
        locNote.textContent = 'No exact location saved yet. Region and village ' +
          'are enough — sharing a map point is optional.';
      }
    }
    refreshLocNote();

    function requestLocation() {
      var geo = (typeof navigator !== 'undefined') ? navigator.geolocation : null;
      if (!geo || typeof geo.getCurrentPosition !== 'function') {
        locNote.textContent = 'This device cannot share a location. No problem — ' +
          'region and village tell the vet enough to start.';
        return;
      }
      locNote.textContent = 'Asking the device for your location...';
      geo.getCurrentPosition(function (pos) {
        var la = pos && pos.coords ? pos.coords.latitude : null;
        var ln = pos && pos.coords ? pos.coords.longitude : null;
        if (isNum(la) && isNum(ln)) {
          model.lat = la;
          model.lng = ln;
          refreshLocNote();
          saveDraft();
        } else {
          locNote.textContent = 'The device gave no usable location. No problem — ' +
            'region and village tell the vet enough to start.';
        }
      }, function () {
        locNote.textContent = 'Location was not shared. No problem — region and ' +
          'village tell the vet enough to start.';
      }, { timeout: 10000, maximumAge: 60000, enableHighAccuracy: false });
    }

    var locBtn = el('button', {
      class: 'btn btn--ghost btn--sm', type: 'button',
      onClick: function () { requestLocation(); }
    }, 'Share my location');

    // ---- symptom chips (multi-select, aria-pressed) ----

    function chip(sym) {
      var on = model.symptoms.indexOf(sym) !== -1;
      var b = el('button', {
        class: on ? 'chip chip--on' : 'chip',
        type: 'button',
        'aria-pressed': on ? 'true' : 'false',
        onClick: function () {
          var i = model.symptoms.indexOf(sym);
          if (i === -1) model.symptoms.push(sym); else model.symptoms.splice(i, 1);
          var nowOn = model.symptoms.indexOf(sym) !== -1;
          b.className = nowOn ? 'chip chip--on' : 'chip';
          b.setAttribute('aria-pressed', nowOn ? 'true' : 'false');
          saveDraft();
        }
      }, cap(sym));
      return b;
    }

    var chipsWrap = el('div', { class: 'v-farmer__chips' });
    dom.SYMPTOMS.forEach(function (s) { chipsWrap.appendChild(chip(s)); });

    // ---- assemble the form ----

    var countsErr = errorSlot('counts');
    var symptomsErr = errorSlot('symptoms');
    var generalErr = errorSlot('general');

    var submitBtn = el('button', { class: 'btn btn--primary', type: 'submit' }, 'Send report');

    unitSelect.setAttribute('id', 'fr-durationUnit');
    photoInput.setAttribute('id', 'fr-photo');

    var form = h('form', {
      class: 'v-farmer__form', novalidate: true,
      onSubmit: function (ev) { ev.preventDefault(); submit(); }
    },
      h('fieldset', { class: 'v-farmer__group' },
        h('legend', { class: 'v-farmer__legend' }, 'About you'),
        h('div', { class: 'v-farmer__stack' },
          fieldWrap('name', 'Your name', nameInput),
          fieldWrap('phone', 'Phone number', phoneInput,
            'The vet uses this number to call you back.'),
          fieldWrap('region', 'Region', regionSelect),
          fieldWrap('village', 'Village or area', villageInput,
            'For example: Oshakati, Okatana.')),
        h('div', { class: 'v-farmer__locrow' }, locBtn, locNote)),

      h('fieldset', { class: 'v-farmer__group' },
        h('legend', { class: 'v-farmer__legend' }, 'The animals'),
        h('div', { class: 'v-farmer__stack' },
          fieldWrap('species', 'Animal type', speciesSelect),
          h('div', {},
            h('div', { class: 'v-farmer__counts' },
              fieldWrap('counts.sick', 'How many are sick?', sickInput),
              fieldWrap('counts.dead', 'How many have died?', deadInput),
              fieldWrap('counts.atRisk', 'How many are at risk?', atRiskInput)),
            countsErr,
            h('p', { class: 'field__hint' },
              'Fill in at least one box. A guess is better than nothing.')))),

      h('fieldset', { class: 'v-farmer__group' },
        h('legend', { class: 'v-farmer__legend' }, 'What do you see?'),
        h('p', { class: 'field__hint v-farmer__grouphint' },
          'Pick all the signs you see. Skip any that do not fit.'),
        chipsWrap,
        symptomsErr,
        fieldWrap('description', 'Describe it in your own words (optional)', descInput,
          'Anything the list missed: colour, smell, how they move, what happened first.')),

      h('fieldset', { class: 'v-farmer__group' },
        h('legend', { class: 'v-farmer__legend' }, 'How long, and photos'),
        h('div', { class: 'v-farmer__duration' },
          fieldWrap('durationValue', 'Going on for how long?', durationInput,
            'A number bigger than 0.'),
          h('div', { class: 'field' },
            h('label', { for: 'fr-durationUnit' }, 'Unit'),
            unitSelect)),
        h('div', { class: 'field v-farmer__photo' },
          h('label', { for: 'fr-photo' }, photoInput,
            h('span', {}, 'I can send photos of the animal when the vet asks')),
          h('p', { class: 'field__hint' },
            'Photos are not uploaded here. The vet will tell you where to send them.'))),

      h('div', { class: 'v-farmer__submit' },
        generalErr,
        submitBtn,
        h('p', { class: 'muted v-farmer__submithint' },
          'No account needed. The vet calls you back on the number above.'))
    );

    root.appendChild(form);

    // ---- submit: client checks first, then the domain, then feedback ----

    function submit() {
      clearErrors();

      var sick = intOf(sickInput.value);
      var dead = intOf(deadInput.value);
      var atRisk = intOf(atRiskInput.value);
      var dv = floatOf(durationInput.value);

      if (sick + dead + atRisk <= 0) {
        setFieldError('counts',
          'Fill in at least one box: how many animals are sick, dead or at risk?');
      }
      if (!(dv > 0)) {
        setFieldError('durationValue',
          'Say how long this has been going on — a number bigger than 0.');
      }
      if (model.symptoms.length === 0 && descInput.value.trim() === '') {
        setFieldError('symptoms',
          'Pick at least one sign, or write a few words about what you see.');
      }

      var ctrl = firstErrorControl();
      if (ctrl) { ctrl.focus(); return; }

      var input = {
        reporter: {
          name: nameInput.value.trim(),
          phone: phoneInput.value.trim(),
          region: regionSelect.value.trim()
        },
        livestock: {
          species: speciesSelect.value,
          counts: { sick: sick, dead: dead, atRisk: atRisk },
          symptoms: model.symptoms.slice(),
          description: descInput.value.trim(),
          durationValue: dv,
          durationUnit: unitSelect.value,
          photoRequested: photoInput.checked
        }
      };
      if (villageInput.value.trim() !== '') {
        input.reporter.village = villageInput.value.trim();
      }
      if (isNum(model.lat) && isNum(model.lng)) {
        input.reporter.lat = model.lat;
        input.reporter.lng = model.lng;
      }

      var report = null;
      var err = null;
      try { report = store.addReport(input); }
      catch (e) { err = e; }

      if (err) {
        setFieldError(mapField(err && err.field),
          (err && err.message) ||
          'Something in the form did not fit. Check it and try again.');
        var c2 = firstErrorControl();
        if (c2) c2.focus();
        return;
      }

      try { ctx.draft.clear('report'); } catch (e2) { /* keep going */ }
      drawResult(report);
    }

    // ---- triage feedback screen ----

    function drawResult(report) {
      var level = effectiveLevel(report);
      var tri = (report && report.triage) || {};
      var live = (report && report.livestock) || {};
      var counts = countsSummary(live.counts);
      var over = report && report.urgencyOverrule;

      function list(items) {
        return h('ul', { class: 'v-farmer__list' },
          (items || []).map(function (s) { return el('li', {}, text(s)); }));
      }

      root.textContent = '';
      root.appendChild(h('section', { class: 'card card--pad v-farmer__result' },
        h('h1', { class: 'v-farmer__title' }, 'Your report is in.'),
        h('p', { class: 'v-farmer__okline' },
          'You can close this page now. The report is saved and vets can see ' +
          'it right away.'),
        h('p', { class: 'muted' },
          (live.species ? cap(live.species) : 'Animal') +
          (counts ? ' — ' + counts : '') + '.'),
        h('h3', { class: 'v-farmer__h3' }, 'How urgent is it?'),
        h('p', { class: 'v-farmer__badgerow' },
          el('span', { class: 'badge badge--' + level }, cap(level)),
          h('span', { class: 'muted v-farmer__score' },
            'Urgency score: ' + (isNum(tri.score) ? Math.round(tri.score * 10) / 10 : 'not available'))),
        over
          ? h('p', { class: 'muted' },
              'A vet rated it ' + cap(over.to) + ' instead of ' +
              cap(over.from) + '. Reason: ' + text(over.reason))
          : null,
        h('h3', { class: 'v-farmer__h3' }, 'Why this rating'),
        list(tri.reasons),
        h('h3', { class: 'v-farmer__h3' }, 'Do this while you wait'),
        list(tri.guidance),
        h('div', { class: 'v-farmer__submit' },
          el('button', {
            class: 'btn btn--primary', type: 'button',
            onClick: function () { ctx.go('/farmer/reports'); }
          }, 'My reports'),
          el('button', {
            class: 'btn btn--ghost', type: 'button',
            onClick: function () { ctx.go('/farmer/report'); }
          }, 'Report another animal')),
        live.photoRequested
          ? h('p', { class: 'muted v-farmer__lochint' },
              'You offered to send photos. The vet may ask for them — keep ' +
              'your phone close.')
          : null));
    }

    container.appendChild(root);
  }

  // ---------- farmerReports ----------

  function renderFarmerReports(container, ctx) {
    var el = ctx.el;
    var h = makeH(el);
    var store = ctx.store;
    var fmt = ctx.fmt;
    var persona = personaOf(ctx);
    var openId = null; /* which case card is expanded (render-local state) */

    var root = el('div', { class: 'v-farmer' });
    container.appendChild(root);

    function entriesOf(r, kind) {
      return ((r && r.timeline) || []).filter(function (t) {
        return t && t.kind === kind;
      });
    }

    function vetName(id) {
      if (!id) return '';
      try {
        var vets = store.listVets() || [];
        for (var i = 0; i < vets.length; i++) {
          if (vets[i] && vets[i].id === id) return text(vets[i].name);
        }
      } catch (e) { /* roster unavailable; caller shows a generic line */ }
      return '';
    }

    function fact(k, v) {
      if (v === null || v === undefined || v === '') return null;
      return h('div', { class: 'v-farmer__fact' },
        h('dt', {}, k), h('dd', {}, v));
    }

    function closeCase(r, outcome) {
      var msg = outcome === 'recovered'
        ? 'Mark this case as recovered? The vet will see that the animals recovered.'
        : 'Mark this case as died? The vet will see that the animals died.';
      if (!window.confirm(msg)) return;
      var err = null;
      try { store.closeCase(r.id, 'farmer', outcome); }
      catch (e) { err = e; }
      if (err) {
        ctx.toast((err && err.message) || 'That did not work. Please try again.', 'error');
      } else {
        ctx.toast('Thank you. The case is now marked resolved.', 'ok');
      }
      draw(); // fresh copy from the store; openId stays on this case
    }

    function draw() {
      root.textContent = '';

      var reports = null;
      var loadErr = null;
      if (persona.phone) {
        try { reports = store.listReports({ reporterPhone: persona.phone }) || []; }
        catch (e) { loadErr = true; reports = null; }
      }

      root.appendChild(h('header', { class: 'v-farmer__pagehead' },
        h('h1', { class: 'v-farmer__title' }, 'My reports'),
        persona.phone
          ? h('p', { class: 'muted' },
              'For ' + (persona.name ? persona.name + ' · ' : '') +
              persona.phone + '. Most urgent cases first.')
          : h('p', { class: 'muted' }, 'No farmer is selected yet.')));

      if (!persona.phone) {
        root.appendChild(h('div', { class: 'empty' },
          h('p', {}, 'No farmer is selected, so there is no case list to show. ' +
            'Use the role switcher in the header to pick a farmer.'),
          el('button', {
            class: 'btn btn--primary', type: 'button',
            onClick: function () { ctx.go('/farmer/report'); }
          }, 'Report a sick animal')));
        return;
      }

      if (loadErr) {
        root.appendChild(h('div', { class: 'empty' },
          h('p', {}, 'Your reports could not be loaded right now. Nothing is ' +
            'lost — please try again.'),
          el('button', {
            class: 'btn', type: 'button', onClick: function () { draw(); }
          }, 'Try again')));
        return;
      }

      if (!reports.length) {
        root.appendChild(h('div', { class: 'empty' },
          h('p', {}, 'No reports yet. When you report a sick animal it shows ' +
            'up here, with the vet\u2019s answer next to it.'),
          el('button', {
            class: 'btn btn--primary', type: 'button',
            onClick: function () { ctx.go('/farmer/report'); }
          }, 'Report a sick animal')));
        return;
      }

      var list = h('div', { class: 'v-farmer__cases' });
      reports.forEach(function (r) {
        if (r && r.id) list.appendChild(caseCard(r));
      });
      root.appendChild(list);
    }

    function caseCard(r) {
      var live = r.livestock || {};
      var rep = r.reporter || {};
      var level = effectiveLevel(r);
      var where = [text(rep.village), text(rep.region)].filter(Boolean).join(', ');
      var symptoms = live.symptoms || [];
      var isOpen = openId === r.id;
      var counts = countsSummary(live.counts);

      var btn = el('button', {
        class: 'v-farmer__casebtn', type: 'button',
        'aria-expanded': isOpen ? 'true' : 'false',
        'aria-controls': 'vfd-' + r.id,
        onClick: function () {
          openId = isOpen ? null : r.id;
          draw();
        }
      },
        h('span', { class: 'v-farmer__casetop' },
          h('span', { class: 'v-farmer__casespecies' },
            cap(live.species || 'Animal') + (counts ? ' — ' + counts : '')),
          h('span', { class: 'v-farmer__badges' },
            el('span', { class: 'badge badge--' + level }, cap(level)),
            el('span', { class: 'badge badge--status-' + r.status },
              statusLabel(r.status)))),
        h('span', { class: 'v-farmer__casemeta muted' },
          (where ? where + ' · ' : '') + fmt.ago(r.createdAt)),
        symptoms.length
          ? h('span', { class: 'v-farmer__casesyms' },
              symptoms.slice(0, 3).map(function (s) {
                return el('span', { class: 'chip chip--on' }, cap(s));
              }),
              symptoms.length > 3
                ? el('span', { class: 'v-farmer__morecount' },
                    '+' + (symptoms.length - 3) + ' more')
                : null)
          : null);

      var card = h('article', { class: 'card card--pad v-farmer__case' }, btn);
      if (isOpen) {
        var det = detail(r);
        det.setAttribute('id', 'vfd-' + r.id);
        card.appendChild(det);
      }
      return card;
    }

    function detail(r) {
      var live = r.livestock || {};
      var rep = r.reporter || {};
      var tri = r.triage || {};
      var over = r.urgencyOverrule;
      var level = effectiveLevel(r);
      var vn = vetName(r.assignedVet);
      var where = [text(rep.village), text(rep.region)].filter(Boolean).join(', ');
      var coords = coordsText(rep);
      var symptoms = live.symptoms || [];
      var guidance = entriesOf(r, 'guidance');
      var treatment = entriesOf(r, 'treatment');
      /* Internal vet notes stay private to vets (PRD story 24). */
      var tl = (r.timeline || []).filter(function (t) {
        return t && t.kind !== 'note';
      });

      var box = el('div', { class: 'v-farmer__detail' });

      box.appendChild(h('dl', { class: 'v-farmer__facts' },
        fact('Animal', cap(live.species || '') +
          (countsSummary(live.counts) ? ' — ' + countsSummary(live.counts) : '')),
        fact('Going on for', live.durationValue
          ? live.durationValue + ' ' + live.durationUnit : ''),
        fact('Reported', r.createdAt ? fmt.dateTime(r.createdAt) : ''),
        fact('Where', (where ? where + '. ' : '') + coords),
        fact('Reported by',
          text(rep.name) + (rep.phone ? ' · ' + rep.phone : '')),
        vn ? fact('Vet on the case', vn)
          : (r.assignedVet ? fact('Vet on the case', 'A vet has taken the case.') : null),
        live.description ? fact('In your words', text(live.description)) : null,
        live.photoRequested ? fact('Photos', 'You offered to send photos when the vet asks.') : null));

      if (symptoms.length) {
        box.appendChild(h('div', {},
          h('h3', { class: 'v-farmer__subhead' }, 'Signs you picked'),
          h('div', { class: 'v-farmer__casesyms' },
            symptoms.map(function (s) {
              return el('span', { class: 'chip chip--on' }, cap(s));
            }))));
      }

      box.appendChild(h('section', {},
        h('h3', { class: 'v-farmer__subhead' }, 'How urgent'),
        h('p', { class: 'v-farmer__badgerow' },
          el('span', { class: 'badge badge--' + level }, cap(level)),
          h('span', { class: 'muted v-farmer__score' },
            'Platform score: ' + (isNum(tri.score) ? Math.round(tri.score * 10) / 10 : 'not available'))),
        over
          ? h('p', { class: 'muted' },
              'A vet changed the urgency from ' + cap(over.from) + ' to ' +
              cap(over.to) + '. Reason: ' + text(over.reason) +
              '. The platform first rated it ' + cap(tri.level) + '.')
          : null,
        h('h4', { class: 'v-farmer__subsubhead' }, 'Why this rating'),
        h('ul', { class: 'v-farmer__list' },
          (tri.reasons || []).map(function (s) { return el('li', {}, text(s)); }))));

      if (guidance.length) {
        box.appendChild(h('section', {},
          h('h3', { class: 'v-farmer__subhead' }, 'Guidance from your vet'),
          h('ul', { class: 'v-farmer__list' },
            guidance.map(function (t) {
              return el('li', {},
                h('div', { class: 'v-farmer__tlmeta muted' },
                  t.at ? fmt.ago(t.at) : ''),
                h('div', {}, text(t.text)));
            }))));
      }

      if (treatment.length) {
        box.appendChild(h('section', {},
          h('h3', { class: 'v-farmer__subhead' }, 'Treatment arranged'),
          h('ul', { class: 'v-farmer__list' },
            treatment.map(function (t) {
              return el('li', {},
                h('div', { class: 'v-farmer__tlmeta muted' },
                  t.at ? fmt.ago(t.at) : ''),
                h('div', {}, text(t.text)));
            }))));
      }

      if (r.status === 'resolved' && r.outcome) {
        box.appendChild(h('section', {},
          h('h3', { class: 'v-farmer__subhead' }, 'Case closed'),
          h('p', {},
            'Outcome: ' + outcomeLabel(r.outcome.result) + '. ' +
            (r.outcome.actor === 'farmer'
              ? 'You confirmed this.'
              : 'The vet recorded this.') +
            (r.outcome.note ? ' Note: ' + text(r.outcome.note) : ''))));
      } else if (r.status === 'responded' || r.status === 'treatment_arranged') {
        box.appendChild(h('section', {},
          h('h3', { class: 'v-farmer__subhead' }, 'How did it end?'),
          h('p', { class: 'muted' },
            'When you know the outcome, close the case. This keeps the vet ' +
            'queue clean and the record true.'),
          h('div', { class: 'v-farmer__outcomebtns' },
            el('button', {
              class: 'btn', type: 'button',
              onClick: function () { closeCase(r, 'recovered'); }
            }, 'They recovered'),
            el('button', {
              class: 'btn btn--danger', type: 'button',
              onClick: function () { closeCase(r, 'died'); }
            }, 'They died'))));
      }

      if (tl.length) {
        box.appendChild(h('section', {},
          h('h3', { class: 'v-farmer__subhead' }, 'Timeline'),
          h('ol', { class: 'timeline' },
            tl.map(function (t) {
              return el('li', {},
                h('div', { class: 'v-farmer__tlmeta muted' },
                  kindLabel(t.kind) + (t.at ? ' · ' + fmt.ago(t.at) : '')),
                h('div', {}, text(t.text)));
            }))));
      }

      return box;
    }

    draw();
  }

  // ---------- registration ----------

  views.farmerHome = { title: 'HerdSignal', render: renderFarmerHome };
  views.farmerReport = { title: 'Report a sick animal', render: renderFarmerReport };
  views.farmerReports = { title: 'My reports', render: renderFarmerReports };
}());
