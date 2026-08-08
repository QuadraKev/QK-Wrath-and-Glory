# Followers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a creator character keep followers — a single creature or a mob — reusing the threat statblocks in `data/threats.json`, with live wounds and shock tracking on the character sheet.

**Architecture:** One new builder section ("10. Followers") plus a character-sheet block. `threats.json` is 2.64 MB against the creator's current 2.21 MB total, so it loads on demand rather than at startup. The bestiary's threat-card renderer is ported into the creator as a parallel copy. Pure rule maths lives in its own file so a dependency-free Node test can exercise it.

**Tech Stack:** Vanilla JS, global-object module pattern (`const Followers = {…}`), no bundler, no framework. Node only for the test script.

**Spec:** `docs/superpowers/specs/2026-08-07-followers-design.md`
**Issue:** #21

## Global Constraints

- No build step. Plain `<script>` tags, globals, no modules, no dependencies.
- Follow `STYLE_GUIDE.md`. Match surrounding code style; do not reformat neighbouring code.
- The bestiary must not change. Every edit is in `creator/`, `scripts/`, or `docs/`.
- Data files must not change. This feature only reads `data/threats.json`.
- Commit author for every commit: `--author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>"`.
- Never print `$GH_TOKEN`. Pipe git/gh output through `sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'`.
- Serve the repo ROOT on port **8137** for browser testing: `python3 -m http.server 8137`, then open `http://127.0.0.1:8137/creator/`.
- Cache busting: bump every `?v=` in `creator/index.html` together, in Task 5. `creator/js/web-api.js` data `?v=42` does **not** change, because no data file changes.
- Followers cost no XP. Do not touch the XP engine.
- Run the whole test suite before each commit: `node scripts/test-bonus-resolution.js && node scripts/test-followers.js`.

## File Structure

| File | Responsibility |
| --- | --- |
| `creator/js/followers.js` | NEW. Pure rule maths and the blank-follower factory. No DOM, no globals beyond itself. |
| `creator/js/threat-card.js` | NEW. Statblock card renderer, ported from the bestiary. Pure string building. |
| `creator/tabs/followers-tab.js` | NEW. Builder section: threat picker and follower roster. |
| `scripts/test-followers.js` | NEW. Node test for `creator/js/followers.js`. |
| `creator/js/data-loader.js` | Lazy threat loading and threat accessors. |
| `creator/js/state.js` | `followers: []` plus three mutators. |
| `creator/js/app.js` | Section registration. |
| `creator/index.html` | Sidebar item, section container, script tags, cache bump. |
| `creator/tabs/character-sheet-tab.js` | `renderFollowers()` and its tracking events. |
| `creator/css/styles.css` | Ported threat-card styles and follower layout. |

---

### Task 1: Pure rule functions

**Files:**
- Create: `creator/js/followers.js`
- Test: `scripts/test-followers.js`

**Interfaces:**
- Consumes: nothing.
- Produces: global `Followers` with `THREAT_ATTR_MAP` (object), `mobAttackBonus(livingCount) → number`, `alternativeStatValue(rank, characterValue) → number`, `create(threatId) → object`.

- [ ] **Step 1: Write the failing test**

Create `scripts/test-followers.js`:

```js
// Tests for creator/js/followers.js — the pure rule maths behind the Followers feature.
// Run: node scripts/test-followers.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const sandbox = { console };
vm.createContext(sandbox);
// followers.js declares `const Followers`, which does not attach to the sandbox global,
// so evaluate the identifier as a trailing expression to get the object out.
const source = fs.readFileSync(path.join(ROOT, 'creator/js/followers.js'), 'utf8');
const Followers = vm.runInContext(source + '\n;Followers;', sandbox);

let failures = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// --- mob attack bonus: min(n-1, floor(n/2)), clamped at 0 ---
check('mobAttackBonus(0) clamps to 0', Followers.mobAttackBonus(0), 0);
check('mobAttackBonus(1) is 0', Followers.mobAttackBonus(1), 0);
check('mobAttackBonus(2) is 1', Followers.mobAttackBonus(2), 1);
check('mobAttackBonus(3) is 1', Followers.mobAttackBonus(3), 1);
check('mobAttackBonus(4) is 2', Followers.mobAttackBonus(4), 2);
check('mobAttackBonus(5) is 2', Followers.mobAttackBonus(5), 2);
check('mobAttackBonus(10) is 5', Followers.mobAttackBonus(10), 5);
check('mobAttackBonus handles a missing count', Followers.mobAttackBonus(undefined), 0);

// --- alternative stats: 1 + Double Rank, capped at the character's own value ---
check('rank 1 gives 3', Followers.alternativeStatValue(1, 99), 3);
check('rank 2 gives 5', Followers.alternativeStatValue(2, 99), 5);
check('rank 3 gives 7', Followers.alternativeStatValue(3, 99), 7);
check('capped at the character value', Followers.alternativeStatValue(3, 4), 4);
check('uncapped when the character value is missing', Followers.alternativeStatValue(3, null), 7);
check('defaults to rank 1 when rank is missing', Followers.alternativeStatValue(undefined, 99), 3);

// --- attribute key map covers all seven ---
check('THREAT_ATTR_MAP has seven entries', Object.keys(Followers.THREAT_ATTR_MAP).length, 7);
check('THREAT_ATTR_MAP maps threat keys to character keys',
    Object.keys(Followers.THREAT_ATTR_MAP).sort().join(','), 'A,Fel,I,Int,S,T,Wil');
check('THREAT_ATTR_MAP values are the character attribute names',
    Object.values(Followers.THREAT_ATTR_MAP).sort().join(','),
    'agility,fellowship,initiative,intellect,strength,toughness,willpower');

// --- blank follower factory ---
const f = Followers.create('cyber_mastiff');
check('create sets the threatId', f.threatId, 'cyber_mastiff');
check('create defaults to an individual', f.kind, 'individual');
check('create defaults count to 1', f.count, 1);
check('create defaults livingCount to 1', f.livingCount, 1);
check('create defaults the stats toggle to off', f.useAlternativeStats, false);
check('create leaves wounds untracked', f.currentWounds, null);
check('create leaves shock untracked', f.currentShock, null);
check('create gives an id', typeof f.id, 'string');
check('create ids are unique', Followers.create('a').id === Followers.create('b').id, false);

// --- every threatId used in the tests resolves in the dataset ---
const threats = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/threats.json'), 'utf8'));
const threatIds = new Set(threats.map(t => t.id));
check('cyber_mastiff resolves in data/threats.json', threatIds.has('cyber_mastiff'), true);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node scripts/test-followers.js
```

