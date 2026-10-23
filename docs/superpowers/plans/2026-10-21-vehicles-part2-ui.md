# Vehicles Part 2 (UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bestiary Vehicles tab, vehicles in the Encounter Builder, and the vehicle traits and rules in both Rules References.

**Architecture:** A new tab module, `VehiclesTab`, reads `data/vehicles.json` through three new `DataLoader` accessors. It builds a book-style card from the existing threat-card classes. The Encounter Builder keeps vehicles in a fourth array, and its detail panel uses the card's stat block again. Both Rules References show the two new glossary sections. No popup engine registers them as inline terms. Card chips open them by key through a new `Glossary.showEntryPopup()`.

**Tech Stack:** Vanilla JS with one global object per file and no build step. Node 22 for the test scripts. The Playwright MCP tools for the browser checks.

**Spec:** `docs/superpowers/specs/2026-10-20-vehicles-design.md`. This plan covers the UI half of §3, all of §4 and §5, and the cache busting and `CLAUDE.md` items of §7.

**Depends on:** Part 1, `docs/superpowers/plans/2026-10-21-vehicles-part1-data.md`. Part 1 writes `data/vehicles.json`, the `vehicleTraits` and `vehicleRules` sections of `data/glossary.json`, and `scripts/test-vehicles.js`. Issue: #28.

## Global Constraints

- Part 1 must land first. `node scripts/test-vehicles.js` must print `All checks passed.` Task 2.1 Step 1 checks this.
- Do not edit `data/` or `scripts/test-vehicles.js`. Part 1 owns them. If the data does not agree with this plan, stop and report the mismatch.
- Data shape (spec §2.1, §2.2 and the "Interfaces for Part 2" section of the Part 1 plan): prose fields are plain text with `\n\n` between paragraphs and no `<` or `>`. Show them with `white-space: pre-line`. A weapon line is `{ text, weaponId, count }`, plus `twin: true` on a Twin line. A line can also carry `profileIds`: two or more `weapons.json` ids, with `weaponId: null`. The table then shows one row per profile, named by the record.
- No build step. Load each file with a plain `<script>` tag. Each JS file defines one `const` global object. Do not use ES modules, classes or IIFEs (`STYLE_GUIDE.md`).
- Match the code around each edit. Do not reformat, rename or clean up code that a task does not name.
- New CSS uses the `:root` variables only. Do not add raw colour values.
- The UI shows data text as the data stores it. Code adds labels only, never game text. Add no `[AI-Generated]` text.
- Do not add `vehicleTraits` or `vehicleRules` to `buildTermMap` or to `gatherDefinitionsByName` in either app's `js/glossary.js` (spec §3, "No inline links").
- Popup types: `vehicleTrait` and `vehicleRule`. Deep links: `#glossary/vehicleRules-<key>` and `#vehicles/<id>`.
- An encounter vehicle is exactly `{ id, vehicleId, wounds, initiative }`. `wounds` is the damage taken. Max Wounds is the vehicle record's `wounds`. A vehicle is destroyed when `wounds` is more than Max Wounds. No flag is stored.
- Saves keep `version: 1`. A save without `vehicles` loads as `[]`. An entry whose `vehicleId` does not resolve stays in the encounter.
- Fixed texts: `Unknown vehicle` (list row), `Vehicle data not found` (detail panel), `Add to Encounter` (card button), `Variant of <family name>` (card link).
- A vehicle gets no bonus, no Shock, no mob, and no Elite or Adversary scaling. The card button is the only add path. The Threat Builder and Import Threat stay threat-only.
- The creator does not load `vehicles.json`. Creator edits are the Rules Reference (`creator/tabs/glossary-tab.js`, `creator/index.html`) and the cache busting.
- Out of scope: computed Twin profiles, copy text, vehicles in the creator, and inline links for vehicle names.
- Cache busting happens in Task 2.6 only. Bestiary: `?v=92` → `?v=93` on all 16 tags, the new `tabs/vehicles-tab.js` tag included. Creator: `?v=119` → `?v=120` on all 34 tags. Creator data: `?v=43` → `?v=44` in `creator/js/web-api.js`. Before Task 2.6, the new tag uses `?v=92`.
- Shell: use the Bash tool (Git Bash). A one-line repo command is `wsl -e bash -c 'cd /root/projects/QK-Wrath-and-Glory && <command>'`. A command with `$`, nested quotes or more than one line goes through `wsl -e bash -s <<'EOF'` … `EOF`.
- Files: use the Read, Edit and Write tools. The repo root on Windows is `\\wsl.localhost\Ubuntu-24.04\root\projects\QK-Wrath-and-Glory\`. All paths in this plan are relative to it.
- Tests: each script prints `PASS`/`FAIL` lines and a summary line. It exits with 0 when all checks pass. Read only the last line (`| tail -1`). If it reports a failure, read the failures with `| grep -A1 FAIL`.
- Commits: use `/usr/bin/git` in WSL with `--author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>"`. Write a one-sentence imperative subject. Add no `Co-Authored-By` or other attribution lines. Add files by name and never use `git add -A` (`relic-final-form-step.png` stays untracked). Do not push or merge.
- Branch: Part 1 creates and checks out a `vehicles` branch before its first task, and every Part 1 commit lands on it. Part 2 runs on the same `vehicles` branch, so every Part 2 commit lands on it too. Task 2.1 Step 1 checks the branch. The merge into `main` and the push are the user's decision at the end.
- Secrets: never print `$GH_TOKEN`. Pipe all git output through `sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'`.
- Reviews: a `reviewer` agent reviews each task after its commit. After Task 2.6, `general-purpose` with `model: fable` reviews the whole `vehicles` branch against `main`.
- Browser checks (Playwright MCP):
  - Server: in Git Bash, run `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8137/bestiary/`. If it prints `200`, use that server. If not, start a server with the Bash tool and `run_in_background: true`: `wsl -e bash -c 'cd /root/projects/QK-Wrath-and-Glory && python3 -m http.server 8137 --bind 127.0.0.1'`.
  - Only one agent at a time uses the browser.
  - Cache: at the start of each check, run `browser_run_code_unsafe` with the code below. The browser then fetches every file again, so a check needs no `?v=` bump.

    ```js
    async (page) => {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
        return 'cache disabled';
    }
    ```

  - Clean state: where a step says "clear the storage", run `browser_evaluate` with `() => { localStorage.clear(); return localStorage.length; }`. Expect `0`. Then load the page again with a full load, so the app reads the cleared storage. A navigation that changes only the hash does not reload the page; a new `?cb=` value forces a full load.
  - Sizes: desktop is `browser_resize` with width 1400 and height 900. Phone is width 390 and height 844.
  - Clicks: `browser_click` takes a unique CSS selector in `target`. Where more than one element matches, the step clicks through `browser_evaluate` and `element.click()`. That click bubbles as a real click does.
  - Dialogs: both apps show a `beforeunload` dialog on a full page load while they hold unsaved changes. The bestiary does so after any encounter change. Clear Encounter shows a `confirm`. Answer each dialog with `browser_handle_dialog` and `accept: true`, then continue the step.
  - Console: at the end of each check, and after each navigation in Task 2.6, run `browser_console_messages` with `level: "error"`. Expect no messages. The repo has no `favicon.ico`, so a 404 for `/favicon.ico` can show. That message is not a failure; any other error is.
  - Screenshots: use `browser_take_screenshot` with `scale: "css"` and `filename: ".playwright-mcp/<name>.png"`. That folder is gitignored.

## Review Focus

1. **Card chip popups.** A click on a keyword chip, a trait chip or the Twin marker must open one popup that stays open. The click must not reach the document click handler, because that handler closes all popups. `threats-tab.js:811` gives `showPopup` one object where it expects an array, so do not copy that call. Pinned by Task 2.1 Step 2 and Task 2.4 Step 9.
2. **Repeated keys in the creator.** The creator uses the raw key as the entry id. `flyer` is also a keyword, and `reliable` is also a weapon trait. Each entry must show its own text and keep its own expanded state. Pinned by Task 2.1 Step 2 and Task 2.1 Step 9.
3. **Load Encounter from a file.** A file load goes through `loadEncounterFromFile()`, not `loadFromData()`. A saved file with vehicles must load with its vehicles. Pinned by Task 2.3 Step 1 and Task 2.5 Step 11.
4. **Variant link on a phone.** In the bottom sheet, a tap on "Variant of <family>" must show the family card. A hash change closes the sheet, and the sheet's 320 ms clean-up timer then empties the reopened sheet. Pinned by Task 2.4 Step 10.
5. **Second click on the Vehicle Damage link.** After the user goes back to the Encounter Builder, the same link must open the rule again. A plain hash link fires no `hashchange` event when the hash does not change. Pinned by Task 2.5 Step 10.

## File Structure

| File | Task | Change |
|---|---|---|
| `bestiary/js/glossary.js` | 2.1 | Popup types `vehicleTrait` and `vehicleRule` in `getEntry` and `getTypeLabel`. New `showEntryPopup()`. |
| `bestiary/tabs/glossary-tab.js` | 2.1 | The two categories in the `all` list and in `getCategoryLabel`. |
| `creator/tabs/glossary-tab.js` | 2.1 | The two categories, with `<section>-<key>` ids. |
| `creator/index.html` | 2.1, 2.6 | Two filter buttons. `?v=` bump. |
| `bestiary/js/data-loader.js` | 2.2 | `vehicles.json` in the load list. `getVehicles`, `getVehicle`, `getVehicleDisplayName`. Vehicle sources in `getAllSources`. |
| `bestiary/js/encounter-state.js` | 2.3 | `vehicles[]`, six functions, list rows, save and load. |
| `bestiary/tabs/vehicles-tab.js` | 2.4 | NEW. `VehiclesTab`: list, filters, card, chip popups, Add to Encounter, compressed card. |
| `bestiary/index.html` | 2.1, 2.4, 2.6 | Two filter buttons. Tab button, `#tab-vehicles`, script tag. `?v=` bump. |
| `bestiary/js/app.js` | 2.4 | `VehiclesTab.init()`, the `switchTab` branch, the `#vehicles/<id>` deep link. |
| `bestiary/css/styles.css` | 2.4, 2.5 | A Vehicles section at the end of the file. |
| `bestiary/tabs/encounter-tab.js` | 2.5 | Vehicle row, detail panel, row controls, delete. |
| `creator/js/web-api.js` | 2.6 | Data `?v=` bump. |
| `CLAUDE.md` | 2.6 | `vehicles` in the bestiary-only data list. |
| `scripts/test-vehicles-tab.js` | 2.1, 2.2, 2.4, 2.6 | NEW. Node checks for the Rules References, the data loader and the tab helpers. |
| `scripts/test-encounter-vehicles.js` | 2.3, 2.5 | NEW. Node checks for the encounter state, the saves, the rows and the panel. |

No change: `data/*`, `scripts/test-vehicles.js`, `creator/js/glossary.js`, both `tabs/references-tab.js` files (the Compendium), `bestiary/tabs/threats-tab.js`, `bestiary/js/web-api.js`.

---

### Task 2.1: Vehicle Traits and Vehicle Rules in both Rules References

**Agent:** implementer. The plan gives every edit and every check, and the edits are small and in known files.

**Files:**
- Modify: `bestiary/js/glossary.js:254-288` (`getEntry`, new `showEntryPopup`, `getTypeLabel`)
- Modify: `bestiary/tabs/glossary-tab.js:69-94` (`getCategoryLabel`, the `all` list)
- Modify: `bestiary/index.html:272` (two filter buttons)
- Modify: `creator/tabs/glossary-tab.js:68-91,180` (two categories, prefixed ids, group order)
- Modify: `creator/index.html:449` (two filter buttons)
- Create: `scripts/test-vehicles-tab.js`

**Interfaces:**
- Consumes: the Part 1 sections of `data/glossary.json`. `vehicleTraits` has 12 keys, for example `turbo_boost`. `vehicleRules` has at least the 40 required keys, for example `twin_weapons` and `vehicle_damage`. Each entry is `{ name, description, source: "church", page }`.
- Produces:
  - `Glossary.getEntry('vehicleTrait' | 'vehicleRule', key) → entry | null`.
  - `Glossary.getTypeLabel('vehicleTrait') → 'Vehicle Trait'` and `Glossary.getTypeLabel('vehicleRule') → 'Vehicle Rule'`.
  - `Glossary.showEntryPopup(type, key, anchorElement) → boolean`. It closes open popups, pins, and calls ``showPopup([{ ...entry, type, key }], anchorElement, `${type}-${key}`)``. For a missing entry it opens nothing and returns `false`. The caller's click handler must call `e.stopPropagation()`.
  - Rules Reference entry ids in both apps: `vehicleTraits-<key>` and `vehicleRules-<key>`. Deep link: `#glossary/vehicleRules-vehicle_damage`.
  - `scripts/test-vehicles-tab.js` with an async `main()` that holds one block per task. Later tasks insert their block above the line `    // --- end of checks ---`.

Decision in this task: the creator gives the `<section>-<key>` id form to the two new sections only. Older creator ids stay as they are. Five older keys already repeat across sections (`arc`, `melta`, `powered`, `rad`, `two_handed`); that is out of scope.

- [ ] **Step 1: Confirm that Part 1 has landed**

Run: `wsl -e bash -c 'cd /root/projects/QK-Wrath-and-Glory && /usr/bin/git branch --show-current && node scripts/test-vehicles.js | tail -1'`

Expected: `vehicles`, then `All checks passed.` If the branch is not `vehicles`, stop and report "BLOCKED: not on the vehicles branch". If the test file does not exist or a check fails, stop and report "BLOCKED: Part 1 has not landed".

- [ ] **Step 2: Write the failing test**

Create `scripts/test-vehicles-tab.js`:

```js
// Tests for the Vehicles UI (issue #28): the Rules Reference categories and popup types in both
// apps, the bestiary data loader's vehicle accessors, and the pure helpers of the Vehicles tab.
// Run: node scripts/test-vehicles-tab.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const readSource = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

let failures = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const glossary = readJson('data/glossary.json');

// A stand-in for the browser document. Elements keep their innerHTML, and
// insertAdjacentHTML calls are recorded, so a test can read what a tab rendered.
const fakeDocument = {
    elements: {},
    inserted: [],
    getElementById(id) {
        if (!this.elements[id]) {
            this.elements[id] = {
                innerHTML: '', value: '', scrollTop: 0, clientHeight: 0, scrollHeight: 0,
                addEventListener() {}, removeEventListener() {}
            };
        }
        return this.elements[id];
    },
    querySelector(selector) {
        return { insertAdjacentHTML: (position, html) => fakeDocument.inserted.push({ selector, html }) };
    },
    querySelectorAll() {
        return [];
    }
};

// The bestiary scripts share one context, as the page's <script> tags share one window.
const quietConsole = { log() {}, warn() {}, error: console.error };
const bestiary = { console: quietConsole, document: fakeDocument, CSS: { escape: (s) => s } };
vm.createContext(bestiary);
const load = (rel) => vm.runInContext(readSource(rel), bestiary, { filename: rel });
const get = (name) => vm.runInContext(name, bestiary);
load('bestiary/js/data-loader.js');
load('bestiary/tabs/settings-tab.js');
load('bestiary/js/glossary.js');
load('bestiary/tabs/glossary-tab.js');
const DataLoader = get('DataLoader');
const SettingsTab = get('SettingsTab');
const Glossary = get('Glossary');
const GlossaryTab = get('GlossaryTab');
DataLoader.cache['glossary.json'] = glossary;
Glossary.data = glossary;

async function main() {
    // --- Rules Reference and popup types (Task 2.1) ---
    {
        const traitKeys = Object.keys(glossary.vehicleTraits || {});
        const ruleKeys = Object.keys(glossary.vehicleRules || {});
        check('Part 1 data: glossary has the 12 vehicle traits', traitKeys.length, 12);
        check('Part 1 data: glossary has at least 40 vehicle rules', ruleKeys.length >= 40, true);

        // The engine resolves the two new popup types by key
        const turbo = Glossary.getEntry('vehicleTrait', 'turbo_boost');
        check('getEntry resolves a vehicle trait', !!turbo && turbo.name.startsWith('Turbo Boost'), true);
        check('getEntry resolves the Twin Weapons rule', !!Glossary.getEntry('vehicleRule', 'twin_weapons'), true);
        check('getEntry resolves the Vehicle Damage rule', !!Glossary.getEntry('vehicleRule', 'vehicle_damage'), true);
        check('getEntry returns null for an unknown vehicle trait', Glossary.getEntry('vehicleTrait', 'no_such_trait'), null);
        check('getTypeLabel names the vehicle trait type', Glossary.getTypeLabel('vehicleTrait'), 'Vehicle Trait');
        check('getTypeLabel names the vehicle rule type', Glossary.getTypeLabel('vehicleRule'), 'Vehicle Rule');

        // Spec section 3: the new sections never become inline links
        Glossary.termMap = new Map();
        Glossary.buildTermMap();
        const linkedTypes = new Set();
        for (const list of Glossary.termMap.values()) list.forEach(entry => linkedTypes.add(entry.type));
        check('buildTermMap registers no vehicle trait', linkedTypes.has('vehicleTrait'), false);
        check('buildTermMap registers no vehicle rule', linkedTypes.has('vehicleRule'), false);
        check('buildTermMap still registers conditions and keywords', linkedTypes.has('condition') && linkedTypes.has('keyword'), true);

        // showEntryPopup gives showPopup an ARRAY with one tagged definition
        const shown = [];
        const realShowPopup = Glossary.showPopup;
        Glossary.showPopup = (definitions, anchorElement, termKey) => shown.push({ definitions, termKey });
        check('showEntryPopup opens a known entry', Glossary.showEntryPopup('vehicleTrait', 'turbo_boost', {}), true);
        check('showEntryPopup passes one definition with its type and key',
            shown.length === 1 && Array.isArray(shown[0].definitions)
                ? [shown[0].definitions.length, shown[0].definitions[0].type, shown[0].definitions[0].key, shown[0].termKey]
                : null,
            [1, 'vehicleTrait', 'turbo_boost', 'vehicleTrait-turbo_boost']);
        check('showEntryPopup keeps the entry name for the title', shown[0] && shown[0].definitions[0].name, turbo && turbo.name);
        check('showEntryPopup pins the popup', Glossary._pinned, true);
        check('showEntryPopup refuses an unknown key', Glossary.showEntryPopup('vehicleRule', 'no_such_rule', {}), false);
        check('a refused key opens no popup', shown.length, 1);
        Glossary.showPopup = realShowPopup;
        Glossary._pinned = false;

        // Bestiary Rules Reference: labels, the All list, deep-link ids, the source toggle
        check('bestiary label for vehicle traits', GlossaryTab.getCategoryLabel('vehicleTraits'), 'Vehicle Traits');
        check('bestiary label for vehicle rules', GlossaryTab.getCategoryLabel('vehicleRules'), 'Vehicle Rules');
        GlossaryTab.currentCategory = 'all';
        GlossaryTab.searchText = '';
        GlossaryTab.renderGlossary();
        const skeleton = fakeDocument.getElementById('glossary-content').innerHTML;
        check('All shows a Vehicle Traits group', skeleton.includes('data-group-category="vehicleTraits"'), true);
        check('All shows a Vehicle Rules group', skeleton.includes('data-group-category="vehicleRules"'), true);
        check('a vehicle rule has the deep-link id vehicleRules-<key>', GlossaryTab._entryMap.has('vehicleRules-vehicle_damage'), true);
        check('a vehicle trait has the deep-link id vehicleTraits-<key>', GlossaryTab._entryMap.has('vehicleTraits-turbo_boost'), true);
        GlossaryTab.currentCategory = 'vehicleTraits';
        GlossaryTab.renderGlossary();
        check('the Vehicle Traits filter shows the 12 traits', GlossaryTab._orderedEntries.length, 12);
        GlossaryTab.currentCategory = 'all';
        SettingsTab.excludedSources.add('Church of Steel');
        GlossaryTab.renderGlossary();
        check('Church of Steel off hides the vehicle rules', GlossaryTab._entryMap.has('vehicleRules-vehicle_damage'), false);
        SettingsTab.excludedSources.clear();

        // Creator Rules Reference: its own context, with stub Glossary and State objects
        const creator = { console: quietConsole, Glossary: { data: glossary }, State: { isSourceEnabled: () => true } };
        vm.createContext(creator);
        vm.runInContext(readSource('creator/tabs/glossary-tab.js'), creator, { filename: 'creator/tabs/glossary-tab.js' });
        const CreatorGlossaryTab = vm.runInContext('GlossaryTab', creator);
        CreatorGlossaryTab.renderEntries = () => {};
        CreatorGlossaryTab.loadEntries();
        const entries = CreatorGlossaryTab.allEntries;
        const traits = entries.filter(e => e.category === 'vehicleTraits');
        const rules = entries.filter(e => e.category === 'vehicleRules');
        check('creator vehicle trait ids are vehicleTraits-<key>',
            traits.map(e => e.id).sort(), traitKeys.map(k => `vehicleTraits-${k}`).sort());
        check('creator vehicle rule ids are vehicleRules-<key>',
            rules.map(e => e.id).sort(), ruleKeys.map(k => `vehicleRules-${k}`).sort());
        check('creator names a vehicle rule entry',
            rules.length > 0 ? [rules[0].categoryName, rules[0].categoryPluralName] : null, ['Vehicle Rule', 'Vehicle Rules']);
        const olderIds = new Set(entries.filter(e => e.category !== 'vehicleTraits' && e.category !== 'vehicleRules').map(e => e.id));
        check('no vehicle entry id repeats an older entry id', [...traits, ...rules].filter(e => olderIds.has(e.id)).map(e => e.id), []);
        check('the FLYER keyword keeps its own id', entries.filter(e => e.id === 'flyer').map(e => e.category), ['keywords']);
        check('creator groups end with the two vehicle sections',
            CreatorGlossaryTab.groupByCategory(entries).map(g => g.category).slice(-2), ['vehicleTraits', 'vehicleRules']);
        CreatorGlossaryTab.currentCategory = 'vehicleRules';
        const filtered = CreatorGlossaryTab.getFilteredEntries();
        check('the creator Vehicle Rules filter shows every rule and nothing else',
            [filtered.length, filtered.every(e => e.category === 'vehicleRules')], [ruleKeys.length, true]);
    }

    // --- end of checks ---
}

main().then(() => {
    console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
    process.exit(failures === 0 ? 0 : 1);
}, (error) => {
    console.error(error);
    process.exit(1);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `wsl -e bash -c 'cd /root/projects/QK-Wrath-and-Glory && node scripts/test-vehicles-tab.js 2>&1 | grep -A1 -e FAIL -e Error'`

Expected: FAIL lines for the three `getEntry resolves` checks and the two `getTypeLabel` checks. Then `TypeError: Glossary.showEntryPopup is not a function`. The exit code is 1.

- [ ] **Step 4: Add the popup types and `showEntryPopup` to the bestiary engine**

In `bestiary/js/glossary.js`, replace this block in `getEntry`:

```js
            psychicPower: 'psychicPowers',
            keyword: 'keywords'
        };
        const category = typeToCategory[type];
        const block = category && this.data[category];
        return block && block[key] ? block[key] : null;
    },
```

with:

```js
            psychicPower: 'psychicPowers',
            keyword: 'keywords',
            vehicleTrait: 'vehicleTraits',
            vehicleRule: 'vehicleRules'
        };
        const category = typeToCategory[type];
        const block = category && this.data[category];
        return block && block[key] ? block[key] : null;
    },

    // Open the popup for one entry by type + key, pinned as a clicked term is. Card chips
    // (keywords, vehicle traits, the Twin marker) use it: vehicleTraits and vehicleRules are not
    // in buildTermMap, so no inline term exists for them. The caller's click handler must call
    // e.stopPropagation(), or the document click handler closes the popup at once.
    showEntryPopup(type, key, anchorElement) {
        const entry = this.getEntry(type, key);
        if (!entry) return false;
        this.closeAllPopups();
        this._pinned = true;
        this.showPopup([{ ...entry, type, key }], anchorElement, `${type}-${key}`);
        return true;
    },
```

In the same file, replace this block in `getTypeLabel`:

```js
        if (type === 'species') return 'Species';
        return 'Term';
```

with:

```js
        if (type === 'species') return 'Species';
        if (type === 'vehicleTrait') return 'Vehicle Trait';
        if (type === 'vehicleRule') return 'Vehicle Rule';
        return 'Term';
```

- [ ] **Step 5: Add the categories to the bestiary Rules Reference**

In `bestiary/tabs/glossary-tab.js`, replace this block in `getCategoryLabel`:

```js
            'keywords': 'Keywords',
            'characterTerms': 'Character Terms'
        };
```

with:

```js
            'keywords': 'Keywords',
            'characterTerms': 'Character Terms',
            'vehicleTraits': 'Vehicle Traits',
            'vehicleRules': 'Vehicle Rules'
        };
```

In the same file, replace this line in `renderGlossary`:

```js
            ? ['characterTerms', 'conditions', 'combatTerms', 'terms', 'weaponTraits', 'armorTraits', 'keywords']
```

with:

```js
            ? ['characterTerms', 'conditions', 'combatTerms', 'terms', 'weaponTraits', 'armorTraits', 'keywords', 'vehicleTraits', 'vehicleRules']
```

In `bestiary/index.html`, replace this line:

```html
                            <button class="glossary-filter-btn" data-category="keywords">Keywords</button>
```

with:

```html
                            <button class="glossary-filter-btn" data-category="keywords">Keywords</button>
                            <button class="glossary-filter-btn" data-category="vehicleTraits">Vehicle Traits</button>
                            <button class="glossary-filter-btn" data-category="vehicleRules">Vehicle Rules</button>
```

- [ ] **Step 6: Add the categories to the creator Rules Reference**

In `creator/tabs/glossary-tab.js`, replace this block in `loadEntries`:

```js
            { key: 'keywords', name: 'Keyword', pluralName: 'Keywords' }
        ];
```

with:

```js
            { key: 'keywords', name: 'Keyword', pluralName: 'Keywords' },
            // Some vehicle keys repeat older keys (flyer is also a keyword, reliable a weapon trait),
            // so these ids carry the section prefix, in the bestiary's `<section>-<key>` form.
            { key: 'vehicleTraits', name: 'Vehicle Trait', pluralName: 'Vehicle Traits', prefixId: true },
            { key: 'vehicleRules', name: 'Vehicle Rule', pluralName: 'Vehicle Rules', prefixId: true }
        ];
