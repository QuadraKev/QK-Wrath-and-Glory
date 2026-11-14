# Character Sheet Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The creator's Character Sheet shows its blocks in seven tabs (Character, Stats, Abilities, Wargear, Psychic Powers, Followers, Notes) under a pinned strip with the character identity and the Wounds, Shock and Wrath trackers, and print and Copy Summary still give the whole sheet (issue #25).

**Architecture:** `CharacterSheetTab.render()` keeps one full `innerHTML` write into `#character-sheet-content`: a `.sheet-strip` (identity + `.sheet-strip-bar` with the trackers and the tab bar) and a `.sheet-panes` with one `.sheet-pane` per visible tab, built by `renderPane(tabId, ctx)` from the unchanged block render functions. A tab switch only toggles attributes (`selectSheetTab`); a re-render keeps the view through `_captureViewState` / `_restoreViewState` with `_focusKeyOf`. Pinning, the two layout modes and print are CSS only; the jump-to-section code goes.

**Tech Stack:** Vanilla JS (global-object modules, no build step), static HTML/CSS, Node `vm`-sandbox test scripts.

**Spec:** `docs/superpowers/specs/2026-11-13-sheet-tabs-design.md` (approved 2026-11-13; §12 holds the owner's decisions and is not reopened). Line numbers in the spec and in this plan are hints only: they are from branch `custom-wargear` at `1ac43fb`, whose final review can still move lines in `creator/tabs/character-sheet-tab.js`. Before it merges, that branch gets a small fix wave (the sheet's Salvo line shows only for a salvo above 0; three talent-choice and upgrade sites get an escape; `creator/index.html` stays at 35 tags at `?v=124`); none of it changes a function that this plan restructures. Find every site by the function, class or selector that the step names.

## Global Constraints

