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

// The clock: tests set `currentTime` (or use advance()) to control time.
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
      { name: 'Anna Shipanga', phone: '+264 81 123 4567', region: 'Oshana', village: 'Oshakati', lat: -17.78, lng: 15.83 },
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
  const o = overrides || {};
  return {
    name: 'DrNdapewa',
    phone: '+264 81 555 0001',
    region: 'Oshana',
    lat: -17.79,
    lng: 15.85,
    specialties: ['cattle', 'goats'],
    ...o,
  };
}

test('a vet can be registered with location and specialties, and read back', () => {
  const store = makeStore();
  const vet = store.addVet(vetInput());
  assert.equal(vet.id, 'id-1');
  assert.equal(vet.name, 'DrNdapewa');
  assert.equal(vet.region, 'Oshana');
  assert.deepEqual(vet.specialties, ['cattle', 'goats']);
  const listed = store.listVets();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, vet.id);
});

test('matching puts the nearest vet that treats the species first, with plain reasons', () => {
  const store = makeStore();
  const near = store.addVet(vetInput({ name: 'DrNear', lat: -17.9, lng: 15.9, specialties: ['cattle', 'goats'] })); // ~15 km
  const far = store.addVet(vetInput({ name: 'DrFar', lat: -19.5, lng: 17.5, specialties: ['dogs'] })); // ~240 km, wrong species
  const report = store.addReport(reportInput()); // cattle near Oshakati
  const suggestions = store.suggestVets(report.id);
  assert.equal(suggestions.length, 2);
  assert.equal(suggestions[0].vet.id, near.id);
  assert.equal(suggestions[1].vet.id, far.id);
  assert.equal(typeof suggestions[0].distanceKm, 'number');
  assert.ok(suggestions[0].distanceKm < 25, 'near vet should be a short distance');
  const reasons = suggestions[0].reasons.join(' | ');
  assert.match(reasons, new RegExp(Math.round(suggestions[0].distanceKm) + ' km away'));
  assert.match(reasons, /treats cattle/i);
  assert.match(reasons, /light caseload|no open cases/i);
  // the far vet's entry carries its distance too
  assert.equal(typeof suggestions[1].distanceKm, 'number');
  assert.ok(suggestions[1].distanceKm > 100);
});

test('a vet who treats the species outranks a closer vet who does not', () => {
  const store = makeStore();
  const closeWrong = store.addVet(vetInput({ name: 'DrClose', lat: -17.9, lng: 15.9, specialties: ['dogs'] }));
  const fitFar = store.addVet(vetInput({ name: 'DrRight', lat: -18.7, lng: 16.9, specialties: ['cattle'] })); // ~135 km
  const report = store.addReport(reportInput()); // cattle
  const suggestions = store.suggestVets(report.id);
  assert.equal(suggestions[0].vet.id, fitFar.id, 'specialty fit beats raw distance');
  assert.equal(suggestions[1].vet.id, closeWrong.id);
});

test('taking a case records the vet on the timeline and makes matching see the busier caseload', () => {
  const store = makeStore();
  const busy = store.addVet(vetInput({ name: 'DrBusy', lat: -17.9, lng: 15.9 }));
  const free = store.addVet(vetInput({ name: 'DrFree', lat: -17.9001, lng: 15.9001 }));
  const report = store.addReport(reportInput());
  // before: the two identical vets tie; after taking three cases the other one ranks first
  const taken = store.takeCase(report.id, busy.id);
  assert.equal(taken.status, 'responded');
  assert.equal(taken.assignedVet, busy.id);
  const lastEntry = taken.timeline[taken.timeline.length - 1];
  assert.equal(lastEntry.kind, 'takeover');
  assert.equal(lastEntry.at, T0);
  assert.equal(lastEntry.actor, 'vet');
  assert.equal(lastEntry.meta.vetId, busy.id);

  const other1 = store.addReport(reportInput());
  const other2 = store.addReport(reportInput());
  const other3 = store.addReport(reportInput());
  store.takeCase(other1.id, busy.id);
  store.takeCase(other2.id, busy.id);
  store.takeCase(other3.id, busy.id);

  const suggestions = store.suggestVets(report.id);
  assert.equal(suggestions[0].vet.id, free.id, 'the vet with the light caseload comes first');
  const busyEntry = suggestions.find((s) => s.vet.id === busy.id);
  assert.match(busyEntry.reasons.join(' '), /4 open cases/);
});

test('guidance, treatment details and internal notes land in the timeline in order', () => {
  const store = makeStore();
  const vet = store.addVet(vetInput());
  const report = store.addReport(reportInput());
  advance(30 * 60 * 1000); // vet acts half an hour later
  store.takeCase(report.id, vet.id);
  advance(10 * 60 * 1000);
  const afterGuidance = store.postGuidance(report.id, vet.id,
    'Keep the cattle apart and give clean water. I will call you this afternoon.');
  advance(20 * 60 * 1000);
  const afterTreatment = store.arrangeTreatment(report.id, vet.id, {
    what: 'Farm visit tomorrow morning to treat the limping cow',
    when: '2026-11-17 08:00',
  });
  advance(5 * 60 * 1000);
  const afterNote = store.addInternalNote(report.id, vet.id,
    'Suspect foot injury, not contagious. Owner cooperative.');
  assert.equal(afterGuidance.status, 'responded');
  assert.equal(afterTreatment.status, 'treatment_arranged');
  const kinds = afterNote.timeline.map((e) => e.kind);
  assert.deepEqual(kinds, ['created', 'takeover', 'guidance', 'treatment', 'note']);
  const guidanceEntry = afterNote.timeline[2];
  assert.equal(guidanceEntry.actor, 'vet');
  assert.equal(guidanceEntry.at, T0 + 40 * 60 * 1000);
  const treatmentEntry = afterNote.timeline[3];
  assert.equal(treatmentEntry.meta.what, 'Farm visit tomorrow morning to treat the limping cow');
  assert.equal(treatmentEntry.meta.when, '2026-11-17 08:00');
  const noteEntry = afterNote.timeline[4];
  assert.equal(noteEntry.actor, 'vet');
  assert.equal(noteEntry.kind, 'note');
});