Expected: it throws, because `creator/js/followers.js` does not exist yet — `ENOENT: no such file or directory`.

- [ ] **Step 3: Write the implementation**

Create `creator/js/followers.js`:

```js
// Followers - pure rule helpers for the Followers feature.
// No DOM access, so scripts/test-followers.js can exercise this in plain Node.

const Followers = {
    // Threat statblocks key attributes as S/T/A/I/Wil/Int/Fel; the character uses full names.
    THREAT_ATTR_MAP: {
        S: 'strength',
        T: 'toughness',
        A: 'agility',
        I: 'initiative',
        Wil: 'willpower',
        Int: 'intellect',
        Fel: 'fellowship'
    },

    // Mob attack bonus. Mirrors getMobAttackBonus() in bestiary/js/encounter-state.js:458.
    // The Math.max(0, ...) matters: without it a mob of 0 living members returns -1.
    mobAttackBonus(livingCount) {
        const n = Number(livingCount) || 0;
        return Math.max(0, Math.min(n - 1, Math.floor(n / 2)));
    },

    // Alternative stats: Attributes and Skills equal 1 + Double Rank, and neither can be
    // higher than the character's own value. Granted by Devotees (core p132), Companion and
    // Companion (Elite) (apocrypha p234), and Familiar (apocrypha p236).
    alternativeStatValue(rank, characterValue) {
        const base = 1 + 2 * (Number(rank) || 1);
        if (characterValue === null || characterValue === undefined) return base;
        return Math.min(base, characterValue);
    },

    // A blank follower entry.
    create(threatId) {
        return {
            id: 'flw_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            threatId: threatId,
            name: '',
            kind: 'individual',
            count: 1,
            livingCount: 1,
            useAlternativeStats: false,
            currentWounds: null,
            currentShock: null,
            notes: ''
        };
    }
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node scripts/test-followers.js
```

Expected: `All checks passed.` and exit code 0.

- [ ] **Step 5: Commit**

```bash
node scripts/test-bonus-resolution.js && node scripts/test-followers.js
git add creator/js/followers.js scripts/test-followers.js
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Add the pure rule helpers for followers

mobAttackBonus mirrors the bestiary formula, including the clamp that keeps a
mob of 0 living members from returning -1. alternativeStatValue applies the
1 + Double Rank rule with the cap at the character's own value."
```

---

### Task 2: Lazy threat loading

**Files:**
- Modify: `creator/js/data-loader.js`

**Interfaces:**
- Consumes: `window.api.loadGameData(filename)` from `creator/js/web-api.js`, and `DataLoader.loadFile(filename)`.
- Produces: `DataLoader.ensureThreatsLoaded() → Promise<void>`, `DataLoader.areThreatsLoaded() → boolean`, `DataLoader.getThreat(id) → object|undefined`, `DataLoader.getAllThreats() → array`, `DataLoader.getThreatWeapon(id) → object|undefined`.

`getThreatWeapon` is required by the card renderer in Task 3, which also needs
`DataLoader.formatSourcePage(item)`. **`formatSourcePage` already exists** at
`creator/js/data-loader.js:339` and returns `"Name, p. N"`. Do not add a second one — a
duplicate key in the object literal is silently shadowed by the later definition, so it would
be dead code. Reuse the existing method.

- [ ] **Step 1: Add the loader and accessors**

In `creator/js/data-loader.js`, insert immediately after the `getWargearItem(id)` method (search for `getWargearItem(id) {`; it ends with `},`):

```js
    // Threats power the Followers feature. threats.json is 2.64 MB against the creator's
    // 2.21 MB of startup data, so it is fetched on demand instead of in loadAll().
    _threatsPromise: null,

    // Idempotent. Concurrent callers share one fetch.
    ensureThreatsLoaded() {
        if (this.cache['threats.json']) return Promise.resolve();
        if (!this._threatsPromise) {
            this._threatsPromise = Promise.all([
                this.loadFile('threats.json'),
                this.loadFile('threat-weapons.json')
            ]).then(() => undefined);
        }
        return this._threatsPromise;
    },

    // True once threats are available, so callers can render without awaiting.
    areThreatsLoaded() {
        return !!this.cache['threats.json'];
    },

    // Get all threats. Empty until ensureThreatsLoaded() resolves.
    getAllThreats() {
        return this.cache['threats.json'] || [];
    },

    // Get threat by ID
    getThreat(id) {
        return this.getAllThreats().find(t => t.id === id);
    },

    // Get threat weapon by ID (referenced by a threat ability's weaponId)
    getThreatWeapon(id) {
        const weapons = this.cache['threat-weapons.json'] || [];
        return weapons.find(w => w.id === id);
    },
```

Do **not** add a `formatSourcePage`. One already exists at `creator/js/data-loader.js:339`.

- [ ] **Step 2: Verify the file still parses**

```bash
node --check creator/js/data-loader.js
```

Expected: no output, exit code 0.

- [ ] **Step 3: Verify startup does not fetch threats.json**

Start the server, then check in the browser console at `http://127.0.0.1:8137/creator/`:

```bash
python3 -m http.server 8137
```

