# Bug Pass of the Bestiary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each load of the bestiary checks the shape of its data and repairs it; the autosave follows each load and each removal; each number input accepts only its declared range; the builder never changes a threat that the encounter already uses; and each render escapes each value from a threat, an entry, a file or an input.

**Architecture:** A new global object `BestiaryCheck` (`bestiary/js/bestiary-check.js`) holds the field rules, the load clamp, the number input rule and a compare of two threat records. The six load entry points test the top level and call it. The autosave writers remove the key for an empty state and write at once after a file load. The render files `threats-tab.js`, `threat-builder-tab.js` and `encounter-tab.js` escape each value. A browser script proves the result against the base tree.

**Tech Stack:** Vanilla JS, global-object modules, no build step. Unit tests are plain Node scripts that load the browser files into a `vm` context. One browser script uses Playwright (headless Chromium).

**Spec:** `docs/superpowers/specs/2026-11-15-bug-pass-bestiary-design.md`. Read it before each task. The field rules are in spec §4.3-§4.6. The stored-key table is spec §5.3. The input table is spec §6.2. The site groups are spec §8.5.

Line numbers in this plan are at the base `44084ae`. An earlier task can move them. Find each site by its function name.

## Global Constraints

- Follow `CLAUDE.md` and `STYLE_GUIDE.md` of the repo: vanilla JS, one `const` global object per file, no ES modules, no classes, no IIFEs, no build step.
- Write all prose (code comments, commit messages) in ASD-STE100 Simplified Technical English: short sentences, active voice, no contractions.
- Author each commit `--author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>"`. No attribution line and no co-author line.
- Change no file under `creator/`, `shared/` or `data/`.
- All 19 existing test scripts and each new `scripts/test-bestiary-*.js` stay green. Run: `for f in scripts/test-*.js; do node "$f" > "$LOGDIR/$(basename "$f").log" 2>&1 || echo "FAIL $f"; done; echo done`, with `LOGDIR` a scratch folder that the controller gives. Read only the `FAIL` lines and the last lines of a failing log.
- No browser window on the owner's desktop. Each browser run is `headless: true`. A headed run is only `env -u WAYLAND_DISPLAY xvfb-run -a node <script>`. The browser script starts its own static server on `PORT` (default `8172`). Never use port 8137.
- Browser command: `PROOF_TMP="$PROOF_TMP" PW=/root/.npm/_npx/705bc6b22212b352/node_modules/playwright node scripts/browser-bestiary.js <mode>`, with `PROOF_TMP` a scratch folder that the controller gives (never `/tmp` itself). Each `… browser-bestiary.js` command below means this full command. Send the output to a log file and read the `FAIL` lines and the summary line.
- G1 has the highest priority: a correction never changes a stored value at load, except the named exceptions E1-E5 (spec §4.8). Do not add a range limit that spec §6 does not give.
- No `try`/`catch` around a load. A load tests the shape first (spec §4.2).
- No new UI beyond spec §10.
- Escape rule (spec §8.4): each interpolation of a value from a threat record, an encounter entry, a file or an input gets the escape of its context, also when the check makes it a number. Constants, loop indexes, glossary keys, values that code computes, and shipped data found by a lookup need none.
- Cache busting: Task 1 bumps `?v=96` to `?v=97` on all 16 tags of `bestiary/index.html` and adds the new tag (17 tags). The later tasks do not bump again: the branch ships as one deploy. `creator/js/web-api.js` stays (no data change).

## Review Focus

1. **A save from the real writers.** An encounter and a threat built through the real state functions load with no change and no warning (Task 1, Task 3). Watch for a rule that treats a legal shipped shape as wrong (`shock: '-'`, a `mobAbilities` list, a `tierThreat` with four tiers, an absent `quote`).
2. **The start writes nothing.** After a restore, the stored autosave string is the same, also when the check repairs or refuses it (Task 3).
3. **No render deletes a player.** A count below the number of players keeps each player (Task 5a).
4. **The shipped DOM is unchanged.** `browser-bestiary.js --compare` shows differences only for the 11 threats of B6 (Tasks 6-9).
5. **An id with a quote still works.** An entry whose id holds `"` can still be selected and removed after its `data-id` is escaped (Task 8, browser hostile run).
6. **C8 after a reload.** The first entry keeps wounds 5 (Task 4).
7. **The ownership of a stored key (CB1).** A page that never wrote or restored a key never removes it: not by an empty change, not by Clear, not by a file load (Tasks 3, 4; browser `twotabs`).

---

### Task 1: The `BestiaryCheck` module and the cache bump

Suggested dispatch: `implementer` with `model: opus` (a design choice for each field inside one new module).

**Files:**
- Create: `bestiary/js/bestiary-check.js`
- Modify: `bestiary/index.html:12-13`, `:396-409` (16 tags to `?v=97`; one new tag)
- Test: `scripts/test-bestiary-check.js` (new)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces (no caller in this task):
  - Constants: `PLAYER_COUNT_MIN = 1`, `PLAYER_COUNT_MAX = 10`, `TIER_MIN = 1`, `TIER_MAX = 5`, `ADD_COUNT_MAX = 20`, `INITIATIVE_MAX = 99`.
  - `isPlainObject(value) -> boolean`: `value !== null && typeof value === 'object' && !Array.isArray(value)`.
  - `repairThreat(threat, prefix) -> string[]`: changes a plain-object threat in place by spec §4.3 and §4.5. It does not read or change `id`. Paths start with `prefix` (for example `customThreats[0].keywords[1]`). With `prefix === ''` the paths have no prefix (for example `skills`).
  - `repairCustomThreatList(owner, key, prefix) -> string[]`: makes `owner[key]` an array (absent stays absent); drops each entry that is not a plain object, whose `id` is not a string that starts with `custom_`, or whose `id` came before in the list; calls `repairThreat` on each kept entry. A path uses the index in the original list.
  - `repairEncounter(data) -> string[]`: changes a plain-object encounter in place by spec §4.3 and §4.4, including E1 (clamp), E3 (dangling `mobId`) and the `customThreats` list through `repairCustomThreatList(data, 'customThreats', 'customThreats')`. It does not compute max wounds (E2 is in Task 3). Paths in table order of spec §4.4.
  - `repairPlayers(data) -> string[]`: spec §4.6, players file table.
  - `readIntegerInput(input) -> number | null`: spec §6.2. Reads `input.value`, `input.min`, `input.max`.
  - `sameThreatData(a, b) -> boolean`: equal when the two records, without `id`, give the same JSON with sorted keys at each level.
  - `index.html`: `<script src="js/bestiary-check.js?v=97"></script>` directly after the `js/data-loader.js` tag.

- [ ] **Step 1: Write the test harness and the no-op corpus in `scripts/test-bestiary-check.js`**

Use the sandbox pattern of `scripts/test-encounter-vehicles.js:13-44` (`check`, a `store` behind `localStorage`, no-op timers). Load, in this order: `bestiary/js/data-loader.js`, `bestiary/js/bestiary-check.js`, `bestiary/js/encounter-state.js`, `bestiary/js/threat-builder-state.js`. Add a global `App = { updateThreatCount() {} }`. Fill `DataLoader.cache` with `data/threats.json`, `data/vehicles.json` and `data/threat-weapons.json`. The sandbox `console.warn` records each call in `warns`.

`buildEncounterCorpus()` builds one encounter through the real writers only (exact calls):

```js
function buildEncounterCorpus() {
    EncounterState.clearEncounter();
    EncounterState.updateSettings({ tier: 3, playerCount: 5, name: 'Gate "7" & <Co>' });
    EncounterState.incrementRound(); EncounterState.incrementRound();
    const [a] = EncounterState.addIndividual('sly_marbo_aaa', 1);
    EncounterState.updateBonus(a, 'adversary');
    EncounterState.updateWounds(a, 3); EncounterState.updateShock(a, 1);
    EncounterState.setInitiative(a, '12');
    EncounterState.updateIndividualNotes(a, 'HP &lt;5 </textarea> "q"');
    EncounterState.setAdditionalWeapon(a, 'gone_weapon');
    const [champ] = EncounterState.addIndividual('tactical_space_marine', 1);
    EncounterState.updatePersonalRuin(champ, 2);
    const [mob] = EncounterState.addIndividual('astra_militarum_trooper', 4, true);
    EncounterState.setMobInitiative(mob, '7'); EncounterState.updateMobNotes(mob, 'n & m');
    EncounterState.splitOffFromMob(mob, 2);
    const p = EncounterState.addPlayerCharacter('Bob "Big" Smith');
    EncounterState.setPlayerCharacterInitiative(p, '15');
    EncounterState.updatePlayerCharacterNotes(p, '&amp;');
    const v = EncounterState.addVehicle('chimera');
    EncounterState.updateVehicleWounds(v, 2); EncounterState.setVehicleInitiative(v, '3');
    EncounterState.moveItemInOrder('player', p, 0);
    ThreatBuilderState.loadTemplate('fire_warrior');           // list-shaped mobAbilities and mobOptions
    ThreatBuilderState.updateField('name', 'Custom FW');
    ThreatBuilderState.injectIntoEncounter(2);
    ThreatBuilderState.clear();
    ThreatBuilderState.updateField('name', 'Scratch');
    ThreatBuilderState.addAbility({ type: 'ACTION', name: 'Hit', description: 'd', stats: 's' });
    ThreatBuilderState.addBonus({ name: 'B', description: 'd' });
    ThreatBuilderState.addKeyword('ork');
    ThreatBuilderState.updateField('shock', '-');
    ThreatBuilderState.addSkillEntry('Athletics', 3);
    ThreatBuilderState.injectIntoEncounter(1);
    return JSON.parse(JSON.stringify(EncounterState.getEncounterData()));
}
```

`OLD_SHAPES()` is the corpus with these keys deleted: `settings.round`, `vehicles`, `encounterOrder`, `customThreats`, and `personalRuin` and `additionalWeaponId` of each individual (spec §4.4 marks each one optional).

- [ ] **Step 2: Write the no-op checks**

```js
{ const saved = buildEncounterCorpus(); const copy = rt(saved);
  check('no-op: the writer corpus repairs nothing', BestiaryCheck.repairEncounter(copy), []);
  check('no-op: the writer corpus stays deep-equal', copy, saved); }
{ const old = OLD_SHAPES(); const copy = rt(old);
  check('no-op: old shapes repair nothing', BestiaryCheck.repairEncounter(copy), []);
  check('no-op: old shapes stay deep-equal', copy, old); }
// each shipped record, and each shipped record as a builder template
let bad = [];
for (const t of readJson('data/threats.json')) {
    const c = rt(t); if (BestiaryCheck.repairThreat(c, '').length || JSON.stringify(c) !== JSON.stringify(t)) bad.push(t.id);
    ThreatBuilderState.loadTemplate(t.id); const d = ThreatBuilderState.getThreatData(); const e = rt(d);
    if (BestiaryCheck.repairThreat(e, '').length || JSON.stringify(e) !== JSON.stringify(d)) bad.push('template:' + t.id);
}
check('no-op: the 844 shipped threats and their templates repair nothing', bad, []);
{ ThreatBuilderState.clear(); const d = ThreatBuilderState.getThreatData();
  check('no-op: a new builder threat repairs nothing', BestiaryCheck.repairThreat(rt(d), ''), []); }
```

`rt = v => JSON.parse(JSON.stringify(v))`.

- [ ] **Step 3: Write the repair checks**

One table, one check each: `[name, makeData, repairFn, expectedPaths, expectedValueAtPath]`. `base()` is `rt(saved)` of Step 2. The exact cases:

| Name | Data change | Expected paths | Expected value |
|---|---|---|---|
| settings not an object | `settings = 5` | `['settings']` | the default object of spec §4.4 |
| tier string | `settings.tier = '3'` | `['settings.tier']` | `1` |
| playerCount null (C6 defect) | `settings.playerCount = null` | `['settings.playerCount']` | `4` |
| playerCount 300000 (E1) | `300000` | `['settings.playerCount']` | `10` |
| playerCount 0 (E1) | `0` | `['settings.playerCount']` | `1` |
| playerCount 2.5 | `2.5` | `['settings.playerCount']` | `4` |
| individuals object | `individuals = {}` | `['individuals']` | `[]` |
| individual not an object | `individuals[0] = 5` | `['individuals[0]']` | entry gone, length one less |
| individual id number | `individuals[0].id = 5` | `['individuals[0]']` | entry gone |
| bonus unknown | `individuals[0].bonus = 'x'` | `['individuals[0].bonus']` | `'none'` |
| currentWounds string | `'3'` | `['individuals[0].currentWounds']` | `0` |
| maxWounds string | `'x'` | `['individuals[0].maxWounds']` | `null` |
| maxWounds null (legal) | `null` | `[]` | `null` |
| dangling mobId (E3) | `individuals[0].mobId = 'nomob'` | `['individuals[0].mobId']` | `null` |
| member of a dropped mob (P9) | `mobs[0].id = 5` (its two members, `individuals[4]` and `individuals[5]`, keep the old mob id) | `['individuals[4].mobId', 'individuals[5].mobId', 'mobs[0]']` (table order; the check repairs `mobs` first but reports the paths in table order) | each member's `mobId` is `null` |
| currentWounds null (C6 defect, E4) | `individuals[0].currentWounds = null` | `['individuals[0].currentWounds']` | `0` |
| initiative string | `'x'` | `['individuals[0].initiative']` | `null` |
| notes number | `5` | `['individuals[0].notes']` | `''` |
| mob name number | `mobs[0].name = 5` | `['mobs[0].name']` | `'Mob'` |
| player name object | `playerCharacters[0].name = {}` | `['playerCharacters[0].name']` | `'Player'` |
| vehicle wounds string | `vehicles[0].wounds = 'x'` | `['vehicles[0].wounds']` | `0` |
| vehicle with no vehicleId | `delete vehicles[0].vehicleId` | `['vehicles[0]']` | entry gone |
| encounterOrder string | `'x'` | `['encounterOrder']` | `null` |
| customThreats object | `customThreats = {}` | `['customThreats']` | `[]` |
| C11 shipped id | `customThreats[0].id = 'sly_marbo_aaa'` | `['customThreats[0]']` | entry gone |
| repeated id | `customThreats.push(rt(customThreats[0]))` | `['customThreats[2]']` | length 2 |

Threat cases use `t = rt(DataLoader.getThreat('fire_warrior'))` and `repairThreat(t, '')`:

| Data change | Expected paths | Expected value |
|---|---|---|
| `delete t.name` | `['name']` | `''` |
| `t.source = 5` | `['source']` | `'Custom'` |
| `t.page = '3'` | `['page']` | `null` |
| `t.tierThreat = 'x'` | `['tierThreat']` | the default of spec §4.5 |
| `t.tierThreat['2'] = 5` | `['tierThreat.2']` | `'-'` |
| `t.keywords = [5, 'ORK']` | `['keywords[0]']` | `['ORK']` |
| `t.attributes.S = '<b>'` | `['attributes.S']` | `1` |
| `t.shock = {}` | `['shock']` | `1` |
| `t.conviction = []` | `['conviction']` | `0` |
| `t.abilities = [5]` | `['abilities[0]']` | `[]` |
| `t.abilities[0].type = 5` | `['abilities[0].type']` | `'ABILITY'` |
| `t.mobAbilities = [5, { name: 5, description: 'd' }]` | `['mobAbilities[0]', 'mobAbilities[1].name']` | `[{ name: '', description: 'd' }]` |
| `t.skills = 5` | `['skills']` | `''` |
| `t.mobActions = 'kept'` (unknown key) | `[]` | `'kept'` |

