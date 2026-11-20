'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const HerdSignal = require('../app/domain.js');

// Fixed fakes: the clock returns a controllable instant, ids come from a
// sequence. Storage is an in-memory adapter that serializes like
// localStorage does (through JSON), so the store can never rely on object
// identity between runs.
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

function validReportInput(overrides) {
  const o = overrides || {};
  return {
    reporter: Object.assign(
      { name: 'Anna Shipanga', phone: '+264 81 123 4567', region: 'Oshana', village: 'Oshakati' },
      o.reporter
    ),
    livestock: Object.assign(
      {
        species: 'cattle',
        counts: { sick: 2, dead: 0, atRisk: 4 },
        symptoms: ['diarrhoea'],
        description: '',
        durationValue: 2,
        durationUnit: 'days',
        photoRequested: false,
      },
      o.livestock
    ),
  };
}

test('a valid report is stored and returned with all submitted fields, an injected id and creation time', () => {
  const store = makeStore();
  const report = store.addReport(validReportInput());
  assert.equal(report.id, 'id-1');
  assert.equal(report.createdAt, T0);
  assert.equal(report.status, 'open');
  assert.deepEqual(report.reporter, {
    name: 'Anna Shipanga', phone: '+264 81 123 4567', region: 'Oshana', village: 'Oshakati',
  });
  assert.deepEqual(report.livestock.counts, { sick: 2, dead: 0, atRisk: 4 });
  assert.deepEqual(report.livestock.symptoms, ['diarrhoea']);
  assert.equal(report.livestock.species, 'cattle');
  assert.equal(report.livestock.durationValue, 2);
  assert.equal(report.livestock.durationUnit, 'days');
  const readBack = store.getReport(report.id);
  assert.equal(readBack.id, 'id-1');
  assert.equal(readBack.livestock.species, 'cattle');
});

test('a fresh report carries one timeline entry recording its submission', () => {
  const store = makeStore();
  const report = store.addReport(validReportInput());
  const readBack = store.getReport(report.id);
  assert.equal(readBack.timeline.length, 1);
  assert.equal(readBack.timeline[0].at, T0);
  assert.equal(readBack.timeline[0].actor, 'farmer');
  assert.equal(readBack.timeline[0].kind, 'created');
});

test('a report without the farmer name is rejected, naming the missing field', () => {
  const store = makeStore();
  assert.throws(
    () => store.addReport(validReportInput({ reporter: { name: '' } })),
    (err) => err.field === 'reporter.name' && /name/i.test(err.message)
  );
});

test('a report without a phone number is rejected, naming the missing field', () => {
  const store = makeStore();
  assert.throws(
    () => store.addReport(validReportInput({ reporter: { phone: '  ' } })),
    (err) => err.field === 'reporter.phone' && /phone/i.test(err.message)
  );
});

test('a report without a region is rejected, naming the missing field', () => {
  const store = makeStore();
  const input = validReportInput();
  delete input.reporter.region;
  assert.throws(
    () => store.addReport(input),
    (err) => err.field === 'reporter.region' && /region/i.test(err.message)
  );
});

test('the animal type must be missing-checked and taken from the canonical species list', () => {
  const store = makeStore();
  assert.throws(
    () => store.addReport(validReportInput({ livestock: { species: undefined } })),
    (err) => err.field === 'livestock.species'
  );
  assert.throws(
    () => store.addReport(validReportInput({ livestock: { species: 'unicorns' } })),
    (err) => err.field === 'livestock.species'
  );
  // the canonical list covers what farmers keep, per the PRD
  for (const s of ['cattle', 'goats', 'sheep', 'poultry', 'donkeys', 'pigs', 'dogs', 'other']) {
    assert.ok(HerdSignal.SPECIES.includes(s), 'canonical species should include ' + s);
  }
});