```js
// Paste into the browser console after the page settles.
performance.getEntriesByType('resource')
    .filter(r => r.name.includes('threats.json')).length
// Expected: 0
DataLoader.areThreatsLoaded()
// Expected: false
```

- [ ] **Step 4: Verify the lazy load works and is idempotent**

```js
await DataLoader.ensureThreatsLoaded();
DataLoader.getAllThreats().length          // Expected: 844
DataLoader.getThreat('cyber_mastiff').name // Expected: "CYBER MASTIFF"
DataLoader.formatSourcePage(DataLoader.getThreat('cyber_mastiff'))
// Expected: "Lex Imperialis, p. 12" — the existing app-wide citation format

await DataLoader.ensureThreatsLoaded();    // second call
performance.getEntriesByType('resource')
    .filter(r => r.name.includes('threats.json')).length
// Expected: 1 — not 2
```

- [ ] **Step 5: Commit**

```bash
node scripts/test-bonus-resolution.js && node scripts/test-followers.js
git add creator/js/data-loader.js
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Load threats on demand in the creator

threats.json is 2.64 MB against the creator's 2.21 MB of startup data, so it is
fetched the first time followers need it rather than in loadAll(). Concurrent
callers share one promise. Adds the threat accessors and the two helpers the
statblock card needs."
```

---

### Task 3: Port the threat statblock card

**Files:**
- Create: `creator/js/threat-card.js`
- Modify: `creator/css/styles.css`

**Interfaces:**
- Consumes: `DataLoader.getThreatWeapon(id)` and `DataLoader.formatSourcePage(entity)` from Task 2.
- Produces: global `ThreatCard` with `render(threat) → string` (an HTML string).

- [ ] **Step 1: Copy the renderer functions**

Create `creator/js/threat-card.js`. Copy these function bodies verbatim from `bestiary/tabs/threats-tab.js` into a `const ThreatCard = { … }` object:

| Source lines | Function |
| --- | --- |
| 363–467 | `renderThreatCard` → rename to `render` |
| 486–508 | `renderTierThreatTable` |
| 509–533 | `renderAttributesTable` |
| 534–547 | `renderResilienceRow` |
| 548–568 | `renderCombatStatsTable` |
| 569–579 | `renderSkillsRow` |
| 580–614 | `renderAbilities` |
| 615–629 | `formatWeaponStats` |
| 630–647 | `renderBonuses` |
| 648–659 | `renderDeterminationRow` |
| 660–670 | `renderTextSection` |
| 671–693 | `renderBottomStatsTable` |

Extract the block with:

```bash
sed -n '363,467p;486,693p' bestiary/tabs/threats-tab.js > /tmp/threat-card-body.js
```

Four changes to the copied code, and nothing else:

1. Rename `renderThreatCard(threat)` to `render(threat)`.
2. In `render`, delete the `${this.renderAddToEncounterHeader(threat)}` interpolation. That header is the encounter builder's Add-to-Encounter controls and has no meaning in the creator.
3. Delete the `.threat-card-header-actions` div and the Copy and Customize buttons inside it. Their click handlers live in the bestiary's `renderThreatDetail`, which is not ported, so in the creator they would be dead buttons.
4. Leave every `this.` call as is. All eleven sub-renderers travel together, so they resolve inside `ThreatCard`.

The only external references in the copied block are `DataLoader.getThreatWeapon` and `DataLoader.formatSourcePage`, both added in Task 2.

Wrap it:

```js
// Threat statblock card. Ported from bestiary/tabs/threats-tab.js so the creator can show
// follower statblocks. The bestiary keeps its own copy; this is a parallel copy in the same
// spirit as references-tab.js and glossary-tab.js. Keep the two in step when either changes.

const ThreatCard = {
    // ... the copied functions go here ...
};
```

- [ ] **Step 2: Verify it parses**

```bash
node --check creator/js/threat-card.js
```

Expected: no output, exit code 0.

- [ ] **Step 3: Copy the card styles**

Find the bestiary rules for the card classes and append them to `creator/css/styles.css` under a comment header:

The bestiary has a single stylesheet, `bestiary/css/styles.css`:

```bash
grep -n "^\.threat-card\|^\.threat-stat-table\|^\.threat-stats-section\|^\.threat-text-section\|^\.threat-tier-badge\|^\.threat-keyword" bestiary/css/styles.css
```

Do not hand-enumerate the classes — an enumeration is how this step first shipped a card with 25
unstyled classes. Derive the list from what the markup actually emits, and make this check print
nothing before you commit:

```bash
grep -oE 'class="[a-z0-9 _-]+"' creator/js/threat-card.js \
  | sed 's/class="//;s/"//' | tr ' ' '\n' | sort -u > /tmp/emitted.txt
while read c; do [ -z "$c" ] && continue; \
  grep -q "\.$c[ ,{:.]" creator/css/styles.css || echo "MISSING: .$c"; done < /tmp/emitted.txt
```

Copy each missing rule verbatim from `bestiary/css/styles.css`. The card needs roughly 40 classes
in total, spanning the card chrome (`.threat-card*`, `.threat-keyword*`), the stat tables
(`.tier-threat-table`, `.attributes-table`, `.combat-stats-table`, `.bottom-stats-table`), and the
content rows (`.resilience-*`, `.skills-*`, `.abilities-*`, `.ability-*`, `.bonuses-*`,
`.bonus-*`, `.determination-*`).

Do **not** copy `.threat-card-header-actions`, `.threat-list*`, `.threat-detail*`, `.threat-count`, or `.threat-card-mini`. Those belong to the bestiary's list and encounter UI.

Prefix the block:

```css
/* ===== Threat statblock card (ported from the bestiary for Followers) ===== */
```

- [ ] **Step 4: Verify the card renders**

Add the script tag temporarily to test, or paste into the browser console at `http://127.0.0.1:8137/creator/` after loading `threat-card.js` manually:

```js
await DataLoader.ensureThreatsLoaded();
const html = ThreatCard.render(DataLoader.getThreat('cyber_mastiff'));
html.includes('CYBER MASTIFF')      // Expected: true
html.includes('Plasteel Bite')      // Expected: true
html.includes('Go For the Throat')  // Expected: true
html.includes('undefined')          // Expected: false
html.includes('[object Object]')    // Expected: false
```

Then render it into the page to eyeball the styling:

```js
const d = document.createElement('div');
d.innerHTML = html;
document.body.prepend(d);
```

Expected: a readable statblock with the attribute table, abilities, and the bottom stats row. Remove the node afterwards with `d.remove()`.

- [ ] **Step 5: Commit**

```bash
node scripts/test-bonus-resolution.js && node scripts/test-followers.js
git add creator/js/threat-card.js creator/css/styles.css
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Port the threat statblock card into the creator

Copies renderThreatCard and its ten sub-renderers, plus formatWeaponStats, from
bestiary/tabs/threats-tab.js, and drops the Add-to-Encounter header. This is a
parallel copy in the same spirit as references-tab.js and glossary-tab.js; keep
the two in step when either changes."
```

---

### Task 4: Character state

**Files:**
- Modify: `creator/js/state.js`

**Interfaces:**
- Consumes: `Followers.create(threatId)` from Task 1.
- Produces: `character.followers` (array), `State.addFollower(threatId) → object`, `State.removeFollower(id)`, `State.updateFollower(id, patch)`, `State.getFollower(id) → object|undefined`.

- [ ] **Step 1: Add the array to the blank character**

In `creator/js/state.js`, inside `createNewCharacter()`, add `followers: []` immediately after the `mutations: [],` line:

```js
            mutations: [],
            followers: [],
```

`loadCharacter()` does `this.character = { ...newChar, ...data }`, so a save written before this feature gets the empty array automatically. No migration code is needed.

- [ ] **Step 2: Add the mutators**

Add after the `removeMutation(index)` method:

```js
    // ===== Followers =====

    // Add a follower for a threat id. Returns the new entry.
    addFollower(threatId) {
        if (!this.character.followers) this.character.followers = [];
        const follower = Followers.create(threatId);
        this.character.followers.push(follower);
        this.notifyListeners('followers');
        return follower;
    },

    // Remove a follower by its local id
    removeFollower(id) {
        if (!this.character.followers) return;
        const i = this.character.followers.findIndex(f => f.id === id);
        if (i === -1) return;
        this.character.followers.splice(i, 1);
        this.notifyListeners('followers');
    },

    // Get a follower by its local id
    getFollower(id) {
        return (this.character.followers || []).find(f => f.id === id);
    },

    // Merge a partial update into a follower
    updateFollower(id, patch) {
        const follower = this.getFollower(id);
        if (!follower) return;
        Object.assign(follower, patch);
        // A mob cannot have more living members than it started with, and an individual is
        // always a single creature.
        if (follower.kind === 'individual') {
            follower.count = 1;
            follower.livingCount = 1;
        } else {
            follower.count = Math.max(1, Number(follower.count) || 1);
            follower.livingCount = Math.min(Math.max(0, Number(follower.livingCount) || 0), follower.count);
        }
        this.notifyListeners('followers');
    },
```

- [ ] **Step 3: Verify it parses**

```bash
node --check creator/js/state.js
```

Expected: no output, exit code 0.

- [ ] **Step 4: Verify the state operations in the browser**

At `http://127.0.0.1:8137/creator/`:

```js
State.character.followers                       // Expected: []
const f = State.addFollower('cyber_mastiff');
State.character.followers.length                // Expected: 1
State.updateFollower(f.id, { kind: 'mob', count: 8, livingCount: 12 });
State.getFollower(f.id).livingCount             // Expected: 8 — clamped to count
State.updateFollower(f.id, { kind: 'individual' });
State.getFollower(f.id).count                   // Expected: 1 — reset for an individual
State.removeFollower(f.id);
State.character.followers.length                // Expected: 0
```

- [ ] **Step 5: Commit**

```bash
node scripts/test-bonus-resolution.js && node scripts/test-followers.js
git add creator/js/state.js
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Add the followers array and its mutators to character state

loadCharacter spreads a blank character before the loaded data, so saves written
before this feature get the empty array with no migration code. updateFollower
keeps livingCount within the mob size and resets an individual to a single
creature."
```

---

### Task 5: Followers builder section

**Files:**
- Create: `creator/tabs/followers-tab.js`
- Modify: `creator/js/app.js`, `creator/index.html`

**Interfaces:**
- Consumes: `DataLoader.ensureThreatsLoaded()`, `DataLoader.getAllThreats()`, `DataLoader.getThreat(id)` from Task 2; `State.addFollower/removeFollower/updateFollower` from Task 4; `ThreatCard.render(threat)` from Task 3; `Followers.mobAttackBonus(n)` from Task 1.
- Produces: global `FollowersTab` with `init()` and `refresh()`.

- [ ] **Step 1: Register the section in app.js**

Three edits in `creator/js/app.js`.

Line 11, add `'followers'` to the end of `SECTION_ORDER`:

```js
    SECTION_ORDER: ['setting', 'species', 'archetype', 'stats', 'talents', 'wargear', 'powers', 'background', 'injuries', 'ascension', 'followers'],
```

In `App.init()`, add after `InjuriesTab.init();`:

```js
        FollowersTab.init();
```

In `refreshCurrentSection()`, add after the `injuries` case:

```js
            case 'followers':
                FollowersTab.refresh();
                break;
```

- [ ] **Step 2: Add the markup**

In `creator/index.html`, add after the Ascension `sidebar-section` block (search for `data-section="ascension"` and add a sibling `div.sidebar-section` after its closing `</div>`):

```html
                    <div class="sidebar-section">
                        <div class="sidebar-item" data-section="followers">
                            <span class="sidebar-label">10. Followers</span>
                            <span id="sidebar-followers-count" class="sidebar-count"></span>
                        </div>
                    </div>
```

