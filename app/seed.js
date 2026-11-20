/* HerdSignal — demonstration seed data.
   Seeds a realistic Namibian dataset through the PUBLIC store API only, using
   the injected clock so every timestamp is relative to first load. Villages,
   farmers, vets and phone numbers are fictional; region names and approximate
   coordinates are real. Runs only when the store is empty. */

(function () {
  'use strict';

  var DAY = 24 * 60 * 60 * 1000;
  var HOUR = 60 * 60 * 1000;

  /* Farmer identities the demo persona switcher can act as. Phones link the
     personas to their seeded cases ("My reports" filters by phone). */
  var PERSONAS = [
    { name: 'Selma Nangolo', phone: '+264 81 244 7801', region: 'Oshana', village: 'Oshakati', lat: -15.063, lng: 15.5 },
    { name: 'Petrus Gawanas', phone: '+264 81 128 5510', region: 'Otjozondjupa', village: 'Otjiwarongo', lat: -20.463, lng: 17.206 },
    { name: 'Hileni Shikaleka', phone: '+264 81 309 2217', region: 'Omusati', village: 'Outapi', lat: -17.508, lng: 14.978 }
  ];

  /* Seeds the store. clock = { freeze(ts), advance(ms) } provided by the shell;
     the store's now() follows it, so all records get staggered, plausible
     timestamps. Leaves the clock frozen — the shell unfreezes it afterwards. */
  function run(store, clock) {
    var start = Date.now();

    function at(daysAgo) { clock.freeze(start - daysAgo * DAY); }

    /* ---------- veterinary roster ---------- */
    at(30);
    store.addVet({ name: 'Dr. Panduleni Shipanga', phone: '+264 81 901 3344', region: 'Oshana', lat: -15.08, lng: 15.49, specialties: ['poultry', 'cattle', 'goats', 'pigs'] });
    store.addVet({ name: 'Dr. Maria Gawanas', phone: '+264 81 445 6677', region: 'Khomas', lat: -22.56, lng: 17.07, specialties: ['cattle', 'sheep', 'goats'] });
    store.addVet({ name: 'Dr. Tangeni Kambonde', phone: '+264 81 228 4410', region: 'Oshikoto', lat: -18.36, lng: 16.12, specialties: ['goats', 'sheep', 'cattle'] });
    store.addVet({ name: 'Dr. Anna Shikongo', phone: '+264 81 663 8890', region: 'Omusati', lat: -17.52, lng: 15.02, specialties: ['poultry', 'pigs', 'goats'] });
    store.addVet({ name: 'Dr. Johan van Wyk', phone: '+264 81 550 1123', region: 'Otjozondjupa', lat: -20.47, lng: 17.19, specialties: ['cattle', 'sheep', 'donkeys'] });
    store.addVet({ name: 'Dr. Lemmy Mutjavikua', phone: '+264 81 887 2205', region: 'Kavango East', lat: -17.93, lng: 19.76, specialties: ['cattle', 'goats', 'pigs', 'dogs'] });
    var vets = {};
    store.listVets().forEach(function (v) { vets[v.name] = v.id; });

    /* ---------- reports, oldest first ---------- */

    at(6);
    store.addReport({
      reporter: { name: 'Selma Nangolo', phone: '+264 81 244 7801', region: 'Omusati', village: 'Okahao', lat: -17.43, lng: 15.13 },
      livestock: { species: 'dogs', counts: { sick: 2, dead: 0, atRisk: 0 }, symptoms: ['ticks'], description: 'Two dogs covered in ticks, weak and not eating well.', durationValue: 1, durationUnit: 'weeks', photoRequested: false }
    });

    at(6 - 1 / 24);
    store.addReport({
      reporter: { name: 'Petrus Gawanas', phone: '+264 81 128 5510', region: 'Otjozondjupa', village: 'Otjiwarongo', lat: -20.463, lng: 17.206 },
      livestock: { species: 'donkeys', counts: { sick: 1, dead: 0, atRisk: 0 }, symptoms: ['wounds'], description: 'A donkey with a raw wound on its back from a poorly fitting harness.', durationValue: 1, durationUnit: 'weeks', photoRequested: false }
    });

    at(5);
    store.addReport({
      reporter: { name: 'Lasarus Uirab', phone: '+264 81 337 8899', region: 'Otjozondjupa', village: 'Otjiwarongo', lat: -20.42, lng: 17.35 },
      livestock: { species: 'sheep', counts: { sick: 0, dead: 0, atRisk: 12 }, symptoms: ['abortions'], description: 'Three ewes lost their lambs this month. The rest of the flock looks thin.', durationValue: 5, durationUnit: 'days', photoRequested: false }
    });

    at(5 - 2 / 24);
    var fCattle = store.addReport({
      reporter: { name: 'Selma Nangolo', phone: '+264 81 244 7801', region: 'Oshana', village: 'Oshakati', lat: -15.063, lng: 15.5 },
      livestock: { species: 'cattle', counts: { sick: 1, dead: 0, atRisk: 0 }, symptoms: ['limping'], description: 'One cow limping on the front right leg since the rains started.', durationValue: 2, durationUnit: 'weeks', photoRequested: false }
    });
    clock.advance(1 * DAY);
    store.takeCase(fCattle.id, vets['Dr. Panduleni Shipanga']);
    clock.advance(20 * 60 * 1000);
    store.postGuidance(fCattle.id, vets['Dr. Panduleni Shipanga'], 'Check between the toes for a thorn or stone and rinse the leg with clean water. Keep her on soft ground and separate her from the herd if the swelling grows. I will pass the kraal this week and look at her.');
    clock.advance(1 * DAY);
    store.closeCase(fCattle.id, 'farmer', 'recovered', 'She walked better after two days, no swelling left.');

    at(4.5);
    var dCattle = store.addReport({
      reporter: { name: 'Petrus Gawanas', phone: '+264 81 128 5510', region: 'Otjozondjupa', village: 'Otjiwarongo', lat: -20.463, lng: 17.206 },
      livestock: { species: 'cattle', counts: { sick: 2, dead: 0, atRisk: 8 }, symptoms: ['salivating or drooling', 'not eating'], description: 'Two oxen drooling thick saliva and refusing feed. They stand apart from the others.', durationValue: 2, durationUnit: 'days', photoRequested: true }
    });
    clock.advance(2 * HOUR);
    store.takeCase(dCattle.id, vets['Dr. Johan van Wyk']);
    clock.advance(15 * 60 * 1000);
    store.postGuidance(dCattle.id, vets['Dr. Johan van Wyk'], 'Do not move, sell or slaughter these animals and keep visitors away from the kraal. Offer soft feed and clean water. Drooling in cattle can spread fast, so this needs a farm visit — I am arranging one.');
    clock.advance(1 * DAY);
    store.arrangeTreatment(dCattle.id, vets['Dr. Johan van Wyk'], { what: 'Farm visit arranged: state vet to inspect the oxen on Friday morning. Herd must stay in the kraal until then.', when: 'Friday 09:00' });

    at(4);
    store.addReport({
      reporter: { name: 'Selma Nangolo', phone: '+264 81 244 7801', region: 'Oshana', village: 'Oshakati' },
      livestock: { species: 'cattle', counts: { sick: 3, dead: 1, atRisk: 14 }, symptoms: ['lumps or swelling', 'not eating'], description: 'Hard lumps on the skin of three cattle. One young bull died yesterday. Reported at the clinic phone, no GPS position.', durationValue: 4, durationUnit: 'days', photoRequested: true }
    });

    at(3.2);
    var eGoats = store.addReport({
      reporter: { name: 'Hileni Shikaleka', phone: '+264 81 309 2217', region: 'Omusati', village: 'Outapi', lat: -17.508, lng: 14.978 },
      livestock: { species: 'goats', counts: { sick: 3, dead: 1, atRisk: 0 }, symptoms: ['diarrhoea'], description: 'Kids with watery diarrhoea. One died this morning. They share a water point with the neighbour\'s flock.', durationValue: 4, durationUnit: 'days', photoRequested: false }
    });
    clock.advance(3 * HOUR);
    store.takeCase(eGoats.id, vets['Dr. Anna Shikongo']);
    clock.advance(1 * HOUR);
    store.postGuidance(eGoats.id, vets['Dr. Anna Shikongo'], 'Separate the sick kids and give clean water with a pinch of salt. Move the water point away from where the neighbour\'s flock drinks. Watch for sunken eyes and tell me at once if more kids stop eating.');

    at(3);
    store.addReport({
      reporter: { name: 'Ndapewa Haufiku', phone: '+264 81 662 4711', region: 'Oshikoto', village: 'Omuthiya', lat: -18.35, lng: 16.13 },
      livestock: { species: 'pigs', counts: { sick: 6, dead: 0, atRisk: 4 }, symptoms: ['coughing', 'not eating'], description: 'Six pigs coughing in the mornings and eating less. The pen is muddy after the rains.', durationValue: 3, durationUnit: 'days', photoRequested: false }
    });

    /* Outbreak cluster: three poultry farms, same signs, close together,
       inside a week — raises one signal with three distinct reporters. */
    at(2);
    store.addReport({
      reporter: { name: 'Selma Nangolo', phone: '+264 81 244 7801', region: 'Oshana', village: 'Oshakati', lat: -15.07, lng: 15.52 },
      livestock: { species: 'poultry', counts: { sick: 12, dead: 7, atRisk: 20 }, symptoms: ['sudden death', 'not eating'], description: 'Chickens dying overnight, feathers ruffled, too weak to stand by morning.', durationValue: 2, durationUnit: 'days', photoRequested: true }
    });

    at(1.2);
    store.addReport({
      reporter: { name: 'Petrus Amukoto', phone: '+264 81 556 1188', region: 'Oshana', village: 'Oshakati', lat: -15.095, lng: 15.535 },
      livestock: { species: 'poultry', counts: { sick: 30, dead: 15, atRisk: 45 }, symptoms: ['sudden death', 'difficulty breathing'], description: 'My flock is dying fast since Sunday. Neighbours say their birds too.', durationValue: 1, durationUnit: 'days', photoRequested: true }
    });

    at(1);
    store.addReport({
      reporter: { name: 'Hileni Iipinge', phone: '+264 81 774 9032', region: 'Oshana', village: 'Okatana', lat: -15.125, lng: 15.462 },
      livestock: { species: 'poultry', counts: { sick: 8, dead: 4, atRisk: 0 }, symptoms: ['sudden death', 'diarrhoea'], description: 'Greenish droppings and sudden deaths in the hens. Started three days ago.', durationValue: 3, durationUnit: 'days', photoRequested: false }
    });
  }

  window.HerdSignalSeed = { PERSONAS: PERSONAS, run: run };
})();