test('a report needs symptoms from the checklist or a description in the farmer’s own words', () => {
  const store = makeStore();
  // neither symptoms nor description -> rejected
  assert.throws(
    () => store.addReport(validReportInput({ livestock: { symptoms: [], description: '  ' } })),
    (err) => err.field === 'livestock.symptoms'
  );
  // a symptom that is not on the checklist -> rejected
  assert.throws(
    () => store.addReport(validReportInput({ livestock: { symptoms: ['green spots'] } })),
    (err) => err.field === 'livestock.symptoms'
  );
  // not a list at all -> rejected
  assert.throws(
    () => store.addReport(validReportInput({ livestock: { symptoms: 'diarrhoea' } })),
    (err) => err.field === 'livestock.symptoms'
  );
  // no symptoms but a real description -> accepted
  const ok = store.addReport(validReportInput({ livestock: { symptoms: [], description: 'The big one just stands in the shade and will not drink.' } }));
  assert.equal(ok.status, 'open');
});

test('counts must be whole numbers of 0 or more, with at least one affected animal', () => {
  const store = makeStore();
  // everything zero -> rejected
  assert.throws(
    () => store.addReport(validReportInput({ livestock: { counts: { sick: 0, dead: 0, atRisk: 0 } } })),
    (err) => err.field === 'livestock.counts'
  );
  // negative -> rejected
  assert.throws(
    () => store.addReport(validReportInput({ livestock: { counts: { sick: -1, dead: 0, atRisk: 0 } } })),
    (err) => err.field === 'livestock.counts.sick'
  );
  // fractional -> rejected
  assert.throws(
    () => store.addReport(validReportInput({ livestock: { counts: { sick: 2.5, dead: 0, atRisk: 0 } } })),
    (err) => err.field === 'livestock.counts.sick'
  );
  // omitted counts default to zero; one positive count is enough
  const ok = store.addReport(validReportInput({ livestock: { counts: { dead: 3 } } }));
  assert.deepEqual(ok.livestock.counts, { sick: 0, dead: 3, atRisk: 0 });
});

test('duration must be a positive number in hours, days or weeks', () => {
  const store = makeStore();
  for (const bad of [0, -2, 'two', NaN]) {
    assert.throws(
      () => store.addReport(validReportInput({ livestock: { durationValue: bad } })),
      (err) => err.field === 'livestock.durationValue',
      'durationValue ' + String(bad) + ' should be rejected'
    );
  }
  for (const badUnit of ['months', '', undefined]) {
    assert.throws(
      () => store.addReport(validReportInput({ livestock: { durationUnit: badUnit } })),
      (err) => err.field === 'livestock.durationUnit'
    );
  }
});

test('reports survive the store being recreated from the same storage', () => {
  const storage = memoryStorage();
  let n = 0;
  const nextId = () => 'id-' + (++n);
  const first = HerdSignal.createStore({ storage, now: () => T0, uid: nextId });
  const report = first.addReport(validReportInput());
  // a fresh store (e.g. the page reloaded) over the same adapter sees the same data
  const second = HerdSignal.createStore({ storage, now: () => T0, uid: nextId });
  const readBack = second.getReport(report.id);
  assert.equal(readBack.reporter.name, 'Anna Shipanga');
  assert.deepEqual(readBack.livestock.symptoms, ['diarrhoea']);
  // and the new store can keep working on top of the restored data
  const another = second.addReport(validReportInput());
  assert.notEqual(another.id, report.id);
  assert.equal(second.listReports().length, 2);
});