Players cases (`repairPlayers`): `{ playerCount: '3', players: [] }` gives `['playerCount']` and no `playerCount` key; `{ playerCount: 50 }` gives `10`; `{ players: [5, { name: 'A', notes: 5 }, { name: 7 }] }` gives `['players[0]', 'players[1].notes', 'players[2].name']` and `[{ name: 'A', notes: '' }, { name: 'Player' }]`.

- [ ] **Step 4: Write the input, compare and constant checks**

- `readIntegerInput` with `{ value, min, max }`: `('5','1','10') → 5`, `('','1','10') → null`, `('0','1','10') → null`, `('11','1','10') → null`, `('2.5','1','10') → null`, `('abc','0','99') → null`, `(' 7 ','0','99') → 7`, `('-3','0','') → null`, `('-3','','') → -3`, `('100','0','') → 100`.
- `sameThreatData`: a record and a copy with its keys in reverse order → `true`; a copy with another `id` → `true`; a copy with `wounds + 1` → `false`; a copy with a nested key order changed (`attributes`) → `true`.
- Constants against the declared limits (read the files as text): `index.html` `id="encounter-players"` has `min="1" max="10"`; `id="builder-inject-count"` has `max="20"`; `threats-tab.js` `id="threat-add-quantity"` has `max="20"`; `threat-builder-tab.js` `id="inject-modal-count"` has `max="20"`; `encounter-tab.js` has 7 `min="0" max="99"`; `#encounter-tier` has 5 options with values 1-5.
- Cache: `index.html` has 17 `?v=97`, 0 `?v=96`; the `bestiary-check.js` tag comes after `data-loader.js` and before `encounter-state.js`.

- [ ] **Step 5: Run the test to see it fail**

Run: `node scripts/test-bestiary-check.js 2>&1 | tail -3`. Expected: an error because `bestiary/js/bestiary-check.js` does not exist.

- [ ] **Step 6: Write `bestiary/js/bestiary-check.js` and change `index.html`**

Implement the interfaces above. `repairEncounter` repairs `mobs` before it tests each `mobId`, so a member of a dropped mob gets `null` (P9). Order of the methods: constants, `isPlainObject`, `repairEncounter`, `repairCustomThreatList`, `repairThreat`, `repairPlayers`, `readIntegerInput`, `sameThreatData`. Each default comes from a new literal at each use, so no two fields share one object. Do not trim or change a string. Bump the 16 tags and add the new tag.

- [ ] **Step 7: Run the test to see it pass**

Run: `node scripts/test-bestiary-check.js 2>&1 | tail -1`. Expected: `All checks passed`.

- [ ] **Step 8: Mutation proof**

| Mutation of the product code | Expected |
|---|---|
| In `repairThreat`, treat a string `shock` as a wrong type. | `no-op: the 844 shipped threats …` FAILS |
| In `repairEncounter`, remove the E1 clamp. | `playerCount 300000 (E1)` and `playerCount 0 (E1)` FAIL |
| In `repairCustomThreatList`, remove the `custom_` test. | `C11 shipped id` FAILS |
| In `readIntegerInput`, ignore `max`. | the `('11','1','10')` check FAILS |

Restore each mutation. Record the four results in the commit body, one line each.

- [ ] **Step 9: Run all test scripts**

Run the command of the Global Constraints. Expected: no `FAIL` line, then `done`.

- [ ] **Step 10: Commit**

```bash
git add bestiary/js/bestiary-check.js bestiary/index.html scripts/test-bestiary-check.js
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Add the BestiaryCheck module and bump the bestiary cache

The new module holds the field rules for a loaded encounter, a custom
threat and a player file, the number input rule and a compare of two
threat records. No code calls it yet. All tags go to v=97.
<four mutation-proof lines>"
```

---

### Task 2: The browser proof script and the DOM baseline

Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Create: `scripts/browser-bestiary.js`

**Interfaces:**
- Consumes: Task 1 (the page loads `bestiary-check.js`; no code calls it).
- Produces: the script, and a baseline file outside the repo at the path `$BASELINE` that the controller gives. Tasks 3-9 run its scenarios. The wave gate runs `--compare "$BASELINE"`.

**[Design agent]** The script is not named `test-*.js`, because it needs Playwright and the loop of the Global Constraints runs without it.

- [ ] **Step 1: Write the frame of the script**

- Header comment: purpose, the run command, `PW` and `PORT`.
- It refuses `PORT === '8137'` with exit code 1.
- It starts `http.createServer` on `127.0.0.1:PORT` (default `8172`). The server serves the files of the repo root with a content type for `.html`, `.js`, `.css`, `.json`, `.png`, `.svg`, `.ico`, `.woff2`. It closes the server and the browser at the end, also after a failure.
- `chromium.launch({ headless: true })`. Each scenario gets a new context (an empty `localStorage`), a viewport of 1400 × 900 (or 390 × 844 for a mobile run), `page.on('dialog', d => d.accept())`, and lists of page errors and of `console.warn` texts.
- Fixture files go into `fs.mkdtempSync(path.join(process.env.PROOF_TMP, 'bestiary-proof-'))`, which the script removes at the end. `PROOF_TMP` is required: when it is absent or empty, the script prints `FAIL  PROOF_TMP is not set` and exits with code 1. It never falls back to `os.tmpdir()` (P14). Each browser command of this plan sets it (Global Constraints).
- Each scenario runs inside its own boundary: a `try`/`catch` around the scenario prints `FAIL  <scenario>: threw <message>`, counts one failure, closes the context and goes on to the next scenario (P14). This boundary is in the test script only, never in product code.
- `open(page)` waits at most 60 s for the start (P14): at the base tree, a stored count of 300000 blocks the page for about 35 s.
- `check(name, actual, expected)` prints `PASS  name` or `FAIL  name` with the two values, as `scripts/test-encounter-vehicles.js:16-20`. The summary is `All checks passed` or `N check(s) failed`; the exit code is 1 on a failure.
- Helpers copied from the audit pattern: `P(f)` returns ``${f}" data-pwn="${f}"></textarea><img src=x data-pwnimg="${f}" onerror="(window.__hits=window.__hits||[]).push('${f}')">``; `hits(page)` returns `{ js, attr, img }` (the `__hits` list, the `data-pwn` values of elements, the `data-pwnimg` values of elements); `pickFile(page, selector, filePath)` clicks the button and sets the file in the file chooser.
- `open(page)` goes to `/bestiary/` and waits (at most 60 s) until `#threat-list .threat-list-item` has more than 800 elements.
- Modes: `--snapshot FILE`, `--compare FILE`, else the scenarios. `--only NAME` runs the scenarios whose name starts with `NAME`.

- [ ] **Step 2: Write the snapshot and compare modes**

In one fresh page at 1400 × 900, in this order (the pickers first, before any other threat is in the cache):

- `picker:ability` and `picker:bonus`: set the `innerHTML` of a new `div` to `ThreatBuilderTab.renderAbilityPickerItems('ALL', '')` and to `renderBonusPickerItems('')`, and read it back.
- `list`: `ThreatsTab.renderThreatList()`, then `#threat-list` `innerHTML`.
- For each shipped id in sorted order: `card:<id>` (`ThreatsTab.renderThreatDetail(id)`, then `#threat-detail` `innerHTML`); `mini:<id>` (a new `div` gets `EncounterTab.renderThreatCardMini(DataLoader.getThreat(id))`, then `Glossary.enhanceDescriptions(div)`, then its `innerHTML`); `preview:<id>` (`ThreatBuilderState.loadTemplate(id)`, `ThreatBuilderTab.renderPreview()`, then `#builder-preview-content` `innerHTML`); `copy:<id>` (`ThreatsTab.buildThreatCopyText(DataLoader.getThreat(id))`).

Fold the HTML with `s.replace(/\s+/g, ' ').replace(/> </g, '><').trim()`. Do the work in chunks of 50 ids for each `page.evaluate`.

`--snapshot FILE` writes `{ version: 1, entries: { key: html } }`. `--compare FILE` builds the same map and checks:

- `dom: each baseline key is present` (no key missing).
- `dom: no unexpected difference`: each differing key is a `card:` or `mini:` key of the 11 B6 ids (spec §9). On a failure, print at most 10 keys, each with 160 characters around the first difference.

- [ ] **Step 3: Write the scenarios**

Fixtures (exact):

- `hostileThreat(prefix, id)`: the object of the audit pattern, that is a string field `P(prefix + field)` for `name`, `source`, `quote`, `attribution`, `description` (the text `'Shock ' + P(...)`, so that a glossary term is in it), `defenceNote`, `speedNote`, `determination`, `size`, `skills` (`'Default 4, ' + P(...) + ' 5'`), `mobOptions`, `threatOptions`, `biomorphs`; `page: P(...)`; `tierThreat: { '1': 'T', '2': P(...), '3': '-', '4': '-', '5': '-' }`; `keywords: [P(...), 'ORK']`; `attributes: { S: P(...), T: 3, A: 3, I: 3, Wil: 3, Int: 3, Fel: 3 }`; `resilience: { value: P(...), note: P(...) }`; `defence: P(...)`, `wounds: 5`, `shock: 4`, `conviction: P(...)`, `resolve: P(...)`, `speed: P(...)`; two abilities (`{ type: 'ACTION', name: P, description: P, stats: P }`, `{ type: P, name: 'X', description: 'y' }`; the first one has a type of `ABILITY_TYPES`, so the `ALL` picker shows it); `bonuses: [{ name: P, description: P }]`; `mobAbilities: [{ name: P, description: P }]`.
- `hostile.encounter`: `settings.name: P('E_sname')`; individual `P('E_i1')` (free, `bonus: P('E_bonus')`, `notes: P('E_inotes')`, `additionalWeaponId: P('E_wpn')`); individuals `P('E_i2')` and `P('E_i3')` in mob `P('E_m1')` (`name: P('E_mname')`, `notes: P('E_mnotes')`); player `{ id: P('E_p1'), name: P('E_pcname'), initiative: 5, notes: P('E_pcnotes') }`; vehicle `{ id: P('E_v1'), vehicleId: 'chimera', wounds: 0, initiative: null }`; `customThreats: [hostileThreat('E_', 'custom_' + P('E_tid'))]`; each individual and the mob use that threat id.
- `hostile.threat`: `hostileThreat('T_', P('T_id'))`. `hostile.players`: `{ version: 1, playerCount: 3, players: [{ name: P('L_name'), notes: P('L_notes') }] }`.

Each `hostile` check expects `{ js: [], attr: [], img: [] }`.

