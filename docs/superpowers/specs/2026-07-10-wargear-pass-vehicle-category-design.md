# Wargear Pass + Vehicle Wargear Category — Design

**Date:** 2026-07-10
**Status:** Approved

## Context

The Redacted Records II weapons pass (commit `f4e9d6f`) revealed that RR2 contributed
almost nothing to the dataset beyond one (incorrect) weapon, and spot checks found other
coverage holes (e.g. the FSPG Skitarii Auto-cuirass is absent from `armor.json` even though
the creator's Skitarius archetype references it). Separately, vehicle-mounted gear — 152
`Vehicle - *` weapons in `weapons.json` and 50 `vehicle wargear` items in `equipment.json`,
all from Church of Steel — is lumped into the generic Weapons/Equipment buckets in both
apps' Compendium.

## Scope decisions (user-confirmed)

1. **Wargear pass covers RR2's remaining statted wargear AND a gap audit of every official
   sourcebook** — all wargear types: weapons, armour, equipment, augmetics.
2. **Vehicle wargear gets one combined Compendium filter** holding vehicle weapons and
   vehicle equipment, split out of the generic buckets (same pattern as Grenades & Missiles).
3. **Apocrypha is excluded from the audit** — its gap lists are already tracked on issue #15
   and await separate scope decisions. Adventure modules and bestiary books are also out;
   the audit reads only `../.QK-Wrath-and-Glory-reference/books/official-sourcebooks/`.

## Delivery: two phases

Phase 1 ships the known, already-verified work immediately; Phase 2 is the audit. Each
phase is committed, verified, and deployed independently.

### Phase 1a — RR2 data additions

- **`armor.json`**: Novitiate Armour (AR 3, no traits, Value 3, Rarity 2 → Uncommon;
  IMPERIUM, ADEPTUS MINISTORUM, ADEPTA SORORITAS; p. 45) and Sacresant Shield (AR *3,
  traits Shield, Power Field; Value 6, Rarity 3 → Rare; FORCE FIELD, IMPERIUM, ADEPTUS
  MINISTORUM, ADEPTA SORORITAS; p. 45). `type` and starred-AR notation follow existing
  `armor.json` shield/light entries — confirm exact shapes against existing entries during
  implementation.
- **`equipment.json`, new `ritual` category**: Hephestian Foresight (Value 8, Rare, p. 9)
  and Julyanna's Banishment (Value 9, Very Rare, p. 10). Rituals are requisitioned exactly
  like wargear (RR2 p. 9), so they belong in the requisitionable dataset. Verbatim
  `description` + `effect` split following the dh relic entry shape.
- **`equipment.json`, existing `relic` category**: the named relics of RR2 pp. 20–27
  (Relics of Renown and Malign Artefacts chapters — exact inventory taken from the pages
  during implementation, e.g. Rosarius of Saint Agatha). dh-relic entry shape, verbatim
  text, `value`/`rarity` only where the book prints them, otherwise `"-"`.
- **Out of data scope**: the relic-creation system (pp. 12–19, GM tables — future Rules
  Reference candidate, report only) and RR2 gear that is named but never statted
  (Corpuscarii/Fulgrite Robes, Pteraxii Flight Pack, Datasmith Robes, Cyber-beasts —
  the beasts exist only as p. 54 threat statblocks). These go in the findings report.

### Phase 1b — Vehicle Wargear Compendium filter

- In **both** `creator/tabs/references-tab.js` and `bestiary/tabs/references-tab.js`
  (parallel copies with intentional divergences — apply the same logic to each, do not
  sync the files): during index build, route weapons whose `category` starts with
  `Vehicle` and equipment whose `category` is `vehicle wargear` into a new
  `vehicleWargear` bucket (display name "Vehicle Wargear"), and add its filter button
  after "Grenades & Missiles". Entries leave the generic Weapons/Equipment buckets.
- Cache busting per CLAUDE.md: bump `?v=` on ALL `<script>`/`<link>` tags in both apps'
  `index.html`, and bump the creator's data `?v=` for the data-file changes.

### Phase 2 — All-books wargear audit

- **Books** (from `official-sourcebooks/`): Core Rulebook, Forsaken System Player's
  Guide, Redacted Records I, Redacted Records II (non-weapon remainder as a double
  check), Church of Steel, Vow of Absolution, Aeldari Inheritance of Embers, Departmento
  Munitorum Shotguns.
- **Method**: one extraction subagent per book (Opus — Sonnet has misread dense stat
  tables before) produces a complete wargear inventory with page cites. The main session
  diffs each inventory against `weapons.json` / `armor.json` / `equipment.json`
  (augmetics live in `equipment.json` category `augmetic`), then re-verifies every real
  gap against pdftoppm-rendered pages before adding anything.
- **Additions**: only items the book stats. Verbatim text; established conventions apply
  (numeric rarity 1=Common, 2=Uncommon, 3=Rare, 4=Very Rare; missing display values
  `"-"`; secondary weapon profiles in `special`; melee damage as
  `{base: N, attribute: "strength", bonus: 0}`; `[AI-Generated]` prefix only where the
  book has no text).
- **Duplicates/conflicts**: identical reprints across books keep the earliest official
  entry (as with RR2's Taser Goad → fspg). Same-name items with different stats get
  separate entries only if they are genuinely different items; stat conflicts between
  printings are flagged in the findings report, not silently resolved.
- **Commits**: one commit per book (bot author), pushed as completed so deploys are
  incremental and diffs reviewable.
- **Findings report**: unstatted references, narrative-only items, book typos preserved
  verbatim, and stat conflicts — delivered at the end for user decisions.

## Verification

Per phase: `weapons.json`/`armor.json`/`equipment.json` parse with expected entry-count
deltas and no duplicate ids; then a browser pass (repo root served on port 8137) driving
both apps' Compendium — the Vehicle Wargear filter shows vehicle items and the generic
buckets no longer contain them; sample new entries render with correct stats and source
citations.

## Success criteria

- RR2 contributes its full statted wargear to the shared dataset.
- Both Compendiums have a working Vehicle Wargear filter.
- Every official sourcebook's statted wargear is either present in the dataset or
  explicitly listed in the findings report with a reason.