Add after the `<div id="section-ascension" class="builder-section">…</div>` block:

```html
                    <div id="section-followers" class="builder-section">
                        <!-- Rendered by FollowersTab -->
                    </div>
```

Add the three script tags, before `<script src="js/app.js?v=115"></script>`:

```html
    <script src="js/followers.js?v=116"></script>
    <script src="js/threat-card.js?v=116"></script>
    <script src="tabs/followers-tab.js?v=116"></script>
```

`followers.js` and `threat-card.js` must load before `tabs/followers-tab.js` and before `tabs/character-sheet-tab.js`.

- [ ] **Step 3: Bump the cache version**

```bash
sed -i 's/?v=115/?v=116/g' creator/index.html
grep -o '?v=[0-9]*' creator/index.html | sort -u
```

Expected: only `?v=116`. Do **not** touch `creator/js/web-api.js`; no data file changed.

- [ ] **Step 4: Write the tab**

Create `creator/tabs/followers-tab.js`:

```js
// Followers Tab - pick threats from the bestiary dataset as companions or mobs

const FollowersTab = {
    _filters: { search: '', role: 'all', size: 'all', keyword: 'all' },
    _loading: false,

    init() {
        this.render();
    },

    refresh() {
        this.render();
    },

    // The section is the only place that triggers the threat fetch.
    async render() {
        const container = document.getElementById('section-followers');
        if (!container) return;

        if (!DataLoader.areThreatsLoaded()) {
            if (!this._loading) {
                this._loading = true;
                container.innerHTML = '<h2>Followers</h2><p class="section-desc">Loading threat data…</p>';
                await DataLoader.ensureThreatsLoaded();
                this._loading = false;
            } else {
                return;
            }
        }

        const character = State.getCharacter();
        container.innerHTML = `
            <h2>Followers</h2>
            <p class="section-desc">Companions, minions and mobs. Followers cost no XP; the Talents that grant them do. Pick any Threat — the list is not restricted.</p>
            ${this.renderRoster(character)}
            ${this.renderPicker(character)}
        `;
        this.bindEvents();
        this.updateSidebarCount(character);
    },

    updateSidebarCount(character) {
        const el = document.getElementById('sidebar-followers-count');
        if (!el) return;
        const n = (character.followers || []).length;
        el.textContent = n ? `${n} follower${n === 1 ? '' : 's'}` : '';
    },

    renderRoster(character) {
        const followers = character.followers || [];
        if (followers.length === 0) {
            return '<p class="section-desc"><em>No followers yet. Choose a Threat below.</em></p>';
        }
        return `<div class="followers-roster">${followers.map(f => this.renderRosterItem(f, character)).join('')}</div>`;
    },

    renderRosterItem(follower, character) {
        const threat = DataLoader.getThreat(follower.threatId);
        const threatName = threat ? threat.name : follower.threatId;
        const isMob = follower.kind === 'mob';
        const bonus = isMob ? Followers.mobAttackBonus(follower.livingCount) : 0;
        return `
            <div class="follower-item" data-follower-id="${follower.id}">
                <div class="follower-item-header">
                    <input type="text" class="follower-name" value="${this.escapeHtml(follower.name)}"
                           placeholder="${this.escapeHtml(threatName)}" data-field="name">
                    <span class="follower-threat-name">${this.escapeHtml(threatName)}</span>
                    <button class="btn-remove follower-remove" title="Remove follower">&times;</button>
                </div>
                <div class="follower-item-controls">
                    <label><input type="radio" name="kind-${follower.id}" value="individual" data-field="kind" ${!isMob ? 'checked' : ''}> Individual</label>
                    <label><input type="radio" name="kind-${follower.id}" value="mob" data-field="kind" ${isMob ? 'checked' : ''}> Mob</label>
                    ${isMob ? `
                        <label>Members <input type="number" class="follower-count" min="1" value="${follower.count}" data-field="count"></label>
                        <label>Living <input type="number" class="follower-living" min="0" max="${follower.count}" value="${follower.livingCount}" data-field="livingCount"></label>
                        <span class="follower-mob-bonus">Mob attack bonus: +${bonus}</span>
                    ` : ''}
                </div>
                <div class="follower-item-controls">
                    <label title="Attributes and Skills become 1 + Double Rank, and neither can exceed your own. Granted by Devotees (core p132), Companion and Companion (Elite) (apocrypha p234), and Familiar (apocrypha p236). Animal Companion and the Arbites Cyber Mastiff use the printed statblock instead.">
                        <input type="checkbox" data-field="useAlternativeStats" ${follower.useAlternativeStats ? 'checked' : ''}>
                        Alternative stats (1 + Double Rank)
                    </label>
                </div>
                <textarea class="follower-notes" placeholder="Notes" data-field="notes">${this.escapeHtml(follower.notes)}</textarea>
            </div>
        `;
    },

    renderPicker(character) {
        const threats = this.filteredThreats(character);
        const rows = threats.slice(0, 200).map(t => `
            <div class="follower-pick-row">
                <span class="follower-pick-name">${this.escapeHtml(t.name)}</span>
                <span class="follower-pick-meta">${this.roleAtTier(t, character.tier)} &middot; ${this.escapeHtml(t.size || '-')}</span>
                <button class="btn-add follower-add" data-threat-id="${t.id}">Add</button>
            </div>
        `).join('');
        const truncated = threats.length > 200
            ? `<p class="section-desc"><em>Showing the first 200 of ${threats.length} matches. Narrow the search to see more.</em></p>`
            : '';
        return `
            <h3>Add a Follower</h3>
            <div class="follower-filters">
                <input type="text" id="follower-search" placeholder="Search threats…" value="${this.escapeHtml(this._filters.search)}">
                <select id="follower-role">
                    <option value="all">Any role</option>
                    <option value="T">Troop at your Tier</option>
                    <option value="E">Elite at your Tier</option>
                    <option value="A">Adversary at your Tier</option>
                </select>
                <select id="follower-size">
                    <option value="all">Any size</option>
                    ${this.sizeOptions().map(s => `<option value="${s}">${s}</option>`).join('')}
                </select>
            </div>
            ${truncated}
            <div class="follower-pick-list">${rows || '<p class="section-desc"><em>No threats match.</em></p>'}</div>
        `;
    },

    // Role letter for the character's tier, from the threat's tierThreat table.
    roleAtTier(threat, tier) {
        const key = String(tier || 1);
        const letter = threat.tierThreat && threat.tierThreat[key];
        return { T: 'Troop', E: 'Elite', A: 'Adversary' }[letter] || '-';
    },

    sizeOptions() {
        const sizes = new Set();
        for (const t of DataLoader.getAllThreats()) {
            if (t.size) sizes.add(t.size);
        }
        return [...sizes].sort();
    },

    filteredThreats(character) {
        const { search, role, size } = this._filters;
        const needle = search.trim().toLowerCase();
        const tierKey = String(character.tier || 1);
        return DataLoader.getAllThreats().filter(t => {
            if (needle && !t.name.toLowerCase().includes(needle)) return false;
            if (role !== 'all' && (!t.tierThreat || t.tierThreat[tierKey] !== role)) return false;
            if (size !== 'all' && t.size !== size) return false;
            return true;
        });
    },

    bindEvents() {
        const container = document.getElementById('section-followers');
        if (!container) return;

        const search = container.querySelector('#follower-search');
        if (search) {
            search.addEventListener('input', e => {
                this._filters.search = e.target.value;
                this.render();
                const again = document.getElementById('follower-search');
                if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
            });
        }

        const role = container.querySelector('#follower-role');
        if (role) {
            role.value = this._filters.role;
            role.addEventListener('change', e => { this._filters.role = e.target.value; this.render(); });
        }

        const size = container.querySelector('#follower-size');
        if (size) {
            size.value = this._filters.size;
            size.addEventListener('change', e => { this._filters.size = e.target.value; this.render(); });
        }

        container.querySelectorAll('.follower-add').forEach(btn => {
            btn.addEventListener('click', () => {
                State.addFollower(btn.dataset.threatId);
                this.render();
            });
        });

        container.querySelectorAll('.follower-item').forEach(item => {
            const id = item.dataset.followerId;

            item.querySelector('.follower-remove').addEventListener('click', () => {
                State.removeFollower(id);
                this.render();
            });

            item.querySelectorAll('[data-field]').forEach(input => {
                const field = input.dataset.field;
                const evt = (input.type === 'checkbox' || input.type === 'radio' || input.tagName === 'SELECT') ? 'change' : 'input';
                input.addEventListener(evt, e => {
                    let value;
                    if (input.type === 'checkbox') value = e.target.checked;
                    else if (input.type === 'number') value = Number(e.target.value);
                    else value = e.target.value;
                    if (input.type === 'radio' && !e.target.checked) return;
                    State.updateFollower(id, { [field]: value });
                    // Re-render for changes that alter the layout; leave text fields alone so
                    // the caret does not jump.
                    if (field === 'kind' || field === 'count' || field === 'livingCount') this.render();
                    else this.updateSidebarCount(State.getCharacter());
                });
            });
        });
    },

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};
```