| Scenario | Steps | Check names |
|---|---|---|
| `hostile-desktop` | Encounter tab, Load Encounter `hostile.encounter`; click the row of each type (`.encounter-item[data-type=…]`); Threats tab; click the row of the hostile threat; hover the first `.glossary-term` in `.threat-card-description`, wait 400 ms, click it; call `ThreatsTab.buildThreatCopyText` for it; click `#btn-customize-threat`; click `#btn-browse-abilities`, close it; click `#btn-browse-bonuses`, close it; `ThreatBuilderTab.renderTemplateDropdown('E_', 'sidebar')`; `ThreatBuilderTab.showInjectModal(ThreatBuilderState.threat.name, 2)`, close it; Load (`#btn-builder-load`) `hostile.threat`; Encounter tab, Import Threat `hostile.threat`; Load Players `hostile.players`; wait 2.5 s and reload; click each row type again | `hostile desktop <step>: no script, no injected element, no attribute break` for each step; `hostile desktop: no page error`; `hostile desktop: the free individual can be removed by its button` (click its `.delete-btn`, the count goes down by one) |
| `hostile-mobile` | 390 × 844. Put `{ encounter: <hostile.encounter data>, customThreats: [<its threat>], timestamp: 1 }` into `wng-bestiary-autosave`, reload; click each row type (the bottom sheet opens); `App.switchTab('threats')`, click the hostile row; `#btn-customize-threat`; click `#btn-builder-preview` | as above with `mobile` |
| `c2` | Encounter tab. Fill `.pc-name-input[data-index="0"]` with `Bob "Big" Smith`, press Tab; `EncounterTab.render()`; read the value. Fill it with `Bob "Big" Smith Jr`, press Tab; read `EncounterState.playerCharacters[0].name`. Wait 2.5 s, reload, read the value. | `c2: the name survives a redraw`, `c2: an edit stores the full name`, `c2: the name survives a reload` |
| `c3` | Add `sly_marbo_aaa` once and a mob of 2 `astra_militarum_trooper`, and one player. For each of `#individual-notes`, `#mob-notes`, `#player-notes`: select the row, fill `\nHP &lt;5 &amp; </textarea> x` (it starts with a line break, P5), select the row again, read the box; press `Control+End` (Q2: a plain `End` puts the cursor at the end of the first, empty line), type `!`, read the stored notes. Wait 2.5 s, reload, read the three stored notes. Builder: fill the description box (`textarea[data-field="description"]`) with `\nfirst line`, call `ThreatBuilderTab.renderEditor()`, read the box. | `c3: <kind> notes survive a redraw`, `c3: <kind> notes survive an edit` (the stored value is the typed value plus `!`, with the leading line break), `c3: the notes survive a reload`, `c3: a builder description keeps its leading line break` |
| `c4` | Add `sly_marbo_aaa`, wait 2.5 s. Load Encounter B: `{ version: 1, settings: { tier: 2, playerCount: 3, name: 'B', round: 4 }, individuals: [], mobs: [], playerCharacters: [{ id: 'p1', name: 'Bravo', initiative: null, notes: '' }], vehicles: [], encounterOrder: null, customThreats: [] }`. Reload at once. | `c4: a loaded file survives an immediate reload` (`{ ind: 0, pc: ['Bravo'], round: 4 }`) |
| `c5` | Add `sly_marbo_aaa`, wait 2.5 s, click its `.delete-btn`, reload at once (CB2: no wait). Builder: fill `[data-field="name"]` `X`, wait 2.5 s, fill it with `''`, reload at once. | `c5: a removed last threat stays removed`, `c5: the encounter key is gone`, `c5: a builder made pristine stays empty`, `c5: the builder key is gone` |
| `twotabs` | Two pages A and B in one context (one `localStorage`), both opened on an empty store (CB1). A: add `sly_marbo_aaa`; builder name `A1`; wait 2.5 s. B: change the tier select to 2, click `#btn-round-plus`, click `#btn-sort-initiative`; builder: fill the name `Z`, then `''`; click the encounter Clear and the builder Clear (the dialogs are accepted); wait 2.5 s. Read both keys. | `twotabs: the encounter key of tab A stays`, `twotabs: the builder key of tab A stays` |
| `gates` | Encounter tab: Load Encounter with `hostile.threat`; then with `hostile.players`. Load Players with `hostile.encounter`. Builder: Load with `hostile.encounter` last (Q6: after Task 3 alone, this load can still change the builder string within 2 s). Before the four loads, add `sly_marbo_aaa` and a builder name `G`, wait 2.5 s, and keep both stored strings. (CB3) | `gates: a threat file in Load Encounter shows the error and changes nothing`, `gates: a players file in Load Encounter …`, `gates: an encounter file in the builder Load …`, `gates: an encounter file in Load Players …` (each: the notification text, the state and both stored strings are unchanged) |
| `names` | Load Encounter with a custom threat `{ id: 'custom_names', name: 'A & "B" <C>', abilities: [{ type: 'ACTION', name: 'Names hit', description: 'd' }], tierThreat: { '1': 'T', '2': 'T', '3': '-', '4': '-', '5': '-' }, wounds: 3 }`, one free individual and a mob of two of it (mob name `A & "B" <C> Mob`) (CB7, P15). | `names: <view> reads back as typed` (`textContent`, or `.value` for an input; the expected value is the stored string) for each view: `.threat-list-name`, `.threat-card-title`, the encounter rows `.encounter-item-name` (individual and mob), the individual detail `h3`, the mob detail `h3`, the member `.member-name`, the builder name input after Customize, the preview `.threat-card-title`, the template search item, the ability picker `.ability-picker-item-threat` of `Names hit`, and the input `#inject-modal-name` after `ThreatBuilderTab.showInjectModal(ThreatBuilderState.threat.name, 1)` |
| `c6` | Add `sly_marbo_aaa` and set its bonus to Adversary. Fill `#encounter-players` with `''`, press Tab. Add two players by name. Fill `0`, press Tab. | `c6: an empty Players box keeps the count` (`{ count: 4, box: '4' }`), `c6: max wounds stay finite` (the value is `wounds + 4 + 1`), `c6: Players 0 keeps both players` |
| `c7` | Fill `#encounter-players` with `20000`, press Tab. Threats tab, open `sly_marbo_aaa`, fill `#threat-add-quantity` with `20000`, click `#threat-add-to-encounter-btn`. Builder: name `Q`, fill `#builder-inject-count` with `25`, click `#btn-builder-inject`. New context: put an autosave with one individual and `playerCount: 300000`, reload, time until `#encounter-list .encounter-item` shows. | `c7: Players 20000 is refused` (count 4, 4 rows), `c7: quantity 20000 adds nothing` (and the box shows `1`), `c7: inject count 25 adds nothing and the box shows 1` (Q4), `c7: a stored count of 300000 starts in under 5 s`, `c7: the stored count loads as 10`, `c7: one warning names settings.playerCount` |
| `c8` | Builder: name `C8 Test`, fill `[data-field="wounds"]` with `5`, click `#btn-builder-inject`. Fill wounds `12`, wait 2.5 s, reload. Builder tab, click `#btn-builder-inject`; if `.inject-modal-overlay` shows, click `#inject-modal-add`. | `c8: each entry keeps its own wounds` (`[[5, 5], [12, 12]]` as `[threat wounds, maxWounds]`), `c8: the two entries have two threat ids` |
| `c9` | For each stored case, a new context: (a) encounter `{ encounter: <one valid individual>, customThreats: {} }` with builder `{ threat: { name: 'Kept' } }`; (b) `{ encounter: { individuals: {} } }`; (c) builder `{ threat: { id: 5, name: 'B5' } }`; (d) builder `{ threat: { skills: 5, name: 'S5' } }`; (e) encounter JSON `5`; (f) `"x"`; (g) `[]`. Reload, wait 3 s. | `c9 <case>: no page error`, `c9 <case>: the app starts` (the Threats list has more than 800 rows); (a) builder name `Kept`; (c) name `B5` and an id that starts with `custom_`; (e)-(g) a warning that starts with `The auto-save was not loaded` and the stored string is unchanged |
| `c10` | Autosave: individual `i1` (free) and `i2`, `i3` in mob `m1` (`name: 'M'`), all with `threatId: 'gone'`. Reload. Click the mob row. Click the `.delete-btn` of `i1`. | `c10: the free row shows Unknown threat (gone)`, `c10: the mob row shows M — Unknown threat (gone)` (passes after Task 8), `c10: selecting the mob gives no page error`, `c10: the unknown row can be removed` |
| `c11` | Load Encounter with `customThreats: [{ id: 'sly_marbo_aaa', name: 'NOT MARBO' }]` and one individual of `sly_marbo_aaa`. | `c11: the shipped threat keeps its name`, `c11: one warning names customThreats[0]` |
| `d1` | Fill player rows 0-2 with names, press Tab each. Fill `#encounter-players` with `2`, press Tab. Click the `×` of the marked row. | `d1: three rows stay`, `d1: one row has the mark Above player count`, `d1: three players stay stored`, `d1: the × of the marked row removes it and keeps the count 2` |
| `b6` | For each of the 11 ids of spec §9: open the card; render the mini card into a `div`. | `b6 <id>: the card shows each entry name and no [object Object]`, `b6 <id>: the mini card shows each entry name and no [object Object]` |
| `inputs` | Builder: fill `[data-field="attributes.S"]` with `-5`, read the stored `S`, press Tab, read the box; fill `[data-field="wounds"]` with `0`, read the stored wounds. Encounter: add `sly_marbo_aaa`, fill its `.initiative-input` with `12`, press Tab; then `150`, press Tab; then `''`, press Tab (P14). The four lines of Task 5b (player row initiative, player detail initiative, skill Default, skill entry). | `inputs: S -5 is not stored`, `inputs: the box shows the stored S`, `inputs: wounds 0 is not stored`, `inputs: initiative 150 keeps 12`, `inputs: an empty initiative clears it` (`null` after `12`), and the four lines named in Task 5b |

- [ ] **Step 4: Take the baseline and run the script on this tree**

Run: `… node scripts/browser-bestiary.js --snapshot "$BASELINE" > "$LOGDIR/snap.log" 2>&1; tail -1 "$LOGDIR/snap.log"`.
Run: `… --compare "$BASELINE"`. Expected: `All checks passed` (the same tree).
Run the scenarios. Expected at this tree: each scenario prints at least one `FAIL`. Record the number of `FAIL` lines for each scenario. This is the failing-test proof for Tasks 3-9. At this tree both lines of `twotabs` fail, because the Clear of tab B removes the keys of tab A.

- [ ] **Step 5: Commit**

```bash
git add scripts/browser-bestiary.js
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Add a browser proof script for the bestiary bug pass

The script compares the DOM of each shipped threat with a baseline and
runs one scenario for each finding. On this tree each scenario fails.
<one line per scenario: the number of FAIL lines>"
```

---

### Task 3: Encounter loads, the encounter autosave and the player file (C4, C5, C7 load, C9, C10 rows, C11, D2; CB1-CB3)

Suggested dispatch: `implementer` with `model: opus` (a load flow and an ownership rule that touch stored data).

**Files:**
- Modify: `bestiary/js/encounter-state.js:29-33` (new flag `_ownsAutoSave`), `:42-45` (`markDirty`), `:822` and `:846` (`getEncounterListItems`), `:975-996` (`loadEncounterFromFile`), `:999-1011` (`loadFromData`), `:1014-1023` (`clearEncounter`), `:1034-1046` (`_performAutoSave`), `:1065-1067` (`clearAutoSave`)
- Modify: `bestiary/js/app.js:237-256` (`checkAutoSave`, both parts)
- Modify: `bestiary/tabs/encounter-tab.js:2140-2171` (`handleLoadPlayers`)
- Test: `scripts/test-bestiary-load.js` (new)

**Interfaces:**
- Consumes: Task 1 (`isPlainObject`, `repairEncounter`, `repairCustomThreatList`, `repairPlayers`).
- Produces:
  - `EncounterState._ownsAutoSave` (spec §5.2): `false` at start; `true` after a write of the key and after a restore; `false` after `clearAutoSave()`.
  - `markDirty()`: spec §5.2 (an empty state after the change: cancel the timer, and `clearAutoSave()` at once).
  - `clearAutoSave()`: removes the key only when `_ownsAutoSave` is `true`, then sets it to `false`.
  - `_performAutoSave()`: an empty state writes nothing and removes nothing; a write sets `_ownsAutoSave = true`.
  - `clearEncounter()`: also `clearTimeout(this._autoSaveTimer)`.
  - `EncounterState.loadFromData(data, priorPaths = [])`: spec §4.6 steps 1-5. The caller has tested `data`.
  - `EncounterState.loadEncounterFromFile()`: the gate of spec §4.2 (a plain object with one of `settings`, `individuals`, `mobs`, `playerCharacters`, `vehicles`); on a failed gate it returns `{ success: false, error: 'Invalid encounter file' }` and changes nothing. After a load it writes at once (spec §5.2).
  - List names `Unknown threat (<id>)` and `<mob name> — Unknown threat (<id>)` (spec §4.7). Task 8 prints the mob name from `item.name`.
  - `App.checkAutoSave()`: the two gates of spec §4.2, applied only when the key holds a value. A restore that passed its gate sets `EncounterState._ownsAutoSave = true`. The builder part sets `ThreatBuilderState._ownsAutoSave = true` after `ThreatBuilderState.loadFromAutoSave(builderSave.threat)`; Task 4 adds that flag (until then, the assignment makes a plain property, which Task 4 then declares).
  - `handleLoadPlayers`: the gate of spec §4.2 (key `players`), and one `EncounterState.markDirty()` after it replaces the players (Q5).
  - Warning texts: `'The auto-save was not loaded: it does not contain an encounter.'`, `'The auto-save was not loaded: it does not contain a threat.'`, `'Encounter data was repaired on load: ' + paths.join(', ')`, `'Player data was repaired on load: ' + paths.join(', ')`.

- [ ] **Step 1: Write the harness in `scripts/test-bestiary-load.js`**

`makeApp(store)` returns `{ EncounterState, ThreatBuilderState, DataLoader, App, warns, flush }`. The sandbox: `console` with `warn` recorded in `warns`; `localStorage` over `store` (one plain object; two apps on one `store` are two tabs of one origin); `setTimeout` pushes the callback into a list and returns its index; `clearTimeout` removes it; `flush()` runs and empties the list; a `document` with `addEventListener() {}`, `getElementById` (a stable stub element for each id, with `classList`, `textContent`, `value`), `querySelectorAll: () => []`; `window = { innerWidth: 1400, api: {} }`; `history` and `location` stubs; and the tab stubs `EncounterTab`, `ThreatsTab`, `VehiclesTab`, `GlossaryTab`, `ReferencesTab`, `ThreatBuilderTab`, `SettingsTab` as `{ init() {}, refresh() {} }`. Load `data-loader.js`, `bestiary-check.js`, `encounter-state.js`, `threat-builder-state.js`, `js/app.js`. Fill the three caches as in Task 1. Copy `buildEncounterCorpus` from `scripts/test-bestiary-check.js`.

`makeTabApp(store)` is `makeApp` with the real `tabs/encounter-tab.js` instead of the `EncounterTab` stub, and the recording document of `scripts/test-tab-escapes.js:24-60` (add `focus() {}` and `select() {}` to its elements). It records the `textContent` of each element given to `document.body.appendChild` in `notes`.

- [ ] **Step 2: Write the failing checks**

1. `restore: the writer corpus loads with no change` — app 1 builds the corpus and calls `flush()`. Keep `before = store['wng-bestiary-autosave']`. App 2 on the same store calls `App.checkAutoSave()`. Check `rt(getEncounterData())` against the corpus, `warns` is `[]`, and after `flush()` the stored string is still `before`.
2. `restore: individuals {} does not throw`, `… gives []`, `… writes one warning that names individuals`, `… leaves the stored string unchanged`.
3. `restore: top-level customThreats {} does not stop the builder restore` — also store `wng-bestiary-builder-autosave` `{ threat: { name: 'Kept' } }`; after `checkAutoSave` the builder name is `Kept`.
4. `gate: an autosave of 5 is not loaded` — the stored text `5`: no throw, `warns` holds the encounter text of the Interfaces, the stored string is unchanged. The same for `[]` and for `{}` (no `encounter`).
5. `gate: a builder autosave whose threat is a string is not loaded` — `{ threat: 'x' }`: the threat text warning.
6. `start: no stored key gives no warning` (P8) — an empty store: `checkAutoSave()` gives `warns` `[]`.
7. `E1: a stored count of 300000 loads as 10`, `… one warning names settings.playerCount`, `… the stored string is unchanged`.
8. `E2: a null maxWounds is recomputed` — `sly_marbo_aaa`, `bonus: 'adversary'`, `maxWounds: null`, settings tier 1 and count 4: `maxWounds === wounds + 4 + 1`; the warning names `individuals[0].maxWounds`. `E2: a null maxWounds of an unknown threat stays null`.
9. `D2: a dangling mobId shows the entry as a free row` — `getEncounterListItems()` holds it with type `individual`.
10. `C10: an unknown individual is named Unknown threat (gone)`; `C10: an unknown mob is named M — Unknown threat (gone)` (the `name` of the list item; Task 8 checks the row HTML).
11. `C11: a file cannot replace a shipped threat` — `window.api.loadEncounterFile = async () => ({ success: true, data, fileName: 'F' })` with `customThreats: [{ id: 'sly_marbo_aaa', name: 'NOT MARBO' }]` and one individual: the shipped name stays, and a warning names `customThreats[0]`.
12. `C4: a loaded file is in the autosave at once` (P17) — app with A, `flush()`, load B (Task 2 fixture B): with no `flush()`, the stored encounter equals B, with `settings.name` set to `F`; `hasUnsavedChanges()` is `false`.
13. `gate: a file whose top level is an array gives an error`; `gate: a threat file in Load Encounter gives an error` (`{ name: 'X', abilities: [] }`); `gate: a players file in Load Encounter gives an error` (`{ version: 1, playerCount: 3, players: [] }`). Each: `{ success: false, error: 'Invalid encounter file' }`, the encounter and the stored string do not change.
14. `C5: removing the last individual removes the key at once` (CB2) — app with one individual, `flush()`, `removeIndividual`: with no `flush()`, the key is absent. `C5: removing the only player removes the key at once`.
15. `CB1: a second tab with an empty encounter keeps the key of the first tab` — apps A and B on one store, both start with an empty store. A adds one individual and calls `flush()`. B calls `updateSettings({ tier: 2 })`, `incrementRound()`, `clearEncounterOrder()`, then `flush()`. The key is present and equals the string of A. Then B calls `clearEncounter()`: the key is still present.
16. `CB1: a restore makes the page the owner` — app C starts on the store of check 15, restores, removes the individual: the key is absent at once.
17. With `makeTabApp`: `players: a file of [] shows Error loading: Invalid player file`; `players: an encounter file in Load Players shows the same error` (`{ settings: {}, individuals: [] }`, no `players` key); the players do not change. `players: count 50 and a name 7 load as 10 and Player`, with the warning `Player data was repaired on load: playerCount, players[0].name`.
18. `Q5: an empty player file removes the players for good` (`makeTabApp`) — an encounter with two players only, `flush()` (the key is written). Load Players with `{ version: 1, playerCount: 2, players: [] }`, then `flush()`. A new `makeApp` on the same store calls `checkAutoSave()`: `playerCharacters` is `[]`.

- [ ] **Step 3: Run the test to see it fail**