test('reports can be filtered by reporter phone, region, species and status', () => {
  const store = makeStore();
  const anna = store.addReport(validReportInput()); // Oshana, cattle, diarrhoea, Anna
  store.addReport(validReportInput({ livestock: { species: 'goats', symptoms: ['coughing'] } }));
  store.addReport(validReportInput({
    reporter: { name: 'Tomas Uirab', phone: '+264 81 777 8888', region: 'Erongo', village: 'Usakos' },
    livestock: { species: 'donkeys', symptoms: ['wounds'] },
  }));
  // by phone
  const annas = store.listReports({ reporterPhone: '+264 81 123 4567' });
  assert.equal(annas.length, 2);
  assert.ok(annas.every((r) => r.reporter.phone === '+264 81 123 4567'));
  // by region
  const erongo = store.listReports({ region: 'Erongo' });
  assert.equal(erongo.length, 1);
  assert.equal(erongo[0].livestock.species, 'donkeys');
  // by species
  const goats = store.listReports({ species: 'goats' });
  assert.equal(goats.length, 1);
  // combined filters
  const narrow = store.listReports({ reporterPhone: '+264 81 123 4567', species: 'cattle' });
  assert.equal(narrow.length, 1);
  assert.equal(narrow[0].id, anna.id);
  // by status
  assert.equal(store.listReports({ status: 'open' }).length, 3);
  store.closeCase(anna.id, 'farmer', 'recovered');
  assert.equal(store.listReports({ status: 'open' }).length, 2);
  assert.equal(store.listReports({ status: 'resolved' }).length, 1);
  // no filters -> everything
  assert.equal(store.listReports().length, 3);
});

test('listed reports come newest first by default', () => {
  let t = T0;
  let n = 0;
  const store = HerdSignal.createStore({
    storage: memoryStorage(),
    now: () => (t += 60 * 1000),
    uid: () => 'id-' + (++n),
  });
  const first = store.addReport(validReportInput());
  const second = store.addReport(validReportInput());
  const third = store.addReport(validReportInput());
  const listed = store.listReports();
  assert.deepEqual(listed.map((r) => r.id), [third.id, second.id, first.id]);
});

test('reading a report hands out a copy; editing it does not touch the stored record', () => {
  const store = makeStore();
  const report = store.addReport(validReportInput());
  const handedOut = store.getReport(report.id);
  handedOut.status = 'resolved';
  handedOut.livestock.counts.sick = 999;
  const readBack = store.getReport(report.id);
  assert.equal(readBack.status, 'open');
  assert.equal(readBack.livestock.counts.sick, 2);
});

test('an unknown report id reads back as nothing', () => {
  const store = makeStore();
  assert.equal(store.getReport('no-such-id'), null);
});

test('the queue sorts by urgency rank first (emergency, urgent, routine), then newest first', () => {
  let t = T0;
  let n = 0;
  const store = HerdSignal.createStore({
    storage: memoryStorage(),
    now: () => (t += 60 * 1000),
    uid: () => 'id-' + (++n),
  });
  // oldest routine, then an urgent, then an emergency, then a newer routine
  const routineOld = store.addReport(validReportInput({
    livestock: { species: 'donkeys', counts: { sick: 1, dead: 0, atRisk: 0 }, symptoms: ['ticks'], durationValue: 3, durationUnit: 'weeks' },
  }));
  const urgent = store.addReport(validReportInput({
    livestock: { species: 'cattle', counts: { sick: 3, dead: 0, atRisk: 0 }, symptoms: ['salivating or drooling'], durationValue: 2, durationUnit: 'days' },
  }));
  const emergency = store.addReport(validReportInput({
    livestock: { species: 'poultry', counts: { sick: 1, dead: 0, atRisk: 0 }, symptoms: ['sudden death'], durationValue: 1, durationUnit: 'days' },
  }));
  const routineNew = store.addReport(validReportInput({
    livestock: { species: 'goats', counts: { sick: 1, dead: 0, atRisk: 0 }, symptoms: ['limping'], durationValue: 4, durationUnit: 'days' },
  }));
  const listed = store.listReports();
  assert.deepEqual(listed.map((r) => r.id), [emergency.id, urgent.id, routineNew.id, routineOld.id]);
  assert.equal(listed[0].triage.level, 'emergency');
  assert.equal(listed[2].triage.level, 'routine');
});
