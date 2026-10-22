# Vehicles (Church of Steel) Part 1: Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the 107 *Church of Steel* vehicle stat blocks into `data/vehicles.json`. Put the 12 vehicle traits and the vehicle rules into two new sections of `data/glossary.json`. Verify both against the book and pin them with `scripts/test-vehicles.js`.

**Architecture:** Seven Opus agents transcribe page renders into JSON fragments outside the repo. A throwaway Node script merges the fragments in book order, resolves the weapon and wargear ids by normalised name, and writes the two repo files. An independent Opus pass checks every field against the pages, and a fix round corrects the fragments. The repo test pins the shape, the counts and the likely failures.

**Tech Stack:** Node 22 in WSL; poppler `pdftoppm` and `pdfgrep`; JSON; git in WSL (`/usr/bin/git`).

**Spec:** `docs/superpowers/specs/2026-10-20-vehicles-design.md`. This plan covers §2, the data half of §3, §6, the test script of §7, and Appendices A and B. A separate plan (Part 2) covers the UI: the Vehicles tab, the Encounter Builder, the Rules Reference categories, cache busting and `CLAUDE.md`. Part 2 starts on the `vehicles` branch when Task 1.15 commits the data and the test passes.

## Global Constraints

- Data file: `data/vehicles.json`, "a flat JSON array of 107 entries in book order, one per printed stat block" (spec §2).
- Glossary: two new top-level sections of `data/glossary.json`, `vehicleTraits` and `vehicleRules`. Each is "an object keyed by entry id, each entry with `name`, `description`, `source: "church"` and `page`" (spec §3).
- `source` is `"church"` on every vehicle and on every new glossary entry.
- `faction` is one of 11 strings: `Imperial`, `Adepta Sororitas`, `Adeptus Astartes`, `Adeptus Mechanicus`, `Aeronautica Imperialis`, `Astra Militarum`, `Aeldari`, `Chaos Space Marines`, `Drukhari`, `Necron`, `Ork`.
- `size` is `Medium`, `Large`, `Huge` or `Gargantuan` (`Med` gives `Medium`, `Gtn` gives `Gargantuan`). Never use the threat word `Average`.
- Text: "every prose field (`description`, `options`, `sidebar`, `crew`, `traits`, `keywords`, weapon and wargear `text`) holds verbatim book text. No field in this feature gets an `[AI-Generated]` prefix. Where the book has no text, the field is `null` or `[]`" (spec §2.2).
- Quotes: write straight `'` and `"` only in the new data, "as the existing data files use" (spec §2.2).
- Dashes: keep `—`, `–` and `-` as printed.
- The book's own cross-references, such as `(see page 54)`, stay as printed, as in `threats.json`. Add no page reference of your own.
- Paragraphs: `vehicles.json` prose uses `\n\n` between paragraphs, as `threats.json` does. Glossary descriptions use `<br><br>`, because both apps insert them with `innerHTML` and no `white-space` rule.
- Glossary tables use the existing markup with single-quoted attributes: `<table class='glossary-table'><caption>…</caption><tr><th>…</th></tr><tr><td>…</td></tr></table>`, wrapped in `<div class='glossary-table-scroll'>` as `combatTerms.critical_hit` is.
- PDFs and renders are copyrighted. They never enter the repo. Read pages as images (`pdftoppm`, then the Read tool). Use `pdfgrep` only to find text. Never use `pdftotext`. Task 1.15 deletes `renders/`.
- Work folder (outside the repo): `/root/projects/.QK-Wrath-and-Glory-reference/work/vehicles/`, with `renders/`, `fragments/` and `build/`. It is a local git repo with no remote, and it ignores `renders/`.
- Shell: use the Bash tool (Git Bash). Run repo and work-folder commands in WSL: `wsl -e bash -c '…'`. Put a command with nested quotes in a script file.
- Git: use `/usr/bin/git` in WSL. Author every commit `--author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>"`. Write a one-sentence imperative subject and no attribution lines. Pipe git output through `sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'`.
- Branch: Task 1.0 creates and checks out the `vehicles` branch. Every later repo commit of this plan lands on it; each repo commit command first checks the branch. The merge into `main` and the push are the user's decision at the end. The work folder's local repo is separate and keeps its default branch.
- Token discipline: do not read a whole large JSON file. Use `grep`, `head`, `sed -n` or a `node` one-liner. Send long output to a file in `build/` and read its summary lines.
- Part 1 changes no app file. The two new sections stay inert until Part 2: both `buildTermMap()` functions (`bestiary/js/glossary.js:34`, `creator/js/glossary.js:34`) and both glossary tabs name their sections explicitly.

## Review Focus

1. A weapon name that another book also uses for an infantry weapon: the card gets the vehicle profile. Examples: `Blaster`, `Splinter Cannon`, `Splinter Rifle`, `Auto Bolt Rifle`. Pinned in Task 1.1 ("a line that a tier matches resolves to that record…") and in the Task 1.10 self-test ("Blaster resolves to the vehicle Blaster…").
2. Text with PDF artifacts: the card and the Rules Reference show clean book text. The artifacts are a split word, a curly quote, a double space and a stray line break. Pinned in Task 1.1 ("no PDF artifacts in the vehicle text…") and in the Task 1.2 checker.
3. A trait printed with a value or in another case (`Turbo Boost (2)`, `Gyro-stabilised`): its chip opens the `vehicleTraits` entry. Pinned in Task 1.1 ("traitKey maps printed forms to the keys", "every vehicle trait has a vehicleTraits entry", "every vehicle trait is letters, spaces and hyphens…") and in the Task 1.2 checker.
4. Text that holds `&`, `<`, `>` or a printed table: both apps show text and a table, not broken markup. Pinned in Task 1.1 ("every new glossary name and description is clean, safe HTML", "the vehicle text holds no < or >") and in the Task 1.2 checker.
5. A weapon that exists only as profile records: the line carries every profile in `profileIds`, in file order. It never shows one profile as the whole weapon. Example: `Prism Cannon` with `(Dispersed)`, `(Focussed)` and `(Lance)`. Pinned in Task 1.1 ("a weapon that exists only as profile records carries all of them…", "every profileIds array has two or more ids…") and in the Task 1.10 self-test ("Prism Cannon gets its three profiles in file order", "the profile rule finds exactly the 11 church profile families").

## Plan decisions

Items 1, 2 and 5 follow the spec as amended on 2026-10-21. The other items fill gaps that the spec leaves open.

1. **Record-name suffixes (spec §2.3).** Normalisation removes a record-name suffix `(Vehicle)`, `(Weapon)` or `(Wargear)`. It also makes curly apostrophes straight and collapses white space. Nine church weapon records and eight church wargear records carry such a suffix. Without this step, `Blaster`, `Splinter Cannon`, `Splinter Rifle` and `Auto Bolt Rifle` miss tier 1. They then resolve to infantry records of `aeldari` or `voa` in tier 3.
2. **Profile families (spec §2.2, §2.3).** A weapon line that matches no record by name can match two or more profile records in one tier. Then the item gets `profileIds` (the ids in `weapons.json` file order) and `weaponId: null`. A record is a profile of the line when its normalised name is the line's normalised name, one space and one bracketed label. The label matches `^[a-z][a-z -]*$` and is not `ammo`, `abundance of apocrypha` or `adeptus arbites`; those three tags mark ammunition or a source. On the real data the rule finds exactly 11 families, all in tier 1:
   - `prism cannon`: `dispersed`, `focussed`, `lance`
   - `heat ray`: `dispersed`, `focussed`
   - `doomsday cannon`: `high power`, `low power`
   - `heavy seismic cannon`: `short-wave`, `long-wave`
   - `castigator battle cannon`: `pyre`, `sanctified`
   - `aeldari missile launcher`: `sunburst`, `starshot`
   - `taurox missile launcher`, `tauros grenade launcher` and `typhoon missile launcher`: `frag`, `krak`
   - `kannon`: `frag`, `shell`
   - `killa jet`: `burna`, `cutta`

   The Task 1.10 self-test pins this list. A line that prints one profile (`Prism Cannon (Lance)`) matches that record by name and gets its `weaponId`.
3. **Manual map values.** A map value is a record id, or `null` to accept the line as text only. A `WEAPON_MAP` value can also be a list of two or more profile ids; the line then gets `profileIds`. Then the build report can reach zero open keys. A profile family that the build finds needs no map entry.
4. **The manual map decides its key.** The map holds the leftovers (spec §2.3), and it is also the remedy for a wrong match. A wrong match is a tier match or a profile family for a printed item that this book profiles under another record. A map entry for that key overrides the match. The build report lists each such key under MAP OVERRIDES, and the test lists it in `TIER_OVERRIDES`. A `core` match for a weapon that this book does not profile is correct, and it stays. An example is a printed `Missile Launcher` that gets the core `missile_launcher`. Task 1.12 applies these entries.
5. **Variant ids (spec §2.2).** A variant whose printed title is one word gets the family prefix: `land_raider_crusader`, `land_raider_redeemer`, `leman_russ_demolisher`, `leman_russ_punisher`, `leman_russ_eradicator`, `leman_russ_vanquisher`, `falcon_firestorm`. A title of two or more words stands alone: `attack_bike`, `scout_bike`, `land_speeder_tornado`, `land_speeder_typhoon`, `gladiator_reaper`, `gladiator_valiant`, `repulsor_executioner`, `fire_prism`, `night_spinner`, `wave_serpent`, `burna_bommer`. A hyphen separates words, so `Burna-Bommer` is two words. The Archaeopters follow their stored name: `archaeopter_fusilave`, `archaeopter_stratoraptor`, `archaeopter_transvector`.
6. **Archaeopter description.** Each Archaeopter entry stores the family text. A block's own paragraph, where printed, follows after `\n\n`.
7. **Glossary key order.** Every new entry has the key order `name, source, page, description`, the order of every existing entry.
8. **Glossary position.** The two sections follow `psychicPowers`. `JSON.stringify(data, null, 2) + '\n'` reproduces `glossary.json` byte for byte, so the diff holds additions only (`git diff --numstat` shows `<n> 0`).
9. **One render step.** Task 1.2 renders every page once for all agents. The extraction agents make only the 300 dpi crops (spec §6 step 1 lets each agent render).
10. **Per-task commits outside the repo.** The extraction, build and verify tasks change no repo file. They commit to the work folder's local git repo. The renders are ignored there and are never committed.
11. **Pinned survey facts.** The test pins Appendix A (ids, names, factions, families and pages) and three `pdfgrep` survey facts: six blocks print `TRANSPORTER` (pp. 68, 72, 73, 81 and twice on p. 93), the four Chaos blocks print `[LEGION]` and `[MARK OF CHAOS]`, and the Shokk Tunnel box sits on p. 106.

## Interfaces for Part 2

Part 2 reads exactly these paths and shapes. Task 1.15 commits them.

**`data/vehicles.json`** is a JSON array of 107 entries in book order. Every entry has these 21 keys, in this order:

| Key | Type and rule |
|---|---|
| `id` | string, snake_case, unique; for example `chimera`, `land_raider_crusader`, `archaeopter_fusilave` |
| `name` | string, the printed heading in title case; a variant keeps its short title (`Crusader`) |
| `faction` | one of the 11 strings, here in book order: `Imperial`, `Adepta Sororitas`, `Adeptus Astartes`, `Adeptus Mechanicus`, `Aeronautica Imperialis`, `Astra Militarum`, `Aeldari`, `Chaos Space Marines`, `Drukhari`, `Necron`, `Ork` |
| `variantOf` | the family parent's `id`, or `null`; the parent has the same faction and `variantOf: null` |
| `description` | string or `null`; plain text, `\n\n` between paragraphs, no HTML; `null` on a variant that prints no paragraph of its own (show the parent's text) |
| `options` | string or `null`; the same format; always `null` on a variant (show the parent's text) |
| `value` | integer |
| `rarity` | `Common`, `Uncommon`, `Rare`, `Very Rare` or `Unique` |
| `speed`, `manoeuvre`, `resilience`, `wounds` | integers; `wounds` is Max Wounds |
| `size` | `Medium`, `Large`, `Huge` or `Gargantuan` |
| `keywords` | string array, UPPERCASE; can hold `TRANSPORTER`, `[LEGION]` and `[MARK OF CHAOS]` |
| `crew` | string, the printed Crew Complement |
| `traits` | string array, as printed with values, for example `Turbo Boost (2)` |
| `weapons` | array of `{ text, weaponId, count }`, then `twin: true` on a Twin line, then `profileIds` on a profile line; `weaponId` is a `data/weapons.json` id, or `null`; `profileIds` holds two or more `data/weapons.json` ids in file order, and `weaponId` is then `null` |
| `wargear` | array of `{ text, equipmentId }`; `equipmentId` is a `data/equipment.json` id, or `null` (render `text` alone) |
| `sidebar` | `{ title, text }` or `null`; `text` uses `\n\n` between paragraphs; `shokkjump_dragsta` has one |
| `source` | `"church"` |
| `page` | integer from 64 to 111 |

- Render the plain-text fields with `white-space: pre-line`, as `.threat-text-section` does (`bestiary/css/styles.css:731-737`).
- A resolved weapon record has `type`, `damage` (`{ base, attribute, bonus }`), `ed`, `ap` and `traits`. A `ranged` record has `range` (`{ short, medium, long }`) and `salvo`. A `melee` record has `reach`.
- A weapon line renders in one of three ways. With a `weaponId`, it shows one profile row. With `profileIds`, it shows one row per profile, with the record's name (for example `Prism Cannon (Lance)`) in the Name column (spec §4). With neither, it shows the printed `text` alone. A profile line can also carry `twin: true`.
- A resolved wargear record usually has `category: "vehicle wargear"`, a `description` and an `effect`.

**`data/glossary.json`** gets two new top-level sections after `psychicPowers`:

- `vehicleTraits`: exactly 12 keys, in this order: `all_terrain`, `amphibious`, `bike`, `flyer`, `gun_ports`, `gyro_stabilised`, `hover`, `open_topped`, `reliable`, `sealed`, `turbo_boost`, `walker`.
- `vehicleRules`: the 35 required keys of spec Appendix B, plus `interacting_with_vehicles` and `vehicle_actions` when the book prints text under those headings, in Appendix B order. Part 2 deep-links `vehicle_damage` and `twin_weapons`.
- Every entry is `{ name, source: "church", page, description }`. The `description` is HTML in the glossary convention: `<br><br>`, `<strong>`, `<em>`, `&amp;`, and `<table class='glossary-table'>` inside `<div class='glossary-table-scroll'>`.

**Trait chip key.** A trait string opens `vehicleTraits[traitKey(text)]`. The test makes sure that every trait of every vehicle has an entry under this rule:

```javascript
const traitKey = t => t.replace(/\s*\([^)]*\)\s*$/, '').toLowerCase().replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
// 'Turbo Boost (2)' -> 'turbo_boost', 'Gyro-Stabilised' -> 'gyro_stabilised', 'Open Topped' -> 'open_topped'
```

The test also makes sure that every trait holds only letters, spaces, hyphens and an optional value in brackets. So a lookup by name gives the same entry, when it drops the value and folds case and hyphens. The Part 2 plan's `VehiclesTab.findTraitKey()` is such a lookup.

**Plain text in HTML.** The test makes sure that no vehicle text holds `<` or `>`. Part 2 can insert the plain-text fields into `innerHTML` as they are.

**Test.** `scripts/test-vehicles.js`, run with `node scripts/test-vehicles.js`. It ends with `All checks passed.` and exit code 0. Part 2 can add checks above the last line, `finish();`.

## Execution order

| Wave | Tasks | How | Needs |
|---|---|---|---|
| 0 | 1.0 | main session | nothing |
| A | 1.1, 1.2 | in parallel | Task 1.0 |
| Review A | a `reviewer` on Task 1.1 and a `reviewer` on Task 1.2 | in parallel; wave B waits for the Task 1.2 review only | Tasks 1.1 and 1.2 |
| B | 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10 | in parallel; send the eight dispatches in one message | Task 1.2 and its review |
| Review B | a `reviewer` on Task 1.10 | alone | Task 1.10 |
| C | 1.11 | main session | Tasks 1.3 to 1.9 |
| D | 1.12 | alone | Task 1.11; Tasks 1.1 and 1.10 and their reviews |
| E | 1.13 | six agents in parallel | Task 1.12 |
| F | 1.14, then its scoped re-review (Task 1.14 Step 6) | in order | Task 1.13 |
| G | 1.15 | main session | Task 1.14 and its re-review |

Review gates (user CLAUDE.md §4):

- Tasks 1.1, 1.2 and 1.10 hold code. A `reviewer` agent gives each a first review (rows Review A and Review B). The task's implementer fixes each accepted finding before a later wave uses the task.
- Tasks 1.3 to 1.9 and 1.12 get no separate review. The verify pass (Task 1.13) is their independent review, as spec §6 step 3 requires. Task 1.11 is the main session's own triage.
- Task 1.14 is a fix round. Its Step 6 dispatches the scoped re-review by a `reviewer` agent.
- Task 1.15 Step 5 dispatches the whole-wave review by a `general-purpose` agent on `model: fable`. Step 6 fixes its accepted findings and dispatches their scoped re-review. Then the user decides the merge and the push.

## File Structure

Repo (`/root/projects/QK-Wrath-and-Glory`):

| Path | Change | Responsibility |
|---|---|---|
| `scripts/test-vehicles.js` | Create (Task 1.1) | Pins the data shape, Appendices A and B, and the Review Focus cases |
| `data/vehicles.json` | Create (the build writes it in Task 1.12; Task 1.15 commits it) | The 107 vehicles |
| `data/glossary.json` | Modify (the build appends two sections) | `vehicleTraits` and `vehicleRules` |
| `docs/superpowers/specs/2026-10-20-vehicles-design.md` | Modify only when Task 1.11 corrects the faction list or Appendix A | The spec stays the source of the pinned facts |

Work folder (`/root/projects/.QK-Wrath-and-Glory-reference/work/vehicles`, a local git repo, never pushed):

| Path | Made by | Responsibility |
|---|---|---|
| `.gitignore` | Task 1.2 | Ignores `renders/` |
| `renders/p-NNN.png`, `renders/crops/` | Task 1.2 and the extractors | Page images; copyrighted; Task 1.15 deletes them |
| `build/check-fragment.js` | Task 1.2 | Validates one fragment and prints the self-check |
| `fragments/group-1.json` to `group-5.json` | Tasks 1.3 to 1.7 | Vehicle transcriptions |
| `fragments/vehicle-traits.json` | Task 1.8 | Trait transcriptions |
| `fragments/vehicle-rules.json` | Task 1.9 | Rule transcriptions |
| `build/build-vehicles.js` | Task 1.10 | Merges, resolves, writes the repo files, prints the report |
| `build/show.js` | Task 1.10 | Prints one built entry for the verify pass |
| `build/extraction-triage.md` | Task 1.11 | Each problem that an extraction report names, with its decision |
| `build/build-report.txt`, `build/triage-log.md`, `build/test-output.txt` | Task 1.12 | The build report, the triage decisions, the test output |
| `build/verify-group-1.md` to `verify-group-5.md`, `build/verify-glossary.md` | Task 1.13 | Mismatch lists |
| `build/mismatches.txt`, `build/fix-log.md` | Task 1.14 | The collected mismatches; one decision per mismatch |
| `build/wave-review.md` | Task 1.15 | The whole-wave review findings, with their decisions and fixes |

---

### Task 1.0: Create the `vehicles` branch

**Agent:** the main session. Reason: one git command, before the first commit of this plan.

**Files:**
- None. The task changes only the git state of the repo.

**Interfaces:**
- Produces: the checked-out branch `vehicles`. Every later repo commit of this plan lands on it, and each repo commit command checks the branch first. The merge into `main` and the push are the user's decision at the end.

- [ ] **Step 1: Create and check out the branch**

```bash
wsl -e bash -c 'cd /root/projects/QK-Wrath-and-Glory && /usr/bin/git switch -c vehicles && /usr/bin/git branch --show-current' 2>&1 | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
```

Expected: `Switched to a new branch 'vehicles'`, then `vehicles`. Uncommitted changes, such as the amended spec and the two plans, come along unchanged. This task commits nothing.

### Task 1.1: Write the vehicles data test

**Agent:** `implementer`. Reason: the plan gives the whole test file and its expected red output.
**Runs in parallel with:** Task 1.2.

**Files:**
- Create: `scripts/test-vehicles.js`

**Interfaces:**
- Consumes: the existing `data/weapons.json`, `data/equipment.json` and `data/glossary.json`.
- Produces: `scripts/test-vehicles.js`. It reads `data/vehicles.json`, `glossary.vehicleTraits` and `glossary.vehicleRules`. It fails until Task 1.12 builds the data. Its `normalise()` and `isProfileOf()` must stay identical to the functions of the same names in `build/build-vehicles.js` (Task 1.10). Its `traitKey()` is the chip key rule of "Interfaces for Part 2". Its `TIER_OVERRIDES` list holds the keys of the deliberate map overrides (Plan decision 4); Tasks 1.12 and 1.14 may add keys to it, and to nothing else in the test.

- [ ] **Step 1: Write the test file**

Create `scripts/test-vehicles.js` with this content. It follows `scripts/test-improvised.js`: a `check(name, actual, expected)` helper, PASS and FAIL lines, and exit code 1 on any FAIL. It reads JSON only, so it needs no `vm` sandbox.

```javascript
// Tests for the Vehicles data (issue #28): data/vehicles.json and the vehicleTraits and
// vehicleRules sections of data/glossary.json. This file reads JSON only, so it needs no vm
// sandbox; a later test of app code can add one in the pattern of test-followers.js.
// Run: node scripts/test-vehicles.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

let failures = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function finish() {
    console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
    process.exit(failures === 0 ? 0 : 1);
}
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

// --- the data file exists; without it the run stops here ---
const hasFile = fs.existsSync(path.join(ROOT, 'data/vehicles.json'));
check('data/vehicles.json exists', hasFile, true);
if (!hasFile) finish();

const vehicles = readJson('data/vehicles.json');
const weapons = readJson('data/weapons.json');
const equipment = readJson('data/equipment.json');
const glossary = readJson('data/glossary.json');
const vehicleTraits = glossary.vehicleTraits || {};
const vehicleRules = glossary.vehicleRules || {};
const byId = new Map(vehicles.map(v => [v.id, v]));
const weaponsOf = v => (Array.isArray(v.weapons) ? v.weapons : []);
const wargearOf = v => (Array.isArray(v.wargear) ? v.wargear : []);

// Spec Appendix A in book order: [id, name, faction, variantOf, page].
const EXPECTED = [
    ['achilles_ridgerunner', 'Achilles Ridgerunner', 'Imperial', null, 64],
    ['avachrus_ridgerunner', 'Avachrus Ridgerunner', 'Imperial', null, 64],
    ['dirtcycle', 'Dirtcycle', 'Imperial', null, 65],
    ['goliath_truck', 'Goliath Truck', 'Imperial', null, 65],
    ['goliath_rockgrinder', 'Goliath Rockgrinder', 'Imperial', null, 65],
    ['tauros', 'Tauros', 'Imperial', null, 66],
    ['tauros_venator', 'Tauros Venator', 'Imperial', null, 66],
    ['wolfquad', 'Wolfquad', 'Imperial', null, 66],
    ['castigator', 'Castigator', 'Adepta Sororitas', null, 67],
    ['exorcist', 'Exorcist', 'Adepta Sororitas', null, 67],
    ['immolator', 'Immolator', 'Adepta Sororitas', null, 68],
    ['repressor', 'Repressor', 'Adepta Sororitas', null, 68],
    ['adepta_sororitas_rhino', 'Adepta Sororitas Rhino', 'Adepta Sororitas', null, 68],
    ['assault_bike', 'Assault Bike', 'Adeptus Astartes', null, 69],
    ['attack_bike', 'Attack Bike', 'Adeptus Astartes', 'assault_bike', 69],
    ['scout_bike', 'Scout Bike', 'Adeptus Astartes', 'assault_bike', 69],
    ['land_raider', 'Land Raider', 'Adeptus Astartes', null, 70],
    ['land_raider_crusader', 'Crusader', 'Adeptus Astartes', 'land_raider', 70],
    ['land_raider_redeemer', 'Redeemer', 'Adeptus Astartes', 'land_raider', 70],
    ['land_speeder', 'Land Speeder', 'Adeptus Astartes', null, 71],
    ['land_speeder_tornado', 'Land Speeder Tornado', 'Adeptus Astartes', 'land_speeder', 71],
    ['land_speeder_typhoon', 'Land Speeder Typhoon', 'Adeptus Astartes', 'land_speeder', 71],
    ['land_speeder_storm', 'Land Speeder Storm', 'Adeptus Astartes', null, 72],
    ['rhino', 'Rhino', 'Adeptus Astartes', null, 72],
    ['razorback', 'Razorback', 'Adeptus Astartes', null, 73],
    ['predator_annihilator', 'Predator Annihilator', 'Adeptus Astartes', null, 74],
    ['predator_destructor', 'Predator Destructor', 'Adeptus Astartes', null, 74],
    ['vindicator', 'Vindicator', 'Adeptus Astartes', null, 75],
    ['whirlwind', 'Whirlwind', 'Adeptus Astartes', null, 75],
    ['gladiator', 'Gladiator', 'Adeptus Astartes', null, 76],
    ['gladiator_reaper', 'Gladiator Reaper', 'Adeptus Astartes', 'gladiator', 76],
    ['gladiator_valiant', 'Gladiator Valiant', 'Adeptus Astartes', 'gladiator', 76],
    ['impulsor', 'Impulsor', 'Adeptus Astartes', null, 77],
    ['invader_atv', 'Invader ATV', 'Adeptus Astartes', null, 77],
    ['repulsor', 'Repulsor', 'Adeptus Astartes', null, 78],
    ['repulsor_executioner', 'Repulsor Executioner', 'Adeptus Astartes', 'repulsor', 78],
    ['archaeopter_fusilave', 'Archaeopter Fusilave', 'Adeptus Mechanicus', null, 79],
    ['archaeopter_stratoraptor', 'Archaeopter Stratoraptor', 'Adeptus Mechanicus', null, 79],
    ['archaeopter_transvector', 'Archaeopter Transvector', 'Adeptus Mechanicus', null, 79],
    ['onager_dunecrawler', 'Onager Dunecrawler', 'Adeptus Mechanicus', null, 80],
    ['skorpius_disintegrator', 'Skorpius Disintegrator', 'Adeptus Mechanicus', null, 80],
    ['skorpius_dunerider', 'Skorpius Dunerider', 'Adeptus Mechanicus', null, 81],
    ['ironstrider_ballistarius', 'Ironstrider Ballistarius', 'Adeptus Mechanicus', null, 81],
    ['sydonian_dragoon', 'Sydonian Dragoon', 'Adeptus Mechanicus', null, 81],
    ['aquila_lander', 'Aquila Lander', 'Aeronautica Imperialis', null, 82],
    ['arvus_lighter', 'Arvus Lighter', 'Aeronautica Imperialis', null, 82],
    ['vulture_gunship', 'Vulture Gunship', 'Aeronautica Imperialis', null, 82],
    ['valkyrie', 'Valkyrie', 'Aeronautica Imperialis', null, 84],
    ['chimera', 'Chimera', 'Astra Militarum', null, 84],
    ['hellhound', 'Hellhound', 'Astra Militarum', null, 85],
    ['devil_dog', 'Devil Dog', 'Astra Militarum', null, 85],
    ['bane_wolf', 'Bane Wolf', 'Astra Militarum', null, 85],
    ['basilisk', 'Basilisk', 'Astra Militarum', null, 86],
    ['deathstrike', 'Deathstrike', 'Astra Militarum', null, 86],
    ['hydra', 'Hydra', 'Astra Militarum', null, 86],
    ['manticore', 'Manticore', 'Astra Militarum', null, 87],
    ['wyvern', 'Wyvern', 'Astra Militarum', null, 87],
    ['leman_russ', 'Leman Russ', 'Astra Militarum', null, 87],
    ['leman_russ_demolisher', 'Demolisher', 'Astra Militarum', 'leman_russ', 88],
    ['leman_russ_punisher', 'Punisher', 'Astra Militarum', 'leman_russ', 88],
    ['leman_russ_eradicator', 'Eradicator', 'Astra Militarum', 'leman_russ', 88],
    ['leman_russ_vanquisher', 'Vanquisher', 'Astra Militarum', 'leman_russ', 88],
    ['scout_sentinel', 'Scout Sentinel', 'Astra Militarum', null, 89],
    ['armoured_sentinel', 'Armoured Sentinel', 'Astra Militarum', null, 89],
    ['taurox', 'Taurox', 'Astra Militarum', null, 91],
    ['taurox_prime', 'Taurox Prime', 'Astra Militarum', null, 91],
    ['aeldari_jetbike', 'Aeldari Jetbike', 'Aeldari', null, 92],
    ['falcon', 'Falcon', 'Aeldari', null, 93],
    ['fire_prism', 'Fire Prism', 'Aeldari', 'falcon', 93],
    ['falcon_firestorm', 'Firestorm', 'Aeldari', 'falcon', 93],
    ['night_spinner', 'Night Spinner', 'Aeldari', 'falcon', 93],
    ['wave_serpent', 'Wave Serpent', 'Aeldari', 'falcon', 94],
    ['hemlock_wraithfighter', 'Hemlock Wraithfighter', 'Aeldari', null, 94],
    ['nightshade_interceptor', 'Nightshade Interceptor', 'Aeldari', null, 95],
    ['vyper', 'Vyper', 'Aeldari', null, 95],
    ['war_walker', 'War Walker', 'Aeldari', null, 96],
    ['chaos_rhino', 'Chaos Rhino', 'Chaos Space Marines', null, 97],
    ['chaos_predator', 'Chaos Predator', 'Chaos Space Marines', null, 98],
    ['chaos_vindicator', 'Chaos Vindicator', 'Chaos Space Marines', null, 98],
    ['chaos_land_raider', 'Chaos Land Raider', 'Chaos Space Marines', null, 98],
    ['raider', 'Raider', 'Drukhari', null, 99],
    ['ravager', 'Ravager', 'Drukhari', null, 99],
    ['reaver_jetbike', 'Reaver Jetbike', 'Drukhari', null, 100],
    ['venom', 'Venom', 'Drukhari', null, 100],
    ['catacomb_command_barge', 'Catacomb Command Barge', 'Necron', null, 101],
    ['doom_scythe', 'Doom Scythe', 'Necron', null, 101],
    ['doomsday_ark', 'Doomsday Ark', 'Necron', null, 102],
    ['ghost_ark', 'Ghost Ark', 'Necron', null, 102],
    ['tomb_blade', 'Tomb Blade', 'Necron', null, 103],
    ['triarch_stalker', 'Triarch Stalker', 'Necron', null, 103],
    ['warbike', 'Warbike', 'Ork', null, 104],
    ['boomdakka_snazzwagon', 'Boomdakka Snazzwagon', 'Ork', null, 104],
    ['deffkilla_wartrike', 'Deffkilla Wartrike', 'Ork', null, 105],
    ['kustom_boosta_blasta', 'Kustom Boosta Blasta', 'Ork', null, 105],
    ['megatrakk_scrapjet', 'Megatrakk Scrapjet', 'Ork', null, 106],
    ['shokkjump_dragsta', 'Shokkjump Dragsta', 'Ork', null, 106],
    ['trukk', 'Trukk', 'Ork', null, 107],
    ['rukkatrukk_squigbuggy', 'Rukkatrukk Squigbuggy', 'Ork', null, 107],
    ['wazbom_blastajet', 'Wazbom Blastajet', 'Ork', null, 108],
    ['battlewagon', 'Battlewagon', 'Ork', null, 108],
    ['bonebreaka', 'Bonebreaka', 'Ork', null, 109],
    ['gunwagon', 'Gunwagon', 'Ork', null, 109],
    ['kill_rig', 'Kill Rig', 'Ork', null, 109],
    ['deffkopta', 'Deffkopta', 'Ork', null, 110],
    ['dakkajet', 'Dakkajet', 'Ork', null, 111],
    ['blitza_bommer', 'Blitza-Bommer', 'Ork', null, 111],
    ['burna_bommer', 'Burna-Bommer', 'Ork', 'blitza_bommer', 111]
];

const FIELDS = ['id', 'name', 'faction', 'variantOf', 'description', 'options', 'value', 'rarity',
    'speed', 'manoeuvre', 'resilience', 'wounds', 'size', 'keywords', 'crew', 'traits',
    'weapons', 'wargear', 'sidebar', 'source', 'page'];
const FACTION_COUNTS = {
    'Imperial': 8, 'Adepta Sororitas': 5, 'Adeptus Mechanicus': 8, 'Aeronautica Imperialis': 4,
    'Adeptus Astartes': 23, 'Astra Militarum': 18, 'Aeldari': 10, 'Drukhari': 4, 'Necron': 6,
    'Chaos Space Marines': 4, 'Ork': 17
};
const FACTIONS = Object.keys(FACTION_COUNTS);
const SIZES = ['Medium', 'Large', 'Huge', 'Gargantuan'];
const RARITIES = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Unique'];

const isText = x => typeof x === 'string' && x.length > 0;
const isTextOrNull = x => x === null || isText(x);
const isInt = x => Number.isInteger(x);
const sameKeys = (o, keys) => !!o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).join(',') === keys.join(',');
// A weapon item is { text, weaponId, count }, then twin when the line is Twin, then profileIds
// when the weapon exists only as profile records (spec §2.1, §2.2).
const WEAPON_KEY_ORDERS = [['text', 'weaponId', 'count'], ['text', 'weaponId', 'count', 'twin'],
    ['text', 'weaponId', 'count', 'profileIds'], ['text', 'weaponId', 'count', 'twin', 'profileIds']];
const isWeaponItem = w => WEAPON_KEY_ORDERS.some(keys => sameKeys(w, keys))
    && isText(w.text) && isTextOrNull(w.weaponId) && isInt(w.count) && w.count >= 1;
const isWargearItem = g => sameKeys(g, ['text', 'equipmentId']) && isText(g.text) && isTextOrNull(g.equipmentId);
const FIELD_TYPES = {
    id: x => isText(x) && /^[a-z0-9]+(_[a-z0-9]+)*$/.test(x),
    name: isText,
    faction: x => FACTIONS.includes(x),
    variantOf: isTextOrNull,
    description: isTextOrNull,
    options: isTextOrNull,
    value: isInt,
    rarity: x => RARITIES.includes(x),
    speed: isInt,
    manoeuvre: isInt,
    resilience: isInt,
    wounds: isInt,
    size: x => SIZES.includes(x),
    keywords: x => Array.isArray(x) && x.every(k => isText(k) && k === k.toUpperCase()),
    crew: isText,
    traits: x => Array.isArray(x) && x.every(isText),
    weapons: x => Array.isArray(x) && x.every(isWeaponItem),
    wargear: x => Array.isArray(x) && x.every(isWargearItem),
    sidebar: x => x === null || (sameKeys(x, ['title', 'text']) && isText(x.title) && isText(x.text)),
    source: x => x === 'church',
    page: x => isInt(x) && x >= 64 && x <= 111
};

// --- shape: 107 entries, unique ids, the 21 fields in spec order with the right types ---
check('107 entries', vehicles.length, 107);
check('ids are unique', new Set(vehicles.map(v => v.id)).size, vehicles.length);
check('every entry has the 21 fields in spec order', vehicles.filter(v => !sameKeys(v, FIELDS)).map(v => v.id), []);
check('every field has the right type',
    vehicles.flatMap(v => FIELDS.filter(f => !FIELD_TYPES[f](v[f])).map(f => `${v.id}.${f}`)), []);
check('twin, where present, is true',
    vehicles.flatMap(v => weaponsOf(v).filter(w => 'twin' in w && w.twin !== true).map(w => `${v.id}: ${w.text}`)), []);

// --- Appendix A: ids, names, factions, families, pages, book order ---
check('the ids are the 107 ids of Appendix A', vehicles.map(v => v.id).sort(), EXPECTED.map(e => e[0]).sort());
check('name, faction, variantOf and page match Appendix A',
    EXPECTED.filter(([id, name, faction, variantOf, page]) => {
        const v = byId.get(id);
        return !v || v.name !== name || v.faction !== faction || v.variantOf !== variantOf || v.page !== page;
    }).map(e => e[0]), []);
check('entries are in book order (pages never go down)',
    vehicles.slice(1).filter((v, i) => v.page < vehicles[i].page).map(v => v.id), []);
// Spec §2.2: a variant whose printed title is one word takes the family prefix; any other
// entry (a multi-word variant title, an Archaeopter's stored name) is the snake_case of its name.
const snake = s => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const idByRule = v => (v.variantOf !== null && /^[A-Za-z]+$/.test(v.name) ? `${v.variantOf}_${snake(v.name)}` : snake(v.name));
check('every id follows the spec §2.2 id rule', vehicles.filter(v => isText(v.name) && v.id !== idByRule(v)).map(v => v.id), []);
const valkyrieAt = vehicles.findIndex(v => v.id === 'valkyrie');
const chimeraAt = vehicles.findIndex(v => v.id === 'chimera');
check('the Valkyrie comes before the Chimera on p. 84', valkyrieAt >= 0 && chimeraAt >= 0 && valkyrieAt < chimeraAt, true);

// --- factions and sizes ---
const factionCounts = {};
for (const v of vehicles) factionCounts[v.faction] = (factionCounts[v.faction] || 0) + 1;
check('per-faction counts match Appendix A',
    Object.fromEntries(FACTIONS.map(f => [f, factionCounts[f] || 0])), FACTION_COUNTS);
check('every faction is one of the 11 fixed strings',
    [...new Set(vehicles.map(v => v.faction))].filter(f => !FACTIONS.includes(f)), []);
check('size is Medium, Large, Huge or Gargantuan',
    vehicles.filter(v => !SIZES.includes(v.size)).map(v => `${v.id}: ${v.size}`), []);

// --- references resolve ---
const weaponIds = new Set(weapons.map(w => w.id));
const equipmentIds = new Set(equipment.map(e => e.id));
check('every non-null weaponId resolves to a weapons.json record',
    vehicles.flatMap(v => weaponsOf(v).filter(w => w.weaponId !== null && !weaponIds.has(w.weaponId)).map(w => `${v.id}: ${w.weaponId}`)), []);
check('every non-null equipmentId resolves to an equipment.json record',
    vehicles.flatMap(v => wargearOf(v).filter(g => g.equipmentId !== null && !equipmentIds.has(g.equipmentId)).map(g => `${v.id}: ${g.equipmentId}`)), []);
check('every profileIds array has two or more ids that all resolve, beside a null weaponId',
    vehicles.flatMap(v => weaponsOf(v).filter(w => 'profileIds' in w && !(Array.isArray(w.profileIds) && w.profileIds.length >= 2
        && w.profileIds.every(id => weaponIds.has(id)) && w.weaponId === null)).map(w => `${v.id}: ${w.text}`)), []);
check('every variantOf names a same-faction entry whose variantOf is null',
    vehicles.filter(v => v.variantOf !== null).filter(v => {
        const parent = byId.get(v.variantOf);
        return !parent || parent.faction !== v.faction || parent.variantOf !== null;
    }).map(v => v.id), []);

// --- family values: the three overrides, inheritance, options on the parent ---
check('Land Speeder Tornado value is 12 (family prose override)', byId.get('land_speeder_tornado')?.value, 12);
check('Land Speeder Typhoon value is 12 (family prose override)', byId.get('land_speeder_typhoon')?.value, 12);
check('Leman Russ Vanquisher rarity is Rare (family prose override)', byId.get('leman_russ_vanquisher')?.rarity, 'Rare');
const OVERRIDDEN = { land_speeder_tornado: 'value', land_speeder_typhoon: 'value', leman_russ_vanquisher: 'rarity' };
check('a variant copies its family Value and Rarity, except the three overrides',
    vehicles.filter(v => v.variantOf !== null && byId.has(v.variantOf)).flatMap(v => ['value', 'rarity']
        .filter(f => OVERRIDDEN[v.id] !== f && v[f] !== byId.get(v.variantOf)[f])
        .map(f => `${v.id}.${f}`)), []);
check('a variant has no options (they live on the family parent)',
    vehicles.filter(v => v.variantOf !== null && v.options !== null).map(v => v.id), []);
check('every family parent has a description for its variants to fall back on',
    [...new Set(vehicles.filter(v => v.variantOf !== null).map(v => v.variantOf))].filter(id => !isText(byId.get(id)?.description)), []);

const archaeopters = ['archaeopter_fusilave', 'archaeopter_stratoraptor', 'archaeopter_transvector'].map(id => byId.get(id)).filter(Boolean);
check('the three Archaeopter entries are top-level', archaeopters.map(a => a.variantOf), [null, null, null]);
check('the Archaeopters share the family Value, Rarity and options',
    new Set(archaeopters.map(a => JSON.stringify([a.value, a.rarity, a.options]))).size, 1);
check('the Archaeopters carry a description', archaeopters.filter(a => isText(a.description)).length, 3);
check('each Archaeopter description opens with the same family paragraph',
    new Set(archaeopters.map(a => String(a.description).split('\n\n')[0])).size, 1);

// --- printed keywords and the sidebar ---
const chaosEntries = vehicles.filter(v => v.faction === 'Chaos Space Marines');
check('the Chaos entries keep the [LEGION] and [MARK OF CHAOS] placeholders',
    chaosEntries.filter(v => (v.keywords || []).includes('[LEGION]') && (v.keywords || []).includes('[MARK OF CHAOS]')).length, 4);
check('six entries keep the printed TRANSPORTER keyword',
    vehicles.filter(v => (v.keywords || []).includes('TRANSPORTER')).length, 6);
check('the Shokkjump Dragsta carries the Shokk Tunnel sidebar', byId.get('shokkjump_dragsta')?.sidebar?.title, 'Shokk Tunnel');

// --- weapon lines: count and twin follow the printed text (spec §2.2) ---
const leadingCount = text => (/^(\d+) /.test(text) ? Number(text.match(/^(\d+) /)[1]) : 1);
check('count is the leading quantity of the line, else 1',
    vehicles.flatMap(v => weaponsOf(v).filter(w => w.count !== leadingCount(w.text)).map(w => `${v.id}: ${w.text} (count ${w.count})`)), []);
check('twin is set exactly when Twin follows the optional quantity',
    vehicles.flatMap(v => weaponsOf(v).filter(w => ('twin' in w) !== /^(\d+ )?Twin /.test(w.text)).map(w => `${v.id}: ${w.text}`)), []);

// --- no AI-generated text anywhere in the new data ---
function allStrings(x, out = []) {
    if (typeof x === 'string') out.push(x);
    else if (Array.isArray(x)) x.forEach(y => allStrings(y, out));
    else if (x && typeof x === 'object') Object.values(x).forEach(y => allStrings(y, out));
    return out;
}
check('no string in the new data contains [AI-Generated]',
    [...allStrings(vehicles), ...allStrings(vehicleTraits), ...allStrings(vehicleRules)].filter(s => s.includes('[AI-Generated]')).length, 0);

// --- glossary sections (spec §3, Appendix B) ---
const TRAITS = [['all_terrain', 'All-Terrain'], ['amphibious', 'Amphibious'], ['bike', 'Bike'], ['flyer', 'Flyer'],
    ['gun_ports', 'Gun Ports'], ['gyro_stabilised', 'Gyro-Stabilised'], ['hover', 'Hover'], ['open_topped', 'Open Topped'],
    ['reliable', 'Reliable'], ['sealed', 'Sealed'], ['turbo_boost', 'Turbo Boost (X)'], ['walker', 'Walker']];
check('vehicleTraits has exactly the 12 trait keys', Object.keys(vehicleTraits).sort(), TRAITS.map(t => t[0]));
check('vehicleTraits names match the book', TRAITS.map(([k]) => vehicleTraits[k]?.name), TRAITS.map(t => t[1]));
check('vehicleTraits pages are 62 or 63',
    Object.entries(vehicleTraits).filter(([, t]) => t.page !== 62 && t.page !== 63).map(([k]) => k), []);

// [key, name, first page, last page, required]
const RULES = [
    ['benevolence_of_the_omnissiah', 'Benevolence of the Omnissiah', 29, 29, true],
    ['masters_of_machines', 'Masters of Machines', 29, 29, true],
    ['miraculum_mobili', 'Miraculum Mobili', 29, 29, true],
    ['bleeding_edge_technology', 'Bleeding-Edge Technology', 30, 30, true],
    ['wraithbone', 'Wraithbone', 30, 30, true],
    ['orks_build_tuff', 'Orks Build Tuff', 31, 31, true],
    ['green_wunz_only', 'Green Wunz Only', 31, 31, true],
    ['interacting_with_vehicles', 'Interacting with Vehicles', 44, 44, false],
    ['embarking', 'Embarking', 44, 44, true],
    ['actions_inside', 'Actions Inside', 44, 45, true],
    ['complications', 'Complications', 44, 45, true],
    ['vehicle_roles', 'Vehicle Roles', 45, 46, true],
    ['vehicle_actions', 'Vehicle Actions', 46, 46, false],
    ['drive', 'Drive', 46, 50, true],
    ['brace_for_impact', 'Brace for Impact', 46, 50, true],
    ['breakneck_speed', 'Breakneck Speed', 46, 50, true],
    ['emergency_repair', 'Emergency Repair', 46, 50, true],
    ['evasive_manoeuvres', 'Evasive Manoeuvres', 46, 50, true],
    ['line_up_the_shot', 'Line Up the Shot', 46, 50, true],
    ['open_fire', 'Open Fire', 46, 50, true],
    ['ram', 'Ram', 46, 50, true],
    ['reload', 'Reload', 46, 50, true],
    ['high_speed_tactics', 'High-Speed Tactics', 50, 50, true],
    ['attacking_from_a_vehicle', 'Attacking from a Vehicle', 51, 51, true],
    ['attacking_a_vehicles_occupants', "Attacking a Vehicle's Occupants", 51, 51, true],
    ['vehicle_defence', 'Vehicle Defence', 52, 52, true],
    ['damaged_vehicles', 'Damaged Vehicles', 52, 52, true],
    ['vehicles_and_conditions', 'Vehicles and Conditions', 53, 53, true],
    ['called_shots', 'Called Shots', 53, 54, true],
    ['vehicle_damage', 'Vehicle Damage', 54, 54, true],
    ['repairing_vehicles', 'Repairing Vehicles', 55, 55, true],
    ['vehicle_explosions', 'Vehicle Explosions', 55, 55, true],
    ['crash_and_burn', 'Crash and Burn', 55, 55, true],
    ['built_to_last', 'Built to Last', 55, 55, true],
    ['ammo', 'Ammo', 60, 60, true],
    ['twin_weapons', 'Twin Weapons', 60, 60, true],
    ['vehicle_characteristics', 'Vehicle Characteristics', 62, 62, true]
];
const ruleKeys = Object.keys(vehicleRules);
check('Appendix B lists 35 required keys', RULES.filter(r => r[4]).length, 35);
check('vehicleRules has the 35 required keys', RULES.filter(r => r[4] && !ruleKeys.includes(r[0])).map(r => r[0]), []);
check('vehicleRules has at most 37 entries', ruleKeys.length <= 37, true);
check('every vehicleRules key is an Appendix B key', ruleKeys.filter(k => !RULES.some(r => r[0] === k)), []);
check('vehicleRules names match Appendix B',
    RULES.filter(([k, name]) => k in vehicleRules && vehicleRules[k].name !== name).map(r => r[0]), []);
check('vehicleRules pages fall in the Appendix B range',
    RULES.filter(([k, , lo, hi]) => k in vehicleRules && !(vehicleRules[k].page >= lo && vehicleRules[k].page <= hi)).map(r => r[0]), []);

const glossaryEntries = [
    ...Object.entries(vehicleTraits).map(([k, v]) => [`vehicleTraits.${k}`, v]),
    ...Object.entries(vehicleRules).map(([k, v]) => [`vehicleRules.${k}`, v])
];
check('every new glossary entry is { name, source, page, description } with source church',
    glossaryEntries.filter(([, v]) => !(sameKeys(v, ['name', 'source', 'page', 'description'])
        && isText(v.name) && v.source === 'church' && isInt(v.page) && isText(v.description))).map(([k]) => k), []);

// --- Review Focus 1 and 5: resolution picks the right record (spec §2.3) ---
// Normalised keys that the build's WEAPON_MAP or WARGEAR_MAP sends to another record on purpose,
// because the book profiles the printed item under another record (plan decision 4). The build
// report lists them under MAP OVERRIDES; Task 1.12 Step 4 adds each key here.
const TIER_OVERRIDES = [];
// Same normalisation as build-vehicles.js: §2.3 plus whitespace, apostrophes and the
// "(Vehicle)" / "(Weapon)" / "(Wargear)" disambiguator that some records carry.
function normalise(name) {
    return name.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim()
        .replace(/^\d+ /, '').replace(/^twin /, '')
        .replace(/ \((vehicle|weapon|wargear)\)$/, '').replace(/s$/, '');
}
const isChurchVehicleWeapon = w => w.source === 'church' && (w.category || '').startsWith('Vehicle - ');
const WEAPON_TIERS = [
    weapons.filter(isChurchVehicleWeapon),
    weapons.filter(w => w.source === 'core'),
    weapons.filter(w => !isChurchVehicleWeapon(w) && w.source !== 'core')
];
const vehicleWargear = equipment.filter(e => e.category === 'vehicle wargear');
const WARGEAR_TIERS = [
    vehicleWargear.filter(e => e.source === 'church'),
    vehicleWargear.filter(e => e.source === 'core'),
    vehicleWargear.filter(e => e.source !== 'church' && e.source !== 'core')
];
// The id the tiers give on their own, or null when they give none (then the manual map decides).
function tierId(text, tiers) {
    const key = normalise(text);
    for (const tier of tiers) {
        const hits = tier.filter(r => normalise(r.name) === key);
        if (hits.length === 1) return hits[0].id;
        if (hits.length > 1) return null;
    }
    return null;
}
const overridden = text => TIER_OVERRIDES.includes(normalise(text));
check('a line that a tier matches resolves to that record, not to a same-name record of another book',
    vehicles.flatMap(v => [
        ...weaponsOf(v).filter(w => { const id = tierId(w.text, WEAPON_TIERS); return !overridden(w.text) && id !== null && w.weaponId !== id; })
            .map(w => `${v.id}: ${w.text} -> ${w.weaponId}`),
        ...wargearOf(v).filter(g => { const id = tierId(g.text, WARGEAR_TIERS); return !overridden(g.text) && id !== null && g.equipmentId !== id; })
            .map(g => `${v.id}: ${g.text} -> ${g.equipmentId}`)
    ]), []);
// The same profile rule as build-vehicles.js: the line's normalised name, one space, and one
// bracketed label of letters, spaces and hyphens that is not a source or ammunition tag.
const PROFILE_LABEL = /^[a-z][a-z -]*$/;
const NOT_PROFILE_LABELS = ['ammo', 'abundance of apocrypha', 'adeptus arbites'];
function isProfileOf(recordKey, key) {
    if (!recordKey.startsWith(`${key} (`) || !recordKey.endsWith(')')) return false;
    const label = recordKey.slice(key.length + 2, -1);
    return PROFILE_LABEL.test(label) && !NOT_PROFILE_LABELS.includes(label);
}
// The profile ids the rule gives for a line, or null: no record may match the line by name.
function familyIds(text) {
    const key = normalise(text);
    if (WEAPON_TIERS.some(tier => tier.some(r => normalise(r.name) === key))) return null;
    for (const tier of WEAPON_TIERS) {
        const family = tier.filter(r => isProfileOf(normalise(r.name), key));
        if (family.length >= 2) return family.map(r => r.id);
    }
    return null;
}
check('a weapon that exists only as profile records carries all of them in profileIds, in file order',
    vehicles.flatMap(v => weaponsOf(v).filter(w => !overridden(w.text) && familyIds(w.text) !== null
        && JSON.stringify(familyIds(w.text)) !== JSON.stringify(w.profileIds || null)).map(w => `${v.id}: ${w.text}`)), []);
// True when a line's stored result differs from what the tier and profile rules alone give.
function differsFromRules(item, isWeapon) {
    const tid = tierId(item.text, isWeapon ? WEAPON_TIERS : WARGEAR_TIERS);
    if (tid !== null) return (isWeapon ? item.weaponId : item.equipmentId) !== tid;
    const family = isWeapon ? familyIds(item.text) : null;
    return family !== null && JSON.stringify(item.profileIds || null) !== JSON.stringify(family);
}
check('every TIER_OVERRIDES key names a line that the map sends away from the rules',
    TIER_OVERRIDES.filter(k => !vehicles.some(v => [...weaponsOf(v).map(w => [w, true]), ...wargearOf(v).map(g => [g, false])]
        .some(([item, isWeapon]) => normalise(item.text) === k && differsFromRules(item, isWeapon)))), []);

// --- Review Focus 3: every trait chip opens a vehicleTraits entry ---
// Part 2 uses the same key rule for the chips: drop the value, then snake_case.
const traitKey = t => t.replace(/\s*\([^)]*\)\s*$/, '').toLowerCase().replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
check('traitKey maps printed forms to the keys',
    ['Turbo Boost (2)', 'Gyro-Stabilised', 'Open Topped', 'All-Terrain', 'Gun Ports'].map(traitKey),
    ['turbo_boost', 'gyro_stabilised', 'open_topped', 'all_terrain', 'gun_ports']);
check('every vehicle trait has a vehicleTraits entry',
    vehicles.flatMap(v => (Array.isArray(v.traits) ? v.traits : []).filter(t => !(traitKey(t) in vehicleTraits)).map(t => `${v.id}: ${t}`)), []);
// With only letters, spaces, hyphens and a bracketed value, a lookup by name gives the same entry as the key rule.
const TRAIT_FORM = /^[A-Za-z][A-Za-z -]*( \([^()]+\))?$/;
check('the trait form keeps a printed value and rejects stray punctuation',
    ['Turbo Boost (2)', 'Turbo Boost (X)', 'Gyro-Stabilised', 'Open Topped', 'Sealed.', 'Hover,'].map(t => TRAIT_FORM.test(t)),
    [true, true, true, true, false, false]);
check('every vehicle trait is letters, spaces and hyphens, with an optional value in brackets',
    vehicles.flatMap(v => (Array.isArray(v.traits) ? v.traits : []).filter(t => !TRAIT_FORM.test(t)).map(t => `${v.id}: ${t}`)), []);

// --- Review Focus 2: no PDF artifacts in the text ---
function textProblems(s, paragraphs) {
    const found = [];
    if (s !== s.trim()) found.push('space at an end');
    if (/ {2}/.test(s)) found.push('double space');
    if (/[‘’“”]/.test(s)) found.push('curly quote');
    if (/[­ﬀ-ﬆ]/.test(s)) found.push('soft hyphen or ligature');
    // A suspended hyphen before and/or/to/nor ("short- and long-range") is book text, not a split word.
    if (/[a-z]- (?!(?:and|or|to|nor) )[a-z]/.test(s)) found.push('broken hyphenation');
    if ((paragraphs ? s.replace(/\n\n(?=\S)/g, '') : s).includes('\n')) found.push('stray line break');
    return found;
}
const vehicleTexts = v => [
    ['name', v.name, false], ['description', v.description, true], ['options', v.options, true], ['crew', v.crew, false],
    ...(Array.isArray(v.keywords) ? v.keywords : []).map((k, i) => [`keywords[${i}]`, k, false]),
    ...(Array.isArray(v.traits) ? v.traits : []).map((t, i) => [`traits[${i}]`, t, false]),
    ...weaponsOf(v).map((w, i) => [`weapons[${i}]`, w.text, false]),
    ...wargearOf(v).map((g, i) => [`wargear[${i}]`, g.text, false]),
    ['sidebar.title', v.sidebar?.title, false], ['sidebar.text', v.sidebar?.text, true]
];
check('the hyphenation check keeps a suspended hyphen and flags a split word',
    ['short- and long-range', 'two- or three-man', 'ar- moured'].map(s => textProblems(s, false)),
    [[], [], ['broken hyphenation']]);
check('no PDF artifacts in the vehicle text (hyphenation, quotes, spaces, line breaks)',
    vehicles.flatMap(v => vehicleTexts(v).filter(([, s]) => typeof s === 'string')
        .flatMap(([f, s, para]) => textProblems(s, para).map(p => `${v.id}.${f}: ${p}`))), []);
// Review Focus 4: the vehicle card inserts this plain text into HTML, so a < or > would break the markup.
check('the vehicle text holds no < or >',
    vehicles.flatMap(v => vehicleTexts(v).filter(([, s]) => typeof s === 'string' && /[<>]/.test(s)).map(([f]) => `${v.id}.${f}`)), []);

// --- Review Focus 4: glossary descriptions are safe HTML in the glossary convention ---
const ALLOWED_TAG = /^<(br|strong|\/strong|em|\/em|caption|\/caption|tr|\/tr|th|\/th|td|\/td|\/table|\/div|table class='glossary-table'|div class='glossary-table-scroll')>$/;
function htmlProblems(s) {
    const found = [];
    if (/&(?!(amp|lt|gt|quot|#\d+);)/.test(s)) found.push('bare &');
    const open = [];
    for (const [tag] of s.matchAll(/<[^>]*>/g)) {
        if (!ALLOWED_TAG.test(tag)) { found.push(`tag ${tag}`); continue; }
        const name = tag.match(/^<\/?(\w+)/)[1];
        if (name === 'br') continue;
        if (tag[1] === '/') { if (open.pop() !== name) found.push(`unbalanced ${tag}`); } else open.push(name);
    }
    if (open.length) found.push(`unclosed ${open.join(', ')}`);
    if (/[<>]/.test(s.replace(/<[^>]*>/g, ''))) found.push('stray < or >');
    return found;
}
check('every new glossary name and description is clean, safe HTML',
    glossaryEntries.flatMap(([k, v]) => [
        ...(isText(v.name) ? textProblems(v.name, false) : []),
        ...(isText(v.description) ? [...htmlProblems(v.description), ...textProblems(v.description, false)] : [])
    ].map(p => `${k}: ${p}`)), []);

finish();
```

The plan author dry-ran this file on synthetic fragments (made-up text) through the Task 1.10 build. Every check passed on well-formed data, and each Review Focus check failed on a planted defect.

- [ ] **Step 2: Run the test and see it fail**

Run: `wsl -e bash -c 'cd /root/projects/QK-Wrath-and-Glory && node scripts/test-vehicles.js; echo "exit=$?"'`

Expected:

```
FAIL  data/vehicles.json exists
        expected true, got false

1 check(s) failed.
exit=1
```

The test passes for the first time in Task 1.12.

- [ ] **Step 3: Commit**

```bash
wsl -e bash -c 'cd /root/projects/QK-Wrath-and-Glory && [ "$(/usr/bin/git branch --show-current)" = vehicles ] && /usr/bin/git add scripts/test-vehicles.js && /usr/bin/git commit -q --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Add a failing test for the vehicles data" && /usr/bin/git log --oneline -1' 2>&1 | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
```

The command does nothing unless the `vehicles` branch is checked out (Task 1.0).

### Task 1.2: Set up the work folder, render the pages, and add the fragment checker

**Agent:** `implementer`. Reason: exact commands, the whole checker code and a pass condition.
**Runs in parallel with:** Task 1.1.

**Files (outside the repo, in `/root/projects/.QK-Wrath-and-Glory-reference/work/vehicles/`):**
- Create: `.gitignore`, `renders/` (66 PNG files), `renders/crops/`, `fragments/`, `build/check-fragment.js`
- Create, then delete: `build/sample-fragment.json`

**Interfaces:**
- Produces: `renders/p-029.png` to `p-031.png`, `p-044.png` to `p-055.png`, `p-060.png`, and `p-062.png` to `p-111.png`. Every extraction and verify agent reads them.
- Produces: `node build/check-fragment.js <fragment>`. For a vehicle fragment it prints `Entries: N`, `Entries per page: pNN:n …` and `Blocks without their own Value line: …`. For a glossary fragment it prints `Entries: N` and `Keys in order: …`. Then it prints `PROBLEMS: none` or the list, and exits with code 1 on a problem.

- [ ] **Step 1: Create the folders and the local git repo**

```bash
wsl -e bash -c 'W=/root/projects/.QK-Wrath-and-Glory-reference/work/vehicles; mkdir -p $W/renders/crops $W/fragments $W/build && cd $W && /usr/bin/git init -q && printf "renders/\n" > .gitignore && /usr/bin/git status --short'
```

Expected: `?? .gitignore`. Git does not show empty folders.

- [ ] **Step 2: Render the pages at 200 dpi**

Run this with a timeout of 600000 ms:

```bash
wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && for r in 29-31 44-55 60-60 62-111; do pdftoppm -r 200 -f ${r%-*} -l ${r#*-} -png "/root/projects/.QK-Wrath-and-Glory-reference/books/official-sourcebooks/Church of Steel.pdf" renders/p || exit 1; done; ls renders/*.png | wc -l; ls renders/*.png | head -2'
```

Expected: `66`, then `renders/p-029.png` and `renders/p-030.png`.

- [ ] **Step 3: Write the fragment checker**

Create `build/check-fragment.js` (Windows path `\\wsl.localhost\Ubuntu-24.04\root\projects\.QK-Wrath-and-Glory-reference\work\vehicles\build\check-fragment.js`) with this content:

```javascript
// check-fragment.js: validates one extraction fragment and prints the extractor's self-check.
// Usage (from the work folder):
//   node build/check-fragment.js fragments/group-1.json          (a vehicle group: JSON array)
//   node build/check-fragment.js fragments/vehicle-traits.json   (a glossary fragment: JSON object)
//   node build/check-fragment.js fragments/vehicle-rules.json
// Exit code 1 when it finds a problem.

const fs = require('fs');

const FIELDS = ['id', 'name', 'faction', 'variantOf', 'description', 'options', 'value', 'rarity',
    'speed', 'manoeuvre', 'resilience', 'wounds', 'size', 'keywords', 'crew', 'traits',
    'weapons', 'wargear', 'sidebar', 'source', 'page'];
const FACTIONS = ['Imperial', 'Adepta Sororitas', 'Adeptus Astartes', 'Adeptus Mechanicus', 'Aeronautica Imperialis',
    'Astra Militarum', 'Aeldari', 'Chaos Space Marines', 'Drukhari', 'Necron', 'Ork'];
const SIZES = ['Medium', 'Large', 'Huge', 'Gargantuan'];
const RARITIES = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Unique'];
const TRAIT_KEYS = ['all_terrain', 'amphibious', 'bike', 'flyer', 'gun_ports', 'gyro_stabilised', 'hover',
    'open_topped', 'reliable', 'sealed', 'turbo_boost', 'walker'];
const ALLOWED_TAG = /^<(br|strong|\/strong|em|\/em|caption|\/caption|tr|\/tr|th|\/th|td|\/td|\/table|\/div|table class='glossary-table'|div class='glossary-table-scroll')>$/;
const TRAIT_FORM = /^[A-Za-z][A-Za-z -]*( \([^()]+\))?$/;

const isText = x => typeof x === 'string' && x.length > 0;
const isTextOrNull = x => x === null || isText(x);
const isInt = x => Number.isInteger(x);
const keySet = o => Object.keys(o).sort().join(',');
const traitKey = t => t.replace(/\s*\([^)]*\)\s*$/, '').toLowerCase().replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

function textProblems(s, paragraphs) {
    const found = [];
    if (s !== s.trim()) found.push('space at an end');
    if (/ {2}/.test(s)) found.push('double space');
    if (/[‘’“”]/.test(s)) found.push('curly quote');
    if (/[­ﬀ-ﬆ]/.test(s)) found.push('soft hyphen or ligature');
    // A suspended hyphen before and/or/to/nor ("short- and long-range") is book text, not a split word.
    if (/[a-z]- (?!(?:and|or|to|nor) )[a-z]/.test(s)) found.push('broken hyphenation');
    if ((paragraphs ? s.replace(/\n\n(?=\S)/g, '') : s).includes('\n')) found.push('stray line break');
    return found;
}
function htmlProblems(s) {
    const found = [];
    if (/&(?!(amp|lt|gt|quot|#\d+);)/.test(s)) found.push('bare &');
    const open = [];
    for (const [tag] of s.matchAll(/<[^>]*>/g)) {
        if (!ALLOWED_TAG.test(tag)) { found.push(`tag ${tag}`); continue; }
        const name = tag.match(/^<\/?(\w+)/)[1];
        if (name === 'br') continue;
        if (tag[1] === '/') { if (open.pop() !== name) found.push(`unbalanced ${tag}`); } else open.push(name);
    }
    if (open.length) found.push(`unclosed ${open.join(', ')}`);
    if (/[<>]/.test(s.replace(/<[^>]*>/g, ''))) found.push('stray < or >');
    return found;
}

function checkVehicles(list, problems) {
    list.forEach((e, i) => {
        const at = `[${i}] ${e && e.id}`;
        if (!e || typeof e !== 'object' || keySet(e) !== [...FIELDS].sort().join(',')) {
            problems.push(`${at}: keys must be exactly ${FIELDS.join(', ')}`);
            return;
        }
        const bad = f => problems.push(`${at}: ${f} has a wrong value (${JSON.stringify(e[f])})`);
        if (!isText(e.id) || !/^[a-z0-9]+(_[a-z0-9]+)*$/.test(e.id)) bad('id');
        if (!isText(e.name)) bad('name');
        if (!FACTIONS.includes(e.faction)) bad('faction');
        for (const f of ['variantOf', 'description', 'options']) if (!isTextOrNull(e[f])) bad(f);
        for (const f of ['value', 'speed', 'manoeuvre', 'resilience', 'wounds']) if (!isInt(e[f])) bad(f);
        if (!RARITIES.includes(e.rarity)) bad('rarity');
        if (!SIZES.includes(e.size)) bad('size');
        if (!Array.isArray(e.keywords) || !e.keywords.every(k => isText(k) && k === k.toUpperCase())) bad('keywords');
        if (!isText(e.crew)) bad('crew');
        if (!Array.isArray(e.traits) || !e.traits.every(isText)) bad('traits');
        else for (const t of e.traits) {
            if (!TRAIT_KEYS.includes(traitKey(t))) problems.push(`${at}: trait "${t}" is not one of the 12 vehicle traits`);
            if (!TRAIT_FORM.test(t)) problems.push(`${at}: trait "${t}" must be letters, spaces and hyphens, with an optional value in brackets`);
        }
        if (!Array.isArray(e.weapons)) bad('weapons');
        else for (const w of e.weapons) {
            const ks = w && typeof w === 'object' ? keySet(w) : '';
            if ((ks !== 'count,text' && ks !== 'count,text,twin') || !isText(w.text) || !isInt(w.count) || w.count < 1) {
                problems.push(`${at}: weapon item ${JSON.stringify(w)} must be { text, count } or { text, count, twin: true }`);
                continue;
            }
            const m = w.text.match(/^(\d+) /);
            if (w.count !== (m ? Number(m[1]) : 1)) problems.push(`${at}: "${w.text}" needs count ${m ? Number(m[1]) : 1}`);
            if (('twin' in w) !== /^(\d+ )?Twin /.test(w.text) || ('twin' in w && w.twin !== true)) problems.push(`${at}: "${w.text}" twin is wrong`);
        }
        if (!Array.isArray(e.wargear) || !e.wargear.every(g => g && typeof g === 'object' && keySet(g) === 'text' && isText(g.text))) bad('wargear');
        if (e.sidebar !== null && !(e.sidebar && keySet(e.sidebar) === 'text,title' && isText(e.sidebar.title) && isText(e.sidebar.text))) bad('sidebar');
        if (e.source !== 'church') bad('source');
        if (!isInt(e.page) || e.page < 64 || e.page > 111) bad('page');
        const texts = [['name', e.name, false], ['description', e.description, true], ['options', e.options, true],
            ['crew', e.crew, false], ['sidebar.title', e.sidebar && e.sidebar.title, false], ['sidebar.text', e.sidebar && e.sidebar.text, true],
            ...(Array.isArray(e.keywords) ? e.keywords : []).map(k => ['keyword', k, false]),
            ...(Array.isArray(e.traits) ? e.traits : []).map(t => ['trait', t, false]),
            ...(Array.isArray(e.weapons) ? e.weapons : []).map(w => ['weapon', w && w.text, false]),
            ...(Array.isArray(e.wargear) ? e.wargear : []).map(g => ['wargear', g && g.text, false])];
        for (const [f, s, para] of texts) {
            if (typeof s !== 'string') continue;
            for (const p of textProblems(s, para)) problems.push(`${at}: ${f}: ${p}`);
            if (/[<>]/.test(s)) problems.push(`${at}: ${f}: < or > in plain text`);
        }
    });
    const ids = list.map(e => e && e.id);
    for (const id of new Set(ids)) if (ids.filter(x => x === id).length > 1) problems.push(`duplicate id ${id}`);
    for (const e of list) if (e && e.variantOf && !ids.includes(e.variantOf)) problems.push(`${e.id}: variantOf ${e.variantOf} is not in this fragment`);

    const perPage = {};
    for (const e of list) if (e) perPage[e.page] = (perPage[e.page] || 0) + 1;
    console.log(`Entries: ${list.length}`);
    console.log(`Entries per page: ${Object.entries(perPage).map(([p, n]) => `p${p}:${n}`).join(' ')}`);
    const noValueLine = list.filter(e => e && (e.variantOf !== null || e.id.startsWith('archaeopter_')));
    console.log(`Blocks without their own Value line: ${noValueLine.map(e => `${e.id}${e.variantOf ? ` (variantOf ${e.variantOf})` : ''}`).join(', ') || 'none'}`);
}

function checkGlossary(obj, problems) {
    for (const [k, v] of Object.entries(obj)) {
        if (!/^[a-z0-9]+(_[a-z0-9]+)*$/.test(k)) problems.push(`${k}: key is not snake_case`);
        if (!v || typeof v !== 'object' || keySet(v) !== 'description,name,page,source') {
            problems.push(`${k}: keys must be exactly name, source, page, description`);
            continue;
        }
        if (!isText(v.name)) problems.push(`${k}: name is empty`);
        if (v.source !== 'church') problems.push(`${k}: source must be "church"`);
        if (!isInt(v.page)) problems.push(`${k}: page must be an integer`);
        if (!isText(v.description)) problems.push(`${k}: description is empty`);
        else for (const p of [...htmlProblems(v.description), ...textProblems(v.description, false)]) problems.push(`${k}: ${p}`);
        if (isText(v.name)) for (const p of textProblems(v.name, false)) problems.push(`${k}: name: ${p}`);
    }
    console.log(`Entries: ${Object.keys(obj).length}`);
    console.log(`Keys in order: ${Object.keys(obj).join(', ')}`);
}

let data;
try {
    data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
} catch (err) {
    console.log(`PROBLEM: cannot read ${process.argv[2]}: ${err.message}`);
    process.exit(1);
}
const problems = [];
if (Array.isArray(data)) checkVehicles(data, problems);
else checkGlossary(data, problems);
console.log(problems.length ? `PROBLEMS (${problems.length}):\n  ${problems.join('\n  ')}` : 'PROBLEMS: none');
process.exit(problems.length ? 1 : 0);
```

- [ ] **Step 4: Test the checker on the spec example**

Create `build/sample-fragment.json` with the spec §2.1 Chimera example in fragment form, with one curly apostrophe planted in `options`:

```json
[
  {
    "id": "chimera",
    "name": "Chimera",
    "faction": "Astra Militarum",
    "variantOf": null,
    "description": "The Chimera is an armoured transport with thousands of years of service vouching for its reliable, rugged design. The Astra Militarum regularly moves ground troops from fight to fight within its armoured shell, and many other vehicles are based on the venerable Chimera chassis. It is peppered in Gun Ports that allow Passengers to shoot out.",
    "options": "All Chimera-based tanks can carry a Hunter-Killer Missile and a Dozer Blade, plus either a Storm Bolter or a Heavy Stubber. Each may exchange its Heavy Bolter for a Heavy Flamer. The baseline Chimera’s Multi-Laser can be exchanged for a Heavy Flamer, Heavy Bolter, Autocannon, or Twin Heavy Bolter.",
    "value": 10,
    "rarity": "Rare",
    "speed": 26,
    "manoeuvre": 3,
    "resilience": 16,
    "wounds": 15,
    "size": "Huge",
    "keywords": ["IMPERIUM", "ASTRA MILITARUM", "TRANSPORT"],
    "crew": "1 Pilot, 2 Crew, 12 Passengers",
    "traits": ["Amphibious", "Gun Ports", "Reliable", "Sealed"],
    "weapons": [
      { "text": "Heavy Bolter", "count": 1 },
      { "text": "Lasgun Array (6 Lasguns)", "count": 1 },
      { "text": "Multi-Laser", "count": 1 }
    ],
    "wargear": [
      { "text": "Smoke Launchers" }
    ],
    "sidebar": null,
    "source": "church",
    "page": 84
  }
]
```

Run: `wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && node build/check-fragment.js build/sample-fragment.json; echo "exit=$?"; node build/check-fragment.js /dev/null; echo "exit=$?"; rm build/sample-fragment.json'`

Expected:

```
Entries: 1
Entries per page: p84:1
Blocks without their own Value line: none
PROBLEMS (1):
  [0] chimera: options: curly quote
exit=1
PROBLEM: cannot read /dev/null: Unexpected end of JSON input
exit=1
```

The sample holds one planted curly apostrophe, in `Chimera’s`. The checker must report it as the one problem.

- [ ] **Step 5: Commit to the work repo**

```bash
wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && /usr/bin/git add .gitignore build/check-fragment.js && /usr/bin/git commit -q --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Set up the vehicles work folder and the fragment checker" && /usr/bin/git log --oneline -1 && /usr/bin/git status --short' 2>&1 | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
```

Expected: one log line. `git status --short` prints nothing, because git ignores the renders.

### Task 1.3: Transcribe group 1 (Imperial, Adepta Sororitas, Adeptus Mechanicus, Aeronautica Imperialis)

**Agent:** `general-purpose`, `model: opus`. Reason: transcription is data work that needs judgment against the page (user CLAUDE.md §4).
**Runs in parallel with:** Tasks 1.4 to 1.10.

**Files (outside the repo):**
- Create: `/root/projects/.QK-Wrath-and-Glory-reference/work/vehicles/fragments/group-1.json`
- Read: `renders/p-064.png` to `p-068.png`, `p-079.png` to `p-082.png`, `p-084.png`

**Interfaces:**
- Consumes: the renders and `build/check-fragment.js` (Task 1.2).
- Produces: `fragments/group-1.json`, a JSON array of 25 objects in the schema of Step 2. The build (Task 1.10) reads it.

The executor sends this whole task to the agent as its brief.

- [ ] **Step 1: Read the tools and the source**

You transcribe stat blocks from the *Church of Steel* sourcebook into one JSON file: `fragments/group-1.json` in the work folder. You change no file in the repo `/root/projects/QK-Wrath-and-Glory`.

- Use the Bash tool (Git Bash). Run each shell command in WSL: `wsl -e bash -c '<command>'`. Put a command with nested quotes in a script file inside the work folder's `build/` folder, and run that file.
- The work folder is `/root/projects/.QK-Wrath-and-Glory-reference/work/vehicles` in WSL. Its Windows path is `\\wsl.localhost\Ubuntu-24.04\root\projects\.QK-Wrath-and-Glory-reference\work\vehicles`.
- The page images are `renders/p-NNN.png`: 200 dpi, with a three-digit page number. The PDF page number equals the printed page number. Read an image with the Read tool at its Windows path, for example `\\wsl.localhost\Ubuntu-24.04\root\projects\.QK-Wrath-and-Glory-reference\work\vehicles\renders\p-064.png`.
- When digits or small text are hard to read, make a 300 dpi crop and read the crop. The numbers after `-x -y -W -H` are pixels at 300 dpi. A full page at 300 dpi is 2539 × 3189 pixels. A point at (x, y) in a 200 dpi image is at (1.5x, 1.5y) at 300 dpi. This example crops the lower quarter of p. 64:

  ```bash
  wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && pdftoppm -r 300 -f 64 -l 64 -x 0 -y 2390 -W 2539 -H 799 -singlefile -png "/root/projects/.QK-Wrath-and-Glory-reference/books/official-sourcebooks/Church of Steel.pdf" renders/crops/p064-low'
  ```

  Then read `renders\crops\p064-low.png`.
- Use `pdfgrep -n` only to find the page of a word, and `pdfgrep -c` only to count a spelling. Never use `pdftotext`. Never copy text out of `pdfgrep` output, because it merges the two text columns. Take the text from the images.
- The book and the images are copyrighted. Keep every render and every crop inside `renders/`. Copy them to no other folder.
- Do not read a whole data file of the repo. Use `grep -n` or a `node` one-liner to look up one record.
- Write the fragment with the Write tool at `\\wsl.localhost\Ubuntu-24.04\root\projects\.QK-Wrath-and-Glory-reference\work\vehicles\fragments\group-1.json`.

- [ ] **Step 2: Read the fragment schema**

The fragment is a JSON array with one object per stat block. Write the objects in book order: page by page, and on one page the left column from top to bottom, then the right column. Every object has exactly these 21 keys, in this order:

| Key | Value |
|---|---|
| `id` | The id from the table in Step 4. It is the snake_case of the name: lower case, apostrophes dropped, each run of other characters that are not letters or digits replaced by one `_`. A variant whose printed title is one word starts with its family parent's id: `Crusader` gives `land_raider_crusader`, `Firestorm` gives `falcon_firestorm`. A title of two or more words stands alone: `Attack Bike` gives `attack_bike`. A hyphen separates words, so `Burna-Bommer` gives `burna_bommer`. The Archaeopters follow their stored name: `archaeopter_fusilave`. |
| `name` | The printed heading in title case. The book prints headings in capitals. Use the spelling in the table in Step 4. |
| `faction` | One of these 11 strings: `Imperial`, `Adepta Sororitas`, `Adeptus Astartes`, `Adeptus Mechanicus`, `Aeronautica Imperialis`, `Astra Militarum`, `Aeldari`, `Chaos Space Marines`, `Drukhari`, `Necron`, `Ork`. Take it from the section heading that the block sits under. |
| `variantOf` | The family parent's `id` for a block that has no Value/Rarity line of its own; else `null`. Step 4 names the variants. |
| `description` | The text under the heading, before the Value line. For a variant: its own paragraph under its heading, or `null` when it has none. |
| `options` | The text after the Value line (the loadout paragraph), or `null` when there is none. Every variant has `null`. Text after a family's Value line belongs to the family's `options`, even when it names a variant. |
| `value` | The number on the Value line, as an integer. A variant copies its family's Value, unless Step 4 names an override. |
| `rarity` | The word on the Rarity line: `Common`, `Uncommon`, `Rare`, `Very Rare` or `Unique`. A variant copies its family's Rarity, unless Step 4 names an override. |
| `speed` | The `Spd` column, as an integer. |
| `manoeuvre` | The `Man` column, as an integer. |
| `resilience` | The `Res` column, as an integer. |
| `wounds` | The `W` column, as an integer. |
| `size` | The `Size` column as the full word: `Med` gives `Medium`, `Large` gives `Large`, `Huge` gives `Huge`, `Gtn` gives `Gargantuan`. |
| `keywords` | The Keywords line split at the commas, in printed order, in capitals. Keep `TRANSPORTER` where the book prints it; do not change it to `TRANSPORT`. Keep `[LEGION]` and `[MARK OF CHAOS]` with their brackets. A keyword that wraps onto the next line is one item. |
| `crew` | The Crew Complement text exactly as printed, for example `1 Pilot, 2 Crew, 12 Passengers`. |
| `traits` | The Traits line split at the commas, each item as printed with its value, for example `Turbo Boost (2)`. An empty box gives `[]`. |
| `weapons` | One object per printed weapon line: `{ "text": "<the line as printed>", "count": <n> }`. `count` is the number that starts the line (`2 Heavy Bolters` gives 2); with no number, it is 1. Add `"twin": true` after `count` when the word `Twin` starts the line or follows that number (`Twin Lascannon`, `2 Twin Big Shootas`). Otherwise leave `twin` out. A name that wraps onto a second printed line is one item. An empty box (`–` or `N/A`) gives `[]`. |
| `wargear` | One object per printed wargear line: `{ "text": "<the line as printed>" }`. An empty box gives `[]`. |
| `sidebar` | `{ "title": "<box title in title case>", "text": "<box text>" }` for a rule box inside the entry; else `null`. |
| `source` | Always `"church"`. |
| `page` | The printed page that holds the block's `Spd` row, as an integer. |

Do not add `weaponId`, `profileIds` or `equipmentId`. The build step adds them.

If a `Spd`, `Man`, `Res` or `W` cell is not a plain integer, stop work on that block. Leave the block out of the fragment, and report it as a STOP line in Step 6. Do not store the printed text in place of the number; the main session decides (Task 1.11).

- [ ] **Step 3: Read the text rules**

1. Copy the book's words exactly. Keep its spelling, capitals, punctuation and typos. Do not summarise, correct or add words.
2. Never write `[AI-Generated]`. Where the book prints no text, write `null`, or `[]` for a list.
3. Write straight apostrophes and quotation marks: `'` and `"`. Change each curly one to a straight one. Inside a JSON string, write `"` as `\"`.
4. Keep each dash as printed: em dash `—`, en dash `–`, hyphen `-`.
5. Inside a paragraph, a line break becomes one space. Write no double spaces. Start and end each string with a character that is not a space.
6. A word with a hyphen at the end of a line: keep the hyphen when the word is a hyphenated compound (`Hunter-Killer`, `Multi-Laser`, `Gyro-Stabilised`). Drop the hyphen and join the parts when it only splits the word (`ar-` and `moured` give `armoured`). When you are not sure, count both spellings in the book and use the one with more hits:

   ```bash
   wsl -e bash -c 'B="/root/projects/.QK-Wrath-and-Glory-reference/books/official-sourcebooks/Church of Steel.pdf"; pdfgrep -c -i "antigrav" "$B"; pdfgrep -c -i "anti-grav" "$B"'
   ```

   To check the hyphen in a weapon or wargear name, find the name in the data: `wsl -e bash -c 'grep -n -i "\"name\": \"multi-laser" /root/projects/QK-Wrath-and-Glory/data/weapons.json'`.

   A suspended hyphen before `and`, `or`, `to` or `nor` is book text, for example `short- and long-range`. Keep it with its space.
7. The book's own cross-references, such as `(see page 54)`, stay as printed. Add no page reference of your own.
8. Between two paragraphs, write `\n\n`. Write no other line breaks. Write no HTML.

- [ ] **Step 4: Transcribe the 25 blocks of group 1**

Pages: 64 to 68 (Imperial, Adepta Sororitas), 79 to 81 (Adeptus Mechanicus), 82 and 84 (Aeronautica Imperialis). These are the expected entries, in spec Appendix A order:

| Page | `id` | `name` | `faction` | `variantOf` |
|---|---|---|---|---|
| 64 | `achilles_ridgerunner` | Achilles Ridgerunner | Imperial | `null` |
| 64 | `avachrus_ridgerunner` | Avachrus Ridgerunner | Imperial | `null` |
| 65 | `dirtcycle` | Dirtcycle | Imperial | `null` |
| 65 | `goliath_truck` | Goliath Truck | Imperial | `null` |
| 65 | `goliath_rockgrinder` | Goliath Rockgrinder | Imperial | `null` |
| 66 | `tauros` | Tauros | Imperial | `null` |
| 66 | `tauros_venator` | Tauros Venator | Imperial | `null` |
| 66 | `wolfquad` | Wolfquad | Imperial | `null` |
| 67 | `castigator` | Castigator | Adepta Sororitas | `null` |
| 67 | `exorcist` | Exorcist | Adepta Sororitas | `null` |
| 68 | `immolator` | Immolator | Adepta Sororitas | `null` |
| 68 | `repressor` | Repressor | Adepta Sororitas | `null` |
| 68 | `adepta_sororitas_rhino` | Adepta Sororitas Rhino | Adepta Sororitas | `null` |
| 79 | `archaeopter_fusilave` | Archaeopter Fusilave | Adeptus Mechanicus | `null` |
| 79 | `archaeopter_stratoraptor` | Archaeopter Stratoraptor | Adeptus Mechanicus | `null` |
| 79 | `archaeopter_transvector` | Archaeopter Transvector | Adeptus Mechanicus | `null` |
| 80 | `onager_dunecrawler` | Onager Dunecrawler | Adeptus Mechanicus | `null` |
| 80 | `skorpius_disintegrator` | Skorpius Disintegrator | Adeptus Mechanicus | `null` |
| 81 | `skorpius_dunerider` | Skorpius Dunerider | Adeptus Mechanicus | `null` |
| 81 | `ironstrider_ballistarius` | Ironstrider Ballistarius | Adeptus Mechanicus | `null` |
| 81 | `sydonian_dragoon` | Sydonian Dragoon | Adeptus Mechanicus | `null` |
| 82 | `aquila_lander` | Aquila Lander | Aeronautica Imperialis | `null` |
| 82 | `arvus_lighter` | Arvus Lighter | Aeronautica Imperialis | `null` |
| 82 | `vulture_gunship` | Vulture Gunship | Aeronautica Imperialis | `null` |
| 84 | `valkyrie` | Valkyrie | Aeronautica Imperialis | `null` |

Group notes:

- p. 84 holds two blocks. Transcribe only the Valkyrie; group 3 transcribes the Chimera. p. 83 holds no block.
- The Archaeopter family (p. 79) prints its own text and a Value/Rarity line, but no stat block. Its three blocks are top-level entries with `variantOf: null`.
  - Each `name` is `Archaeopter` plus the printed block title, for example `Archaeopter Fusilave`.
  - Each of the three copies the family `value`, `rarity` and `options`.
  - Each `description` is the family text. When a block prints its own paragraph, add that paragraph after `\n\n`.
- No block of this group is a variant. Every other block has its own Value/Rarity line.

- [ ] **Step 5: Run the checker and fix the fragment**

Run: `wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && node build/check-fragment.js fragments/group-1.json'`

Expected (the order inside a line follows your reading order):

```
Entries: 25
Entries per page: p64:2 p65:3 p66:3 p67:2 p68:3 p79:3 p80:2 p81:3 p82:3 p84:1
Blocks without their own Value line: archaeopter_fusilave, archaeopter_stratoraptor, archaeopter_transvector
PROBLEMS: none
```

Fix each problem and run the checker again. A problem that the page itself causes can stay; explain it in the report.

- [ ] **Step 6: Report**

End with this report as your final message:

```
GROUP 1 REPORT
Entries per page: <the checker line>
Total: <n>
Blocks without their own Value line: <the checker line>
Confirmed on the pages that these blocks print no Value line: yes | no (<details>)
PROBLEMS:
- <one line per item, with its page>
```

Under PROBLEMS, list:

- each checker problem that stays, and the reason;
- each heading whose words differ from Step 4 (not only in case);
- each faction heading whose words differ from the 11 strings;
- each stat cell that is not a plain integer, as `STOP: <id> | <column> | <printed text> | p. <n>` (the block stays out of the fragment);
- each weapon quantity written as a word;
- each trait that is not one of the 12 vehicle traits;
- each place that you could not read, even in a 300 dpi crop.

Write `PROBLEMS: none` when there is nothing to list.

- [ ] **Step 7: Commit the fragment to the work repo**

```bash
wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && /usr/bin/git add fragments/group-1.json && /usr/bin/git commit -q --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Add the group 1 vehicle fragment" && /usr/bin/git log --oneline -1' 2>&1 | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
```

If git reports `index.lock`, another task is committing at the same time. Run the same command again.

### Task 1.4: Transcribe group 2 (Adeptus Astartes)

**Agent:** `general-purpose`, `model: opus`. Reason: transcription is data work that needs judgment against the page (user CLAUDE.md §4).
**Runs in parallel with:** Tasks 1.3 and 1.5 to 1.10.

**Files (outside the repo):**
- Create: `/root/projects/.QK-Wrath-and-Glory-reference/work/vehicles/fragments/group-2.json`
- Read: `renders/p-069.png` to `p-078.png`

**Interfaces:**
- Consumes: the renders and `build/check-fragment.js` (Task 1.2).
- Produces: `fragments/group-2.json`, a JSON array of 23 objects in the schema of Step 2. The build (Task 1.10) reads it.

The executor sends this whole task to the agent as its brief.

- [ ] **Step 1: Read the tools and the source**

You transcribe stat blocks from the *Church of Steel* sourcebook into one JSON file: `fragments/group-2.json` in the work folder. You change no file in the repo `/root/projects/QK-Wrath-and-Glory`.

- Use the Bash tool (Git Bash). Run each shell command in WSL: `wsl -e bash -c '<command>'`. Put a command with nested quotes in a script file inside the work folder's `build/` folder, and run that file.
- The work folder is `/root/projects/.QK-Wrath-and-Glory-reference/work/vehicles` in WSL. Its Windows path is `\\wsl.localhost\Ubuntu-24.04\root\projects\.QK-Wrath-and-Glory-reference\work\vehicles`.
- The page images are `renders/p-NNN.png`: 200 dpi, with a three-digit page number. The PDF page number equals the printed page number. Read an image with the Read tool at its Windows path, for example `\\wsl.localhost\Ubuntu-24.04\root\projects\.QK-Wrath-and-Glory-reference\work\vehicles\renders\p-064.png`.
- When digits or small text are hard to read, make a 300 dpi crop and read the crop. The numbers after `-x -y -W -H` are pixels at 300 dpi. A full page at 300 dpi is 2539 × 3189 pixels. A point at (x, y) in a 200 dpi image is at (1.5x, 1.5y) at 300 dpi. This example crops the lower quarter of p. 64:

  ```bash
  wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && pdftoppm -r 300 -f 64 -l 64 -x 0 -y 2390 -W 2539 -H 799 -singlefile -png "/root/projects/.QK-Wrath-and-Glory-reference/books/official-sourcebooks/Church of Steel.pdf" renders/crops/p064-low'
  ```

  Then read `renders\crops\p064-low.png`.
- Use `pdfgrep -n` only to find the page of a word, and `pdfgrep -c` only to count a spelling. Never use `pdftotext`. Never copy text out of `pdfgrep` output, because it merges the two text columns. Take the text from the images.
- The book and the images are copyrighted. Keep every render and every crop inside `renders/`. Copy them to no other folder.
- Do not read a whole data file of the repo. Use `grep -n` or a `node` one-liner to look up one record.
- Write the fragment with the Write tool at `\\wsl.localhost\Ubuntu-24.04\root\projects\.QK-Wrath-and-Glory-reference\work\vehicles\fragments\group-2.json`.

- [ ] **Step 2: Read the fragment schema**

The fragment is a JSON array with one object per stat block. Write the objects in book order: page by page, and on one page the left column from top to bottom, then the right column. Every object has exactly these 21 keys, in this order:

| Key | Value |
|---|---|
| `id` | The id from the table in Step 4. It is the snake_case of the name: lower case, apostrophes dropped, each run of other characters that are not letters or digits replaced by one `_`. A variant whose printed title is one word starts with its family parent's id: `Crusader` gives `land_raider_crusader`, `Firestorm` gives `falcon_firestorm`. A title of two or more words stands alone: `Attack Bike` gives `attack_bike`. A hyphen separates words, so `Burna-Bommer` gives `burna_bommer`. The Archaeopters follow their stored name: `archaeopter_fusilave`. |
| `name` | The printed heading in title case. The book prints headings in capitals. Use the spelling in the table in Step 4. |
| `faction` | One of these 11 strings: `Imperial`, `Adepta Sororitas`, `Adeptus Astartes`, `Adeptus Mechanicus`, `Aeronautica Imperialis`, `Astra Militarum`, `Aeldari`, `Chaos Space Marines`, `Drukhari`, `Necron`, `Ork`. Take it from the section heading that the block sits under. |
| `variantOf` | The family parent's `id` for a block that has no Value/Rarity line of its own; else `null`. Step 4 names the variants. |
| `description` | The text under the heading, before the Value line. For a variant: its own paragraph under its heading, or `null` when it has none. |
| `options` | The text after the Value line (the loadout paragraph), or `null` when there is none. Every variant has `null`. Text after a family's Value line belongs to the family's `options`, even when it names a variant. |
| `value` | The number on the Value line, as an integer. A variant copies its family's Value, unless Step 4 names an override. |
| `rarity` | The word on the Rarity line: `Common`, `Uncommon`, `Rare`, `Very Rare` or `Unique`. A variant copies its family's Rarity, unless Step 4 names an override. |
| `speed` | The `Spd` column, as an integer. |
| `manoeuvre` | The `Man` column, as an integer. |
| `resilience` | The `Res` column, as an integer. |
| `wounds` | The `W` column, as an integer. |
| `size` | The `Size` column as the full word: `Med` gives `Medium`, `Large` gives `Large`, `Huge` gives `Huge`, `Gtn` gives `Gargantuan`. |
| `keywords` | The Keywords line split at the commas, in printed order, in capitals. Keep `TRANSPORTER` where the book prints it; do not change it to `TRANSPORT`. Keep `[LEGION]` and `[MARK OF CHAOS]` with their brackets. A keyword that wraps onto the next line is one item. |
| `crew` | The Crew Complement text exactly as printed, for example `1 Pilot, 2 Crew, 12 Passengers`. |
| `traits` | The Traits line split at the commas, each item as printed with its value, for example `Turbo Boost (2)`. An empty box gives `[]`. |
| `weapons` | One object per printed weapon line: `{ "text": "<the line as printed>", "count": <n> }`. `count` is the number that starts the line (`2 Heavy Bolters` gives 2); with no number, it is 1. Add `"twin": true` after `count` when the word `Twin` starts the line or follows that number (`Twin Lascannon`, `2 Twin Big Shootas`). Otherwise leave `twin` out. A name that wraps onto a second printed line is one item. An empty box (`–` or `N/A`) gives `[]`. |
| `wargear` | One object per printed wargear line: `{ "text": "<the line as printed>" }`. An empty box gives `[]`. |
| `sidebar` | `{ "title": "<box title in title case>", "text": "<box text>" }` for a rule box inside the entry; else `null`. |
| `source` | Always `"church"`. |
| `page` | The printed page that holds the block's `Spd` row, as an integer. |

Do not add `weaponId`, `profileIds` or `equipmentId`. The build step adds them.

If a `Spd`, `Man`, `Res` or `W` cell is not a plain integer, stop work on that block. Leave the block out of the fragment, and report it as a STOP line in Step 6. Do not store the printed text in place of the number; the main session decides (Task 1.11).

- [ ] **Step 3: Read the text rules**

1. Copy the book's words exactly. Keep its spelling, capitals, punctuation and typos. Do not summarise, correct or add words.
2. Never write `[AI-Generated]`. Where the book prints no text, write `null`, or `[]` for a list.
3. Write straight apostrophes and quotation marks: `'` and `"`. Change each curly one to a straight one. Inside a JSON string, write `"` as `\"`.
4. Keep each dash as printed: em dash `—`, en dash `–`, hyphen `-`.
5. Inside a paragraph, a line break becomes one space. Write no double spaces. Start and end each string with a character that is not a space.
6. A word with a hyphen at the end of a line: keep the hyphen when the word is a hyphenated compound (`Hunter-Killer`, `Multi-Laser`, `Gyro-Stabilised`). Drop the hyphen and join the parts when it only splits the word (`ar-` and `moured` give `armoured`). When you are not sure, count both spellings in the book and use the one with more hits:

   ```bash
   wsl -e bash -c 'B="/root/projects/.QK-Wrath-and-Glory-reference/books/official-sourcebooks/Church of Steel.pdf"; pdfgrep -c -i "antigrav" "$B"; pdfgrep -c -i "anti-grav" "$B"'
   ```

   To check the hyphen in a weapon or wargear name, find the name in the data: `wsl -e bash -c 'grep -n -i "\"name\": \"multi-laser" /root/projects/QK-Wrath-and-Glory/data/weapons.json'`.

   A suspended hyphen before `and`, `or`, `to` or `nor` is book text, for example `short- and long-range`. Keep it with its space.
7. The book's own cross-references, such as `(see page 54)`, stay as printed. Add no page reference of your own.
8. Between two paragraphs, write `\n\n`. Write no other line breaks. Write no HTML.

- [ ] **Step 4: Transcribe the 23 blocks of group 2**

Pages: 69 to 78, all Adeptus Astartes. These are the expected entries, in spec Appendix A order:

| Page | `id` | `name` | `faction` | `variantOf` |
|---|---|---|---|---|
| 69 | `assault_bike` | Assault Bike | Adeptus Astartes | `null` |
| 69 | `attack_bike` | Attack Bike | Adeptus Astartes | `assault_bike` |
| 69 | `scout_bike` | Scout Bike | Adeptus Astartes | `assault_bike` |
| 70 | `land_raider` | Land Raider | Adeptus Astartes | `null` |
| 70 | `land_raider_crusader` | Crusader | Adeptus Astartes | `land_raider` |
| 70 | `land_raider_redeemer` | Redeemer | Adeptus Astartes | `land_raider` |
| 71 | `land_speeder` | Land Speeder | Adeptus Astartes | `null` |
| 71 | `land_speeder_tornado` | Land Speeder Tornado | Adeptus Astartes | `land_speeder` |
| 71 | `land_speeder_typhoon` | Land Speeder Typhoon | Adeptus Astartes | `land_speeder` |
| 72 | `land_speeder_storm` | Land Speeder Storm | Adeptus Astartes | `null` |
| 72 | `rhino` | Rhino | Adeptus Astartes | `null` |
| 73 | `razorback` | Razorback | Adeptus Astartes | `null` |
| 74 | `predator_annihilator` | Predator Annihilator | Adeptus Astartes | `null` |
| 74 | `predator_destructor` | Predator Destructor | Adeptus Astartes | `null` |
| 75 | `vindicator` | Vindicator | Adeptus Astartes | `null` |
| 75 | `whirlwind` | Whirlwind | Adeptus Astartes | `null` |
| 76 | `gladiator` | Gladiator | Adeptus Astartes | `null` |
| 76 | `gladiator_reaper` | Gladiator Reaper | Adeptus Astartes | `gladiator` |
| 76 | `gladiator_valiant` | Gladiator Valiant | Adeptus Astartes | `gladiator` |
| 77 | `impulsor` | Impulsor | Adeptus Astartes | `null` |
| 77 | `invader_atv` | Invader ATV | Adeptus Astartes | `null` |
| 78 | `repulsor` | Repulsor | Adeptus Astartes | `null` |
| 78 | `repulsor_executioner` | Repulsor Executioner | Adeptus Astartes | `repulsor` |

Group notes:

- Nine blocks are variants. A variant prints no Value/Rarity line of its own. It copies its family's `value` and `rarity`, has `options: null`, and keeps its own paragraph in `description` (or `null`).
  - `Attack Bike` and `Scout Bike` have `variantOf: "assault_bike"`.
  - `Crusader` and `Redeemer` have `variantOf: "land_raider"`.
  - `Land Speeder Tornado` and `Land Speeder Typhoon` have `variantOf: "land_speeder"`.
  - `Gladiator Reaper` and `Gladiator Valiant` have `variantOf: "gladiator"`.
  - `Repulsor Executioner` has `variantOf: "repulsor"`.
- Override: the Land Speeder family text gives the Tornado and the Typhoon a Value of 12. Store `value: 12` on both. Their `rarity` copies the family.
- Text after a family's Value line belongs to the family's `options`, even when it names a variant. Text under a variant's own heading belongs to that variant's `description`.

- [ ] **Step 5: Run the checker and fix the fragment**

Run: `wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && node build/check-fragment.js fragments/group-2.json'`

Expected (the order inside a line follows your reading order):

```
Entries: 23
Entries per page: p69:3 p70:3 p71:3 p72:2 p73:1 p74:2 p75:2 p76:3 p77:2 p78:2
Blocks without their own Value line: attack_bike (variantOf assault_bike), scout_bike (variantOf assault_bike), land_raider_crusader (variantOf land_raider), land_raider_redeemer (variantOf land_raider), land_speeder_tornado (variantOf land_speeder), land_speeder_typhoon (variantOf land_speeder), gladiator_reaper (variantOf gladiator), gladiator_valiant (variantOf gladiator), repulsor_executioner (variantOf repulsor)
PROBLEMS: none
```

Fix each problem and run the checker again. A problem that the page itself causes can stay; explain it in the report.

- [ ] **Step 6: Report**

End with this report as your final message:

```
GROUP 2 REPORT
Entries per page: <the checker line>
Total: <n>
Blocks without their own Value line: <the checker line>
Confirmed on the pages that these blocks print no Value line: yes | no (<details>)
Override: land_speeder_tornado and land_speeder_typhoon value 12, confirmed in the family text: yes | no (<details>)
PROBLEMS:
- <one line per item, with its page>
```

Under PROBLEMS, list:

- each checker problem that stays, and the reason;
- each heading whose words differ from Step 4 (not only in case);
- each faction heading whose words differ from the 11 strings;
- each stat cell that is not a plain integer, as `STOP: <id> | <column> | <printed text> | p. <n>` (the block stays out of the fragment);
- each weapon quantity written as a word;
- each trait that is not one of the 12 vehicle traits;
- each place that you could not read, even in a 300 dpi crop.

Write `PROBLEMS: none` when there is nothing to list.

- [ ] **Step 7: Commit the fragment to the work repo**

```bash
wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && /usr/bin/git add fragments/group-2.json && /usr/bin/git commit -q --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Add the group 2 vehicle fragment" && /usr/bin/git log --oneline -1' 2>&1 | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
```

If git reports `index.lock`, another task is committing at the same time. Run the same command again.

### Task 1.5: Transcribe group 3 (Astra Militarum)

**Agent:** `general-purpose`, `model: opus`. Reason: transcription is data work that needs judgment against the page (user CLAUDE.md §4).
**Runs in parallel with:** Tasks 1.3, 1.4 and 1.6 to 1.10.

**Files (outside the repo):**
- Create: `/root/projects/.QK-Wrath-and-Glory-reference/work/vehicles/fragments/group-3.json`
- Read: `renders/p-084.png` to `p-089.png`, `p-091.png`

**Interfaces:**
- Consumes: the renders and `build/check-fragment.js` (Task 1.2).
- Produces: `fragments/group-3.json`, a JSON array of 18 objects in the schema of Step 2. The build (Task 1.10) reads it.

The executor sends this whole task to the agent as its brief.

- [ ] **Step 1: Read the tools and the source**

You transcribe stat blocks from the *Church of Steel* sourcebook into one JSON file: `fragments/group-3.json` in the work folder. You change no file in the repo `/root/projects/QK-Wrath-and-Glory`.

- Use the Bash tool (Git Bash). Run each shell command in WSL: `wsl -e bash -c '<command>'`. Put a command with nested quotes in a script file inside the work folder's `build/` folder, and run that file.
- The work folder is `/root/projects/.QK-Wrath-and-Glory-reference/work/vehicles` in WSL. Its Windows path is `\\wsl.localhost\Ubuntu-24.04\root\projects\.QK-Wrath-and-Glory-reference\work\vehicles`.
- The page images are `renders/p-NNN.png`: 200 dpi, with a three-digit page number. The PDF page number equals the printed page number. Read an image with the Read tool at its Windows path, for example `\\wsl.localhost\Ubuntu-24.04\root\projects\.QK-Wrath-and-Glory-reference\work\vehicles\renders\p-064.png`.
- When digits or small text are hard to read, make a 300 dpi crop and read the crop. The numbers after `-x -y -W -H` are pixels at 300 dpi. A full page at 300 dpi is 2539 × 3189 pixels. A point at (x, y) in a 200 dpi image is at (1.5x, 1.5y) at 300 dpi. This example crops the lower quarter of p. 64:

  ```bash
  wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && pdftoppm -r 300 -f 64 -l 64 -x 0 -y 2390 -W 2539 -H 799 -singlefile -png "/root/projects/.QK-Wrath-and-Glory-reference/books/official-sourcebooks/Church of Steel.pdf" renders/crops/p064-low'
  ```

  Then read `renders\crops\p064-low.png`.
- Use `pdfgrep -n` only to find the page of a word, and `pdfgrep -c` only to count a spelling. Never use `pdftotext`. Never copy text out of `pdfgrep` output, because it merges the two text columns. Take the text from the images.
- The book and the images are copyrighted. Keep every render and every crop inside `renders/`. Copy them to no other folder.
- Do not read a whole data file of the repo. Use `grep -n` or a `node` one-liner to look up one record.
- Write the fragment with the Write tool at `\\wsl.localhost\Ubuntu-24.04\root\projects\.QK-Wrath-and-Glory-reference\work\vehicles\fragments\group-3.json`.

- [ ] **Step 2: Read the fragment schema**

The fragment is a JSON array with one object per stat block. Write the objects in book order: page by page, and on one page the left column from top to bottom, then the right column. Every object has exactly these 21 keys, in this order:

| Key | Value |
|---|---|
| `id` | The id from the table in Step 4. It is the snake_case of the name: lower case, apostrophes dropped, each run of other characters that are not letters or digits replaced by one `_`. A variant whose printed title is one word starts with its family parent's id: `Crusader` gives `land_raider_crusader`, `Firestorm` gives `falcon_firestorm`. A title of two or more words stands alone: `Attack Bike` gives `attack_bike`. A hyphen separates words, so `Burna-Bommer` gives `burna_bommer`. The Archaeopters follow their stored name: `archaeopter_fusilave`. |
| `name` | The printed heading in title case. The book prints headings in capitals. Use the spelling in the table in Step 4. |
| `faction` | One of these 11 strings: `Imperial`, `Adepta Sororitas`, `Adeptus Astartes`, `Adeptus Mechanicus`, `Aeronautica Imperialis`, `Astra Militarum`, `Aeldari`, `Chaos Space Marines`, `Drukhari`, `Necron`, `Ork`. Take it from the section heading that the block sits under. |
| `variantOf` | The family parent's `id` for a block that has no Value/Rarity line of its own; else `null`. Step 4 names the variants. |
| `description` | The text under the heading, before the Value line. For a variant: its own paragraph under its heading, or `null` when it has none. |
| `options` | The text after the Value line (the loadout paragraph), or `null` when there is none. Every variant has `null`. Text after a family's Value line belongs to the family's `options`, even when it names a variant. |
| `value` | The number on the Value line, as an integer. A variant copies its family's Value, unless Step 4 names an override. |
| `rarity` | The word on the Rarity line: `Common`, `Uncommon`, `Rare`, `Very Rare` or `Unique`. A variant copies its family's Rarity, unless Step 4 names an override. |
| `speed` | The `Spd` column, as an integer. |
| `manoeuvre` | The `Man` column, as an integer. |
| `resilience` | The `Res` column, as an integer. |
| `wounds` | The `W` column, as an integer. |
| `size` | The `Size` column as the full word: `Med` gives `Medium`, `Large` gives `Large`, `Huge` gives `Huge`, `Gtn` gives `Gargantuan`. |
| `keywords` | The Keywords line split at the commas, in printed order, in capitals. Keep `TRANSPORTER` where the book prints it; do not change it to `TRANSPORT`. Keep `[LEGION]` and `[MARK OF CHAOS]` with their brackets. A keyword that wraps onto the next line is one item. |
| `crew` | The Crew Complement text exactly as printed, for example `1 Pilot, 2 Crew, 12 Passengers`. |
| `traits` | The Traits line split at the commas, each item as printed with its value, for example `Turbo Boost (2)`. An empty box gives `[]`. |
| `weapons` | One object per printed weapon line: `{ "text": "<the line as printed>", "count": <n> }`. `count` is the number that starts the line (`2 Heavy Bolters` gives 2); with no number, it is 1. Add `"twin": true` after `count` when the word `Twin` starts the line or follows that number (`Twin Lascannon`, `2 Twin Big Shootas`). Otherwise leave `twin` out. A name that wraps onto a second printed line is one item. An empty box (`–` or `N/A`) gives `[]`. |
| `wargear` | One object per printed wargear line: `{ "text": "<the line as printed>" }`. An empty box gives `[]`. |
| `sidebar` | `{ "title": "<box title in title case>", "text": "<box text>" }` for a rule box inside the entry; else `null`. |
| `source` | Always `"church"`. |
| `page` | The printed page that holds the block's `Spd` row, as an integer. |

Do not add `weaponId`, `profileIds` or `equipmentId`. The build step adds them.

If a `Spd`, `Man`, `Res` or `W` cell is not a plain integer, stop work on that block. Leave the block out of the fragment, and report it as a STOP line in Step 6. Do not store the printed text in place of the number; the main session decides (Task 1.11).

- [ ] **Step 3: Read the text rules**

1. Copy the book's words exactly. Keep its spelling, capitals, punctuation and typos. Do not summarise, correct or add words.
2. Never write `[AI-Generated]`. Where the book prints no text, write `null`, or `[]` for a list.
3. Write straight apostrophes and quotation marks: `'` and `"`. Change each curly one to a straight one. Inside a JSON string, write `"` as `\"`.
4. Keep each dash as printed: em dash `—`, en dash `–`, hyphen `-`.
5. Inside a paragraph, a line break becomes one space. Write no double spaces. Start and end each string with a character that is not a space.
6. A word with a hyphen at the end of a line: keep the hyphen when the word is a hyphenated compound (`Hunter-Killer`, `Multi-Laser`, `Gyro-Stabilised`). Drop the hyphen and join the parts when it only splits the word (`ar-` and `moured` give `armoured`). When you are not sure, count both spellings in the book and use the one with more hits:

   ```bash
   wsl -e bash -c 'B="/root/projects/.QK-Wrath-and-Glory-reference/books/official-sourcebooks/Church of Steel.pdf"; pdfgrep -c -i "antigrav" "$B"; pdfgrep -c -i "anti-grav" "$B"'
   ```

   To check the hyphen in a weapon or wargear name, find the name in the data: `wsl -e bash -c 'grep -n -i "\"name\": \"multi-laser" /root/projects/QK-Wrath-and-Glory/data/weapons.json'`.

   A suspended hyphen before `and`, `or`, `to` or `nor` is book text, for example `short- and long-range`. Keep it with its space.
7. The book's own cross-references, such as `(see page 54)`, stay as printed. Add no page reference of your own.
8. Between two paragraphs, write `\n\n`. Write no other line breaks. Write no HTML.

- [ ] **Step 4: Transcribe the 18 blocks of group 3**

Pages: 84 to 89 and 91, all Astra Militarum. These are the expected entries, in spec Appendix A order:

| Page | `id` | `name` | `faction` | `variantOf` |
|---|---|---|---|---|
| 84 | `chimera` | Chimera | Astra Militarum | `null` |
| 85 | `hellhound` | Hellhound | Astra Militarum | `null` |
| 85 | `devil_dog` | Devil Dog | Astra Militarum | `null` |
| 85 | `bane_wolf` | Bane Wolf | Astra Militarum | `null` |
| 86 | `basilisk` | Basilisk | Astra Militarum | `null` |
| 86 | `deathstrike` | Deathstrike | Astra Militarum | `null` |
| 86 | `hydra` | Hydra | Astra Militarum | `null` |
| 87 | `manticore` | Manticore | Astra Militarum | `null` |
| 87 | `wyvern` | Wyvern | Astra Militarum | `null` |
| 87 | `leman_russ` | Leman Russ | Astra Militarum | `null` |
| 88 | `leman_russ_demolisher` | Demolisher | Astra Militarum | `leman_russ` |
| 88 | `leman_russ_punisher` | Punisher | Astra Militarum | `leman_russ` |
| 88 | `leman_russ_eradicator` | Eradicator | Astra Militarum | `leman_russ` |
| 88 | `leman_russ_vanquisher` | Vanquisher | Astra Militarum | `leman_russ` |
| 89 | `scout_sentinel` | Scout Sentinel | Astra Militarum | `null` |
| 89 | `armoured_sentinel` | Armoured Sentinel | Astra Militarum | `null` |
| 91 | `taurox` | Taurox | Astra Militarum | `null` |
| 91 | `taurox_prime` | Taurox Prime | Astra Militarum | `null` |

Group notes:

- p. 84 holds two blocks. Transcribe only the Chimera; group 1 transcribes the Valkyrie. p. 90 holds no block.
- The four blocks on p. 88 are variants of the Leman Russ (p. 87): `Demolisher`, `Punisher`, `Eradicator` and `Vanquisher` have `variantOf: "leman_russ"`. A variant prints no Value/Rarity line of its own. It copies the family's `value` and `rarity`, has `options: null`, and keeps its own paragraph in `description` (or `null`).
- Override: the Leman Russ family text makes the Vanquisher Rare. Store `rarity: "Rare"` on the Vanquisher. Its `value` copies the family.
- Spec §2.1 shows a Chimera entry as an example of the format. Transcribe the Chimera from the page, not from that example.

- [ ] **Step 5: Run the checker and fix the fragment**

Run: `wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && node build/check-fragment.js fragments/group-3.json'`

Expected (the order inside a line follows your reading order):

```
Entries: 18
Entries per page: p84:1 p85:3 p86:3 p87:3 p88:4 p89:2 p91:2
Blocks without their own Value line: leman_russ_demolisher (variantOf leman_russ), leman_russ_punisher (variantOf leman_russ), leman_russ_eradicator (variantOf leman_russ), leman_russ_vanquisher (variantOf leman_russ)
PROBLEMS: none
```

Fix each problem and run the checker again. A problem that the page itself causes can stay; explain it in the report.

- [ ] **Step 6: Report**

End with this report as your final message:

```
GROUP 3 REPORT
Entries per page: <the checker line>
Total: <n>
Blocks without their own Value line: <the checker line>
Confirmed on the pages that these blocks print no Value line: yes | no (<details>)
Override: leman_russ_vanquisher rarity Rare, confirmed in the family text: yes | no (<details>)
PROBLEMS:
- <one line per item, with its page>
```

Under PROBLEMS, list:

- each checker problem that stays, and the reason;
- each heading whose words differ from Step 4 (not only in case);
- each faction heading whose words differ from the 11 strings;
- each stat cell that is not a plain integer, as `STOP: <id> | <column> | <printed text> | p. <n>` (the block stays out of the fragment);
- each weapon quantity written as a word;
- each trait that is not one of the 12 vehicle traits;
- each place that you could not read, even in a 300 dpi crop.

Write `PROBLEMS: none` when there is nothing to list.

- [ ] **Step 7: Commit the fragment to the work repo**

```bash
wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && /usr/bin/git add fragments/group-3.json && /usr/bin/git commit -q --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Add the group 3 vehicle fragment" && /usr/bin/git log --oneline -1' 2>&1 | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
```

If git reports `index.lock`, another task is committing at the same time. Run the same command again.

### Task 1.6: Transcribe group 4 (Aeldari, Drukhari, Necron)

**Agent:** `general-purpose`, `model: opus`. Reason: transcription is data work that needs judgment against the page (user CLAUDE.md §4).
**Runs in parallel with:** Tasks 1.3 to 1.5 and 1.7 to 1.10.

**Files (outside the repo):**
- Create: `/root/projects/.QK-Wrath-and-Glory-reference/work/vehicles/fragments/group-4.json`
- Read: `renders/p-092.png` to `p-096.png`, `p-099.png` to `p-103.png`

**Interfaces:**
- Consumes: the renders and `build/check-fragment.js` (Task 1.2).
- Produces: `fragments/group-4.json`, a JSON array of 20 objects in the schema of Step 2. The build (Task 1.10) reads it.

The executor sends this whole task to the agent as its brief.

- [ ] **Step 1: Read the tools and the source**

You transcribe stat blocks from the *Church of Steel* sourcebook into one JSON file: `fragments/group-4.json` in the work folder. You change no file in the repo `/root/projects/QK-Wrath-and-Glory`.

- Use the Bash tool (Git Bash). Run each shell command in WSL: `wsl -e bash -c '<command>'`. Put a command with nested quotes in a script file inside the work folder's `build/` folder, and run that file.
- The work folder is `/root/projects/.QK-Wrath-and-Glory-reference/work/vehicles` in WSL. Its Windows path is `\\wsl.localhost\Ubuntu-24.04\root\projects\.QK-Wrath-and-Glory-reference\work\vehicles`.
- The page images are `renders/p-NNN.png`: 200 dpi, with a three-digit page number. The PDF page number equals the printed page number. Read an image with the Read tool at its Windows path, for example `\\wsl.localhost\Ubuntu-24.04\root\projects\.QK-Wrath-and-Glory-reference\work\vehicles\renders\p-064.png`.
- When digits or small text are hard to read, make a 300 dpi crop and read the crop. The numbers after `-x -y -W -H` are pixels at 300 dpi. A full page at 300 dpi is 2539 × 3189 pixels. A point at (x, y) in a 200 dpi image is at (1.5x, 1.5y) at 300 dpi. This example crops the lower quarter of p. 64:

  ```bash
  wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && pdftoppm -r 300 -f 64 -l 64 -x 0 -y 2390 -W 2539 -H 799 -singlefile -png "/root/projects/.QK-Wrath-and-Glory-reference/books/official-sourcebooks/Church of Steel.pdf" renders/crops/p064-low'
  ```

  Then read `renders\crops\p064-low.png`.
- Use `pdfgrep -n` only to find the page of a word, and `pdfgrep -c` only to count a spelling. Never use `pdftotext`. Never copy text out of `pdfgrep` output, because it merges the two text columns. Take the text from the images.
- The book and the images are copyrighted. Keep every render and every crop inside `renders/`. Copy them to no other folder.
- Do not read a whole data file of the repo. Use `grep -n` or a `node` one-liner to look up one record.
- Write the fragment with the Write tool at `\\wsl.localhost\Ubuntu-24.04\root\projects\.QK-Wrath-and-Glory-reference\work\vehicles\fragments\group-4.json`.

- [ ] **Step 2: Read the fragment schema**

The fragment is a JSON array with one object per stat block. Write the objects in book order: page by page, and on one page the left column from top to bottom, then the right column. Every object has exactly these 21 keys, in this order:

| Key | Value |
|---|---|
| `id` | The id from the table in Step 4. It is the snake_case of the name: lower case, apostrophes dropped, each run of other characters that are not letters or digits replaced by one `_`. A variant whose printed title is one word starts with its family parent's id: `Crusader` gives `land_raider_crusader`, `Firestorm` gives `falcon_firestorm`. A title of two or more words stands alone: `Attack Bike` gives `attack_bike`. A hyphen separates words, so `Burna-Bommer` gives `burna_bommer`. The Archaeopters follow their stored name: `archaeopter_fusilave`. |
| `name` | The printed heading in title case. The book prints headings in capitals. Use the spelling in the table in Step 4. |
| `faction` | One of these 11 strings: `Imperial`, `Adepta Sororitas`, `Adeptus Astartes`, `Adeptus Mechanicus`, `Aeronautica Imperialis`, `Astra Militarum`, `Aeldari`, `Chaos Space Marines`, `Drukhari`, `Necron`, `Ork`. Take it from the section heading that the block sits under. |
| `variantOf` | The family parent's `id` for a block that has no Value/Rarity line of its own; else `null`. Step 4 names the variants. |
| `description` | The text under the heading, before the Value line. For a variant: its own paragraph under its heading, or `null` when it has none. |
| `options` | The text after the Value line (the loadout paragraph), or `null` when there is none. Every variant has `null`. Text after a family's Value line belongs to the family's `options`, even when it names a variant. |
| `value` | The number on the Value line, as an integer. A variant copies its family's Value, unless Step 4 names an override. |
| `rarity` | The word on the Rarity line: `Common`, `Uncommon`, `Rare`, `Very Rare` or `Unique`. A variant copies its family's Rarity, unless Step 4 names an override. |
| `speed` | The `Spd` column, as an integer. |
| `manoeuvre` | The `Man` column, as an integer. |
| `resilience` | The `Res` column, as an integer. |
| `wounds` | The `W` column, as an integer. |
| `size` | The `Size` column as the full word: `Med` gives `Medium`, `Large` gives `Large`, `Huge` gives `Huge`, `Gtn` gives `Gargantuan`. |
| `keywords` | The Keywords line split at the commas, in printed order, in capitals. Keep `TRANSPORTER` where the book prints it; do not change it to `TRANSPORT`. Keep `[LEGION]` and `[MARK OF CHAOS]` with their brackets. A keyword that wraps onto the next line is one item. |
| `crew` | The Crew Complement text exactly as printed, for example `1 Pilot, 2 Crew, 12 Passengers`. |
| `traits` | The Traits line split at the commas, each item as printed with its value, for example `Turbo Boost (2)`. An empty box gives `[]`. |
| `weapons` | One object per printed weapon line: `{ "text": "<the line as printed>", "count": <n> }`. `count` is the number that starts the line (`2 Heavy Bolters` gives 2); with no number, it is 1. Add `"twin": true` after `count` when the word `Twin` starts the line or follows that number (`Twin Lascannon`, `2 Twin Big Shootas`). Otherwise leave `twin` out. A name that wraps onto a second printed line is one item. An empty box (`–` or `N/A`) gives `[]`. |
| `wargear` | One object per printed wargear line: `{ "text": "<the line as printed>" }`. An empty box gives `[]`. |
| `sidebar` | `{ "title": "<box title in title case>", "text": "<box text>" }` for a rule box inside the entry; else `null`. |
| `source` | Always `"church"`. |
| `page` | The printed page that holds the block's `Spd` row, as an integer. |

Do not add `weaponId`, `profileIds` or `equipmentId`. The build step adds them.

If a `Spd`, `Man`, `Res` or `W` cell is not a plain integer, stop work on that block. Leave the block out of the fragment, and report it as a STOP line in Step 6. Do not store the printed text in place of the number; the main session decides (Task 1.11).

- [ ] **Step 3: Read the text rules**

1. Copy the book's words exactly. Keep its spelling, capitals, punctuation and typos. Do not summarise, correct or add words.
2. Never write `[AI-Generated]`. Where the book prints no text, write `null`, or `[]` for a list.
3. Write straight apostrophes and quotation marks: `'` and `"`. Change each curly one to a straight one. Inside a JSON string, write `"` as `\"`.
4. Keep each dash as printed: em dash `—`, en dash `–`, hyphen `-`.
5. Inside a paragraph, a line break becomes one space. Write no double spaces. Start and end each string with a character that is not a space.
6. A word with a hyphen at the end of a line: keep the hyphen when the word is a hyphenated compound (`Hunter-Killer`, `Multi-Laser`, `Gyro-Stabilised`). Drop the hyphen and join the parts when it only splits the word (`ar-` and `moured` give `armoured`). When you are not sure, count both spellings in the book and use the one with more hits:

   ```bash
   wsl -e bash -c 'B="/root/projects/.QK-Wrath-and-Glory-reference/books/official-sourcebooks/Church of Steel.pdf"; pdfgrep -c -i "antigrav" "$B"; pdfgrep -c -i "anti-grav" "$B"'
   ```

   To check the hyphen in a weapon or wargear name, find the name in the data: `wsl -e bash -c 'grep -n -i "\"name\": \"multi-laser" /root/projects/QK-Wrath-and-Glory/data/weapons.json'`.

   A suspended hyphen before `and`, `or`, `to` or `nor` is book text, for example `short- and long-range`. Keep it with its space.
7. The book's own cross-references, such as `(see page 54)`, stay as printed. Add no page reference of your own.
8. Between two paragraphs, write `\n\n`. Write no other line breaks. Write no HTML.

- [ ] **Step 4: Transcribe the 20 blocks of group 4**

Pages: 92 to 96 (Aeldari), 99 and 100 (Drukhari), 101 to 103 (Necron). Pages 97 and 98 belong to group 5. These are the expected entries, in spec Appendix A order:

| Page | `id` | `name` | `faction` | `variantOf` |
|---|---|---|---|---|
| 92 | `aeldari_jetbike` | Aeldari Jetbike | Aeldari | `null` |
| 93 | `falcon` | Falcon | Aeldari | `null` |
| 93 | `fire_prism` | Fire Prism | Aeldari | `falcon` |
| 93 | `falcon_firestorm` | Firestorm | Aeldari | `falcon` |
| 93 | `night_spinner` | Night Spinner | Aeldari | `falcon` |
| 94 | `wave_serpent` | Wave Serpent | Aeldari | `falcon` |
| 94 | `hemlock_wraithfighter` | Hemlock Wraithfighter | Aeldari | `null` |
| 95 | `nightshade_interceptor` | Nightshade Interceptor | Aeldari | `null` |
| 95 | `vyper` | Vyper | Aeldari | `null` |
| 96 | `war_walker` | War Walker | Aeldari | `null` |
| 99 | `raider` | Raider | Drukhari | `null` |
| 99 | `ravager` | Ravager | Drukhari | `null` |
| 100 | `reaver_jetbike` | Reaver Jetbike | Drukhari | `null` |
| 100 | `venom` | Venom | Drukhari | `null` |
| 101 | `catacomb_command_barge` | Catacomb Command Barge | Necron | `null` |
| 101 | `doom_scythe` | Doom Scythe | Necron | `null` |
| 102 | `doomsday_ark` | Doomsday Ark | Necron | `null` |
| 102 | `ghost_ark` | Ghost Ark | Necron | `null` |
| 103 | `tomb_blade` | Tomb Blade | Necron | `null` |
| 103 | `triarch_stalker` | Triarch Stalker | Necron | `null` |

Group notes:

- Four blocks are variants of the Falcon (p. 93): `Fire Prism`, `Firestorm` and `Night Spinner` (p. 93) and `Wave Serpent` (p. 94) have `variantOf: "falcon"`. A variant prints no Value/Rarity line of its own. It copies the family's `value` and `rarity`, has `options: null`, and keeps its own paragraph in `description` (or `null`).
- Text after the Falcon's Value line belongs to the Falcon's `options`, even when it names a variant or continues on the next page. Text under a variant's own heading belongs to that variant's `description`.

- [ ] **Step 5: Run the checker and fix the fragment**

Run: `wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && node build/check-fragment.js fragments/group-4.json'`

Expected (the order inside a line follows your reading order):

```
Entries: 20
Entries per page: p92:1 p93:4 p94:2 p95:2 p96:1 p99:2 p100:2 p101:2 p102:2 p103:2
Blocks without their own Value line: fire_prism (variantOf falcon), falcon_firestorm (variantOf falcon), night_spinner (variantOf falcon), wave_serpent (variantOf falcon)
PROBLEMS: none
```

Fix each problem and run the checker again. A problem that the page itself causes can stay; explain it in the report.

- [ ] **Step 6: Report**

End with this report as your final message:

```
GROUP 4 REPORT
Entries per page: <the checker line>
Total: <n>
Blocks without their own Value line: <the checker line>
Confirmed on the pages that these blocks print no Value line: yes | no (<details>)
PROBLEMS:
- <one line per item, with its page>
```

Under PROBLEMS, list:

- each checker problem that stays, and the reason;
- each heading whose words differ from Step 4 (not only in case);
- each faction heading whose words differ from the 11 strings;
- each stat cell that is not a plain integer, as `STOP: <id> | <column> | <printed text> | p. <n>` (the block stays out of the fragment);
- each weapon quantity written as a word;
- each trait that is not one of the 12 vehicle traits;
- each place that you could not read, even in a 300 dpi crop.

Write `PROBLEMS: none` when there is nothing to list.

- [ ] **Step 7: Commit the fragment to the work repo**

```bash
wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && /usr/bin/git add fragments/group-4.json && /usr/bin/git commit -q --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Add the group 4 vehicle fragment" && /usr/bin/git log --oneline -1' 2>&1 | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
```

If git reports `index.lock`, another task is committing at the same time. Run the same command again.

### Task 1.7: Transcribe group 5 (Chaos Space Marines, Ork)

**Agent:** `general-purpose`, `model: opus`. Reason: transcription is data work that needs judgment against the page (user CLAUDE.md §4).
**Runs in parallel with:** Tasks 1.3 to 1.6 and 1.8 to 1.10.

**Files (outside the repo):**
- Create: `/root/projects/.QK-Wrath-and-Glory-reference/work/vehicles/fragments/group-5.json`
- Read: `renders/p-097.png`, `p-098.png`, `p-104.png` to `p-111.png`

**Interfaces:**
- Consumes: the renders and `build/check-fragment.js` (Task 1.2).
- Produces: `fragments/group-5.json`, a JSON array of 21 objects in the schema of Step 2. The build (Task 1.10) reads it.

The executor sends this whole task to the agent as its brief.

- [ ] **Step 1: Read the tools and the source**

You transcribe stat blocks from the *Church of Steel* sourcebook into one JSON file: `fragments/group-5.json` in the work folder. You change no file in the repo `/root/projects/QK-Wrath-and-Glory`.

- Use the Bash tool (Git Bash). Run each shell command in WSL: `wsl -e bash -c '<command>'`. Put a command with nested quotes in a script file inside the work folder's `build/` folder, and run that file.
- The work folder is `/root/projects/.QK-Wrath-and-Glory-reference/work/vehicles` in WSL. Its Windows path is `\\wsl.localhost\Ubuntu-24.04\root\projects\.QK-Wrath-and-Glory-reference\work\vehicles`.
- The page images are `renders/p-NNN.png`: 200 dpi, with a three-digit page number. The PDF page number equals the printed page number. Read an image with the Read tool at its Windows path, for example `\\wsl.localhost\Ubuntu-24.04\root\projects\.QK-Wrath-and-Glory-reference\work\vehicles\renders\p-064.png`.
- When digits or small text are hard to read, make a 300 dpi crop and read the crop. The numbers after `-x -y -W -H` are pixels at 300 dpi. A full page at 300 dpi is 2539 × 3189 pixels. A point at (x, y) in a 200 dpi image is at (1.5x, 1.5y) at 300 dpi. This example crops the lower quarter of p. 64:

  ```bash
  wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && pdftoppm -r 300 -f 64 -l 64 -x 0 -y 2390 -W 2539 -H 799 -singlefile -png "/root/projects/.QK-Wrath-and-Glory-reference/books/official-sourcebooks/Church of Steel.pdf" renders/crops/p064-low'
  ```

  Then read `renders\crops\p064-low.png`.
- Use `pdfgrep -n` only to find the page of a word, and `pdfgrep -c` only to count a spelling. Never use `pdftotext`. Never copy text out of `pdfgrep` output, because it merges the two text columns. Take the text from the images.
- The book and the images are copyrighted. Keep every render and every crop inside `renders/`. Copy them to no other folder.
- Do not read a whole data file of the repo. Use `grep -n` or a `node` one-liner to look up one record.
- Write the fragment with the Write tool at `\\wsl.localhost\Ubuntu-24.04\root\projects\.QK-Wrath-and-Glory-reference\work\vehicles\fragments\group-5.json`.

- [ ] **Step 2: Read the fragment schema**

The fragment is a JSON array with one object per stat block. Write the objects in book order: page by page, and on one page the left column from top to bottom, then the right column. Every object has exactly these 21 keys, in this order:

| Key | Value |
|---|---|
| `id` | The id from the table in Step 4. It is the snake_case of the name: lower case, apostrophes dropped, each run of other characters that are not letters or digits replaced by one `_`. A variant whose printed title is one word starts with its family parent's id: `Crusader` gives `land_raider_crusader`, `Firestorm` gives `falcon_firestorm`. A title of two or more words stands alone: `Attack Bike` gives `attack_bike`. A hyphen separates words, so `Burna-Bommer` gives `burna_bommer`. The Archaeopters follow their stored name: `archaeopter_fusilave`. |
| `name` | The printed heading in title case. The book prints headings in capitals. Use the spelling in the table in Step 4. |
| `faction` | One of these 11 strings: `Imperial`, `Adepta Sororitas`, `Adeptus Astartes`, `Adeptus Mechanicus`, `Aeronautica Imperialis`, `Astra Militarum`, `Aeldari`, `Chaos Space Marines`, `Drukhari`, `Necron`, `Ork`. Take it from the section heading that the block sits under. |
| `variantOf` | The family parent's `id` for a block that has no Value/Rarity line of its own; else `null`. Step 4 names the variants. |
| `description` | The text under the heading, before the Value line. For a variant: its own paragraph under its heading, or `null` when it has none. |
| `options` | The text after the Value line (the loadout paragraph), or `null` when there is none. Every variant has `null`. Text after a family's Value line belongs to the family's `options`, even when it names a variant. |
| `value` | The number on the Value line, as an integer. A variant copies its family's Value, unless Step 4 names an override. |
| `rarity` | The word on the Rarity line: `Common`, `Uncommon`, `Rare`, `Very Rare` or `Unique`. A variant copies its family's Rarity, unless Step 4 names an override. |
| `speed` | The `Spd` column, as an integer. |
| `manoeuvre` | The `Man` column, as an integer. |
| `resilience` | The `Res` column, as an integer. |
| `wounds` | The `W` column, as an integer. |
| `size` | The `Size` column as the full word: `Med` gives `Medium`, `Large` gives `Large`, `Huge` gives `Huge`, `Gtn` gives `Gargantuan`. |
| `keywords` | The Keywords line split at the commas, in printed order, in capitals. Keep `TRANSPORTER` where the book prints it; do not change it to `TRANSPORT`. Keep `[LEGION]` and `[MARK OF CHAOS]` with their brackets. A keyword that wraps onto the next line is one item. |
| `crew` | The Crew Complement text exactly as printed, for example `1 Pilot, 2 Crew, 12 Passengers`. |
| `traits` | The Traits line split at the commas, each item as printed with its value, for example `Turbo Boost (2)`. An empty box gives `[]`. |
| `weapons` | One object per printed weapon line: `{ "text": "<the line as printed>", "count": <n> }`. `count` is the number that starts the line (`2 Heavy Bolters` gives 2); with no number, it is 1. Add `"twin": true` after `count` when the word `Twin` starts the line or follows that number (`Twin Lascannon`, `2 Twin Big Shootas`). Otherwise leave `twin` out. A name that wraps onto a second printed line is one item. An empty box (`–` or `N/A`) gives `[]`. |
| `wargear` | One object per printed wargear line: `{ "text": "<the line as printed>" }`. An empty box gives `[]`. |
| `sidebar` | `{ "title": "<box title in title case>", "text": "<box text>" }` for a rule box inside the entry; else `null`. |
| `source` | Always `"church"`. |
| `page` | The printed page that holds the block's `Spd` row, as an integer. |

Do not add `weaponId`, `profileIds` or `equipmentId`. The build step adds them.

If a `Spd`, `Man`, `Res` or `W` cell is not a plain integer, stop work on that block. Leave the block out of the fragment, and report it as a STOP line in Step 6. Do not store the printed text in place of the number; the main session decides (Task 1.11).

- [ ] **Step 3: Read the text rules**

1. Copy the book's words exactly. Keep its spelling, capitals, punctuation and typos. Do not summarise, correct or add words.
2. Never write `[AI-Generated]`. Where the book prints no text, write `null`, or `[]` for a list.
3. Write straight apostrophes and quotation marks: `'` and `"`. Change each curly one to a straight one. Inside a JSON string, write `"` as `\"`.
4. Keep each dash as printed: em dash `—`, en dash `–`, hyphen `-`.
5. Inside a paragraph, a line break becomes one space. Write no double spaces. Start and end each string with a character that is not a space.
6. A word with a hyphen at the end of a line: keep the hyphen when the word is a hyphenated compound (`Hunter-Killer`, `Multi-Laser`, `Gyro-Stabilised`). Drop the hyphen and join the parts when it only splits the word (`ar-` and `moured` give `armoured`). When you are not sure, count both spellings in the book and use the one with more hits:

   ```bash
   wsl -e bash -c 'B="/root/projects/.QK-Wrath-and-Glory-reference/books/official-sourcebooks/Church of Steel.pdf"; pdfgrep -c -i "antigrav" "$B"; pdfgrep -c -i "anti-grav" "$B"'
   ```

   To check the hyphen in a weapon or wargear name, find the name in the data: `wsl -e bash -c 'grep -n -i "\"name\": \"multi-laser" /root/projects/QK-Wrath-and-Glory/data/weapons.json'`.

   A suspended hyphen before `and`, `or`, `to` or `nor` is book text, for example `short- and long-range`. Keep it with its space.
7. The book's own cross-references, such as `(see page 54)`, stay as printed. Add no page reference of your own.
8. Between two paragraphs, write `\n\n`. Write no other line breaks. Write no HTML.

- [ ] **Step 4: Transcribe the 21 blocks of group 5**

Pages: 97 and 98 (Chaos Space Marines), 104 to 111 (Ork). Pages 99 to 103 belong to group 4. These are the expected entries, in spec Appendix A order:

| Page | `id` | `name` | `faction` | `variantOf` |
|---|---|---|---|---|
| 97 | `chaos_rhino` | Chaos Rhino | Chaos Space Marines | `null` |
| 98 | `chaos_predator` | Chaos Predator | Chaos Space Marines | `null` |
| 98 | `chaos_vindicator` | Chaos Vindicator | Chaos Space Marines | `null` |
| 98 | `chaos_land_raider` | Chaos Land Raider | Chaos Space Marines | `null` |
| 104 | `warbike` | Warbike | Ork | `null` |
| 104 | `boomdakka_snazzwagon` | Boomdakka Snazzwagon | Ork | `null` |
| 105 | `deffkilla_wartrike` | Deffkilla Wartrike | Ork | `null` |
| 105 | `kustom_boosta_blasta` | Kustom Boosta Blasta | Ork | `null` |
| 106 | `megatrakk_scrapjet` | Megatrakk Scrapjet | Ork | `null` |
| 106 | `shokkjump_dragsta` | Shokkjump Dragsta | Ork | `null` |
| 107 | `trukk` | Trukk | Ork | `null` |
| 107 | `rukkatrukk_squigbuggy` | Rukkatrukk Squigbuggy | Ork | `null` |
| 108 | `wazbom_blastajet` | Wazbom Blastajet | Ork | `null` |
| 108 | `battlewagon` | Battlewagon | Ork | `null` |
| 109 | `bonebreaka` | Bonebreaka | Ork | `null` |
| 109 | `gunwagon` | Gunwagon | Ork | `null` |
| 109 | `kill_rig` | Kill Rig | Ork | `null` |
| 110 | `deffkopta` | Deffkopta | Ork | `null` |
| 111 | `dakkajet` | Dakkajet | Ork | `null` |
| 111 | `blitza_bommer` | Blitza-Bommer | Ork | `null` |
| 111 | `burna_bommer` | Burna-Bommer | Ork | `blitza_bommer` |

Group notes:

- Each Chaos block prints the keyword placeholders `[LEGION]` and `[MARK OF CHAOS]`. Keep both as items, with their brackets. `[MARK OF CHAOS]` can wrap over two lines; it is still one item.
- The Shokk Tunnel rule box on p. 106 belongs to the Shokkjump Dragsta: `"sidebar": { "title": "Shokk Tunnel", "text": "<the box text>" }`. Every other block has `sidebar: null`, unless its page shows another rule box inside the entry. Report any such box.
- One block is a variant: `Burna-Bommer` (p. 111) has `variantOf: "blitza_bommer"`. It prints no Value/Rarity line of its own. It copies the family's `value` and `rarity`, has `options: null`, and keeps its own paragraph in `description` (or `null`).
- Ork names often hold apostrophes and hyphens (`'Eavy`, `Grabbin'`, `Blitza-Bommer`). Write straight apostrophes.

- [ ] **Step 5: Run the checker and fix the fragment**

Run: `wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && node build/check-fragment.js fragments/group-5.json'`

Expected (the order inside a line follows your reading order):

```
Entries: 21
Entries per page: p97:1 p98:3 p104:2 p105:2 p106:2 p107:2 p108:2 p109:3 p110:1 p111:3
Blocks without their own Value line: burna_bommer (variantOf blitza_bommer)
PROBLEMS: none
```

Fix each problem and run the checker again. A problem that the page itself causes can stay; explain it in the report.

- [ ] **Step 6: Report**

End with this report as your final message:

```
GROUP 5 REPORT
Entries per page: <the checker line>
Total: <n>
Blocks without their own Value line: <the checker line>
Confirmed on the pages that these blocks print no Value line: yes | no (<details>)
Rule boxes found: <id and title for each>
PROBLEMS:
- <one line per item, with its page>
```

Under PROBLEMS, list:

- each checker problem that stays, and the reason;
- each heading whose words differ from Step 4 (not only in case);
- each faction heading whose words differ from the 11 strings;
- each stat cell that is not a plain integer, as `STOP: <id> | <column> | <printed text> | p. <n>` (the block stays out of the fragment);
- each weapon quantity written as a word;
- each trait that is not one of the 12 vehicle traits;
- each place that you could not read, even in a 300 dpi crop.

Write `PROBLEMS: none` when there is nothing to list.

- [ ] **Step 7: Commit the fragment to the work repo**

```bash
wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && /usr/bin/git add fragments/group-5.json && /usr/bin/git commit -q --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Add the group 5 vehicle fragment" && /usr/bin/git log --oneline -1' 2>&1 | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
```

If git reports `index.lock`, another task is committing at the same time. Run the same command again.

### Task 1.8: Transcribe the 12 vehicle traits

**Agent:** `general-purpose`, `model: opus`. Reason: transcription is data work that needs judgment against the page (user CLAUDE.md §4).
**Runs in parallel with:** Tasks 1.3 to 1.7, 1.9 and 1.10.

**Files (outside the repo):**
- Create: `/root/projects/.QK-Wrath-and-Glory-reference/work/vehicles/fragments/vehicle-traits.json`
- Read: `renders/p-062.png`, `p-063.png`

**Interfaces:**
- Consumes: the renders and `build/check-fragment.js` (Task 1.2).
- Produces: `fragments/vehicle-traits.json`, an object of 12 entries `{ name, source, page, description }`, keyed by the keys of Step 4. The build (Task 1.10) writes it as `glossary.vehicleTraits`.

The executor sends this whole task to the agent as its brief.

- [ ] **Step 1: Read the tools and the source**

You transcribe rules text from the *Church of Steel* sourcebook into one JSON file: `fragments/vehicle-traits.json` in the work folder. You change no file in the repo `/root/projects/QK-Wrath-and-Glory`.

- Use the Bash tool (Git Bash). Run each shell command in WSL: `wsl -e bash -c '<command>'`. Put a command with nested quotes in a script file inside the work folder's `build/` folder, and run that file.
- The work folder is `/root/projects/.QK-Wrath-and-Glory-reference/work/vehicles` in WSL. Its Windows path is `\\wsl.localhost\Ubuntu-24.04\root\projects\.QK-Wrath-and-Glory-reference\work\vehicles`.
- The page images are `renders/p-NNN.png`: 200 dpi, with a three-digit page number. The PDF page number equals the printed page number. Read an image with the Read tool at its Windows path, for example `\\wsl.localhost\Ubuntu-24.04\root\projects\.QK-Wrath-and-Glory-reference\work\vehicles\renders\p-064.png`.
- When digits or small text are hard to read, make a 300 dpi crop and read the crop. The numbers after `-x -y -W -H` are pixels at 300 dpi. A full page at 300 dpi is 2539 × 3189 pixels. A point at (x, y) in a 200 dpi image is at (1.5x, 1.5y) at 300 dpi. This example crops the lower quarter of p. 64:

  ```bash
  wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && pdftoppm -r 300 -f 64 -l 64 -x 0 -y 2390 -W 2539 -H 799 -singlefile -png "/root/projects/.QK-Wrath-and-Glory-reference/books/official-sourcebooks/Church of Steel.pdf" renders/crops/p064-low'
  ```

  Then read `renders\crops\p064-low.png`.
- Use `pdfgrep -n` only to find the page of a word, and `pdfgrep -c` only to count a spelling. Never use `pdftotext`. Never copy text out of `pdfgrep` output, because it merges the two text columns. Take the text from the images.
- The book and the images are copyrighted. Keep every render and every crop inside `renders/`. Copy them to no other folder.
- Do not read a whole data file of the repo. Use `grep -n` or a `node` one-liner to look up one record.
- Write the fragment with the Write tool at `\\wsl.localhost\Ubuntu-24.04\root\projects\.QK-Wrath-and-Glory-reference\work\vehicles\fragments\vehicle-traits.json`.

- [ ] **Step 2: Read the fragment format**

The fragment is one JSON object. Its keys are the entry keys of Step 4, in book order. Each value has exactly these four keys, in this order:

```json
{
  "<key>": {
    "name": "<the heading from Step 4>",
    "source": "church",
    "page": 62,
    "description": "<the book's text as glossary HTML>"
  }
}
```

- `name`: the heading in title case, exactly as Step 4 gives it.
- `source`: always `"church"`.
- `page`: the printed page where the heading is printed, as an integer.
- `description`: the book's text under the heading, up to the next heading of the same or a higher level, or the end of its section. Write it as glossary HTML:
  - Between two paragraphs, write `<br><br>`. Write no `\n` anywhere.
  - A lower-level sub-heading inside the entry becomes `<strong>Sub-heading</strong><br>` followed by its text. Put `<br><br>` before it unless it starts the description.
  - Bold or italic run-in words stay bold or italic: `<strong>…</strong>`, `<em>…</em>`.
  - A bulleted list: one item per line, each line starting with `• `, the lines joined by `<br>`.
  - Write `&` as `&amp;`, `<` as `&lt;` and `>` as `&gt;`.
  - A table goes where the book prints it, after `<br><br>`, in this form, with single quotes on the two attributes:

    ```html
    <div class='glossary-table-scroll'><table class='glossary-table'><caption>Table Title</caption><tr><th>Column</th><th>Column</th></tr><tr><td>Cell</td><td>Cell</td></tr></table></div>
    ```

    Write one `<tr>` per printed row and every printed cell, in printed order. Use no `<thead>` or `<tbody>`. The caption is the table's printed title, without a page number. When the book prints no title, use the entry's `name`. Inside a cell, a labelled second line keeps a `<br>`; any other line break becomes a space.
  - Use no other tags. The allowed tags are `br`, `strong`, `em`, `div class='glossary-table-scroll'`, `table class='glossary-table'`, `caption`, `tr`, `th` and `td`.
- An existing entry with this markup is `combatTerms.critical_hit` in the repo's `data/glossary.json`. Print its start with this command:

  ```bash
  wsl -e bash -c 'cd /root/projects/QK-Wrath-and-Glory && node -e "console.log(require(\"./data/glossary.json\").combatTerms.critical_hit.description.slice(0, 900))"'
  ```

- [ ] **Step 3: Read the text rules**

1. Copy the book's words exactly. Keep its spelling, capitals, punctuation and typos. Do not summarise, correct or add words.
2. Never write `[AI-Generated]`. Where the book prints no text, write `null`, or `[]` for a list.
3. Write straight apostrophes and quotation marks: `'` and `"`. Change each curly one to a straight one. Inside a JSON string, write `"` as `\"`.
4. Keep each dash as printed: em dash `—`, en dash `–`, hyphen `-`.
5. Inside a paragraph, a line break becomes one space. Write no double spaces. Start and end each string with a character that is not a space.
6. A word with a hyphen at the end of a line: keep the hyphen when the word is a hyphenated compound (`Hunter-Killer`, `Multi-Laser`, `Gyro-Stabilised`). Drop the hyphen and join the parts when it only splits the word (`ar-` and `moured` give `armoured`). When you are not sure, count both spellings in the book and use the one with more hits:

   ```bash
   wsl -e bash -c 'B="/root/projects/.QK-Wrath-and-Glory-reference/books/official-sourcebooks/Church of Steel.pdf"; pdfgrep -c -i "antigrav" "$B"; pdfgrep -c -i "anti-grav" "$B"'
   ```

   To check the hyphen in a weapon or wargear name, find the name in the data: `wsl -e bash -c 'grep -n -i "\"name\": \"multi-laser" /root/projects/QK-Wrath-and-Glory/data/weapons.json'`.

   A suspended hyphen before `and`, `or`, `to` or `nor` is book text, for example `short- and long-range`. Keep it with its space.
7. The book's own cross-references, such as `(see page 54)`, stay as printed. Add no page reference of your own.
8. These rules apply inside the HTML too. Escape `&`, `<` and `>` as Step 2 says.

- [ ] **Step 4: Transcribe the 12 traits on pp. 62 and 63**

| Key | Name |
|---|---|
| `all_terrain` | All-Terrain |
| `amphibious` | Amphibious |
| `bike` | Bike |
| `flyer` | Flyer |
| `gun_ports` | Gun Ports |
| `gyro_stabilised` | Gyro-Stabilised |
| `hover` | Hover |
| `open_topped` | Open Topped |
| `reliable` | Reliable |
| `sealed` | Sealed |
| `turbo_boost` | Turbo Boost (X) |
| `walker` | Walker |

- `page` is 62 or 63: the page where the trait's heading is printed.
- `description` is the trait's definition text only.
- Text before the first trait (an introduction to traits, if the book prints one) is not a trait. Leave it out and name it in the report.
- The Vehicle Characteristics text on p. 62 belongs to Task 1.9. Leave it out.

- [ ] **Step 5: Run the checker and fix the fragment**

Run: `wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && node build/check-fragment.js fragments/vehicle-traits.json'`

Expected (the key order follows the book):

```
Entries: 12
Keys in order: all_terrain, amphibious, bike, flyer, gun_ports, gyro_stabilised, hover, open_topped, reliable, sealed, turbo_boost, walker
PROBLEMS: none
```

Fix each problem and run the checker again.

- [ ] **Step 6: Report**

End with this report as your final message:

```
TRAITS REPORT
Entries: <n>
Keys in order: <the checker line>
Text left out: <the introduction or other text that is not a trait, with its page; or none>
PROBLEMS:
- <one line per item, with its page>
```

Under PROBLEMS, list each heading whose words differ from Step 4, each checker problem that stays, and each place that you could not read. Write `PROBLEMS: none` when there is nothing to list.

- [ ] **Step 7: Commit the fragment to the work repo**

```bash
wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && /usr/bin/git add fragments/vehicle-traits.json && /usr/bin/git commit -q --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Add the vehicle traits fragment" && /usr/bin/git log --oneline -1' 2>&1 | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
```

If git reports `index.lock`, another task is committing at the same time. Run the same command again.

### Task 1.9: Transcribe the vehicle rules

**Agent:** `general-purpose`, `model: opus`. Reason: transcription is data work that needs judgment against the page (user CLAUDE.md §4).
**Runs in parallel with:** Tasks 1.3 to 1.8 and 1.10.

**Files (outside the repo):**
- Create: `/root/projects/.QK-Wrath-and-Glory-reference/work/vehicles/fragments/vehicle-rules.json`
- Read: `renders/p-029.png` to `p-031.png`, `p-044.png` to `p-055.png`, `p-060.png`, `p-062.png`

**Interfaces:**
- Consumes: the renders and `build/check-fragment.js` (Task 1.2).
- Produces: `fragments/vehicle-rules.json`, an object of 35 to 37 entries `{ name, source, page, description }`, keyed by the keys of Step 4. The build (Task 1.10) writes it as `glossary.vehicleRules`.

The executor sends this whole task to the agent as its brief.

- [ ] **Step 1: Read the tools and the source**

You transcribe rules text from the *Church of Steel* sourcebook into one JSON file: `fragments/vehicle-rules.json` in the work folder. You change no file in the repo `/root/projects/QK-Wrath-and-Glory`.

- Use the Bash tool (Git Bash). Run each shell command in WSL: `wsl -e bash -c '<command>'`. Put a command with nested quotes in a script file inside the work folder's `build/` folder, and run that file.
- The work folder is `/root/projects/.QK-Wrath-and-Glory-reference/work/vehicles` in WSL. Its Windows path is `\\wsl.localhost\Ubuntu-24.04\root\projects\.QK-Wrath-and-Glory-reference\work\vehicles`.
- The page images are `renders/p-NNN.png`: 200 dpi, with a three-digit page number. The PDF page number equals the printed page number. Read an image with the Read tool at its Windows path, for example `\\wsl.localhost\Ubuntu-24.04\root\projects\.QK-Wrath-and-Glory-reference\work\vehicles\renders\p-064.png`.
- When digits or small text are hard to read, make a 300 dpi crop and read the crop. The numbers after `-x -y -W -H` are pixels at 300 dpi. A full page at 300 dpi is 2539 × 3189 pixels. A point at (x, y) in a 200 dpi image is at (1.5x, 1.5y) at 300 dpi. This example crops the lower quarter of p. 64:

  ```bash
  wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && pdftoppm -r 300 -f 64 -l 64 -x 0 -y 2390 -W 2539 -H 799 -singlefile -png "/root/projects/.QK-Wrath-and-Glory-reference/books/official-sourcebooks/Church of Steel.pdf" renders/crops/p064-low'
  ```

  Then read `renders\crops\p064-low.png`.
- Use `pdfgrep -n` only to find the page of a word, and `pdfgrep -c` only to count a spelling. Never use `pdftotext`. Never copy text out of `pdfgrep` output, because it merges the two text columns. Take the text from the images.
- The book and the images are copyrighted. Keep every render and every crop inside `renders/`. Copy them to no other folder.
- Do not read a whole data file of the repo. Use `grep -n` or a `node` one-liner to look up one record.
- Write the fragment with the Write tool at `\\wsl.localhost\Ubuntu-24.04\root\projects\.QK-Wrath-and-Glory-reference\work\vehicles\fragments\vehicle-rules.json`.

- [ ] **Step 2: Read the fragment format**

The fragment is one JSON object. Its keys are the entry keys of Step 4, in book order. Each value has exactly these four keys, in this order:

```json
{
  "<key>": {
    "name": "<the heading from Step 4>",
    "source": "church",
    "page": 62,
    "description": "<the book's text as glossary HTML>"
  }
}
```

- `name`: the heading in title case, exactly as Step 4 gives it.
- `source`: always `"church"`.
- `page`: the printed page where the heading is printed, as an integer.
- `description`: the book's text under the heading, up to the next heading of the same or a higher level, or the end of its section. Write it as glossary HTML:
  - Between two paragraphs, write `<br><br>`. Write no `\n` anywhere.
  - A lower-level sub-heading inside the entry becomes `<strong>Sub-heading</strong><br>` followed by its text. Put `<br><br>` before it unless it starts the description.
  - Bold or italic run-in words stay bold or italic: `<strong>…</strong>`, `<em>…</em>`.
  - A bulleted list: one item per line, each line starting with `• `, the lines joined by `<br>`.
  - Write `&` as `&amp;`, `<` as `&lt;` and `>` as `&gt;`.
  - A table goes where the book prints it, after `<br><br>`, in this form, with single quotes on the two attributes:

    ```html
    <div class='glossary-table-scroll'><table class='glossary-table'><caption>Table Title</caption><tr><th>Column</th><th>Column</th></tr><tr><td>Cell</td><td>Cell</td></tr></table></div>
    ```

    Write one `<tr>` per printed row and every printed cell, in printed order. Use no `<thead>` or `<tbody>`. The caption is the table's printed title, without a page number. When the book prints no title, use the entry's `name`. Inside a cell, a labelled second line keeps a `<br>`; any other line break becomes a space.
  - Use no other tags. The allowed tags are `br`, `strong`, `em`, `div class='glossary-table-scroll'`, `table class='glossary-table'`, `caption`, `tr`, `th` and `td`.
- An existing entry with this markup is `combatTerms.critical_hit` in the repo's `data/glossary.json`. Print its start with this command:

  ```bash
  wsl -e bash -c 'cd /root/projects/QK-Wrath-and-Glory && node -e "console.log(require(\"./data/glossary.json\").combatTerms.critical_hit.description.slice(0, 900))"'
  ```

- [ ] **Step 3: Read the text rules**

1. Copy the book's words exactly. Keep its spelling, capitals, punctuation and typos. Do not summarise, correct or add words.
2. Never write `[AI-Generated]`. Where the book prints no text, write `null`, or `[]` for a list.
3. Write straight apostrophes and quotation marks: `'` and `"`. Change each curly one to a straight one. Inside a JSON string, write `"` as `\"`.
4. Keep each dash as printed: em dash `—`, en dash `–`, hyphen `-`.
5. Inside a paragraph, a line break becomes one space. Write no double spaces. Start and end each string with a character that is not a space.
6. A word with a hyphen at the end of a line: keep the hyphen when the word is a hyphenated compound (`Hunter-Killer`, `Multi-Laser`, `Gyro-Stabilised`). Drop the hyphen and join the parts when it only splits the word (`ar-` and `moured` give `armoured`). When you are not sure, count both spellings in the book and use the one with more hits:

   ```bash
   wsl -e bash -c 'B="/root/projects/.QK-Wrath-and-Glory-reference/books/official-sourcebooks/Church of Steel.pdf"; pdfgrep -c -i "antigrav" "$B"; pdfgrep -c -i "anti-grav" "$B"'
   ```

   To check the hyphen in a weapon or wargear name, find the name in the data: `wsl -e bash -c 'grep -n -i "\"name\": \"multi-laser" /root/projects/QK-Wrath-and-Glory/data/weapons.json'`.

   A suspended hyphen before `and`, `or`, `to` or `nor` is book text, for example `short- and long-range`. Keep it with its space.
7. The book's own cross-references, such as `(see page 54)`, stay as printed. Add no page reference of your own.
8. These rules apply inside the HTML too. Escape `&`, `<` and `>` as Step 2 says.

- [ ] **Step 4: Transcribe one entry per key of this table (spec Appendix B)**

| Key | Name | Page | Note |
|---|---|---|---|
| `benevolence_of_the_omnissiah` | Benevolence of the Omnissiah | 29 | |
| `masters_of_machines` | Masters of Machines | 29 | |
| `miraculum_mobili` | Miraculum Mobili | 29 | |
| `bleeding_edge_technology` | Bleeding-Edge Technology | 30 | |
| `wraithbone` | Wraithbone | 30 | |
| `orks_build_tuff` | Orks Build Tuff | 31 | |
| `green_wunz_only` | Green Wunz Only | 31 | |
| `interacting_with_vehicles` | Interacting with Vehicles | 44 | conditional |
| `embarking` | Embarking | 44 | |
| `actions_inside` | Actions Inside | 44–45 | |
| `complications` | Complications | 44–45 | with its table |
| `vehicle_roles` | Vehicle Roles | 45–46 | with the Pilot, Crew and Passenger actions table |
| `vehicle_actions` | Vehicle Actions | 46 | conditional |
| `drive` | Drive | 46–50 | |
| `brace_for_impact` | Brace for Impact | 46–50 | |
| `breakneck_speed` | Breakneck Speed | 46–50 | |
| `emergency_repair` | Emergency Repair | 46–50 | |
| `evasive_manoeuvres` | Evasive Manoeuvres | 46–50 | |
| `line_up_the_shot` | Line Up the Shot | 46–50 | |
| `open_fire` | Open Fire | 46–50 | |
| `ram` | Ram | 46–50 | |
| `reload` | Reload | 46–50 | |
| `high_speed_tactics` | High-Speed Tactics | 50 | |
| `attacking_from_a_vehicle` | Attacking from a Vehicle | 51 | |
| `attacking_a_vehicles_occupants` | Attacking a Vehicle's Occupants | 51 | |
| `vehicle_defence` | Vehicle Defence | 52 | |
| `damaged_vehicles` | Damaged Vehicles | 52 | |
| `vehicles_and_conditions` | Vehicles and Conditions | 53 | |
| `called_shots` | Called Shots | 53–54 | with the two DN tables |
| `vehicle_damage` | Vehicle Damage | 54 | the d66 table |
| `repairing_vehicles` | Repairing Vehicles | 55 | |
| `vehicle_explosions` | Vehicle Explosions | 55 | with its table |
| `crash_and_burn` | Crash and Burn | 55 | |
| `built_to_last` | Built to Last | 55 | |
| `ammo` | Ammo | 60 | |
| `twin_weapons` | Twin Weapons | 60 | |
| `vehicle_characteristics` | Vehicle Characteristics | 62 | with the Influence Modifier table |

Rules for this table:

- An entry holds the text under its heading. It ends at the next heading that this table lists as a key, or at the next heading of the same or a higher level, whichever comes first.
- A heading of that level that this table does not list (for example another section on pp. 29 to 31) belongs to no entry. Leave out that heading and its text, and report the heading with its page.
- A lower-level sub-heading inside an entry that this table does not list stays in the entry as a `<strong>` sub-heading.
- The 35 keys without a note "conditional" are required.
- Write a conditional key only when the book prints text (or a table) under that section heading before its first sub-heading. Report your decision for each of the two.
- A table belongs to the entry under whose heading it is printed. The Example Pilot Tests table and the Vehicle Complications d6 table (pp. 46 to 50) go to the action entry that they sit under, or to `vehicle_actions` when they sit under the section heading itself.
- "Vehicle Weapons" (p. 60) gets no entry of its own. Transcribe only its "Ammo" and "Twin Weapons" parts, as `ammo` and `twin_weapons`. The rest of p. 60 is Workshop content; leave it out. The Workshop chapter (pp. 56 to 59) is out of scope.
- The trait definitions on pp. 62 and 63 belong to Task 1.8. `vehicle_characteristics` ends where the trait definitions begin.
- `page` is the page where the heading is printed. Where the table gives a range, record the exact page.
- Write the keys in book order. The build puts them into the order of this table.

- [ ] **Step 5: Run the checker and fix the fragment**

Run: `wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && node build/check-fragment.js fragments/vehicle-rules.json'`

Expected: `Entries: 35`, `36` or `37`, then the `Keys in order:` line, then `PROBLEMS: none`. Fix each problem and run the checker again.

- [ ] **Step 6: Report**

End with this report as your final message:

```
RULES REPORT
Entries: <n>
Keys in order: <the checker line>
interacting_with_vehicles: written | not written, because <what p. 44 prints under the heading>
vehicle_actions: written | not written, because <what p. 46 prints under the heading>
Tables: <each table's caption and the key that holds it>
Headings left out: <each heading with its page, or none>
PROBLEMS:
- <one line per item, with its page>
```

Under PROBLEMS, list each heading whose words differ from Step 4, each checker problem that stays, and each place that you could not read. Write `PROBLEMS: none` when there is nothing to list.

- [ ] **Step 7: Commit the fragment to the work repo**

```bash
wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && /usr/bin/git add fragments/vehicle-rules.json && /usr/bin/git commit -q --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Add the vehicle rules fragment" && /usr/bin/git log --oneline -1' 2>&1 | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
```

If git reports `index.lock`, another task is committing at the same time. Run the same command again.

### Task 1.10: Write the build script and the show helper

**Agent:** `implementer`. Reason: the plan gives the code, the self-test and the pass condition.
**Runs in parallel with:** Tasks 1.3 to 1.9.

**Files (outside the repo, in the work folder):**
- Create: `build/build-vehicles.js`, `build/show.js`

**Interfaces:**
- Consumes: the fragment shapes of Tasks 1.3 to 1.9. `fragments/group-1.json` to `group-5.json` are arrays of 21-key objects, with weapon items `{ text, count }` or `{ text, count, twin: true }` and wargear items `{ text }`. `fragments/vehicle-traits.json` and `fragments/vehicle-rules.json` are objects of `{ name, source, page, description }`.
- Produces: `node build/build-vehicles.js` writes `data/vehicles.json` and the two glossary sections in the shapes of "Interfaces for Part 2", and prints the build report. For weapons and for wargear, the report lists the UNRESOLVED, AMBIGUOUS and UNUSED map keys, the PROFILE FAMILIES, the keys resolved below tier 1, and the keys that the map resolves or accepts. At the end, it lists the MAP OVERRIDES: the map entries that replace a tier match or a profile family. `node build/build-vehicles.js --self-test` checks the resolver and writes nothing. `normalise(name)` and `isProfileOf(recordKey, key)` must stay identical to the functions of the same names in `scripts/test-vehicles.js` (Task 1.1).
- Produces: `node build/show.js ids <1-5> | vehicle <id> | trait <key> | rule <key> | rules`. Task 1.13 uses it.

- [ ] **Step 1: Write the build script**

Create `build/build-vehicles.js` (Windows path `\\wsl.localhost\Ubuntu-24.04\root\projects\.QK-Wrath-and-Glory-reference\work\vehicles\build\build-vehicles.js`) with this content:

```javascript
// build-vehicles.js: throwaway build for issue #28. It lives outside the repo.
// It merges the seven fragments in book order, resolves the weapon and wargear ids (spec §2.3),
// writes data/vehicles.json and the vehicleTraits and vehicleRules sections of data/glossary.json,
// and prints the build report.
// Run:       node /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles/build/build-vehicles.js
// Self-test: add --self-test (checks the resolver against the real wargear files; writes nothing).

const fs = require('fs');
const path = require('path');

const WORK = '/root/projects/.QK-Wrath-and-Glory-reference/work/vehicles';
const REPO = '/root/projects/QK-Wrath-and-Glory';

const FIELDS = ['id', 'name', 'faction', 'variantOf', 'description', 'options', 'value', 'rarity',
    'speed', 'manoeuvre', 'resilience', 'wounds', 'size', 'keywords', 'crew', 'traits',
    'weapons', 'wargear', 'sidebar', 'source', 'page'];

// Blocks per printed page, from the pdfgrep "Spd" survey: 107 blocks; pp. 83 and 90 hold none.
const EXPECTED_PER_PAGE = {
    64: 2, 65: 3, 66: 3, 67: 2, 68: 3, 69: 3, 70: 3, 71: 3, 72: 2, 73: 1, 74: 2, 75: 2, 76: 3,
    77: 2, 78: 2, 79: 3, 80: 2, 81: 3, 82: 3, 84: 2, 85: 3, 86: 3, 87: 3, 88: 4, 89: 2, 91: 2,
    92: 1, 93: 4, 94: 2, 95: 2, 96: 1, 97: 1, 98: 3, 99: 2, 100: 2, 101: 2, 102: 2, 103: 2,
    104: 2, 105: 2, 106: 2, 107: 2, 108: 2, 109: 3, 110: 1, 111: 3
};

const TRAIT_ORDER = ['all_terrain', 'amphibious', 'bike', 'flyer', 'gun_ports', 'gyro_stabilised',
    'hover', 'open_topped', 'reliable', 'sealed', 'turbo_boost', 'walker'];

// Spec Appendix B order; interacting_with_vehicles and vehicle_actions are the two conditional keys.
const RULE_ORDER = ['benevolence_of_the_omnissiah', 'masters_of_machines', 'miraculum_mobili',
    'bleeding_edge_technology', 'wraithbone', 'orks_build_tuff', 'green_wunz_only',
    'interacting_with_vehicles', 'embarking', 'actions_inside', 'complications', 'vehicle_roles',
    'vehicle_actions', 'drive', 'brace_for_impact', 'breakneck_speed', 'emergency_repair',
    'evasive_manoeuvres', 'line_up_the_shot', 'open_fire', 'ram', 'reload', 'high_speed_tactics',
    'attacking_from_a_vehicle', 'attacking_a_vehicles_occupants', 'vehicle_defence',
    'damaged_vehicles', 'vehicles_and_conditions', 'called_shots', 'vehicle_damage',
    'repairing_vehicles', 'vehicle_explosions', 'crash_and_burn', 'built_to_last', 'ammo',
    'twin_weapons', 'vehicle_characteristics'];

// Keyed by the normalised key that the build report prints. A string value is the record id to
// use; null accepts the line as text only (spec §2.3); a WEAPON_MAP list of two or more ids
// gives profileIds. An entry for a key that the rules already resolve is an override (plan
// decision 4): add its key to TIER_OVERRIDES in scripts/test-vehicles.js. A profile family that
// the build finds needs no entry.
const WEAPON_MAP = {
};
const WARGEAR_MAP = {
};

function fail(message) {
    console.error(`BUILD FAILED: ${message}`);
    process.exit(1);
}
function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
        fail(`cannot read ${file}: ${err.message}`);
    }
}

// Spec §2.3, applied the same way to a printed line and to a record name: case folded, the
// leading quantity, the "Twin " prefix, a record-name suffix "(Vehicle)", "(Weapon)" or
// "(Wargear)" and a trailing plural "s" removed. So "Blaster" matches "Blaster (Vehicle)" in
// tier 1 and not the infantry "Blaster" in tier 3. Curly apostrophes also become straight, and
// white space collapses.
function normalise(name) {
    return name.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim()
        .replace(/^\d+ /, '').replace(/^twin /, '')
        .replace(/ \((vehicle|weapon|wargear)\)$/, '').replace(/s$/, '');
}

// A profile record's normalised name is the line's normalised name, one space and one bracketed
// profile label: "prism cannon (dispersed)", "doomsday cannon (high power)", "heavy seismic
// cannon (short-wave)". The labels in weapons.json are lower-case letters, spaces and hyphens.
// The bracketed tags "ammo", "abundance of apocrypha" and "adeptus arbites" mark ammunition or
// a source, not a profile.
const PROFILE_LABEL = /^[a-z][a-z -]*$/;
const NOT_PROFILE_LABELS = ['ammo', 'abundance of apocrypha', 'adeptus arbites'];
function isProfileOf(recordKey, key) {
    if (!recordKey.startsWith(`${key} (`) || !recordKey.endsWith(')')) return false;
    const label = recordKey.slice(key.length + 2, -1);
    return PROFILE_LABEL.test(label) && !NOT_PROFILE_LABELS.includes(label);
}

function makeTiers(lists) {
    return lists.map(list => list.map(record => ({ record, key: normalise(record.name) })));
}
function weaponTiers(weapons) {
    const isChurchVehicle = w => w.source === 'church' && (w.category || '').startsWith('Vehicle - ');
    return makeTiers([
        weapons.filter(isChurchVehicle),
        weapons.filter(w => w.source === 'core'),
        weapons.filter(w => !isChurchVehicle(w) && w.source !== 'core')
    ]);
}
function wargearTiers(equipment) {
    const vehicleWargear = equipment.filter(e => e.category === 'vehicle wargear');
    return makeTiers([
        vehicleWargear.filter(e => e.source === 'church'),
        vehicleWargear.filter(e => e.source === 'core'),
        vehicleWargear.filter(e => e.source !== 'church' && e.source !== 'core')
    ]);
}

// The rules alone: the first tier with exactly one match wins, and two matches in one tier are
// ambiguous. A weapon line that matches no record by name, but two or more profile records in
// one tier, is a profile family: weaponId null and profileIds in file order (spec §2.3).
function resolveByRules(key, tiers, allowProfiles) {
    for (let t = 0; t < tiers.length; t++) {
        const hits = tiers[t].filter(c => c.key === key);
        if (hits.length === 1) return { id: hits[0].record.id, how: `tier ${t + 1}`, key, record: hits[0].record };
        if (hits.length > 1) return { id: null, how: 'ambiguous', key, candidates: hits.map(c => c.record.id) };
    }
    if (allowProfiles) {
        for (const tier of tiers) {
            const family = tier.filter(c => isProfileOf(c.key, key));
            if (family.length >= 2) return { id: null, how: 'profiles', key, profileIds: family.map(c => c.record.id) };
        }
    }
    const near = tiers.flat().filter(c => c.key.startsWith(`${key} (`)).map(c => c.record.id);
    return { id: null, how: 'unresolved', key, near };
}

// A map entry decides its key (plan decision 4). It holds a leftover, or it overrides a wrong
// match: a tier match or a profile family for an item that the book profiles under another
// record. A WEAPON_MAP value can be a list of two or more profile ids. "overrides" names what
// the rules alone give, or is null for a leftover.
function resolve(text, tiers, map, allowProfiles) {
    const key = normalise(text);
    const byRules = resolveByRules(key, tiers, allowProfiles);
    if (!Object.prototype.hasOwnProperty.call(map, key)) return byRules;
    const value = map[key];
    const overrides = byRules.profileIds || byRules.id || null;
    if (Array.isArray(value)) return { id: null, how: 'manual', key, profileIds: value, overrides };
    return { id: value, how: value === null ? 'accepted' : 'manual', key, overrides };
}

// The normalised family names that the profile rule finds, over all tiers.
function profileFamilyKeys(tiers) {
    const keys = new Set();
    for (const tier of tiers) {
        const members = {};
        for (const c of tier) {
            const m = c.key.match(/^(.+) \(([^()]+)\)$/);
            if (m && isProfileOf(c.key, m[1])) members[m[1]] = (members[m[1]] || 0) + 1;
        }
        for (const [k, n] of Object.entries(members)) if (n >= 2) keys.add(k);
    }
    return [...keys].sort();
}

function selfTest() {
    const weapons = readJson(path.join(REPO, 'data/weapons.json'));
    const equipment = readJson(path.join(REPO, 'data/equipment.json'));
    const wt = weaponTiers(weapons);
    const gt = wargearTiers(equipment);
    let failed = 0;
    const expect = (name, actual, expected) => {
        const ok = JSON.stringify(actual) === JSON.stringify(expected);
        if (!ok) failed++;
        console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
    };
    const weapon = text => { const r = resolve(text, wt, {}, true); return [r.id, r.how]; };
    const family = text => { const r = resolve(text, wt, {}, true); return [r.id, r.how, r.profileIds]; };
    const gear = text => { const r = resolve(text, gt, {}, false); return [r.id, r.how]; };

    expect('normalise drops the quantity, Twin and the plural', normalise('2 Twin Lascannons'), 'lascannon');
    expect('normalise drops a record disambiguator', normalise('Blaster (Vehicle)'), 'blaster');
    expect('normalise drops the disambiguator before the plural', normalise('Bladevanes (Weapon)'), 'bladevane');
    expect('normalise keeps a printed note', normalise('Lasgun Array (6 Lasguns)'), 'lasgun array (6 lasguns)');
    expect('normalise straightens apostrophes and spaces', normalise('Grabbin’  Klaw'), "grabbin' klaw");

    expect('Multi-Laser resolves to the Church of Steel record', weapon('Multi-Laser'), ['cos_multi_laser', 'tier 1']);
    expect('Blaster resolves to the vehicle Blaster, not the infantry one', weapon('Blaster'), ['cos_blaster', 'tier 1']);
    expect('Splinter Cannon resolves to the vehicle record', weapon('Splinter Cannon'), ['cos_splinter_cannon', 'tier 1']);
    expect('Splinter Pods resolves to Church of Steel before Aeldari', weapon('Splinter Pods'), ['cos_splinter_pods', 'tier 1']);
    expect('Saw Blades resolves to the plural record', weapon('Saw Blades'), ['cos_saw_blades', 'tier 1']);
    expect('2 Twin Lascannons resolves to the core Lascannon', weapon('2 Twin Lascannons'), ['lascannon', 'tier 2']);
    expect('Twin Assault Cannon resolves to the core record', weapon('Twin Assault Cannon'), ['assault_cannon', 'tier 2']);
    expect('Heavy Bolter resolves to the voa record', weapon('Heavy Bolter'), ['heavy_bolter', 'tier 3']);
    expect('2 Heavy Bolters resolves to the voa record', weapon('2 Heavy Bolters'), ['heavy_bolter', 'tier 3']);
    expect('Storm Bolter resolves to the voa record', weapon('Storm Bolter'), ['storm_bolter', 'tier 3']);
    expect('a line with a printed note is unresolved', weapon('Lasgun Array (6 Lasguns)'), [null, 'unresolved']);
    expect('the manual map resolves a leftover',
        resolve('Lasgun Array (6 Lasguns)', wt, { 'lasgun array (6 lasguns)': 'cos_lasgun_array' }, true).id, 'cos_lasgun_array');
    expect('a null map value accepts the line as text only',
        (r => [r.id, r.how])(resolve('Lasgun Array (6 Lasguns)', wt, { 'lasgun array (6 lasguns)': null }, true)), [null, 'accepted']);
    expect('Missile Launcher keeps the core record: this book does not profile it', weapon('Missile Launcher'), ['missile_launcher', 'tier 2']);
    expect('a map entry overrides a tier match and names what it overrides',
        (r => [r.id, r.how, r.overrides])(resolve('Missile Launcher', wt, { 'missile launcher': 'cos_daedalus_missile_launcher' }, true)),
        ['cos_daedalus_missile_launcher', 'manual', 'missile_launcher']);
    expect('a map list overrides a tier match with profile ids',
        (r => [r.id, r.how, r.profileIds])(resolve('Missile Launcher', wt,
            { 'missile launcher': ['cos_aeldari_missile_launcher_sunburst', 'cos_aeldari_missile_launcher_starshot'] }, true)),
        [null, 'manual', ['cos_aeldari_missile_launcher_sunburst', 'cos_aeldari_missile_launcher_starshot']]);
    expect('a map entry for a leftover overrides nothing',
        resolve('Lasgun Array (6 Lasguns)', wt, { 'lasgun array (6 lasguns)': 'cos_lasgun_array' }, true).overrides, null);
    const twoInOneTier = makeTiers([[{ id: 'a', name: 'Foo' }, { id: 'b', name: 'Foos' }], [{ id: 'c', name: 'Foo' }]]);
    expect('two matches in one tier are ambiguous and stop the search',
        (r => [r.id, r.how, r.candidates])(resolve('Foo', twoInOneTier, {}, true)), [null, 'ambiguous', ['a', 'b']]);

    expect('the profile rule finds exactly the 11 church profile families', profileFamilyKeys(wt), [
        'aeldari missile launcher', 'castigator battle cannon', 'doomsday cannon', 'heat ray', 'heavy seismic cannon',
        'kannon', 'killa jet', 'prism cannon', 'tauros grenade launcher', 'taurox missile launcher', 'typhoon missile launcher']);
    expect('Prism Cannon gets its three profiles in file order', family('Prism Cannon'),
        [null, 'profiles', ['cos_prism_cannon_dispersed', 'cos_prism_cannon_focussed', 'cos_prism_cannon_lance']]);
    expect('Doomsday Cannon gets its two profiles (labels with a space)', family('Doomsday Cannon'),
        [null, 'profiles', ['cos_doomsday_cannon_high', 'cos_doomsday_cannon_low']]);
    expect('Heavy Seismic Cannon gets its two profiles (hyphenated labels)', family('Heavy Seismic Cannon'),
        [null, 'profiles', ['cos_heavy_seismic_cannon_short', 'cos_heavy_seismic_cannon_long']]);
    expect('2 Twin Heat Rays gets the two Heat Ray profiles', family('2 Twin Heat Rays'),
        [null, 'profiles', ['cos_heat_ray_dispersed', 'cos_heat_ray_focussed']]);
    expect('a printed profile name resolves to that one record', weapon('Prism Cannon (Lance)'), ['cos_prism_cannon_lance', 'tier 1']);
    expect('a map entry overrides a profile family and names the family',
        (r => [r.id, r.how, r.overrides])(resolve('Kannon', wt, { 'kannon': 'cos_kannon_shell' }, true)),
        ['cos_kannon_shell', 'manual', ['cos_kannon_frag', 'cos_kannon_shell']]);
    const tagged = makeTiers([[{ id: 'a', name: 'Foo (Ammo)' }, { id: 'b', name: 'Foo (Abundance of Apocrypha)' }, { id: 'c', name: 'Foo (Adeptus Arbites)' }]]);
    expect('bracketed source tags are not profile labels', (r => [r.id, r.how])(resolve('Foo', tagged, {}, true)), [null, 'unresolved']);
    const split = makeTiers([[{ id: 'a', name: 'Foo (Frag)' }], [{ id: 'b', name: 'Foo (Krak)' }]]);
    expect('one profile record per tier is not a family', (r => [r.id, r.how])(resolve('Foo', split, {}, true)), [null, 'unresolved']);
    const pair = makeTiers([[{ id: 'a', name: 'Foo (Frag)' }, { id: 'b', name: 'Foo (Krak)' }]]);
    expect('a wargear line never becomes a profile family', (r => [r.id, r.how])(resolve('Foo', pair, {}, false)), [null, 'unresolved']);

    expect('Smoke Launchers resolves to the singular wargear record', gear('Smoke Launchers'), ['cos_smoke_launcher', 'tier 1']);
    expect('Power Field resolves to the vehicle wargear record', gear('Power Field'), ['cos_power_field', 'tier 1']);
    expect('Bladevanes in a wargear box resolves to the wargear record', gear('Bladevanes'), ['cos_bladevanes_wargear', 'tier 1']);
    expect('a weapon name in a wargear box is unresolved', gear('Hunter-Killer Missile'), [null, 'unresolved']);

    console.log(failed === 0 ? '\nSelf-test passed.' : `\n${failed} self-test check(s) failed.`);
    process.exit(failed === 0 ? 0 : 1);
}

function build() {
    // --- merge the five vehicle fragments in book order ---
    const merged = [];
    for (const n of [1, 2, 3, 4, 5]) {
        const file = path.join(WORK, `fragments/group-${n}.json`);
        const list = readJson(file);
        if (!Array.isArray(list)) fail(`${file} is not a JSON array`);
        list.forEach((e, index) => {
            const where = `group-${n}.json[${index}] (${e && e.id})`;
            if (!e || Object.keys(e).sort().join(',') !== [...FIELDS].sort().join(',')) fail(`${where}: keys must be exactly ${FIELDS.join(', ')}`);
            for (const w of e.weapons) {
                const ks = Object.keys(w).sort().join(',');
                if (ks !== 'count,text' && ks !== 'count,text,twin') fail(`${where}: weapon item keys are ${ks}`);
            }
            for (const g of e.wargear) if (Object.keys(g).join(',') !== 'text') fail(`${where}: wargear item keys are ${Object.keys(g).join(',')}`);
            merged.push({ e, group: n, index });
        });
    }
    merged.sort((a, b) => a.e.page - b.e.page || a.group - b.group || a.index - b.index);

    const ids = merged.map(m => m.e.id);
    const duplicates = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    if (duplicates.length) fail(`duplicate ids: ${duplicates.join(', ')}`);

    const perPage = {};
    for (const { e } of merged) perPage[e.page] = (perPage[e.page] || 0) + 1;
    const pages = [...new Set([...Object.keys(EXPECTED_PER_PAGE), ...Object.keys(perPage)])].sort((a, b) => a - b);
    const pageProblems = pages.filter(p => (EXPECTED_PER_PAGE[p] || 0) !== (perPage[p] || 0))
        .map(p => `p. ${p}: survey ${EXPECTED_PER_PAGE[p] || 0}, fragments ${perPage[p] || 0}`);
    if (pageProblems.length) fail(`blocks per page differ from the survey:\n  ${pageProblems.join('\n  ')}`);

    // --- resolve the weapon and wargear lines ---
    const weapons = readJson(path.join(REPO, 'data/weapons.json'));
    const equipment = readJson(path.join(REPO, 'data/equipment.json'));
    const weaponIds = new Set(weapons.map(w => w.id));
    const equipmentIds = new Set(equipment.map(e => e.id));
    for (const [key, value] of Object.entries(WEAPON_MAP)) {
        if (Array.isArray(value) && value.length < 2) fail(`WEAPON_MAP["${key}"]: a profile list needs two or more ids`);
        for (const id of [].concat(value)) if (id !== null && !weaponIds.has(id)) fail(`WEAPON_MAP["${key}"]: no weapons.json record ${id}`);
    }
    for (const [key, value] of Object.entries(WARGEAR_MAP)) {
        if (Array.isArray(value)) fail(`WARGEAR_MAP["${key}"]: a wargear entry takes one id or null`);
        if (value !== null && !equipmentIds.has(value)) fail(`WARGEAR_MAP["${key}"]: no equipment.json record ${value}`);
    }
    const wt = weaponTiers(weapons);
    const gt = wargearTiers(equipment);
    const results = { weapons: [], wargear: [] };

    const entries = merged.map(({ e }) => {
        const out = {};
        for (const f of FIELDS) out[f] = e[f];
        out.weapons = e.weapons.map(w => {
            const r = resolve(w.text, wt, WEAPON_MAP, true);
            results.weapons.push({ vehicle: e.id, text: w.text, ...r });
            const item = { text: w.text, weaponId: r.id, count: w.count };
            if (w.twin === true) item.twin = true;
            if (r.profileIds) item.profileIds = r.profileIds;
            return item;
        });
        out.wargear = e.wargear.map(g => {
            const r = resolve(g.text, gt, WARGEAR_MAP, false);
            results.wargear.push({ vehicle: e.id, text: g.text, ...r });
            return { text: g.text, equipmentId: r.id };
        });
        return out;
    });

    // --- the two glossary sections, in book order ---
    function section(file, order) {
        const fragment = readJson(file);
        const unknown = Object.keys(fragment).filter(k => !order.includes(k));
        if (unknown.length) fail(`${file}: unknown keys ${unknown.join(', ')}`);
        const out = {};
        for (const key of order) {
            if (!(key in fragment)) continue;
            const v = fragment[key];
            if (Object.keys(v).sort().join(',') !== 'description,name,page,source') fail(`${file}: ${key} keys must be name, source, page, description`);
            out[key] = { name: v.name, source: v.source, page: v.page, description: v.description };
        }
        return out;
    }
    const vehicleTraits = section(path.join(WORK, 'fragments/vehicle-traits.json'), TRAIT_ORDER);
    const vehicleRules = section(path.join(WORK, 'fragments/vehicle-rules.json'), RULE_ORDER);

    // --- write the repo files ---
    fs.writeFileSync(path.join(REPO, 'data/vehicles.json'), JSON.stringify(entries, null, 2) + '\n');
    const glossaryPath = path.join(REPO, 'data/glossary.json');
    const glossary = readJson(glossaryPath);
    delete glossary.vehicleTraits;
    delete glossary.vehicleRules;
    glossary.vehicleTraits = vehicleTraits;
    glossary.vehicleRules = vehicleRules;
    fs.writeFileSync(glossaryPath, JSON.stringify(glossary, null, 2) + '\n');

    // --- the build report ---
    const factions = {};
    for (const e of entries) factions[e.faction] = (factions[e.faction] || 0) + 1;
    console.log('== BUILD REPORT ==');
    console.log(`Entries: ${entries.length}`);
    console.log(`Distinct faction values (${Object.keys(factions).length}): ${Object.entries(factions).map(([f, n]) => `${f} ${n}`).join(', ')}`);
    for (const [label, list, map] of [['WEAPON', results.weapons, WEAPON_MAP], ['WARGEAR', results.wargear, WARGEAR_MAP]]) {
        const how = {};
        for (const r of list) how[r.how] = (how[r.how] || 0) + 1;
        console.log(`\n${label} lines: ${list.length} (${Object.entries(how).map(([h, n]) => `${h}: ${n}`).join(', ')})`);
        // One row per normalised key: a key always gets the same outcome.
        const byKey = new Map();
        for (const r of list) {
            if (!byKey.has(r.key)) byKey.set(r.key, { ...r, vehicles: [] });
            byKey.get(r.key).vehicles.push(r.vehicle);
        }
        const rows = [...byKey.values()];
        const where = r => `x${r.vehicles.length}: ${r.vehicles.slice(0, 4).join(', ')}${r.vehicles.length > 4 ? ', ...' : ''}`;
        const show = (title, picked, line) => {
            console.log(`${title} (${picked.length})${picked.length ? ':' : ''}`);
            for (const r of picked) console.log(`  ${line(r)}`);
        };
        show(`UNRESOLVED ${label} KEYS - add each key to ${label}_MAP`, rows.filter(r => r.how === 'unresolved'),
            r => `"${r.key}" (printed "${r.text}") ${where(r)}${r.near.length ? ` | bracketed records: ${r.near.join(', ')}` : ''}`);
        show(`AMBIGUOUS ${label} KEYS - add each key to ${label}_MAP`, rows.filter(r => r.how === 'ambiguous'),
            r => `"${r.key}" (printed "${r.text}") ${where(r)} | candidates: ${r.candidates.join(', ')}`);
        show(`${label} PROFILE FAMILIES - check that each line names this weapon`, rows.filter(r => r.how === 'profiles'),
            r => `"${r.key}" -> ${r.profileIds.join(', ')} ${where(r)}`);
        show(`${label} KEYS RESOLVED BELOW TIER 1 - check each one`, rows.filter(r => r.how === 'tier 2' || r.how === 'tier 3'),
            r => `"${r.key}" -> ${r.id} [${r.record.source}, ${r.record.category}] ${where(r)}`);
        show(`${label} KEYS RESOLVED BY THE MAP`, rows.filter(r => r.how === 'manual'),
            r => `"${r.key}" -> ${r.profileIds ? r.profileIds.join(', ') : r.id} ${where(r)}`);
        show(`${label} KEYS ACCEPTED AS TEXT ONLY`, rows.filter(r => r.how === 'accepted'), r => `"${r.key}" ${where(r)}`);
        const used = new Set(rows.filter(r => r.how === 'manual' || r.how === 'accepted').map(r => r.key));
        show(`UNUSED ${label}_MAP KEYS - remove them`, Object.keys(map).filter(k => !used.has(k)), k => `"${k}"`);
    }
    // A map entry that replaces a tier match or a profile family needs its key in TIER_OVERRIDES.
    const overrideRows = [...results.weapons, ...results.wargear].filter(r => r.overrides);
    const overrideKeys = [...new Set(overrideRows.map(r => r.key))];
    console.log(`\nMAP OVERRIDES - add each key to TIER_OVERRIDES in scripts/test-vehicles.js (${overrideKeys.length})${overrideKeys.length ? ':' : ''}`);
    for (const k of overrideKeys) {
        const r = overrideRows.find(x => x.key === k);
        console.log(`  "${k}": the rules give ${[].concat(r.overrides).join(', ')}; the map gives ${r.profileIds ? r.profileIds.join(', ') : r.id}`);
    }
    console.log(`\nvehicleTraits: ${Object.keys(vehicleTraits).length} entries; vehicleRules: ${Object.keys(vehicleRules).length} entries`);
    console.log('Wrote data/vehicles.json and data/glossary.json.');
}

if (process.argv.includes('--self-test')) selfTest();
else build();
```

- [ ] **Step 2: Run the self-test**

Do not run the build without `--self-test` in this task: the extraction tasks are still writing the fragments.

Run: `wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && node build/build-vehicles.js --self-test; echo "exit=$?"'`

Expected:

```
PASS  normalise drops the quantity, Twin and the plural
PASS  normalise drops a record disambiguator
PASS  normalise drops the disambiguator before the plural
PASS  normalise keeps a printed note
PASS  normalise straightens apostrophes and spaces
PASS  Multi-Laser resolves to the Church of Steel record
PASS  Blaster resolves to the vehicle Blaster, not the infantry one
PASS  Splinter Cannon resolves to the vehicle record
PASS  Splinter Pods resolves to Church of Steel before Aeldari
PASS  Saw Blades resolves to the plural record
PASS  2 Twin Lascannons resolves to the core Lascannon
PASS  Twin Assault Cannon resolves to the core record
PASS  Heavy Bolter resolves to the voa record
PASS  2 Heavy Bolters resolves to the voa record
PASS  Storm Bolter resolves to the voa record
PASS  a line with a printed note is unresolved
PASS  the manual map resolves a leftover
PASS  a null map value accepts the line as text only
PASS  Missile Launcher keeps the core record: this book does not profile it
PASS  a map entry overrides a tier match and names what it overrides
PASS  a map list overrides a tier match with profile ids
PASS  a map entry for a leftover overrides nothing
PASS  two matches in one tier are ambiguous and stop the search
PASS  the profile rule finds exactly the 11 church profile families
PASS  Prism Cannon gets its three profiles in file order
PASS  Doomsday Cannon gets its two profiles (labels with a space)
PASS  Heavy Seismic Cannon gets its two profiles (hyphenated labels)
PASS  2 Twin Heat Rays gets the two Heat Ray profiles
PASS  a printed profile name resolves to that one record
PASS  a map entry overrides a profile family and names the family
PASS  bracketed source tags are not profile labels
PASS  one profile record per tier is not a family
PASS  a wargear line never becomes a profile family
PASS  Smoke Launchers resolves to the singular wargear record
PASS  Power Field resolves to the vehicle wargear record
PASS  Bladevanes in a wargear box resolves to the wargear record
PASS  a weapon name in a wargear box is unresolved

Self-test passed.
exit=0
```

- [ ] **Step 3: Write the show helper**

Create `build/show.js` with this content:

```javascript
// show.js: prints the built data one item at a time, for the verify pass.
// Usage (from the work folder):
//   node build/show.js ids <1-5>        the ids of one extraction group, in book order
//   node build/show.js vehicle <id>     one vehicles.json entry, then each weapon and wargear
//                                       line with the record (or the profile records) it resolved to
//   node build/show.js trait <key>      one vehicleTraits entry
//   node build/show.js rule <key>       one vehicleRules entry
//   node build/show.js rules            the vehicleRules keys, in order

const fs = require('fs');
const path = require('path');

const WORK = '/root/projects/.QK-Wrath-and-Glory-reference/work/vehicles';
const REPO = '/root/projects/QK-Wrath-and-Glory';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const [what, arg] = process.argv.slice(2);

if (what === 'ids') {
    const groupIds = new Set(read(path.join(WORK, `fragments/group-${arg}.json`)).map(e => e.id));
    console.log(read(path.join(REPO, 'data/vehicles.json')).filter(v => groupIds.has(v.id)).map(v => `${v.id} (p. ${v.page})`).join('\n'));
} else if (what === 'vehicle') {
    const v = read(path.join(REPO, 'data/vehicles.json')).find(x => x.id === arg);
    if (!v) { console.log(`No vehicle ${arg}`); process.exit(1); }
    console.log(JSON.stringify(v, null, 2));
    const weapons = new Map(read(path.join(REPO, 'data/weapons.json')).map(w => [w.id, w]));
    const equipment = new Map(read(path.join(REPO, 'data/equipment.json')).map(e => [e.id, e]));
    const record = id => { const r = weapons.get(id); return r ? `${r.id} = "${r.name}" [${r.source}, ${r.category}, p. ${r.page}]` : `${id} (no record)`; };
    for (const w of v.weapons) {
        if (w.profileIds) console.log(`WEAPON  "${w.text}" -> profiles: ${w.profileIds.map(record).join('; ')}`);
        else console.log(`WEAPON  "${w.text}" -> ${w.weaponId ? record(w.weaponId) : 'null (text only)'}`);
    }
    for (const g of v.wargear) {
        const r = equipment.get(g.equipmentId);
        console.log(`WARGEAR "${g.text}" -> ${r ? `${r.id} = "${r.name}" [${r.source}, ${r.category}, p. ${r.page}]` : 'null (text only)'}`);
    }
} else if (what === 'trait' || what === 'rule') {
    const section = read(path.join(REPO, 'data/glossary.json'))[what === 'trait' ? 'vehicleTraits' : 'vehicleRules'] || {};
    if (!(arg in section)) { console.log(`No ${what} ${arg}`); process.exit(1); }
    console.log(JSON.stringify(section[arg], null, 2));
} else if (what === 'rules') {
    console.log(Object.keys(read(path.join(REPO, 'data/glossary.json')).vehicleRules || {}).join('\n'));
} else {
    console.log('Usage: node build/show.js ids <1-5> | vehicle <id> | trait <key> | rule <key> | rules');
    process.exit(1);
}
```

Run: `wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && node build/show.js; echo "exit=$?"'`

Expected:

```
Usage: node build/show.js ids <1-5> | vehicle <id> | trait <key> | rule <key> | rules
exit=1
```

- [ ] **Step 4: Commit to the work repo**

```bash
wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && /usr/bin/git add build/build-vehicles.js build/show.js && /usr/bin/git commit -q --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Add the vehicles build script and the show helper" && /usr/bin/git log --oneline -1' 2>&1 | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
```

If git reports `index.lock`, another task is committing at the same time. Run the same command again.

### Task 1.11: Triage the extraction reports

**Agent:** the main session. Reason: spec §2.2 has the faction list corrected before the build. Some decisions also change the test, the spec or a brief, and only the main session can approve such a change.
**Needs:** Tasks 1.3 to 1.9 and their reports (the final message of each agent).

**Files:**
- Create (work folder): `build/extraction-triage.md`
- Modify (work folder), only when a decision needs it: the fragments, `build/check-fragment.js` (`FACTIONS`)
- Modify (repo, on the `vehicles` branch), only when a decision needs it: `scripts/test-vehicles.js` (`FACTION_COUNTS`, an `EXPECTED` row), `docs/superpowers/specs/2026-10-20-vehicles-design.md` (the §2.2 faction list, Appendix A), and the faction strings of this plan

**Interfaces:**
- Consumes: the seven reports (`GROUP 1 REPORT` to `GROUP 5 REPORT`, `TRAITS REPORT`, `RULES REPORT`) and the renders.
- Produces: `build/extraction-triage.md`, with one line per reported item and its decision. The fragments, the test and the spec agree before the first build. Task 1.12 Step 2 relies on the faction list that this task settles.

- [ ] **Step 1: Log every reported item**

Create `build/extraction-triage.md` with the line `# Extraction triage`. From each of the seven reports, copy one line per item into it, and start each line with the task number:

- each PROBLEMS line and each STOP line;
- each "Confirmed …: no" line and each "Override …: no" line;
- each rule box, and each text that a report left out (the traits introduction, the rule headings left out);
- the two conditional-key decisions and the table placements of the RULES REPORT.

- [ ] **Step 2: Settle the faction list**

When a report names a faction heading whose words differ from the 11 strings, the page wins (spec §2.2). Correct the list in one change, before the build:

1. the `faction` values in the fragments;
2. `FACTION_COUNTS` in `scripts/test-vehicles.js` (rename the key and keep its count);
3. `FACTIONS` in `build/check-fragment.js`;
4. the faction list of spec §2.2;
5. the faction strings of this plan: Global Constraints, Step 2 of Tasks 1.3 to 1.7, and "Interfaces for Part 2". Then a brief that is sent again uses the new list.

When no report names a differing heading, the list stays. Write the result in the log.

- [ ] **Step 3: Decide each other item**

Open the page of each item, and write the decision after its log line:

- **A heading whose words differ from Appendix A:** the page wins. Correct the `EXPECTED` row in `scripts/test-vehicles.js` (the name, and the id when the id rule gives a new one), and Appendix A of the spec.
- **A STOP line (a stat cell that is not a plain integer):** spec §2.2 requires integers, so ask the user how to store the cell. After the decision, add the block to the fragment, and change the test and the spec as the decision requires.
- **A weapon quantity written as a word:** ask the user, because the spec rule reads a leading number.
- **A trait that is not one of the 12:** ask the user, because the chip has no entry to open.
- **Text that the agent could not read:** read a 300 dpi crop. Fix the fragment, or ask the user when the text stays unreadable.
- **A "no" confirmation:** the page wins. Correct the fragment. When the page contradicts a pinned fact (a family, a page, or one of the three overrides), correct the test and the spec too.
- **A rule box other than the Shokk Tunnel box:** keep it as that entry's `sidebar` (spec §2.2).
- **Text left out of the traits, or a rule heading left out:** accept it, and list it for the user in Task 1.15.
- **A conditional rule key or a table placement:** check it against the page. Fix the rules fragment when it is wrong.
- **A checker problem that an agent left in a fragment:** fix the fragment from the page.

Make each data fix in the fragment file, never in `data/`.

- [ ] **Step 4: Check every fragment**

```bash
wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && for f in fragments/*.json; do printf "%s: " $f; node build/check-fragment.js $f | tail -1; done'
```

Expected: seven lines that end in `PROBLEMS: none`.

- [ ] **Step 5: Commit the decisions**

Commit the log and the fragment fixes to the work repo:

```bash
wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && /usr/bin/git add build/extraction-triage.md build/check-fragment.js fragments && /usr/bin/git commit -q --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Record the extraction triage decisions" && /usr/bin/git log --oneline -1' 2>&1 | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
```

When Step 2 or Step 3 changed the test or the spec, commit them to the repo. The command also commits the spec amendment of 2026-10-21 when that amendment is still uncommitted.

```bash
wsl -e bash -c 'cd /root/projects/QK-Wrath-and-Glory && [ "$(/usr/bin/git branch --show-current)" = vehicles ] && /usr/bin/git add scripts/test-vehicles.js docs/superpowers/specs/2026-10-20-vehicles-design.md && /usr/bin/git commit -q --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Correct the pinned vehicle facts from the extraction triage" && /usr/bin/git log --oneline -1' 2>&1 | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
```

### Task 1.12: Run the first build, triage the leftover lines, and pass the test

**Agent:** `general-purpose`, `model: opus`. Reason: to map a printed weapon name to a record needs judgment against the book and the wargear data (user CLAUDE.md §4).
**Needs:** Task 1.11; Tasks 1.1 and 1.10 and their reviews; Tasks 1.3 to 1.9.

**Files:**
- Modify (work folder): `build/build-vehicles.js` (only the `WEAPON_MAP` and `WARGEAR_MAP` objects); a fragment where the build or the test finds a page error
- Modify (repo), only for a map override: the `TIER_OVERRIDES` list in `scripts/test-vehicles.js` (Step 4)
- Create (work folder): `build/build-report.txt`, `build/triage-log.md`, `build/test-output.txt`
- Written by the build (repo; committed in Task 1.15): `data/vehicles.json`, `data/glossary.json`

**Interfaces:**
- Consumes: the seven fragments, `build/build-vehicles.js` and `scripts/test-vehicles.js`.
- Produces: a build report with no UNRESOLVED, AMBIGUOUS or UNUSED key, and a `data/vehicles.json` and `data/glossary.json` that pass `scripts/test-vehicles.js`. Task 1.13 verifies these files.

- [ ] **Step 1: Run the build**

Start the log once: `wsl -e bash -c 'printf "# Triage log\n" > /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles/build/triage-log.md'`

Run the build: `wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && node build/build-vehicles.js > build/build-report.txt 2>&1; echo "exit=$?"; head -3 build/build-report.txt'`

When the output starts with `BUILD FAILED:`, the message names the fragment, the entry and the fault. The fault is the keys, a duplicate id, or a page count that differs from the survey. Open the page, fix the fragment, and log the fix in `build/triage-log.md`. Run the checker on that fragment, then run the build again. Repeat until the exit code is 0.

Expected at the end of this step: `exit=0`, `== BUILD REPORT ==`, `Entries: 107`.

- [ ] **Step 2: Check the faction values**

Run: `wsl -e bash -c 'grep "^Distinct faction values" /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles/build/build-report.txt'`

Expected:

```
Distinct faction values (11): Imperial 8, Adepta Sororitas 5, Adeptus Astartes 23, Adeptus Mechanicus 8, Aeronautica Imperialis 4, Astra Militarum 18, Aeldari 10, Chaos Space Marines 4, Drukhari 4, Necron 6, Ork 17
```

A different line means that a fragment's faction value disagrees with the list that Task 1.11 Step 2 settled. Stop and report it to the main session, which owns the faction list (Task 1.11 Step 2).

- [ ] **Step 3: Triage each UNRESOLVED and AMBIGUOUS key**

Print the four lists:

```bash
wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && sed -n "/^UNRESOLVED WEAPON KEYS/,/^WEAPON KEYS RESOLVED BELOW/p; /^UNRESOLVED WARGEAR KEYS/,/^WARGEAR KEYS RESOLVED BELOW/p" build/build-report.txt'
```

For each key, find the record with a distinctive word of the line, for example:

```bash
wsl -e bash -c 'grep -n -i "\"name\": \"[^\"]*lasgun" /root/projects/QK-Wrath-and-Glory/data/weapons.json'
```

For a wargear key, search `data/equipment.json`. Then decide with these rules, in this order:

1. The line names one record in another printed form: a note in brackets such as `(6 Lasguns)`, a spelling variant, or an extra word. Map the key to that record's id.
2. The weapon exists as two or more profile records, but the build found no family. The cause is a line that prints the name in another form, for example a spelling variant. Map the key to the list of those profile ids, in file order.
3. The key is AMBIGUOUS: map it to the candidate that the book means, from the record's `source` and `page`. Map it to `null` when the book does not decide.
4. No record has the name, for example a weapon in a Wargear box or an item with no profile in the data. Map the key to `null`.

Write each decision into `WEAPON_MAP` or `WARGEAR_MAP` in `build/build-vehicles.js`, one key per line. Add a comment with the page and the vehicle of one block that prints the line, and the reason. This entry shows the form; write the keys that your report prints:

```javascript
const WEAPON_MAP = {
    'lasgun array (6 lasguns)': 'cos_lasgun_array', // p. 84 Chimera: the note in brackets names the six Lasguns
};
```

A `null` entry has the same form, with `null` in place of the id.

Log each decision in `build/triage-log.md` as `- "<key>" -> <id or null>: <reason>`.

- [ ] **Step 4: Check the keys resolved below tier 1**

Run: `wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && sed -n "/KEYS RESOLVED BELOW TIER 1/,/KEYS RESOLVED BY THE MAP/p" build/build-report.txt'`

Each row names a `core` record or a record of another book. The spec expects `Heavy Bolter` and `Storm Bolter` to resolve to the `voa` records and `Lascannon` to the `core` record. For each row, confirm that the record is the weapon or wargear that the line names. A `core` match for a weapon that this book does not profile is correct, and it stays. An example is a printed `Missile Launcher` that gets the core `missile_launcher`. A row is wrong only when this book profiles the printed item under another record (Plan decision 4). For a wrong row, apply the remedy:

1. Add the key to `WEAPON_MAP` or `WARGEAR_MAP` with the right record id. For a weapon that the book profiles as several records, use the list of profile ids, in file order. Name the page in the comment.
2. Add the same key to `TIER_OVERRIDES` in `scripts/test-vehicles.js`. This is the only change to the test that this task may make.
3. Log the override in `build/triage-log.md`.

The next build lists the key under `MAP OVERRIDES`.

- [ ] **Step 5: Check the profile families**

Run: `wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && sed -n "/WEAPON PROFILE FAMILIES/,/WEAPON KEYS RESOLVED BELOW/p" build/build-report.txt'`

Each row names a family key, its profile ids in file order, and the vehicles that print it, for example `"prism cannon" -> cos_prism_cannon_dispersed, cos_prism_cannon_focussed, cos_prism_cannon_lance`. Every family key is one of the 11 of Plan decision 2. For each row, confirm that the printed line names this weapon and no single profile of it. For a wrong row, apply the remedy of Step 4.

- [ ] **Step 6: Rebuild until no key is open**

Run the build again with the Step 1 build command. Then run: `wsl -e bash -c 'grep -E "^(UNRESOLVED|AMBIGUOUS|UNUSED)" /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles/build/build-report.txt'`

Expected:

```
UNRESOLVED WEAPON KEYS - add each key to WEAPON_MAP (0)
AMBIGUOUS WEAPON KEYS - add each key to WEAPON_MAP (0)
UNUSED WEAPON_MAP KEYS - remove them (0)
UNRESOLVED WARGEAR KEYS - add each key to WARGEAR_MAP (0)
AMBIGUOUS WARGEAR KEYS - add each key to WARGEAR_MAP (0)
UNUSED WARGEAR_MAP KEYS - remove them (0)
```

- [ ] **Step 7: Run the test**

```bash
wsl -e bash -c 'O=/root/projects/.QK-Wrath-and-Glory-reference/work/vehicles/build/test-output.txt; cd /root/projects/QK-Wrath-and-Glory && node scripts/test-vehicles.js > $O; echo "exit=$?"; grep -A1 "^FAIL" $O; tail -1 $O'
```

Expected: `exit=0` and `All checks passed.`

For each FAIL, open the page and fix the fragment. Then rerun the build and the test. Do not edit the test, except `TIER_OVERRIDES` (Step 4). Stop and report to the main session when a FAIL comes from one of these:

- a fact that the test pins and the page contradicts: an id, name, faction, family or page of Appendix A; the `TRANSPORTER` count; the `[LEGION]` or `[MARK OF CHAOS]` placeholders; the Shokk Tunnel title;
- a trait that is not one of the 12;
- a stat cell that is not a plain integer;
- a text check that flags words that the page prints exactly.

- [ ] **Step 8: Check the repo diff**

Run: `wsl -e bash -c 'cd /root/projects/QK-Wrath-and-Glory && /usr/bin/git diff --numstat data/glossary.json && /usr/bin/git status --short data/' 2>&1 | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'`

Expected: `<n>	0	data/glossary.json` (additions only), then ` M data/glossary.json` and `?? data/vehicles.json`.

- [ ] **Step 9: Commit to the work repo**

```bash
wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && /usr/bin/git add fragments build/build-vehicles.js build/build-report.txt build/triage-log.md build/test-output.txt && /usr/bin/git commit -q --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Resolve the leftover weapon and wargear lines" && /usr/bin/git log --oneline -1' 2>&1 | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
```

When Step 4 added a key to `TIER_OVERRIDES`, also commit the test to the repo:

```bash
wsl -e bash -c 'cd /root/projects/QK-Wrath-and-Glory && [ "$(/usr/bin/git branch --show-current)" = vehicles ] && /usr/bin/git add scripts/test-vehicles.js && /usr/bin/git commit -q --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "List the deliberate weapon overrides in the vehicles test" && /usr/bin/git log --oneline -1' 2>&1 | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
```

### Task 1.13: Verify the built data against the pages

**Agent:** `general-purpose`, `model: opus`, six fresh agents in parallel. Reason: the independent second pass over every field needs judgment against the page (spec §6 step 3; user CLAUDE.md §4). None of the six is an agent that ran Tasks 1.3 to 1.12.
**Needs:** Task 1.12.

**Files (work folder):**
- Create: `build/verify-group-1.md` to `build/verify-group-5.md`, `build/verify-glossary.md`

**Interfaces:**
- Consumes: the built `data/vehicles.json` and `data/glossary.json` (through `build/show.js`), and the renders.
- Produces: six mismatch lists. Each line has the form `- <id or key> | <field> | data: "<stored>" | page: "<printed>" | p. <n>`. Each file ends with `Checked <N> entries, <M> mismatches.` Task 1.14 reads them.

- [ ] **Step 1: Dispatch the six agents in one message**

Send each agent the brief of Step 2 and one row of this table:

| Agent | Assignment | Pages | Report |
|---|---|---|---|
| 1 | Vehicle group 1: 25 entries (`node build/show.js ids 1`) | 64–68, 79–82, 84 | `build/verify-group-1.md` |
| 2 | Vehicle group 2: 23 entries (`node build/show.js ids 2`) | 69–78 | `build/verify-group-2.md` |
| 3 | Vehicle group 3: 18 entries (`node build/show.js ids 3`) | 84–89, 91 | `build/verify-group-3.md` |
| 4 | Vehicle group 4: 20 entries (`node build/show.js ids 4`) | 92–96, 99–103 | `build/verify-group-4.md` |
| 5 | Vehicle group 5: 21 entries (`node build/show.js ids 5`) | 97–98, 104–111 | `build/verify-group-5.md` |
| 6 | The 12 `vehicleTraits` entries and every `vehicleRules` entry | 29–31, 44–55, 60, 62–63 | `build/verify-glossary.md` |

- [ ] **Step 2: Use this verify brief (send it unchanged, with one row)**

You check built data against the page images of the *Church of Steel* sourcebook, field by field. You change no data file and no fragment. You write one report file, named in your row.

Tools:

- Use the Bash tool (Git Bash). Run each shell command in WSL: `wsl -e bash -c '<command>'`. Put a command with nested quotes in a script file inside the work folder's `build/` folder, and run that file.
- The work folder is `/root/projects/.QK-Wrath-and-Glory-reference/work/vehicles` in WSL. Its Windows path is `\\wsl.localhost\Ubuntu-24.04\root\projects\.QK-Wrath-and-Glory-reference\work\vehicles`.
- The page images are `renders/p-NNN.png`: 200 dpi, with a three-digit page number. The PDF page number equals the printed page number. Read an image with the Read tool at its Windows path, for example `\\wsl.localhost\Ubuntu-24.04\root\projects\.QK-Wrath-and-Glory-reference\work\vehicles\renders\p-064.png`.
- When digits or small text are hard to read, make a 300 dpi crop and read the crop. The numbers after `-x -y -W -H` are pixels at 300 dpi. A full page at 300 dpi is 2539 × 3189 pixels. A point at (x, y) in a 200 dpi image is at (1.5x, 1.5y) at 300 dpi. This example crops the lower quarter of p. 64:

  ```bash
  wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && pdftoppm -r 300 -f 64 -l 64 -x 0 -y 2390 -W 2539 -H 799 -singlefile -png "/root/projects/.QK-Wrath-and-Glory-reference/books/official-sourcebooks/Church of Steel.pdf" renders/crops/p064-low'
  ```

  Then read `renders\crops\p064-low.png`.
- Use `pdfgrep -n` only to find the page of a word, and `pdfgrep -c` only to count a spelling. Never use `pdftotext`. Never copy text out of `pdfgrep` output, because it merges the two text columns. Take the text from the images.
- The book and the images are copyrighted. Keep every render and every crop inside `renders/`. Copy them to no other folder.
- Do not read a whole data file of the repo. Use `grep -n` or a `node` one-liner to look up one record.
- Run `show.js` from the work folder: `wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && node build/show.js <arguments>'`.

For a vehicle group (agents 1 to 5):

1. List your ids with the command in your row.
2. For each id, print the entry with `node build/show.js vehicle <id>`. Open its page in the render. Crop at 300 dpi where the digits are small.
3. Compare every field with the page: `name` (the heading, in title case), `faction` (the section heading), `variantOf` (a block with no Value/Rarity line of its own names its family parent), `description`, `options`, `value`, `rarity`, `speed`, `manoeuvre`, `resilience`, `wounds`, `size`, `keywords` (spelling and order), `crew`, `traits` (with values), each weapon line (`text`, `count`, `twin`), each wargear line (`text`), `sidebar`, and `page` (the page of the `Spd` row). Compare prose word for word, with its punctuation and paragraph breaks.
4. Check each `WEAPON` and `WARGEAR` line that `show.js` prints after the entry. The record must be the item that the printed line names. A leading number, the word `Twin` and a plural `s` do not matter. A `profiles:` line lists the profile records of a weapon that exists only as profiles, for example `Prism Cannon (Dispersed)`, `(Focussed)` and `(Lance)`. Check that the list is complete and that the printed line names no single profile. `null (text only)` is correct only when no record has that name. The section `MAP OVERRIDES` of `build/build-report.txt` lists the lines that the build sends to another record on purpose. For such a line, check that the record is the one that the book profiles for that vehicle.

For the glossary (agent 6):

1. Print each trait with `node build/show.js trait <key>`, for `all_terrain`, `amphibious`, `bike`, `flyer`, `gun_ports`, `gyro_stabilised`, `hover`, `open_topped`, `reliable`, `sealed`, `turbo_boost` and `walker`.
2. List the rule keys with `node build/show.js rules`. Print each rule with `node build/show.js rule <key>`.
3. Compare `name`, `page` and `description` with the page, word for word. Check that each table has every printed row and cell, in printed order. Check that no text under a heading is missing, and that no entry holds the text of another heading. Check the two conditional keys: `interacting_with_vehicles` and `vehicle_actions` must exist exactly when the book prints text under that section heading before its first sub-heading.

These conventions are not mismatches:

- straight quotes where the book prints curly ones;
- `\n\n` between paragraphs in vehicle text;
- `<br><br>`, `<strong>`, `<em>`, `&amp;`, `&lt;`, `&gt;` and the table markup in glossary text;
- size words in full (`Medium` for `Med`, `Gargantuan` for `Gtn`);
- names in title case, and the `Archaeopter ` prefix on the three Archaeopter names;
- the shared family text of the three Archaeopter entries: by design (spec §2.2), each one carries the family description, Value, Rarity and options, and its description adds the block's own paragraph where one is printed;
- a word that the book splits with a hyphen at a line end, joined without the hyphen;
- a variant's Value and Rarity copied from its family, and the three overrides: Land Speeder Tornado and Typhoon `value` 12, Leman Russ Vanquisher `rarity` `Rare`;
- the book's own cross-references, such as `(see page 54)`.

Write the report with the Write tool at its Windows path, in `\\wsl.localhost\Ubuntu-24.04\root\projects\.QK-Wrath-and-Glory-reference\work\vehicles\build\`. Write one line per mismatch:

```
- <id or key> | <field> | data: "<stored text>" | page: "<printed text>" | p. <n>
```

- For long prose, quote only the words that differ, with up to five words of context on each side.
- For a missing or an extra item, write `data: (none)` or `page: (none)`.
- For text that you cannot read, even in a 300 dpi crop, write `- <id or key> | <field> | UNREADABLE | p. <n>`.
- The last line of the file is `Checked <N> entries, <M> mismatches.`

The page is the truth; the data is the suspect. Do not guess. Edit no file except your report.

- [ ] **Step 3: Collect the six reports**

Run: `wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && tail -q -n 1 build/verify-*.md'`

Expected: six lines of the form `Checked <N> entries, <M> mismatches.` N is 25, 23, 18, 20 and 21 for the groups. N is 47 to 49 for the glossary (12 traits and 35 to 37 rules).

- [ ] **Step 4: Commit the reports to the work repo**

```bash
wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && /usr/bin/git add build/verify-*.md && /usr/bin/git commit -q --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Add the six verify reports" && /usr/bin/git log --oneline -1' 2>&1 | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
```

### Task 1.14: Fix the mismatches from the pages

**Agent:** `general-purpose`, `model: opus` for Steps 1 to 5. Reason: a fix round needs judgment against the page (user CLAUDE.md §4). The main session runs Step 6, which dispatches the scoped re-review by a `reviewer` agent.
**Needs:** Task 1.13.

**Files:**
- Modify (work folder): the fragments that the mismatches name; `build/build-vehicles.js` (only `WEAPON_MAP` and `WARGEAR_MAP`)
- Modify (repo), only for a map override: the `TIER_OVERRIDES` list in `scripts/test-vehicles.js` (Task 1.12 Step 4)
- Create (work folder): `build/mismatches.txt`, `build/fix-log.md`
- Rewritten by the build (repo; committed in Task 1.15): `data/vehicles.json`, `data/glossary.json`

**Interfaces:**
- Consumes: the six verify reports, the renders and the fragments.
- Produces: fragments and maps that agree with the pages; a rebuilt `data/vehicles.json` and `data/glossary.json` that pass the test; `build/fix-log.md` with one line per mismatch. Task 1.15 commits the repo files.

- [ ] **Step 1: Collect the mismatch lines**

Run: `wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && grep -h "^- " build/verify-*.md > build/mismatches.txt; wc -l < build/mismatches.txt; printf "# Fix log\n" > build/fix-log.md'`

The command also starts `build/fix-log.md`, so the log exists even when there is no mismatch.

- [ ] **Step 2: Decide each mismatch from the page**

For each line of `build/mismatches.txt`:

1. Open the page in its render. Crop at 300 dpi where the text is small. Use the tools of the extraction tasks (renders in `renders/`, `pdftoppm` crops, `pdfgrep` only to find text, never `pdftotext`).
2. Decide:
   - The data is wrong: fix the fragment (`fragments/group-N.json`, `vehicle-traits.json` or `vehicle-rules.json`). Never edit `data/*.json` by hand, because the build rewrites them.
   - A resolution is wrong: fix the fragment when its `text` is wrong. Otherwise apply the remedy of Task 1.12 Step 4 (Plan decision 4). Add a map entry, and add the key to `TIER_OVERRIDES` when the entry overrides a match.
   - The verifier is wrong (the page agrees with the data, or a convention of the verify brief covers the line): reject the line.
   - The line is UNREADABLE: read a 300 dpi crop. When you still cannot read it, keep the data and log the line as open.
3. Log the decision in `build/fix-log.md` as `- <id or key> | <field> | FIXED`, `- … | REJECTED: <reason>` or `- … | OPEN: <reason>`.

Apply the extraction text rules to every fix. Use the book's exact words, straight quotes and dashes as printed. Use `\n\n` between paragraphs in vehicle text, and the glossary HTML in rule text. Apply the hyphen rule.

Stop and report to the main session in each of these cases:

- a fix changes a fact that the test pins: an Appendix A id, name, faction, family or page; the `TRANSPORTER` count; the placeholders; the Shokk Tunnel title;
- the page prints a trait outside the 12;
- the page prints a stat cell that is not a plain integer;
- a text check flags words that the page prints exactly.

Do not edit the test, except `TIER_OVERRIDES`.

- [ ] **Step 3: Check, rebuild and test**

```bash
wsl -e bash -c 'W=/root/projects/.QK-Wrath-and-Glory-reference/work/vehicles; cd $W && for f in fragments/*.json; do node build/check-fragment.js $f > /dev/null || echo "PROBLEM in $f"; done; node build/build-vehicles.js > build/build-report.txt 2>&1; echo "build exit=$?"; grep -E "^(UNRESOLVED|AMBIGUOUS|UNUSED)" build/build-report.txt; cd /root/projects/QK-Wrath-and-Glory && node scripts/test-vehicles.js > $W/build/test-output.txt; echo "test exit=$?"; tail -1 $W/build/test-output.txt'
```

Expected: no `PROBLEM in` line; `build exit=0`; six key lines that end in `(0)`; `test exit=0`; `All checks passed.`

- [ ] **Step 4: Check the log**

Run: `wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && wc -l < build/mismatches.txt; grep -c "^- " build/fix-log.md; grep "| OPEN" build/fix-log.md || echo "no OPEN lines"'`

Expected: the first two numbers are equal. Report each OPEN line to the main session.

- [ ] **Step 5: Commit to the work repo**

```bash
wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && /usr/bin/git add fragments build/build-vehicles.js build/build-report.txt build/test-output.txt build/mismatches.txt build/fix-log.md && /usr/bin/git commit -q --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Fix the verify mismatches in the fragments" && /usr/bin/git log --oneline -1' 2>&1 | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
```

When a fix added a key to `TIER_OVERRIDES`, also commit the test to the repo:

```bash
wsl -e bash -c 'cd /root/projects/QK-Wrath-and-Glory && [ "$(/usr/bin/git branch --show-current)" = vehicles ] && /usr/bin/git add scripts/test-vehicles.js && /usr/bin/git commit -q --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "List the deliberate weapon overrides in the vehicles test" && /usr/bin/git log --oneline -1' 2>&1 | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
```

- [ ] **Step 6: Dispatch the scoped re-review (main session)**

After the fix agent finishes, the main session dispatches a `reviewer` agent (user CLAUDE.md §4) with this brief and the findings list:

> You re-review one fix round of the vehicles data against the *Church of Steel* page images. You change no file. The work folder is `/root/projects/.QK-Wrath-and-Glory-reference/work/vehicles` (Windows path `\\wsl.localhost\Ubuntu-24.04\root\projects\.QK-Wrath-and-Glory-reference\work\vehicles`). The findings list is `build/mismatches.txt`; the decisions are in `build/fix-log.md`. The page images are `renders/p-NNN.png`; make a 300 dpi crop with `pdftoppm` where the text is small, and never use `pdftotext`. Print an entry with `wsl -e bash -c 'cd <work folder> && node build/show.js vehicle <id>'` (or `trait <key>`, `rule <key>`).
>
> 1. For each FIXED line, confirm on the page that the built data now matches the printed text.
> 2. For each REJECTED line, confirm that the page or a convention of the verify brief (Task 1.13 Step 2) supports the reason.
> 3. For each OPEN line, try a 300 dpi crop, and say whether the text is readable.
>
> Report one line per disagreement: `- <id or key> | <field> | <what is wrong> | p. <n>`. End with `Re-reviewed <N> lines, <M> disagreements.`

Append each disagreement line to `build/mismatches.txt`, and send those lines back through Steps 2 to 5; do not run Step 1 again. Then dispatch this step again with only those lines. The fix round ends when the re-review reports `0 disagreements`.

### Task 1.15: Spot-check, commit, review the wave, and delete the renders

**Agent:** the main session. Reason: spec §6 step 3 gives the spot check to the main session; the commits, the review dispatches and the clean-up are orchestration work.
**Needs:** Task 1.14 and its scoped re-review.

**Files:**
- Commit (repo, on the `vehicles` branch): `data/vehicles.json`, `data/glossary.json`; `scripts/test-vehicles.js` when it changed after Task 1.1 (an approved correction or a `TIER_OVERRIDES` key)
- Create (work folder): `build/wave-review.md`
- Delete (work folder): `renders/`, after the whole-wave review and its fixes

**Interfaces:**
- Consumes: the built data, `build/show.js` and the renders.
- Produces: the committed Part 1 data on the `vehicles` branch, in the shapes of "Interfaces for Part 2". Part 2 starts from this branch.

- [ ] **Step 1: Spot-check five entries and two rules against the pages**

Print each item with `show.js` from the work folder, and compare every field with the render:

| Item | Command | Page | Why this item |
|---|---|---|---|
| `chimera` | `node build/show.js vehicle chimera` | 84 | the spec's example; it shares p. 84 with group 1 |
| `land_speeder_tornado` | `node build/show.js vehicle land_speeder_tornado` | 71 | a variant with the Value override |
| `archaeopter_transvector` | `node build/show.js vehicle archaeopter_transvector` | 79 | the Archaeopter exception |
| `fire_prism` | `node build/show.js vehicle fire_prism` | 93 | a two-word variant title; its Prism Cannon is the three-profile family |
| `shokkjump_dragsta` | `node build/show.js vehicle shokkjump_dragsta` | 106 | the sidebar |
| `vehicle_damage` | `node build/show.js rule vehicle_damage` | 54 | the d66 table; Part 2 links it |
| `twin_weapons` | `node build/show.js rule twin_weapons` | 60 | Part 2's Twin marker opens it |

Send a mismatch back through Task 1.14 Steps 2 and 3: fix the fragment, rebuild and retest.

- [ ] **Step 2: Run every test**

```bash
wsl -e bash -c 'cd /root/projects/QK-Wrath-and-Glory && for f in scripts/test-*.js; do printf "%s: " $f; node $f > /dev/null && echo pass || echo FAIL; done'
```

Expected: every line ends in `pass`.

- [ ] **Step 3: Check the branch and the repo changes**

```bash
wsl -e bash -c 'cd /root/projects/QK-Wrath-and-Glory && /usr/bin/git branch --show-current && /usr/bin/git status --short && /usr/bin/git diff --numstat data/glossary.json' 2>&1 | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
```

Expected: `vehicles`; then ` M data/glossary.json` and `?? data/vehicles.json`, plus the changes that existed before this plan (for example the amended spec while it is uncommitted, the two plans and `relic-final-form-step.png`); then `<n>	0	data/glossary.json`. No book image is in the repo.

- [ ] **Step 4: Commit the data**

```bash
wsl -e bash -c 'cd /root/projects/QK-Wrath-and-Glory && [ "$(/usr/bin/git branch --show-current)" = vehicles ] && /usr/bin/git add data/vehicles.json data/glossary.json scripts/test-vehicles.js && /usr/bin/git commit -q --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Add the Church of Steel vehicles data and the vehicle glossary sections (#28)" && /usr/bin/git log --oneline -3' 2>&1 | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
```

When `scripts/test-vehicles.js` did not change after its last commit, git adds nothing for it.

- [ ] **Step 5: Dispatch the whole-wave review**

Dispatch a `general-purpose` agent on `model: fable` (user CLAUDE.md §4) with this brief:

> You review Part 1 of the vehicles feature: the commits on the `vehicles` branch (`/usr/bin/git log --oneline main..vehicles` in `/root/projects/QK-Wrath-and-Glory`, run through `wsl -e bash -c '…'`). Check them against the spec `docs/superpowers/specs/2026-10-20-vehicles-design.md` (§2, the data half of §3, §6, the test of §7, Appendices A and B) and the plan `docs/superpowers/plans/2026-10-21-vehicles-part1-data.md`. Read `scripts/test-vehicles.js`, and read `data/vehicles.json` and `data/glossary.json` only with `grep` and `node` one-liners. In the work folder `/root/projects/.QK-Wrath-and-Glory-reference/work/vehicles`, read `build/build-report.txt`, `build/extraction-triage.md`, `build/triage-log.md` and `build/fix-log.md`. Change no file. Report one line per finding: `- <Critical | Important | Minor> | <file, id or key> | <finding> | <evidence>`.

- [ ] **Step 6: Fix the accepted findings, commit, and re-review**

1. Copy each finding into `build/wave-review.md` (start it with the line `# Wave review`). Add the decision after each finding: `ACCEPTED` or `REJECTED: <reason>`.
2. Fix each accepted data finding through Task 1.14 Steps 2 and 3: fix the fragment, rebuild and retest. Fix an accepted finding in the test directly, and run the test again. Add the fix after the finding's decision.
3. Commit the work folder, then the repo. Skip a command when its repo has no change.

```bash
wsl -e bash -c 'cd /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles && /usr/bin/git add fragments build && /usr/bin/git commit -q --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Fix the whole-wave review findings in the fragments" && /usr/bin/git log --oneline -1' 2>&1 | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
```

```bash
wsl -e bash -c 'cd /root/projects/QK-Wrath-and-Glory && [ "$(/usr/bin/git branch --show-current)" = vehicles ] && /usr/bin/git add data/vehicles.json data/glossary.json scripts/test-vehicles.js && /usr/bin/git commit -q --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Fix the whole-wave review findings in the vehicles data" && /usr/bin/git log --oneline -1' 2>&1 | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
```

4. Dispatch a `reviewer` agent for the scoped re-review, with this brief:

> You re-review the fixes for the whole-wave review of the vehicles data. You change no file. The findings list is `build/wave-review.md` in the work folder `/root/projects/.QK-Wrath-and-Glory-reference/work/vehicles`; each line holds a finding, its decision and its fix. For each ACCEPTED line, confirm the fix in `data/vehicles.json`, `data/glossary.json` or `scripts/test-vehicles.js` of `/root/projects/QK-Wrath-and-Glory`. For a data fix, also confirm it on the page image (`renders/p-NNN.png`, printed with `wsl -e bash -c 'cd <work folder> && node build/show.js vehicle <id>'`); never use `pdftotext`. For each REJECTED line, confirm the reason. Report one line per disagreement: `- <finding> | <what is wrong>`. End with `Re-reviewed <N> findings, <M> disagreements.`

5. Send each disagreement back through items 2 to 4 of this step. The step ends when the re-review reports `0 disagreements`.

- [ ] **Step 7: Delete the renders**

The renders stay until Step 6 ends, because its fixes open the pages.

```bash
wsl -e bash -c 'rm -rf /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles/renders && find /root/projects/.QK-Wrath-and-Glory-reference/work/vehicles /root/projects/QK-Wrath-and-Glory \( -name "p-[0-9][0-9][0-9].png" -o -name "p[0-9][0-9][0-9]-*.png" \) | wc -l'
```

Expected: `0`. The fragments, the build script and the logs stay in the work folder for a later round.

- [ ] **Step 8: Report to the user**

Report these items:

- the commits on the branch (`/usr/bin/git log --oneline main..vehicles`) and `All checks passed.`;
- the profile families (`sed -n "/PROFILE FAMILIES/,/KEYS RESOLVED BELOW/p" build/build-report.txt`) and the map overrides (`grep -A20 "^MAP OVERRIDES" build/build-report.txt`);
- the weapon and wargear lines accepted as text only (`sed -n "/KEYS ACCEPTED AS TEXT ONLY/,/^UNUSED/p" build/build-report.txt`);
- each OPEN line of `build/fix-log.md`, and each item that Task 1.11 left for the user;
- that nothing is pushed, and that the merge of `vehicles` into `main` and the push are the user's decision;
- that Part 2 can start on the branch.