Run: `node scripts/test-bestiary-load.js 2>&1 | grep -E '^FAIL' | head -40; node scripts/test-bestiary-load.js 2>&1 | tail -1`. Expected: FAIL for checks 2-5 and 7-18. Checks 1 and 6 pass today.

- [ ] **Step 4: Change the code**

- The flag, `markDirty`, `clearAutoSave`, `_performAutoSave` and `clearEncounter`: spec §5.2.
- `loadFromData(data, priorPaths = [])`: spec §4.6 steps 1-5. Keep the existing injects and assignments.
- `loadEncounterFromFile`: the gate, then `this.loadFromData(result.data)`, `this.settings.name = result.fileName`, `this.markClean()`, `clearTimeout(this._autoSaveTimer)`, then `this._performAutoSave()` for a state that is not empty, or `this.clearAutoSave()` for an empty one. Return `result` as today.
- `getEncounterListItems`: the two names of spec §4.7.
- `checkAutoSave`: spec §4.2 and §4.6 (`repairCustomThreatList(saved, 'customThreats', 'autosave.customThreats')`, inject, `loadFromData(saved.encounter, paths)`, set the flag). The builder part: the gate, the existing call, the flag.
- `handleLoadPlayers`: the gate, then `const paths = BestiaryCheck.repairPlayers(data)`, one warning when `paths.length > 0`, then the existing code. After the line that replaces the players (`EncounterState.playerCharacters = []` and the adds), call `EncounterState.markDirty()` (Q5): a file with `players: []` adds nobody, so no writer marks the change.

- [ ] **Step 5: Run the test to see it pass**

Run: `node scripts/test-bestiary-load.js 2>&1 | tail -1`. Expected: `All checks passed`.

- [ ] **Step 6: Mutation proof**

| Mutation | Expected |
|---|---|
| Remove the write from `loadEncounterFromFile`. | check 12 FAILS |
| In `clearAutoSave`, remove the key with no flag test. | check 15 FAILS |
| In `markDirty`, wait for the timer instead of the removal at once. | check 14 FAILS |
| Remove the kind-key test of the file gate. | check 13 (threat file, players file) FAILS |
| Remove the E2 recompute. | check 8 FAILS |

- [ ] **Step 7: Run all test scripts and the browser scenarios**

Run the loop of the Global Constraints. Expected: no `FAIL`. Run the browser command with `--only c4`, then `c5`, `c7`, `c9`, `c10`, `c11`, `gates`, `twotabs`. Expected to pass now: `c4`, `c11`, the encounter lines of `c5`, `gates` (encounter and players lines), the encounter lines of `twotabs`, the stored-count lines of `c7`, `c9` (a), (b), (e)-(g), and the free-row line of `c10`. The mob-row line of `c10` passes after Task 8, its select line after Task 9; the builder lines after Task 4; the other `c7` lines after Task 5b.

- [ ] **Step 8: Commit**

```bash
git add bestiary/js/encounter-state.js bestiary/js/app.js bestiary/tabs/encounter-tab.js scripts/test-bestiary-load.js
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Check each encounter load and keep the autosave in step

Each encounter load, the autosave restore and the player file load test
the shape first and repair the data with BestiaryCheck. A loaded file
goes into the autosave at once. A page removes the key only when it
wrote or restored it, and then at once. <five mutation-proof lines>"
```

---

### Task 4: Threat files, the builder autosave and Add to Encounter (C5 builder, C8, C9 and C10 builder parts; CB1-CB3 builder)

Suggested dispatch: `implementer` with `model: opus` (a change of the id rule for custom threats).

**Files:**
- Modify: `bestiary/js/threat-builder-state.js:29-33` (flag `_ownsAutoSave`; remove `_lastInjectedSnapshot`), `:169`, `:279-310` (`clear`, new `_newThreat`, new `_newThreatData`), `:324-337` (`loadThreatFromFile`), `:341-359` (`wouldCauseNameCollision`), `:362-389` (`injectIntoEncounter`), `:500-503` (`_markDirty`), `:514-525` (`_performAutoSave`), `:539-541` (`clearAutoSave`), `:544-554` (`loadFromAutoSave`)
- Modify: `bestiary/tabs/encounter-tab.js:2092-2119` (`handleImportThreat`)
- Test: `scripts/test-bestiary-builder.js` (new)

**Interfaces:**
- Consumes: Task 1 (`isPlainObject`, `repairThreat`, `sameThreatData`); Task 3 (`App.checkAutoSave` sets `ThreatBuilderState._ownsAutoSave`; `makeApp` harness to copy).
- Produces:
  - `ThreatBuilderState._ownsAutoSave`, `_markDirty()`, `clearAutoSave()`, `_performAutoSave()`: the rules of spec §5.2, with "empty" = pristine. `clear()` also cancels the pending timer.
  - `ThreatBuilderState._newThreat() -> object`: the literal of `clear()` with a new id. `clear()` uses it.
  - `ThreatBuilderState._newThreatData() -> object` (P2): `_newThreat()` with `skills: 'Default 0'` and no `parsedSkills`, the `getThreatData()` form. Pristine: `BestiaryCheck.sameThreatData(this.getThreatData(), this._newThreatData())`.
  - `loadThreatFromFile()`: the gate of spec §4.2 (a plain object with one of `name`, `abilities`, `attributes`); a failed gate returns `{ success: false, error: 'Invalid threat file' }` and changes nothing. Else `repairThreat(data, '')`, one warning `'Threat data was repaired on load: ' + paths.join(', ')`, then the existing id rule with a type test (`typeof id !== 'string' || !id.startsWith('custom_')`).
  - `loadFromAutoSave(threatData)`: the same repair and id rule.
  - `injectIntoEncounter(count, newName)` and `wouldCauseNameCollision()`: spec §7.2. `_lastInjectedSnapshot` no longer exists.
  - `handleImportThreat`: the same gate with the existing message `Error: Invalid threat file`, the repair, the id rule, then spec §7.2 (a held record with other data gives a new id).

- [ ] **Step 1: Write the failing checks in `scripts/test-bestiary-builder.js`**

Copy `makeApp` and `makeTabApp` from `scripts/test-bestiary-load.js`.

1. `C8: after a reload each entry keeps its own wounds` — app 1: `clear()`, `updateField('name', 'C8')`, `updateField('wounds', 5)`, `injectIntoEncounter(1)`, `updateField('wounds', 12)`, `flush()`. App 2 on the same store: `App.checkAutoSave()`, then `injectIntoEncounter(1)`. Check `individuals.map(i => [getThreat(i.threatId).wounds, i.maxWounds])` is `[[5, 5], [12, 12]]` and the two `threatId` values differ.
2. `C8: after a reload the rename prompt shows` — in app 2 before the second inject, `wouldCauseNameCollision()` is `true`.
3. `C8: an unchanged threat added twice keeps one id` — one session, two injects with no edit: one `threatId`.
4. `C8: Import Threat of two versions of one file gives two ids` (`makeTabApp`) — `window.api.loadThreatFile` returns `{ id: 'custom_imp', name: 'Imp', wounds: 5 }`, then `{ id: 'custom_imp', name: 'Imp', wounds: 9 }`: the first entry's threat has wounds 5.
5. `import: a file of 5 shows Error: Invalid threat file`; `import: a players file shows Error: Invalid threat file` (`{ version: 1, playerCount: 3, players: [] }`; no entry is added); `import: an id of 7 gets a custom_ id` (`{ id: 7, name: 'I7' }`, Q3: the kind key `name` passes the gate).
6. `load: a file of [] gives Invalid threat file`; `load: an encounter file gives Invalid threat file and changes nothing` (`{ settings: {}, individuals: [] }`: the builder threat and the stored builder string do not change); `load: an id of 5 and skills of 5 load` (`{ id: 5, name: 'L5', skills: 5 }`, Q3; no throw, id starts with `custom_`, `skills` serializes to `Default 0`, the warning names `skills`).
7. `autosave: a stored threat with id 5 loads` (`loadFromAutoSave({ id: 5, name: 'B5' })`).
8. `P2: a new threat is pristine` — `clear()`, then `_performAutoSave()`: the key is absent. `P2: the data form of a new threat has skills Default 0` — `_newThreatData().skills === 'Default 0'` and no `parsedSkills` key.
9. `C5: a builder made pristine by the owner removes the key at once` — `updateField('name', 'X')`, `flush()`, key present; `updateField('name', '')`: with no `flush()`, the key is absent.
10. `C5: a nameless threat with a keyword persists` — `clear()`, `addKeyword('ORK')`, `flush()`: key present.
11. `CB1: a second tab with a pristine builder keeps the key of the first tab` — apps A and B on one store, both start with an empty store. A: name `A1`, `flush()`. B: `updateField('name', 'Z')`, `updateField('name', '')`, `flush()`, then `clear()` and `clearAutoSave()` (the Clear handler). The key still holds `A1`.
12. `C8: the snapshot field is gone` — `'_lastInjectedSnapshot' in ThreatBuilderState` is `false`.

- [ ] **Step 2: Run the test to see it fail**

Run: `node scripts/test-bestiary-builder.js 2>&1 | grep -E '^FAIL'`. Expected: FAIL for 1, 2, 4-7 and 9-12 (in check 11 the Clear of tab B removes the key of tab A). Check 3 passes today. Check 8 fails only in its second line (`_newThreatData` does not exist).

- [ ] **Step 3: Change the code**

As the Interfaces. Keep `_resolveWeaponIds` and `_parseSkillsString` after the repair, as today.

- [ ] **Step 4: Run the test to see it pass**

Run: `node scripts/test-bestiary-builder.js 2>&1 | tail -1`. Expected: `All checks passed`.

- [ ] **Step 5: Mutation proof**

| Mutation | Expected |
|---|---|
| In `injectIntoEncounter`, skip the held-record test. | check 1 FAILS |
| In the pristine test, compare with `_newThreat()` instead of `_newThreatData()`. | checks 8 and 9 FAIL |
| In `_performAutoSave`, test `isEmpty()` instead of pristine. | check 10 FAILS |
| In `clearAutoSave`, remove the key with no flag test. | check 11 FAILS |
| Remove the kind-key test in `loadThreatFromFile`. | check 6 (encounter file) FAILS |

- [ ] **Step 6: Run all test scripts and the browser scenarios**

Run the loop. Expected: no `FAIL`. Run `--only c8`, `c5`, `c9`, `gates`, `twotabs`. Expected: all lines of `c8`, `c5`, `gates` and `twotabs` pass, and `c9` (c), (d) pass.

- [ ] **Step 7: Commit**

```bash
git add bestiary/js/threat-builder-state.js bestiary/tabs/encounter-tab.js scripts/test-bestiary-builder.js
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Keep each encounter entry on its own threat data

Add to Encounter and Import Threat give a new id when the cache holds
other data with the same id, also after a reload. Each threat load
tests the shape and repairs the data. A pristine builder removes its
autosave key at once, but only in the page that owns the key.
<five mutation-proof lines>"
```

---

### Task 5a: The encounter writers, the Players box, the list initiative and the player rows (C6, C7 Players, D1)

Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `bestiary/js/encounter-state.js:70-72` (`addIndividual`), `:135-150` (`setInitiative`, `setMobInitiative`), `:538-544` (`setPlayerCharacterInitiative`), `:596-602` (`setVehicleInitiative`), `:735-745` (`updateSettings`)
- Modify: `bestiary/tabs/encounter-tab.js:29-33` (Players handler), `:118-154` and `:200-212` of `renderPlayerCharacterInputs` (the rows, the escapes of their ids and values (group N-1), the removed delete loop, the `×` handler), `:276-294` (list initiative handler)
- Modify: `bestiary/css/styles.css` (one rule for `.player-character-row--extra` and its mark, after the existing `.player-character-row` rules)
- Test: `scripts/test-bestiary-inputs.js` (new)

Task 3 changed other lines of `encounter-state.js`. Task 5b changes `:155-198` of `renderPlayerCharacterInputs` (the name and initiative handlers of the rows). Order: 5a, then 5b.

**Interfaces:**
- Consumes: Task 1 (`readIntegerInput` and the constants).
- Produces: spec §6.3 (writers), the Players and list-initiative rows of spec §6.2, spec §6.4. `EncounterTab.escapeHtml` gets its new body in Task 8; here the escapes call `this.escapeHtml` as it is.

- [ ] **Step 1: Write the failing checks in `scripts/test-bestiary-inputs.js`**

Writers (sandbox of Task 1, `EncounterState` only):

- `updateSettings` with `playerCount` `NaN`, `0`, `11`, `'5'`: the count stays `4`; with `10`: `10`. With `tier` `6` and `'3'`: the tier stays; with `3`: `3`.
- `setInitiative` with `'150'` and `'abc'`: the value stays; `''`: `null`; `'42'`: `42`. The same four for the mob, player and vehicle setters.
- `addIndividual('sly_marbo_aaa', q)` with `21`, `0`, `2.5`: `[]` and no entry; with `20`: 20 entries.

Tabs: the recording document of `scripts/test-tab-escapes.js:24-60`, changed so that `getElementById(id)` and `container.querySelector(sel)` return one stable element for each key, and `addEventListener(type, fn)` keeps `el._on[type] = fn`. Each stub input gets the `min` and `max` that its real input declares (P13): `#encounter-players` `min = '1'`, `max = '10'`.

- `players box: an empty value keeps the count and shows it` — `EncounterTab.bindEvents()`; set `#encounter-players` `.value = ''`; call `_on.change({ target: el })`: count `4`, `el.value` is `'4'`. With `'11'`: count `4`, value `'4'`. With `'7'`: `7`.
- `D1: a lower count keeps each player` — three players, count 2, `renderPlayerCharacterInputs()`. Count the two classes apart (P13): `/class="player-character-row[ "]/g` gives 3 rows, `/player-character-row--extra/g` gives 1; the text `Above player count` is there once; `playerCharacters.length` is 3.
- `D1: the × of the marked row keeps the count` — the `×` handler of the row with index 2 (call it through `_on.click` of a stable stub with `dataset.id` and `dataset.index`): the player is gone, the count stays 2.

- [ ] **Step 2: Run the test to see it fail**

Run: `node scripts/test-bestiary-inputs.js 2>&1 | grep -E '^FAIL'`. Expected: FAIL for the writer limits, the players box and both D1 checks.

- [ ] **Step 3: Change the code**

- Writers: spec §6.3.
- The Players handler and the list initiative handler call `BestiaryCheck.readIntegerInput(e.target)`. On `null`: an initiative box with `''` clears the value; else the handler does not call the writer and sets the box to the stored value.
- `renderPlayerCharacterInputs`: spec §6.4. Remove the delete loop (`:150-154`). Escape `pc.id` in each `data-id` and the initiative `value` (`this.escapeHtml(String(…))`). Give each `×` a `data-index`. The `×` handler decrements the count only for an index less than the count.
- CSS: one rule for the mark, with existing color variables (`--text-muted`).

- [ ] **Step 4: Run the test to see it pass.** Expected: `All checks passed`.

- [ ] **Step 5: Mutation proof**

| Mutation | Expected |
|---|---|
| Remove the `playerCount` guard in `updateSettings`. | the `updateSettings` limit checks FAIL |
| Put back the delete loop of `renderPlayerCharacterInputs`. | `D1: a lower count keeps each player` FAILS |
| In the Players handler, go back to `parseInt(e.target.value)`. | `players box: …` FAILS |

