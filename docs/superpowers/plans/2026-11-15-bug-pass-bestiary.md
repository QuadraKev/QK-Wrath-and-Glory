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
| member of a dropped mob (P9) | `mobs[0].id = 5` (the members keep the old mob id) | `['mobs[0]', 'individuals[i].mobId', …]` for each member, in table order | each member's `mobId` is `null` |
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
| `c3` | Add `sly_marbo_aaa` once and a mob of 2 `astra_militarum_trooper`, and one player. For each of `#individual-notes`, `#mob-notes`, `#player-notes`: select the row, fill `\nHP &lt;5 &amp; </textarea> x` (it starts with a line break, P5), select the row again, read the box; press End, type `!`, read the stored notes. Wait 2.5 s, reload, read the three stored notes. Builder: fill the description box (`textarea[data-field="description"]`) with `\nfirst line`, call `ThreatBuilderTab.renderEditor()`, read the box. | `c3: <kind> notes survive a redraw`, `c3: <kind> notes survive an edit` (the stored value is the typed value plus `!`, with the leading line break), `c3: the notes survive a reload`, `c3: a builder description keeps its leading line break` |
| `c4` | Add `sly_marbo_aaa`, wait 2.5 s. Load Encounter B: `{ version: 1, settings: { tier: 2, playerCount: 3, name: 'B', round: 4 }, individuals: [], mobs: [], playerCharacters: [{ id: 'p1', name: 'Bravo', initiative: null, notes: '' }], vehicles: [], encounterOrder: null, customThreats: [] }`. Reload at once. | `c4: a loaded file survives an immediate reload` (`{ ind: 0, pc: ['Bravo'], round: 4 }`) |
| `c5` | Add `sly_marbo_aaa`, wait 2.5 s, click its `.delete-btn`, reload at once (CB2: no wait). Builder: fill `[data-field="name"]` `X`, wait 2.5 s, fill it with `''`, reload at once. | `c5: a removed last threat stays removed`, `c5: the encounter key is gone`, `c5: a builder made pristine stays empty`, `c5: the builder key is gone` |
| `twotabs` | Two pages A and B in one context (one `localStorage`), both opened on an empty store (CB1). A: add `sly_marbo_aaa`; builder name `A1`; wait 2.5 s. B: change the tier select to 2, click `#btn-round-plus`, click `#btn-sort-initiative`; builder: fill the name `Z`, then `''`; click the encounter Clear and the builder Clear (the dialogs are accepted); wait 2.5 s. Read both keys. | `twotabs: the encounter key of tab A stays`, `twotabs: the builder key of tab A stays` |
| `gates` | Encounter tab: Load Encounter with `hostile.threat`; then with `hostile.players`. Builder: Load with `hostile.encounter`. Load Players with `hostile.encounter`. Before the four loads, add `sly_marbo_aaa` and a builder name `G`, wait 2.5 s, and keep both stored strings. (CB3) | `gates: a threat file in Load Encounter shows the error and changes nothing`, `gates: a players file in Load Encounter …`, `gates: an encounter file in the builder Load …`, `gates: an encounter file in Load Players …` (each: the notification text, the state and both stored strings are unchanged) |
| `names` | Load Encounter with a custom threat `{ id: 'custom_names', name: 'A & "B" <C>', abilities: [{ type: 'ACTION', name: 'Names hit', description: 'd' }], tierThreat: { '1': 'T', '2': 'T', '3': '-', '4': '-', '5': '-' }, wounds: 3 }`, one free individual and a mob of two of it (mob name `A & "B" <C> Mob`) (CB7, P15). | `names: <view> reads back as typed` (`textContent`, or `.value` for an input; the expected value is the stored string) for each view: `.threat-list-name`, `.threat-card-title`, the encounter rows `.encounter-item-name` (individual and mob), the individual detail `h3`, the mob detail `h3`, the member `.member-name`, the builder name input after Customize, the preview `.threat-card-title`, the template search item, the ability picker `.ability-picker-item-threat` of `Names hit`, and the input `#inject-modal-name` after `ThreatBuilderTab.showInjectModal(ThreatBuilderState.threat.name, 1)` |
| `c6` | Add `sly_marbo_aaa` and set its bonus to Adversary. Fill `#encounter-players` with `''`, press Tab. Add two players by name. Fill `0`, press Tab. | `c6: an empty Players box keeps the count` (`{ count: 4, box: '4' }`), `c6: max wounds stay finite` (the value is `wounds + 4 + 1`), `c6: Players 0 keeps both players` |
| `c7` | Fill `#encounter-players` with `20000`, press Tab. Threats tab, open `sly_marbo_aaa`, fill `#threat-add-quantity` with `20000`, click `#threat-add-to-encounter-btn`. Builder: name `Q`, fill `#builder-inject-count` with `25`, click `#btn-builder-inject`. New context: put an autosave with one individual and `playerCount: 300000`, reload, time until `#encounter-list .encounter-item` shows. | `c7: Players 20000 is refused` (count 4, 4 rows), `c7: quantity 20000 adds nothing` (and the box shows `1`), `c7: inject count 25 adds nothing`, `c7: a stored count of 300000 starts in under 5 s`, `c7: the stored count loads as 10`, `c7: one warning names settings.playerCount` |
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
Run the scenarios. Expected at this tree: each scenario prints at least one `FAIL`. Record the number of `FAIL` lines for each scenario. This is the failing-test proof for Tasks 3-9. `twotabs` can pass at this tree in its tier line (the base tree never removes the key on an empty state), but its Clear line fails.

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
  - `handleLoadPlayers`: the gate of spec §4.2 (key `players`).
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

