# HerdSignal domain API (frozen)

The domain core lives in `app/domain.js`: plain JavaScript, no imports, no
dependencies. UMD-style loading — Node tests get it via `require`, the browser
gets `window.HerdSignal`. Run the suite from the repository root with:

```
node --test
```

(Node 24 resolves the directory argument `node --test test/` as a module path;
plain `node --test` auto-discovers `test/*.test.js` and is the supported form.)

Every value the store hands out (reports, vets, signals, stats) is a fresh JSON
copy; mutating it never touches stored state. Every mutation serializes the
whole state through the injected storage adapter immediately.

## Exported constants (render UI picklists from these)

- `HerdSignal.SPECIES` — canonical animal types:
  `['cattle','goats','sheep','poultry','donkeys','pigs','dogs','other']`
- `HerdSignal.SYMPTOMS` — canonical plain-language symptom checklist (16):
  `['sudden death','difficulty breathing','diarrhoea','not eating','limping',
  'coughing','lumps or swelling','salivating or drooling','ticks','wounds',
  'abortions','bloat','wobbling or staggering','skin sores','cloudy or red eyes',
  'nose discharge']`
- `HerdSignal.URGENCY_LEVELS` — `['emergency','urgent','routine']`
- `HerdSignal.DURATION_UNITS` — `['hours','days','weeks']`

## createStore

```
createStore({ storage, now, uid }) -> store
```

- `storage`: adapter `{ read() -> any|null, write(state) }`. `read()` returns the
  last written state (parsed) or `null` on first run / empty storage. The store
  writes its **entire** state on every mutation.
- `now`: `() -> Number`, epoch milliseconds, injected clock.
- `uid`: `() -> String`, injected id generator (must be collision-free for the
  lifetime of the persisted data — across reloads too).

## Report record (returned by addReport/getReport/listReports)

```
{
  id, createdAt,                          // from injected uid/now
  status,                                 // 'open' | 'responded' | 'treatment_arranged' | 'resolved'
  reporter: { name, phone, region, village?, lat?, lng? },
  livestock: {
    species, counts: { sick, dead, atRisk },
    symptoms: [String],                   // from HerdSignal.SYMPTOMS
    description, durationValue, durationUnit, photoRequested
  },
  triage: { level, reasons: [String], guidance: [String], score },
  assignedVet,                            // vet id once a vet took the case (addition vs PRD shape)
  timeline: [ { at, actor, kind, text, meta } ],
  urgencyOverrule?: { from, to, reason, at },
  outcome?: { result, note?, at, actor }  // actor 'vet' | 'farmer'
}
```

Timeline `actor` is `'farmer'` or `'vet'`; `meta` carries ids and action detail.
Timeline kinds in order of appearance: `created`, `takeover`, `guidance`,
`treatment`, `note`, `overrule`, `outcome` (each action appends exactly one
entry).

## Reports

```
store.addReport(input) -> report
```

`input = { reporter: { name, phone, region, village?, lat?, lng? },
livestock: { species, counts: { sick?, dead?, atRisk? }, symptoms: [String],
description?, durationValue, durationUnit, photoRequested? } }`.

Validation (throws `Error` with `.field` naming the offending path; message is
farmer-readable):

- `reporter.name`, `reporter.phone`, `reporter.region` — required, non-blank.
- `livestock.species` — required, must be in `HerdSignal.SPECIES`.
- `livestock.symptoms` — array; each entry must be in `HerdSignal.SYMPTOMS`;
  either at least one symptom **or** a non-blank `description` is required.
- `livestock.counts` — each of sick/dead/atRisk defaults to 0 and must be an
  integer >= 0; at least one must be > 0.
- `livestock.durationValue` — finite number > 0; `durationUnit` in
  `['hours','days','weeks']`.
- `lat`/`lng` optional numbers (used by matching and clusters when present).

The report is triaged at creation (below) and gets one `created` timeline entry.

```
store.getReport(id) -> report | null      // unknown id returns null
store.listReports(query?) -> [report]
```