- [ ] **Step 6: Run all test scripts and the browser scenarios** — `--only c6`, `c7`, `d1`, `inputs`. Expected: `c6`, `d1`, the Players line of `c7` and the list-initiative lines of `inputs` pass.

- [ ] **Step 7: Commit**

```bash
git add bestiary/js/encounter-state.js bestiary/tabs/encounter-tab.js bestiary/css/styles.css scripts/test-bestiary-inputs.js
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Accept only a valid player count and initiative in the encounter

The Players box and the list initiative keep the stored value for an
entry outside the declared range, and the state writers refuse such
values. A lower player count no longer deletes the players above it:
they stay with a mark. <three mutation-proof lines>"
```

---

### Task 5b: The add counts, the builder number fields and the other initiative boxes (C7 counts; the four checks of P7)

Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `bestiary/tabs/encounter-tab.js:155-198` (the name and initiative handlers of the player rows), `:942-946` (player detail initiative handler)
- Modify: `bestiary/tabs/threats-tab.js:299-329` (`bindAddToEncounterEvents`)
- Modify: `bestiary/tabs/threat-builder-tab.js:122-123` (inject count), `:526-545` (`[data-field]` handler), `:657-692` (skill handlers), `:1103-1105` (modal count)
- Test: `scripts/test-bestiary-inputs.js` (one block after the Task 5a block, before the summary lines)

**Interfaces:**
- Consumes: Task 1 (`readIntegerInput`), Task 5a (the writers refuse invalid values).
- Produces: the other rows of spec §6.2.

- [ ] **Step 1: Write the failing checks**

Unit checks. The harness (Q4) is the stable-stub document of Task 5a, which loads `data-loader.js`, `bestiary-check.js`, `encounter-state.js`, `tabs/settings-tab.js` and `tabs/encounter-tab.js`; this block also loads `tabs/threats-tab.js`, `js/threat-builder-state.js` and `tabs/threat-builder-tab.js`, with `App = { updateThreatCount() {} }` and `Glossary = { enhanceDescriptions() {} }`. The stub `document` needs `addEventListener() {}` (`threat-builder-tab.js:31`), and each stub element needs `focus() {}`, `select() {}` and a `remove()` that records its calls. Each stub input gets its declared `min` and `max`: `#threat-add-quantity`, `#builder-inject-count` and `#inject-modal-count` `min = '1'`, `max = '20'`):

- `quantity: 25 adds nothing and shows 1` — `ThreatsTab.bindAddToEncounterEvents(container, 'sly_marbo_aaa')`; `#threat-add-quantity` value `'25'`; `_on.click()` of `#threat-add-to-encounter-btn`: no entry, value `'1'`. With `'3'`: 3 entries.
- `inject count: 25 adds nothing and shows 1` — builder name `Q`; `#builder-inject-count` value `'25'`; `_on.click()` of `#btn-builder-inject`: no entry, and the box shows `'1'` (Q4: after 5a the writer already refuses 25, so only the box line can fail before this task).
- `modal count: 25 adds nothing and keeps the modal open` (P7) — `ThreatBuilderTab.showInjectModal('Q', 2)`; `#inject-modal-name` value `'Q'`; `#inject-modal-count` value `'25'`; `_on.click()` of the stable `#inject-modal-add` element of the overlay: no entry, the `remove` method of the overlay stub was not called (the stub records each call), the count box shows `'2'`.

Browser lines (the `inputs` scenario of Task 2) that this task makes pass:

- `inputs: player row initiative 150 is refused` (P7) — a player in row 0 with initiative 12; fill `.pc-initiative-input[data-index="0"]` with `150`, press Tab: the stored value stays 12, the box shows `12`.
- `inputs: player detail initiative 150 is refused` (P7) — select the player; fill `#player-detail-initiative` with `150`, press Tab: the same.
- `inputs: skill Default -2 is not stored`, `inputs: a skill entry value -1 is not stored` (P7) — builder: fill `[data-skill="default"]` with `-2`; click `#btn-add-skill`, fill `.builder-skill-value[data-skill-index="0"]` with `-1`: `parsedSkills.default` stays 0 and the entry value stays 0; after Tab each box shows `0`.
- `inputs: S -5 is not stored`, `inputs: the box shows the stored S`, `inputs: wounds 0 is not stored`.

- [ ] **Step 2: Run the tests to see them fail** — the unit file and `--only inputs`.

- [ ] **Step 3: Change the code** — each handler of spec §6.2 that this task owns calls `BestiaryCheck.readIntegerInput`. On `null`: an initiative box with `''` clears the value (on an empty player row, it creates no player); else the handler does not call the writer and sets the box to the stored value, or to `1` for an add count, or to the opening count for the modal. The builder `[data-field]` handler: for `type === 'number'`, `readIntegerInput`; `null` changes nothing. Add one `change` listener for each builder number field and skill field that sets the box to the stored value. The shock text field keeps its handler.

- [ ] **Step 4: Run the tests to see them pass.**

- [ ] **Step 5: Mutation proof** — in the modal handler, go back to `parseInt(…) || 1`: `modal count: 25 …` FAILS. Restore.

- [ ] **Step 6: Run all test scripts and the browser scenarios** — `--only c7`, `inputs`. Expected: all lines pass.

- [ ] **Step 7: Commit**

```bash
git add bestiary/tabs/encounter-tab.js bestiary/tabs/threats-tab.js bestiary/tabs/threat-builder-tab.js scripts/test-bestiary-inputs.js
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Accept only numbers inside the declared range of the other inputs

The add counts, the rename modal count, the builder number and skill
fields and the player initiative boxes keep the stored value for an
entry outside the declared range. <mutation-proof line>"
```

---

### Task 6: Escape the Threats tab, the Copy text and the mob ability lists (C1 T-1 to T-9, B6)

Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `bestiary/tabs/threats-tab.js:157-199`, `:364-696`, `:698-803`; add `escapeHtml(value)` and `renderMobEntries(list)` at the end of the object
- Test: `scripts/test-bestiary-escapes.js` (new)

Task 5b changed `:299-329` of this file. This task does not touch those lines.

**Interfaces:**
- Consumes: nothing.
- Produces: `ThreatsTab.escapeHtml(value) -> string` (spec §8.3); `ThreatsTab.renderMobEntries(list) -> string` (spec §9); `renderTextSection(label, value)` for a string or a list. Task 7 uses the `ThreatsTab` renders for the preview. Task 9 uses no new `ThreatsTab` method.

- [ ] **Step 1: Write the failing checks in `scripts/test-bestiary-escapes.js`**

Harness: the recording document of `scripts/test-tab-escapes.js:24-60`. Load `data-loader.js`, `bestiary-check.js`, `tabs/settings-tab.js`, `tabs/threats-tab.js`. Stubs: `Glossary = { enhanceDescriptions() {}, showEntryPopup() {} }`, `EncounterState`/`ThreatBuilderState` not needed. Cache: threats, threat weapons, glossary.

```js
const EVIL = '<b>"Q7\'</b>&';
const RAW = html => /<\/?b>/i.test(html) || html.includes('"Q7');
function evilThreat() { /* every string field of spec §4.5 = EVIL; every number field = EVIL;
   keywords [EVIL]; tierThreat { '1': EVIL, [EVIL]: 'T' }; abilities [{ type: EVIL, name: EVIL, stats: EVIL, description: EVIL }, { type: 'ACTION', name: EVIL, stats: EVIL, description: EVIL }]
   (the second ability has a type of ABILITY_TYPES, so the 'ALL' picker of Task 7 shows it, P4);
   bonuses [{ name: EVIL, description: EVIL }]; mobAbilities [{ name: EVIL, description: EVIL }];
   id 'custom_' + EVIL. Not repaired: the escapes must hold alone. */ }
```

Checks:

- `T-3..T-8: the card holds no raw value` — `RAW(ThreatsTab.renderThreatCard(evilThreat()))` is `false`.
- `T-1: the list holds no raw value` — inject the threat, `renderThreatList()`, take the last `written` entry.
- `T-2: tier badges hold no raw value`.
- `T-9: the Copy text keeps the description as text` — `buildThreatCopyText(evilThreat())` holds `'  ' + EVIL`, and no `written` entry holds `<b>"Q7`.
- `B6: necron_warrior shows Their Number Is Legion`, `B6: fire_warrior shows Focused Fire, Ta'lissera and both strike teams`, and no `[object Object]` in either card. Compare each name in its escaped form (`ThreatsTab.escapeHtml(name)`): `Ta'lissera` is `Ta&#39;lissera` in the HTML string.
- `helper: escapeHtml(0) is '0'`, `escapeHtml(null) is ''`, `escapeHtml('a"b\'<&>')` is `'a&quot;b&#39;&lt;&amp;&gt;'`.
- `glossary: no term is amp, lt, gt, nbsp or quot` — in a second, separate `vm` context with no `Glossary` stub (P16): load the real `js/glossary.js`, set `Glossary.data` to `glossary.json`, `Glossary.termMap = new Map()`, `Glossary.buildTermMap()`.
- `names: a custom name is escaped one time` (P15, CB7) — a threat named `A & "B" <C>`: the card and the list hold `A &amp; &quot;B&quot; &lt;C&gt;` and do not hold `&amp;amp;`, `&amp;quot;` or `&amp;lt;`. Tasks 7, 8 and 9 add the same check for their views.

- [ ] **Step 2: Run the test to see it fail**

Expected: FAIL for each check except the glossary check.

- [ ] **Step 3: Escape the sites of groups T-1 to T-9 and add B6**

Use `this.escapeHtml` at each site of spec §8.5 groups T-1 to T-8. T-9: use the description string as it is. B6: spec §9.

- [ ] **Step 4: Run the test to see it pass**, then the browser: `--compare "$BASELINE"` (expected PASS; only B6 keys differ) and `--only b6` (the card lines pass; the mini lines pass after Task 9).

- [ ] **Step 5: Mutation proof** — undo the escape of the description (`:429`) only: `T-3..T-8: the card holds no raw value` FAILS. Restore.

- [ ] **Step 6: Run all test scripts.** Expected: no `FAIL`.

- [ ] **Step 7: Commit**

```bash
git add bestiary/tabs/threats-tab.js scripts/test-bestiary-escapes.js
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Escape each threat value in the Threats tab and show mob ability lists

The list, the card and the Copy text print threat values as text. A mob
ability or mob option list shows each entry. <mutation-proof line>"
```

---

### Task 7: Escape the threat builder (C1 B-1 to B-7)

Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `bestiary/tabs/threat-builder-tab.js:158`, `:226`, `:431`, `:470` (textarea start tags, P5), `:287-503` (the value attributes of B-2), `:747-770`, `:924-956`, `:1016-1020`, `:1084`, `:1230-1234`
- Test: `scripts/test-bestiary-escapes.js` (add one block after the Task 6 block, before the summary lines)

Task 5b changed `:122-123`, `:526-545`, `:657-692` and `:1103-1105` of this file. This task does not touch those lines.

**Interfaces:**
- Consumes: Task 6 (`ThreatsTab` renders for the preview).
- Produces: nothing for later tasks. `ThreatBuilderTab.stripHtml` no longer exists.

- [ ] **Step 1: Write the failing checks**

Add to the sandbox: `bestiary/js/threat-builder-state.js`, `bestiary/tabs/threat-builder-tab.js`, `App = { updateThreatCount() {} }`. Inject `evilThreat()`; set `ThreatBuilderState._abilityIndex = null` so that the index includes it.

- `B-1: the template search holds no raw value` — `renderTemplateDropdown('', 'sidebar')`, last `written` entry.
- `B-2: the editor holds no raw value` — `ThreatBuilderState.threat = evilThreat()` with `parsedSkills: { default: EVIL, awareness: EVIL, passiveAwareness: EVIL, entries: [{ name: 'Athletics', value: EVIL }] }`; `renderEditor()`.
- `B-3: the preview holds no raw value` — `renderPreviewCard(evilThreat())`.
- `B-4: the ability picker holds no raw value`, `B-5: the bonus picker holds no raw value`.
- `B-4, B-5: no description is parsed as HTML` — no `written` entry holds `<b>"Q7` after the two pickers, and `typeof ThreatBuilderTab.stripHtml` is `'undefined'`.
- `B-6: the modal count is escaped` — `showInjectModal(EVIL, EVIL)`.
- `P5: each builder textarea starts with one line break` — `ThreatBuilderState.threat.description = '\nfirst'`, one ability and one bonus with the description `'\nfirst'`; `renderEditor()`: each of the three textareas is written as `…rows="N">\n\nfirst</textarea>` (one `\n` from the template, one from the value).
- `names: a custom name is escaped one time in the builder` — the preview, the template search and the ability picker of a threat named `A & "B" <C>` hold `A &amp; "B" &lt;C&gt;` and no `&amp;amp;` (Q1: these text sites use the DOM helper `ThreatBuilderTab.escapeHtml`, `threat-builder-tab.js:1220-1224`, which leaves `"` raw; the parser gives the same text). The name input, an `escapeAttr` site, holds `value="A &amp; &quot;B&quot; &lt;C&gt;"`. Tasks 6, 8 and 9 use the string helpers `ThreatsTab.escapeHtml` and `EncounterTab.escapeHtml` (spec §8.3), which escape `"`, so `&quot;` is right there.

- [ ] **Step 2: Run the test to see it fail.** Expected: FAIL for each new check.

- [ ] **Step 3: Escape the sites of groups B-1 to B-6, add the line break after each `<textarea …>` start tag (`:226`, `:431`, `:470`; spec §8.1, P5), and remove `stripHtml`** — `this.escapeAttr` in a double-quoted attribute, `this.escapeHtml` in text. B-4 and B-5: build the description text from the strings as they are, then `this.escapeHtml(this.truncate(text, n))`.

- [ ] **Step 4: Run the test to see it pass**, then `--compare "$BASELINE"` (expected PASS).

- [ ] **Step 5: Mutation proof** — undo the escape of the threat name in the ability picker (`:953`) only: `B-4: the ability picker holds no raw value` FAILS. Restore.

- [ ] **Step 6: Run all test scripts.**

- [ ] **Step 7: Commit**

```bash
git add bestiary/tabs/threat-builder-tab.js scripts/test-bestiary-escapes.js
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Escape each threat value in the threat builder

The template search, the editor values, the preview and the Browse
pickers print threat values as text. The pickers no longer parse a
description as HTML. <mutation-proof line>"
```

---

### Task 8: Escape the encounter list, the player detail and the notes (C1 N-0, N-2 to N-4; C2; C3)

Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `bestiary/tabs/encounter-tab.js:215-219` (`escapeHtml` body), `:549-694` (four row renders; `:651` prints `this.escapeHtml(item.name)` instead of `mob.name`, so the mark of spec §4.7 shows, P3), `:931`, `:936`, `:1020`, `:1105` (each textarea also gets one `\n` directly after its start tag, P5)
- Test: `scripts/test-bestiary-escapes.js` (one block after the Task 7 block)

Tasks 5a and 5b changed `:118-212`, `:276-294` and `:942-946`. Task 9 changes the other lines of the detail renders. This task changes only the lines named above.