- [ ] **Step 3: Run the test to see it fail**

Run: `node scripts/test-bestiary-load.js 2>&1 | grep -E '^FAIL' | head -40; node scripts/test-bestiary-load.js 2>&1 | tail -1`. Expected: FAIL for checks 2-5 and 7-17. Checks 1 and 6 pass today.

- [ ] **Step 4: Change the code**

- The flag, `markDirty`, `clearAutoSave`, `_performAutoSave` and `clearEncounter`: spec §5.2.
- `loadFromData(data, priorPaths = [])`: spec §4.6 steps 1-5. Keep the existing injects and assignments.
- `loadEncounterFromFile`: the gate, then `this.loadFromData(result.data)`, `this.settings.name = result.fileName`, `this.markClean()`, `clearTimeout(this._autoSaveTimer)`, then `this._performAutoSave()` for a state that is not empty, or `this.clearAutoSave()` for an empty one. Return `result` as today.
- `getEncounterListItems`: the two names of spec §4.7.
- `checkAutoSave`: spec §4.2 and §4.6 (`repairCustomThreatList(saved, 'customThreats', 'autosave.customThreats')`, inject, `loadFromData(saved.encounter, paths)`, set the flag). The builder part: the gate, the existing call, the flag.
- `handleLoadPlayers`: the gate, then `const paths = BestiaryCheck.repairPlayers(data)`, one warning when `paths.length > 0`, then the existing code.

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
5. `import: a file of 5 shows Error: Invalid threat file`; `import: a players file shows Error: Invalid threat file` (`{ version: 1, playerCount: 3, players: [] }`; no entry is added); `import: an id of 7 gets a custom_ id`.
6. `load: a file of [] gives Invalid threat file`; `load: an encounter file gives Invalid threat file and changes nothing` (`{ settings: {}, individuals: [] }`: the builder threat and the stored builder string do not change); `load: an id of 5 and skills of 5 load` (no throw, id starts with `custom_`, `skills` serializes to `Default 0`, the warning names `skills`).
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

- [ ] **Step 6: Run all test scripts and the browser scenarios** — `--only c6`, `d1`, `inputs`. Expected: `c6`, `d1`, the Players line of `c7` and the list-initiative lines of `inputs` pass.

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

Unit checks (the stable-stub document of Task 5a; each stub input gets its declared `min` and `max`: `#threat-add-quantity`, `#builder-inject-count` and `#inject-modal-count` `min = '1'`, `max = '20'`):

- `quantity: 25 adds nothing and shows 1` — `ThreatsTab.bindAddToEncounterEvents(container, 'sly_marbo_aaa')`; `#threat-add-quantity` value `'25'`; `_on.click()` of `#threat-add-to-encounter-btn`: no entry, value `'1'`. With `'3'`: 3 entries.
- `inject count: 25 adds nothing` — builder name `Q`; `#builder-inject-count` value `'25'`; `_on.click()` of `#btn-builder-inject`: no entry.
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
- `names: a custom name is escaped one time in the builder` — the preview, the template search and the ability picker of a threat named `A & "B" <C>` hold `A &amp; &quot;B&quot; &lt;C&gt;` and no `&amp;amp;`. The name input holds `value="A &amp; &quot;B&quot; &lt;C&gt;"`.

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

## Wave gate

After Task 9, the controller runs, on the branch head:

1. The loop of the Global Constraints. Expected: no `FAIL`.
2. `… browser-bestiary.js --compare "$BASELINE"`. Expected: `All checks passed`. The differing keys are only `card:` and `mini:` keys of the 11 B6 ids.
3. `… browser-bestiary.js`. Expected: `All checks passed`.
4. `git diff 44084ae --stat -- creator shared data` is empty.