`query`: `{ reporterPhone?, region?, species?, urgency?, status?, sort? }` —
all filters combinable, omitted filters don't restrict. The `urgency` filter
matches the **effective** urgency (a vet overrule wins; see below). Default
order: urgency rank (emergency, urgent, routine) first, newest first within a
rank — the vet queue order. A `sort` key in the query is ignored (unknown query
keys are); the default ordering above is the only ordering the store applies.

## Vets

```
store.addVet({ name, phone, region, lat, lng, specialties: [species...] }) -> vet
store.listVets() -> [vet]
```

Vet validation: name/phone/region non-blank, `lat`/`lng` finite numbers,
`specialties` entries from `HerdSignal.SPECIES` (empty list allowed). Vet
records: `{ id, name, phone, region, lat, lng, specialties }`. Caseload is
derived from open taken cases, never stored on the vet.

## Case lifecycle

```
store.takeCase(reportId, vetId) -> report            // status -> 'responded'
store.postGuidance(reportId, vetId, text) -> report  // status -> 'responded' if open
store.arrangeTreatment(reportId, vetId, { what, when }) -> report // status -> 'treatment_arranged'
store.addInternalNote(reportId, vetId, text) -> report
store.overruleUrgency(reportId, vetId, level, reason) -> report
store.closeCase(reportId, actorKind, outcome, note?) -> report    // status -> 'resolved'
```

- All of them throw (`err.field` = `'reportId'` / `'vetId'`) when the report or
  vet id is unknown.
- `text`, `what`, `when`, `reason` must be non-blank strings (`err.field` =
  `'text'` / `'what'` / `'when'` / `'reason'`).
- Illegal transitions throw with `err.field === 'status'`: `takeCase`,
  `postGuidance`, `arrangeTreatment`, `overruleUrgency`, `closeCase` on a
  resolved case (no guidance on a closed case, no closing twice). Internal
  notes remain allowed on closed cases — professional record-keeping.
- `overruleUrgency` requires `level` in `URGENCY_LEVELS` and a non-blank
  reason. It stores `urgencyOverrule = { from, to, reason, at }` and never
  touches `triage.level` — the machine rating stays visible next to the vet's
  rating. Queue filtering/sorting and stats use the overruled (effective)
  level.
- `closeCase`: `actorKind` `'vet' | 'farmer'`, `outcome` one of
  `['recovered','died','euthanised','referred']`, optional `note`. Sets
  `outcome = { result, note?, at, actor }` and one `outcome` timeline entry.

## Vet matching

```
store.suggestVets(reportId) -> [{ vet, distanceKm, reasons: [String] }]
```

Score = `0.4 * distanceCloseness + 0.4 * specialtyFit + 0.2 * caseloadAvailability`:

- `distanceCloseness = max(0, 1 - distanceKm / 200)` — haversine km from the
  report's coordinates to the vet's home coordinates. If the report has no
  coordinates, `distanceKm` is `null`, closeness is a neutral 0.5, and a reason
  says the farm location is unknown.
- `specialtyFit = 1` when the reported species is in `vet.specialties`, else 0.
- `caseloadAvailability = max(0, 1 - openTakenCases / 5)` — open means not
  resolved and `assignedVet` is this vet.

Ties break by shorter distance, then vet id. Every entry carries a `distanceKm`
(null when unknown) and plain reasons, e.g. `"15 km away"`, `"treats cattle"`,
`"based in Oshana too"`, `"light caseload"` / `"busy with 4 open cases"`.
Documented weighting consequence: the right specialty outranks raw closeness.

## Outbreak signals

```
store.scanSignals() -> [signal]
```

Recomputed from scratch on every call; nothing about signals is stored.

Parameters (constants in `app/domain.js`): `CLUSTER_RADIUS_KM = 25`,
`CLUSTER_WINDOW_DAYS = 7`, `CLUSTER_MIN_REPORTERS = 3`.

Algorithm: open (non-resolved) reports **with coordinates** are grouped
spatiotemporally — oldest first, a report joins a group when it lies within
25 km of the group's centroid (recomputed on each join) and within 7 days of
the group's earliest report. A group raises a signal when it has >= 3 distinct
reporters (identity = reporter phone) **and** at least one symptom reported by
two or more of those reporters.

