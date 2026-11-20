'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const HerdSignal = require('../app/domain.js');

const T0 = Date.parse('2026-11-16T08:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;

function memoryStorage() {
  let saved = null;
  return {
    read: () => (saved === null ? null : JSON.parse(saved)),
    write: (state) => { saved = JSON.stringify(state); },
  };
}

let currentTime = T0;
let seq = 0;
function makeStore() {
  currentTime = T0;
  seq = 0;
  return HerdSignal.createStore({
    storage: memoryStorage(),
    now: () => currentTime,
    uid: () => 'id-' + (++seq),
  });
}
function advance(ms) { currentTime += ms; }

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
        durationUnit: 'days',
        photoRequested: false,
      },
      o.livestock
    ),
  };
}

function vetInput(overrides) {
  return { name: 'DrNdapewa', phone: '+264 81 555 0001', region: 'Oshana', lat: -17.79, lng: 15.85, specialties: ['cattle'], ...overrides };
}

test('stats counts open cases by urgency, with closed cases out of the mix', () => {
  const store = makeStore();
  const vet = store.addVet(vetInput());
  // two open emergencies
  store.addReport(reportInput({ livestock: { species: 'poultry', counts: { sick: 1, dead: 0, atRisk: 0 }, symptoms: ['sudden death'], durationValue: 1, durationUnit: 'days' } }));
  store.addReport(reportInput({ livestock: { species: 'cattle', counts: { sick: 3, dead: 0, atRisk: 0 }, symptoms: ['salivating or drooling'], durationValue: 6, durationUnit: 'hours' } }));
  // one open routine
  store.addReport(reportInput({ livestock: { species: 'donkeys', counts: { sick: 1, dead: 0, atRisk: 0 }, symptoms: ['ticks'], durationValue: 3, durationUnit: 'weeks' } }));
  // one resolved routine
  const closed = store.addReport(reportInput({ livestock: { species: 'donkeys', counts: { sick: 1, dead: 0, atRisk: 0 }, symptoms: ['limping'], durationValue: 4, durationUnit: 'days' } }));
  store.closeCase(closed.id, 'farmer', 'recovered');
  const s = store.stats();
  assert.deepEqual(s.openByUrgency, { emergency: 2, urgent: 0, routine: 1 });
});

test('stats breaks open cases down by region and by species, open cases only', () => {
  const store = makeStore();
  store.addReport(reportInput()); // Oshana cattle
  store.addReport(reportInput({ reporter: { region: 'Erongo' } }));
  const closed = store.addReport(reportInput({ reporter: { region: 'Omusati' }, livestock: { species: 'goats' } }));
  store.closeCase(closed.id, 'farmer', 'recovered');
  const s = store.stats();
  assert.deepEqual(s.byRegion, { Oshana: 1, Erongo: 1 });
  assert.deepEqual(s.bySpecies, { cattle: 2 });
});

test('weekCount covers the last seven days and resolutionRate reflects outcomes', () => {
  const store = makeStore();
  const vet = store.addVet(vetInput());
  // 4 reports: two from 10 days ago (outside the week), two recent
  currentTime = T0 - 10 * DAY;
  store.addReport(reportInput());
  const old2 = store.addReport(reportInput());
  currentTime = T0;
  store.addReport(reportInput());
  store.addReport(reportInput());
  // one of the old ones was resolved
  store.closeCase(old2.id, 'farmer', 'recovered');
  const s = store.stats();
  assert.equal(s.weekCount, 2);
  assert.equal(s.resolutionRate, 1 / 4);
  // an empty service reports clean zeros, not NaN
  const empty = makeStore();
  const es = empty.stats();
  assert.equal(es.resolutionRate, 0);
  assert.equal(es.medianResponseMins, 0);
  assert.deepEqual(es.openByUrgency, { emergency: 0, urgent: 0, routine: 0 });
});

test('medianResponseMins is the median wait to the first vet action across responded cases', () => {
  const store = makeStore();
  const vet = store.addVet(vetInput());
  // case A: answered after 30 min; case B: after 60 min; case C: never answered
  const a = store.addReport(reportInput());
  advance(15 * MIN);
  const b = store.addReport(reportInput());
  advance(15 * MIN);
  const c = store.addReport(reportInput());
  currentTime = T0 + 30 * MIN;
  store.takeCase(a.id, vet.id);
  currentTime = T0 + 60 * MIN;
  store.postGuidance(b.id, vet.id, 'Give it water and shade, I will call you.');
  assert.equal(c.status, 'open');
  const s = store.stats();
  // a=30 min, b=45 min; an even count averages the middle two
  assert.equal(s.medianResponseMins, 37.5);
  // a second answered case makes it the middle value of three
  advance(60 * MIN);
  const d = store.addReport(reportInput());
  currentTime = T0 + 150 * MIN;
  store.takeCase(d.id, vet.id); // d answered 30 min after it was filed
  // responses now: a=30, b=45, d=30 -> sorted 30,30,45 -> median 30
  assert.equal(store.stats().medianResponseMins, 30);
});

test('the urgency mix follows a vet overrule, not just the machine rating', () => {
  const store = makeStore();
  const vet = store.addVet(vetInput());
  const report = store.addReport(reportInput({
    livestock: { species: 'donkeys', counts: { sick: 1, dead: 0, atRisk: 0 }, symptoms: ['ticks'], durationValue: 3, durationUnit: 'weeks' },
  }));
  assert.equal(store.stats().openByUrgency.routine, 1);
  store.overruleUrgency(report.id, vet.id, 'emergency', 'Second donkey down overnight.');
  const s = store.stats();
  assert.deepEqual(s.openByUrgency, { emergency: 1, urgent: 0, routine: 0 });
});