```

In the same function, replace:

```js
                for (const [id, entry] of Object.entries(categoryData)) {
                    this.allEntries.push({
                        id: id,
```

with:

```js
                for (const [id, entry] of Object.entries(categoryData)) {
                    this.allEntries.push({
                        id: cat.prefixId ? `${cat.key}-${id}` : id,
```

In `groupByCategory`, replace:

```js
        const categoryOrder = ['characterTerms', 'conditions', 'combatTerms', 'terms', 'weaponTraits', 'armorTraits', 'keywords'];
```

with:

```js
        const categoryOrder = ['characterTerms', 'conditions', 'combatTerms', 'terms', 'weaponTraits', 'armorTraits', 'keywords', 'vehicleTraits', 'vehicleRules'];
```

In `creator/index.html`, replace this line:

```html
                            <button class="glossary-filter-btn" data-category="keywords">Keywords</button>
```

with:

```html
                            <button class="glossary-filter-btn" data-category="keywords">Keywords</button>
                            <button class="glossary-filter-btn" data-category="vehicleTraits">Vehicle Traits</button>
                            <button class="glossary-filter-btn" data-category="vehicleRules">Vehicle Rules</button>
```

- [ ] **Step 7: Run the tests to verify they pass**

Run:

```bash
wsl -e bash -s <<'EOF'
cd /root/projects/QK-Wrath-and-Glory
node scripts/test-vehicles-tab.js | tail -1
node scripts/test-vehicles.js | tail -1
EOF
```

Expected: `All checks passed.` two times.

- [ ] **Step 8: Browser check: the bestiary Rules Reference**

Use the browser setup of the Global Constraints (server, cache, desktop size).

1. `browser_navigate` to `http://127.0.0.1:8137/bestiary/`. Clear the storage.
2. `browser_navigate` to `http://127.0.0.1:8137/bestiary/?cb=1#glossary/vehicleRules-vehicle_damage`. The new query string forces a full load, so no stored setting hides Church of Steel.
3. `browser_evaluate`:

   ```js
   () => ({
       tab: App.currentTab,
       expanded: !!document.querySelector('.glossary-entry.expanded[data-entry-id="vehicleRules-vehicle_damage"]'),
       hasTable: !!document.querySelector('.glossary-entry[data-entry-id="vehicleRules-vehicle_damage"] table'),
       lastButtons: [...document.querySelectorAll('.glossary-filter-btn')].slice(-2).map(b => b.textContent.trim())
   })
   ```

   Expected: `{"tab":"glossary","expanded":true,"hasTable":true,"lastButtons":["Vehicle Traits","Vehicle Rules"]}`.
4. `browser_click` with target `.glossary-filter-btn[data-category="vehicleTraits"]`.
5. `browser_evaluate` with `() => document.querySelectorAll('#glossary-content .glossary-entry').length`. Expected: `12`.
6. Read the console errors. Expected: none.

- [ ] **Step 9: Browser check: the creator Rules Reference**

1. `browser_navigate` to `http://127.0.0.1:8137/creator/`. Accept a `beforeunload` dialog if one shows. Clear the storage.
2. `browser_navigate` to `http://127.0.0.1:8137/creator/?cb=1#glossary/vehicleRules-vehicle_damage`. The new query string forces a full load.
3. `browser_evaluate`:

   ```js
   () => ({
       expanded: !!document.querySelector('.glossary-entry.expanded[data-entry-id="vehicleRules-vehicle_damage"]'),
       lastButtons: [...document.querySelectorAll('.glossary-filter-btn')].slice(-2).map(b => b.textContent.trim())
   })
   ```

   Expected: `{"expanded":true,"lastButtons":["Vehicle Traits","Vehicle Rules"]}`.
4. `browser_click` with target `.glossary-filter-btn[data-category="vehicleTraits"]`.
5. `browser_click` with target `.glossary-entry[data-entry-id="vehicleTraits-flyer"] .glossary-entry-header`.
6. `browser_evaluate`:

   ```js
   () => {
       const trait = document.querySelector('.glossary-entry[data-entry-id="vehicleTraits-flyer"]');
       const div = document.createElement('div');
       div.innerHTML = Glossary.data.vehicleTraits.flyer.description;
       return {
           traitExpanded: trait.classList.contains('expanded'),
           keywordExpanded: GlossaryTab.expandedEntries.has('flyer'),
           ownText: trait.querySelector('.glossary-entry-description').textContent.trim() === div.textContent.trim()
       };
   }
   ```

   Expected: `{"traitExpanded":true,"keywordExpanded":false,"ownText":true}`.
7. Take a screenshot: `.playwright-mcp/rules-reference-creator.png`.
8. Read the console errors. Expected: none.

- [ ] **Step 10: Commit**

```bash
wsl -e bash -s <<'EOF'
cd /root/projects/QK-Wrath-and-Glory
/usr/bin/git status --short | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
/usr/bin/git add bestiary/js/glossary.js bestiary/tabs/glossary-tab.js bestiary/index.html creator/tabs/glossary-tab.js creator/index.html scripts/test-vehicles-tab.js
/usr/bin/git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Add the Vehicle Traits and Vehicle Rules categories to both Rules References (#28)" 2>&1 | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
EOF
```

Expected: before the commit, `git status --short` lists only the files that this task touches, the files of the `git add` line. An untracked file that no task touches, such as `relic-final-form-step.png`, can also show; leave it. Then one new commit lands on the `vehicles` branch.

---

### Task 2.2: Vehicle data in the bestiary data loader

**Agent:** implementer. The task adds three small accessors and changes one function; the plan gives the code and the checks.

**Files:**
- Modify: `bestiary/js/data-loader.js:59-91` (load list and positional mapping), `:111-115` (accessors after `getThreat`), `:493-503` (`getAllSources`)
- Test: `scripts/test-vehicles-tab.js` (new block)

**Interfaces:**
- Consumes: `data/vehicles.json` (spec §2.1 shape). `SettingsTab._glossaryIdToNormalized`, the existing map in `bestiary/tabs/settings-tab.js:59-71` that gives `church` → `Church of Steel`.
- Produces:
  - `DataLoader.loadAll()` result key `vehicles` (an array, file index 13).
  - `DataLoader.getVehicles() → Vehicle[]`. It returns `[]` before the load.
  - `DataLoader.getVehicle(id) → Vehicle | undefined`.
  - `DataLoader.getVehicleDisplayName(vehicle) → string`. A variant gives `"<name> (<family name>)"`, for example `Crusader (Land Raider)`. A variant whose `name` already contains the family name gives `name` alone, for example `Land Speeder Tornado`. Any other vehicle gives `name`. A variant whose family is missing gives `name`. A missing vehicle gives `''`.
  - `DataLoader.getAllSources()` also lists the Settings name of every vehicle source (`Church of Steel`).

- [ ] **Step 1: Write the failing test**

In `scripts/test-vehicles-tab.js`, insert this block above the line `    // --- end of checks ---`:

```js
    // --- Data loader: vehicles.json and its accessors (Task 2.2) ---
    {
        bestiary.window = { api: { loadGameData: async (filename) => readJson(`data/${filename}`) } };
        const gameData = await DataLoader.loadAll();
        const fileVehicles = readJson('data/vehicles.json');
        check('loadAll maps vehicles.json to gameData.vehicles', gameData.vehicles.length, fileVehicles.length);
        check('the vehicles keep the file order', gameData.vehicles[0].id, fileVehicles[0].id);
        check('the injuries file keeps its slot', Array.isArray(gameData.injuriesCorruption.mutations), true);
        check('getVehicles returns the 107 cached vehicles', DataLoader.getVehicles().length, 107);
        check('getVehicle finds the Chimera', DataLoader.getVehicle('chimera').name, 'Chimera');
        check('getVehicle returns undefined for an unknown id', DataLoader.getVehicle('no_such_vehicle'), undefined);

        const crusader = DataLoader.getVehicle('land_raider_crusader');
        check('a variant shows its family in the display name', DataLoader.getVehicleDisplayName(crusader), 'Crusader (Land Raider)');
        check('a top-level vehicle shows its own name', DataLoader.getVehicleDisplayName(DataLoader.getVehicle('chimera')), 'Chimera');
        check('an Archaeopter block is top-level and keeps its stored name',
            DataLoader.getVehicleDisplayName(DataLoader.getVehicle('archaeopter_fusilave')), 'Archaeopter Fusilave');
        check('a variant whose name contains the family name shows the name alone',
            DataLoader.getVehicleDisplayName(DataLoader.getVehicle('land_speeder_tornado')), 'Land Speeder Tornado');
        check('a variant whose name lacks the family name shows the family',
            DataLoader.getVehicleDisplayName(DataLoader.getVehicle('attack_bike')), 'Attack Bike (Assault Bike)');
        const wrongNames = DataLoader.getVehicles()
            .filter(v => v.variantOf)
            .filter(v => {
                const familyName = DataLoader.getVehicle(v.variantOf).name;
                const expected = v.name.includes(familyName) ? v.name : `${v.name} (${familyName})`;
                return DataLoader.getVehicleDisplayName(v) !== expected;
            })
            .map(v => v.id);
        check('every variant follows the display-name rule', wrongNames, []);
        check('a variant with a missing family falls back to its own name',
            DataLoader.getVehicleDisplayName({ name: 'Crusader', variantOf: 'no_such_family' }), 'Crusader');
        check('a missing vehicle has an empty display name', DataLoader.getVehicleDisplayName(undefined), '');

        const sources = DataLoader.getAllSources();
        check('getAllSources lists Church of Steel once', sources.filter(s => s === 'Church of Steel').length, 1);
        check('getAllSources never lists the short id', sources.includes('church'), false);
        const allThreats = DataLoader.cache['threats.json'];
        DataLoader.cache['threats.json'] = allThreats.filter(t => t.source !== 'Church of Steel');
        check('the Church of Steel button stays without the Church of Steel threat',
            DataLoader.getAllSources().includes('Church of Steel'), true);
        DataLoader.cache['threats.json'] = allThreats;
    }

```

- [ ] **Step 2: Run the test to verify it fails**

Run: `wsl -e bash -c 'cd /root/projects/QK-Wrath-and-Glory && node scripts/test-vehicles-tab.js 2>&1 | grep -A1 -e FAIL -e Error'`

Expected: no FAIL line from the Task 2.1 block. Then `TypeError: Cannot read properties of undefined (reading 'length')`, because `gameData.vehicles` does not exist yet.

- [ ] **Step 3: Load `vehicles.json`**

In `bestiary/js/data-loader.js`, in `loadAll`, replace:

```js
            'species.json',
            'injuries-corruption.json'
        ];
```

with:

```js
            'species.json',
            'injuries-corruption.json',
            'vehicles.json'
        ];
```

In the same function, replace:

```js
            species: results[11] || [],
            injuriesCorruption: results[12] || {}
        };
```

with:

```js
            species: results[11] || [],
            injuriesCorruption: results[12] || {},
            vehicles: results[13] || []
        };
```

- [ ] **Step 4: Add the vehicle accessors**

In the same file, replace:

```js
    // Get threat by ID
    getThreat(id) {
        const threats = this.getAllThreats();
        return threats.find(t => t.id === id);
    },
```

with:

```js
    // Get threat by ID
    getThreat(id) {
        const threats = this.getAllThreats();
        return threats.find(t => t.id === id);
    },

    // Get all vehicles (Church of Steel stat blocks, in book order)
    getVehicles() {
        return this.cache['vehicles.json'] || [];
    },

    // Get vehicle by ID
    getVehicle(id) {
        return this.getVehicles().find(v => v.id === id);
    },

    // Name of a vehicle outside its own card: a variant shows its family, e.g.
    // "Crusader (Land Raider)", unless its name already contains the family name
    // ("Land Speeder Tornado"). A variant whose family is missing shows its own name.
    getVehicleDisplayName(vehicle) {
        if (!vehicle) return '';
        const family = vehicle.variantOf ? this.getVehicle(vehicle.variantOf) : null;
        if (!family || vehicle.name.includes(family.name)) return vehicle.name;
        return `${vehicle.name} (${family.name})`;
    },
```

- [ ] **Step 5: Add the vehicle source to `getAllSources`**

In the same file, replace:

```js
    // Get all unique source values from threats (sorted), with Apocrypha sources combined
    getAllSources() {
        const threats = this.getAllThreats();
        const sourceSet = new Set();
        threats.forEach(threat => {
            if (threat.source) {
                sourceSet.add(this.normalizeSource(threat.source));
            }
        });
        return Array.from(sourceSet).sort();
    },
```

with:

```js
    // Get all unique source values from threats and vehicles (sorted), with Apocrypha sources combined.
    // Vehicles store the short id "church". Add the name that isSourceEnabled() maps it to, so the
    // Church of Steel button does not depend on the single Church of Steel threat.
    getAllSources() {
        const threats = this.getAllThreats();
        const sourceSet = new Set();
        threats.forEach(threat => {
            if (threat.source) {
                sourceSet.add(this.normalizeSource(threat.source));
            }
        });
        this.getVehicles().forEach(vehicle => {
            if (vehicle.source) {
                sourceSet.add(SettingsTab._glossaryIdToNormalized[vehicle.source] || this.normalizeSource(vehicle.source));
            }
        });
        return Array.from(sourceSet).sort();
    },
```

`SettingsTab` is a global from `settings-tab.js`. `DataLoader` already calls `SettingsTab.isSourceEnabled()` in `getAvailableAmmo()` and `getFilteredWeapons()`, so this call follows an existing pattern. The map's own comment says that it exists for `getAllSources()`.

- [ ] **Step 6: Run the tests to verify they pass**

Run:

```bash
wsl -e bash -s <<'EOF'
cd /root/projects/QK-Wrath-and-Glory
node scripts/test-vehicles-tab.js | tail -1
node scripts/test-vehicles.js | tail -1
EOF
```

Expected: `All checks passed.` two times.

- [ ] **Step 7: Commit**

```bash
wsl -e bash -s <<'EOF'
cd /root/projects/QK-Wrath-and-Glory
/usr/bin/git status --short | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
/usr/bin/git add bestiary/js/data-loader.js scripts/test-vehicles-tab.js
/usr/bin/git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Load the vehicles file in the bestiary data loader (#28)" 2>&1 | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
EOF
```

Expected: before the commit, `git status --short` lists only the files that this task touches, the files of the `git add` line. An untracked file that no task touches, such as `relic-final-form-step.png`, can also show; leave it. Then one new commit lands on the `vehicles` branch.

---

### Task 2.3: Vehicles in the encounter state

**Agent:** implementer. The plan gives every function body and every check, so no design choice is left.

**Files:**
- Modify: `bestiary/js/encounter-state.js:18-19` (array), `:55-57` (`isEmpty`), `:557` (new section before Manual Ordering), `:795` (list rows), `:872-882` (`getEncounterData`), `:911-914` (`loadEncounterFromFile`), `:929-932` (`loadFromData`), `:936-944` (`clearEncounter`)
- Create: `scripts/test-encounter-vehicles.js`

**Interfaces:**
- Consumes: `DataLoader.getVehicle(id)` and `DataLoader.getVehicleDisplayName(vehicle)` (Task 2.2).
- Produces:
  - `EncounterState.vehicles: Array<{ id: string, vehicleId: string, wounds: number, initiative: number | null }>`.
  - `addVehicle(vehicleId) → string | null`. It returns the new entry id, or `null` for an unknown vehicle id.
  - `removeVehicle(id) → void`, `updateVehicleWounds(id, delta) → void`, `setVehicleInitiative(id, value) → void`.
  - `getVehicle(id) → entry | undefined` (the encounter entry, not the data record).
  - `isVehicleDestroyed(id) → boolean`.
  - `getEncounterListItems()` vehicle items: `{ type: 'vehicle', id, name, initiative, isDead, maxWounds: number | null, data: entry }`. `name` is the display name or `Unknown vehicle`.
  - `getEncounterData().vehicles`. `loadFromData(data)` and `loadEncounterFromFile()` read `vehicles` and use `[]` when it is missing.
  - `moveItemInOrder('vehicle', id, newIndex)` works with no change, because the function does not check the item type.
  - `scripts/test-encounter-vehicles.js` with an async `main()`. Task 2.5 inserts its block above the line `    // --- end of checks ---`.

Rules of spec §5 that this task pins:
- The damage ceiling is Max Wounds + 1, the first value that destroys the vehicle. More "+" clicks change nothing.
- An entry whose record does not resolve still tracks damage, with no ceiling, and is never destroyed.
- Every save and load path carries `vehicles`: `getEncounterData()`, autosave, `loadFromData()` and `loadEncounterFromFile()`. Load Encounter uses `loadEncounterFromFile()`.

Decision in this task: `isVehicleDestroyed(id)` is a helper beside the five functions of spec §5.

- [ ] **Step 1: Write the failing test**

Create `scripts/test-encounter-vehicles.js`:

```js
// Tests for vehicles in the Encounter Builder (issue #28): the EncounterState vehicle functions,
// the list rows they feed, and persistence through autosave, saved files and older saves.
// Run: node scripts/test-encounter-vehicles.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const readSource = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

let failures = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// encounter-state.js schedules an autosave with setTimeout on every change and writes it to
// localStorage, so the context stubs both. No-op timers leave no debounce timer alive.
const store = {};
const sandbox = {
    console: { log() {}, warn() {}, error: console.error },
    localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; }
    },
    setTimeout: () => 0,
    clearTimeout: () => {}
};
vm.createContext(sandbox);
const load = (rel) => vm.runInContext(readSource(rel), sandbox, { filename: rel });
load('bestiary/js/data-loader.js');
load('bestiary/tabs/settings-tab.js');
load('bestiary/js/encounter-state.js');
const DataLoader = vm.runInContext('DataLoader', sandbox);
const EncounterState = vm.runInContext('EncounterState', sandbox);
DataLoader.cache['vehicles.json'] = readJson('data/vehicles.json');
DataLoader.cache['threats.json'] = readJson('data/threats.json');

async function main() {
    // --- EncounterState: vehicle lifecycle and persistence (Task 2.3) ---
    {
        const chimera = DataLoader.getVehicle('chimera');
        const max = chimera.wounds;
        check('the test vehicle has a whole-number Max Wounds', Number.isInteger(max) && max > 0, true);

        // Add and remove
        EncounterState.clearEncounter();
        check('a fresh encounter is empty', EncounterState.isEmpty(), true);
        const vid = EncounterState.addVehicle('chimera');
        check('addVehicle returns the new entry id', typeof vid, 'string');
        check('an entry holds exactly id, vehicleId, wounds and initiative',
            plain(EncounterState.getVehicle(vid)), { id: vid, vehicleId: 'chimera', wounds: 0, initiative: null });
        check('an encounter with only a vehicle is not empty', EncounterState.isEmpty(), false);
        check('addVehicle marks the encounter unsaved', EncounterState.hasUnsavedChanges(), true);
        check('addVehicle refuses an unknown vehicle id', EncounterState.addVehicle('no_such_vehicle'), null);
        check('a refused add stores nothing', EncounterState.vehicles.length, 1);
        const second = EncounterState.addVehicle('chimera');
        check('a second add gets its own id', second === vid, false);
        EncounterState.removeVehicle(second);
        check('removeVehicle removes only that entry', EncounterState.vehicles.map(v => v.id), [vid]);
        check('getVehicle returns undefined for an unknown entry', EncounterState.getVehicle('no-such-entry'), undefined);

        // Wounds: floor 0, ceiling Max Wounds + 1
        EncounterState.updateVehicleWounds(vid, -1);
        check('damage taken stops at 0', EncounterState.getVehicle(vid).wounds, 0);
        EncounterState.updateVehicleWounds(vid, max);
        check('damage equal to Max Wounds does not destroy the vehicle', EncounterState.isVehicleDestroyed(vid), false);
        EncounterState.updateVehicleWounds(vid, 1);
        check('damage above Max Wounds destroys the vehicle', EncounterState.isVehicleDestroyed(vid), true);
        EncounterState.updateVehicleWounds(vid, 5);
        check('damage stops at Max Wounds + 1', EncounterState.getVehicle(vid).wounds, max + 1);
        const destroyedRow = EncounterState.getEncounterListItems().find(item => item.id === vid);
        check('a destroyed vehicle row is marked dead', destroyedRow.isDead, true);
        check('the row carries Max Wounds', destroyedRow.maxWounds, max);
        EncounterState.updateVehicleWounds(vid, -1);
        check('one point of repair restores the vehicle', EncounterState.isVehicleDestroyed(vid), false);
        EncounterState.updateVehicleWounds('no-such-entry', 1);
        check('a wound change on an unknown entry changes nothing', EncounterState.vehicles.length, 1);

        // Initiative
        EncounterState.setVehicleInitiative(vid, '12');
        check('setVehicleInitiative stores a number', EncounterState.getVehicle(vid).initiative, 12);
        EncounterState.setVehicleInitiative(vid, '');
        check('an empty initiative clears to null', EncounterState.getVehicle(vid).initiative, null);

        // Tier and player count recalculate threats only
        const before = plain(EncounterState.getVehicle(vid));
        EncounterState.updateSettings({ tier: 4, playerCount: 6 });
        check('a tier or player count change leaves a vehicle as it was', plain(EncounterState.getVehicle(vid)), before);

        // List rows: name, sort by initiative, custom order
        EncounterState.addIndividual(DataLoader.getAllThreats()[0].id, 1, false);
        const individualId = EncounterState.individuals[0].id;
        const pcId = EncounterState.addPlayerCharacter('Ana');
        EncounterState.setInitiative(individualId, 5);
        EncounterState.setPlayerCharacterInitiative(pcId, 7);
        EncounterState.setVehicleInitiative(vid, 9);
        let rows = EncounterState.getEncounterListItems();
        check('the vehicle row uses the display name', rows.find(r => r.type === 'vehicle').name, DataLoader.getVehicleDisplayName(chimera));
        check('a vehicle sorts by initiative with the other rows', rows.map(r => r.type), ['vehicle', 'player', 'individual']);
        EncounterState.moveItemInOrder('vehicle', vid, 3);
        rows = EncounterState.getEncounterListItems();
        check('moveItemInOrder moves a vehicle in the custom order', rows.map(r => r.type), ['player', 'individual', 'vehicle']);
        const crusaderId = EncounterState.addVehicle('land_raider_crusader');
        check('a variant row shows its family',
            EncounterState.getEncounterListItems().find(r => r.id === crusaderId).name, 'Crusader (Land Raider)');
        EncounterState.removeVehicle(crusaderId);

        // Save data
        const data = EncounterState.getEncounterData();
        check('saved data keeps version 1', data.version, 1);
        check('saved data writes the vehicles array', plain(data.vehicles), plain(EncounterState.vehicles));
        const saved = plain(data);
        EncounterState.clearEncounter();
        check('clearEncounter empties the vehicles', EncounterState.vehicles.length, 0);
        EncounterState.loadFromData(saved);
        check('loadFromData restores the vehicles', plain(EncounterState.vehicles), saved.vehicles);
        const older = plain(saved);
        delete older.vehicles;
        EncounterState.loadFromData(older);
        check('a save without vehicles loads an empty array', plain(EncounterState.vehicles), []);

        // Load Encounter reads files through loadEncounterFromFile, not loadFromData
        sandbox.window = { api: { loadEncounterFile: async () => ({ success: true, fileName: 'Convoy', data: plain(saved) }) } };
        await EncounterState.loadEncounterFromFile();
        check('a saved file restores the vehicles', plain(EncounterState.vehicles), saved.vehicles);
        sandbox.window = { api: { loadEncounterFile: async () => ({ success: true, fileName: 'Old', data: plain(older) }) } };
        await EncounterState.loadEncounterFromFile();
        check('an older saved file loads an empty vehicles array', plain(EncounterState.vehicles), []);

        // Autosave
        EncounterState.clearEncounter();
        const autoId = EncounterState.addVehicle('chimera');
        EncounterState._performAutoSave();
        check('autosave writes the vehicles', EncounterState.getAutoSave().encounter.vehicles.map(v => v.id), [autoId]);
        EncounterState.clearEncounter();
        check('clearEncounter removes the autosave', EncounterState.getAutoSave(), null);

        // An entry whose vehicle id no longer resolves is kept
        EncounterState.loadFromData({ vehicles: [{ id: 'v-old', vehicleId: 'retired_vehicle', wounds: 3, initiative: 4 }] });
        const unknownRow = EncounterState.getEncounterListItems()[0];
        check('an unknown vehicle row says Unknown vehicle', unknownRow.name, 'Unknown vehicle');
        check('an unknown vehicle is never destroyed', unknownRow.isDead, false);
        check('an unknown vehicle row has no Max Wounds', unknownRow.maxWounds, null);
        EncounterState.updateVehicleWounds('v-old', 1);
        check('an unknown vehicle still tracks damage, with no ceiling', EncounterState.getVehicle('v-old').wounds, 4);
        check('an unknown vehicle survives a save', plain(EncounterState.getEncounterData().vehicles),
            [{ id: 'v-old', vehicleId: 'retired_vehicle', wounds: 4, initiative: 4 }]);
    }

    // --- end of checks ---
}

main().then(() => {
    console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
    process.exit(failures === 0 ? 0 : 1);
}, (error) => {
    console.error(error);
    process.exit(1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `wsl -e bash -c 'cd /root/projects/QK-Wrath-and-Glory && node scripts/test-encounter-vehicles.js 2>&1 | grep -A1 -e FAIL -e Error'`

Expected: `TypeError: EncounterState.addVehicle is not a function`. The exit code is 1.

- [ ] **Step 3: Add the array and update `isEmpty`**

In `bestiary/js/encounter-state.js`, replace:

```js
    // Player Characters for initiative tracking
    playerCharacters: [],
```

with:

```js
    // Player Characters for initiative tracking
    playerCharacters: [],

    // Vehicles: { id, vehicleId, wounds (damage taken), initiative }
    vehicles: [],
```

In the same file, replace:

```js
    isEmpty() {
        return this.individuals.length === 0 && this.mobs.length === 0 && this.playerCharacters.length === 0;
    },
```

with:

```js
    isEmpty() {
        return this.individuals.length === 0 && this.mobs.length === 0 && this.playerCharacters.length === 0 && this.vehicles.length === 0;
    },
```

- [ ] **Step 4: Add the vehicle functions**

In the same file, replace:

```js
    // ===== Manual Ordering =====
```

with:

```js
    // ===== Vehicle Management =====

    // Add one vehicle. `wounds` is the damage taken; Max Wounds is the vehicle record's `wounds`.
    addVehicle(vehicleId) {
        if (!DataLoader.getVehicle(vehicleId)) return null;

        const entry = {
            id: this.generateId(),
            vehicleId: vehicleId,
            wounds: 0,
            initiative: null
        };
        this.vehicles.push(entry);
        this.markDirty();
        return entry.id;
    },

    // Remove a vehicle
    removeVehicle(id) {
        this.vehicles = this.vehicles.filter(v => v.id !== id);
        this.markDirty();
    },

    // Change the damage taken (delta can be positive or negative). The floor is 0. The ceiling is
    // Max Wounds + 1, the first value that destroys the vehicle. An entry whose vehicle record no
    // longer resolves has no ceiling.
    updateVehicleWounds(id, delta) {
        const entry = this.vehicles.find(v => v.id === id);
        if (!entry) return;
        const vehicle = DataLoader.getVehicle(entry.vehicleId);
        const ceiling = vehicle ? vehicle.wounds + 1 : Infinity;
        entry.wounds = Math.max(0, Math.min(ceiling, entry.wounds + delta));
        this.markDirty();
    },

    // Set initiative for a vehicle
    setVehicleInitiative(id, value) {
        const entry = this.vehicles.find(v => v.id === id);
        if (entry) {
            entry.initiative = value === '' || value === null ? null : parseInt(value);
            this.markDirty();
        }
    },

    // Get a vehicle entry by ID
    getVehicle(id) {
        return this.vehicles.find(v => v.id === id);
    },

    // A vehicle is destroyed when it has more Wounds than its Max Wounds (Church of Steel p. 62).
    // An entry whose vehicle record no longer resolves is never destroyed.
    isVehicleDestroyed(id) {
        const entry = this.getVehicle(id);
        if (!entry) return false;
        const vehicle = DataLoader.getVehicle(entry.vehicleId);
        return !!vehicle && entry.wounds > vehicle.wounds;
    },

    // ===== Manual Ordering =====
```

- [ ] **Step 5: Add vehicle rows to `getEncounterListItems`**

In the same file, replace:

```js
        // Add player characters
        this.playerCharacters.forEach(pc => {
```

with:

```js
        // Add vehicles
        this.vehicles.forEach(entry => {
            const vehicle = DataLoader.getVehicle(entry.vehicleId);
            items.push({
                type: 'vehicle',
                id: entry.id,
                name: vehicle ? DataLoader.getVehicleDisplayName(vehicle) : 'Unknown vehicle',
                initiative: entry.initiative,
                isDead: this.isVehicleDestroyed(entry.id),
                maxWounds: vehicle ? vehicle.wounds : null,
                data: entry
            });
        });

        // Add player characters
        this.playerCharacters.forEach(pc => {
```

- [ ] **Step 6: Save and load the array**

In `getEncounterData`, replace:

```js
            playerCharacters: [...this.playerCharacters],
            encounterOrder: this.encounterOrder ? [...this.encounterOrder] : null,
```

with:

```js
            playerCharacters: [...this.playerCharacters],
            vehicles: [...this.vehicles],
            encounterOrder: this.encounterOrder ? [...this.encounterOrder] : null,
```

In `loadEncounterFromFile`, replace:

```js
            this.playerCharacters = parsed.playerCharacters || [];
```

with:

```js
            this.playerCharacters = parsed.playerCharacters || [];
            this.vehicles = parsed.vehicles || [];
```

In `loadFromData`, replace:

```js
        this.playerCharacters = data.playerCharacters || [];
```

with:

```js
        this.playerCharacters = data.playerCharacters || [];
        this.vehicles = data.vehicles || [];
```

In `clearEncounter`, replace:

```js
        this.playerCharacters = [];
        this.encounterOrder = null;
        this.markClean(); // Fresh encounter has no unsaved changes
```

with:

```js
        this.playerCharacters = [];
        this.vehicles = [];
        this.encounterOrder = null;
        this.markClean(); // Fresh encounter has no unsaved changes
```

Do not change `version: 1`, `moveItemInOrder` or `recalculateAllStats`.

- [ ] **Step 7: Run the tests to verify they pass**

Run:

```bash
wsl -e bash -s <<'EOF'
cd /root/projects/QK-Wrath-and-Glory
node scripts/test-encounter-vehicles.js | tail -1
node scripts/test-vehicles-tab.js | tail -1
EOF
```

Expected: `All checks passed.` two times.

- [ ] **Step 8: Commit**

```bash
wsl -e bash -s <<'EOF'
cd /root/projects/QK-Wrath-and-Glory
/usr/bin/git status --short | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
/usr/bin/git add bestiary/js/encounter-state.js scripts/test-encounter-vehicles.js
/usr/bin/git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Track vehicles in the encounter state and its saves (#28)" 2>&1 | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
EOF
```

Expected: before the commit, `git status --short` lists only the files that this task touches, the files of the `git add` line. An untracked file that no task touches, such as `relic-final-form-step.png`, can also show; leave it. Then one new commit lands on the `vehicles` branch.

---

### Task 2.4: The Vehicles tab

**Agent:** implementer, model: opus. This is a new subsystem: a tab module, page wiring, app wiring, styles and popups, with checks on desktop and phone.

**Files:**
- Create: `bestiary/tabs/vehicles-tab.js`
- Modify: `bestiary/index.html:39-40` (tab button), `:114` (tab container before the Threat Builder tab), `:358` (script tag)
- Modify: `bestiary/js/app.js:112-113` (`init`), `:143-149` (`handleDeepLink`), `:194-196` (`switchTab`)
- Modify: `bestiary/css/styles.css` (new section at the end of the file)
- Test: `scripts/test-vehicles-tab.js` (new block)

**Interfaces:**
- Consumes: `Glossary.showEntryPopup(type, key, anchorElement)` (Task 2.1). `DataLoader.getVehicles()`, `getVehicle(id)`, `getVehicleDisplayName(vehicle)` (Task 2.2). `EncounterState.addVehicle(vehicleId) → string | null` (Task 2.3). Existing: `ThreatsTab.showAddedNotification(message)`, `BottomSheet.open(renderFn, onCloseFn)`, `SettingsTab.isSourceEnabled(source)`, `DataLoader.getWeapon(id)`, `DataLoader.getAllEquipment()`, `DataLoader.getGlossary()`, `DataLoader.formatRarity(rarity)`, `DataLoader.requisitionDN(item)`, `DataLoader.formatSourcePage(item)`, `Glossary.enhanceDescriptions(container)`.
- Produces (Task 2.5 uses the first three):
  - `VehiclesTab.renderVehicleCardMini(vehicle) → string`: the compressed card (stat strip, keywords, crew, traits, weapons with profiles, wargear).
  - `VehiclesTab.bindCardPopups(container) → void`: chip clicks open `Glossary.showEntryPopup`; weapon traits and wargear effects get inline glossary links.
  - CSS class `.vehicle-link` (the link style).
  - `VehiclesTab.init()`, `refresh()`, `selectVehicle(vehicleId)`, `renderVehicleDetail(vehicleId, container = null)`, `renderVehicleCard(vehicle) → string`, `renderVehicleStats(vehicle) → string`, `renderWeaponsTable(lines) → string`, `renderWeaponName(row) → string`, `renderKeywordChips(keywords) → string`, `buildWeaponRows(line) → Array<{ text, twin, resolved, damage?, ed?, ap?, rangeReach?, salvo?, traits? }>`, `buildWargearRow(item) → { text, effect }`, `getFactions() → string[]`, `getFilteredVehicles() → Vehicle[]`, `findTraitKey(trait) → string | null`, `findKeywordKey(keyword) → string | null`.
  - DOM: tab button `data-tab="vehicles"`, `#tab-vehicles`, `#vehicle-search-input`, `#vehicle-faction-filter`, `#vehicle-list`, `#vehicle-detail`. `App.switchTab('vehicles')` and the deep link `#vehicles/<id>`.

Decisions in this task (the spec leaves them open):
- The list sorts by display name, as the Threats list sorts by name. The faction select is alphabetical.
- Search covers the display name, so "land raider" also finds "Crusader (Land Raider)".
- The card heading shows Value, Rarity with its penalty, and the Requisition DN, as the Compendium does (issue #22).
- Inline glossary links appear only in the weapon Traits cells and the wargear effect text. The description, the options and the sidebar stay plain.
- The word "Twin" in the printed weapon text becomes the marker. If the text lacks the word, the marker follows the text.
- A `profileIds` line gives one row per profile that resolves, named by the record (spec §4). On a Twin line, the marker follows each profile name. If no profile resolves, the line shows its printed text alone.
- The description keeps its `\n\n` paragraph breaks through `white-space: pre-line`, as `.threat-text-section` does for the options and the sidebar.
- On a phone, the card heading centres its meta line and its variant link, as the existing rules centre the title and the source.
- The "Variant of" link selects the family in place. A hash change would close the mobile sheet (Review Focus 4).

- [ ] **Step 1: Write the failing test**

In `scripts/test-vehicles-tab.js`, insert this block above the line `    // --- end of checks ---`:

```js
    // --- Vehicles tab: wiring and pure helpers (Task 2.4) ---
    {
        const html = readSource('bestiary/index.html');
        check('the tab bar has a Vehicles button', html.includes('<button class="tab-btn" data-tab="vehicles">VEHICLES</button>'), true);
        check('the page has the Vehicles tab container', html.includes('<div id="tab-vehicles" class="tab-content">'), true);
        check('the page loads the Vehicles tab script', /<script src="tabs\/vehicles-tab\.js\?v=\d+"><\/script>/.test(html), true);
        check('every ?v= in the bestiary page has one number', new Set([...html.matchAll(/\?v=(\d+)/g)].map(m => m[1])).size, 1);

        load('bestiary/tabs/vehicles-tab.js');
        const VehiclesTab = get('VehiclesTab');
        const vehicles = DataLoader.getVehicles();
        const byId = (id) => DataLoader.getVehicle(id);
        check('the data loader has the vehicles cached', vehicles.length, 107);

        // Filters: faction list, sort order, faction, search, source toggle
        check('the faction select lists the 11 factions, sorted', VehiclesTab.getFactions(),
            ['Adepta Sororitas', 'Adeptus Astartes', 'Adeptus Mechanicus', 'Aeldari', 'Aeronautica Imperialis',
                'Astra Militarum', 'Chaos Space Marines', 'Drukhari', 'Imperial', 'Necron', 'Ork']);
        VehiclesTab.filters = { search: '', faction: 'all' };
        const listed = VehiclesTab.getFilteredVehicles();
        check('with no filter the list holds all 107 vehicles', listed.length, 107);
        const listedNames = listed.map(v => DataLoader.getVehicleDisplayName(v));
        check('the list is sorted by display name', listedNames, [...listedNames].sort((a, b) => a.localeCompare(b)));
        VehiclesTab.filters.faction = 'Ork';
        const orks = VehiclesTab.getFilteredVehicles();
        check('the faction select keeps only that faction',
            [orks.length, orks.every(v => v.faction === 'Ork')], [vehicles.filter(v => v.faction === 'Ork').length, true]);
        VehiclesTab.filters.faction = 'all';
        VehiclesTab.filters.search = 'land raider';
        check('search finds a variant by its family name', VehiclesTab.getFilteredVehicles().some(v => v.id === 'land_raider_crusader'), true);
        const keyword = vehicles.find(v => v.keywords.length > 0).keywords[0];
        VehiclesTab.filters.search = keyword.toLowerCase();
        const keywordHits = new Set(VehiclesTab.getFilteredVehicles().map(v => v.id));
        check(`search matches keywords (${keyword})`, vehicles.filter(v => v.keywords.includes(keyword)).every(v => keywordHits.has(v.id)), true);
        const described = vehicles.find(v => v.description && v.description.length > 40);
        VehiclesTab.filters.search = described.description.slice(10, 30).toUpperCase();
        check('search matches description text in any case', VehiclesTab.getFilteredVehicles().some(v => v.id === described.id), true);
        VehiclesTab.filters.search = '   ';
        check('a blank search keeps every vehicle', VehiclesTab.getFilteredVehicles().length, 107);
        VehiclesTab.filters.search = '';
        SettingsTab.excludedSources.add('Church of Steel');
        check('Church of Steel off hides every vehicle', VehiclesTab.getFilteredVehicles().length, 0);
        SettingsTab.excludedSources.clear();

        // Chip keys: a trait drops its value; a keyword matches by name
        check('a trait with a value opens the base trait', VehiclesTab.findTraitKey('Turbo Boost (2)'), 'turbo_boost');
        check('trait matching ignores case and hyphens',
            [VehiclesTab.findTraitKey('open-topped') !== null, VehiclesTab.findTraitKey('open-topped') === VehiclesTab.findTraitKey('Open Topped')],
            [true, true]);
        check('every vehicleTraits name maps back to its own key',
            Object.entries(glossary.vehicleTraits).filter(([key, entry]) => VehiclesTab.findTraitKey(entry.name) !== key).map(([key]) => key), []);
        check('every printed vehicle trait opens a vehicleTraits entry',
            [...new Set(vehicles.flatMap(v => v.traits))].filter(t => !VehiclesTab.findTraitKey(t)), []);
        check('an unknown trait has no key', VehiclesTab.findTraitKey('No Such Trait'), null);
        check('a keyword resolves to its glossary key by name', VehiclesTab.findKeywordKey('[LEGION]'), 'legion');
        check('a keyword without an entry has no key', VehiclesTab.findKeywordKey('NOT A KEYWORD'), null);
        const chips = VehiclesTab.renderKeywordChips(['IMPERIUM', 'NOT A KEYWORD']);
        check('a linked keyword chip carries the keyword popup type', chips.includes('data-popup-type="keyword" data-popup-key="imperium"'), true);
        check('a keyword without an entry is a plain chip', chips.includes('<span class="vehicle-chip vehicle-chip-keyword">NOT A KEYWORD</span>'), true);

        // Weapons table rows from the resolved weapons.json records
        check('a ranged row takes its profile from the record',
            plain(VehiclesTab.buildWeaponRows({ text: 'Lascannon', weaponId: 'lascannon', count: 1 })),
            [{ text: 'Lascannon', twin: false, resolved: true, damage: '18', ed: 3, ap: -3, rangeReach: '24/48/72', salvo: 1, traits: 'Heavy (8), Reliable' }]);
        const [klaw] = VehiclesTab.buildWeaponRows({ text: "Grabbin' Klaw", weaponId: 'cos_grabbin_klaw', count: 1 });
        check('a melee row shows its reach and no salvo', [klaw.damage, klaw.rangeReach, klaw.salvo], ['14', 5, '-']);
        check('a melee record without reach shows a dash',
            VehiclesTab.buildWeaponRows({ text: 'Sentinel Chainsaw', weaponId: 'cos_sentinel_chainsaw', count: 1 })[0].rangeReach, '-');
        const [twinRow] = VehiclesTab.buildWeaponRows({ text: '2 Twin Lascannons', weaponId: 'lascannon', count: 2, twin: true });
        check('a Twin line keeps its printed text and its flag', [twinRow.text, twinRow.twin, twinRow.damage], ['2 Twin Lascannons', true, '18']);
        const prismIds = ['cos_prism_cannon_dispersed', 'cos_prism_cannon_focussed', 'cos_prism_cannon_lance'];
        const prismRows = VehiclesTab.buildWeaponRows({ text: 'Prism Cannon', weaponId: null, count: 1, profileIds: prismIds });
        check('a profileIds line gives one row per profile, named by the record',
            prismRows.map(r => [r.text, r.resolved]), prismIds.map(id => [DataLoader.getWeapon(id).name, true]));
        check('a profile row takes the numbers of its own record',
            [prismRows[1].ed, prismRows[1].ap], [DataLoader.getWeapon(prismIds[1]).ed, DataLoader.getWeapon(prismIds[1]).ap]);
        check('a profileIds line with no known id shows the printed text alone',
            plain(VehiclesTab.buildWeaponRows({ text: 'Prism Cannon', weaponId: null, count: 1, profileIds: ['no_such_a', 'no_such_b'] })),
            [{ text: 'Prism Cannon', twin: false, resolved: false }]);
        check('the word Twin becomes the marker', VehiclesTab.renderWeaponName(twinRow),
            '2 <span class="vehicle-twin-marker" data-popup-type="vehicleRule" data-popup-key="twin_weapons">Twin</span> Lascannons');
        check('a Twin line without the word still gets the marker', VehiclesTab.renderWeaponName({ text: 'Paired guns', twin: true }),
            'Paired guns <span class="vehicle-twin-marker" data-popup-type="vehicleRule" data-popup-key="twin_weapons">Twin</span>');
        check('a plain line keeps its text', VehiclesTab.renderWeaponName({ text: 'Heavy Bolter', twin: false }), 'Heavy Bolter');
        check('an unresolved line shows the printed text alone',
            plain(VehiclesTab.buildWeaponRows({ text: 'Mystery Gun', weaponId: null, count: 1 })), [{ text: 'Mystery Gun', twin: false, resolved: false }]);
        check('a stale weapon id counts as unresolved',
            VehiclesTab.buildWeaponRows({ text: 'Old Gun', weaponId: 'no_such_weapon', count: 1 })[0].resolved, false);
        check('an empty weapons box shows a dash and no table',
            [VehiclesTab.renderWeaponsTable([]).includes('<table'), VehiclesTab.renderWeaponsTable([]).includes('vehicle-none">-</div>')], [false, true]);

        // Wargear lines
        const smoke = DataLoader.getAllEquipment().find(e => e.id === 'cos_smoke_launcher');
        check('a resolved wargear line shows the record effect',
            plain(VehiclesTab.buildWargearRow({ text: 'Smoke Launchers', equipmentId: 'cos_smoke_launcher' })), { text: 'Smoke Launchers', effect: smoke.effect });
        check('an unresolved wargear line shows the printed text alone',
            plain(VehiclesTab.buildWargearRow({ text: 'Dozer Blade', equipmentId: null })), { text: 'Dozer Blade', effect: null });

        // The card holds every element of spec section 4
        const chimera = byId('chimera');
        const card = VehiclesTab.renderVehicleCard(chimera);
        check('the card names the vehicle and its faction', card.includes('>Chimera</h2>') && card.includes(chimera.faction), true);
        check('the card shows Value and Rarity',
            card.includes(`Value:</span> ${chimera.value}`) && card.includes(DataLoader.formatRarity(chimera.rarity)), true);
        check('the card shows the source and page', card.includes(DataLoader.formatSourcePage(chimera)), true);
        check('the card has the stat strip', ['>Spd<', '>Man<', '>Res<', '>W<', '>Size<'].every(s => card.includes(s)), true);
        check('the card shows the crew complement', card.includes('Crew Complement:') && card.includes(chimera.crew), true);
        const rowCount = (v) => v.weapons.reduce((n, w) => n + (Array.isArray(w.profileIds) ? w.profileIds.length : 1), 0);
        check('every card has one row per weapon line or profile', vehicles.filter(v =>
            (VehiclesTab.renderVehicleCard(v).match(/class="vehicle-weapon-name"/g) || []).length !== rowCount(v)).map(v => v.id), []);
        const profileVehicle = vehicles.find(v => v.weapons.some(w => Array.isArray(w.profileIds)));
        check('Part 1 data: a vehicle has a profileIds line', !!profileVehicle, true);
        check('a card with a profileIds line names each profile', !!profileVehicle && profileVehicle.weapons
            .filter(w => Array.isArray(w.profileIds))
            .every(w => w.profileIds.every(id => VehiclesTab.renderVehicleCard(profileVehicle).includes(DataLoader.getWeapon(id).name))), true);
        check('the card has an Add to Encounter button', card.includes('vehicle-add-btn') && card.includes('Add to Encounter'), true);
        check('a top-level card has no variant link', card.includes('vehicle-variant-link'), false);
        const missingProse = vehicles.filter(v => {
            const c = VehiclesTab.renderVehicleCard(v);
            return (v.description && !c.includes(v.description)) || (v.options && !c.includes(v.options));
        }).map(v => v.id);
        check('every card shows its own description and options', missingProse, []);
        const crusaderCard = VehiclesTab.renderVehicleCard(byId('land_raider_crusader'));
        check('a variant card links to its family',
            crusaderCard.includes('data-vehicle-id="land_raider"') && crusaderCard.includes('Variant of Land Raider'), true);
        const missingFamilyText = vehicles.filter(v => v.variantOf).filter(v => {
            const family = byId(v.variantOf);
            const c = VehiclesTab.renderVehicleCard(v);
            return (v.description == null && family.description && !c.includes(family.description)) ||
                (v.options == null && family.options && !c.includes(family.options));
        }).map(v => v.id);
        check('every variant card shows the family text it lacks', missingFamilyText, []);
        const withSidebar = vehicles.filter(v => v.sidebar);
        check('the sidebar box shows its title and text', withSidebar.length > 0 && withSidebar.every(v => {
            const c = VehiclesTab.renderVehicleCard(v);
            return c.includes(v.sidebar.title) && c.includes(v.sidebar.text);
        }), true);
        const twinVehicle = vehicles.find(v => v.weapons.some(w => w.twin));
        check('a card with a Twin line has the Twin marker', VehiclesTab.renderVehicleCard(twinVehicle).includes('data-popup-key="twin_weapons"'), true);
        const traitVehicle = vehicles.find(v => v.traits.length > 0);
        check('trait chips carry the vehicleTrait popup type', VehiclesTab.renderVehicleCard(traitVehicle).includes('data-popup-type="vehicleTrait"'), true);

        // The compressed card for the Encounter Builder
        const mini = VehiclesTab.renderVehicleCardMini(chimera);
        check('the compressed card keeps the stat block',
            ['Vehicle Stats', 'vehicle-stat-strip', 'Weapons', 'Wargear', 'Crew Complement'].every(s => mini.includes(s)), true);
        check('the compressed card leaves out the Add button', mini.includes('vehicle-add-btn'), false);
    }

```

If the check "every printed vehicle trait opens a vehicleTraits entry" fails, list the trait names in the report. Do not edit `data/`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `wsl -e bash -c 'cd /root/projects/QK-Wrath-and-Glory && node scripts/test-vehicles-tab.js 2>&1 | grep -A1 -e FAIL -e Error'`

Expected: FAIL lines for the three page checks (button, container, script tag). Then `Error: ENOENT: no such file or directory` for `bestiary/tabs/vehicles-tab.js`. The exit code is 1.

- [ ] **Step 3: Create the tab module**

Create `bestiary/tabs/vehicles-tab.js`:

```js
// Vehicles Tab - Church of Steel vehicle list and book-style detail card

const VehiclesTab = {
    selectedVehicleId: null,
    _searchTimer: null,
    filters: {
        search: '',
        faction: 'all'
    },

    init() {
        const searchInput = document.getElementById('vehicle-search-input');
        searchInput.addEventListener('input', (e) => {
            this.filters.search = e.target.value;
            clearTimeout(this._searchTimer);
            this._searchTimer = setTimeout(() => this.renderVehicleList(), 300);
        });

        const factionSelect = document.getElementById('vehicle-faction-filter');
        factionSelect.innerHTML = '<option value="all">All Factions</option>' +
            this.getFactions().map(faction => `<option value="${faction}">${faction}</option>`).join('');
        factionSelect.addEventListener('change', (e) => {
            this.filters.faction = e.target.value;
            this.renderVehicleList();
        });

        // One delegated listener serves every list item
        document.getElementById('vehicle-list').addEventListener('click', (e) => {
            const item = e.target.closest('.vehicle-list-item');
            if (item) this.selectVehicle(item.dataset.vehicleId);
        });

        this.renderVehicleList();
    },

    refresh() {
        this.renderVehicleList();
        if (this.selectedVehicleId) {
            this.renderVehicleDetail(this.selectedVehicleId);
        }
    },

    // ===== Rendering =====

    renderVehicleList() {
        const container = document.getElementById('vehicle-list');
        const vehicles = this.getFilteredVehicles();

        if (vehicles.length === 0) {
            container.innerHTML = `
                <div class="threat-list-empty">
                    <p>No vehicles match your filters</p>
                </div>
            `;
            return;
        }

        container.innerHTML = vehicles.map(vehicle => `
            <div class="vehicle-list-item ${this.selectedVehicleId === vehicle.id ? 'selected' : ''}"
                 data-vehicle-id="${vehicle.id}">
                <div class="vehicle-list-header">
                    <span class="vehicle-list-name">${DataLoader.getVehicleDisplayName(vehicle)}</span>
                    <span class="vehicle-list-value">${vehicle.value} / ${vehicle.rarity}</span>
                </div>
                <div class="vehicle-list-faction">${vehicle.faction}</div>
            </div>
        `).join('');
    },

    renderVehicleDetail(vehicleId, container = null) {
        const el = container || document.getElementById('vehicle-detail');
        if (!el) return;

        const vehicle = DataLoader.getVehicle(vehicleId);
        if (!vehicle) {
            el.innerHTML = `
                <div class="threat-detail-placeholder">
                    <p>Vehicle not found</p>
                </div>
            `;
            return;
        }

        el.innerHTML = this.renderVehicleCard(vehicle);
        this.bindCardPopups(el);

        el.querySelector('.vehicle-add-btn').addEventListener('click', () => {
            if (EncounterState.addVehicle(vehicle.id)) {
                ThreatsTab.showAddedNotification(`Added ${DataLoader.getVehicleDisplayName(vehicle)} to encounter`);
            }
        });

        // Select the family in place. A hash change would close the mobile sheet, and the sheet's
        // clean-up timer would then empty the reopened sheet.
        el.querySelector('.vehicle-variant-link')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.selectVehicle(e.currentTarget.dataset.vehicleId);
        });
    },

    renderVehicleCard(vehicle) {
        const family = vehicle.variantOf ? DataLoader.getVehicle(vehicle.variantOf) : null;
        const requisitionDN = DataLoader.requisitionDN(vehicle);

        return `
            <div class="threat-card vehicle-card">
                <div class="threat-card-header">
                    <div class="threat-card-header-top">
                        <h2 class="threat-card-title">${vehicle.name}</h2>
                        <div class="threat-card-header-actions">
                            <button class="header-add-btn vehicle-add-btn">Add to Encounter</button>
                        </div>
                    </div>
                    ${family ? `<a class="vehicle-link vehicle-variant-link" href="#vehicles/${family.id}" data-vehicle-id="${family.id}">Variant of ${family.name}</a>` : ''}
                    <div class="vehicle-card-meta">
                        <span class="vehicle-card-faction">${vehicle.faction}</span>
                        <span><span class="vehicle-meta-label">Value:</span> ${vehicle.value}</span>
                        <span><span class="vehicle-meta-label">Rarity:</span> ${DataLoader.formatRarity(vehicle.rarity)}</span>
                        ${requisitionDN != null ? `<span><span class="vehicle-meta-label">Requisition DN:</span> ${requisitionDN}</span>` : ''}
                    </div>
                    <span class="threat-card-source">${DataLoader.formatSourcePage(vehicle)}</span>
                </div>
                <div class="threat-card-body">
                    ${vehicle.description ? `<div class="threat-card-description">${vehicle.description}</div>` : ''}
                    ${this.renderVehicleStats(vehicle)}
                    ${vehicle.options ? this.renderTextBlock('Options', vehicle.options) : ''}
                    ${vehicle.sidebar ? this.renderSidebar(vehicle.sidebar) : ''}
                    ${this.renderFamilySection(vehicle, family)}
                </div>
            </div>
        `;
    },

    // Compressed card for the Encounter Builder's detail panel
    renderVehicleCardMini(vehicle) {
        return `
            <div class="mini-card">
                <div class="mini-card-header">Vehicle Stats</div>
                <div class="mini-card-body">
                    ${this.renderVehicleStats(vehicle)}
                </div>
            </div>
        `;
    },

    // Stat block shared by the full card and the compressed card
    renderVehicleStats(vehicle) {
        return `
            <div class="threat-stats-section vehicle-stats">
                ${this.renderStatStrip(vehicle)}
                ${this.renderChipRow('Keywords', this.renderKeywordChips(vehicle.keywords))}
                <div class="threat-keywords-row">
                    <span class="threat-keywords-label">Crew Complement:</span>
                    <span class="vehicle-crew">${vehicle.crew || '-'}</span>
                </div>
                ${this.renderChipRow('Traits', this.renderTraitChips(vehicle.traits))}
                ${this.renderWeaponsTable(vehicle.weapons)}
                ${this.renderWargearList(vehicle.wargear)}
            </div>
        `;
    },

    renderStatStrip(vehicle) {
        return `
            <table class="threat-stat-table vehicle-stat-strip">
                <thead>
                    <tr>
                        <th title="Speed">Spd</th>
                        <th title="Manoeuvre">Man</th>
                        <th title="Resilience">Res</th>
                        <th title="Wounds">W</th>
                        <th>Size</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td class="stat-value">${vehicle.speed}</td>
                        <td class="stat-value">${vehicle.manoeuvre}</td>
                        <td class="stat-value">${vehicle.resilience}</td>
                        <td class="stat-value">${vehicle.wounds}</td>
                        <td class="stat-value">${vehicle.size}</td>
                    </tr>
                </tbody>
            </table>
        `;
    },

    renderChipRow(label, chipsHtml) {
        return `
            <div class="threat-keywords-row">
                <span class="threat-keywords-label">${label}:</span>
                ${chipsHtml || '<span class="vehicle-none">-</span>'}
            </div>
        `;
    },

    // A keyword with a glossary entry opens it; a keyword without one is a plain chip
    renderKeywordChips(keywords) {
        return (keywords || []).map(keyword => {
            const key = this.findKeywordKey(keyword);
            return key
                ? `<span class="vehicle-chip vehicle-chip-keyword" data-popup-type="keyword" data-popup-key="${key}">${keyword}</span>`
                : `<span class="vehicle-chip vehicle-chip-keyword">${keyword}</span>`;
        }).join('');
    },

    // A trait keeps its printed value ("Turbo Boost (2)") and opens the base entry (turbo_boost)
    renderTraitChips(traits) {
        return (traits || []).map(trait => {
            const key = this.findTraitKey(trait);
            return key
                ? `<span class="vehicle-chip" data-popup-type="vehicleTrait" data-popup-key="${key}">${trait}</span>`
                : `<span class="vehicle-chip">${trait}</span>`;
        }).join('');
    },

    renderWeaponsTable(lines) {
        if (!lines || lines.length === 0) {
            return `
                <div class="bonuses-section">
                    <div class="bonuses-header">Weapons</div>
                    <div class="bonus-item vehicle-none">-</div>
                </div>
            `;
        }

        const rows = lines.flatMap(line => this.buildWeaponRows(line)).map(row => {
            if (!row.resolved) {
                return `<tr><td class="vehicle-weapon-name" colspan="7">${this.renderWeaponName(row)}</td></tr>`;
            }
            return `
                <tr>
                    <td class="vehicle-weapon-name">${this.renderWeaponName(row)}</td>
                    <td>${row.damage}</td>
                    <td>${row.ed}</td>
                    <td>${row.ap}</td>
                    <td>${row.rangeReach}</td>
                    <td>${row.salvo}</td>
                    <td class="vehicle-weapon-traits" data-glossary-enhance>${row.traits}</td>
                </tr>
            `;
        }).join('');

        return `
            <div class="bonuses-section">
                <div class="bonuses-header">Weapons</div>
                <div class="vehicle-table-scroll">
                    <table class="threat-stat-table vehicle-weapons-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Damage</th>
                                <th>ED</th>
                                <th>AP</th>
                                <th>Range/Reach</th>
                                <th>Salvo</th>
                                <th>Traits</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;
    },

    // The printed text, with its word "Twin" turned into a marker that opens the Twin Weapons rule
    renderWeaponName(row) {
        if (!row.twin) return row.text;
        const marker = '<span class="vehicle-twin-marker" data-popup-type="vehicleRule" data-popup-key="twin_weapons">Twin</span>';
        const marked = row.text.replace(/\bTwin\b/, marker);
        return marked === row.text ? `${row.text} ${marker}` : marked;
    },

    renderWargearList(items) {
        const rows = (items || []).map(item => {
            const row = this.buildWargearRow(item);
            return row.effect
                ? `<div class="bonus-item"><span class="bonus-name">${row.text}:</span> <span class="bonus-description" data-glossary-enhance>${row.effect}</span></div>`
                : `<div class="bonus-item"><span class="bonus-name">${row.text}</span></div>`;
        }).join('');

        return `
            <div class="bonuses-section">
                <div class="bonuses-header">Wargear</div>
                ${rows || '<div class="bonus-item vehicle-none">-</div>'}
            </div>
        `;
    },

    renderTextBlock(label, text) {
        return `
            <div class="bonuses-section">
                <div class="bonuses-header">${label}</div>
                <div class="threat-text-section">${text}</div>
            </div>
        `;
    },

    // A rule box printed inside the entry (Shokk Tunnel, p. 106)
    renderSidebar(sidebar) {
        return `
            <div class="vehicle-sidebar-box">
                <div class="vehicle-sidebar-title">${sidebar.title}</div>
                <div class="threat-text-section">${sidebar.text}</div>
            </div>
        `;
    },

    // A variant without its own paragraph or loadout shows the family's text under the family name
    renderFamilySection(vehicle, family) {
        if (!family) return '';
        const parts = [];
        if (vehicle.description == null && family.description) {
            parts.push(`<div class="threat-text-section">${family.description}</div>`);
        }
        if (vehicle.options == null && family.options) {
            parts.push(`<div class="threat-text-section">${family.options}</div>`);
        }
        if (parts.length === 0) return '';
        return `
            <div class="bonuses-section vehicle-family-section">
                <div class="bonuses-header">${family.name}</div>
                ${parts.join('')}
            </div>
        `;
    },

    // ===== Event Handlers =====

    selectVehicle(vehicleId) {
        this.selectedVehicleId = vehicleId;

        // Update the URL hash without a hashchange event
        history.replaceState(null, '', '#vehicles/' + vehicleId);

        document.querySelectorAll('.vehicle-list-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.vehicleId === vehicleId);
        });
        const selectedItem = document.querySelector('.vehicle-list-item.selected');
        if (selectedItem) {
            selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        // On mobile the detail opens in the shared bottom sheet
        if (window.innerWidth <= 768) {
            BottomSheet.open(
                div => this.renderVehicleDetail(vehicleId, div),
                () => {
                    this.selectedVehicleId = null;
                    document.querySelectorAll('.vehicle-list-item.selected')
                        .forEach(el => el.classList.remove('selected'));
                    history.replaceState(null, '', ' ');
                }
            );
        } else {
            this.renderVehicleDetail(vehicleId);
        }
    },

    // Chips open their glossary entry; weapon traits and wargear effects get inline links
    bindCardPopups(container) {
        container.querySelectorAll('[data-popup-type]').forEach(chip => {
            chip.addEventListener('click', (e) => {
                // The document click handler closes every popup, so the click stops here
                e.stopPropagation();
                Glossary.showEntryPopup(chip.dataset.popupType, chip.dataset.popupKey, chip);
            });
        });
        Glossary.enhanceDescriptions(container);
    },

    // ===== Helpers =====

    // The faction names in the data, sorted
    getFactions() {
        return [...new Set(DataLoader.getVehicles().map(v => v.faction))].sort();
    },

    // Vehicles that pass the source toggle, the faction select and the search, sorted by display name
    getFilteredVehicles() {
        const search = this.filters.search.trim().toLowerCase();
        return DataLoader.getVehicles()
            .filter(v => SettingsTab.isSourceEnabled(v.source))
            .filter(v => this.filters.faction === 'all' || v.faction === this.filters.faction)
            .filter(v => !search || this.matchesSearch(v, search))
            .sort((a, b) => DataLoader.getVehicleDisplayName(a).localeCompare(DataLoader.getVehicleDisplayName(b)));
    },

    // Search covers the display name (so a family name finds its variants), the description and the keywords
    matchesSearch(vehicle, search) {
        if (DataLoader.getVehicleDisplayName(vehicle).toLowerCase().includes(search)) return true;
        if (vehicle.description && vehicle.description.toLowerCase().includes(search)) return true;
        return (vehicle.keywords || []).some(keyword => keyword.toLowerCase().includes(search));
    },

    // The weapons-table rows of one printed line. A line with a record gives one row with the
    // printed text. A `profileIds` line gives one row per profile, named by the record. A line with
    // neither gives one row with the printed text alone (`resolved: false`).
    buildWeaponRows(line) {
        const twin = line.twin === true;
        if (Array.isArray(line.profileIds)) {
            const profiles = line.profileIds.map(id => DataLoader.getWeapon(id)).filter(Boolean);
            if (profiles.length > 0) {
                return profiles.map(weapon => this._weaponRow(weapon.name, twin, weapon));
            }
        }
        const weapon = line.weaponId ? DataLoader.getWeapon(line.weaponId) : null;
        return [this._weaponRow(line.text, twin, weapon)];
    },

    // One row. A melee record carries reach; a ranged record carries range.
    _weaponRow(text, twin, weapon) {
        const row = { text, twin, resolved: !!weapon };
        if (!weapon) return row;

        const dmg = weapon.damage || {};
        const flat = (dmg.base || 0) + (dmg.bonus || 0);
        const rangeReach = weapon.type === 'melee' ? weapon.reach : this.formatRange(weapon.range);
        return {
            ...row,
            damage: dmg.attribute ? `${dmg.attribute.charAt(0).toUpperCase()}+${flat}` : `${flat}`,
            ed: weapon.ed,
            ap: weapon.ap,
            rangeReach: rangeReach ?? '-',
            salvo: weapon.salvo ?? '-',
            traits: (weapon.traits || []).join(', ') || '-'
        };
    },

    formatRange(range) {
        if (range && typeof range === 'object') return `${range.short}/${range.medium}/${range.long}`;
        return range ?? null;
    },

    // One wargear line: the printed text, plus the record's effect text when the line resolves
    buildWargearRow(item) {
        const record = item.equipmentId ? DataLoader.getAllEquipment().find(e => e.id === item.equipmentId) : null;
        return { text: item.text, effect: record && record.effect ? record.effect : null };
    },

    // Glossary keyword key for a printed keyword (a name match in any case), or null
    findKeywordKey(keyword) {
        const keywords = DataLoader.getGlossary().keywords || {};
        const target = keyword.toLowerCase();
        const hit = Object.entries(keywords).find(([, entry]) => entry.name.toLowerCase() === target);
        return hit ? hit[0] : null;
    },

    // vehicleTraits key for a printed trait ("Turbo Boost (2)" -> "turbo_boost"), or null
    findTraitKey(trait) {
        const traits = DataLoader.getGlossary().vehicleTraits || {};
        const base = this._traitBase(trait);
        const hit = Object.entries(traits).find(([, entry]) => this._traitBase(entry.name) === base);
        return hit ? hit[0] : null;
    },

    // Drop a trailing value such as "(2)" or "(X)", fold case, and treat hyphens as spaces
    _traitBase(name) {
        return String(name).replace(/\s*\([^)]*\)\s*$/, '').toLowerCase().replace(/[\s-]+/g, ' ').trim();
    }
};
```

- [ ] **Step 4: Wire the tab into the page**

In `bestiary/index.html`, replace:

```html
                <button class="tab-btn active" data-tab="threats">THREATS</button>
```

with:

```html
                <button class="tab-btn active" data-tab="threats">THREATS</button>
                <button class="tab-btn" data-tab="vehicles">VEHICLES</button>
```

In the same file, replace:

```html
            <!-- Threat Builder Tab -->
            <div id="tab-builder" class="tab-content">
```

with:

```html
            <!-- Vehicles Tab -->
            <div id="tab-vehicles" class="tab-content">
                <!-- Left Sidebar - Filters -->
                <aside class="sidebar">
                    <div class="sidebar-section">
                        <h3 class="sidebar-title">Filters</h3>
                    </div>

                    <div class="sidebar-section">
                        <label class="filter-label" for="vehicle-search-input">Search</label>
                        <input type="text" id="vehicle-search-input" class="search-input" placeholder="Search vehicles...">
                    </div>

                    <div class="sidebar-section">
                        <label class="filter-label" for="vehicle-faction-filter">Faction</label>
                        <select id="vehicle-faction-filter" class="filter-select">
                            <option value="all">All Factions</option>
                        </select>
                    </div>
                </aside>

                <!-- Vehicle List and Detail -->
                <main class="content">
                    <div class="content-split">
                        <div class="threat-list-container">
                            <div id="vehicle-list" class="threat-list">
                                <!-- Vehicle list items populated by JavaScript -->
                            </div>
                        </div>

                        <div class="threat-detail-container">
                            <div id="vehicle-detail" class="threat-detail">
                                <div class="threat-detail-placeholder">
                                    <p>Select a vehicle from the list to view details</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>

            <!-- Threat Builder Tab -->
            <div id="tab-builder" class="tab-content">
```

The `threat-list-container`, `threat-detail-container`, `threat-list` and `threat-detail` classes give the tab the Threats tab's layout and its mobile rules. `ThreatsTab` reads its own elements by id, so the shared classes do not reach it.

In the same file, replace:

```html
    <script src="tabs/threats-tab.js?v=92"></script>
```

with:

```html
    <script src="tabs/threats-tab.js?v=92"></script>
    <script src="tabs/vehicles-tab.js?v=92"></script>
```

- [ ] **Step 5: Wire the tab into `app.js`**

In `bestiary/js/app.js`, replace:

```js
        ThreatsTab.init();
        GlossaryTab.init();
```

with:

```js
        ThreatsTab.init();
        VehiclesTab.init();
        GlossaryTab.init();
```

In `handleDeepLink`, replace:

```js
        } else if (section === 'glossary' && id) {
            this.switchTab('glossary');
            GlossaryTab.navigateToEntry(id);
        }
```

with:

```js
        } else if (section === 'vehicles' && id) {
            this.switchTab('vehicles');
            VehiclesTab.selectVehicle(id);
        } else if (section === 'glossary' && id) {
            this.switchTab('glossary');
            GlossaryTab.navigateToEntry(id);
        }
```

In `switchTab`, replace:

```js
        } else if (tabName === 'threats') {
            ThreatsTab.refresh();
```

with:

```js
        } else if (tabName === 'threats') {
            ThreatsTab.refresh();
        } else if (tabName === 'vehicles') {
            VehiclesTab.refresh();
```

Do not add `vehicles` to `TABS_WITHOUT_SIDEBAR`. The tab has a sidebar, so the hamburger stays.

- [ ] **Step 6: Add the styles**

Append this block at the end of `bestiary/css/styles.css`:

```css

/* ===== Vehicles Tab ===== */
#tab-vehicles {
    flex-direction: row;
}

.vehicle-list-item {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 12px 15px;
    cursor: pointer;
    transition: all 0.2s;
}

.vehicle-list-item:hover {
    border-color: var(--accent-gold);
}

.vehicle-list-item.selected {
    border-color: var(--accent-gold);
    background: var(--bg-tertiary);
}

.vehicle-list-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 4px;
}

.vehicle-list-name {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
}

.vehicle-list-value {
    flex-shrink: 0;
    padding: 2px 8px;
    background: var(--bg-tertiary);
    border-radius: var(--radius-sm);
    font-size: 11px;
    font-weight: 600;
    color: var(--accent-gold);
}

.vehicle-list-faction {
    font-size: 11px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.vehicle-link {
    display: inline-block;
    margin-bottom: 6px;
    font-size: 13px;
    color: var(--accent-gold);
    text-decoration: none;
    border-bottom: 1px dotted var(--accent-gold);
}

.vehicle-link:hover {
    border-bottom-style: solid;
}

.vehicle-card-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    font-size: 13px;
    color: var(--text-secondary);
}

.vehicle-card-faction {
    font-weight: 600;
    color: var(--text-primary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.vehicle-meta-label {
    color: var(--text-muted);
}

.vehicle-chip {
    display: inline-block;
    padding: 3px 10px;
    margin-right: 6px;
    margin-bottom: 6px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
    font-size: 12px;
    color: var(--text-secondary);
    letter-spacing: 0.5px;
}

.vehicle-chip-keyword {
    text-transform: uppercase;
}

/* A chip with a glossary entry opens it */
.vehicle-chip[data-popup-type] {
    border-color: var(--accent-gold);
    color: var(--accent-gold);
    cursor: pointer;
}

.vehicle-chip[data-popup-type]:hover {
    background: var(--accent-gold);
    color: var(--bg-primary);
}

.vehicle-twin-marker {
    color: var(--accent-gold);
    cursor: pointer;
    border-bottom: 1px dotted var(--accent-gold);
}

.vehicle-twin-marker:hover {
    border-bottom-style: solid;
}

/* The weapons table scrolls inside its box on a narrow screen, never the page */
.vehicle-table-scroll {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
}

.vehicle-weapons-table {
    min-width: 560px;
}

.vehicle-weapons-table td {
    font-size: 13px;
}

.vehicle-weapons-table .vehicle-weapon-name,
.vehicle-weapons-table .vehicle-weapon-traits {
    text-align: left;
}

.vehicle-weapons-table .vehicle-weapon-name {
    font-weight: 600;
    color: var(--text-primary);
}

.vehicle-sidebar-box {
    margin-bottom: 15px;
    padding: 12px 0;
    background: var(--bg-secondary);
    border: 1px solid var(--accent-gold);
    border-radius: var(--radius-sm);
}

.vehicle-sidebar-title {
    padding: 0 12px 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--accent-gold);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.vehicle-family-section .threat-text-section + .threat-text-section {
    margin-top: 10px;
}

.vehicle-none {
    color: var(--text-muted);
}

/* Vehicle prose keeps the data's paragraph breaks (\n\n) */
.vehicle-card .threat-card-description {
    white-space: pre-line;
}

@media (max-width: 1024px) {
    #tab-vehicles .content-split {
        flex-direction: column;
        gap: 15px;
    }
}

@media (max-width: 768px) {
    .vehicle-card .threat-card-header {
        text-align: center;
    }

    .vehicle-card-meta {
        justify-content: center;
    }
}
```

The existing rules for `.threat-list-container` and `.threat-detail-container` already stack the list (1024 px and below) and hide the detail panel (768 px and below). The `#tab-threats .content-split` rules are id-scoped, so the block above adds the same rule for `#tab-vehicles`.

- [ ] **Step 7: Run the tests to verify they pass**

Run:

```bash
wsl -e bash -s <<'EOF'
cd /root/projects/QK-Wrath-and-Glory
node scripts/test-vehicles-tab.js | tail -1
node scripts/test-encounter-vehicles.js | tail -1
EOF
```

Expected: `All checks passed.` two times.

- [ ] **Step 8: Browser check: list, filters, card and deep links (desktop)**

Use the browser setup of the Global Constraints (server, cache, desktop size).

1. `browser_navigate` to `http://127.0.0.1:8137/bestiary/`. Clear the storage. Navigate to the same URL again.
2. `browser_click` with target `.tab-btn[data-tab="vehicles"]`.
3. `browser_evaluate`:

   ```js
   () => ({
       tab: App.currentTab,
       items: document.querySelectorAll('#vehicle-list .vehicle-list-item').length,
       options: document.querySelectorAll('#vehicle-faction-filter option').length,
       hamburgerShown: !document.getElementById('hamburger-btn').classList.contains('hamburger-btn--hidden')
   })
   ```

   Expected: `{"tab":"vehicles","items":107,"options":12,"hamburgerShown":true}`.
4. `browser_evaluate`:

   ```js
   async () => {
       const input = document.getElementById('vehicle-search-input');
       input.value = 'land raider';
       input.dispatchEvent(new Event('input', { bubbles: true }));
       await new Promise(resolve => setTimeout(resolve, 400));
       const names = [...document.querySelectorAll('#vehicle-list .vehicle-list-name')].map(el => el.textContent.trim());
       input.value = '';
       input.dispatchEvent(new Event('input', { bubbles: true }));
       await new Promise(resolve => setTimeout(resolve, 400));
       return names;
   }
   ```

   Expected: the array holds `Crusader (Land Raider)`, `Land Raider` and `Redeemer (Land Raider)`.
5. `browser_evaluate`:

   ```js
   () => {
       const select = document.getElementById('vehicle-faction-filter');
       select.value = 'Ork';
       select.dispatchEvent(new Event('change', { bubbles: true }));
       const factions = [...new Set([...document.querySelectorAll('#vehicle-list .vehicle-list-faction')].map(el => el.textContent.trim()))];
       select.value = 'all';
       select.dispatchEvent(new Event('change', { bubbles: true }));
       return factions;
   }
   ```

   Expected: `["Ork"]`.
6. `browser_click` with target `.vehicle-list-item[data-vehicle-id="chimera"]`. Then `browser_evaluate`:

   ```js
   () => {
       const vehicle = DataLoader.getVehicle('chimera');
       const card = document.querySelector('#vehicle-detail .vehicle-card');
       return {
           title: card.querySelector('.threat-card-title').textContent.trim(),
           sourceOk: card.querySelector('.threat-card-source').textContent.trim() === DataLoader.formatSourcePage(vehicle),
           strip: [...card.querySelectorAll('.vehicle-stat-strip th')].map(th => th.textContent.trim()),
           crewOk: card.querySelector('.vehicle-crew').textContent.trim() === vehicle.crew,
           keywordChipsOk: card.querySelectorAll('.vehicle-chip-keyword').length === vehicle.keywords.length,
           weaponRowsOk: card.querySelectorAll('.vehicle-weapon-name').length ===
               vehicle.weapons.reduce((n, w) => n + (Array.isArray(w.profileIds) ? w.profileIds.length : 1), 0),
           preLine: getComputedStyle(card.querySelector('.threat-card-description')).whiteSpace === 'pre-line',
           addButton: !!card.querySelector('.vehicle-add-btn'),
           hash: location.hash
       };
   }
   ```

   Expected: `{"title":"Chimera","sourceOk":true,"strip":["Spd","Man","Res","W","Size"],"crewOk":true,"keywordChipsOk":true,"weaponRowsOk":true,"preLine":true,"addButton":true,"hash":"#vehicles/chimera"}`. Take a screenshot: `.playwright-mcp/vehicles-tab-desktop.png`.
7. `browser_navigate` to `http://127.0.0.1:8137/bestiary/#vehicles/land_raider_crusader`. `browser_evaluate` with `() => [document.querySelector('#vehicle-detail .threat-card-title').textContent.trim(), document.querySelector('#vehicle-detail .vehicle-variant-link').textContent.trim()]`. Expected: `["Crusader","Variant of Land Raider"]`.
8. `browser_click` with target `#vehicle-detail .vehicle-variant-link`. `browser_evaluate` with `() => [document.querySelector('#vehicle-detail .threat-card-title').textContent.trim(), location.hash]`. Expected: `["Land Raider","#vehicles/land_raider"]`.
9. `browser_navigate` to `http://127.0.0.1:8137/bestiary/#vehicles/no_such_vehicle`. `browser_evaluate` with `() => document.getElementById('vehicle-detail').textContent.includes('Vehicle not found')`. Expected: `true`.
10. `browser_click` with target `.tab-btn[data-tab="settings"]`. `browser_click` with target `#source-filter-buttons .filter-btn[data-source="Church of Steel"]`. `browser_click` with target `.tab-btn[data-tab="vehicles"]`. `browser_evaluate` with `() => document.getElementById('vehicle-list').textContent.includes('No vehicles match your filters')`. Expected: `true`.
11. Turn the source on again: click the Settings tab, the same Church of Steel button, and the Vehicles tab. `browser_evaluate` with `() => document.querySelectorAll('#vehicle-list .vehicle-list-item').length`. Expected: `107`.
12. Read the console errors. Expected: none.

- [ ] **Step 9: Browser check: chip popups and Add to Encounter (desktop)**

1. `browser_evaluate`:

   ```js
   async () => {
       const withTrait = DataLoader.getVehicles().find(v => v.traits.length > 0);
       App.switchTab('vehicles');
       VehiclesTab.selectVehicle(withTrait.id);
       const chip = document.querySelector('#vehicle-detail .vehicle-chip[data-popup-type="vehicleTrait"]');
       chip.click();
       await new Promise(resolve => setTimeout(resolve, 500));
       const popups = [...document.querySelectorAll('.glossary-popup')];
       return {
           open: popups.length,
           type: popups.length ? popups[0].querySelector('.glossary-popup-type').textContent.trim() : null,
           titleOk: popups.length ? popups[0].querySelector('.glossary-popup-title').textContent.trim() === Glossary.getEntry('vehicleTrait', chip.dataset.popupKey).name : false
       };
   }
   ```

   Expected: `{"open":1,"type":"Vehicle Trait","titleOk":true}`. One open popup after 500 ms shows that the click did not reach the document handler.
2. `browser_navigate` to `http://127.0.0.1:8137/bestiary/#vehicles/chimera`. `browser_evaluate` with `() => document.querySelector('#vehicle-detail .vehicle-chip-keyword[data-popup-key]').dataset.popupKey`. Note the key that it returns.
3. `browser_click` with target `#vehicle-detail .vehicle-chip-keyword[data-popup-key="<key from item 2>"]`. `browser_wait_for` with `time: 0.5`. `browser_evaluate` with `() => [...document.querySelectorAll('.glossary-popup .glossary-popup-type')].map(el => el.textContent.trim())`. Expected: `["Keyword"]`.
4. `browser_evaluate`:

   ```js
   async () => {
       const twin = DataLoader.getVehicles().find(v => v.weapons.some(w => w.twin));
       VehiclesTab.selectVehicle(twin.id);
       document.querySelector('#vehicle-detail .vehicle-twin-marker').click();
       await new Promise(resolve => setTimeout(resolve, 500));
       const popups = [...document.querySelectorAll('.glossary-popup')];
       return popups.map(p => [p.querySelector('.glossary-popup-type').textContent.trim(), p.querySelector('.glossary-popup-title').textContent.trim()]);
   }
   ```

   Expected: `[["Vehicle Rule","Twin Weapons"]]`.
5. `browser_navigate` to `http://127.0.0.1:8137/bestiary/#vehicles/chimera`. `browser_click` with target `#vehicle-detail .vehicle-add-btn`. `browser_evaluate` with `() => [document.querySelector('.add-notification') ? document.querySelector('.add-notification').textContent : null, EncounterState.vehicles.map(v => v.vehicleId)]`. Expected: `["Added Chimera to encounter",["chimera"]]`. The encounter rows for vehicles come in Task 2.5.
6. Read the console errors. Expected: none.

- [ ] **Step 10: Browser check: phone**

1. `browser_resize` with width 390 and height 844.
2. `browser_navigate` to `http://127.0.0.1:8137/bestiary/?cb=1#vehicles/land_raider_crusader`. The new query string forces a full page load.
3. `browser_evaluate` with `() => [BottomSheet.isOpen(), document.querySelector('#bottom-sheet-content .threat-card-title') ? document.querySelector('#bottom-sheet-content .threat-card-title').textContent.trim() : null]`. Expected: `[true,"Crusader"]`.
4. `browser_click` with target `#bottom-sheet-content .vehicle-variant-link`. `browser_wait_for` with `time: 1`. The wait is longer than the sheet's 320 ms clean-up timer.
5. Run the evaluate of item 3 again. Expected: `[true,"Land Raider"]`. A blank sheet or `null` is a failure (Review Focus 4).
6. `browser_evaluate` with `() => document.documentElement.scrollWidth <= window.innerWidth`. Expected: `true`.
7. `browser_evaluate`:

   ```js
   async () => {
       document.querySelector('#bottom-sheet-content [data-popup-type]').click();
       await new Promise(resolve => setTimeout(resolve, 500));
       return document.querySelectorAll('.glossary-popup').length;
   }
   ```

   Expected: `1`.
8. Take a screenshot: `.playwright-mcp/vehicles-tab-phone.png`.
9. `browser_resize` with width 1400 and height 900. Read the console errors. Expected: none.

- [ ] **Step 11: Commit**

```bash
wsl -e bash -s <<'EOF'
cd /root/projects/QK-Wrath-and-Glory
/usr/bin/git status --short | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
/usr/bin/git add bestiary/tabs/vehicles-tab.js bestiary/index.html bestiary/js/app.js bestiary/css/styles.css scripts/test-vehicles-tab.js
/usr/bin/git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Add the bestiary Vehicles tab with its card and popups (#28)" 2>&1 | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
EOF
```

Expected: before the commit, `git status --short` lists only the files that this task touches, the files of the `git add` line. An untracked file that no task touches, such as `relic-final-form-step.png`, can also show; leave it. Then one new commit lands on the `vehicles` branch.

---

### Task 2.5: Vehicles in the Encounter Builder list and detail panel

**Agent:** implementer, model: opus. This is a cross-layer change: it joins the encounter state, the Vehicles tab renderers, the bottom sheet and the issue #26 scroll fix.

**Files:**
- Modify: `bestiary/tabs/encounter-tab.js:276-292` (initiative input), `:308` (row wound buttons, before the shock buttons), `:517-526` (`renderEncounterItem`), `:654` (new `renderVehicleItem` before `selectItem`), `:676-686` (`_renderDetailContent`), `:1071` (new panel functions before `renderMobMemberItem`), `:1870-1875` (`handleDelete`)
- Modify: `bestiary/css/styles.css` (append to the Vehicles section)
- Test: `scripts/test-encounter-vehicles.js` (new block)

**Interfaces:**
- Consumes: `EncounterState.getVehicle(id)`, `updateVehicleWounds(id, delta)`, `setVehicleInitiative(id, value)`, `removeVehicle(id)`, `isVehicleDestroyed(id)`, and the `getEncounterListItems()` vehicle item `{ type: 'vehicle', id, name, initiative, isDead, maxWounds, data }` (Task 2.3). `DataLoader.getVehicle(id)` and `getVehicleDisplayName(vehicle)` (Task 2.2). `VehiclesTab.renderVehicleCardMini(vehicle)`, `VehiclesTab.bindCardPopups(container)` and the `.vehicle-link` class (Task 2.4). Existing: `App.switchTab(tabName)`, `GlossaryTab.navigateToEntry(entryId)`, `EncounterTab.renderDetail()` with its scroll save and restore.
- Produces: `EncounterTab.renderVehicleItem(item) → string`, `EncounterTab.renderVehicleDetailPanel(container) → void`, `EncounterTab.bindVehicleDetailEvents(container) → void`, selection type `'vehicle'`. No later task calls them.

Decisions in this task (the spec leaves them open):
- The row has a `VEHICLE` badge and a wounds bar, as an individual row has. It has no duplicate button.
- The panel binds its controls inside its own container, so the desktop panel and the bottom sheet never share element ids.
- The Vehicle Damage link opens the rule with a direct call to `App.switchTab` and `GlossaryTab.navigateToEntry`. The `href` stays for "open in a new tab" (Review Focus 5).

- [ ] **Step 1: Write the failing test**

In `scripts/test-encounter-vehicles.js`, insert this block above the line `    // --- end of checks ---`:

```js
    // --- Encounter rows and detail panel (Task 2.5) ---
    {
        // escapeHtml() needs document.createElement; the panel renderers need a container
        sandbox.document = {
            createElement() {
                let text = '';
                return {
                    set textContent(value) { text = String(value); },
                    get innerHTML() { return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
                };
            }
        };
        const makeContainer = () => ({ innerHTML: '', querySelector: () => null, querySelectorAll: () => [] });
        DataLoader.cache['glossary.json'] = readJson('data/glossary.json');
        DataLoader.cache['weapons.json'] = readJson('data/weapons.json');
        DataLoader.cache['equipment.json'] = readJson('data/equipment.json');
        load('bestiary/js/glossary.js');
        load('bestiary/tabs/vehicles-tab.js');
        load('bestiary/tabs/encounter-tab.js');
        vm.runInContext('Glossary', sandbox).data = DataLoader.cache['glossary.json'];
        const EncounterTab = vm.runInContext('EncounterTab', sandbox);
        const chimera = DataLoader.getVehicle('chimera');
        const max = chimera.wounds;
        const rowFor = (id) => EncounterState.getEncounterListItems().find(item => item.id === id);

        // List row
        EncounterState.clearEncounter();
        const rowId = EncounterState.addVehicle('chimera');
        let html = EncounterTab.renderEncounterItem(rowFor(rowId));
        check('a vehicle row renders through renderEncounterItem', html.includes('data-type="vehicle"'), true);
        check('the row shows the display name', html.includes(DataLoader.getVehicleDisplayName(chimera)), true);
        check('the row shows damage taken over Max Wounds', html.includes(`>0/${max}<`), true);
        check('the row has a - and a + wound button', (html.match(/class="vehicle-wound-btn"/g) || []).length, 2);
        check('the row has the initiative input and the remove button',
            html.includes('class="initiative-input"') && html.includes('data-type="vehicle" title="Remove"'), true);
        check('the row has no bonus, shock, ruin or duplicate control', /bonus-select|shock-btn|ruin-btn|duplicate-btn/.test(html), false);
        EncounterState.updateVehicleWounds(rowId, max + 1);
        html = EncounterTab.renderEncounterItem(rowFor(rowId));
        check('a destroyed vehicle row uses the dead styling', /class="encounter-item vehicle-item[^"]*\bdead\b/.test(html), true);

        EncounterState.loadFromData({ vehicles: [{ id: 'v-gone', vehicleId: 'retired_vehicle', wounds: 2, initiative: null }] });
        html = EncounterTab.renderEncounterItem(rowFor('v-gone'));
        check('an unknown vehicle row says Unknown vehicle', html.includes('Unknown vehicle'), true);
        check('an unknown vehicle row shows no Max Wounds', html.includes('>2/-<'), true);

        // Detail panel
        EncounterTab.selectedId = 'v-gone';
        EncounterTab.selectionType = 'vehicle';
        let panel = makeContainer();
        EncounterTab._renderDetailContent(panel);
        check('an unknown vehicle panel says Vehicle data not found', panel.innerHTML.includes('Vehicle data not found'), true);

        EncounterState.clearEncounter();
        const panelId = EncounterState.addVehicle('chimera');
        EncounterTab.selectedId = panelId;
        panel = makeContainer();
        EncounterTab._renderDetailContent(panel);
        check('the panel names the vehicle', panel.innerHTML.includes(`<h3>${DataLoader.getVehicleDisplayName(chimera)}</h3>`), true);
        check('the panel has the Wounds controls', (panel.innerHTML.match(/vehicle-detail-wound-btn/g) || []).length, 2);
        check('the panel shows damage over Max Wounds', panel.innerHTML.includes(`0 / ${max}`), true);
        check('the panel links the Vehicle Damage rule', panel.innerHTML.includes('href="#glossary/vehicleRules-vehicle_damage"'), true);
        check('the panel holds the compressed card', panel.innerHTML.includes('Vehicle Stats') && panel.innerHTML.includes('vehicle-stat-strip'), true);
        EncounterState.updateVehicleWounds(panelId, max + 1);
        panel = makeContainer();
        EncounterTab._renderDetailContent(panel);
        check('a destroyed vehicle panel shows DESTROYED', panel.innerHTML.includes('DESTROYED'), true);

        // The list's remove button clears the selection
        EncounterTab.renderEncounterList = () => {};
        EncounterTab.renderDetail = () => {};
        EncounterTab.handleDelete(panelId, 'vehicle');
        check('handleDelete removes the vehicle', EncounterState.getVehicle(panelId), undefined);
        check('handleDelete clears the selection', [EncounterTab.selectedId, EncounterTab.selectionType], [null, null]);
    }

```

- [ ] **Step 2: Run the test to verify it fails**

Run: `wsl -e bash -c 'cd /root/projects/QK-Wrath-and-Glory && node scripts/test-encounter-vehicles.js 2>&1 | grep -A1 -e FAIL -e Error'`

Expected: FAIL lines for the row checks, the panel checks and `handleDelete removes the vehicle`, because `renderEncounterItem` returns `''` for a vehicle. The exit code is 1.

- [ ] **Step 3: Bind the vehicle row controls**

In `bestiary/tabs/encounter-tab.js`, in `renderEncounterList`, replace:

```js
                } else if (type === 'player') {
                    EncounterState.setPlayerCharacterInitiative(id, e.target.value);
                    // Also update the sidebar input
                    this.renderPlayerCharacterInputs();
                }
```

with:

```js
                } else if (type === 'player') {
                    EncounterState.setPlayerCharacterInitiative(id, e.target.value);
                    // Also update the sidebar input
                    this.renderPlayerCharacterInputs();
                } else if (type === 'vehicle') {
                    EncounterState.setVehicleInitiative(id, e.target.value);
                }
```

In the same function, replace:

```js
        container.querySelectorAll('.shock-btn').forEach(btn => {
```

with:

```js
        container.querySelectorAll('.vehicle-wound-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                EncounterState.updateVehicleWounds(id, parseInt(btn.dataset.delta));
                this.renderEncounterList();
                if (this.selectedId === id) {
                    this.renderDetail();
                }
            });
        });

        container.querySelectorAll('.shock-btn').forEach(btn => {
```

The vehicle buttons use their own class. The existing `.wound-btn` handler calls `updateWounds()`, which only knows individuals.

- [ ] **Step 4: Render the vehicle row**

In the same file, replace:

```js
        } else if (item.type === 'player') {
            return this.renderPlayerItem(item);
        }
        return '';
    },
```

with:

```js
        } else if (item.type === 'player') {
            return this.renderPlayerItem(item);
        } else if (item.type === 'vehicle') {
            return this.renderVehicleItem(item);
        }
        return '';
    },
```

In the same file, replace:

```js
    selectItem(id, type) {
```

with:

```js
    renderVehicleItem(item) {
        const entry = item.data;
        const isSelected = this.selectedId === item.id && this.selectionType === 'vehicle';
        const deadClass = item.isDead ? 'dead' : '';
        const woundPercent = item.maxWounds ? Math.min(100, (entry.wounds / item.maxWounds) * 100) : 0;

        return `
            <div class="encounter-item vehicle-item ${isSelected ? 'selected' : ''} ${deadClass}"
                 data-id="${item.id}" data-type="vehicle" draggable="true">
                <div class="encounter-item-header">
                    <span class="drag-handle" title="Drag to reorder">&#x2630;</span>
                    <input type="number" class="initiative-input" value="${item.initiative ?? ''}"
                           data-id="${item.id}" data-type="vehicle" placeholder="Init"
                           min="0" max="99">
                    <span class="encounter-item-name">${this.escapeHtml(item.name)}</span>
                    <span class="vehicle-badge">VEHICLE</span>
                </div>
                <div class="encounter-item-stats">
                    <div class="stat-tracker wounds-tracker">
                        <span class="stat-label">W:</span>
                        <button class="vehicle-wound-btn" data-id="${item.id}" data-delta="-1">-</button>
                        <span class="stat-value">${entry.wounds}/${item.maxWounds ?? '-'}</span>
                        <button class="vehicle-wound-btn" data-id="${item.id}" data-delta="1">+</button>
                        <div class="stat-bar">
                            <div class="stat-bar-fill wounds-bar" style="width: ${woundPercent}%"></div>
                        </div>
                    </div>
                </div>
                <div class="encounter-item-actions">
                    <button class="delete-btn" data-id="${item.id}" data-type="vehicle" title="Remove">
                        <span>&times;</span>
                    </button>
                </div>
            </div>
        `;
    },

    selectItem(id, type) {
```

The `.stat-tracker button` rule already styles the two buttons. The existing drag handle code and `moveItemInOrder` handle the `vehicle` type without change.

- [ ] **Step 5: Render the vehicle detail panel**

In the same file, replace:

```js
        } else if (this.selectionType === 'player') {
            this.renderPlayerDetail(container);
        }
    },
```

with:

```js
        } else if (this.selectionType === 'player') {
            this.renderPlayerDetail(container);
        } else if (this.selectionType === 'vehicle') {
            this.renderVehicleDetailPanel(container);
        }
    },
```

In the same file, replace:

```js
    renderMobMemberItem(individual, threat) {
```

with:

```js
    renderVehicleDetailPanel(container) {
        const entry = EncounterState.getVehicle(this.selectedId);
        if (!entry) {
            container.innerHTML = '<p>Entry not found</p>';
            return;
        }

        const vehicle = DataLoader.getVehicle(entry.vehicleId);
        if (!vehicle) {
            container.innerHTML = '<p>Vehicle data not found</p>';
            return;
        }

        const isDestroyed = EncounterState.isVehicleDestroyed(entry.id);
        const woundPercent = vehicle.wounds > 0 ? Math.min(100, (entry.wounds / vehicle.wounds) * 100) : 0;

        container.innerHTML = `
            <div class="encounter-detail-content">
                <div class="detail-header">
                    <h3>${this.escapeHtml(DataLoader.getVehicleDisplayName(vehicle))}</h3>
                    <span class="vehicle-badge">VEHICLE</span>
                    ${isDestroyed ? '<span class="status-badge dead-badge">DESTROYED</span>' : ''}
                </div>

                <div class="wound-shock-trackers">
                    <div class="large-tracker wounds-large">
                        <div class="tracker-label">Wounds</div>
                        <div class="tracker-controls">
                            <button class="tracker-btn vehicle-detail-wound-btn" data-delta="-1">-</button>
                            <span class="tracker-value">${entry.wounds} / ${vehicle.wounds}</span>
                            <button class="tracker-btn vehicle-detail-wound-btn" data-delta="1">+</button>
                        </div>
                        <div class="tracker-bar">
                            <div class="tracker-bar-fill wounds-bar" style="width: ${woundPercent}%"></div>
                        </div>
                    </div>
                </div>

                <a class="vehicle-link vehicle-damage-link" href="#glossary/vehicleRules-vehicle_damage">Vehicle Damage rule</a>

                <div class="threat-card-mini">
                    ${VehiclesTab.renderVehicleCardMini(vehicle)}
                </div>
            </div>
        `;

        this.bindVehicleDetailEvents(container);
        VehiclesTab.bindCardPopups(container);
    },

    // Controls are found inside the container, so the desktop panel and the bottom sheet never
    // share element ids.
    bindVehicleDetailEvents(container) {
        const id = this.selectedId;

        container.querySelectorAll('.vehicle-detail-wound-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                EncounterState.updateVehicleWounds(id, parseInt(btn.dataset.delta));
                this.renderEncounterList();
                this.renderDetail();
            });
        });

        // Open the rule with a direct call: a second click on a plain hash link fires no
        // hashchange, because the hash does not change.
        container.querySelector('.vehicle-damage-link')?.addEventListener('click', (e) => {
            e.preventDefault();
            App.switchTab('glossary');
            GlossaryTab.navigateToEntry('vehicleRules-vehicle_damage');
        });
    },

    renderMobMemberItem(individual, threat) {
```

`renderDetail()` saves and restores the scroll when the same entry renders again (issue #26). It keys on `_renderDetailContent`'s `selectionType + ':' + selectedId`, so the vehicle panel needs no extra scroll code. The wound buttons call `renderDetail()`, not `renderVehicleDetailPanel()`, for this reason.

- [ ] **Step 6: Remove a vehicle from the list**

In the same file, in `handleDelete`, replace:

```js
        } else if (type === 'mob') {
            EncounterState.removeMob(id);
        }
```

with:

```js
        } else if (type === 'mob') {
            EncounterState.removeMob(id);
        } else if (type === 'vehicle') {
            EncounterState.removeVehicle(id);
        }
```

- [ ] **Step 7: Add the styles**

Append this block at the end of `bestiary/css/styles.css`, after the Task 2.4 Vehicles section:

```css

/* Vehicles in the Encounter Builder */
.vehicle-item {
    border-left: 3px solid var(--accent-blue);
}

.vehicle-badge {
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    background: var(--accent-blue);
    color: var(--bg-primary);
}

.vehicle-damage-link {
    margin-bottom: 15px;
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run:

```bash
wsl -e bash -s <<'EOF'
cd /root/projects/QK-Wrath-and-Glory
node scripts/test-encounter-vehicles.js | tail -1
node scripts/test-vehicles-tab.js | tail -1
EOF
```

Expected: `All checks passed.` two times.

- [ ] **Step 9: Browser check: rows, panel, scroll and the destroyed state**

Use the browser setup of the Global Constraints (server, cache). Use `browser_resize` with width 1400 and height 700, so the detail panel can scroll.

1. `browser_navigate` to `http://127.0.0.1:8137/bestiary/`. Clear the storage. Navigate to the same URL again.
2. `browser_navigate` to `http://127.0.0.1:8137/bestiary/#vehicles/chimera`. `browser_click` with target `#vehicle-detail .vehicle-add-btn`.
3. `browser_navigate` to `http://127.0.0.1:8137/bestiary/#vehicles/land_raider_crusader`. `browser_click` with target `#vehicle-detail .vehicle-add-btn`.
4. `browser_evaluate` with `() => { EncounterState.addIndividual(DataLoader.getAllThreats()[0].id, 1, false); EncounterState.addPlayerCharacter('Ana'); return EncounterState.vehicles.length; }`. Expected: `2`.
5. `browser_click` with target `.tab-btn[data-tab="encounter"]`. Then `browser_evaluate`:

   ```js
   () => {
       const rows = [...document.querySelectorAll('#encounter-list .vehicle-item')];
       const wounds = (id) => DataLoader.getVehicle(id).wounds;
       return {
           names: rows.map(row => row.querySelector('.encounter-item-name').textContent.trim()),
           woundsOk: rows[0].querySelector('.stat-value').textContent.trim() === `0/${wounds('chimera')}` &&
               rows[1].querySelector('.stat-value').textContent.trim() === `0/${wounds('land_raider_crusader')}`,
           badges: rows.map(row => row.querySelector('.vehicle-badge').textContent.trim()),
           threatControls: rows.some(row => row.querySelector('.shock-btn, .bonus-select, .duplicate-btn'))
       };
   }
   ```

   Expected: `{"names":["Chimera","Crusader (Land Raider)"],"woundsOk":true,"badges":["VEHICLE","VEHICLE"],"threatControls":false}`.
6. `browser_evaluate`:

   ```js
   () => {
       document.querySelector('.vehicle-item .vehicle-wound-btn[data-delta="1"]').click();
       return document.querySelector('.vehicle-item .stat-value').textContent.trim() === `1/${DataLoader.getVehicle('chimera').wounds}`;
   }
   ```

   Expected: `true`. The first vehicle row is the Chimera row.
7. `browser_evaluate`:

   ```js
   () => {
       document.querySelector('.vehicle-item .encounter-item-name').click();
       const panel = document.getElementById('encounter-detail');
       return {
           title: panel.querySelector('.detail-header h3').textContent.trim(),
           trackerOk: panel.querySelector('.tracker-value').textContent.trim() === `1 / ${DataLoader.getVehicle('chimera').wounds}`,
           link: panel.querySelector('.vehicle-damage-link').getAttribute('href'),
           mini: !!panel.querySelector('.mini-card .vehicle-stat-strip')
       };
   }
   ```

   Expected: `{"title":"Chimera","trackerOk":true,"link":"#glossary/vehicleRules-vehicle_damage","mini":true}`. Take a screenshot: `.playwright-mcp/encounter-vehicle-panel.png`.
8. `browser_evaluate`:

   ```js
   async () => {
       const scroller = document.querySelector('.encounter-detail-container');
       scroller.scrollTop = 200;
       const before = scroller.scrollTop;
       document.querySelector('#encounter-detail .vehicle-detail-wound-btn[data-delta="1"]').click();
       await new Promise(resolve => setTimeout(resolve, 100));
       return { scrolled: before > 0, kept: scroller.scrollTop === before };
   }
   ```

   Expected: `{"scrolled":true,"kept":true}`. If `scrolled` is `false`, the panel is too short at this size. Then resize to height 600 and run the item again.
9. `browser_evaluate`:

   ```js
   () => {
       const entry = EncounterState.vehicles.find(v => v.vehicleId === 'chimera');
       const max = DataLoader.getVehicle('chimera').wounds;
       for (let i = 0; i < 100 && entry.wounds <= max; i++) {
           document.querySelector('#encounter-detail .vehicle-detail-wound-btn[data-delta="1"]').click();
       }
       const trackerAtCeiling = document.querySelector('#encounter-detail .tracker-value').textContent.trim();
       document.querySelector('#encounter-detail .vehicle-detail-wound-btn[data-delta="1"]').click();
       return {
           rowDead: document.querySelector('.vehicle-item').classList.contains('dead'),
           badge: document.querySelector('#encounter-detail .dead-badge') ? document.querySelector('#encounter-detail .dead-badge').textContent.trim() : null,
           ceilingOk: trackerAtCeiling === `${max + 1} / ${max}` &&
               document.querySelector('#encounter-detail .tracker-value').textContent.trim() === trackerAtCeiling
       };
   }
   ```

   Expected: `{"rowDead":true,"badge":"DESTROYED","ceilingOk":true}`.
10. `browser_evaluate`:

    ```js
    () => {
        const input = document.querySelector('.vehicle-item .initiative-input');
        input.value = '20';
        input.dispatchEvent(new Event('change', { bubbles: true }));
        const first = document.querySelector('#encounter-list .encounter-item');
        return [first.dataset.type, first.querySelector('.encounter-item-name').textContent.trim()];
    }
    ```

    Expected: `["vehicle","Chimera"]`.
11. `browser_evaluate`:

    ```js
    async () => {
        document.querySelector('#encounter-detail [data-popup-type]').click();
        await new Promise(resolve => setTimeout(resolve, 500));
        return document.querySelectorAll('.glossary-popup').length;
    }
    ```

    Expected: `1`.
12. Read the console errors. Expected: none.

- [ ] **Step 10: Browser check: the Vehicle Damage link, twice**

1. Press Escape to close every popup. Step 9 item 11 leaves a pinned popup open, and a popup over the link makes the next click time out. Use `browser_press_key` with `key: "Escape"`. Then `browser_evaluate` with `() => document.querySelectorAll('.glossary-popup').length`. Expected: `0`. If a popup is still open, press Escape again.
2. `browser_click` with target `#encounter-detail .vehicle-damage-link`.
3. `browser_evaluate` with `() => [App.currentTab, !!document.querySelector('.glossary-entry.expanded[data-entry-id="vehicleRules-vehicle_damage"]')]`. Expected: `["glossary",true]`.
4. `browser_click` with target `.tab-btn[data-tab="encounter"]`.
5. `browser_evaluate` with `() => [App.currentTab, !!document.querySelector('#encounter-detail .vehicle-damage-link')]`. Expected: `["encounter",true]`.
6. `browser_click` with target `#encounter-detail .vehicle-damage-link` again.
7. Run the evaluate of item 3 again. Expected: `["glossary",true]`. The tab `encounter` here is a failure (Review Focus 5).
8. Read the console errors. Expected: none.

- [ ] **Step 11: Browser check: autosave, a saved file and an unknown vehicle**

1. `browser_click` with target `.tab-btn[data-tab="encounter"]`.
2. `browser_evaluate` with `() => { document.querySelectorAll('.vehicle-item')[1].querySelector('.delete-btn').click(); return document.querySelectorAll('.vehicle-item').length; }`. Expected: `1`.
3. `browser_wait_for` with `time: 3`. The autosave debounce is 2 seconds.
4. `browser_navigate` to `http://127.0.0.1:8137/bestiary/?cb=2`. `browser_evaluate` with `() => [App.currentTab, EncounterState.vehicles.map(v => v.vehicleId), document.querySelectorAll('#encounter-list .vehicle-item').length]`. Expected: `["encounter",["chimera"],1]`.
5. Use the Write tool to create `\\wsl.localhost\Ubuntu-24.04\root\projects\QK-Wrath-and-Glory\.playwright-mcp\vehicles-convoy.encounter` with this content:

   ```json
   {
     "version": 1,
     "settings": { "tier": 2, "playerCount": 4, "name": "Convoy", "round": 1 },
     "individuals": [],
     "mobs": [],
     "playerCharacters": [],
     "vehicles": [
       { "id": "id-convoy-1", "vehicleId": "chimera", "wounds": 3, "initiative": 8 },
       { "id": "id-convoy-2", "vehicleId": "land_raider_crusader", "wounds": 0, "initiative": null },
       { "id": "id-convoy-3", "vehicleId": "retired_vehicle", "wounds": 1, "initiative": null }
     ],
     "encounterOrder": null,
     "customThreats": []
   }
   ```

6. `browser_click` with target `#btn-load-encounter`. Then `browser_file_upload` with `paths` set to that file's path.
7. `browser_evaluate`:

   ```js
   () => {
       const rows = [...document.querySelectorAll('#encounter-list .vehicle-item')].map(row => [
           row.querySelector('.encounter-item-name').textContent.trim(),
           row.querySelector('.stat-value').textContent.trim()
       ]);
       const w = (id) => DataLoader.getVehicle(id).wounds;
       return JSON.stringify(rows) === JSON.stringify([
           ['Chimera', `3/${w('chimera')}`],
           ['Crusader (Land Raider)', `0/${w('land_raider_crusader')}`],
           ['Unknown vehicle', '1/-']
       ]);
   }
   ```

   Expected: `true`. A file without its vehicles is a failure (Review Focus 3).
8. `browser_evaluate` with `() => { document.querySelectorAll('.vehicle-item')[2].querySelector('.encounter-item-name').click(); return document.getElementById('encounter-detail').textContent.includes('Vehicle data not found'); }`. Expected: `true`.
9. Read the console errors. Expected: none.

- [ ] **Step 12: Browser check: phone**

1. `browser_resize` with width 390 and height 844.
2. `browser_navigate` to `http://127.0.0.1:8137/bestiary/?cb=3`.
3. `browser_evaluate` with `() => { EncounterState.clearEncounter(); EncounterState.addVehicle('chimera'); App.switchTab('encounter'); return document.querySelectorAll('#encounter-list .vehicle-item').length; }`. Expected: `1`.
4. `browser_click` with target `#encounter-list .vehicle-item .encounter-item-name`.
5. `browser_evaluate`:

   ```js
   async () => {
       const sheet = document.getElementById('bottom-sheet-content');
       const max = DataLoader.getVehicle('chimera').wounds;
       const openWithPanel = BottomSheet.isOpen() && sheet.querySelector('.tracker-value').textContent.trim() === `0 / ${max}`;
       sheet.scrollTop = 150;
       const before = sheet.scrollTop;
       sheet.querySelector('.vehicle-detail-wound-btn[data-delta="1"]').click();
       await new Promise(resolve => setTimeout(resolve, 100));
       return {
           openWithPanel,
           scrolled: before > 0,
           kept: sheet.scrollTop === before,
           trackerOk: sheet.querySelector('.tracker-value').textContent.trim() === `1 / ${max}`,
           stillOpen: BottomSheet.isOpen()
       };
   }
   ```

   Expected: `{"openWithPanel":true,"scrolled":true,"kept":true,"trackerOk":true,"stillOpen":true}`.
6. `browser_evaluate` with `() => document.documentElement.scrollWidth <= window.innerWidth`. Expected: `true`.
7. Take a screenshot: `.playwright-mcp/encounter-vehicle-phone.png`.
8. `browser_resize` with width 1400 and height 900. Read the console errors. Expected: none.

- [ ] **Step 13: Commit**

```bash
wsl -e bash -s <<'EOF'
cd /root/projects/QK-Wrath-and-Glory
/usr/bin/git status --short | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
/usr/bin/git add bestiary/tabs/encounter-tab.js bestiary/css/styles.css scripts/test-encounter-vehicles.js
/usr/bin/git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Show vehicles in the Encounter Builder list and detail panel (#28)" 2>&1 | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
EOF
```

Expected: before the commit, `git status --short` lists only the files that this task touches, the files of the `git add` line. An untracked file that no task touches, such as `relic-final-form-step.png`, can also show; leave it. The file in `.playwright-mcp/` is gitignored, so it does not show. Then one new commit lands on the `vehicles` branch.

---

### Task 2.6: Cache busting, CLAUDE.md and the final check

**Agent:** implementer. The task holds mechanical edits and a scripted checklist.

**Files:**
- Modify: `bestiary/index.html` (all 16 `?v=` tags)
- Modify: `creator/index.html` (all 34 `?v=` tags)
- Modify: `creator/js/web-api.js:20` (data `?v=`)
- Modify: `CLAUDE.md` (the bestiary-only data line)
- Test: `scripts/test-vehicles-tab.js` (new block)

**Interfaces:**
- Consumes: the finished Tasks 2.1 to 2.5.
- Produces: the deployable state. No later task exists.

- [ ] **Step 1: Bump the bestiary versions**

In `bestiary/index.html`, use the Edit tool with `replace_all: true` to replace `?v=92` with `?v=93`.

Check with the Grep tool: pattern `\?v=93`, path `bestiary/index.html`, output mode `count`. Expected: `16`. Then pattern `\?v=92`. Expected: no match.

- [ ] **Step 2: Bump the creator versions**

In `creator/index.html`, use the Edit tool with `replace_all: true` to replace `?v=119` with `?v=120`.

Check with the Grep tool: pattern `\?v=120`, path `creator/index.html`, output mode `count`. Expected: `34`. Then pattern `\?v=119`. Expected: no match.

- [ ] **Step 3: Bump the creator data version**

In `creator/js/web-api.js`, replace:

```js
            const response = await fetch('../data/' + filename + '?v=43');
```

with:

```js
            const response = await fetch('../data/' + filename + '?v=44');
```

If the file already shows `?v=44`, Part 1 made this bump. Then leave the line as it is.

- [ ] **Step 4: List `vehicles.json` in `CLAUDE.md`**

In `CLAUDE.md`, replace:

```markdown
- Bestiary-only: threats, threat-weapons.
```

with:

```markdown
- Bestiary-only: threats, threat-weapons, vehicles.
```

If the line already lists `vehicles`, Part 1 made this edit. Then leave the line as it is.

- [ ] **Step 5: Add the creator version guard and run every test**

In `scripts/test-vehicles-tab.js`, insert this block above the line `    // --- end of checks ---`:

```js
    // --- Cache busting guard (Task 2.6) ---
    {
        const creatorHtml = readSource('creator/index.html');
        check('every ?v= in the creator page has one number', new Set([...creatorHtml.matchAll(/\?v=(\d+)/g)].map(m => m[1])).size, 1);
        check('the creator fetches data with a ?v= number', /'\?v=\d+'/.test(readSource('creator/js/web-api.js')), true);
    }

```

The guard does not pin a number, so a later bump does not break it. Task 2.4 added the same guard for the bestiary page.

Run:

```bash
wsl -e bash -s <<'EOF'
cd /root/projects/QK-Wrath-and-Glory
for f in test-vehicles test-vehicles-tab test-encounter-vehicles test-bonus-resolution test-followers test-improvised test-notes test-rarity test-xp-tip; do
    printf '%s: ' "$f"
    node "scripts/$f.js" 2>&1 | tail -1
done
EOF
```

Expected:

```
test-vehicles: All checks passed.
test-vehicles-tab: All checks passed.
test-encounter-vehicles: All checks passed.
test-bonus-resolution: All checks passed.
test-followers: All checks passed.
test-improvised: All checks passed.
test-notes: All checks passed.
test-rarity: All rarity tests passed.
test-xp-tip: All passed
```

- [ ] **Step 6: Final browser check: bestiary**

Use the browser setup of the Global Constraints (server, cache, desktop size). Read the console errors after each navigation.

1. `browser_navigate` to `http://127.0.0.1:8137/bestiary/`. Clear the storage. Navigate to the same URL again.
2. `browser_evaluate` with `() => [...new Set([...document.querySelectorAll('script[src], link[href]')].map(el => el.getAttribute('src') || el.getAttribute('href')).filter(url => url.includes('?v=')).map(url => url.split('?v=')[1]))]`. Expected: `["93"]`.
3. `browser_evaluate` with `() => { ['threats', 'vehicles', 'builder', 'encounter', 'glossary', 'references', 'settings'].forEach(tab => App.switchTab(tab)); return App.currentTab; }`. Expected: `"settings"`, with no console error.
4. `browser_evaluate` with `() => [...document.querySelectorAll('#source-filter-buttons .filter-btn')].some(b => b.dataset.source === 'Church of Steel')`. Expected: `true`.
5. `browser_evaluate` with `() => { const v = DataLoader.getVehicles().find(x => x.sidebar); App.switchTab('vehicles'); VehiclesTab.selectVehicle(v.id); return document.querySelector('#vehicle-detail .vehicle-sidebar-title').textContent.trim() === v.sidebar.title; }`. Expected: `true`.
6. `browser_evaluate` with `() => { App.switchTab('glossary'); document.querySelector('.glossary-filter-btn[data-category="vehicleRules"]').click(); return document.querySelectorAll('#glossary-content .glossary-entry').length === Object.keys(DataLoader.getGlossary().vehicleRules).length; }`. Expected: `true`.
7. `browser_evaluate` with `() => { App.switchTab('vehicles'); VehiclesTab.selectVehicle('chimera'); document.querySelector('#vehicle-detail .vehicle-add-btn').click(); App.switchTab('encounter'); return [...document.querySelectorAll('#encounter-list .vehicle-item .encounter-item-name')].map(el => el.textContent.trim()); }`. Expected: `["Chimera"]`.
8. `browser_resize` with width 390 and height 844. `browser_navigate` to `http://127.0.0.1:8137/bestiary/?cb=4#vehicles/chimera`. `browser_evaluate` with `() => [BottomSheet.isOpen(), document.documentElement.scrollWidth > window.innerWidth]`. Expected: `[true,false]`. Take a screenshot: `.playwright-mcp/final-bestiary-phone.png`.
9. `browser_resize` with width 1400 and height 900. Read the console errors. Expected: none.

- [ ] **Step 7: Final browser check: creator**

1. `browser_navigate` to `http://127.0.0.1:8137/creator/`. Accept a `beforeunload` dialog if one shows.
2. Run the evaluate of Step 6 item 2. Expected: `["120"]`.
3. `browser_evaluate` with `() => performance.getEntriesByType('resource').map(e => e.name).filter(name => name.includes('glossary.json'))`. Expected: one URL that ends with `data/glossary.json?v=44`.
4. `browser_navigate` to `http://127.0.0.1:8137/creator/#glossary/vehicleTraits-flyer`.
5. `browser_evaluate`:

   ```js
   () => {
       const trait = document.querySelector('.glossary-entry[data-entry-id="vehicleTraits-flyer"]');
       const div = document.createElement('div');
       div.innerHTML = Glossary.data.vehicleTraits.flyer.description;
       return [trait.classList.contains('expanded'), trait.querySelector('.glossary-entry-description').textContent.trim() === div.textContent.trim()];
   }
   ```

   Expected: `[true,true]`.
6. `browser_resize` with width 390 and height 844. `browser_navigate` to `http://127.0.0.1:8137/creator/?cb=5#glossary/vehicleRules-vehicle_damage`. `browser_evaluate` with `() => [!!document.querySelector('.glossary-entry.expanded[data-entry-id="vehicleRules-vehicle_damage"]'), document.documentElement.scrollWidth > window.innerWidth]`. Expected: `[true,false]`. Take a screenshot: `.playwright-mcp/final-creator-phone.png`.
7. `browser_resize` with width 1400 and height 900. Read the console errors. Expected: none.

- [ ] **Step 8: Commit**

```bash
wsl -e bash -s <<'EOF'
cd /root/projects/QK-Wrath-and-Glory
/usr/bin/git status --short | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
/usr/bin/git add bestiary/index.html creator/index.html creator/js/web-api.js CLAUDE.md scripts/test-vehicles-tab.js
/usr/bin/git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Bump the cache versions and list vehicles.json in CLAUDE.md (#28)" 2>&1 | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
/usr/bin/git branch --show-current
/usr/bin/git log --oneline -6 | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
EOF
```

Expected: before the commit, `git status --short` lists only the files that this task touches, the files of the `git add` line. An untracked file that no task touches, such as `relic-final-form-step.png`, can also show; leave it. Then one new commit lands on the branch, which prints as `vehicles`. The log shows the six Part 2 commits on top of the Part 1 commits. Do not push or merge. The user decides both.

---

## Spec coverage

| Spec item | Task |
|---|---|
| §3: Vehicle Traits and Vehicle Rules categories in both apps (`tabs/glossary-tab.js`, `index.html`) | 2.1 |
| §3: `#glossary/vehicleRules-<id>` deep link | 2.1 (both apps), 2.5 (panel link) |
| §3: no `buildTermMap` registration; popup types `vehicleTrait`, `vehicleRule` with labels; popup by entry | 2.1, 2.4 |
| §4: display name `<name> (<family name>)`, or the name alone when it contains the family name, through `DataLoader.getVehicleDisplayName()` | 2.2 |
| §4: list (display name, faction, Value/Rarity), search, faction select, source toggle, `getAllSources()` | 2.2, 2.4 |
| §4: card (heading, stat strip, keyword chips, Crew Complement, trait chips, weapons table, Twin marker, one row per `profileIds` profile, wargear, description, options, sidebar, family text, variant link, Add to Encounter) | 2.4 |
| §4: wiring (tab button, `#tab-vehicles`, file list, accessors, `init`, `switchTab`, `#vehicles/<id>`, BottomSheet, styles) | 2.2, 2.4 |
| §4: the creator does not load `vehicles.json` | Global Constraints (no creator data-loader change) |
| §5: `vehicles[]` entry, the five functions, `isEmpty`, `clearEncounter`, `getEncounterData`, `loadFromData`, `getEncounterListItems`, `moveItemInOrder`, `recalculateAllStats` | 2.3 |
| §5: list row, detail panel, scroll preservation, BottomSheet | 2.5 |
| §5: persistence, `version` 1, missing `vehicles`, unknown ids | 2.3, 2.5 |
| §7: cache busting in both apps and the creator data `?v=`; `CLAUDE.md` data list | 2.6 |
