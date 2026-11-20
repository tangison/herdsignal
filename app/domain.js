/* HerdSignal domain core — plain JavaScript, no dependencies, no imports.
 * UMD-style: Node tests require() it; the browser gets window.HerdSignal. */
(function () {
  'use strict';

  // ---- Canonical picklists (the UI renders its picklists from these) ----
  const SPECIES = ['cattle', 'goats', 'sheep', 'poultry', 'donkeys', 'pigs', 'dogs', 'other'];
  const SYMPTOMS = [
    'sudden death',
    'difficulty breathing',
    'diarrhoea',
    'not eating',
    'limping',
    'coughing',
    'lumps or swelling',
    'salivating or drooling',
    'ticks',
    'wounds',
    'abortions',
    'bloat',
    'wobbling or staggering',
    'skin sores',
    'cloudy or red eyes',
    'nose discharge',
  ];
  const URGENCY_LEVELS = ['emergency', 'urgent', 'routine'];
  const DURATION_UNITS = ['hours', 'days', 'weeks'];

  // ---- Triage engine (deterministic, explainable) ----
  // Base seriousness of each symptom on its own, 0 (mild) to 10 (grave).
  const SYMPTOM_WEIGHTS = {
    'sudden death': 9,
    'difficulty breathing': 8,
    'salivating or drooling': 7,
    'abortions': 7,
    'wobbling or staggering': 6,
    'bloat': 6,
    'diarrhoea': 5,
    'lumps or swelling': 5,
    'not eating': 4,
    'coughing': 4,
    'nose discharge': 3,
    'skin sores': 3,
    'cloudy or red eyes': 3,
    'limping': 2,
    'ticks': 1,
    'wounds': 1,
  };
  // How badly each kind of animal is hit by a fast-spreading disease.
  const SPECIES_SENSITIVITY = {
    poultry: 1.4,
    cattle: 1.3,
    goats: 1.2,
    sheep: 1.2,
    pigs: 1.2,
    donkeys: 0.9,
    dogs: 0.8,
    other: 1.0,
  };
  // Known dangerous pairings (species x symptom) that deserve extra weight,
  // e.g. poultry + sudden death is the classic fast-spreading flock killer.
  const COMBO_BONUS = {
    poultry: { 'sudden death': 4 },
    cattle: { 'salivating or drooling': 3, 'lumps or swelling': 2, 'difficulty breathing': 2 },
    goats: { 'abortions': 2 },
    sheep: { 'abortions': 2 },
  };
  // Score cut-offs for the levels.
  const EMERGENCY_SCORE = 14;
  const URGENT_SCORE = 8;

  const SYMPTOM_REASONS = {
    'sudden death': 'Animals dying without any warning is a serious warning sign.',
    'difficulty breathing': 'Trouble breathing can get worse very fast.',
    'salivating or drooling': 'Heavy drooling or salivating is a serious warning sign.',
    'abortions': 'Animals losing their young can point to a disease that spreads.',
    'wobbling or staggering': 'Staggering or wobbling is a serious nervous sign.',
    'bloat': 'A bloated belly can kill an animal within hours.',
    'diarrhoea': 'Diarrhoea can drain an animal fast and spread to others.',
    'lumps or swelling': 'Lumps or swelling can spread from animal to animal.',
    'not eating': 'Animals refusing to eat is a warning sign.',
    'coughing': 'Coughing can pass from animal to animal.',
  };

  const GUIDANCE = {
    emergency: [
      'Separate the sick animals from the healthy ones right now.',
      'Do not move, sell or slaughter any sick or dead animal.',
      'Do not cut open dead animals — keep them for the vet to see.',
      'Give clean water and shade. Do not give home medicines.',
      'Stay by your phone. A vet will call back as soon as possible.',
    ],
    urgent: [
      'Separate the sick animals from the rest where you can.',
      'Give clean water, food and shade.',
      'Do not move or sell animals while they look ill.',
      'Watch the animals and write down any new signs.',
      'If an animal gets worse within hours, treat it as an emergency and call again.',
    ],
    routine: [
      'Keep the animal comfortable: water, food and shade.',
      'Watch the animal over the next days and note any change.',
      'Separate it from the others if it gets worse.',
      'No emergency steps are needed. A vet will guide you further.',
    ],
  };

  function triageReport(livestock) {
    const species = livestock.species;
    const counts = livestock.counts;
    const symptoms = livestock.symptoms.slice();
    const sensitivity = SPECIES_SENSITIVITY[species] || 1;

    const weighted = symptoms
      .map((s) => ({ symptom: s, weight: SYMPTOM_WEIGHTS[s] !== undefined ? SYMPTOM_WEIGHTS[s] : 1 }))
      .sort((a, b) => b.weight - a.weight || (a.symptom < b.symptom ? -1 : 1));
    const primary = weighted.length ? weighted[0].weight : 0;
    const secondarySum = weighted.slice(1).reduce((sum, w) => sum + w.weight, 0);

    let score = (primary + 0.5 * secondarySum) * sensitivity;
    const reasons = [];

    const combos = COMBO_BONUS[species] || {};
    for (const w of weighted) {
      if (combos[w.symptom]) score += combos[w.symptom];
    }
    // Classic pairing called out in plain words, e.g. poultry + sudden death.
    if (species === 'poultry' && weighted.some((w) => w.symptom === 'sudden death')) {
      reasons.push('Sudden death in poultry is the classic sign of a disease racing through a flock.');
    } else if (species === 'cattle' && weighted.some((w) => w.symptom === 'salivating or drooling')) {
      reasons.push('Drooling in cattle can spread fast within a herd and needs quick attention.');
    }

    for (const w of weighted) {
      if (SYMPTOM_REASONS[w.symptom] && w.weight >= 5) {
        reasons.push(SYMPTOM_REASONS[w.symptom]);
      }
    }

    const total = counts.sick + counts.dead + counts.atRisk;
    if (counts.dead > 0) {
      reasons.push(counts.dead === 1
        ? '1 animal has already died.'
        : counts.dead + ' animals have already died.');
      score += 2;
      if (counts.dead >= 3) score += 1;
    }
    if (total >= 5) {
      reasons.push(total + ' animals are affected at once, so sickness may be spreading.');
      score += 1.5;
    } else if (total >= 2) {
      reasons.push('More than one animal is affected.');
      score += 0.5;
    }
    const primarySymptom = weighted.length ? weighted[0].symptom : null;
    if (
      livestock.durationUnit === 'hours' &&
      primarySymptom !== null &&
      SYMPTOM_WEIGHTS[primarySymptom] >= 7
    ) {
      reasons.push('It started only hours ago with a serious sign, which suggests a fast illness.');
      score += 2;
    }

    const level = score >= EMERGENCY_SCORE ? 'emergency' : score >= URGENT_SCORE ? 'urgent' : 'routine';
    if (reasons.length === 0) {
      reasons.push(
        'No serious warning signs: ' + (total === 1 ? '1 animal' : total + ' animals') +
        ' affected over ' + livestock.durationValue + ' ' + livestock.durationUnit +
        '. Rated routine for now.');
    }
    return { level, reasons, guidance: GUIDANCE[level].slice(), score };
  }

  // ---- Validation ----
  function validationError(message, field) {
    const err = new Error(message);
    err.field = field;
    return err;
  }

  function requireText(value, message, field) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw validationError(message, field);
    }
    return value.trim();
  }

  function validateReportInput(input) {
    if (!input || typeof input !== 'object') {
      throw validationError('A report needs a reporter and livestock details', 'report');
    }
    const reporter = input.reporter || {};
    const livestock = input.livestock || {};
    requireText(reporter.name, 'Please give the farmer name.', 'reporter.name');
    requireText(reporter.phone, 'Please give a phone number to call back on.', 'reporter.phone');
    requireText(reporter.region, 'Please choose a region.', 'reporter.region');

    if (!livestock.species) {
      throw validationError('Please choose the animal type.', 'livestock.species');
    }
    if (SPECIES.indexOf(livestock.species) === -1) {
      throw validationError(
        'Unknown animal type: ' + livestock.species, 'livestock.species');
    }

    const rawCounts = livestock.counts || {};
    const counts = {
      sick: rawCounts.sick === undefined ? 0 : rawCounts.sick,
      dead: rawCounts.dead === undefined ? 0 : rawCounts.dead,
      atRisk: rawCounts.atRisk === undefined ? 0 : rawCounts.atRisk,
    };
    ['sick', 'dead', 'atRisk'].forEach((key) => {
      const v = counts[key];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
        throw validationError(
          'The number of animals ' + key + ' must be a whole number of 0 or more.',
          'livestock.counts.' + key);
      }
    });
    if (counts.sick + counts.dead + counts.atRisk <= 0) {
      throw validationError(
        'Say how many animals are sick, dead or at risk (at least one).',
        'livestock.counts');
    }

    const symptoms = livestock.symptoms === undefined ? [] : livestock.symptoms;
    if (!Array.isArray(symptoms)) {
      throw validationError('Symptoms must be a list.', 'livestock.symptoms');
    }
    symptoms.forEach((s) => {
      if (SYMPTOMS.indexOf(s) === -1) {
        throw validationError('Unknown symptom: ' + s, 'livestock.symptoms');
      }
    });
    const description = livestock.description === undefined ? '' : String(livestock.description);
    if (symptoms.length === 0 && description.trim() === '') {
      throw validationError(
        'Pick at least one symptom or describe what you see.', 'livestock.symptoms');
    }

    const durationValue = livestock.durationValue;
    if (typeof durationValue !== 'number' || !Number.isFinite(durationValue) || durationValue <= 0) {
      throw validationError(
        'Say how long this has been going on (a number greater than 0).', 'livestock.durationValue');
    }
    if (DURATION_UNITS.indexOf(livestock.durationUnit) === -1) {
      throw validationError('Duration unit must be hours, days or weeks.', 'livestock.durationUnit');
    }

    return { reporter, livestock, counts, symptoms, description };
  }

  // ---- Vet matching ----
  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // Matching weights: specialty and distance matter equally and most,
  // caseload breaks ties between otherwise similar vets.
  const MATCH_WEIGHTS = { distance: 0.4, specialty: 0.4, caseload: 0.2 };
  const MATCH_DISTANCE_SCALE_KM = 200; // closeness falls linearly to 0 at this distance
  const MATCH_CASELOAD_SCALE = 5; // availability falls linearly to 0 at this many open cases

  function openCaseload(state, vetId) {
    return Object.keys(state.reports).filter((id) => {
      const r = state.reports[id];
      return r.status !== 'resolved' && r.assignedVet === vetId;
    }).length;
  }

  // The urgency the queue works with: a vet's overrule wins, the machine's
  // original rating stays on the record for comparison.
  function effectiveUrgency(report) {
    return report.urgencyOverrule ? report.urgencyOverrule.to : report.triage.level;
  }

  // ---- Outbreak clusters ----
  const CLUSTER_RADIUS_KM = 25; // reports group around the cluster's centre
  const CLUSTER_WINDOW_DAYS = 7; // a cluster may span at most this many days
  const CLUSTER_MIN_REPORTERS = 3; // distinct farms needed before it is a signal

  function centroidOf(points) {
    const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
    const lng = points.reduce((s, p) => s + p.lng, 0) / points.length;
    return { lat, lng };
  }

  // ---- Store ----
  function createStore(deps) {
    const storage = deps.storage;
    const now = deps.now;
    const uid = deps.uid;

    let state;
    const saved = storage.read();
    if (saved && saved.reports && typeof saved.reports === 'object') {
      state = saved;
      if (!state.vets || typeof state.vets !== 'object') state.vets = {};
    } else {
      state = { version: 1, reports: {}, vets: {} };
    }

    function persist() {
      storage.write(state);
    }

    function requireReport(reportId) {
      const report = state.reports[reportId];
      if (!report) throw validationError('No report with id ' + reportId, 'reportId');
      return report;
    }

    function requireVet(vetId) {
      const vet = state.vets[vetId];
      if (!vet) throw validationError('No vet with id ' + vetId, 'vetId');
      return vet;
    }

    function requireOpenCase(report) {
      if (report.status === 'resolved') {
        throw validationError(
          'This case is already closed. Its outcome is on record.', 'status');
      }
    }

    function appendEntry(report, kind, actor, text, meta) {
      report.timeline.push({ at: now(), actor, kind, text, meta: meta || {} });
    }

    function clone(value) {
      return JSON.parse(JSON.stringify(value));
    }

    function validateVetInput(input) {
      if (!input || typeof input !== 'object') {
        throw validationError('A vet needs a name, phone, region and location.', 'vet');
      }
      requireText(input.name, 'Please give the vet name.', 'vet.name');
      requireText(input.phone, 'Please give the vet phone number.', 'vet.phone');
      requireText(input.region, 'Please give the vet region.', 'vet.region');
      if (typeof input.lat !== 'number' || !Number.isFinite(input.lat)) {
        throw validationError('The vet needs a latitude number.', 'vet.lat');
      }
      if (typeof input.lng !== 'number' || !Number.isFinite(input.lng)) {
        throw validationError('The vet needs a longitude number.', 'vet.lng');
      }
      const specialties = input.specialties === undefined ? [] : input.specialties;
      if (!Array.isArray(specialties)) {
        throw validationError('Specialties must be a list of animal types.', 'vet.specialties');
      }
      specialties.forEach((s) => {
        if (SPECIES.indexOf(s) === -1) {
          throw validationError('Unknown specialty animal type: ' + s, 'vet.specialties');
        }
      });
      return { specialties };
    }

    const store = {
      addReport(input) {
        const checked = validateReportInput(input);
        const id = uid();
        const createdAt = now();
        const report = {
          id,
          createdAt,
          status: 'open',
          reporter: clone(checked.reporter),
          livestock: {
            species: checked.livestock.species,
            counts: checked.counts,
            symptoms: checked.symptoms.slice(),
            description: checked.description,
            durationValue: checked.livestock.durationValue,
            durationUnit: checked.livestock.durationUnit,
            photoRequested: checked.livestock.photoRequested === true,
          },
          triage: triageReport({
            species: checked.livestock.species,
            counts: checked.counts,
            symptoms: checked.symptoms,
            durationValue: checked.livestock.durationValue,
            durationUnit: checked.livestock.durationUnit,
          }),
          timeline: [],
        };
        report.timeline.push({
          at: createdAt,
          actor: 'farmer',
          kind: 'created',
          text: 'Report submitted.',
          meta: {},
        });
        state.reports[id] = report;
        persist();
        return clone(report);
      },

      addVet(input) {
        const checked = validateVetInput(input);
        const vet = {
          id: uid(),
          name: input.name.trim(),
          phone: input.phone.trim(),
          region: input.region.trim(),
          lat: input.lat,
          lng: input.lng,
          specialties: checked.specialties.slice(),
        };
        state.vets[vet.id] = vet;
        persist();
        return clone(vet);
      },

      listVets() {
        return Object.keys(state.vets).map((id) => clone(state.vets[id]));
      },

      suggestVets(reportId) {
        const report = state.reports[reportId];
        if (!report) throw validationError('No report with id ' + reportId, 'reportId');
        const species = report.livestock.species;
        const hasCoords =
          typeof report.reporter.lat === 'number' && typeof report.reporter.lng === 'number';

        const scored = Object.keys(state.vets).map((vetId) => {
          const vet = state.vets[vetId];
          let distanceKm = null;
          let closeness;
          if (hasCoords) {
            distanceKm = haversineKm(report.reporter.lat, report.reporter.lng, vet.lat, vet.lng);
            closeness = Math.max(0, 1 - distanceKm / MATCH_DISTANCE_SCALE_KM);
          } else {
            closeness = 0.5; // unknown: neither reward nor punish, let specialty decide
          }
          const specialtyFit = vet.specialties.indexOf(species) !== -1 ? 1 : 0;
          const open = openCaseload(state, vetId);
          const availability = Math.max(0, 1 - open / MATCH_CASELOAD_SCALE);
          const score =
            MATCH_WEIGHTS.distance * closeness +
            MATCH_WEIGHTS.specialty * specialtyFit +
            MATCH_WEIGHTS.caseload * availability;

          const reasons = [];
          if (distanceKm !== null) reasons.push(Math.round(distanceKm) + ' km away');
          if (specialtyFit) reasons.push('treats ' + species);
          if (vet.region === report.reporter.region) reasons.push('based in ' + vet.region + ' too');
          if (open === 0) reasons.push('no open cases');
          else if (open <= 2) reasons.push('light caseload');
          else reasons.push('busy with ' + open + ' open cases');
          if (distanceKm === null) reasons.push('farm location unknown — ranked on specialty and caseload');

          return { vet: clone(vet), distanceKm, score, reasons };
        });

        scored.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          const da = a.distanceKm === null ? Infinity : a.distanceKm;
          const db = b.distanceKm === null ? Infinity : b.distanceKm;
          if (da !== db) return da - db;
          return a.vet.id < b.vet.id ? -1 : 1;
        });
        return scored.map((s) => ({ vet: s.vet, distanceKm: s.distanceKm, reasons: s.reasons }));
      },

      takeCase(reportId, vetId) {
        const report = requireReport(reportId);
        const vet = requireVet(vetId);
        requireOpenCase(report);
        report.assignedVet = vet.id;
        if (report.status === 'open') report.status = 'responded';
        appendEntry(report, 'takeover', 'vet',
          vet.name + ' took over this case and will follow up.', { vetId: vet.id, vetName: vet.name });
        persist();
        return clone(report);
      },

      postGuidance(reportId, vetId, text) {
        const report = requireReport(reportId);
        const vet = requireVet(vetId);
        requireOpenCase(report);
        if (typeof text !== 'string' || text.trim() === '') {
          throw validationError('Write the guidance for the farmer.', 'text');
        }
        if (report.status === 'open') report.status = 'responded';
        appendEntry(report, 'guidance', 'vet', text.trim(),
          { vetId: vet.id, vetName: vet.name });
        persist();
        return clone(report);
      },

      arrangeTreatment(reportId, vetId, plan) {
        const report = requireReport(reportId);
        const vet = requireVet(vetId);
        requireOpenCase(report);
        const p = plan || {};
        if (typeof p.what !== 'string' || p.what.trim() === '') {
          throw validationError('Say what treatment was agreed.', 'what');
        }
        if (typeof p.when !== 'string' || p.when.trim() === '') {
          throw validationError('Say when the treatment will happen.', 'when');
        }
        report.status = 'treatment_arranged';
        appendEntry(report, 'treatment', 'vet',
          'Treatment arranged: ' + p.what.trim() + ' (' + p.when.trim() + ')',
          { vetId: vet.id, vetName: vet.name, what: p.what.trim(), when: p.when.trim() });
        persist();
        return clone(report);
      },

      addInternalNote(reportId, vetId, text) {
        const report = requireReport(reportId);
        const vet = requireVet(vetId);
        if (typeof text !== 'string' || text.trim() === '') {
          throw validationError('Write the note.', 'text');
        }
        appendEntry(report, 'note', 'vet', text.trim(),
          { vetId: vet.id, vetName: vet.name, internal: true });
        persist();
        return clone(report);
      },

      overruleUrgency(reportId, vetId, level, reason) {
        const report = requireReport(reportId);
        const vet = requireVet(vetId);
        requireOpenCase(report);
        if (URGENCY_LEVELS.indexOf(level) === -1) {
          throw validationError(
            'Urgency must be emergency, urgent or routine.', 'level');
        }
        if (typeof reason !== 'string' || reason.trim() === '') {
          throw validationError('Give a reason for changing the urgency.', 'reason');
        }
        report.urgencyOverrule = {
          from: report.triage.level,
          to: level,
          reason: reason.trim(),
          at: now(),
        };
        appendEntry(report, 'overrule', 'vet',
          'Urgency changed from ' + report.triage.level + ' to ' + level + ': ' + reason.trim(),
          { vetId: vet.id, vetName: vet.name, from: report.triage.level, to: level, reason: reason.trim() });
        persist();
        return clone(report);
      },

      closeCase(reportId, actorKind, outcome, note) {
        const report = requireReport(reportId);
        if (actorKind !== 'vet' && actorKind !== 'farmer') {
          throw validationError('Who is closing the case: a vet or the farmer?', 'actorKind');
        }
        const OUTCOMES = ['recovered', 'died', 'euthanised', 'referred'];
        if (OUTCOMES.indexOf(outcome) === -1) {
          throw validationError(
            'Outcome must be recovered, died, euthanised or referred.', 'outcome');
        }
        requireOpenCase(report);
        report.status = 'resolved';
        report.outcome = { result: outcome, at: now(), actor: actorKind };
        if (note !== undefined && String(note).trim() !== '') {
          report.outcome.note = String(note).trim();
        }
        const actorLabel = actorKind === 'vet' ? 'The vet' : 'The farmer';
        appendEntry(report, 'outcome', actorKind,
          actorLabel + ' closed this case. Outcome: ' + outcome + '.',
          { result: outcome, note: report.outcome.note });
        persist();
        return clone(report);
      },

      scanSignals() {
        const open = Object.keys(state.reports)
          .map((id) => state.reports[id])
          .filter((r) => r.status !== 'resolved')
          .filter((r) => typeof r.reporter.lat === 'number' && typeof r.reporter.lng === 'number');

        const windowMs = CLUSTER_WINDOW_DAYS * 24 * 60 * 60 * 1000;
        // Group open reports by place and time: oldest first, a report joins
        // a group when it sits within the radius of the group's centre and
        // within the sliding window of the group's earliest report.
        const sorted = open.slice().sort(
          (a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
        const clusters = [];
        for (const r of sorted) {
          const point = { lat: r.reporter.lat, lng: r.reporter.lng };
          let placed = false;
          for (const cluster of clusters) {
            const centre = centroidOf(cluster.points.concat([point]));
            if (
              r.createdAt - cluster.firstAt <= windowMs &&
              haversineKm(point.lat, point.lng, centre.lat, centre.lng) <= CLUSTER_RADIUS_KM
            ) {
              cluster.points.push(point);
              cluster.reports.push(r);
              placed = true;
              break;
            }
          }
          if (!placed) {
            clusters.push({ points: [point], reports: [r], firstAt: r.createdAt });
          }
        }

        const signals = [];
        for (const cluster of clusters) {
          const reports = cluster.reports;
          // distinct farms by phone
          const reporters = [];
          const phones = [];
          for (const r of reports) {
            if (phones.indexOf(r.reporter.phone) === -1) {
              phones.push(r.reporter.phone);
              reporters.push(r.reporter.name);
            }
          }
          if (phones.length < CLUSTER_MIN_REPORTERS) continue;
          // at least one sign must be reported by two or more of those farms
          const sharedSymptoms = [];
          for (const symptom of SYMPTOMS) {
            const reportersWithIt = [];
            for (const r of reports) {
              if (r.livestock.symptoms.indexOf(symptom) !== -1 &&
                  reportersWithIt.indexOf(r.reporter.phone) === -1) {
                reportersWithIt.push(r.reporter.phone);
              }
            }
            if (reportersWithIt.length >= 2) sharedSymptoms.push(symptom);
          }
          if (sharedSymptoms.length === 0) continue;
          const ordered = reports.slice().sort((a, b) => a.createdAt - b.createdAt);
          const regions = [];
          const villages = [];
          for (const r of ordered) {
            if (regions.indexOf(r.reporter.region) === -1) regions.push(r.reporter.region);
            if (r.reporter.village && villages.indexOf(r.reporter.village) === -1) villages.push(r.reporter.village);
          }
          signals.push({
            sharedSymptoms,
            reportIds: ordered.map((r) => r.id),
            reporters,
            area: regions.join(', ') + (villages.length ? ' (' + villages.join(', ') + ')' : ''),
            firstAt: ordered[0].createdAt,
            lastAt: ordered[ordered.length - 1].createdAt,
          });
        }

        signals.sort((a, b) => {
          if (b.reporters.length !== a.reporters.length) return b.reporters.length - a.reporters.length;
          if (a.lastAt !== b.lastAt) return a.lastAt - b.lastAt;
          return a.reportIds[0] < b.reportIds[0] ? -1 : 1;
        });
        return signals;
      },

      stats() {
        const reports = Object.keys(state.reports).map((id) => state.reports[id]);
        const open = reports.filter((r) => r.status !== 'resolved');
        const resolved = reports.filter((r) => r.status === 'resolved');

        const openByUrgency = { emergency: 0, urgent: 0, routine: 0 };
        for (const r of open) openByUrgency[effectiveUrgency(r)] += 1;

        const weekMs = 7 * 24 * 60 * 60 * 1000;
        const weekCount = reports.filter((r) => now() - r.createdAt <= weekMs).length;

        const responseMins = [];
        for (const r of reports) {
          const firstVetAction = r.timeline.find(
            (e) => e.actor === 'vet' && (e.kind === 'takeover' || e.kind === 'guidance'));
          if (firstVetAction) {
            responseMins.push((firstVetAction.at - r.createdAt) / 60000);
          }
        }
        let medianResponseMins = 0;
        if (responseMins.length > 0) {
          responseMins.sort((a, b) => a - b);
          const mid = Math.floor(responseMins.length / 2);
          medianResponseMins = responseMins.length % 2 === 1
            ? responseMins[mid]
            : (responseMins[mid - 1] + responseMins[mid]) / 2;
          medianResponseMins = Math.round(medianResponseMins * 10) / 10;
        }

        const byRegion = {};
        const bySpecies = {};
        for (const r of open) {
          byRegion[r.reporter.region] = (byRegion[r.reporter.region] || 0) + 1;
          bySpecies[r.livestock.species] = (bySpecies[r.livestock.species] || 0) + 1;
        }

        return {
          openByUrgency,
          weekCount,
          medianResponseMins,
          resolutionRate: reports.length === 0 ? 0 : resolved.length / reports.length,
          byRegion,
          bySpecies,
        };
      },

      getReport(id) {
        const report = state.reports[id];
        return report ? clone(report) : null;
      },

      listReports(query) {
        const q = query || {};
        let list = Object.keys(state.reports).map((id) => state.reports[id]);
        if (q.reporterPhone !== undefined) {
          list = list.filter((r) => r.reporter.phone === q.reporterPhone);
        }
        if (q.region !== undefined) {
          list = list.filter((r) => r.reporter.region === q.region);
        }
        if (q.species !== undefined) {
          list = list.filter((r) => r.livestock.species === q.species);
        }
        if (q.status !== undefined) {
          list = list.filter((r) => r.status === q.status);
        }
        if (q.urgency !== undefined) {
          list = list.filter((r) => effectiveUrgency(r) === q.urgency);
        }
        return list
          .slice()
          .sort((a, b) => {
            const rank = { emergency: 0, urgent: 1, routine: 2 };
            const byRank = rank[effectiveUrgency(a)] - rank[effectiveUrgency(b)];
            if (byRank !== 0) return byRank;
            return b.createdAt - a.createdAt;
          })
          .map(clone);
      },
    };

    persist();
    return store;
  }

  const api = {
    createStore,
    SPECIES,
    SYMPTOMS,
    URGENCY_LEVELS,
    DURATION_UNITS,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    window.HerdSignal = api;
  }
})();
