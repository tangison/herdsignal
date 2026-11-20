'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const HerdSignal = require('../app/domain.js');

const T0 = Date.parse('2026-11-16T08:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

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

// Villages around Oshakati, roughly 2-6 km apart, so they cluster.
function villageReport(store, who, symptom, daysAgo, lat, lng) {
  currentTime = T0 - daysAgo * DAY;
  return store.addReport({
    reporter: {
      name: who.name, phone: who.phone, region: 'Oshana', village: who.village,
      lat, lng,
    },
    livestock: {
      species: 'goats',
      counts: { sick: 2, dead: 0, atRisk: 1 },
      symptoms: [symptom],
      description: '',
      durationValue: 2,
      durationUnit: 'days',
      photoRequested: false,
    },
  });
}

const anna = { name: 'Anna Shipanga', phone: '+264 81 111 1111', village: 'Oshakati' };
const tomas = { name: 'Tomas Uirab', phone: '+264 81 222 2222', village: 'Okatana' };
const maria = { name: 'Maria Gawanas', phone: '+264 81 333 3333', village: 'Ongwediva' };

test('three nearby farms with the same sign within a week raise one signal listing all three', () => {
  const store = makeStore();
  const r1 = villageReport(store, anna, 'diarrhoea', 3, -17.78, 15.83);
  const r2 = villageReport(store, tomas, 'diarrhoea', 2, -17.80, 15.85);
  const r3 = villageReport(store, maria, 'diarrhoea', 1, -17.76, 15.81);
  const signals = store.scanSignals();
  assert.equal(signals.length, 1);
  const signal = signals[0];
  assert.deepEqual(signal.reportIds.sort(), [r1.id, r2.id, r3.id].sort());
  assert.deepEqual(signal.sharedSymptoms, ['diarrhoea']);
  assert.equal(signal.reporters.length, 3);
  const area = signal.area;
  assert.match(area, /Oshana/);
  const span = signal.lastAt - signal.firstAt;
  assert.ok(span <= 7 * DAY && span >= 2 * DAY);
});

test('identical reports too far apart do not raise a signal', () => {
  const store = makeStore();
  // two farms near Oshakati, one near Grootfontein (~350 km away)
  villageReport(store, anna, 'diarrhoea', 3, -17.78, 15.83);
  villageReport(store, tomas, 'diarrhoea', 2, -17.80, 15.85);
  villageReport(store, maria, 'diarrhoea', 1, -19.57, 18.12);
  assert.deepEqual(store.scanSignals(), []);
});

test('identical nearby reports too far apart in time do not raise a signal', () => {
  const store = makeStore();
  villageReport(store, anna, 'diarrhoea', 20, -17.78, 15.83);
  villageReport(store, tomas, 'diarrhoea', 10, -17.80, 15.85);
  villageReport(store, maria, 'diarrhoea', 1, -17.76, 15.81);
  assert.deepEqual(store.scanSignals(), []);
});

test('several reports from the same farm do not count as an outbreak', () => {
  const store = makeStore();
  villageReport(store, anna, 'diarrhoea', 3, -17.78, 15.83);
  villageReport(store, anna, 'diarrhoea', 2, -17.79, 15.84);
  villageReport(store, anna, 'diarrhoea', 1, -17.77, 15.82);
  assert.deepEqual(store.scanSignals(), []);
});

test('resolving the cases dissolves the signal on the next scan', () => {
  const store = makeStore();
  const r1 = villageReport(store, anna, 'diarrhoea', 3, -17.78, 15.83);
  villageReport(store, tomas, 'diarrhoea', 2, -17.80, 15.85);
  villageReport(store, maria, 'diarrhoea', 1, -17.76, 15.81);
  assert.equal(store.scanSignals().length, 1);
  store.closeCase(r1.id, 'farmer', 'recovered');
  assert.deepEqual(store.scanSignals(), []);
});

test('a signal names every symptom the same farms share, once', () => {
  const store = makeStore();
  villageReport(store, anna, 'not eating', 2, -17.78, 15.83);
  villageReport(store, tomas, 'not eating', 2, -17.80, 15.85);
  villageReport(store, maria, 'not eating', 1, -17.76, 15.81);
  villageReport(store, anna, 'diarrhoea', 2, -17.78, 15.83);
  villageReport(store, tomas, 'diarrhoea', 2, -17.80, 15.85);
  villageReport(store, maria, 'diarrhoea', 1, -17.76, 15.81);
  const signals = store.scanSignals();
  assert.equal(signals.length, 1, 'the same six reports are one signal, not two');
  assert.deepEqual(signals[0].sharedSymptoms, ['diarrhoea', 'not eating']);
  assert.equal(signals[0].reportIds.length, 6, 'every member report is listed');
  assert.equal(signals[0].reporters.length, 3, 'three distinct farms');
});

test('resolved cases do not feed new signals even while other cases still do', () => {
  const store = makeStore();
  villageReport(store, anna, 'diarrhoea', 3, -17.78, 15.83);
  villageReport(store, tomas, 'diarrhoea', 2, -17.80, 15.85);
  const active = villageReport(store, maria, 'diarrhoea', 1, -17.76, 15.81);
  const closed = villageReport(store, { name: 'Petrus Herman', phone: '+264 81 444 4444', village: 'Okatana' }, 'diarrhoea', 1, -17.79, 15.84);
  store.closeCase(closed.id, 'vet', 'recovered');
  const signals = store.scanSignals();
  assert.equal(signals.length, 1);
  assert.equal(signals[0].reportIds.length, 3);
  assert.ok(signals[0].reportIds.indexOf(closed.id) === -1);
  assert.ok(signals[0].reportIds.indexOf(active.id) !== -1);
});
