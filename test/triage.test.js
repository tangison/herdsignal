'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const HerdSignal = require('../app/domain.js');

const T0 = Date.parse('2026-11-16T08:00:00Z');

function memoryStorage() {
  let saved = null;
  return {
    read: () => (saved === null ? null : JSON.parse(saved)),
    write: (state) => { saved = JSON.stringify(state); },
  };
}

function makeStore() {
  let n = 0;
  return HerdSignal.createStore({
    storage: memoryStorage(),
    now: () => T0,
    uid: () => 'id-' + (++n),
  });
}

function reportInput(overrides) {
  const o = overrides || {};
  return {
    reporter: Object.assign(
      { name: 'Anna Shipanga', phone: '+264 81 123 4567', region: 'Oshana', village: 'Oshakati' },
      o.reporter
    ),
    livestock: Object.assign(
      {
        species: 'cattle',
        counts: { sick: 1, dead: 0, atRisk: 0 },
        symptoms: ['limping'],
        description: '',
        durationValue: 2,
        durationUnit: 'weeks',
        photoRequested: false,
      },
      o.livestock
    ),
  };
}

test('sudden death in poultry is an emergency, with reasons naming the triggers', () => {
  const store = makeStore();
  const report = store.addReport(reportInput({
    livestock: { species: 'poultry', counts: { sick: 1, dead: 0, atRisk: 0 }, symptoms: ['sudden death'], durationValue: 1, durationUnit: 'days' },
  }));
  assert.equal(report.triage.level, 'emergency');
  const reasons = report.triage.reasons.join(' ');
  assert.match(reasons, /sudden death/i, 'reasons should cite the sudden-death symptom');
  assert.match(reasons, /poultry/i, 'reasons should cite the species');
});

test('one animal with a mild sign and a long duration stays routine', () => {
  const store = makeStore();
  const report = store.addReport(reportInput({
    livestock: { species: 'donkeys', counts: { sick: 1, dead: 0, atRisk: 0 }, symptoms: ['ticks'], durationValue: 3, durationUnit: 'weeks' },
  }));
  assert.equal(report.triage.level, 'routine');
  assert.ok(report.triage.guidance.length >= 3 && report.triage.guidance.length <= 5);
});

test('many sick animals and deaths raise the urgency over the same report with one animal', () => {
  const store = makeStore();
  const single = store.addReport(reportInput({
    livestock: { species: 'goats', counts: { sick: 1, dead: 0, atRisk: 0 }, symptoms: ['diarrhoea'], durationValue: 2, durationUnit: 'days' },
  }));
  const spread = store.addReport(reportInput({
    livestock: { species: 'goats', counts: { sick: 20, dead: 3, atRisk: 10 }, symptoms: ['diarrhoea'], durationValue: 2, durationUnit: 'days' },
  }));
  const rank = { routine: 0, urgent: 1, emergency: 2 };
  assert.ok(
    rank[spread.triage.level] > rank[single.triage.level],
    'spread report (' + spread.triage.level + ') should outrank single report (' + single.triage.level + ')'
  );
  const reasons = spread.triage.reasons.join(' ');
  assert.match(reasons, /died/i);
  assert.match(reasons, /spreading/i);
});

test('every urgency level comes with 3-5 short farmer-facing actions that fit the level', () => {
  const store = makeStore();
  const cases = [
    { livestock: { species: 'poultry', symptoms: ['sudden death'], durationValue: 1, durationUnit: 'days' }, level: 'emergency' },
    { livestock: { species: 'cattle', counts: { sick: 1, dead: 0, atRisk: 0 }, symptoms: ['difficulty breathing'], durationValue: 2, durationUnit: 'days' }, level: null },
    { livestock: { species: 'donkeys', counts: { sick: 1, dead: 0, atRisk: 0 }, symptoms: ['ticks'], durationValue: 3, durationUnit: 'weeks' }, level: 'routine' },
  ];
  const seen = new Set();
  for (const c of cases) {
    const report = store.addReport(reportInput(c));
    seen.add(report.triage.level);
    assert.ok(report.triage.guidance.length >= 3 && report.triage.guidance.length <= 5, 'guidance length for ' + report.triage.level);
    for (const line of report.triage.guidance) {
      assert.equal(typeof line, 'string');
      assert.ok(line.trim().length > 0);
    }
  }
  assert.ok(seen.has('emergency') && seen.has('routine'));
  // emergency guidance protects the rest of the herd and the meat supply
  const emergency = store.addReport(reportInput({
    livestock: { species: 'poultry', counts: { sick: 2, dead: 2, atRisk: 0 }, symptoms: ['sudden death'], durationValue: 1, durationUnit: 'days' },
  }));
  const emergencyText = emergency.triage.guidance.join(' ').toLowerCase();
  assert.match(emergencyText, /separate/);
  assert.match(emergencyText, /slaughter|sell|move/);
});

test('triage is deterministic: the same report always gets the same rating', () => {
  const store = makeStore();
  const input = reportInput({
    livestock: { species: 'pigs', counts: { sick: 4, dead: 1, atRisk: 2 }, symptoms: ['not eating', 'coughing'], durationValue: 1, durationUnit: 'days' },
  });
  const a = store.addReport(input).triage;
  const b = store.addReport(input).triage;
  assert.deepEqual(a, b);
});

test('cattle drooling and a sudden onset within hours each raise the rating', () => {
  const store = makeStore();
  // cattle + drooling is a classic fast-spreading herd problem
  const drooling = store.addReport(reportInput({
    livestock: { species: 'cattle', counts: { sick: 3, dead: 0, atRisk: 0 }, symptoms: ['salivating or drooling'], durationValue: 2, durationUnit: 'days' },
  }));
  assert.equal(drooling.triage.level, 'urgent');
  assert.match(drooling.triage.reasons.join(' '), /cattle/i);
  // the same report arriving only hours into a serious sign climbs to emergency
  const sudden = store.addReport(reportInput({
    livestock: { species: 'cattle', counts: { sick: 3, dead: 0, atRisk: 0 }, symptoms: ['salivating or drooling'], durationValue: 6, durationUnit: 'hours' },
  }));
  assert.equal(sudden.triage.level, 'emergency');
  // and the urgent case's reasons explain the warning, not just a number
  assert.ok(drooling.triage.reasons.length >= 2);
});

test('triage is stored on the report record and reads back through the public interface', () => {
  const store = makeStore();
  const report = store.addReport(reportInput({
    livestock: { species: 'poultry', counts: { sick: 1, dead: 0, atRisk: 0 }, symptoms: ['sudden death'], durationValue: 1, durationUnit: 'days' },
  }));
  const readBack = store.getReport(report.id);
  assert.equal(readBack.triage.level, 'emergency');
  assert.ok(Array.isArray(readBack.triage.reasons) && readBack.triage.reasons.length > 0);
  assert.ok(Array.isArray(readBack.triage.guidance) && readBack.triage.guidance.length >= 3);
  // the farmer can see both the rating and the why
  assert.ok(readBack.triage.reasons.every((r) => typeof r === 'string' && r.length > 0));
});

test('the canonical symptom checklist is exposed so the UI can render it', () => {
  for (const s of ['diarrhoea', 'not eating', 'limping', 'coughing', 'sudden death', 'lumps or swelling', 'ticks', 'abortions']) {
    assert.ok(HerdSignal.SYMPTOMS.includes(s), 'symptom checklist should include ' + s);
  }
  assert.deepEqual(HerdSignal.URGENCY_LEVELS, ['emergency', 'urgent', 'routine']);
});