**Interfaces:**
- Consumes: Task 3 (the list names), Task 5a (the player rows call `this.escapeHtml`).
- Produces: `EncounterTab.escapeHtml(value)` with the body of spec §8.3. Task 9 uses it.

- [ ] **Step 1: Write the failing checks**

Add `bestiary/js/encounter-state.js` and `bestiary/tabs/encounter-tab.js` to the sandbox, with stubs `BottomSheet = { isOpen() { return false; }, open() {}, updateContent() {} }` and `VehiclesTab = { renderVehicleCardMini: () => '', bindCardPopups() {} }`.

- `N-0: escapeHtml escapes the five characters and keeps 0`.
- `C2: a player name with quotes stays whole in its value` — one player `Bob "Big" Smith`, `renderPlayerCharacterInputs()`: the HTML holds `value="Bob &quot;Big&quot; Smith"`.
- `N-2: each row type holds no raw value` — an individual, a mob, a player and a vehicle entry whose ids, notes and names are `EVIL`, with the evil threat; `renderIndividualItem`, `renderMobItem`, `renderPlayerItem`, `renderVehicleItem` of the items from `getEncounterListItems()`.
- `C3: <kind> notes keep their entity text` — notes `\nHP &lt;5 </textarea> x` (with a leading line break, P5) for a player, an individual and a mob, each of a shipped threat (`sly_marbo_aaa`, `astra_militarum_trooper`); render each detail into a stub container: the HTML holds `>\n\nHP &amp;lt;5 &lt;/textarea&gt; x</textarea>`.
- `C10: the mob row shows the unknown-threat mark` (P3) — a mob `{ name: 'M', threatId: 'gone' }` with two members: `renderMobItem` of its list item holds `M — Unknown threat (gone)`.
- `names: a custom name is escaped one time in the rows` — the individual row and the mob row of a threat named `A & "B" <C>` hold `A &amp; &quot;B&quot; &lt;C&gt;` and no `&amp;amp;`.

- [ ] **Step 2: Run the test to see it fail.**

- [ ] **Step 3: Change the helper body and escape the named lines.**

- [ ] **Step 4: Run the test to see it pass**, then `--compare "$BASELINE"` and `--only c2`, `c3`, `c10`, `names`. Expected: all lines of `c2` and `c3` pass, the mob-row line of `c10` passes, and the row lines of `names` pass.

- [ ] **Step 5: Mutation proof** — restore the DOM body of `escapeHtml`: `C2: a player name with quotes …` FAILS. Restore.

- [ ] **Step 6: Run all test scripts.**

- [ ] **Step 7: Commit**

```bash
git add bestiary/tabs/encounter-tab.js scripts/test-bestiary-escapes.js
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Escape the encounter rows, names and notes

The escape helper now also escapes quotes, so a player name with quotes
stays whole. The notes boxes show their text as typed. <mutation-proof line>"
```

---

### Task 9: Escape the encounter details and the mini card (C1 N-5 to N-9; C10 guard; B6 mini)

Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `bestiary/tabs/encounter-tab.js:971-1013`, `:1055`, `:1085-1086`, `:1155`, `:1205-1226`, `:1236-1396`
- Test: `scripts/test-bestiary-escapes.js` (one block after the Task 8 block)

**Interfaces:**
- Consumes: Task 8 (`EncounterTab.escapeHtml`). The mini card has its own list markup (spec §9).
- Produces: nothing for later tasks.

- [ ] **Step 1: Write the failing checks**

- `N-5: the individual detail holds no raw value` — the evil individual of Task 8, `renderIndividualDetail(container)`.
- `N-6: the mob detail holds no raw value`; `C10: a mob of an unknown threat renders` — mob `threatId: 'gone'` and a free individual with `'gone'`: no throw, the HTML holds `Unknown threat (gone)`.
- `N-7: the vehicle wounds are escaped` — entry `wounds: EVIL`.
- `N-8: a member of an unknown threat shows Unknown threat (<id>)` — `renderMobMemberItem(ind, undefined)`.
- `N-9: the mini card holds no raw value` — `renderThreatCardMini(evilThreat())`.
- `B6: the mini card of necron_warrior shows Their Number Is Legion` and no `[object Object]`; the same for `fire_warrior` (four entry names, each in its escaped form).
- `names: a custom name is escaped one time in the details` — the individual detail, the mob detail (its "Add Troops to Mob" line) and a member line of a threat named `A & "B" <C>` hold `A &amp; &quot;B&quot; &lt;C&gt;` and no `&amp;amp;`.

- [ ] **Step 2: Run the test to see it fail.**

- [ ] **Step 3: Escape the named lines, add the C10 text, add the B6 list form of the mini card.**

- [ ] **Step 4: Run the test to see it pass.**

- [ ] **Step 5: Mutation proof** — undo the escape of the ability description in the mini card (`:1268`) only: `N-9` FAILS. Restore.

- [ ] **Step 6: Run all test scripts and the full browser proof** — the loop; `--compare "$BASELINE"`; the scenarios with no `--only`. Expected: `All checks passed` for each.

- [ ] **Step 7: Commit**

```bash
git add bestiary/tabs/encounter-tab.js scripts/test-bestiary-escapes.js
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Escape the encounter details and the threat mini card

The details and the mini card print threat values as text. A mob of an
unknown threat renders with a mark. The mini card shows each entry of a
mob ability list. <mutation-proof line>"
```

---

### Task 10: Late findings (the drag place, the picker index, a number guard, the Compendium text, the proof script)

**Added by the controller on 2026-11-16, after the nine planned tasks.** The task reviews found older defects that were in `main` before the pass. The owner asked for "an overall pass for any bugs like those" in one go, so the ones that a normal user can meet and that have a small correction are in this task **[Controller ruling TB10-0]**. Each item is independent. The other late findings go to the owner in the report.

**Files:**
- Modify: `bestiary/js/encounter-state.js`, `bestiary/tabs/encounter-tab.js` (item 1 only: the drag functions), `bestiary/js/threat-builder-state.js` (item 2), `bestiary/js/bestiary-check.js` (item 3), `bestiary/tabs/references-tab.js` (item 4), `scripts/browser-bestiary.js` (item 5)
- Test: `scripts/test-bestiary-late.js` (new), `scripts/browser-bestiary.js` (one new scenario `drag`)
- No `?v=` change (`bestiary/index.html` is at `?v=97` for this branch). Nothing under `creator/`, `shared/` or `data/`.

**Item 1: a dragged entry lands at the place that the placeholder shows [TB10-1].**
- Defect (seen by the re-review of Task 5a, the same before the pass): a drag downward in the encounter list lands one place early, and a drop below the last entry lands before it. So a user cannot drag an entry to the end of the list.
- Sites: `EncounterTab.handleDragMove` and `handleDragEnd` (`bestiary/tabs/encounter-tab.js`; `handleDragEnd` reads `placeholderIndex` from the children of the container, and the hidden original element is still one of those children) and `EncounterState.moveItemInOrder(itemType, itemId, newIndex)` (`bestiary/js/encounter-state.js`).
- Rule: after the drop, the entry is at the place in the VISIBLE list where the placeholder was at the release. A release with the placeholder after the last entry puts the entry at the end. A release at the start place changes nothing in the order. The entries of players above the player count are not visible; they keep their places relative to each other and to the visible entry that follows them (ruling TB5a-6 of Task 5a stays: read the comment of `moveItemInOrder`).
- Find the root cause first, in a real page (three entries A, B, C: drag each one to each place, and below the last). Write the table "start order, drag, order at the base, order with the correction" into the report. Correct the index at ONE place (the caller or `moveItemInOrder`), not at both.
- Checks (unit, `moveItemInOrder` through the same index that the caller gives): for a list of 4 visible entries, each of the 16 moves (from i to place j) gives the expected order; the same with two hidden player entries between the visible ones: the visible order is the expected one and the hidden entries keep their relative order; a move to its own place leaves `encounterOrder` deep-equal.
- Check (browser scenario `drag` in `scripts/browser-bestiary.js`, real mouse moves at 1400 px): A, B, C: A to the end gives B, C, A; C to the start gives C, A, B; A below B gives B, A, C; B above A gives B, A, C; the order stays after a reload.
- Touch uses the same two functions; say in the report that you did not test touch if you did not.

**Item 2: the builder pickers show a custom threat that loads after the first Browse [TB10-2].**
- Defect: the picker index of the builder is built one time (`bestiary/js/threat-builder-state.js`, near lines 41 to 42). A custom threat that the user loads, saves or deletes after the first Browse does not change the picker lists until a reload.
- Rule: the index is built again when the set of threats that it reads changes (a threat file load, a custom threat save or delete; find each writer of that set). Clear the cached index at those writers, so that the next Browse builds it; do not build it at each render.
- Checks: Browse abilities one time; load a threat file whose threat has an ability with a new name; Browse again: the picker lists that ability. The same for a bonus. After a delete of that custom threat, the ability is not in the list. The index object is the same object across two Browse calls with no change between them.

**Item 3: `readIntegerInput` refuses a number that is not a safe integer [TB10-3].**
- Defect: `BestiaryCheck.readIntegerInput` (`bestiary/js/bestiary-check.js`, near line 190) has no safe-integer test. 22 digits in a skill Default box store 1, because the skill writers parse `1e21` again.
- Rule: a value for which `Number.isSafeInteger` is false gets the result that a bad entry gets now (the stored value stays, and the input shows it again). No new limit for a legal value.
- Checks: 22 digits, `9007199254740993` and `1e21` are refused in each mode of the function; `9007199254740991` inside a range that holds it is accepted; each check of `scripts/test-bestiary-check.js` and of the Task 5a and 5b scripts still passes.

**Item 4: the Compendium prints "Skill of your choice +4" [TB10-4].**
- Defect: the Compendium entry of an archetype with an "any skill" bonus prints the data key: "Choice1 +4, Choice2 +4" (Inquisitor) and "Choice +2" (`bestiary/tabs/references-tab.js`, near line 778, the `Skill Bonuses` line).
- Rule: a skill bonus key that matches `/^choice\d*$/` prints `Skill of your choice +N` (the words that the Archetype tab of the creator uses). Each other key prints as before. The creator copy of this tab gets the same line in the creator branch, so write exactly this: a key that matches `/^choice\d*$/` gives `` `Skill of your choice +${val}` ``, each other key gives the old expression.
- Checks: the entry of `inquisitor` (read the real id in `data/archetypes.json`) holds "Skill of your choice +4, Skill of your choice +4" and no "Choice1"; an entry with normal skills is byte-equal to the old output.

**Item 5: the proof script reports the script hits of each step [TB10-5].**
- Defect: a hostile step of `scripts/browser-bestiary.js` reports only the hit labels that no earlier step reported (`js: [...new Set(window.__hits || [])]`, near line 93, and the code that reads it). So `js: []` on a later line does not prove that the step ran no script.
- Rule: each hostile step clears the hit list after it reads it (and waits until late `onerror` handlers of the step ran, so that no hit moves to the next step), and each step fails on a hit of its own.
- Checks: the full run prints `All checks passed` three times in sequence with the same count; with ONE escape removed in a scratch copy of the product at a site that an early step and a late step both draw (the threat name in the Threats tab card and in the encounter list), both lines fail (before the change, only the first one fails): put both runs into the report.

**Proof (report `task-10-report.md`):** for each item: the failing-first run of its checks at the base of the task, then the passing run; one mutation of each corrected line, copy and restore by `cp`, with the FAIL line. All `scripts/test-*.js` pass (25 with the new script). `--compare` against the baseline passes with the 22 known keys. The full run of `scripts/browser-bestiary.js` prints `All checks passed` (163 checks and the new `drag` scenario). `git diff --stat` holds only the files of this task.

**Commit:** one commit, `--author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>"`, no attribution line.

## Wave gate

After Task 9, the controller runs, on the branch head:

1. The loop of the Global Constraints. Expected: no `FAIL`.
2. `… browser-bestiary.js --compare "$BASELINE"`. Expected: `All checks passed`. The differing keys are only `card:` and `mini:` keys of the 11 B6 ids.
3. `… browser-bestiary.js`. Expected: `All checks passed`.
4. `git diff 44084ae --stat -- creator shared data` is empty.

---

## Review record (2026-11-16)

Branch `bug-pass-bestiary`, base `44084ae` (`main`), head `ccdbc1b`, 35 commits, 22 files. Commits, in sequence: `989441a` (spec and plan), `f10c400` (plan fix round 1), `e922f23` (plan fix round 2), `f0a0bce` (Task 1), `7d93959` (Task 2), `740e639` (Task 1 fix round), `0f9db36` (E4 text of the spec, TB1-3), `610377a` (Task 3), `3e7ddb4` (Task 4), `1bdbb65` (three autosave rules in spec §5.2), `36cdf17` (Task 3 fix round), `27c21d8` (Task 2 fix round 1), `95781cf` (Task 4 fix round 1), `578328a` (Task 2 fix round 2), `ad02d03` (Task 5a), `9f4b141` (Task 4 fix round 2), `110c92e` (Task 2 fix round 3), `9690fa3` (Task 5b), `d5cc24e` (Task 6), `cf8bf4d` (three rules in spec §6.2 and §6.4), `4c220fb` (Task 5a fix round 1), `53a9c0e` (Task 7), `c9e9986` (Task 5b fix round), `20603b4` (Task 5a fix round 2), `749de92` (Task 6 fix round), `243bcea` (Task 8), `896f257` (Task 9), `ecbd568` (Task 7 fix round), `903496e` (Task 8 fix round), `d68eb73` (Task 10 in the plan), `03850be` (Task 10), `8076b1b` (Task 10 fix round 1), `cbdb479` (Task 9 fix round), `a6b548b` (Task 10 fix round 2), `ccdbc1b` (Task 10 fix round 3), then the controller's commit with this record.

### The owner's words

- 2026-11-15: "Let's do an overall pass for any bugs like those and clean them up in one go."

The owner gave no other word for this branch. Each other decision below is a Controller ruling.

### How the wave ran

Three read-only audits (general-purpose, opus, one dispatch each) found the defects: audit 2 found B6, and audit 3 found C1 to C11 of the bestiary. One opus author wrote the spec and the plan, and an opus reviewer found 17 items (1 Critical, 6 Important, 10 Minor) and then 6 more in a scoped re-review. The author did two fix rounds, and the plan had ten tasks: 1, 2, 3, 4, 5a, 5b, 6, 7, 8 and 9. Each task had one implementer, and a different agent (reviewer, opus, xhigh) reviewed each task in a second worktree while the next task started. Each fix round went back to the implementer of its task. After Task 9, the controller added Task 10 for the late findings that a normal user can meet and that have a small correction (TB10-0), because the owner asked for the pass "in one go".

Incident: During fix round 3 of Task 10, the implementer removed `/dev/null` by mistake (`rm -f /dev/null`) and made the device node again. The controller checked the node (character device 1,3, mode 666). Nothing else was removed.

### Rulings

The rulings G1 to G11 and the ruling for each finding are in spec §2.1 and §2.2. The rulings below came from the ledger and from the review files.