- Branch `sheet-tabs`, cut from `main` after Custom Wargear (#33) merges. Tasks in order, each gated by a review before the next starts. One commit per task (more is fine), no push.
- Commit: `git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "<short plain sentence> (#25)"`. No attribution or co-author lines.
- Vanilla JS in the existing `const CharacterSheetTab = {…}` object; no `import`/`export`, classes or IIFEs; no new file except the test; no new dependency; no build step (`STYLE_GUIDE.md`). New members go next to their kin: state properties at the top, render methods with the renderers, handlers with the binders.
- CSS: `STYLE_GUIDE.md` variables only (no raw colour), Jost stays the font. All new rules go in ONE new section at the end of `creator/css/styles.css`: `/* ===== Character Sheet Tabs (issue #25) ===== */`. Screen-only rules for pinning and the two modes are wrapped in `@media screen …` so that print never sees them.
- Naming rule: every new CSS class and DOM id starts with `sheet-` and continues with one of `strip`, `tab`, `pane`, `details` (`sheet-strip`, `sheet-strip-bar`, `sheet-strip-trackers`, `sheet-strip-label`, `sheet-strip-wrath`, `sheet-tabbar`, `sheet-tab-btn`, `sheet-tab-<id>`, `sheet-panes`, `sheet-pane`, `sheet-pane-<id>`, `sheet-pane-columns`, `sheet-pane-column`, `sheet-details-section`). New data attribute: `data-sheet-tab`. Exceptions, all existing names reused as they are: `sheet-section`, `sheet-section-title`, `sheet-header-section`, `sheet-background-content`, `sheet-background-item`, `sheet-columns`, `sheet-column`, `tracking-boxes`, `tracking-box`, `filled`, `tracker-label`, `tracker-controls`, `tracker-btn`, `tracker-minus`, `tracker-plus`, `tracker-value`, `active`, and the `.sheet-mutation-*` classes.
- Text safety: every HTML site that this plan adds or moves and that prints character or item text (name, species and sub-option names, archetype and custom-archetype names, ascension archetype names, keywords) wraps it in the sheet's five-character `this.escapeHtml(...)`, in text and attribute contexts. Do not change `escapeHtml`.
- Existing tests: `scripts/test-sheet-attributes.js` and `scripts/test-custom-wargear.js` are not edited and must pass after every task. They call `renderAttributes`, `renderWeapons`, `renderArmor`, `renderAugmetics`, `renderEquipment`, `renderTalents`, `copySummary` and helpers; this plan keeps every one of those names, signatures and outputs. This plan changes the output of only `renderHeader` (escaping, Task 1), `renderInjuriesCorruption` (no mutations, Task 1), `renderTraits` (no Wounds, Shock, Wrath, Task 2), `renderNotes` (comment only, Task 5) and `render()`; neither existing test calls these. No block render function is renamed or split except the mutation part of `renderInjuriesCorruption` (spec §3.2). Copy Summary (`copySummary`) does not change.
- Tests are plain Node scripts: `node scripts/test-<name>.js`, a `vm` sandbox with hand-written stubs, `check(name, actual, expected)`, exit code 1 on any failure. Write the test first, run it and see it fail, then implement. A check must fail when the behaviour it names is removed; a check never compares one run of the code with another run of the same code as its only proof. A stub that a test puts on a sandbox member or global is restored in a `finally` block.
- All new checks go in ONE file, `scripts/test-sheet-tabs.js`. Each task's checks sit in their own `{ … }` block headed `// --- Task N: <title> ---`; only the shared helpers below are at file scope. Shared helpers, defined once at the top of the file by Task 1 (one line each):
  - `ROOT`, `readJson(rel)`, `readSource(rel)` — repo root and file readers.
  - `check(name, actual, expected)` — compares `JSON.stringify` of both, prints PASS/FAIL, counts failures; the file ends with the summary line and `process.exit(failures ? 1 : 0)`.
  - `INJURIES` — parsed `data/injuries-corruption.json`.
  - `EVIL = '<b>"x\'</b>&'`, `SAFE = '&lt;b&gt;&quot;x&#39;&lt;/b&gt;&amp;'`, `SAFE_UPPER = '&lt;B&gt;&quot;X&#39;&lt;/B&gt;&amp;'`, `RAW_TAG = /<\/?b>/i`.
  - `DERIVED` — `{ maxWounds: 11, maxShock: 8, defence: 3, resilience: 6, determination: 3, speed: 6, conviction: 3, resolve: 2, passiveAwareness: 2, influence: 1 }`.
  - `makeCharacter(over) -> object` — `{ name: 'Kaelen', tier: 1, rank: 1, species: { id: 'human' }, archetype: { id: 'warrior' }, attributes: (all seven at 3), skills: {}, wargear: [], talents: [], mutations: [], ascensions: [], followers: [], notes: '', ...over }`.
  - `makeState(character) -> object` — a `State` stub whose getters read its own fields (`character`, `keywords: []`, `tier: 1`, `psyker: false`, `wounds: 0`, `shock: 0`, `wrath: 2`, `wealth: 0`, `faith: 0`, `maxFaith: 0`): `getCharacter`, `getKeywords`, `getEffectiveTier`, `isPsyker`, `getCurrentWounds`, `getCurrentShock`, `getCurrentWrath`, `getCurrentWealth`, `getCurrentFaith`, `getMaxFaith`; every setter/modifier (`setCurrentWounds`, `setCurrentShock`, `modifyCurrentWrath`, `modifyCurrentWealth`, `modifyCurrentFaith`, `setNotes`, `toggleWeaponEquipped`, `updateFollower`) pushes `[name, ...args]` to its `calls` array; `getFollower` returns null.
  - `makeDataLoader() -> object` — `getSpecies`/`getArchetype` → null, `getInjuriesCorruptionData` → `INJURIES`, `getBackgrounds` → null, `getAscensionPackages` → `[]`, `areThreatsLoaded` → true, `ensureThreatsLoaded` → `Promise.resolve()`. Tests replace members per check.
  - `stubEl({ cls = [], data = {}, attrs = {}, parent = null, rect = null, display = 'block' }) -> el` — a DOM element stub: `classList` (`contains`, `add`, `remove`, `toggle(c, force)`), `dataset`, `getAttribute`/`setAttribute`/`removeAttribute`/`hasAttribute`/`toggleAttribute(name, force)`, a `hidden` property and a `tabIndex` property mapped to the `hidden` and `tabindex` attributes, `disabled` (false), `closest(sel)` (itself when `sel` is `.<one of its classes>`, else `parent.closest(sel)`, else null), `addEventListener(type, fn)` into `el.listeners[type]`, `focus(opts)` pushing `opts` to `el.focusCalls`, `getBoundingClientRect()` → `rect`, numbers `scrollLeft`, `offsetLeft`, `offsetWidth`, `clientWidth` (0), and `_display` read by the `window.getComputedStyle` stub.
  - `makeDom() -> { document, window, MutationObserver, container, scroller, body }` — `scroller` (`stubEl()` plus a numeric `scrollTop`, 0) and `body` (`stubEl()`) are `stubEl`s, so that `classList.contains` and `_focusKeyOf(body)` work on them; `container` is a `stubEl` with an `innerHTML` accessor whose setter stores the string, sets `scroller.scrollTop = 0` and `document.activeElement = body` (what a browser does on a rewrite), `query(sel)` (default `() => []`, tests replace it), `querySelectorAll(sel)` → `query(sel)`, `querySelector(sel)` → `query(sel)[0] || null`, `contains(el)` → `!!el && el !== body`. `document.getElementById` maps `character-sheet-content` → `container`, `tab-character-sheet` → `scroller`, `btn-print` and `btn-copy-summary` → new `stubEl`s, else null; `document.activeElement` starts as `body`; `document.querySelector` → null; `document.addEventListener` no-op. `window.getComputedStyle(el)` → `{ display: el._display }`. `MutationObserver` is a no-op constructor with `observe()`.
  - `sheetSandbox({ character, dom } = {}) -> env` — new `vm` context with `console`, `State` (`makeState(character || makeCharacter())`), `DataLoader` (`makeDataLoader()`), a `DerivedStats` stub (`getArmorBreakdown`/`getResilienceBreakdown`/`getDefenceBreakdown` → null, `getAllDerivedStats` → `env.derived`), `document`, `window`, `MutationObserver` from `dom || makeDom()`, then the real `creator/tabs/character-sheet-tab.js`. Returns `env = { ctx, sheet, state, dataLoader, dom, derived }` with `derived` a fresh copy of `DERIVED`; `sheet = vm.runInContext(readSource('creator/tabs/character-sheet-tab.js') + '\n;CharacterSheetTab;', ctx)` (a top-level `const` does not attach to the `vm` global; same pattern as `scripts/test-sheet-attributes.js`). `State`, `DataLoader` and `DerivedStats` are plain sandbox globals, so a test can replace them with `ctx.X = …`.
  - `BLOCK_TITLES` — `{ renderDetails: 'Details', renderAscensions: 'Ascension', renderInjuriesCorruption: 'Injuries & Corruption', renderBackground: 'Background', renderAttributes: 'Attributes', renderTraits: 'Traits', renderSkills: 'Skills', renderSpeciesAbilities: 'Species Abilities', renderArchetypeAbilities: 'Archetype Abilities', renderTalents: 'Talents', renderMutations: 'Mutations', renderWeapons: 'Weapons', renderArmor: 'Armor', renderAugmetics: 'Augmetics', renderEquipment: 'Equipment', renderHolyRelics: 'Holy Relics', renderPsychicPowers: 'Psychic Powers', renderFollowers: 'Followers', renderNotes: 'Notes' }`.
  - `stubBlocks(sheet) -> restore()` — replaces each `BLOCK_TITLES` function on `sheet` with one that returns `<div class="sheet-section"><h2 class="sheet-section-title">TITLE</h2></div>`; `restore()` puts the originals back (call it in `finally`).
  - `titlesIn(html) -> string[]` — the texts of every `sheet-section-title` element, in order.
  - `count(html, re) -> number` — number of matches of the global regex `re`.
  - `tagOf(html, needle) -> string` — the opening tag (from the `<` before `needle` to the next `>`) that contains `needle`, or `''`.
  - `mediaBlocks(css, query) -> string[]` — the bodies of every `@media <query> {…}` block in `css` whose query text equals `query` after trimming (brace-matched).
  - `tabsSection() -> string` — the text of `creator/css/styles.css` from `/* ===== Character Sheet Tabs (issue #25) ===== */` to the end of the file (`''` when the header is missing).
- Every task ends green: `for f in scripts/test-*.js; do node "$f" > /dev/null || echo "FAIL $f"; done` prints nothing, and the app loads with no console error (Browser procedure below).
- Browser procedure (every browser step uses it; never port 8137 for anything else):
  1. `ss -ltn | grep -c ':8137 '` must print `0`. If not, re-check every 30 s for up to 10 minutes; if the port is still taken, stop and report it instead of continuing.
  2. Start `python3 -m http.server 8137 --directory <worktree root>` in the background and note its PID.
  3. In the Playwright browser, disable the cache for the page before the first navigation (`browser_run_code_unsafe`: `const s = await page.context().newCDPSession(page); await s.send('Network.setCacheDisabled', { cacheDisabled: true });`). Every browser step before Task 8 runs with the browser cache disabled for the page: old copies of the scripts at the same `?v=` can be in the shared browser.
  4. Open `http://localhost:8137/creator/`. Accept the `beforeunload` dialog when it appears. Before any reload, give the character a name and a species (the autosave skips a character with no name, no species and no archetype).
  5. Read `browser_console_messages` (errors) after each numbered check. Expected: none.
  6. When the step ends, kill the server PID at once and confirm `ss -ltn | grep -c ':8137 '` prints `0`.
- Cache busting: no task before Task 8 changes any `?v=`. Task 8 reads the current value from `creator/index.html` (expected `35 ?v=124`) and sets all 35 tags to that value + 1 together (expected `?v=125`). `creator/js/web-api.js`, `bestiary/`, `data/` and `shared/` do not change (check: `git diff --stat $(git merge-base main HEAD) -- creator/js/web-api.js bestiary data shared` prints nothing).
- Touch only what a task needs; no cleanups of adjacent code. Task 5 removes exactly the members, CSS blocks and print rule of spec §8, nothing else.
- Anti-goals (spec §1): no selected tab in the URL hash or `localStorage`; no second live copy of the Wounds, Shock or Wrath controls; no re-render on a tab switch or a notes keystroke; inactive panes stay in the DOM with `hidden`.
- Spec gaps settled by this plan (do not reopen): (a) `renderHeader` printed species, archetype (a custom archetype name is player text) and keywords raw; the strip escapes them (Task 1). (b) A printed page can be 768 CSS px wide or less, so an unqualified compact media query would apply in print; pinning and both modes are `screen`-only and print forces the strip static (Tasks 4, 7). (c) JS learns the mode from the computed `display: contents` of `.sheet-strip` (`_pinnedElement`), not from a second copy of the media query. (d) The tab-bar keys go through a pure `_nextSheetTabId` so that Node can test them. (e) `ctx` shape and the helpers `getArchetypeDisplayName`, `renderStrip`, `renderStripTrackers`, `renderTabBar`, `_scrollActiveTabIntoBar`, `_FOCUS_SELECTOR` are the plan's names (spec §11 leaves them open). (f) The selected tab is scrolled into the bar by setting `scrollLeft`, never `scrollIntoView`. (g) The print `.sheet-body` rule, listed in both spec §7 and §8, is removed once, in Task 5. (h) The Details rows use the existing `.sheet-background-item` form, so they need no new CSS.

## Review Focus

- A derived max Wounds or max Shock of 0 (a malformed save or odd data; a new character in the app has 3 Wounds and 2 Shock): the strip shows the Wounds and Shock labels with no boxes and no error, and Wrath still works. Pinned by Task 2 (zero-max strip check) only.
- Player-typed text in the strip and the Details block (a character name, a custom archetype name, a keyword of a custom archetype) holding `<`, `"`, `'` or `&`: it shows as typed and never as markup. Pinned by Task 1 escape checks on `renderHeader` and `renderDetails`.
- The selected tab disappears under the player: the PSYKER keyword goes, the last follower is removed, or a character without powers is loaded while Psychic Powers is selected. The sheet falls back to Stats with exactly one selected tab and one shown pane. Pinned by Task 3 fallback checks and Task 8 step 3.
- Printing from a phone or a narrow window (the printed page is 768 CSS px wide or less): the strip prints static and in full, every pane prints, and no sticky or `display: contents` rule applies. Pinned by Task 4 (all pinning and mode rules inside `@media screen`) and Task 7 print checks.
- Keys typed in the Notes textarea (ArrowLeft, ArrowRight, Home, End): the tab-bar `keydown` listener sits on `#character-sheet-content`, which holds the textarea, so a handler that does not return for a target outside `.sheet-tab-btn` would switch tabs and block the caret. Expected: the caret moves, no tab changes, no `preventDefault`. Pinned by the Task 3 textarea check and Task 8 step 8.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `creator/tabs/character-sheet-tab.js` | modify | Details block and display-name helpers, Mutations block (Task 1); `SHEET_TABS`, visibility, `renderPane`, strip markup, Traits without trackers, new `render()` structure (Task 2); tab bar, selection, keyboard (Task 3); TOC removal (Task 5); view capture/restore and focus keys (Task 6) |
| `creator/css/styles.css` | modify | TOC and `.sheet-body` removal (Task 5); new section "Character Sheet Tabs (issue #25)": strip, two modes, boxes, tab pills, panes, focus (Task 4); print (Task 7) |
| `creator/index.html` | modify | all 35 `?v=` + 1 (Task 8) |
| `scripts/test-sheet-tabs.js` | create | spec §10.1 cases 1–10 plus the plan's extra checks, one block per task |

---

### Task 1: Details block, display-name helpers, Mutations block

**Model:** sonnet

**Files:**
- Create: `scripts/test-sheet-tabs.js` (the shared helpers of Global Constraints, then the Task 1 block)
- Modify: `creator/tabs/character-sheet-tab.js` — `renderHeader` (about line 429), `renderInjuriesCorruption` (about 1778), new methods next to them, one line in `render()`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - All shared test helpers of Global Constraints, at file scope.
  - `getSpeciesDisplayName(character, species) -> string` — raw text: `species?.name || '-'`, plus ` (<names>)` of the selected non-`countByTier` sub-options, exactly the logic now inside `renderHeader`.
  - `getArchetypeDisplayName(character, archetype) -> string` — raw text: `character.customArchetype?.name || 'Custom Archetype'` when `character.archetype?.id === 'custom'`, else `archetype?.name || '-'`.
  - `renderHeader(character, species, archetype, keywords) -> string` — same markup and classes as today, with the name, the species display name, the archetype display name and each keyword escaped.
  - `renderDetails(character, species, archetype) -> string` — `<div class="sheet-section sheet-details-section">` with `<h2 class="sheet-section-title">Details</h2>` and a `.sheet-background-content` of five `<p class="sheet-background-item"><strong>Label:</strong> value</p>` rows: Name, Species, Archetype, Tier, Rank (spec §3.1).
  - `renderMutations(character) -> string` — `''` when `DataLoader.getInjuriesCorruptionData()` is null or `character.mutations` is empty; else a `.sheet-section` with `<h2 class="sheet-section-title">Mutations</h2>` and the existing `.sheet-mutation-item` markup.
  - `renderInjuriesCorruption(character)` no longer renders mutations and returns `''` when it has no memorable injury, no traumatic injury and `corruption === 0`.

- [ ] **Step 1: Write the helpers and the failing Task 1 block**

Write the shared helpers exactly as listed in Global Constraints. Task 1 block (each in a fresh `sheetSandbox`):

```js
// Details
env.state.tier = 3;
env.dataLoader.getArchetype = id => ({ warrior: { name: 'Warrior' }, veteran: { name: 'Veteran' } })[id] || null;
const ch = makeCharacter({ rank: 2, ascensions: [
    { type: 'archetype', archetypeId: 'veteran', targetTier: 3 },
    { type: 'package', packageId: 'x', targetTier: 4 },
    { type: 'archetype', archetypeId: 'missing', targetTier: 5 }] });
const html = sheet.renderDetails(ch, { name: 'Human' }, { name: 'Warrior' });
check('Details has the title', titlesIn(html), ['Details']);
check('Details carries the print-hide class', html.includes('sheet-details-section'), true);
check('Details rows', ['<strong>Name:</strong> Kaelen', '<strong>Species:</strong> Human', '<strong>Archetype:</strong> Warrior → Veteran (Tier 3)', '<strong>Tier:</strong> 3', '<strong>Rank:</strong> 2'].map(s => html.replace(/\s+/g, ' ').includes(s)), [true, true, true, true, true]);
check('Details skips an unresolved ascension archetype', html.includes('Tier 5'), false);
const plain = sheet.renderDetails(makeCharacter({ name: '', rank: undefined }), null, null).replace(/\s+/g, ' ');
check('Details defaults', [plain.includes('<strong>Name:</strong> Unnamed Character'), plain.includes('<strong>Rank:</strong> 1'), plain.includes('<strong>Species:</strong> -')], [true, true, true]);
// Escape: name, species, custom archetype name are EVIL
const evil = makeCharacter({ name: EVIL, archetype: { id: 'custom' }, customArchetype: { name: EVIL } });
const dHtml = sheet.renderDetails(evil, { name: EVIL }, null);
check('Details escapes name, species and custom archetype', dHtml.split(SAFE).length - 1, 3);
check('Details holds no raw <b>', RAW_TAG.test(dHtml), false);
// Strip identity
env.state.keywords = [EVIL.toUpperCase()];
const hHtml = sheet.renderHeader(evil, { name: EVIL }, null, env.state.keywords);
check('renderHeader escapes name, species and archetype', hHtml.split(SAFE).length - 1, 3);
check('renderHeader escapes keywords', hHtml.includes(SAFE_UPPER), true);
check('renderHeader holds no raw <b>', RAW_TAG.test(hHtml), false);
check('renderHeader keeps its classes', ['sheet-section sheet-header-section', 'sheet-character-name', 'sheet-subtitle', 'sheet-keywords', 'sheet-keyword'].every(c => hHtml.includes(c)), true);
```

Also: `getSpeciesDisplayName` with a species `{ name: 'Adeptus Astartes', subOptions: [{ type: 'chapter', options: [{ id: 'ultra', name: 'Ultramarines' }] }, { type: 'x', countByTier: true, options: [{ id: 'y', name: 'Skip' }] }] }` and `character.species.subOptions = [{ type: 'chapter', optionId: 'ultra' }, { type: 'x', optionId: 'y' }]` gives `'Adeptus Astartes (Ultramarines)'`; with species null gives `'-'`. `getArchetypeDisplayName` gives `'Custom Archetype'` for a custom archetype with an empty name, and `'-'` for a null archetype. Mutations split (spec §10.1 case 6), real `INJURIES`: a character with only `mutations: [{ id: 'withered' }]` gives `''` from `renderInjuriesCorruption` and `titlesIn(renderMutations(...))` equal to `['Mutations']` with `sheet-mutation-name` and `Withered` in it; a character with `corruption: 3` and that mutation gives an Injuries block that holds no `sheet-mutation-item` and no `>Mutations<`; `renderMutations` gives `''` for `mutations: []` and when `getInjuriesCorruptionData` returns null.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/test-sheet-tabs.js`
Expected: exit 1 — `sheet.renderDetails is not a function` (comment out the Details lines once to see the `renderHeader` escape checks FAIL too: today it prints species, archetype and keywords raw).

- [ ] **Step 3: Implement**

Move the species and archetype logic out of `renderHeader` into the two helpers and call them from `renderHeader` and `renderDetails`. Escape at the output sites only. In `renderInjuriesCorruption`, cut the `// Mutations` part into `renderMutations` (the `<h3>` becomes the `<h2 class="sheet-section-title">Mutations</h2>`; item markup unchanged) and drop `mutations` from the hide test. In `render()`, add `${this.renderMutations(character)}` directly after `${this.renderInjuriesCorruption(character)}` so that the mutations stay on the sheet until Task 2 rebuilds `render()`. `renderDetails` is not placed yet.

- [ ] **Step 4: Run all tests**

Run: `for f in scripts/test-*.js; do node "$f" > /dev/null || echo "FAIL $f"; done`
Expected: no output.

- [ ] **Step 5: Browser smoke**

Browser procedure. Character with a name, a species and a mutation (Injuries tab of the builder). Expected: the sheet shows a "Mutations" block after "Injuries & Corruption" and no Mutations subsection inside it; the header looks as before; no console error.

- [ ] **Step 6: Commit**

```bash
git add scripts/test-sheet-tabs.js creator/tabs/character-sheet-tab.js
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Add the Details block and a separate Mutations block to the sheet (#25)"
```

---

### Task 2: Pane structure and the strip

**Model:** opus — the render split: `ctx`, `renderPane` composition with the wide-screen wrappers, and the strip markup that the CSS modes of Task 4 depend on.

**Files:**
- Modify: `creator/tabs/character-sheet-tab.js` — `render()`, `renderTraits`, new members
- Test: `scripts/test-sheet-tabs.js` (Task 2 block)

**Interfaces:**
- Consumes: Task 1 `renderDetails`, `renderMutations`, `renderHeader`; shared helpers `sheetSandbox`, `makeCharacter`, `makeDom`, `stubEl`, `stubBlocks`, `BLOCK_TITLES`, `titlesIn`, `count`, `tagOf`, `DERIVED`.
- Produces:
  - `SHEET_TABS` — `[{ id: 'character', label: 'Character' }, { id: 'stats', label: 'Stats' }, { id: 'abilities', label: 'Abilities' }, { id: 'wargear', label: 'Wargear' }, { id: 'powers', label: 'Psychic Powers' }, { id: 'companions', label: 'Followers' }, { id: 'notes', label: 'Notes' }]`.
  - `getVisibleSheetTabs(character) -> string[]` — ids in `SHEET_TABS` order; `powers` only when `State.isPsyker()`; `companions` only when `(character.followers || []).length > 0`.
  - `ctx` shape: `{ character, species, archetype, keywords, derivedStats, breakdowns: { resilience, defence } }`, built once in `render()`.
  - `renderPane(tabId, ctx) -> string` — the inner HTML of one pane (blocks and wrappers, not the `.sheet-pane` div); `''` for an unknown id.
  - `renderStrip(ctx, visibleIds) -> string` — `<div class="sheet-strip">` + `renderHeader(...)` + `<div class="sheet-strip-bar">` + `renderStripTrackers(ctx.derivedStats)` + a tab-bar slot (empty in this task; Task 3 fills it with `renderTabBar(visibleIds)`) + closing tags.
  - `renderStripTrackers(stats) -> string` — `<div class="sheet-strip-trackers">` with these children in this order, flat (the Task 4 grid relies on it): `<span class="sheet-strip-label tracker-label">Wounds</span>`, `<div class="tracking-boxes">` of `renderTrackingBoxes('wounds', State.getCurrentWounds(), stats.maxWounds)`, `<span class="sheet-strip-label tracker-label">Shock</span>`, `<div class="tracking-boxes">` of the Shock boxes, `<div class="sheet-strip-wrath">` with `<span class="tracker-label">Wrath</span>` and the existing `.tracker-controls` markup whose buttons gain `type="button"` and `aria-label="Remove Wrath"` / `aria-label="Add Wrath"`. The labels carry `tracker-label` too, so that they keep its colour and its light-theme print colour; Task 4 gives `.sheet-strip-label` no `color`. The Wrath buttons never get `disabled` (spec §4.2).
  - `render()` writes `renderStrip(ctx, visible)` + `<div class="sheet-panes">` + one `<div class="sheet-pane" id="sheet-pane-<id>">renderPane(id, ctx)</div>` per visible id + `</div>`; no `hidden`, no role yet (all panes show until Task 3). The bind calls and the two TOC calls stay.
  - `renderTraits(stats, breakdowns)` keeps the trait grid and `.sheet-tracking-section` with the Faith (when `State.getMaxFaith() > 0`) and Wealth counters only.

- [ ] **Step 1: Write the failing Task 2 block**

Per pane, with `stubBlocks` (restored in `finally`) and a `ctx` built in the block from `makeCharacter()`, `DERIVED` and nulls:

```js
const PANE_TITLES = {
    character: ['Details', 'Ascension', 'Injuries & Corruption', 'Background'],
    stats: ['Attributes', 'Traits', 'Skills'],
    abilities: ['Species Abilities', 'Archetype Abilities', 'Talents', 'Mutations'],
    wargear: ['Weapons', 'Armor', 'Augmetics', 'Equipment', 'Holy Relics'],
    powers: ['Psychic Powers'], companions: ['Followers'], notes: ['Notes'] };
check('SHEET_TABS is the §3 table', sheet.SHEET_TABS, [ /* the seven { id, label } of Produces */ ]);
for (const [id, titles] of Object.entries(PANE_TITLES))
    check(`renderPane(${id}) gives its blocks in order`, titlesIn(sheet.renderPane(id, ctx)), titles);
```

Wrapper checks: for `character`, `abilities`, `wargear` the pane holds one `sheet-pane-columns` and two `class="sheet-pane-column"`; the left column (text before the second `sheet-pane-column`) holds the first titles and the right column the rest — Character: Details, Ascension | Injuries & Corruption, Background; Abilities: Species Abilities, Archetype Abilities | Talents, Mutations; Wargear: Weapons comes before `sheet-pane-columns`, then Armor, Augmetics | Equipment, Holy Relics. `stats` holds `sheet-columns` with Attributes and Traits in the first `sheet-column` and Skills in the second; `powers`, `companions`, `notes` hold no `sheet-pane-column`. An empty column still renders: with `renderAscensions` and `renderDetails` returning `''`, the character pane still has two `class="sheet-pane-column"`.

Visibility (spec §10.1 case 2): `getVisibleSheetTabs` gives `['character','stats','abilities','wargear','notes']`; with `env.state.psyker = true` it adds `powers` before `companions`/`notes`; with one follower it adds `companions` before `notes`, also when `dataLoader.areThreatsLoaded = () => false`.

Render: with `stubBlocks` and `env.state.psyker = true`, `render()` writes `dom.container.innerHTML`; its pane ids in order (`/id="sheet-pane-([a-z]+)"/g`) are the six visible ids; `titlesIn` over the whole HTML is the concatenation of `PANE_TITLES` for those ids; the HTML has `class="sheet-strip"` before `class="sheet-panes"` and no `sheet-body`.

Strip (spec §10.1 case 4), real `renderHeader`/`renderStripTrackers`, `env.state.wounds = 3`, `env.state.shock = 1`, `env.state.wrath = 4`, keywords `['IMPERIUM', 'ASTRA MILITARUM']`, `DERIVED` (11 / 8), on the `render()` HTML with `stubBlocks`:

```js
check('11 Wounds boxes', count(html, /data-type="wounds" data-index=/g), 11);
check('3 filled Wounds boxes', count(html, /tracking-box filled" data-type="wounds"/g), 3);
check('8 Shock boxes, 1 filled', [count(html, /data-type="shock" data-index=/g), count(html, /tracking-box filled" data-type="shock"/g)], [8, 1]);
check('one Wrath pair with labels', [count(html, /data-type="wrath"/g), html.includes('aria-label="Remove Wrath"'), html.includes('aria-label="Add Wrath"')], [2, true, true]);
check('Wrath value 4 in the strip', /sheet-strip-wrath[\s\S]*?tracker-value">4</.test(html), true);
check('identity outside the bar, trackers inside', [html.indexOf('sheet-character-name') < html.indexOf('sheet-strip-bar'), html.indexOf('sheet-strip-bar') < html.indexOf('data-type="wounds"'), html.lastIndexOf('data-type="wrath"') < html.indexOf('class="sheet-panes"')], [true, true, true]);
check('one chip per keyword', count(html, /class="sheet-keyword"/g), 2);
check('subtitle has Tier and Rank', [/sheet-subtitle[\s\S]*?Tier 1[\s\S]*?Rank 1/.test(html)], [true]);
check('Wrath buttons are never disabled', /data-type="wrath"[^>]*disabled|disabled[^>]*data-type="wrath"/.test(html), false);
```

Traits (real `renderTraits(DERIVED, {})`): no `tracking-box`, no `data-type="wrath"`, has `data-type="wealth"`, no `data-type="faith"`; with `env.state.maxFaith = 2` it has `data-type="faith"`. With `env.derived.maxWounds = 50` the strip has 50 Wounds boxes. With `env.state.wrath = 0` the Wrath "−" tag (`tagOf(html, 'aria-label="Remove Wrath"')`) still holds no `disabled`. Zero max (Review Focus): `maxWounds = 0`, `maxShock = 0` → no `data-type="wounds"` box, no `data-type="shock"` box, both `sheet-strip-label` texts present, Wrath pair present.

Box clicks (spec §10.1 case 5): four `stubEl` boxes (`cls: ['tracking-box']` plus `'filled'` where filled; `data: { type, index }`); `dom.container.query = sel => sel === '.tracking-box:not(.follower-box)' ? boxes : []`; replace `sheet.render` with a counter (restore in `finally`); call `sheet.bindSessionTrackingControls(dom.container)` and fire each box's `click` listener. Expected `env.state.calls`: empty Wounds box 4 → `['setCurrentWounds', 5]`; filled Wounds box 1 → `['setCurrentWounds', 1]`; empty Shock box 2 → `['setCurrentShock', 3]`; filled Shock box 0 → `['setCurrentShock', 0]`; `render` counted 4.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/test-sheet-tabs.js`
Expected: exit 1, `renderPane is not a function` or FAIL on `SHEET_TABS`. (The box-click checks pass already; they pin the existing handler that now serves the strip — delete the `State.setCurrentWounds(index + 1)` branch once locally to see them fail, then restore it.)

- [ ] **Step 3: Implement**

Add `SHEET_TABS`, `getVisibleSheetTabs`, `renderPane`, `renderStrip`, `renderStripTrackers` with the signatures above. `renderPane` uses a `switch` on the id and calls the block functions with their existing signatures (`renderTraits(ctx.derivedStats, ctx.breakdowns)`, `renderSpeciesAbilities(ctx.character, ctx.species)`, `renderArchetypeAbilities(ctx.archetype)`, `renderDetails(ctx.character, ctx.species, ctx.archetype)`, the rest `(ctx.character)`). Stats reuses the current `.sheet-columns` markup of `render()`. Rewrite the `innerHTML` of `render()` as in Produces; drop the `.sheet-body`, `.sheet-body-left`, `.sheet-body-right` wrappers there. Remove the Wounds row, the Shock row, the Wrath tracker and the now-unused `currentWounds`/`currentShock`/`currentWrath`/`woundBoxes`/`shockBoxes` locals from `renderTraits`. Do not change the block functions' markup.

- [ ] **Step 4: Run all tests**

Run: `for f in scripts/test-*.js; do node "$f" > /dev/null || echo "FAIL $f"; done`
Expected: no output.

- [ ] **Step 5: Browser smoke**

Browser procedure, a psyker character with a follower and a mutation. Expected: header, then the Wounds and Shock boxes and the Wrath counter, then all blocks in the order Character, Stats, Abilities, Wargear, Psychic Powers, Followers, Notes (no pinning, no tabs yet); Traits shows Faith/Wealth only; clicking a box and Wrath "+" changes the value; the jump-to-section button still lists the sections; no console error.
Expected until Task 3: no tab bar, every pane shows. Expected until Task 4: the strip is unstyled and not pinned, and at 1440px the panes other than Stats show in one column. Expected until Task 6: a box or Wrath click can move the scroll position and loses the focus. Do not report these.

- [ ] **Step 6: Commit**

```bash
git add scripts/test-sheet-tabs.js creator/tabs/character-sheet-tab.js
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Build the sheet as a strip and one pane per tab (#25)"
```

---

### Task 3: Tab bar, selection, keyboard

**Model:** sonnet

**Files:**
- Modify: `creator/tabs/character-sheet-tab.js` — `init()`, `render()`, `renderStrip`, new members
- Test: `scripts/test-sheet-tabs.js` (Task 3 block)

**Interfaces:**
- Consumes: Task 2 `SHEET_TABS`, `getVisibleSheetTabs`, `renderStrip`, `renderPane`; shared helpers.
- Produces:
  - `activeSheetTab: 'stats'` — module property; not reset on a new character or load; never stored.
  - `renderTabBar(visibleIds) -> string` — `<div class="sheet-tabbar" role="tablist" aria-label="Character sheet sections">` with one `<button type="button" class="sheet-tab-btn[ active]" role="tab" id="sheet-tab-<id>" aria-controls="sheet-pane-<id>" data-sheet-tab="<id>" aria-selected="true|false" tabindex="0|-1">Label</button>` per visible id (spec §6). Rendered by `renderStrip` inside `.sheet-strip-bar`, after `.sheet-strip-trackers`.
  - Panes become `<div class="sheet-pane" role="tabpanel" id="sheet-pane-<id>" aria-labelledby="sheet-tab-<id>" tabindex="0"[ hidden]>`, `hidden` on every pane but the active one.
  - `render()` applies the fallback first: if `activeSheetTab` is not in `getVisibleSheetTabs(character)`, set it to `'stats'`. It calls `this._scrollActiveTabIntoBar(container)` after the bind calls.
  - `selectSheetTab(id) -> void` — no re-render. Sets `activeSheetTab`; over `container.querySelectorAll('.sheet-tab-btn')` sets `aria-selected`, `tabindex` (`setAttribute`) and toggles `active`; over `container.querySelectorAll('.sheet-pane')` sets `pane.hidden = pane.id !== 'sheet-pane-' + id`; calls `this._closeBreakdownPopup()` and, when `typeof Glossary !== 'undefined'`, `Glossary.closeAllPopups()`; then the scroll rule of spec §5.3 step 4 with `panes = container.querySelector('.sheet-panes')`, `pinned = this._pinnedElement(container)` and the scroller `#tab-character-sheet`; then `_scrollActiveTabIntoBar(container)`. `container` is `#character-sheet-content`.
  - `_pinnedElement(container) -> Element` — `.sheet-strip-bar` when `window.getComputedStyle(strip).display === 'contents'` (compact mode, Task 4), else `.sheet-strip`. One source of truth: the CSS decides the mode; JS does not repeat the media query.
  - `_nextSheetTabId(ids, currentId, key) -> string | null` — pure: `ArrowRight` next with wrap, `ArrowLeft` previous with wrap, `Home` first, `End` last, any other key null; `null` also when `currentId` is not in `ids` (for example `undefined`).
  - `handleSheetTabKeydown(e) -> void` — `btn = e.target.closest('.sheet-tab-btn')`; when `btn` is null (the Notes textarea or any other control in the sheet) it returns at once, with no `preventDefault` and no tab change. The current id is `btn.dataset.sheetTab`, never `activeSheetTab`. Ids from the `data-sheet-tab` of `container.querySelectorAll('.sheet-tab-btn')` in DOM order; on a non-null next id: `e.preventDefault()`, `selectSheetTab(next)`, then `.focus()` on the button whose `dataset.sheetTab === next`.
  - `init()` adds one `click` and one `keydown` listener to `#character-sheet-content`: click → `closest('.sheet-tab-btn')` → `selectSheetTab(btn.dataset.sheetTab)`; keydown → `handleSheetTabKeydown(e)`.
  - `_scrollActiveTabIntoBar(container) -> void` — `bar = .sheet-tabbar`, `btn = .sheet-tab-btn.active`; returns when either is missing; when the button sticks out on one side, sets `bar.scrollLeft` so that the view edge lies 4px beyond the button's edge on the side it brings into view (room for the 2px outline at 2px offset), clamped to the scroll range `[0, bar.scrollWidth - bar.clientWidth]`: past the right edge → `btn.offsetLeft + btn.offsetWidth + 4 - bar.clientWidth`; past the left edge → `btn.offsetLeft - 4`; a button fully inside the view → no change. Never `scrollIntoView` (it would scroll the page).

- [ ] **Step 1: Write the failing Task 3 block**

Markup (spec §10.1 cases 3, 8, 9) on `render()` HTML with `stubBlocks`:
- default `sheet.activeSheetTab === 'stats'`; `tagOf(html, 'role="tablist"')` includes `aria-label="Character sheet sections"`; the tab bar lies after `sheet-strip-trackers` and before `class="sheet-panes"`.
- psyker plus one follower, `activeSheetTab = 'wargear'`: button labels in order (`/data-sheet-tab="[a-z]+"[^>]*>([^<]+)</g`) are `Character, Stats, Abilities, Wargear, Psychic Powers, Followers, Notes`; for each id, `tagOf(html, 'id="sheet-tab-' + id + '"')` includes `role="tab"`, `aria-controls="sheet-pane-<id>"` and `tabindex="0"` only for `wargear` (`tabindex="-1"` otherwise), `aria-selected="true"` only for `wargear`; `tagOf(html, 'id="sheet-pane-' + id + '"')` includes `role="tabpanel"`, `aria-labelledby="sheet-tab-<id>"`, `tabindex="0"`, and ` hidden` for every id but `wargear`; all seven panes are in the HTML in tab order (print needs them).
- fallback: `activeSheetTab = 'powers'`, `psyker` false → after `render()` `activeSheetTab === 'stats'`, `count(html, /aria-selected="true"/g) === 1` on `sheet-tab-stats`, and the only pane without `hidden` is `sheet-pane-stats`. Same with `'companions'` and no followers.

Keys (spec §10.1 case 8): `_nextSheetTabId(ids5, 'notes', 'ArrowRight') === 'character'`, `(ids5, 'character', 'ArrowLeft') === 'notes'`, `'Home'` → `'character'`, `'End'` → `'notes'`, `'ArrowRight'` from `'stats'` → `'abilities'`, `'a'` → `null`, `'ArrowRight'` with `currentId` `undefined` or `'powers'` (not in `ids5`) → `null`. `handleSheetTabKeydown`: five `stubEl` buttons in `dom.container.query('.sheet-tab-btn')`, `selectSheetTab` replaced by a recorder (restored in `finally`); an `ArrowRight` event on the `notes` button records `'character'`, focuses the `character` button once and calls `preventDefault`; key `'a'` records nothing and does not call `preventDefault`. Textarea (Review Focus), with the same five button stubs in the query and the same `selectSheetTab` recorder in place (so that a handler that does not test the event target and reads `activeSheetTab` would record a tab and fail): a `stubEl({ cls: ['sheet-notes-input'] })` target (its `closest('.sheet-tab-btn')` is null) with `activeSheetTab = 'notes'`; for each of ArrowRight, ArrowLeft, Home, End, `handleSheetTabKeydown` records no `selectSheetTab` call, focuses no button and does not call `preventDefault`.

Selection: `stubEl` buttons and panes for five ids, a `.sheet-panes` stub with `rect: { top: 120 }`, a `.sheet-strip` stub (`display: 'block'`, `rect: { bottom: 300 }`) and a `.sheet-strip-bar` stub (`rect: { bottom: 150 }`), `dom.scroller.scrollTop = 900`; `sheet.render` and `sheet._closeBreakdownPopup` replaced by counters and `env.ctx.Glossary = { closeAllPopups: counter }` (all restored or deleted in `finally`). `selectSheetTab('wargear')`: `activeSheetTab === 'wargear'`; wargear button `aria-selected` `'true'`, `tabindex` `'0'`, class `active`; the others `'false'`, `'-1'`, no `active`; only the wargear pane has `hidden === false`; `render` count 0; each close counter 1; `scrollTop === 720` (900 + 120 − 300). With panes `top: 400` the `scrollTop` stays 900. With the strip `display: 'contents'` and panes `top: 100`, `scrollTop === 850` (uses the bar). Without `Glossary` in the context no error.

`init()` wiring: `sheet.init()` on a fresh `makeDom()`; fire the container's `click` listener with `{ target: stubEl({ cls: ['sheet-tab-btn'], data: { sheetTab: 'notes' } }) }` → recorder gets `'notes'`; fire `keydown` with ArrowRight on that target → `handleSheetTabKeydown` called (recorder).

`_scrollActiveTabIntoBar` (bar stub with `scrollWidth 1000`): bar `scrollLeft 0, clientWidth 300`, active button `offsetLeft 400, offsetWidth 80` → `scrollLeft === 184` (400 + 80 + 4 − 300); button `offsetLeft 50, offsetWidth 80` with bar `scrollLeft 100` → `46` (50 − 4); button `offsetLeft 2` with bar `scrollLeft 100` → `0` (clamped); button `offsetLeft 900, offsetWidth 98` with bar `scrollLeft 0` → `700` (1002 clamped to 1000 − 300); a button inside the view leaves `scrollLeft` unchanged; missing bar → no error.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/test-sheet-tabs.js`
Expected: exit 1, FAIL on `activeSheetTab` / `role="tablist"` or `_nextSheetTabId is not a function`.

- [ ] **Step 3: Implement** the Produces members. In the `init()` test the TOC calls are still there; `makeDom()` supplies `MutationObserver` for them.

- [ ] **Step 4: Run all tests**

Run: `for f in scripts/test-*.js; do node "$f" > /dev/null || echo "FAIL $f"; done`
Expected: no output.

- [ ] **Step 5: Browser smoke**

Browser procedure. 1. The sheet opens on Stats; the other panes are hidden. 2. Mark a pane node with `browser_evaluate` (`document.getElementById('sheet-pane-notes')._mark = 1`), click Wargear, then Notes: only the selected pane's blocks show each time, and `document.getElementById('sheet-pane-notes')._mark === 1` (the same node survived, so there was no re-render). 3. Tab to the bar, ArrowRight / ArrowLeft / Home / End move and select; Tab moves into the pane. 4. Remove the PSYKER keyword source while Psychic Powers is selected (or select it on a psyker, then load a non-psyker): the sheet shows Stats. 5. In the Notes textarea, ArrowLeft, ArrowRight, Home and End move the caret; the tab stays Notes. No console error.
Expected until Task 4: the tab bar shows plain browser buttons and the strip is unstyled and not pinned. Expected until Task 7: print shows only the selected pane plus the tab bar (the browser's built-in `[hidden]` rule). Expected until Task 5: the jump-to-section list still links into hidden panes. Expected until Task 6: a box or Wrath click can move the scroll position and loses the focus. Do not report these.

- [ ] **Step 6: Commit**

```bash
git add scripts/test-sheet-tabs.js creator/tabs/character-sheet-tab.js
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Add the sheet tab bar with click and arrow-key selection (#25)"
```

---

### Task 4: Strip CSS — pinning, the two modes, boxes, tab pills, panes, focus

**Model:** opus — the strip's layout modes: grid shapes, sticky with `display: contents`, the box sizes against the spec's size targets, and the browser measurements.

**Files:**
- Modify: `creator/css/styles.css` — append the new section at the end of the file
- Test: `scripts/test-sheet-tabs.js` (Task 4 block)

**Interfaces:**
- Consumes: the markup of Tasks 2–3 (classes in Global Constraints; the flat child order of `.sheet-strip-trackers`); Task 3 `_pinnedElement` reads `display: contents` on `.sheet-strip`; Task 3 `_scrollActiveTabIntoBar` needs `.sheet-tabbar` to be the `offsetParent` of its buttons.
- Produces: the section `/* ===== Character Sheet Tabs (issue #25) ===== */` at the end of `styles.css`; Task 7 appends its print blocks to it.

Requirements (spec §2.1–2.3, §6; sizes are targets, exact look is the builder's):
- Unscoped: `.sheet-pane[hidden] { display: none; }`; `.sheet-tab-btn:focus-visible, .tracker-btn:focus-visible { outline: 2px solid var(--accent-gold); outline-offset: 2px; }`; `.sheet-tabbar` flex row, `gap`, `position: relative`, wraps; `.sheet-tab-btn` pills in the `.wargear-tab-btn` style (same variables; `.active` gold); `.sheet-pane-columns` a plain block, and inside `@media (min-width: 1400px)` a `grid-template-columns: 1fr 1fr` grid with `gap: 15px; align-items: start`.
- `@media screen` (full mode): `.sheet-strip { position: sticky; top: 0; z-index: 5; background: var(--bg-primary); }` (opaque; under every popup, modal and the drawer backdrop at 899); the name in the strip smaller than 28px (about 22px); `.sheet-strip-trackers` a grid `64px 1fr 110px` with Wounds in row 1, Shock in row 2 and `.sheet-strip-wrath` in column 3 spanning both rows; inside the strip `.tracking-boxes` has `max-width: none; justify-content: flex-start;` (18px boxes, 4px gap as today). `.sheet-strip-label` sets no `color`: the labels also carry `tracker-label` (Task 2), whose colour and light-theme print colour apply.
- `@media screen and (max-width: 768px), screen and (max-height: 600px)` (compact mode): `.sheet-strip { display: contents; }`; `.sheet-strip-bar { position: sticky; top: 0; z-index: 5; background: var(--bg-primary); padding: 8px 12px; }`; trackers grid `52px 1fr`, `.sheet-strip-wrath` on row 3 across both columns, Wrath `.tracker-btn` at least 32×32px; boxes 22px with 4px gap; `.sheet-tabbar { flex-wrap: nowrap; overflow-x: auto; }` with at least 4px of padding on all four sides, so that the 2px focus outline at 2px offset is not clipped by the scroll box (one row, about 40px including that padding).
- No `overflow` on any element between `#tab-character-sheet` and the strip. No raw colour (`#hex`, `rgb(`, a named colour) in the section.

- [ ] **Step 1: Write the failing Task 4 block**

```js
const sec = tabsSection();
check('section exists', sec.length > 0, true);
check('hidden panes are hidden on screen', /\.sheet-pane\[hidden\]\s*\{\s*display:\s*none;?\s*\}/.test(sec), true);
check('focus ring on tabs and tracker buttons', /\.sheet-tab-btn:focus-visible,\s*\.tracker-btn:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent-gold\)[^}]*outline-offset:\s*2px/.test(sec), true);
const full = mediaBlocks(sec, 'screen').join('\n');
const compact = mediaBlocks(sec, 'screen and (max-width: 768px), screen and (max-height: 600px)').join('\n');
check('full mode pins the strip', /\.sheet-strip\s*\{[^}]*position:\s*sticky[^}]*top:\s*0/.test(full), true);
check('compact mode unwraps the strip and pins the bar', [/\.sheet-strip\s*\{[^}]*display:\s*contents/.test(compact), /\.sheet-strip-bar\s*\{[^}]*position:\s*sticky/.test(compact)], [true, true]);
check('compact tab bar scrolls sideways', /\.sheet-tabbar\s*\{[^}]*flex-wrap:\s*nowrap[^}]*overflow-x:\s*auto/.test(compact), true);
const barRule = (compact.match(/\.sheet-tabbar\s*\{([^}]*)\}/) || [])[1] || '';
const sides = { top: 0, right: 0, bottom: 0, left: 0 };
const short = barRule.match(/(?:^|;)\s*padding:\s*([^;]+)/);
if (short) { const v = short[1].trim().split(/\s+/).map(parseFloat); [sides.top, sides.right, sides.bottom, sides.left] = [v[0], v[1] ?? v[0], v[2] ?? v[0], v[3] ?? v[1] ?? v[0]]; }
for (const side of Object.keys(sides)) { const m = barRule.match(new RegExp(`padding-${side}:\\s*([\\d.]+)px`)); if (m) sides[side] = parseFloat(m[1]); }
check('compact tab bar has 4px padding on every side for the focus ring', Object.values(sides).every(v => v >= 4), true);
check('strip labels set no colour', /\.sheet-strip-label\s*\{[^}]*color:/.test(sec), false);
check('sticky only inside screen blocks', count(sec.replace(/@media screen[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/g, ''), /position:\s*sticky/g), 0);
check('wide panes are two columns', /\.sheet-pane-columns\s*\{[^}]*grid-template-columns:\s*1fr 1fr/.test(mediaBlocks(sec, '(min-width: 1400px)').join('')), true);
check('no raw colour', /#[0-9a-f]{3,8}\b|rgba?\(/i.test(sec), false);
```

- [ ] **Step 2: Run the test to verify it fails** — `node scripts/test-sheet-tabs.js` — Expected: exit 1, FAIL `section exists`.

- [ ] **Step 3: Write the CSS** as listed in Requirements.

- [ ] **Step 4: Run all tests** — `for f in scripts/test-*.js; do node "$f" > /dev/null || echo "FAIL $f"; done` — Expected: no output.

- [ ] **Step 5: Browser measurements** (Browser procedure; viewport with `browser_resize`; heights via `browser_evaluate` of `getBoundingClientRect().height` on `.sheet-strip` in full mode and `.sheet-strip-bar` in compact mode; tolerance 20px). Report a table with one row per check:
  1. 1280×800, a character with 8 keywords, ≤30 Wounds, ≤20 Shock: strip pinned on scroll, height ≤ 240px.
  2. 800×800, a Tier 5 / Rank 5 character with 50 Wounds and 35 Shock and two chip rows (set Toughness and bonuses in the builder; or, for measurement only, `State.character` values via `browser_evaluate` then a re-render): height ≤ 300px, Wounds in 3 rows.
  3. 360×740, 768×1024, 740×360, 1280×560, typical (14 / 9) and worst (50 / 35) characters: identity scrolls away, the bar stays pinned, heights within the spec §2.2 table (about 170 / 350, 145 / 225, 145 / 225, 145 / 200).
  4. 360, 768, 800, 1024, 1280, 1440 widths: `document.documentElement.scrollWidth <= innerWidth` (no horizontal page scroll); at 1440 Character, Abilities and Wargear show two columns, Stats keeps its columns; compact tab bar scrolls sideways and the selected tab is in view.
  5. Keyboard: Tab to a tab button and to Wrath "+": a gold focus ring shows. At 360×740, Tab to the first and the last tab button: the whole ring shows, not clipped by the sideways-scrolling bar (screenshot).
  6. A glossary popup (a keyword chip) and a breakdown popup (Defence) open above the pinned part.
  Expected until Task 6: a box or Wrath click can move the scroll position and loses the focus. Expected until Task 7: print shows only the selected pane plus the tab bar. Expected until Task 5: the jump-to-section button is still there. Do not report these.

- [ ] **Step 6: Commit**

```bash
git add scripts/test-sheet-tabs.js creator/css/styles.css
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Pin the sheet strip and style the tabs for wide and narrow screens (#25)"
```

---

### Task 5: Remove jump-to-section

**Model:** sonnet

Reason for this place in the order: from Task 3 on, the jump-to-section list links into hidden panes, so it goes right after the tabs and their CSS land (spec §11 also puts it early).

**Files:**
- Modify: `creator/tabs/character-sheet-tab.js` — the TOC members, the `init()` TOC calls, the end of `render()`, the `renderNotes` comment
- Modify: `creator/css/styles.css` — the TOC section (about 5731–5833), the `@media (min-width: 1400px)` `.sheet-body` rule with its comment (about 4323–4329), the print `.sheet-body` rule with its comment (about 4831–4834)
- Test: `scripts/test-sheet-tabs.js` (Task 5 block)

**Interfaces:**
- Consumes: shared helpers `readSource`.
- Produces: nothing new. `escapeHtml` stays.

- [ ] **Step 1: Write the failing Task 5 block** (spec §10.1 case 10)

```js
const src = readSource('creator/tabs/character-sheet-tab.js'), css = readSource('creator/css/styles.css');
check('no TOC member in the sheet module', [/_toc/.test(src), /_assignSectionIds|_buildTocList|_slugifySection|_ensureTocElements|_observeTabVisibility/.test(src)], [false, false]);
check('no sheet-body in the module', /sheet-body/.test(src), false);
check('no TOC or sheet-body CSS', [/\.sheet-toc-/.test(css), /\.sheet-body\b/.test(css), /jump-to-section/.test(css)], [false, false, false]);
check('Notes comment no longer mentions the table of contents', /table of contents/i.test(src), false);
check('escapeHtml stays', /\n    escapeHtml\(text\) \{/.test(src), true);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/test-sheet-tabs.js` — Expected: exit 1, FAIL on the TOC checks.

- [ ] **Step 3: Remove exactly spec §8**

In the module: the four `_toc*` properties and their comment; the `_ensureTocElements()` / `_observeTabVisibility()` calls and comment in `init()`; the methods `_ensureTocElements`, `_observeTabVisibility`, `_slugifySection`, `_assignSectionIds`, `_buildTocList`, `_toggleTocPanel`, `_openTocPanel`, `_closeTocPanel` with the `// ===== Table of Contents (jump-to-section) =====` header; the `_assignSectionIds` / `_buildTocList` calls and comment at the end of `render()`; in the `renderNotes` comment, the words "always shown so it stays in the table of contents" become "always shown". In the CSS: the whole TOC section with its `@media (max-width: 768px)` and `@media print` blocks; the `.sheet-body` grid rule and its comment inside `@media (min-width: 1400px)` (the `.character-sheet { max-width: none; }` rule there stays); the print `.sheet-body` rule and its comment. Nothing else.

- [ ] **Step 4: Run all tests, and check the diff**

Run: `for f in scripts/test-*.js; do node "$f" > /dev/null || echo "FAIL $f"; done` — Expected: no output.
Run: `git diff --stat` — Expected: only the module, `styles.css` and the test file; `git diff creator/css/styles.css | grep '^+' | grep -v '^+++'` prints nothing (removal only).

- [ ] **Step 5: Browser smoke** — Browser procedure. Expected: no floating jump-to-section button on the sheet; tabs still work; at 1440px Stats keeps its `.sheet-columns` and Character, Abilities and Wargear show two columns (Task 4 CSS); no console error. Expected until Task 6: a box or Wrath click can move the scroll position and loses the focus. Expected until Task 7: print shows only the selected pane plus the tab bar. Do not report these.

- [ ] **Step 6: Commit**

```bash
git add scripts/test-sheet-tabs.js creator/tabs/character-sheet-tab.js creator/css/styles.css
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Remove the jump-to-section button now that the sheet has tabs (#25)"
```

---

### Task 6: Re-render keeps the view

**Model:** opus — the state-keeping re-render and the focus-key helper: capture and restore around the full `innerHTML` write, key matching without selectors built from keys.

**Files:**
- Modify: `creator/tabs/character-sheet-tab.js` — `render()`, new members
- Test: `scripts/test-sheet-tabs.js` (Task 6 block)

**Interfaces:**
- Consumes: Task 3 `activeSheetTab`, `_scrollActiveTabIntoBar`; Task 2 Wrath button markup; shared helpers `sheetSandbox`, `makeDom`, `stubEl`, `stubBlocks`.
- Produces:
  - `_FOCUS_SELECTOR: '.sheet-tab-btn, .tracker-btn, .weapon-equip-checkbox, .follower-living-btn'`.
  - `_focusKeyOf(el) -> string | null` — spec §5.2 table: `tab:<data-sheet-tab>`; `tracker:<data-type>:minus|plus` (from class `tracker-minus` / `tracker-plus`); `equip:<data-wargear-index>`; `living:<closest('.sheet-follower').dataset.followerId>:<data-delta>`; null for anything else, for `null`, and for a living button outside a follower.
  - `_captureViewState() -> { scrollTop: number, focusKey: string | null }` — scroller `#tab-character-sheet` (`scrollTop` 0 when missing); `focusKey` null when `document.activeElement` is not inside `#character-sheet-content` (`container.contains`).
  - `_restoreViewState(state) -> void` — sets the scroller's `scrollTop`; when `focusKey` is not null, scans `container.querySelectorAll(this._FOCUS_SELECTOR)` for the first element with `_focusKeyOf(el) === focusKey`; if found and not `disabled`, `el.focus({ preventScroll: true })`.
  - `render()` order: `_captureViewState()` → fallback → build and write `innerHTML` → the bind calls → `_restoreViewState(state)` → `_scrollActiveTabIntoBar(container)`.

- [ ] **Step 1: Write the failing Task 6 block** (spec §10.1 case 7)

Keys: `_focusKeyOf` on stubs gives `'tab:wargear'` (`sheet-tab-btn`, `sheetTab: 'wargear'`), `'tracker:wrath:plus'`, `'tracker:faith:minus'`, `'equip:3'` (`weapon-equip-checkbox`, `wargearIndex: '3'`), `'living:f1:-1'` (`follower-living-btn`, `delta: '-1'`, parent `stubEl({ cls: ['sheet-follower'], data: { followerId: 'f1' } })`), and `null` for a `tracking-box`, for `dom.body`, for `null`.

Restore, with `stubBlocks` (restored in `finally`), `activeSheetTab = 'wargear'`, `dom.scroller.scrollTop = 420`:

```js
const oldPlus = stubEl({ cls: ['tracker-btn', 'tracker-plus'], data: { type: 'wrath' } });
const newMinus = stubEl({ cls: ['tracker-btn', 'tracker-minus'], data: { type: 'wrath' } });
const newPlus = stubEl({ cls: ['tracker-btn', 'tracker-plus'], data: { type: 'wrath' } });
dom.document.activeElement = oldPlus;
dom.container.query = sel => sel === sheet._FOCUS_SELECTOR ? [newMinus, newPlus] : [];
sheet.render();
check('scroll kept', dom.scroller.scrollTop, 420);   // the innerHTML stub resets it to 0
check('Wrath + refocused without scroll', [newPlus.focusCalls, newMinus.focusCalls], [[{ preventScroll: true }], []]);
check('tab kept', sheet.activeSheetTab, 'wargear');
```

Then: same with `newPlus.disabled = true` → `newPlus.focusCalls` empty, scroll 420. A box click (`activeElement = dom.body`) → no focus call, scroll 420. No match (query returns `[newMinus]`, focus key `tracker:wrath:plus`) → no error, no focus call. Focus outside the sheet (`dom.container.contains = () => false`, restored in `finally`) → no focus call.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/test-sheet-tabs.js` — Expected: exit 1, `_focusKeyOf is not a function` and FAIL `scroll kept` (0).

- [ ] **Step 3: Implement** the Produces members and the `render()` order. Compare computed keys; never build a selector from a key (a key holds player-controlled ids).

- [ ] **Step 4: Run all tests** — `for f in scripts/test-*.js; do node "$f" > /dev/null || echo "FAIL $f"; done` — Expected: no output.

- [ ] **Step 5: Browser smoke** — Browser procedure, 1280×800, a character with a weapon. Select Wargear. Drive each click through the page's script with `browser_evaluate` (the browser tool would scroll the target into view itself): set `document.getElementById('tab-character-sheet').scrollTop = 400`, then `document.querySelector('.tracking-box[data-type="wounds"]').click()`, then read `scrollTop`. Expected: 400 (or the largest possible value when the page is shorter), and Wargear still selected. Repeat for `.tracker-btn.tracker-plus[data-type="wrath"]` after calling `.focus()` on it: `scrollTop` kept, the Wrath value up by one, and `document.activeElement` is the new Wrath "+" (`matches('.tracker-plus[data-type="wrath"]')`). Repeat for `.weapon-equip-checkbox` after `.focus()`: `scrollTop` kept and `document.activeElement.classList.contains('weapon-equip-checkbox')`. Expected until Task 7: print shows only the selected pane plus the tab bar. No console error.

- [ ] **Step 6: Commit**

```bash
git add scripts/test-sheet-tabs.js creator/tabs/character-sheet-tab.js
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Keep the sheet scroll, tab and focus across a re-render (#25)"
```

---

### Task 7: Print

**Model:** sonnet

**Files:**
- Modify: `creator/css/styles.css` — append to the Task 4 section
- Test: `scripts/test-sheet-tabs.js` (Task 7 block)

**Interfaces:**
- Consumes: Task 4 section; classes of Tasks 1–3 (`sheet-details-section`, `sheet-strip`, `sheet-strip-bar`, `sheet-strip-trackers`, `sheet-tabbar`, `sheet-pane`).
- Produces: nothing new.

Requirements (spec §7): one `@media print` block at the end of the section with, in this order (the light-theme rule last, so that the checks find each plain rule first): `.sheet-strip, .sheet-strip-bar { position: static !important; }`, `.sheet-strip { display: block !important; }`, `.sheet-tabbar { display: none !important; }`, `.sheet-pane[hidden] { display: block !important; }`, `.sheet-details-section { display: none !important; }`, `.sheet-strip-trackers { page-break-inside: avoid; }`, and `body.print-light-theme .sheet-strip, body.print-light-theme .sheet-strip-bar, body.print-light-theme .sheet-strip-trackers { background: transparent !important; border: none !important; }`. The existing print rules (`.tracker-btn` hidden, `.sheet-header-section { page-break-after: avoid }`, light-theme `.tracking-box`) stay as they are.

- [ ] **Step 1: Write the failing Task 7 block** (spec §10.1 case 9, CSS part)

```js
const print = mediaBlocks(tabsSection(), 'print').join('\n');
const rule = sel => new RegExp(sel.replace(/[.[\]]/g, '\\$&') + '\\s*\\{([^}]*)\\}');
check('hidden panes print', /display:\s*block\s*!important/.test((print.match(rule('.sheet-pane[hidden]')) || [])[1] || ''), true);
check('tab bar does not print', /display:\s*none\s*!important/.test((print.match(rule('.sheet-tabbar')) || [])[1] || ''), true);
check('Details does not print', /display:\s*none\s*!important/.test((print.match(rule('.sheet-details-section')) || [])[1] || ''), true);
check('strip is static and block in print', [/\.sheet-strip,\s*\.sheet-strip-bar\s*\{[^}]*position:\s*static\s*!important/.test(print), /display:\s*block\s*!important/.test((print.match(rule('.sheet-strip')) || [])[1] || '')], [true, true]);
check('trackers stay on one page', /page-break-inside:\s*avoid/.test((print.match(rule('.sheet-strip-trackers')) || [])[1] || ''), true);
check('light theme clears the strip background', /body\.print-light-theme \.sheet-strip,[\s\S]*?background:\s*transparent/.test(print), true);
```

- [ ] **Step 2: Run the test to verify it fails** — Expected: exit 1, FAIL on every print check.

- [ ] **Step 3: Write the print block.**

- [ ] **Step 4: Run all tests** — Expected: no output from the loop.

- [ ] **Step 5: Browser print check** — Browser procedure; on the Wargear tab at 1280×800, `browser_emulate_media` `print` and add `print-light-theme` to `body` via `browser_evaluate`, then screenshot; repeat at 360×740. Expected both times: strip with box rows and Wrath value, no tab bar, no Details block, all blocks in tab order (Character first), light background, no sticky strip over the content. Reset the media emulation afterwards.

- [ ] **Step 6: Commit**

```bash
git add scripts/test-sheet-tabs.js creator/css/styles.css
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Print the whole sheet in tab order with the strip at the top (#25)"
```

---

### Task 8: Cache bump and browser check

**Model:** sonnet

**Files:**
- Modify: `creator/index.html` — every `?v=N` → `?v=N+1`

**Interfaces:**
- Consumes: everything above. Produces: nothing new.

- [ ] **Step 1: Bump the versions**

`grep -o '?v=[0-9]*' creator/index.html | sort | uniq -c` must print one line (expected `35 ?v=124`). Replace every `?v=N` with `?v=N+1`. Verify: the same command prints `35 ?v=125`; `git diff --stat $(git merge-base main HEAD) -- creator/js/web-api.js bestiary data shared` prints nothing; this step's diff lists only `creator/index.html`; `git diff $(git merge-base main HEAD) -- creator/tabs/character-sheet-tab.js` has no hunk inside `copySummary`.

- [ ] **Step 2: Run all tests** — `for f in scripts/test-*.js; do node "$f" > /dev/null || echo "FAIL $f"; done` — Expected: no output.

- [ ] **Step 3: Browser check (spec §10.2)**

Browser procedure (the cache-disable step is still fine; the new `?v=` also busts). Characters: A — a psyker with two followers (one mob), a mutation, an injury, corruption, a holy relic and an augmetic; B — Tier 5, Rank 5 with about 50 Wounds and 35 Shock. Viewports: the four compact viewports 360×740, 768×1024, 740×360, 1280×560, plus 800×800, 1024×800, 1280×800 and 1440×900. The report holds one table row per numbered step: step, viewport, result, console errors.

1. A at 1280×800: each tab shows the spec §3 blocks; Abilities reads Species Abilities, Archetype Abilities, Talents, Mutations (repeat at 360×740 and 1440×900). (A maximum of 0 Wounds or Shock does not occur in the app; the Task 2 Node check covers it.)
2. Psychic Powers and Followers show and hide with the PSYKER keyword and the follower list.
3. Select Followers, remove the last follower in the builder, return: Stats is selected, one pane shows.
4. Full mode (1280×800), Wargear, scrolled down: click an empty Wounds box, a filled Wounds box, a Shock box — they fill and clear as spec §4.2; tab and scroll stay. Click Wrath "+": value changes; tab, scroll and focus stay.
5. Click an equip checkbox: tab, scroll and focus stay.
6. Click a mob member button until it reaches 0 living: tab and scroll stay; focus stays until the button becomes `disabled`, then it is lost with no error.
7. Each compact viewport, Wargear, scrolled down: identity scrolled away; boxes, Wrath and tab bar pinned; tap a box — value changes, tab and scroll stay. With B, the box rows wrap and the pinned heights match the spec §2.2 table (±20px).
8. Type in Notes: caret stays while typing; ArrowLeft, ArrowRight, Home and End in the textarea move the caret and do not change the tab; switch tabs and back: the text is there.
9. Keyboard only: Tab to the bar, ArrowRight/ArrowLeft (wrap), Home, End, Tab into the pane; the gold focus ring shows on the tabs and on the Wrath buttons.
10. Widths 360, 768, 800, 1024, 1280, 1440 and the 1280×560 window: size targets of spec §2.2, box rows wrap, no horizontal page scroll, pane layouts of spec §2.3, compact tab bar scrolls sideways with the selected tab in view.
11. Open a glossary popup and a breakdown popup, then switch tabs: both close; while open they show above the pinned part.
12. Print preview from the Wargear tab (Print button; or `browser_emulate_media` print + `print-light-theme`): strip with box rows and Wrath value, no tab bar, no Details block, all blocks in tab order, light theme.
13. Copy Summary: Step 1 already showed no diff in `copySummary`. Stub the clipboard with `browser_evaluate` (`window._copied = null; navigator.clipboard.writeText = t => { window._copied = t; return Promise.resolve(); }`), click Copy Summary, read `window._copied`: it holds the name, the Tier and Rank line, the attributes and the wargear of A.
14. New character, then Load of A while Wargear is selected: Wargear stays selected; load a non-psyker while Psychic Powers is selected: Stats.
15. Reload the page (character has a name and species): the sheet opens on Stats; no `#` hash in the URL and no new `localStorage` key for the tab.

- [ ] **Step 4: Commit**

```bash
git add creator/index.html
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Bump the creator asset versions for the sheet tabs (#25)"
```

---

## Self-Review

1. **Spec coverage.** §2.1 DOM → Tasks 2 (strip, panes), 3 (tab bar, attributes), 4 (sticky, z-index, no overflow). §2.2 modes and sizes → Task 4, measured in Task 4 step 5 and Task 8 steps 7, 10. §2.3 pane layouts → Task 2 (wrappers), Task 4 (grid). §3 mapping, `SHEET_TABS`, `renderPane`, `ctx` → Task 2. §3.1 Details and `getSpeciesDisplayName` → Task 1. §3.2 Mutations → Task 1. §3.3 visibility → Task 2; fallback → Task 3. §4 strip content and forms, subtitle Tier and Rank, aria-labels, Wrath never disabled → Task 2; §4.3 Traits → Task 2. §5.1 → Task 3 (and Task 8 step 15). §5.2 → Task 6. §5.3 → Task 3. §6 → Tasks 3 (markup, keys, textarea guard) and 4 (focus style, `[hidden]`, unclipped ring). §7 → Task 7. §8 → Task 5. §9 → Global Constraints (existing tests, block functions untouched, `escapeHtml` kept, the #33 fix wave). §10.1 cases: 1, 2, 4, 5 → Task 2; 3, 8, 9 markup → Task 3; 6 → Task 1; 7 → Task 6; 9 CSS → Task 7; 10 → Task 5. §10.2 → Task 8. §10.3 → Task 8.
2. **Step scan.** Every code step names the file, the members and the pinned values; bodies are left to the implementer except the exact markup strings and the keyboard/scroll rules the spec fixes. Changed browser steps now prove what they claim: Task 3 marks a pane node to detect a re-render; Task 6 drives clicks with `el.click()` and reads `scrollTop`; Task 8 step 13 reads the copied text through a stubbed clipboard. Each task that leaves a planned incomplete state says "Expected until Task N".
3. **Type consistency.** `renderPane(tabId, ctx)` and `ctx` defined in Task 2 and used in Tasks 3 and 6; `renderStrip(ctx, visibleIds)` gains `renderTabBar(visibleIds)` in Task 3; `_pinnedElement(container)` and `_scrollActiveTabIntoBar(container)` take `#character-sheet-content`, and Task 4 makes `.sheet-tabbar` their `offsetParent`; `_nextSheetTabId` returns `null` for an unknown id and `handleSheetTabKeydown` ignores a target outside `.sheet-tab-btn`; `_captureViewState()` returns `{ scrollTop, focusKey }`, consumed by `_restoreViewState(state)`; `_FOCUS_SELECTOR` is the one selector list; the strip labels carry `sheet-strip-label tracker-label` in Task 2 and Task 4 gives `.sheet-strip-label` no colour. `makeDom`'s `scroller` and `body` are `stubEl`s, and `sheetSandbox` reads the module with `vm.runInContext(src + '\n;CharacterSheetTab;', ctx)`. Task order 1, 2, 3, 4 (strip CSS), 5 (removal), 6 (re-render), 7 (print), 8; every cross-reference uses these numbers.
4. **Review Focus.** Zero-max strip → Task 2 check; escaped player text → Task 1 checks; vanished tab → Task 3 fallback checks; narrow print → Task 4 `screen`-only sticky check and Task 7 print checks; keys in the Notes textarea → Task 3 textarea check and Task 8 step 8.
5. **Proportion.** The plan is about 1.6 times the length of the spec (about 9,450 words against 5,835); the excess is the shared test-helper contract and the browser checklists. Code blocks are test assertions and exact strings only.

---

## Review record (2026-11-14)

The eight tasks ran one after the other on the branch `sheet-tabs`, cut from the base commit `30d996e`. Each task had a task review, except Task 8 (see ruling 12). One review of the full branch followed, with one fix wave. This section holds the rulings that the controller made without the owner, the items that were deferred, and the wave table. The final head of the branch is `d57cbfe`. The merge commit on `main` is `f99d2b1`. The creator assets are at `?v=125`.

### Rulings

An item that starts with "Owner can reverse:" is a ruling that the owner is most likely to want to see.

1. Ruling: the `.tracker-row` CSS (`creator/css/styles.css`, about :3141-3146 and its print rule about :5064-5066) became unused when Task 2 moved the trackers. It joined the removal list of Task 5, because the change made it unused. The spec §8 list does not name it, because the rule is older than the render split. If this is wrong, a later use brings the rule back. It costs nothing.
2. Ruling: Task 4 showed content in a band of 20, 15 and 10px above the pinned strip. The scroller `#tab-character-sheet` has a top padding, and the browser pins the strip inside it. The controller sent this visible defect back to the implementer before the review. The scroller top padding moved into the sheet for the Character Sheet tab only, inside `@media screen`. The spec `top: 0` stays, because the spec did not foresee the padding. If this is wrong, the space above the Copy and Print buttons differs by a few px.
3. Owner can reverse: a third layout mode, low mode. In `@media screen and (max-height: 480px)`, only the tab bar stays pinned, and the tracker rows scroll with the page. Windows of 481px to 600px keep compact mode, and `_pinnedElement` returns the tab bar in low mode. The reason: at 740x360 the scroller is 230px high, because the app chrome takes 130px. The pinned bar then left 80px (typical character) and 2px (largest character) for the pane. The spec figures ignored the app chrome. The owner decision about narrow viewports covers width only, and it stays. If this is wrong, a wound needs one scroll up on a landscape phone. To pin the boxes in low mode too, remove one media block. The spec §2.2 now holds the mode and the measured numbers. The limit is by viewport height only, so a 360x560 phone stays in compact mode (see F4 in the deferred items).
4. Ruling: Minor findings 2, 3 and 4 of the Task 4 review (Wrath column 112px, missing CSS checks, the "Full mode" comment) went with fix round 1. They were in the same file, and each one was small.
5. Owner can reverse: the Notes box gets the focus key `notes` with its selection range. The cause was the re-render at the end of the threat-data load. It took the focus and the caret from the Notes box, one time per session, during the fetch of a 2.6 MB file. This adds one row to the spec §5.2 table. If this is wrong, it costs nothing. The rule that typing never causes a re-render stays.
6. Ruling: a fallback to Stats sets the captured scroll to 0. Before, the fallback restored the scroll of the old pane. F6 shows one hole in this rule (see the deferred items).
7. Ruling: an older raw site went with Task 6 fix round 1. `renderFollower` printed `data-follower-id` with no escape, and the id can come from an imported file. This is the same class as the F4 safety fix of the custom wargear wave. The fix is one escape call. The other saved-character values in `renderFollower` and `renderFollowers` got the same check. The follower id, `livingCount` and the counts are now escaped, with `String()` first.
8. Owner can reverse: three print items of Task 7 went back to the implementer before the review. Print changed more than the feature needed. (1) Each tracker printed as a stacked block (the label on one line, the boxes centered on the next), because the strip grid is screen-only. Print got its own rule, so that a label and its boxes are one row. (2) The injury subheads printed pale on white and the Mutation card printed dark. Main has the same pale text and dark card, so these are older defects of the light print theme. They now print dark text on a light background. (3) The dark band at the page edges is the `#tab-character-sheet` background. Main prints it too, so it stays unchanged. If this is wrong, the print of injuries and mutations differs from main by color only.
9. Owner can reverse: three more older print defects that main has too were fixed before the Task 7 review. They are: the Ascension card prints dark, the Follower threat card prints dark, and the "EFFECT" label overlaps the item names of Augmetics and Equipment. The limits were: print-only rules, no markup change, and a stop at an item that needs more than about ten rules. The implementer wrote 9 print-only rules. Print thus changed more than the feature needed. Both Important findings of the Task 7 review came from these added rules (a page split in Attributes, Traits and Skills, and low contrast in the Follower and Mutation cards). Fix round 1 closed both. If this is wrong, the print of those three blocks differs from main.
10. Ruling: the equipment group print rule stays outside the light print theme and outside the Sheet tabs block. It corrects a layout defect of every print, and it must follow the old rule that it overrides. A comment says so. The final review found that the reason in the comment was wrong: specificity decides ((0,2,0) against (0,1,1)), not the order. The fix wave corrected the comment (F9). The rule did not move.
11. Ruling: two readings joined Task 7 fix round 1. The printed tracker rows get the inset of the cards, because the rows are new with this branch. The 1400px two-column rule of Task 4 gets the `screen` qualifier, because a very wide printed page would get two columns.
12. Owner can reverse: Task 8 got no separate task review. Its diff is 35 mechanical lines that the controller checked: one `35 ?v=125` line, one file in the commit, a clean tree. Its browser report went to the final review as unverified claims, with a sample re-run. If this is wrong, a wrong row of the browser table reaches the final review, which has the browser. The final review reproduced every sampled row. Task 8 did not see F2, because it looked with Notes selected.
13. Ruling: F1 gets the design of the reviewer. One delegated `focusin` listener puts a keyboard-focused target in `.sheet-panes` under the bottom of `_pinnedElement()`. It stores no height and uses no CSS. Guards cover the scroll restore, mouse use and pinned controls. The mechanism is a flag that a Tab keydown sets (a 0ms timer clears it), plus a restore guard. The helper `_keepBelowPinned` serves `focusin` and `selectSheetTab`. `scroll-padding-top` is not a fix, because a focus on a pinned control then scrolls the page. If this is wrong, remove one listener.
14. Owner can reverse: F2 gets an edge cue on a one-row tab bar. A fade shows on each side that has more tabs. The alternative is two rows of tabs. The approved sketch (spec §2.3) shows one row with a cut pill and an arrow, and two rows cost about 38px of pinned height on a phone. Two rows is on the owner's list as the alternative. If this is wrong, replace one CSS block and one helper. The mechanism is a sticky `::before` and `::after` flex item with a net width of 0, so the tab offsets and `scrollWidth` do not change.
15. Ruling: F3 is fixed now, by the same bar as ruling 7. The four sites escape with `String()` first (the Wrath value in the strip, `Rank` in `renderHeader`, the ascension `targetTier` and `Rank` in `renderDetails`). Each field has one check with the `EVIL` string. `String()` first is necessary, because `escapeHtml(0)` returns an empty string, and a Wrath of 0 must print `0`. F3 is not a regression: main runs the same payloads.
16. Owner can reverse: some Minor items joined the fix wave, because the wave edits the same code or the cost is one line. They are F5 (the resize update that F2 needs also calls `_scrollActiveTabIntoBar`), F7, F8, F9, F10, and from F11 the four green mutations and the hostile-field checks. F7 puts the scroll of the Notes box in the view state, because the strip makes the flow "click a tracker while in Notes" common. If this is wrong, the Notes box returns to line 1 on each re-render, as on main. The view state keeps the Notes box scroll also after a load of another character (the page scroll does the same). F8 gives the pane a gold ring and the tab ring no animation of `outline`. Four older ledger items closed in the same wave: the Notes restore check that passed for any selector, the comment "caret at the end", the comment "must come after", and `STYLE_GUIDE.md:119`.
17. Ruling: these items are left for the owner and not fixed: F4 (mode by measured room, or a cap of the chip rows), F6, F12, F13, the gap "no real `render()` on real data" of F11, and the reviewer's "Declined to judge" list. They are in the deferred items below.
18. Owner can reverse: the F2 cue gets a chevron on each side that has more tabs. The fade alone was too weak at 360x740 at the start position, because the fifth pill starts at the bar edge. The fade then sits on the end of the Wargear pill. The approved sketch of spec §2.3 shows an arrow. The controller sent this back to the implementer before the re-review (commit `91cf5c4`). If this is wrong, remove one `content` declaration.

### Plan lines that no longer match the code

The spec on the branch (`docs/superpowers/specs/2026-11-13-sheet-tabs-design.md`) is the authority. The plan stays as written, and these lines differ from the code:

- The plan lines that name the old focus selector and the old view-state shape of Task 6 stay as written. The code adds the `notes` focus key, `.sheet-notes-input` in the selector, and the Notes scroll in the view state (spec §5.2).
- The plan and the first spec text give pinned heights of "about 135px" and "about 390px". They ignored the app chrome. Spec §2.2 holds the measured numbers and the low mode.
- The plan has no top padding rule for the scroller. The code moves it into the sheet (ruling 2).
- The spec §8 removal list does not name `.tracker-row`. The code removes it (ruling 1).
- The fix wave added behavior that the plan does not have: the escape of `rank`, `targetTier` and the Wrath value (spec §5.2); the handler for a Tab focus under the pinned part, the edge cue of the compact tab bar and the `resize` handler (spec §2.3 and §6); the gold ring of the pane and a transition of named properties on the tab button (spec §6).
- The spec text for 800x800 says 22-23 boxes per row and 3 rows. The test browser (overlay scrollbars) shows 25 boxes per row and 2 rows. The ledger records no amendment for this text.
- The spec sentence "A larger value only adds a row; nothing breaks" does not hold at some sizes (F4).
- The plan-mandated `rule()` regex in the test fails on a grouped selector. This gives a false FAIL only.

### Deferred items

#### Layout and modes

| Item | Where it came from | Why it was left |
|---|---|---|
| The pinned part has no limit against the room that is left (769x601 with 30 chips; 360x560 with 50/35 leaves 72px) | Final review F4 | Only extreme characters are hit. The fix is an owner decision: mode by measured room, or a cap of the chip rows. |
| A render while the sheet is hidden uses up the scroll reset of a fallback | Final review F6 | The window is narrow: the threat load must end between a removal and the return. The fix is to keep the reset for the next visible render. |
| At 1280x481, compact mode leaves 149px for the largest character | Task 4 | The ruling limit allows it. The owner decides. |
| The low-mode tab bar has a padding of 8px 16px, not 4px | Task 4 | The buttons start at the same x in both modes. The focus ring is not clipped. |
| At 740x360 and scroll 0, the tab bar is below the first screen (46px under the fold) | Task 4 | Compact mode does the same. One flick shows it. |
| At 800x800, the test browser shows Wounds in 2 rows. The spec text says 3 rows. A classic Windows scrollbar was not in the run. | Task 4, Task 8 | The result is better than the spec text. The owner checks it on Windows Chrome with classic scrollbars. |
| The compact tab bar with a visible scrollbar adds to its height | Task 4 | No classic scrollbar in the run. The owner checks it. |
| The Notes box scroll stays after a load of another character | Fix wave concern | The page scroll acts the same way. |

#### Keyboard and accessibility

| Item | Where it came from | Why it was left |
|---|---|---|
| The Faith, Wealth and mob buttons have no `aria-label` (Faith and Wealth also have no `type="button"`) | Final review F12 | The markup is older, in a function that this branch edited. |
| The Tab flag listens on `#character-sheet-content` only | Fix wave concern | The first tab stop from above is pinned in full mode and compact mode. No case hid a control. |
| Alt+ArrowLeft and Ctrl+Home on a focused tab still select a tab | Task 3 | The WAI-ARIA example does the same. |
| The Wounds and Shock boxes have no role, name or key access | Final review, declined to judge | This is a non-goal of spec §1. Main is the same. |

#### Print

| Item | Where it came from | Why it was left |
|---|---|---|
| Older print polish: pale gold text on white (glossary terms, skill totals, the Multi-Target badge, the Potency label, the other cards), near-invisible `.ability-name` text in the follower card, low-contrast rarity and severity badges, page splits inside Traits, Skills and the follower card, an unlabeled "+1 Strength" line in the Augmetic card | Task 7 | Main is the same or worse. This is older print polish. |
| Armour prints its AR and Traits beside the name in one row | Task 7 | The cause is the same as for equipment. Main is the same, and it is readable. |
| Paper cost at margin 0: A4, the full character takes 7 pages on the branch and 6 on main. The largest empty area at a page foot is 135mm (main 117mm). | Task 7 | The cause is the older `.sheet-section { page-break-inside: avoid }` rule. At 10mm margins, both take 8 pages. |
| A minimal character puts an empty Notes block alone on page 3 | Task 7 | Main has 3 pages too (10mm margins). The cause was not traced. |
| With 10mm margins the A4 page is under 768px wide, so Stats prints in one column | Task 7 | An older rule. Main is the same. |
| A pane that has the focus at print time shows the browser ring in print | Fix wave concern | This was so before the wave. In a normal print the Print button has the focus. |

#### Imported-file safety

| Item | Where it came from | Why it was left |
|---|---|---|
| Older raw output sites that an imported file reaches: the Wealth and Faith values, the injury side, language ids, the tier, attribute and skill values (12 sites), and the weapon damage cells | Final review F13 | Main has the same sites. The durable fix is a type check in `State.loadCharacter`, which is outside this branch. |
| The Ascension card prints `targetTier` raw, so a hostile file still runs script there | Fix wave concern | This is a part of F13. It is on the owner's list with the type check. |

#### Tests

| Item | Where it came from | Why it was left |
|---|---|---|
| No committed check runs the real `render()` on real data. Every `render()` check replaces the 19 block renderers with stubs. | Final review F11 | The reviewers did it by hand. The owner decides if a test is necessary. |
| The class check `sheet-keyword` also matches `sheet-keywords` | Task 1 | The plan mandated the check. Another check counts the exact class. |
| Three `DataLoader` overrides in the test have no `finally` restore | Task 1 | Each sandbox ends with its block. |
| `makeDom` returns a new stub for `btn-print` and `btn-copy-summary` on each call | Task 1 | A test detail. |
| Two checks cannot fail for what they name (`test-sheet-tabs.js:635`, `:650`) | Task 3 | The checks beside them pin the behavior. |
| A repeated line in the Task 2 hunk (`test-sheet-tabs.js:419`) | Task 3 | No effect. |
| The named-color check has gaps (a value with no semicolon, compound names such as `darkred`, a fallback inside `var()`) | Task 4 | The section has no raw color. |
| The sandbox still supplies a no-op `MutationObserver` | Task 5 | The plan defines it. No effect. |
| The tracker-grid print check misses a grid rule in a nested `@media` or `@supports` block. It reads `screen, print` as screen-only. | Task 7 | No such block exists. |
| The check at `test-sheet-tabs.js:781` does not fail if an unqualified 1400px block is added | Task 7 | No such block exists. |
| The `rule()` regex fails on a grouped selector | Task 7 | It gives a false FAIL only. |

#### Older code seen and not changed

| Item | Where it came from | Why it was left |
|---|---|---|
| `const tier` is dead code from before Task 1 | Task 1 | The rule is to mention dead code, not to delete it. |
| At 320px the Psychic Powers pane overflows by 27px at `.sheet-power-range` (clipped) | Task 4 | Older rules. |
| `.wargear-tab-btn` renders in Arial (no `font-family: inherit`) | Task 4 | Older code, outside the sheet. |
| A character file with `skills: {}` shows "NaN / 500 XP" in the footer | Task 8 | Older, test data only. |

#### Not checked in this run

| Item | Where it came from | Why it was left |
|---|---|---|
| Firefox and Safari: sticky with `display: contents`, `scrollTop` across `display: none`, focus scroll, the edge cue | Final review; fix wave concern | Only Chromium was available. |
| Windows classic scrollbars (box wrap at 800x800, tab bar height in compact mode) | Final review | The test browser has overlay scrollbars. |
| The on-screen keyboard of a phone with the pinned bar | Final review | It cannot be emulated. |
| Screen reader speech | Final review | The reviewer checked roles, names and states only. |
| Find in page (Ctrl+F) does not find text in the six hidden panes | Final review | This is a result of the tabs design. `hidden="until-found"` is an option for the owner. |
| 18px boxes (22px pitch) in full mode on a touch tablet in landscape | Final review | Same size as main. |
| The real print dialog and the sheet scroll after it | Final review | The run used print emulation and `page.pdf`. |
| Wide screens: the Wrath counter is 1024px (1440) to 2144px (2560) to the right of the last box of a typical character | Final review | This is the grid of spec §2.2. |
| A 90-character name with no space makes the sheet scroll sideways | Final review | Same on main. |
| A deploy window of up to 10 minutes in which a cached `index.html` mixes old and new files | Final review | It is part of the cache scheme of the app. |
| `docs/` and `scripts/` go to Pages with the site | Final review | Same on main. |
| Console errors from the Turnstile frame of Cloudflare when the feedback modal opens | Final review | This is not app code. |

### Wave table

| Task | Model | Dispatches | Send-backs | Gate |
|---|---|---|---|---|
| Task 1 | sonnet | 1 | 0 | Approved |
| Task 2 | opus | 1 | 0 | Approved |
| Task 3 | sonnet | 1 | 0 | Approved |
| Task 4 | opus | 1 | 1 (plus 1 pre-review fix on a self-reported concern) | Approved after fix round 1 |
| Task 5 | sonnet | 1 | 0 | Approved |
| Task 6 | opus | 1 | 1 | Approved, then fix round 1 on two Minor items and one older raw site |
| Task 7 | sonnet | 1 | 3 (2 pre-review rulings, 1 fix round) | Needs fixes (2 Important), then addressed in round 1 |
| Task 8 | sonnet | 1 | 0 | Controller gate (ruling); 1 keyboard finding carried to the final fix wave |
| Final review | fable, xhigh | 1 | 0 | Ready to merge with fixes (0 Critical, 3 Important, 10 Minor) |
| Fix wave | opus | 1 | 1 (the arrow on the edge cue) | Re-review: all 9 items addressed, 3 Minor parked (below) |

### Result of the last re-review

The scoped re-review of the fix wave (commits `cc1f242..91cf5c4`, with the browser) found all nine items addressed and no new Critical or Important breakage. It found 3 Minor items. A comparison of the computed styles of 828 elements against `cc1f242` showed these differences only: at 360x740 the two cue pseudo-elements and the tab `transition`; in full mode and in print the tab `transition`. 33 of 38 mutations fail a check.

19. Owner can reverse: the three Minor items of the last re-review are parked, not fixed. The process has one fix wave and one re-review, and none of the three is a regression. If this is wrong, a keyboard user who goes backward from the footer into a pane can have the focus on one hidden control.

| Item | Why it was left |
|---|---|
| The Tab flag listens on `#character-sheet-content` only. Shift+Tab from the footer into a pane control that is under the pinned part gets no scroll (steps: Wargear at scroll 994, click the footer XP text, Shift+Tab, Space). | A narrow entry path. A `keydown` listener on the document closes it. Spec §6 states the limit (commit `d57cbfe`). |
| A hidden Notes box reads `scrollTop` 0. Notes scrolled, then another tab, then a tracker click, then Notes: the box shows line 1. | The same as before the fix wave. |
| Five mutations stay green: the -30px margins of the cue pseudo-elements (two forms), a Tab flag with no Shift+Tab, a transition with no `border-color`, a left tolerance of `> 0`. | Test gaps only. The browser checks cover the behavior. |

## Owner feedback wave (2026-11-14): the Wealth counter and the lines of the Traits card

The owner looked at the live sheet and asked for two changes: remove the extra horizontal lines of the Traits card, and move the Wealth counter to the Character tab. Branch `sheet-wealth-move`, commits `a223b17`, `02dca9e`, `2f2a6df` and one commit for the spec tags and this record. Creator `?v=126`. `scripts/test-sheet-tabs.js` has 279 checks.

### Rulings

20. Owner can reverse: the Wealth counter is at the foot of the Details card. The owner named the tab, not the place. If this is wrong, the cost is one markup move.
21. Owner can reverse: the Faith counter stays in the Traits card, with one line above it. The Traits card has no tracking section when the max Faith is 0. The owner did not ask to move Faith.
22. Owner can reverse: the Wealth value prints as one line directly below the Wrath line of the strip, in the same form. The remainder of the Details card does not print. Reason: the Wealth value printed before the move, and the printed strip carries the Details facts.
23. The Wealth value of the Details card goes through `escapeHtml(String())`, as the other values of the Details block do.
24. The printed Wealth label holds a hidden copy of the text "Wounds" (`::after`, print only). This gives the label the width of the label column of the strip in any font. The copy must stay equal to the widest label of the strip.
25. Process: fix round 2 (six Minor items of the task review) went first. The final whole-branch review then examined the full diff and served as the scoped re-review of that round.

### Parked items

| Item | Why it was left |
|---|---|
| Print of a character with Faith: the bottom borders of the last trait row are 5 px above the line of the Faith section, and they look like a close pair of lines. | Older print behavior (old rule `margin-top: 5px !important`), not the pair that the owner reported on screen. A print change past the request has a risk. |
| The Faith value is written with no escape (`renderTraits`), and `State.getCurrentFaith` returns the raw value of an imported file. | Older code. It belongs to the open owner decision on imported-file safety. |
| No check pins the numbers that put the printed Wealth line in its place (card padding with `!important`, card margin, the `gap` values). Four mutations pass all checks. | A test gap only. Real PDFs (A4 in two orientations, A6, Letter, two looks) show the correct place. |
| No check compares the hidden "Wounds" copy with the labels of the strip. | A comment at the rule states the dependence. |
| The base-rule check does not catch a `margin` or `padding` shorthand on `.tracker-row-horizontal`. | A test gap only. |

### Not checked

Firefox and Safari print. Only Chromium is installed.

### Wave table

| Task | Model | Dispatches | Send-backs | Gate |
|---|---|---|---|---|
| Task 1 | sonnet | 1 | 2 (1 brief defect: print; 1 fix round on 6 Minor items) | Review: spec holds, 0 Critical, 0 Important, 6 Minor; all corrected |
| Task review | opus, xhigh | 1 | 0 | 6 Minor, 7 readings |
| Final review | fable, xhigh | 1 | 0 | Ready to merge (0 Critical, 0 Important, 2 Minor: spec tags corrected by the controller, test gap parked) |

## Owner feedback wave 2 (2026-11-14): print retired, the trackers in the name card

The owner confirmed the place of the Wealth counter ("Wealth counter is in a good spot."), retired the print feature, and chose a new tracker layout from mockups. Branch `sheet-tracker-card`, commits `f983d36` (Task 1), `2a8b992`, `825a52a`, `c02b051` (Task 2), `168800e` (fix round) and one commit for the spec numbers and this record. Creator `?v=127`. `scripts/test-sheet-tabs.js` has 282 checks.

### Owner decisions

- "Printing is a feature we can deprecate and retire. Let's keep this exclusively a web app."
- "Wounds/Shock/Wrath/Faith should be on a card rather than freely floating on the sheet." After the mockups A, B, C (one row, counters left, narrow card), D1 and D2 (stacked counters), E1 and E2 (trackers as a column of the name card): "I prefer E2 the most. It might be worth splitting the card down the middle with a vertical line divider."
- "For mobile, the current layout is good overall. It could use a little spacing between the different counts (Wounds/Shock/Wrath/Faith), and the counts can be consolidated under the character information." "For mobile, a horizontal line divider can serve the same purpose."

### Rulings

26. Print retirement removes the Print button, `print()`, `exportPDF`, the print copy of the notes, the three `@media print` blocks and the print checks. Ctrl+P now gives an unformatted page. Rulings 8, 22 and 24 of this record, the print items of the deferred tables and the print decision for the owner no longer apply.
27. Owner can reverse: width selects the layout. A window wider than 768 px shows the wide layout (identity, vertical divider, tracker grid). A window 768 px wide or less shows the narrow layout (identity, horizontal divider, counts). The queries are `min-width: 768.02px` and `max-width: 768px`.
28. Owner can reverse: the divider is at the middle of the card when the tracker grid fits in the right half. The right part grows to about 58% at most.
29. Owner can reverse: the rows of boxes break evenly (16 as 8 + 8), in the wide and in the narrow layout. The narrow part was the implementer's addition and is accepted. A browser without the CSS functions (typed division: before Chrome 140, Safari 26, Firefox 158) shows the natural wrap.
30. Owner can reverse: the narrow layout keeps the pin behavior. The identity part scrolls away, and the counts part and the tab bar stay pinned. The row gap of the counts is 10 px. The narrow card has a horizontal gradient, because two parts of different heights cannot share one diagonal gradient.
31. Owner can reverse: a wide window pins the whole strip in full mode and from 481 px to 600 px high. Low mode (480 px high or less) pins only the tab bar.
32. Faith is in the strip in each layout, after Wrath in DOM and focus order, with `aria-label` attributes and an escaped value. In the narrow layout the Faith counter goes to the next row when the two counters do not fit (at 414 px and less).
33. The class `.sheet-details-section` stays as the name of the Details block, with no style rule.
34. Process: Task 2 was cut in two parts while the owner chose the layout. Part A held what the designs share. The fix round went before the final review, which also re-reviewed it.

### Parked items

| Item | Why it was left |
|---|---|
| Four rules have no check: the base box width against the wide 18 px columns; the narrow `.sheet-strip-group { display: contents }`; the wide `.sheet-tabbar { flex: 1 0 100% }`; `overflow-wrap: anywhere` on the name. | Test gaps only. The browser checks of three reviews cover the behavior. |
| A very large character in a short wide window: 50 Wounds and 35 Shock leave 31 px of pane at 769x481 and 75 px at 1280x481. Ten keyword chips leave 88 px at 769x500. | The cost of ruling 31. No real character was seen at these sizes. |
| A browser with no `cqi` (before Chrome 105, Firefox 110, Safari 16) shows the trackers half with no card background. | Old browsers. |
| The `@supports` condition does not test the one-argument `round()` that the formulas use. | No engine that was run rejects it. Chrome 140 to 146 and Safari 26.0 were not run. |
| One mixed pixel where the divider meets each gold side. The narrow tab pills are 4 px from the card edge (16 px before). | Cosmetic. |
| A viewport inside the 0.02 px band between the layouts gets no card look; the guard keeps the boxes in rows. | Firefox can give 768.0167 px at some zoom values, by calculation. |

### Not checked

Classic scrollbars (headless Chromium has overlay scrollbars). Real phones and tablets: the owner tests these on the live site. The final review measured Chrome 147 and 158, Firefox 159 and WebKit 27.2.

### Wave table

| Task | Model | Dispatches | Send-backs | Gate |
|---|---|---|---|---|
| Mockups (spike, 3 rounds) | opus | 1 | 2 (owner asked for D, then E) | 5 stitched images; branch not merged |
| Task 1 Print retirement | sonnet | 1 | 0 | Review: spec holds, 0 Critical, 0 Important, 1 Minor (ruled, kept) |
| Task 2 Tracker layout | opus | 1 | 3 (scope cut to Part A; Part B after the owner's choice; fix round on 7 Minor) | Review: spec met, 0 Critical, 0 Important, 7 Minor; all corrected |
| Task reviews | opus, xhigh | 2 | 0 | Task 1: 1 Minor, 9 readings. Task 2: 7 Minor |
| Final review | fable, xhigh | 1 | 0 | Ready to merge (0 Critical, 0 Important, 2 Minor: spec numbers corrected by the controller, test gaps parked) |