- [ ] **Step 5: Verify everything parses**

```bash
node --check creator/js/app.js && node --check creator/tabs/followers-tab.js
```

Expected: no output, exit code 0.

- [ ] **Step 6: Verify in the browser**

At `http://127.0.0.1:8137/creator/`:

1. The sidebar shows "10. Followers" after "9. Ascension".
2. Before opening it: `performance.getEntriesByType('resource').filter(r => r.name.includes('threats.json')).length` is `0`.
3. Click "10. Followers". A brief "Loading threat data…" appears, then the picker.
4. The same check now returns `1`.
5. Search `mastiff`, click Add on CYBER MASTIFF. It appears in the roster.
6. Switch it to Mob, set Members to 8. "Mob attack bonus: +4" appears.
7. Set Living to 12. It clamps to 8 and the bonus stays +4. Set Living to 3; the bonus becomes +1.
8. Switch back to Individual. The member inputs disappear.
9. Leave and re-enter the section. `…includes('threats.json')).length` is still `1`.

- [ ] **Step 7: Commit**

```bash
node scripts/test-bonus-resolution.js && node scripts/test-followers.js
git add creator/tabs/followers-tab.js creator/js/app.js creator/index.html
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Add the Followers builder section

Appended as section 10 so the existing 1-9 numbering does not shift. The picker
is freeform over every threat; the filters narrow the list but never block a
choice. Opening the section is what triggers the threat fetch."
```

---

### Task 6: Character sheet block

**Files:**
- Modify: `creator/tabs/character-sheet-tab.js`, `creator/css/styles.css`

**Interfaces:**
- Consumes: `ThreatCard.render(threat)`, `Followers.mobAttackBonus(n)`, `Followers.THREAT_ATTR_MAP`, `Followers.alternativeStatValue(rank, characterValue)`, `DataLoader.getThreat(id)`, `State.updateFollower(id, patch)`.
- Produces: `CharacterSheetTab.renderFollowers(character) → string`.

- [ ] **Step 1: Add the render call**

In `creator/tabs/character-sheet-tab.js`, inside `render()`, add after `${this.renderHolyRelics(character)}`:

```js
                    ${this.renderFollowers(character)}
```

- [ ] **Step 2: Add the renderer**

Add as a new method, immediately before `renderTrackingBoxes(type, current, max) {`:

```js
    // Render the Followers block. Threats load lazily, so this asks for a re-render once
    // the data arrives rather than blocking the rest of the sheet.
    renderFollowers(character) {
        const followers = character.followers || [];
        if (followers.length === 0) return '';

        if (!DataLoader.areThreatsLoaded()) {
            DataLoader.ensureThreatsLoaded().then(() => this.render());
            return `
                <div class="sheet-section">
                    <h2 class="sheet-section-title">Followers</h2>
                    <p class="sheet-empty">Loading threat data…</p>
                </div>
            `;
        }

        return `
            <div class="sheet-section">
                <h2 class="sheet-section-title">Followers</h2>
                ${followers.map(f => this.renderFollower(f, character)).join('')}
            </div>
        `;
    },

    renderFollower(follower, character) {
        const threat = DataLoader.getThreat(follower.threatId);
        if (!threat) {
            return `<div class="sheet-follower"><p class="sheet-empty">Unknown threat: ${this.escapeHtml(follower.threatId)}</p></div>`;
        }

        const displayName = follower.name || threat.name;
        const isMob = follower.kind === 'mob';
        const maxWounds = Number(threat.wounds) || 0;
        const maxShock = Number(threat.shock) || 0;
        const curWounds = follower.currentWounds === null ? 0 : follower.currentWounds;
        const curShock = follower.currentShock === null ? 0 : follower.currentShock;

        const mobRow = isMob ? `
            <div class="sheet-follower-mob">
                <span>Members: ${follower.livingCount} / ${follower.count}</span>
                <span>Mob attack bonus: +${Followers.mobAttackBonus(follower.livingCount)}</span>
            </div>
        ` : '';

        const statsNote = follower.useAlternativeStats ? `
            <div class="sheet-follower-altstats">
                Alternative stats in use: all Attributes and Skills are
                ${Followers.alternativeStatValue(character.rank, null)},
                capped at your own. Wounds, Shock, Defence and Resilience keep the printed values.
                ${this.renderAlternativeAttributes(character)}
            </div>
        ` : '';

        return `
            <div class="sheet-follower" data-follower-id="${follower.id}">
                <div class="sheet-follower-header">
                    <span class="sheet-follower-name">${this.escapeHtml(displayName)}</span>
                    <span class="sheet-follower-type">${isMob ? 'Mob' : 'Individual'}</span>
                </div>
                ${mobRow}
                ${statsNote}
                <div class="sheet-follower-tracking">
                    <div class="sheet-follower-track">
                        <span class="sheet-follower-track-label">Wounds</span>
                        <span class="sheet-follower-boxes" data-track="wounds">${this.renderFollowerBoxes('wounds', curWounds, maxWounds)}</span>
                    </div>
                    <div class="sheet-follower-track">
                        <span class="sheet-follower-track-label">Shock</span>
                        <span class="sheet-follower-boxes" data-track="shock">${this.renderFollowerBoxes('shock', curShock, maxShock)}</span>
                    </div>
                </div>
                ${follower.notes ? `<p class="sheet-follower-notes">${this.escapeHtml(follower.notes)}</p>` : ''}
                ${ThreatCard.render(threat)}
            </div>
        `;
    },

    // Attribute line for a follower using the alternative stats.
    renderAlternativeAttributes(character) {
        const parts = [];
        for (const [threatKey, charKey] of Object.entries(Followers.THREAT_ATTR_MAP)) {
            const own = DerivedStats.getEffectiveAttribute(character, charKey);
            parts.push(`${threatKey} ${Followers.alternativeStatValue(character.rank, own)}`);
        }
        return `<div class="sheet-follower-altstats-line">${parts.join(' &middot; ')}</div>`;
    },

    renderFollowerBoxes(type, current, max) {
        let boxes = '';
        for (let i = 0; i < max; i++) {
            const filled = i < current ? 'filled' : '';
            boxes += `<span class="tracking-box follower-box ${filled}" data-track-type="${type}" data-index="${i}"></span>`;
        }
        return boxes || '<span class="sheet-empty">-</span>';
    },
```

- [ ] **Step 3: Bind the tracking clicks**

In `render()`, find the call to `this.enhanceWithGlossary(container);` and add immediately after it:

```js
        // Follower wounds and shock trackers
        container.querySelectorAll('.sheet-follower .follower-box').forEach(box => {
            box.addEventListener('click', () => {
                const item = box.closest('.sheet-follower');
                const id = item.dataset.followerId;
                const type = box.dataset.trackType;
                const index = Number(box.dataset.index);
                const follower = State.getFollower(id);
                if (!follower) return;
                const field = type === 'wounds' ? 'currentWounds' : 'currentShock';
                const currentValue = follower[field] === null ? 0 : follower[field];
                // Clicking the last filled box clears it; otherwise fill up to the clicked box.
                const next = (currentValue === index + 1) ? index : index + 1;
                State.updateFollower(id, { [field]: next });
                this.render();
            });
        });
```

- [ ] **Step 4: Add the styles**

Append to `creator/css/styles.css`:

```css
/* ===== Followers ===== */
.followers-roster { display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; }
.follower-item { background: var(--bg-secondary); border-radius: var(--radius-sm); padding: 12px; }
.follower-item-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.follower-item-header .follower-name { flex: 1; }
.follower-threat-name { color: var(--text-secondary); font-size: 13px; }
.follower-item-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 8px; }
.follower-item-controls input[type="number"] { width: 70px; }
.follower-mob-bonus { color: var(--text-secondary); font-size: 13px; }
.follower-notes { width: 100%; min-height: 40px; }
.follower-filters { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
.follower-filters #follower-search { flex: 1; min-width: 180px; }
.follower-pick-list { max-height: 420px; overflow-y: auto; }
.follower-pick-row { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-bottom: 1px solid var(--border-color); }
.follower-pick-name { flex: 1; }
.follower-pick-meta { color: var(--text-secondary); font-size: 12px; }
.sheet-follower { margin-bottom: 16px; }
.sheet-follower-header { display: flex; justify-content: space-between; align-items: baseline; }
.sheet-follower-name { font-weight: 600; }
.sheet-follower-type, .sheet-follower-mob { color: var(--text-secondary); font-size: 12px; }
.sheet-follower-mob { display: flex; gap: 14px; }
.sheet-follower-altstats { font-size: 12px; color: var(--text-secondary); margin: 6px 0; }
.sheet-follower-altstats-line { margin-top: 2px; }
.sheet-follower-tracking { display: flex; gap: 20px; margin: 8px 0; }
.sheet-follower-track-label { font-size: 12px; color: var(--text-secondary); margin-right: 6px; }
.sheet-follower-notes { font-size: 13px; font-style: italic; }
```