| Id | Decision | Reason | Cost if wrong |
|---|---|---|---|
| (no id) | The pass has two plans, one for each app, in two worktrees at the same time. | The apps share no file that the pass changes. | A merge conflict in a doc or a test, seen at the second merge. |
| (no id) | The wave goes from the owner's request to the plan with no approval stop for the spec. | The owner asked for the cleanup "in one go", and the practice of this repo is rulings in the record. | A correction that the owner did not want. Each one is a separate commit and can go back. |
| D1 default | Players above the player count stay stored, with a mark. The other option is a confirm dialog. | G2, and no new dialog (G5). | One mark that the owner does not want. |
| CB1 | A page removes a stored key only when that page wrote the key or restored its state from it. TB3-3 and TB3-4 later made this rule narrower. | Under the first design, a second tab with an empty state deleted the work of the first tab (P1). | A removed item comes back in a tab that never wrote the key. |
| CB2 | Under CB1, a user change that makes the state empty removes the key at once, when the page owns the key. | P10. | Not stated. |
| CB3 | Each file gate requires one key of its own kind. A file of the wrong kind gives the existing error message and changes nothing. | With the new autosave rule, a file of the wrong kind made the stored encounter empty (P6). | A hand-made file with none of the keys gets the error message. |
| CB4 | Task 5 is split into 5a and 5b, and 5b gets the four missing checks. | P7. | Not stated. |
| CB5 | P2 to P5, P8, P9, P11 and P13 to P17 are accepted as the reviewer wrote them. | The reviewer's own corrections. | Not stated. |
| CB6 | The parked glossary-tab selector item is proved or removed. A headless check of ten hash values gave no throw, so the item was removed (spec §12). | P12. | Not stated. |
| CB7 | In each view, a custom name `A & "B" <C>` reads back as typed. This is also a check of the browser proof. | P15. | Not stated. |
| CB8 | Q1 to Q6 go to the plan author as fix round 2, with no third review. Q5 is one `markDirty()` call in `handleLoadPlayers`, with a check in Task 3. | The corrections are the reviewer's own words, and the controller checks the diff against the list. | A wrong plan line reaches an implementer, and the task review finds it. |
| TB1-1 | F1, F2, F3 and F6 (gaps of the fixture tables of the plan) go directly to the implementer. | The reviewer named each row and ran F1 and F2. | Not stated. |
| TB1-2 | F4 and F5 are accepted as written (`Object.create(null)` in `sameThreatData`, a comment that names E1 and E4). | Reviewer's correction. | Not stated. |
| TB1-3 | The controller amends the E4 sentence of the spec (commit `0f9db36`). | F7: `repairThreat` over 14 past versions of `threats.json` repairs only 8 threats of one old dataset. | Not stated. |
| (no id) | The one open Minor check of the Task 1 re-review (key order inside the items of a list in `sameThreatData`) goes into the dispatch of Task 4. | Task 4 is the first user of `sameThreatData` (C8), and its review then has the check in scope. | None. |
| TB2-1 | F1 to F9 of the Task 2 review are accepted as the reviewer wrote them, all in `scripts/browser-bestiary.js`. | Reviewer's corrections. | Not stated. |
| TB2-2 | Three sinks stay with no hostile browser check: the count in the rename modal (B-6), the number fields N-1, N-2, N-3 and N-7, and "Part of: <mob name>". The fix round adds a step for the last one. | After the check, a file can carry only numbers in those fields, so the unit tests of `BestiaryCheck` are the proof. | Not stated. |
| TB2-3 | Two "Before the task" items go into the list "Late findings" (`App.switchTab` and the picker index). | Older than the pass. | Not stated. |
| (no id) | N1 (the compare check finds lost markup on a B6 key but not added markup) goes to the Task 2 implementer before Task 6, with no further re-review. | Task 6 is the first task that changes a B6 card, and the Task 6 review runs the compare. | Not stated. |
| (no id) | Task 5a waits until the review of Task 2 or Task 3 is in. | Three open reviews are the limit, and the Task 2 review judges the scenarios of each later task. | Some minutes of wait. |
| TB3-1 | The code order stays. Task 5a removes the delete loop of the player rows and gets one more check and one more browser line for 12 stored players. Task 5a closed it. | The branch ships as one deploy, so no user gets the state between Task 3 and Task 5a. | The merge waits for the check. |
| TB3-2 | `App.init` does not start when `BestiaryCheck` does not exist, and shows one message. The creator gets the same test in its Task 18. | A browser can hold an old page with a new script. | A user with a broken cache sees the message and reloads. |
| TB3-3 | `clearAutoSave()` removes the key only when the page owns it and the stored text is the text that the page last wrote or restored. Both keys. This makes CB1 narrower. | The newer work of a different tab stays. | A removed last item comes back in a tab whose key a different tab changed. |
| TB3-4 | The page owns the key after a restore only when the restored state is not empty. Both keys. | F4 of the Task 3 review. | Not stated. |
| TB3-5 | F5 and F6 of the Task 3 review are accepted as the reviewer wrote them. | Reviewer's corrections. | Not stated. |
| TB4-1 | `injectIntoEncounter` writes the builder key at once after it gives the threat a new id. | F1: after a split, each reload and Add of an unchanged threat showed the prompt and added one more id. | Not stated. |
| TB4-2 | F2 and F3 of the Task 4 review are accepted as the reviewer wrote them. | Three mutations stayed green. | Not stated. |
| TB4-3 | The rename writes the builder key at once, and `customizeThreat` asks for a confirm when the builder is not pristine. | Both are a loss of builder work with no word to the user (G2). | One more confirm for a threat with no name. |
| TB4-4 | One check for the half "no confirm for a pristine builder" of the Customize rule, with no further re-review. The owner flag in `app.js` stays as it is. | F4 of the re-review. The reviewer found no sequence where the flag lets a page remove a key that it must keep. | Not stated. |
| (no id) | Task 7 waits until one of the three open reviews (5a, 5b, 6) is in. | The limit of three open reviews. | Some minutes of wait. |
| TB5a-1 | `min-width: 0` on each `.pc-name-input`. TB5a-5 later added a second rule for the marked rows. | It also closes the old overflow of the normal rows from 1001 to 1024 px. | A short name input at a narrow sidebar. |
| TB5a-2 | A player above the count is not in the encounter list and not in the initiative order. The player stays stored, with the mark, and the stored `encounterOrder` keeps its entries. | The count is the number of players who take part. | A GM who wants each stored player in the list raises the count. |
| TB5a-3 | Each initiative handler tests `validity.badInput` first. A bad entry is a refused entry, not an empty one. | F3: an entry such as `e` cleared a stored initiative. | Not stated. |
| TB5a-4 | F4 and F5 of the Task 5a review are accepted as the reviewer wrote them. | Reviewer's corrections. | Not stated. |
| TB5a-5 | The mark of a marked row goes on its own line (`flex-wrap: wrap`, `order: 1`, `flex-basis: 100%`). | F1 stayed open for the marked rows from 1000 to 1024 px. | Not stated. |
| TB5a-6 | `moveItemInOrder` gets a place in the visible list and puts the item before the visible item at that place in the stored order, or at the end. TB10-8 and TB10-10 later added a step before the move. | F6: a drag landed one place off for each player that was stored and not in the list. | Not stated. |
| TB5b-1 | TB5a-3 for the player row and the player detail initiative boxes. Only a box that the user really emptied clears the initiative. | F1 of the Task 5b review. | Not stated. |
| TB5b-2 | F2 to F5 of the Task 5b review are accepted. The skill dropdown handler reads the stored entry, not the value box. | Reviewer's corrections. | Not stated. |
| TB6-1 | F1 to F3 of the Task 6 review (test script only), with no separate re-review. | Minor items with the reviewer's own fixtures. The controller reads the diff and runs the scripts. | Not stated. |
| TB7-1 | F1 and F2 of the Task 7 review: one more fixture and view in the names check, and a "no script" claim from a run that clears the hit list at each step. | Reviewer's corrections. | Not stated. |
| TB8-1 | F1 and F2 of the Task 8 review (test script only), with no separate re-review. | Reviewer's corrections. | Not stated. |
| TB9-1 | F1 and F2 of the Task 9 review (test script only). | Reviewer's corrections. | Not stated. |
| TB9-2 | The member line shows `Unknown` for a known threat with an empty name, as before the task. | The task changed a case that the brief did not name. | None. |
| TB9-3 | The typed Compendium search text that goes raw into `innerHTML` becomes item 7 of Task 10 (TB10-7). | The creator copy of the tab already escapes it. | Not stated. |
| TB10-0 | The late findings that a normal user can meet and that have a small correction go into one more task before the final review (items TB10-1 to TB10-5 of the plan). | The owner asked for "an overall pass for any bugs like those" in one go, and the final review then covers them at no more cost. | One task and one review more before the merge. |
| TB10-1 to TB10-5 | Plan Task 10 items 1 to 5: the drag place, the picker index, the safe-integer guard, the Compendium text, the hits of each step in the proof script. | TB10-0. | As TB10-0. |
| TB10-6 | A range band that is `null` prints `-` at the five sites that print the three bands. | Four weapons of `data/weapons.json` have `null` bands, and the creator review saw "6/null/null". | None seen. |
| TB10-7 | The bestiary Compendium escapes the typed search text in its "No entries found" line, as the creator copy does. | TB9-3. | None. |
| TB10-8 | Before a move, each shown entry with no stored entry goes into the stored order, in the shown order. TB10-10 later widened the step. | F1: a drop below the last entry missed the end when the user added threats after the first drag (3 of 20 drags). | Entries that the user added after the first drag are in the stored order after the next drag, at the places where they were shown. |
| TB10-9 | F2 and F3 of the Task 10 review: range checks over the four null-band weapons and a band of 0, a check for the `markDirty` call, a picker check, a report line. | Four range checks stayed green for `||` in place of `??`. | Not stated. |
| TB10-10 | The step stores each entry with no stored entry, the hidden players too, in the order that the list shows when each player counts. No more re-review. | A hidden player then keeps its place (TB5a-6). F4 of the re-review was a gap of TB10-8. | None seen. |

### Plan text that no longer matches the code

- Task 2: the plan names 18 scenarios. The script has a scenario `players12` (TB3-1, commit `110c92e`) and a scenario `drag` (Task 10). The full run has 175 checks.
- Task 3: the plan says that `_ownsAutoSave` becomes `true` after each write and each restore, and that `clearAutoSave()` removes the key when the flag is `true`. The code also keeps the last text, removes the key only when the stored text is equal to it, and owns the key only after a restore that is not empty (TB3-3, TB3-4). `App.init` stops with a message when `BestiaryCheck` does not exist (TB3-2).
- Task 4: the code has a helper `_isPristine()` that the plan does not name (report deviation 2). The rename modal and `injectIntoEncounter` write the builder key at once, and Customize asks for a confirm when the builder is not pristine (TB4-1, TB4-3). `loadThreatFromFile` returns `Invalid threat file` for a result with no data (report deviation 5). `app.js` still sets the builder owner flag after each restore, and the kept text stays `null` after a pristine restore (accepted by the Task 4 re-review, TB4-4).
- Task 5a: the plan names one CSS rule. The code has `min-width: 0` on `.pc-name-input` and the own-line rules of the marked row (TB5a-1, TB5a-5). The mark is `<span class="pc-extra-mark">Above player count</span>`. The encounter list leaves out the players above the count (TB5a-2). The list initiative handler tests `validity.badInput` first (TB5a-3). `moveItemInOrder` changed in this task (TB5a-6), and the plan does not name it.
- Task 5b: the player row and player detail initiative handlers test `validity.badInput` first (TB5b-1). The skill dropdown handler reads the stored entry (TB5b-2). A refused add quantity also calls `updateMobVisibility()`, and a builder number box falls back to `defaultValue` when the stored value is not a number (report deviations).
- Task 7: the plan lists the text inputs of B-2. These inputs already had an escape at the base, so the task changed the number inputs, the dropdown, the preview, both pickers, the modal count and the three textarea line breaks (report deviation).
- Task 9: the member line shows `Unknown` for a known threat with an empty name (TB9-2).
- Task 10: the plan says "Correct the index at ONE place". The index correction is in `handleDragMove` only, but `moveItemInOrder` also got an own-place return (report deviation 3) and the step of TB10-8 and TB10-10. `getEncounterListItems` has a new optional argument `includeHiddenPlayers` (default `false`). Item 2 uses a version counter `DataLoader.threatsVersion`, not a clear at the writers, and `bestiary/js/data-loader.js` changed (report deviations 1 and 2). Items 6 and 7 (TB10-6, TB10-7) are not in the plan text, and they changed `data-loader.js`, `encounter-tab.js`, `vehicles-tab.js` and `references-tab.js`. The plan expects 163 checks and the `drag` scenario. The full run has 175.
- Wave gate: the plan says "After Task 9". The gate ran after Task 10.

### Evidence

- Task 1: `test-bestiary-check.js` 90 checks at `740e639` (one more check came with Task 4 in `3e7ddb4`). Six mutations each fail a row. The review fuzzed 15,827 encounter cases and 74,404 threat cases with no throw and no wrong type.
- Task 2: `scripts/browser-bestiary.js`, baseline of 3379 entries from the unchanged tree. At `7d93959`, 25 PASS and 123 FAIL of 148 checks, as expected. The re-review got 51 PASS and 108 FAIL in each of three full runs at `27c21d8`, and the B6 compare rule passes for the list form of spec §9 and fails for a break elsewhere.
- Task 3: `test-bestiary-load.js` 40 checks, seven mutations each fail. The review: eleven mutations each fail, the real-page matrix matches spec §5.3, the scenarios are stable over three runs. The re-review: a page with no check module shows only the message, and both keys stay unchanged.
- Task 4: `test-bestiary-builder.js` 27 checks, ten mutations each fail, and `if (true)` fails the F4 check. The review: after edit, reload and Add, all 7 old entries keep their stats and damage (the base showed wounds 12 against max 5).
- Task 5a: `test-bestiary-inputs.js` 82 checks at `20603b4`, and the F6 mutation fails two checks. The review: 12 stored players stay in the key after the start, after Load Encounter and after Load Players (the base kept 10). A typed 20000 takes 32 ms (the base took 1569 ms). The re-review 2: at 390, 1000, 1010, 1024 and 1280 px, a real click on each of 6 remove buttons removes only its player.
- Task 5b: 12 checks of `test-bestiary-inputs.js` failed before the change, and six mutations each fail at `c9e9986`. The review: each other input refuses each bad value in under 75 ms with no NaN and no `null`. The re-review: all 20 number boxes of a shipped template show their stored numbers.
- Task 6: `test-bestiary-escapes.js` 26 checks (9 failed before), four mutations of the fix round each fail. The review probe: 83 PASS, 0 markers in the Threats tab, the sheet and the popups (9 script hits at the base). `--compare` passes against the reviewer's own baseline of `44084ae` (3379 keys).
- Task 7: 14 new checks failed before the change. The review: 60 of 60 clean checks in the builder views (31 fail at the base), 46 of 46 round trips of typed text, the same editor DOM for all 844 shipped threats, 27 of 28 mutations fail.
- Task 8: 20 new checks failed before the change, and the mutation fails 15 checks. The review: 0 markers and 0 script runs in the Task 8 views (the base ran script 54 times at load), the round trip of 6 names and 8 note texts is exact (76 mismatches at the base), 11 of 14 mutations fail.
- Task 9: `test-bestiary-escapes.js` 119 checks at `cbdb479`. The review: three full runs at `896f257` end `All checks passed` with 163 PASS, and the gate goes red for each of nine breaks. A probe with a cleared hit counter gave 123 steps and 0 script hits (4828 at `44084ae`). 35 of 41 views of shipped threats are the same HTML, and the other 6 differ only in the B6 list blocks.
- Task 10: `test-bestiary-late.js` 68 checks at `ccdbc1b` (3 failed before fix round 3), and two mutations each fail. The review: 156 of 156 mouse drags, 25 of 25 random drags with a reload and a Save and Load, 54 drags with hidden players, 12 of 12 touch drags. The re-review: 20 of 20 drags of part D, 30 of 30 with two unstored entries.