```
signal = {
  sharedSymptoms: [String],   // canonical order, each shared by >= 2 reporters
  reportIds: [id],            // all member reports, oldest first
  reporters: [name],          // distinct reporters
  area: "Oshana (Oshakati, Okatana)",   // regions + villages joined
  firstAt, lastAt             // min/max member createdAt
}
```

Signals sort by most reporters, then earliest `lastAt`. Resolving cases
naturally dissolves their signals on the next scan.

## Triage engine (runs inside addReport)

Deterministic rule engine — same input, same output forever. Score:

```
score = (maxSymptomWeight + 0.5 * otherSymptomWeights) * speciesSensitivity
      + comboBonus            // known dangerous species x symptom pairings
      + spreadBonus
```

Symptom weights (`SYMPTOM_WEIGHTS`, 0-10):

| symptom | weight | | symptom | weight |
| --- | --- | --- | --- | --- |
| sudden death | 9 | | diarrhoea | 5 |
| difficulty breathing | 8 | | lumps or swelling | 5 |
| salivating or drooling | 7 | | not eating | 4 |
| abortions | 7 | | coughing | 4 |
| wobbling or staggering | 6 | | nose discharge | 3 |
| bloat | 6 | | skin sores | 3 |
| | | | cloudy or red eyes | 3 |
| | | | limping | 2 |
| | | | ticks | 1 |
| | | | wounds | 1 |

Species sensitivity (`SPECIES_SENSITIVITY`): poultry 1.4, cattle 1.3,
goats/sheep/pigs 1.2, other 1.0, donkeys 0.9, dogs 0.8.

Combo bonuses (`COMBO_BONUS`): poultry x sudden death +4 (classic
fast-spreading flock killer), cattle x salivating or drooling +3, cattle x
lumps or swelling +2, cattle x difficulty breathing +2, goats/sheep x
abortions +2.

Spread bonuses: any dead > 0: +2 (plus +1 more when dead >= 3); total affected
>= 5: +1.5; total >= 2: +0.5; duration in hours with a primary symptom weight
>= 7 (sudden onset of a grave sign): +2.

Levels: score >= 14 emergency, >= 8 urgent, else routine. `triage.score` is
exposed for on-screen explainability.

- `reasons`: plain-language strings citing the actual triggers (the symptom
  named, species pairing called out, counts/deaths/quote of duration). A
  routine case always explains why it is routine.
- `guidance`: 3-5 short farmer-facing while-you-wait actions per level —
  generic first aid only (separate animals, water/shade, do not move/sell/
  slaughter suspected contagious cases, keep dead animals for the vet, note new
  signs, stay reachable). No medical jargon.

## Dashboard stats

```
store.stats() -> {
  openByUrgency: { emergency, urgent, routine },  // open cases, effective urgency
  weekCount,            // reports created within 7 days of now()
  medianResponseMins,   // median minutes createdAt -> first vet action
                        // (takeover or guidance); 0 when no case was answered
  resolutionRate,       // resolved / total reports; 0 when there are none
  byRegion: {},         // open cases only
  bySpecies: {}         // open cases only
}
```

All numbers are computed from the stored records on each call — never cached,
never hardcoded. `medianResponseMins` averages the middle two values for an
even count and is rounded to one decimal.

## Deviations from the target API shape (all documented additions)

1. `report.assignedVet` added — caseload/matching needs the case-owner linkage.
2. `report.triage.score` added — powers the on-screen "why this rating" view.
3. `urgencyOverrule` keeps the original in `triage.level` (original + vet
   rating both visible); `listReports` urgency filter/sort and
   `stats.openByUrgency` follow the overruled (effective) level.
4. `getReport` returns `null` for unknown ids; lifecycle methods throw with
   `err.field` set instead.
5. Internal notes stay legal on closed cases (record-keeping); all other
   lifecycle actions are rejected after close.
6. Cluster grouping is spatiotemporal first, then qualified by a symptom
   shared by >= 2 distinct reporters — so one farm reporting twice with two
   signs still yields one signal, and a group without any shared sign is never
   a signal. Reports without coordinates never join clusters.