- [ ] **Step 5: Verify it parses**

```bash
node --check creator/tabs/character-sheet-tab.js
```

Expected: no output, exit code 0.

- [ ] **Step 6: Verify in the browser**

1. Add a CYBER MASTIFF follower in section 10, then open CHARACTER SHEET.
2. A Followers block appears in the right column below Holy Relics, with the full statblock.
3. Click the third Wounds box. Three boxes fill.
4. Click the third box again. It clears back to two.
5. Reload the page. The auto-save restores the wound state.
6. Turn on "Alternative stats" in section 10, return to the sheet. The note appears with the per-attribute line, capped at your own values.
7. Set the follower to a Mob with 8 members, 5 living. The sheet shows `Members: 5 / 8` and `Mob attack bonus: +2`.

- [ ] **Step 7: Commit**

```bash
node scripts/test-bonus-resolution.js && node scripts/test-followers.js
git add creator/tabs/character-sheet-tab.js creator/css/styles.css
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Show followers on the character sheet

Each follower renders its full statblock with clickable wounds and shock
trackers, and a mob shows its living count and attack bonus. The block asks for
a re-render once the lazily loaded threat data arrives, so it never blocks the
rest of the sheet."
```

---

### Task 7: End-to-end verification and release

**Files:**
- Modify: none, unless a check fails.

**Interfaces:**
- Consumes: everything from Tasks 1 to 6.
- Produces: a deployed feature and a comment on issue #21.

- [ ] **Step 1: Run the full test suite**

```bash
node scripts/test-bonus-resolution.js && node scripts/test-followers.js
for f in creator/js/*.js creator/tabs/*.js; do node --check "$f" || echo "FAIL $f"; done
for f in data/*.json; do python3 -m json.tool "$f" > /dev/null || echo "FAIL $f"; done
```

Expected: all pass, and no `FAIL` lines.

- [ ] **Step 2: Verify no data file changed**

```bash
git diff --stat main -- data/
```

Expected: empty. This feature only reads `threats.json`.

- [ ] **Step 3: Save and load round-trip**

1. Build a character with two followers: one individual with damage recorded, one mob with a reduced living count.
2. Save to file with the Save button.
3. Click New, confirm the followers are gone.
4. Load the saved file. Both followers return, with their names, kinds, counts, living counts, stats toggles, notes, and wound and shock state.

- [ ] **Step 4: Verify backwards compatibility**

Load a character file saved before this feature — any file in the repo's history, or hand-edit a saved file to delete its `followers` key.

Expected: it loads without error, `State.character.followers` is `[]`, and the character sheet shows no Followers block.

- [ ] **Step 5: Confirm the startup payload is unchanged**

Open the creator in a fresh tab and run:

```js
performance.getEntriesByType('resource')
    .filter(r => r.name.includes('.json'))
    .map(r => r.name.split('/').pop())
```

Expected: the same 13 data files as before this feature. `threats.json` and `threat-weapons.json` are absent until the Followers section is opened or a character with followers loads.

- [ ] **Step 6: Push and confirm the deploy**

```bash
WSLENV=GH_TOKEN/u git push origin main 2>&1 | sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'
gh run list --limit 1
```

Wait for `completed success`, then confirm the live site:

```bash
curl -s https://quadrakev.github.io/QK-Wrath-and-Glory/creator/index.html | grep -o '?v=[0-9]*' | sort -u
```

Expected: `?v=116`.

- [ ] **Step 7: Comment on issue #21**

Write the comment to a file and post it. Do not close the issue; the reporter confirms first.

```bash
gh issue comment 21 --body-file /tmp/issue21-comment.md
```

The comment must state: what shipped, that the picker is freeform over all 844 threats, that the alternative-stats toggle is the player's call with the rule quoted in its tooltip, that mobs show the attack bonus, and that startup speed is unchanged because threat data loads on demand.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
| --- | --- |
| Data model, `followers: []` | 4 |
| The alternative-stats toggle | 5 (control), 6 (display) |
| Lazy loading | 2 |
| New builder section | 5 |
| The picker | 5 |
| Statblock card | 3 |
| Computed rules | 1 |
| Character sheet | 6 |
| Testing, Node cases | 1 |
| Testing, browser cases | 2, 5, 6, 7 |
| Out of scope, no bestiary change | Global Constraints, verified in Task 7 Step 2 |

**Type consistency checked:** `Followers.create/mobAttackBonus/alternativeStatValue/THREAT_ATTR_MAP` are used in Tasks 4, 5, and 6 exactly as defined in Task 1. `DataLoader.ensureThreatsLoaded/areThreatsLoaded/getThreat/getAllThreats/getThreatWeapon/formatSourcePage` are defined in Task 2 and used in Tasks 3, 5, and 6. `ThreatCard.render` is defined in Task 3 and used in Task 6. `State.addFollower/removeFollower/updateFollower/getFollower` are defined in Task 4 and used in Tasks 5 and 6.

**Known follow-ups, deliberately not in this plan:**

- `creator/js/threat-card.js` is a third parallel copy beside `references-tab.js` and `glossary-tab.js`. Unifying them into `shared/` is out of scope per the spec.
- The picker caps the rendered list at 200 rows for responsiveness. The count of matches is shown so the truncation is never silent.