Gate of the branch at `ccdbc1b`:

- All 25 `scripts/test-*.js` scripts pass (the controller ran them).
- The full run of `scripts/browser-bestiary.js` prints `All checks passed` with 175 checks. `--compare` against the baseline of the unchanged tree passes with the 22 known keys (the `card:` and `mini:` keys of the 11 B6 ids). The implementer and the reviewer of Task 10 ran both at the last commits.
- Cache: all 17 tags of `bestiary/index.html` are at `?v=97`.
- Nothing under `creator/`, `shared/` or `data/` changed.

### Visible changes for a user

- A name, a note or a text from a file shows as text and runs no script. Typed text with `&`, `<` or quotes comes back exactly as typed (Tasks 6 to 9).
- A mob ability or a mob option that is a list shows as a list with names and texts. It showed "[object Object]" (Tasks 6 and 9).
- Players above the player count stay stored, show the mark "Above player count" in the Players box and are not in the encounter list (Task 5a). The mark is on its own line, and the remove button of each row stays inside the sidebar at each width (Task 5a).
- A number box accepts only a number inside its range. A bad entry such as `e` keeps the stored value, and the box shows it again (Tasks 5a and 5b).
- An empty add count adds nothing and shows 1. Before the pass, it added 1 (Task 5b).
- A loaded encounter is stored at once. A removed last item does not come back after a reload. A second tab does not delete the work of the first tab. A file of the wrong kind is refused with a message (Tasks 3 and 4).
- A threat file with no data gives "Invalid threat file" (Task 4).
- "Add to Encounter" keeps the data of a threat that is already in the encounter (Task 4).
- A new name from the rename modal stays after a reload. Customize asks for a confirm when the builder holds work, also with no name (Task 4).
- A mob whose threat is not in the data shows "Unknown threat (id)" and can be removed. It threw (Tasks 8 and 9).
- An individual whose mob is not in a hand-made file shows as a free row with its Remove control (Task 3, D2).
- A dragged entry lands at the place that the placeholder shows, the end of the list too. A drop at its own place changes nothing (Task 10).
- The builder pickers show a custom threat that loads after the first Browse (Task 10).
- 22 digits in a number box are refused. Before the pass, a skill Default stored 1 (Task 10).
- The Compendium prints "Skill of your choice +4". A range band with no value prints "-" (Task 10).
- A search text with markup in the Compendium shows as text in its "No entries found" line (Task 10).
- The page shows "The app did not load completely. Reload the page." when a script is missing (Task 3).
- In the Players box, the name box of each player row is 11 px narrower (198 px to 187 px at 1400 px and at 390 px), and the remove button now ends at the edge of the row. Before the pass, the button ended 11 px past the row at each width. The cause is `min-width: 0` on `.pc-name-input` (ruling TB5a-1, Task 5a). The final review found that this change was in no list for the user (finding X4).


### Open decisions of the owner

- D1, players above the count. Default in place: the players stay stored, with a mark and their `×`, and are not in the encounter list (TB5a-2). The other option is a confirm dialog that names the players before a lower count deletes them.

The ledger names no other owner decision.

### Late findings that are not corrected

Rules of the game:

- An ability whose type is not in `ABILITY_TYPES` is in the picker index but never in a picker list, and its editor select shows the first option (`threat-builder-tab.js`, near `:923` and `:415`).

Stored data:

- An edit or an add followed by a reload inside the 2-second autosave delay is lost (base and task). The browser's leave prompt shows each time. The final review measured it: a reload after 300, 1500 or 1900 ms loses the edit, and after 2300 ms the edit stays (finding X5; an earlier line of the ledger said 300 ms).
- An old cached `app.js` with a new `encounter-state.js` still fails in the restore, and the next add writes over the key (a narrow cache mix).
- A removed entry keeps its stored order entry (not shown).
- The first drag stores only the shown entries, so hidden players come back at the end of the list, sorted by initiative (seen at `8076b1b`, before TB10-10).
- The save code frees the file link 1 s after the click. In a long probe, the browser cancelled the Save download two times (older than the pass).

Display:

- `App.switchTab` empties a bottom sheet that opens within 320 ms of the switch (`bestiary/js/app.js:23-33`).
- A custom threat stays in the Threats tab and the pickers after the user removes its entries, until a reload.

Test and proof tooling:

- `runCompare` passes a B6 key that is the same as the baseline (the `b6` scenario carries that proof).
- The `c10` scenario does not read the member text (the unit check N-8 carries it).

**From the final review ("Before the branch")**

- A page with one tab script missing (`settings-tab`, `threats-tab`, `vehicles-tab`, `glossary-tab`, `references-tab`, `encounter-tab` or `threat-builder-tab`) stops in `App.init` before the restore. The next add, typed builder name or player then writes over both stored keys. The base does the same. Ruling TB3-2 covers only `bestiary-check.js`. This is the most serious open item of the list: it can replace stored work after a load that failed in part.
- Old code deletes the players that this code keeps above the player count: a cached page of the code before the pass, or the old single-app site on the same origin, removes them from its state and from the key at its start (finding X1; spec section 5.2 names the limit).
- The builder Shock text box stores -5 for "-5" and `Infinity` for 400 digits. The next load repairs the value to 1.
- The template search and the builder Load from File replace the builder threat with no confirm. Customize asks.


### Not checked

- Firefox and WebKit. Each review ran in headless Chromium.
- Touch on real hardware and on a real phone. Drags at 390 px and in a list that scrolls.
- A real clipboard paste (the reviews used `execCommand('insertText')`). Mouse clicks on the spin buttons (the Task 5b review used the arrow keys).
- A real `.encounter`, `.threat` or `.players` file from a user. None is on this machine.
- Stored custom threats and the key shapes of the old single-app site.
- The saves of the Electron wrappers (separate projects).
- The mobile sidebar Load and Clear buttons, a real iOS picker and a storage quota failure.
- Stored notes with CR LF.
- A write from another browser process between the two storage reads of a restore.
- Glossary popups in the builder preview and real pointer hover.
- The weapon and ammo pickers of the encounter tab, by reading only.
- The count in the rename modal (B-6) and the number fields N-1, N-2, N-3 and N-7 with a hostile file (TB2-2). After the check, a file can carry only numbers there, so the unit tests of `BestiaryCheck` are the proof.
- The hidden-player case with unstored entries of TB10-10 has unit checks only. Fix round 3 of Task 10 had no re-review.

### Wave table

| Task | Model | Dispatches | Send-backs | Gate | Commits |
|---|---|---|---|---|---|
| Audits 1 to 3 | opus (general-purpose) | 3 | 0 | Read-only. Audit 3: C1 to C11 (3 S1, 5 S2, 3 S3) | none |
| Spec and plan | opus (general-purpose) | 1 | 2 | Plan review: 1 Critical, 6 Important, 10 Minor, all closed. Re-review: Q1 to Q6 (2 Important, 4 Minor), applied in round 2 | `989441a`, `f10c400`, `e922f23` |
| Task 1 The `BestiaryCheck` module and the cache bump | opus (implementer) | 1 | 1 | Review: spec PASS, 2 Important, 5 Minor, all closed (F7 by a spec text). APPROVED | `f0a0bce`, `740e639` (controller `0f9db36`) |
| Task 2 The browser proof script and the DOM baseline | sonnet | 1 | 3 | Review: spec FAIL, 3 Important, 6 Minor, all closed. N1 Minor closed. APPROVED | `7d93959`, `27c21d8`, `578328a`, `110c92e` |
| Task 3 Encounter loads, the encounter autosave and the player file | opus (implementer) | 1 | 1 | Review: spec PASS, 1 Critical (closed in Task 5a, TB3-1), 1 Important, 4 Minor. APPROVED | `610377a`, `36cdf17` (controller `1bdbb65`) |
| Task 4 Threat files, the builder autosave and Add to Encounter | opus (implementer) | 1 | 2 | Review: spec PASS, 1 Important, 2 Minor. Re-review: 1 Minor (F4). All closed. APPROVED | `3e7ddb4`, `95781cf`, `9f4b141` |
| Task 5a The encounter writers, the Players box, the list initiative and the player rows | sonnet | 1 | 2 | Review: spec PASS, 3 Important, 2 Minor. Re-review 1: F1 open, F6 Minor. Re-review 2: all closed. APPROVED | `ad02d03`, `4c220fb`, `20603b4` (controller `cf8bf4d`) |
| Task 5b The add counts, the builder number fields and the other initiative boxes | sonnet | 1 | 1 | Review: spec PASS, 1 Important, 4 Minor, all closed. APPROVED | `9690fa3`, `c9e9986` |
| Task 6 Escape the Threats tab, the Copy text and the mob ability lists | sonnet | 1 | 1 | Review: spec PASS, APPROVED, 3 Minor. Corrected | `d5cc24e`, `749de92` |
| Task 7 Escape the threat builder | sonnet | 1 | 1 | Review: spec PASS, APPROVED, 2 Minor. Corrected | `53a9c0e`, `ecbd568` |
| Task 8 Escape the encounter list, the player detail and the notes | sonnet | 1 | 1 | Review: spec PASS, APPROVED, 2 Minor. Corrected | `243bcea`, `903496e` |
| Task 9 Escape the encounter details and the mini card | sonnet | 1 | 1 | Review: spec PASS, APPROVED, 3 Minor. Corrected | `896f257`, `cbdb479` |
| Task 10 Late findings | sonnet | 1 | 3 (round 1: controller items 6 and 7, not review findings) | Review: spec FAIL (item 1), 1 Important, 2 Minor. Re-review: 1 Minor (F4), closed by TB10-10 with no re-review. APPROVED | `03850be`, `8076b1b`, `a6b548b`, `ccdbc1b` (controller `d68eb73`) |
| Plan and task reviews | opus, xhigh (reviewer) | 12 | 0 | 9 scoped re-reviews through the same reviewers: plan, Tasks 1, 2, 3, 4, 5a (two), 5b, 10 | none |
| Wave record draft | opus (ste-writer) | 1 | 0 | The controller added the final review part, one visible change and four late findings | none |
| Final review | fable, xhigh | 1 (resumed three times after HTTP 529) | 1 fix dispatch (X2) to the Task 3 implementer | READY TO MERGE; X1 to X5 closed | `601f39a`, `b50c36d` |

### Final review

The final review of the full branch ran on a `general-purpose` agent with the model `fable` at effort `xhigh`, on the range `44084ae..ccdbc1b`. The run stopped three times with a server error (HTTP 529). The controller resumed it each time, and the agent kept its context and its result files.

**Result: ready to merge.** No Critical finding and no Important finding. Five Minor findings: four in documents, one in a test.

| Finding | Kind | What | Correction |
|---|---|---|---|
| X1 | doc | Old code deletes the players that the head keeps above the player count (a cached old page, or the old single-app site on the same origin). No correction is possible in this branch. | Spec sections 5.2 and 14 name the limit (commit `601f39a`). |
| X2 | test | No check failed when the load of an empty encounter file by an owner stopped clearing the key. The product was correct. | Commit `b50c36d`: four checks in `scripts/test-bestiary-load.js` (44 checks). The reviewer's mutation fails two of them. |
| X3 | doc | The spec did not hold Task 10, and one sentence of section 14 was false after it. | A new spec section 15 with the rules of Task 10, and the corrected sentence (commit `601f39a`). |
| X4 | doc | The name box of each player row is 11 px narrower, and the remove button ends at the row edge. The change was in no list for the user. | The part "Visible changes for a user" of this record. |
| X5 | doc | One line of the late findings said "within 300 ms" for a window that is the full 2-second autosave delay. | The ledger line and this record. |

Controller ruling: commit `b50c36d` had no separate re-review. It changes one test script, and the controller ran all 25 scripts and the gate at that commit.

Evidence of the review (the files are in the session scratch folder and are not in the repo):

- **Base to head:** a full encounter built through the UI of `44084ae` restores at the head with the same state, the same list order and no warning. The start writes no key. Base and head in turn change nothing but the edit. The builder key round-trips in both directions. A state built through the UI of `74924bb` and older shapes load with no change.
- **Start states:** no key; 17 wrong encounter shapes and 7 wrong builder shapes (0 page errors, each tab usable, the key unchanged); blocked storage in two modes; no `bestiary-check.js` (the message only, the keys unchanged).
- **Imports:** the three files that the Save buttons of the base wrote load with the same data. 19 files of the wrong kind are each refused with no change to the state or the keys.
- **Hostile probe:** a marker in each string field and id, through each import and both stored keys: 321 steps at 1400 px and 321 at 390 px give 0 script hits, 0 injected elements and 0 page errors. The same probe at the base is bad in 6 of 6 steps.
- **Sink pass:** `glossary.js`, `glossary-tab.js`, `references-tab.js`, `vehicles-tab.js`, `settings-tab.js`, `app.js` and `data-loader.js` write no value from a file or the storage.
- **Normal user:** base against head at 1400, 1010 and 390 px: the DOM and the values of 56 to 58 views are the same. The only DOM change is "6/null/null" to "6/-/-" for the four weapons with a null band.
- **Moves:** 8017 state moves with random operations match a model, and 32 real mouse drags land where the placeholder shows.
- **Mutations:** 44 of 47 product mutations fail a unit check. Two survivors are equivalent, and the third is X2.
- **Audit findings:** C1 to C11, D1, D2 and B6 are each closed.
- **Deploy checks:** 17 tags at `?v=97`, with the new tag after `data-loader.js`; nothing changed under `creator/`, `shared/`, `data/`, `feedback-worker/` or `.github/`; `git merge-tree` shows no conflict with `bug-pass-creator`; 38 of 38 scripts pass in the merged tree of both branches. The three wargear id corrections of the creator branch change three Starting Wargear lines of the bestiary Compendium (for example "Servo Harness" becomes "Astartes Servo Arm").

Not checked by the final review: touch drags, Firefox and WebKit; the real cache behavior of GitHub Pages and the real key shapes of the old single-app site; real user files, a storage over its quota and the iOS file picker; the clipboard content after Copy.

**Wave gate at the branch head `b50c36d`** (the controller ran it on 2026-11-16): all 25 `scripts/test-*.js` pass; the full run of `scripts/browser-bestiary.js` prints `All checks passed` with 175 PASS and 0 FAIL; `--compare` against the baseline of the unchanged tree prints `All checks passed` with 22 allowed keys; `git diff 44084ae..HEAD` is empty under `creator/`, `shared/` and `data/`.