test('a vet can overrule the urgency; the machine rating stays visible next to it', () => {
  const store = makeStore();
  const vet = store.addVet(vetInput());
  const report = store.addReport(reportInput({
    livestock: { species: 'donkeys', counts: { sick: 1, dead: 0, atRisk: 0 }, symptoms: ['ticks'], durationValue: 3, durationUnit: 'weeks' },
  }));
  const originalLevel = report.triage.level; // routine
  advance(15 * 60 * 1000);
  const afterOverrule = store.overruleUrgency(report.id, vet.id, 'emergency',
    'Ticks plus the described fever — this looks like a spreading disease.');
  // the machine's original rating is unchanged and still readable
  assert.equal(afterOverrule.triage.level, originalLevel);
  assert.ok(afterOverrule.triage.reasons.length > 0);
  // the overrule is on the record
  assert.equal(afterOverrule.urgencyOverrule.from, originalLevel);
  assert.equal(afterOverrule.urgencyOverrule.to, 'emergency');
  assert.equal(afterOverrule.urgencyOverrule.reason, 'Ticks plus the described fever — this looks like a spreading disease.');
  assert.equal(afterOverrule.urgencyOverrule.at, T0 + 15 * 60 * 1000);
  // and it is on the timeline
  const last = afterOverrule.timeline[afterOverrule.timeline.length - 1];
  assert.equal(last.kind, 'overrule');
  assert.equal(last.meta.from, originalLevel);
  assert.equal(last.meta.to, 'emergency');
});

test('a vet can close a case with an outcome; the farmer can too', () => {
  const store = makeStore();
  const vet = store.addVet(vetInput());
  const report = store.addReport(reportInput());
  store.takeCase(report.id, vet.id);
  advance(2 * 24 * 60 * 60 * 1000);
  const closed = store.closeCase(report.id, 'vet', 'recovered', 'Treated on farm, walking well.');
  assert.equal(closed.status, 'resolved');
  assert.deepEqual(closed.outcome, {
    result: 'recovered',
    note: 'Treated on farm, walking well.',
    at: T0 + 2 * 24 * 60 * 60 * 1000,
    actor: 'vet',
  });
  const last = closed.timeline[closed.timeline.length - 1];
  assert.equal(last.kind, 'outcome');
  assert.equal(last.at, closed.outcome.at);

  // a farmer can confirm an outcome without a vet
  const report2 = store.addReport(reportInput());
  const closed2 = store.closeCase(report2.id, 'farmer', 'died');
  assert.equal(closed2.status, 'resolved');
  assert.equal(closed2.outcome.result, 'died');
  assert.equal(closed2.outcome.actor, 'farmer');
  assert.equal(closed2.outcome.note, undefined);
});

test('a closed case is closed: no guidance, no second outcome', () => {
  const store = makeStore();
  const vet = store.addVet(vetInput());
  const report = store.addReport(reportInput());
  store.takeCase(report.id, vet.id);
  store.closeCase(report.id, 'vet', 'recovered');
  assert.throws(
    () => store.postGuidance(report.id, vet.id, 'too late'),
    (err) => err.field === 'status'
  );
  assert.throws(
    () => store.takeCase(report.id, vet.id),
    (err) => err.field === 'status'
  );
  assert.throws(
    () => store.arrangeTreatment(report.id, vet.id, { what: 'x', when: 'y' }),
    (err) => err.field === 'status'
  );
  assert.throws(
    () => store.closeCase(report.id, 'farmer', 'died'),
    (err) => err.field === 'status'
  );
  // the record still shows the one true outcome
  assert.equal(store.getReport(report.id).outcome.result, 'recovered');
});

test('lifecycle actions with an unknown report or vet are rejected', () => {
  const store = makeStore();
  const vet = store.addVet(vetInput());
  const report = store.addReport(reportInput());
  assert.throws(() => store.takeCase('nope', vet.id), (err) => err.field === 'reportId');
  assert.throws(() => store.takeCase(report.id, 'nope'), (err) => err.field === 'vetId');
  assert.throws(() => store.postGuidance('nope', vet.id, 'x'), (err) => err.field === 'reportId');
  assert.throws(() => store.suggestVets('nope'), (err) => err.field === 'reportId');
});

test('after an overrule, the queue filter follows the vet rating, the record keeps both', () => {
  const store = makeStore();
  const vet = store.addVet(vetInput());
  const report = store.addReport(reportInput({
    livestock: { species: 'donkeys', counts: { sick: 1, dead: 0, atRisk: 0 }, symptoms: ['ticks'], durationValue: 3, durationUnit: 'weeks' },
  }));
  store.overruleUrgency(report.id, vet.id, 'emergency', 'Second donkey down overnight.');
  // the effective urgency is what the queue filters on
  assert.equal(store.listReports({ urgency: 'emergency' }).length, 1);
  assert.equal(store.listReports({ urgency: 'routine' }).length, 0);
  // and the stored record still carries the machine rating
  const readBack = store.getReport(report.id);
  assert.equal(readBack.triage.level, 'routine');
  assert.equal(readBack.urgencyOverrule.to, 'emergency');
});
