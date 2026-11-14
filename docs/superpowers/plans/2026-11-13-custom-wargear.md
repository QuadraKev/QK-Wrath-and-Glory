# Custom Wargear Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the creator, the player can create, edit and remove a custom weapon, armour, augmetic or Other item, and the item then works like book wargear everywhere (issue #33).

**Architecture:** The full item record lives on its wargear entry as `entry.custom`, with a reserved id `custom_<8 base-36 chars>`. `DataLoader.getWeapon` / `getArmor` / `getEquipment` return that record for a `custom_` id of the current character, so every existing consumer works with no change. A new global module `CustomWargear` (`creator/js/custom-wargear.js`) holds the pure record helpers (build, validate, normalize, format) and the builder modal; `State` gets two mutators, a normalize pass in `loadCharacter`, and a custom-item-preserving archetype reset.

**Tech Stack:** Vanilla JS (global-object modules, no build step), static HTML/CSS, Node `vm`-sandbox test scripts.

**Spec:** `docs/superpowers/specs/2026-11-13-custom-wargear-design.md` (approved). Its line numbers and the ones in this plan are for `main`. Branch `custom-wargear` is cut from `main` after the data branch `glossary-missing-traits` (D3) and a small bestiary fix merge; neither touches a creator JS file this plan cites, so the line numbers hold.

## Global Constraints

- Branch `custom-wargear`, tasks in order, one commit per task (more is fine), no push.
- Commit command: `git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "<short plain sentence> (#33)"`. No attribution or co-author lines.
- Vanilla JS, one `const PascalCase = {…}` global per file, no `import`/`export`, no classes, no IIFEs, no new dependency, no build step (`STYLE_GUIDE.md`).
- New CSS uses the `STYLE_GUIDE.md` CSS variables only, no raw colours, in `creator/css/styles.css` under a `/* ===== Custom Wargear Builder ===== */` section.
- New DOM ids and CSS classes use the prefix `custom-item-`. The prefix `custom-wargear-` is taken by the custom-archetype starting-wargear UI (`creator/css/styles.css:2493-2531`, `archetype-tab.js:457`). The two exceptions follow the existing `btn-` names of the Wargear tab: the class `btn-edit-custom` (spec §3.6, Task 8) and the id `btn-build-custom` (Task 7).
- Tests are plain Node scripts: `node scripts/test-<name>.js`, a `vm` sandbox with hand-written stubs, the `check(name, actual, expected)` helper, exit code 1 on any failure. Write the test first, run it and see it fail, then implement.
- Shared test helpers, defined once at the top of `scripts/test-custom-wargear.js` by Task 1 and used by every later task:
  - `check(name, actual, expected)` — compares `JSON.stringify` of both, prints PASS/FAIL, counts failures.
  - `canon(value) -> value` — deep copy with object keys sorted; wrap both sides of a record comparison in it.
  - `DATA` — object of the parsed `weapons.json`, `armor.json`, `equipment.json`, `glossary.json`, `talents.json`, `weapon-upgrades.json`, keyed by file name.
  - `creatorSandbox(globals: object) -> vm.Context` — new context with `console` plus `globals`, the real `creator/js/data-loader.js` run into it, and `DataLoader.cache = DATA`.
  - `load(ctx, rel)` — runs the source file at repo-relative path `rel` into `ctx`.
  - `get(ctx, name) -> any` — `vm.runInContext(name, ctx)` (reads a `const` global such as `DataLoader`).
  - `ROOT`, `readJson(rel)`, `readSource(rel)` — repo root path and file readers.
- Every task ends green: `for f in scripts/test-*.js; do node "$f" > /dev/null || echo "FAIL $f"; done` prints nothing, and the app loads with no console error (serve the repo root of the branch with `python3 -m http.server 8137`, open `http://localhost:8137/creator/`, hard-reload).
- No test may hard-code the glossary trait counts (42, 8) or assume that `Haywire`, `Volatile` or `Bulky` are absent from the glossary lists: a separate data task (D3) adds them.
- Cache busting: the new `<script>` tag uses the `?v=` value that `creator/index.html` holds when Task 2 runs (read it from the file; expected `?v=122` after the data branch). Task 9 sets every `?v=` in `creator/index.html` to that value + 1 together, once (expected `?v=123`, 35 tags). `bestiary/`, `data/`, `shared/` and `creator/js/web-api.js` do not change (the check is `git diff --stat $(git merge-base main HEAD) -- creator/js/web-api.js` prints nothing).
- Touch only what a task needs; no cleanups of adjacent code. `creator/tabs/character-sheet-tab.js` changes stay inside the existing render functions plus the new small helpers named here (issue #25 restructures that file later).
- Text safety (spec §5): store player text as typed; escape at output. Every HTML site that can show a custom item's `name`, `description`, `effect`, `traits`, `keywords`, stat line or bonus source escapes it with the five-character `escapeHtml` (`&` `<` `>` `"` `'`). Text outputs (copy as text, Markdown) write raw text.
- Limits (spec §3.2): name 1–80 chars; damage 0–30; ED 0–20; AP -10–10; melee range (`reach`) 1–50, optional; ranged range three integers 1–999, required, short ≤ medium ≤ long; salvo 0–20 (default 1); AR 0–20; traits ≤ 20, list rating 1–30 chars, typed trait 1–60 chars; effect ≤ 500; keywords ≤ 20, each 1–40 chars; description ≤ 2000; value 0–30, optional; rarity one of `Common`, `Uncommon`, `Rare`, `Very Rare`, `Unique`, optional; bonus value integer -10–10 except 0, or `"rank"` / `"doubleRank"`; integers only, no dice.
- Bonus keys (spec §3.5), in this order: `strength`, `toughness`, `agility`, `initiative`, `willpower`, `intellect`, `fellowship`, `speed`, `defence`, `resilience`; labels `Strength` … `Fellowship`, `Speed`, `Defence`, `Resilience`.

## Review Focus

- Number inputs typed as ` 3 `, `+3`, `1.5`, `1d3`, `−2` (Unicode minus) or blank: integers only, with surrounding spaces and a leading `+`/`-` accepted, everything else blocks Save; a stored non-integer repairs to the default. Every number field is `type="text" inputmode="numeric"`, so `validateForm` sees the typed text (a `type="number"` input would hand it `""` for `--2` and an optional field would save blank). Pinned by Task 2 (`parseIntStrict` and `validateForm` checks) and Task 9 browser step 3 (`--2` in Value).
- Typing in a text field of the builder: the field keeps focus and caret after each key; only a kind/type change or a chip add/remove re-renders the body. Task 7 `bind()` routes typing to `refresh()`, not `render()`; only Task 9 browser step 3 tests it.
- A save with malformed wargear (`wargear` not an array, a `null` entry, a `custom_` entry with no `custom`): load does not throw and never changes the entry count. Pinned by Task 4 checks.
- Edit of an item whose text holds `"`, `'`, `<`, `</textarea>` or `$&`: the form prefills it exactly and a Save with no change stores the same record. Pinned by Task 7 (`bodyHtml` escape check and `formFromRecord` round trip).
- `glossary.json` not loaded: the trait picker offers no list but the typed-trait box still works, and normalize keeps traits as typed. Pinned by Task 2 and Task 3 checks with an empty cache.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `creator/js/data-loader.js` | modify | `getCustomRecord`, kind-routed `getWeapon`/`getArmor`/`getEquipment`, `'custom': 'Custom'` source name |
| `creator/js/custom-wargear.js` | create | `CustomWargear`: constants, pure record helpers (Tasks 2–3), escape helpers (Task 5), modal and form operations (Task 7) |
| `creator/js/state.js` | modify | `addCustomItem`, `updateCustomItem`, normalize in `loadCharacter`, custom-keeping `setCustomArchetype` |
| `creator/tabs/character-sheet-tab.js` | modify | five-char `escapeHtml`, escaped item text, Range/Salvo cell, custom branch in `copySummary` |
| `creator/tabs/wargear-tab.js` | modify | five-char `escapeHtml`, escaped names, Custom Wargear card, custom row info and Edit |
| `creator/tabs/talents-tab.js` | modify | new `escapeHtml`, escaped item-name choice |
| `creator/js/character-io.js` | modify | custom branch in `createCharacterSheet` |
| `creator/css/styles.css` | modify | builder form styles |
| `creator/index.html` | modify | new script tag at the current `?v=` (Task 2), all tags + 1 (Task 9) |
| `scripts/test-custom-wargear.js` | create | all checks of spec §6.1, one section per task |

---

### Task 1: Resolver in DataLoader

**Model:** sonnet

**Files:**
- Modify: `creator/js/data-loader.js:101-117` (`getWeapon`, `getArmor`, `getEquipment`), `:319-331` (`sourceDisplayNames`)
- Create: `scripts/test-custom-wargear.js`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `DataLoader.getCustomRecord(id: any) -> object | undefined` — spec §2.2 steps 1–3; returns the stored `entry.custom` object itself (no copy).
  - `DataLoader.getWeapon(id)` → the custom record if its `kind === 'weapon'`; `getArmor` for `'armor'`; `getEquipment` for `'augmetic'` or `'other'`. For any id that starts with `custom_` these return `undefined` otherwise and never search the data cache. `getWargearItem` unchanged.
  - `DataLoader.sourceDisplayNames.custom === 'Custom'`.
  - Test-file helpers that later tasks reuse (top of `scripts/test-custom-wargear.js`): `ROOT`, `readJson(rel)`, `readSource(rel)`, `check(name, actual, expected)` (as in `scripts/test-improvised.js:12-17`), `canon(value)` (deep copy with object keys sorted, for record comparisons), `DATA` (object of parsed `weapons.json`, `armor.json`, `equipment.json`, `glossary.json`, `talents.json`, `weapon-upgrades.json`), `creatorSandbox(globals) -> context` (new `vm` context with `console` plus `globals`, runs the real `creator/js/data-loader.js` and sets `DataLoader.cache` to `DATA`), `load(ctx, rel)` (runs a source file into a context), `get(ctx, name)` (`vm.runInContext(name, ctx)`). The file ends with the pass/fail summary and `process.exit(failures === 0 ? 0 : 1)`; later tasks add sections above that end. Each section's checks sit in a `{ … }` block so local names (`DL`, `CS`, contexts) do not clash; each task declares at file scope the shared fixtures that it lists in its own Produces block.

- [ ] **Step 1: Write the failing test**

Create `scripts/test-custom-wargear.js` with the helpers above and these sections.

```js
// --- data guard ---
for (const f of ['weapons.json', 'armor.json', 'equipment.json'])
    check(`no id in ${f} starts with custom_`, DATA[f].some(r => String(r.id).startsWith('custom_')), false);

// --- resolver ---
const rctx = creatorSandbox({ State: { character: { wargear: [] } } });
const DL = get(rctx, 'DataLoader'), RS = get(rctx, 'State');
const ID = 'custom_same0001';
for (const kind of ['weapon', 'armor', 'augmetic', 'other']) {
    const record = { kind, id: ID, name: `A ${kind}` };
    RS.character.wargear = [{ id: 'chainsword', isStarting: false }, { id: ID, isStarting: false, custom: record }];
    check(`getWeapon on a custom ${kind}`, DL.getWeapon(ID), kind === 'weapon' ? record : undefined);
    check(`getArmor on a custom ${kind}`, DL.getArmor(ID), kind === 'armor' ? record : undefined);
    check(`getEquipment on a custom ${kind}`, DL.getEquipment(ID), ['augmetic', 'other'].includes(kind) ? record : undefined);
    check(`getWargearItem returns the stored custom ${kind} object`, DL.getWargearItem(ID) === record, true);
    check(`getAll* never hold the custom ${kind}`,
        [DL.getAllWeapons(), DL.getAllArmor(), DL.getAllEquipment()].some(list => list.includes(record)), false);
}
check('an unknown custom_ id gives undefined', DL.getWargearItem('custom_nothere1'), undefined);
RS.character.wargear = [{ id: 'custom_nocustom', isStarting: false }];
check('a custom_ id on an entry with no custom gives undefined', DL.getWargearItem('custom_nocustom'), undefined);
check('a book id gives the book record', DL.getWeapon('chainsword').name, 'Chainsword');
const noState = creatorSandbox({});
check('with no State, a custom_ id gives undefined', get(noState, 'DataLoader').getWargearItem(ID), undefined);
check('custom source prints "Custom"', DL.formatSourcePage({ source: 'custom' }), 'Custom');
```

Then a derived-stats section: a new `creatorSandbox({ State: { character } })` with the real `creator/js/derived-stats.js` loaded, where `character = { rank: 3, attributes: {strength 3, toughness 3, agility 3, initiative 3, willpower 3, intellect 3, fellowship 3}, skills: {}, talents: [], mutations: [], wargear }` and the custom records are written by hand in the spec §2.3 shapes:

```js
check('a custom armour with AR 5 is the best armour', DS.getArmorBreakdown(c).bestArmorAR, 5);       // wargear: flak_armour + custom armour ar 5
check('a custom Shield-trait item counts as shield AR', DS.getArmorBreakdown(c).shieldAR, 2);        // custom armour ar 2, traits ['Shield']
check('the §2.5 augmetic lists its Strength bonus', DS.getEquipmentBonuses(c).strength, [{ value: 1, source: 'Hydraulic Spine' }]);
check('the §2.5 augmetic lowers Agility by 1', DS.getEffectiveAttribute(c, 'agility'), 2);
check('a "rank" Resilience bonus at rank 3 adds 3', DS.getEquipmentBonusTotal(c, 'resilience'), 3);  // custom augmetic bonuses { resilience: 'rank' }
check('an Other item adds nothing', JSON.stringify(DS.getEquipmentBonuses(otherOnly)), '{}');       // otherOnly: one custom Other, no bonuses
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/test-custom-wargear.js`
Expected: exit 1. Red: every check that expects a custom record (the `getWeapon`/`getArmor`/`getEquipment`/`getWargearItem` checks that expect `record`), the "Custom" source check, and the first five derived-stats checks. Green already (guards that must stay green): the data guard, the checks that expect `undefined`, the `getAll*` checks, the book-id check, and "an Other item adds nothing".

- [ ] **Step 3: Implement the resolver in `creator/js/data-loader.js`**

Add `getCustomRecord(id)` beside the getters, following spec §2.2 exactly (string + `startsWith('custom_')` guard, `typeof State !== 'undefined' && State.character` guard, first entry with `entry.id === id` and a plain-object `entry.custom`; tolerate a non-array `wargear`). In each of the three getters, a `custom_` id returns the record only when its `kind` matches and returns before the book lookup. Add `'custom': 'Custom'` to `sourceDisplayNames`. Add a one-line comment that the resolver reads `State` at call time.

- [ ] **Step 4: Run all tests**

Run: `for f in scripts/test-*.js; do node "$f" > /dev/null || echo "FAIL $f"; done`
Expected: no output. Then load the app (Global Constraints): no console error.

- [ ] **Step 5: Commit**

```bash
git add creator/js/data-loader.js scripts/test-custom-wargear.js
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Resolve custom wargear ids from the character in DataLoader (#33)"
```

---

### Task 2: The record contract — form, build, validate, normalize

**Model:** opus — the load-repair rules decide what every old or hand-edited save becomes; one validation path feeds Save, add, update and load.

**Files:**
- Create: `creator/js/custom-wargear.js`
- Modify: `creator/index.html:533` (add `<script src="js/custom-wargear.js?v=N"></script>` on the line after `js/improvised-builder.js`, where `N` is the value the other tags in the file hold now: read it with `grep -o '?v=[0-9]*' creator/index.html | sort -u`, which must print one value, expected `?v=122`)
- Test: `scripts/test-custom-wargear.js` (new section)

**Interfaces:**
- Consumes: `DataLoader.cache['glossary.json']` (`weaponTraits`, `armorTraits`: objects of `{ name, source, page, description }`).
- Produces (all on `CustomWargear`, none touch the DOM):
  - Constants: `KINDS = ['weapon', 'armor', 'augmetic', 'other']`, `RARITIES` (the five, in book order), `BONUS_KEYS` and `BONUS_LABELS` (Global Constraints order and labels), `LIMITS` (object with the Global Constraints numbers; later tasks read it, do not repeat numbers).
  - `parseIntStrict(value: any) -> number | null` — `String(value).trim()` must match `/^[+-]?\d+$/`, else `null`.
  - `newId(usedIds: Set<string>) -> string` — `custom_` + 8 chars from `[a-z0-9]` (`Math.random`), not in `usedIds`. Does not add to the set.
  - `emptyForm() -> Form` with exactly these keys and defaults: `editIndex: null, kind: 'weapon', weaponType: 'melee', name: '', damage: '0', ed: '0', ap: '0', reach: '', rangeShort: '', rangeMedium: '', rangeLong: '', salvo: '1', ar: '0', weaponTraits: [], armorTraits: [], effect: '', bonuses: [], keywords: [], description: '', value: '', rarity: '', traitPick: '', traitRating: '', typedTrait: '', keywordInput: ''`. Numeric fields hold input strings; `bonuses` is `[{ key: string, value: string }]` where `value` is an integer string, `'rank'` or `'doubleRank'`. The last four keys are UI-only (Task 7).
  - `traitNames(kind: 'weapon'|'armor') -> string[]` — names of `weaponTraits` / `armorTraits`, sorted with `localeCompare`; `[]` when the glossary is not loaded.
  - `normalizeTrait(text: string, kind) -> string` — trim; if the name part (before the first `(`, trimmed) equals a `traitNames(kind)` name ignoring case, return the list spelling, plus `' ' + '(' + rest` when a parenthesised part exists (`rad (2)` → `Rad (2)`, `rad(2)` → `Rad (2)`, `shield` → `Shield`); otherwise return the trimmed text.
  - `buildRecord(form: Form) -> object` — the spec §2.3 record of the selected kind and weapon type, **without `id`** (the id comes from State, Task 4). Trims strings; parses numbers with `parseIntStrict`; `traits` from `weaponTraits` or `armorTraits`; `bonuses` object from the rows (`'rank'`/`'doubleRank'` kept as strings), key absent when there are no rows; `value`/`rarity` keys only when not blank; Other always `effect: ''`, `keywords: []`; `source: 'custom'`. Assumes a form that `validateForm` passed.
  - `validateForm(form: Form) -> { [field: string]: string }` — one short message per invalid field of the selected kind/type; `{}` when valid. Field keys: `name`, `damage`, `ed`, `ap`, `reach`, `range`, `salvo`, `ar`, `traits`, `effect`, `bonuses`, `keywords`, `description`, `value`, `rarity`. A blank numeric field that has a default (`damage`, `ed`, `ap`, `salvo`, `ar`) is invalid; blank `reach`, `value`, `rarity` are valid. Bonus rows: blank key, repeated key, or invalid value → `bonuses`.
  - `formFromRecord(record) -> Form` — the inverse of `buildRecord` for the Edit prefill (numbers back to strings, `bonuses` object back to rows, absent keys back to the `emptyForm` defaults).
  - Test fixtures at file scope in `scripts/test-custom-wargear.js` (later tasks use these names): `cwctx` (this section's context, `creatorSandbox({})` with `custom-wargear.js` loaded; its `DataLoader` is `get(cwctx, 'DataLoader')`), `CW` (`get(cwctx, 'CustomWargear')`), `F(o)` (`{ ...CW.emptyForm(), ...o }`), the forms `xenotech`, `spine`, `ranged`, `armour`, `other` (as in Step 1), `xenotechRecord`, `spineRecord`, `rangedRecord`, `armourRecord`, `otherRecord` (their `buildRecord` results), and `xenotechRecordWithId` / `spineRecordWithId` (the first two plus `id: 'custom_k3v9q2xa'` / `'custom_p7d2m0zt'`).
  - `normalizeEntry(entry: object, usedIds: Set<string>) -> boolean` — applies spec §2.8 rules 2–7 in place to a wargear entry, then adds `entry.id` to `usedIds`; returns `true` when anything changed (compare `JSON.stringify(canonical)` of the entry before and after, with keys sorted, so key order alone is not a change). Does not log; the caller logs (rule 8). Repairs the spec leaves open, settled here: empty name → `"Unnamed custom item"`; weapon `type` not `melee`/`ranged` → `"melee"`; a ranged `range` that is not an object of three integers → the `range` key is removed (each valid value is clamped to 1–999; order is not repaired); a `reach` that is not an integer → key removed, else clamped 1–50; `value` not an integer → removed, else clamped 0–30; `rarity` not in `RARITIES` → removed; traits: strings only, `normalizeTrait`, cut to 60 chars, exact duplicates removed, at most 20.

- [ ] **Step 1: Write the failing test**

Section `// --- record contract ---` in the context `cwctx` (`creatorSandbox({})` with `creator/js/custom-wargear.js` loaded); `CW = get(cwctx, 'CustomWargear')`. Use `check(name, canon(actual), canon(expected))` for records. Required checks (spec values):

```js
const F = (o) => ({ ...CW.emptyForm(), ...o });   // file scope, with CW and the fixtures below
const xenotech = F({ name: 'Xenotech Blade', damage: '4', ed: '4', reach: '2', weaponTraits: ['Agonising', 'Rad (2)'] });
// spec §2.4 custom minus id:
check('Xenotech form builds the §2.4 record', canon(CW.buildRecord(xenotech)), canon({ kind: 'weapon', name: 'Xenotech Blade', type: 'melee', description: '',
    damage: { base: 4, attribute: 'strength', bonus: 0 }, ed: 4, ap: 0, reach: 2, traits: ['Agonising', 'Rad (2)'], keywords: [], source: 'custom' }));
const spine = F({ kind: 'augmetic', name: 'Hydraulic Spine', description: 'A salvaged spinal frame bolted to the vertebrae.',
    effect: '+1 Strength, -1 Agility.', bonuses: [{ key: 'strength', value: '1' }, { key: 'agility', value: '-1' }], keywords: ['IMPERIUM'], rarity: 'Rare' });
// expected: spec §2.5 custom minus id
```

Then declare `const xenotechRecord = CW.buildRecord(xenotech)` and the other fixtures of the Produces block. Further checks, one each: the `ranged` form (`weaponType: 'ranged', name: 'Las', damage '7', ed '1', rangeShort/Medium/Long '12'/'24'/'36', salvo '2', reach '3'`) gives `range {12,24,36}`, `salvo: 2`, `damage.attribute: null`, no `reach`; a melee form with range fields filled gives no `range`/`salvo`; the `armour` form (`kind: 'armor', name: 'Plate', damage: '5', ar: '4', armorTraits: ['Shield'], weaponTraits: ['Rad (2)']`) gives `ar: 4, traits: ['Shield']` and no `type`/`damage`/`ed`/`ap`; augmetic with no rows has no `bonuses` key; the `other` form (`kind: 'other', name: 'Lucky Coin', keywords: ['X']`) gives `category: 'Other', effect: '', keywords: []` and no `bonuses`; blank value/rarity give no keys, `value: '5', rarity: 'Rare'` give `value: 5, rarity: 'Rare'`; `formFromRecord(buildRecord(f))` then `buildRecord` again equals the first record for the Xenotech, ranged, armour, §2.5 and Other forms.

`parseIntStrict`: `' 3 '`→3, `'+3'`→3, `'-2'`→-2, `'1.5'`, `'1d3'`, `'−2'` (U+2212), `''`, `null` → `null`.

`validateForm` (compare `Object.keys(...)`): `emptyForm()` → `['name']`; Xenotech → `[]`; damage `'1.5'`, `'1d3'`, `'31'`, `''` → `['damage']` each; ap `'-10'` → `[]`, `'-11'` → `['ap']`; reach `'0'`, `'51'` → `['reach']`; ranged range `24/12/36` → `['range']`, blank short → `['range']`; salvo `'21'` → `['salvo']`; name of 81 chars and `'   '` → `['name']`; bonus rows `[{key:'',value:'1'}]`, `[{key:'strength',value:'0'}]`, `[{key:'strength',value:'11'}]`, two `strength` rows → `['bonuses']`, `[{key:'resilience',value:'rank'}]` → `[]`; value `'31'` → `['value']`; rarity `'Legendary'` → `['rarity']`; description 2001 chars → `['description']`; effect 501 chars → `['effect']`; an armour form with `damage: 'x'` → `[]` (hidden fields are not validated).

`normalizeEntry` — one check per §2.8 rule, each on a fresh entry; also assert `true` is returned for each repair and `false` for an already-normal Xenotech entry (`{ id: 'custom_k3v9q2xa', isStarting: false, custom: { ...§2.4 } }`):
- `custom: 'oops'` → `custom.kind === 'other'`, `name === 'Unreadable custom item'`.
- `kind: 'sword'` → `'other'`, `category: 'Other'`.
- ED `99` → 20; ED `'abc'` → 0; damage `{ base: -5 }` → base 0; salvo `-3` → 0; reach `'x'` → no `reach`; value `99` → 30; rarity `'Mythic'` → no `rarity`; ranged range `{ short: 5 }` → no `range`.
- name of 200 chars → 80 chars; description of 3000 → 2000.
- keywords `['imperium', ' Imperium ', 'x'.repeat(50), 7]` → `['IMPERIUM', 'X'.repeat(40)]`.
- armour traits `['shield', 'Shield', 'bulk (2)']` → `['Shield', 'Bulk (2)']`; weapon traits `[' rad (2) ']` → `['Rad (2)']`; `['Xenos Venom (2)']` stays.
- augmetic bonuses `{ wounds: 1, strength: 0, toughness: 99, agility: 'lots', resilience: 'rank', speed: -2 }` → `{ resilience: 'rank', speed: -2 }`; `{ wounds: 1 }` → no `bonuses` key; `bonuses` on an Other and on a weapon → removed.
- id `'chainsword'` and a second entry reusing the first one's id (same `usedIds` set) → each gets a new id matching `/^custom_[a-z0-9]{8}$/`, all ids distinct, and `custom.id === entry.id`.
- `relic`, `improvised` removed from any kind; `upgrades`, `equipped` removed from an armour and kept on a weapon.
- With the glossary removed from the cache (`get(cwctx, 'DataLoader').cache['glossary.json'] = undefined`), `traitNames('weapon')` is `[]` and traits `['rad (2)']` stay `['rad (2)']`; restore the cache after.

`newId`: 50 calls with a growing `usedIds` set all match `/^custom_[a-z0-9]{8}$/` and are distinct; a call never returns an id already in the set.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/test-custom-wargear.js`
Expected: exit 1 with an error that `creator/js/custom-wargear.js` does not exist (ENOENT).

- [ ] **Step 3: Implement the constants and helpers in `creator/js/custom-wargear.js`**

File header comment: what the module is and that the pure helpers touch no DOM so Node tests load the file. Sections in style-guide order: constants, (lifecycle and rendering come in Task 7), pure helpers. Add the script tag to `creator/index.html`.

- [ ] **Step 4: Run all tests**

Run: `for f in scripts/test-*.js; do node "$f" > /dev/null || echo "FAIL $f"; done`
Expected: no output. Then load the app: no console error, and `CustomWargear.newId(new Set())` in the console returns a `custom_` id.

- [ ] **Step 5: Commit**

```bash
git add creator/js/custom-wargear.js creator/index.html scripts/test-custom-wargear.js
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Add the custom wargear record helpers (#33)"
```

---

### Task 3: Display helpers — rated traits, stat line, text lines

**Model:** sonnet

**Files:**
- Modify: `creator/js/custom-wargear.js`
- Test: `scripts/test-custom-wargear.js` (new section)

**Interfaces:**
- Consumes: Task 2 `traitNames`, `BONUS_LABELS`; `DataLoader.getAllWeapons()`, `getAllArmor()`; Task 2 test fixtures `cwctx`, `CW`, `xenotechRecord`, `spineRecord`, `rangedRecord`, `armourRecord`, `otherRecord`.
- Produces (pure, plain text, unescaped):
  - `ratedTraits(kind: 'weapon'|'armor') -> string[]` — names in `traitNames(kind)` that appear as `"<Name> (<anything>)"` in the `traits` of at least one record of `getAllWeapons()` / `getAllArmor()`; sorted.
  - `formatBonuses(bonuses: object|undefined) -> string` — entries in object order joined by `', '`: integer → `+1 Strength` / `-1 Agility`; `'rank'` → `+Rank Resilience`; `'doubleRank'` → `+Double Rank Speed`; `''` when none.
  - `typeLabel(record) -> string` — `Melee Weapon`, `Ranged Weapon`, `Armor`, `Augmetic`, `Other`.
  - `formatStatLine(record) -> string`, parts joined by `' • '`, traits joined by `', '` or `-` when none:
    - melee: `Damage (S) +4 • ED 4 • AP 0 • Range 2m • Agonising, Rad (2)`; with no `reach` the `Range` part is left out.
    - ranged: `Damage 7 • ED 1 • AP -1 • Range 12/24/36m • Salvo 2 • Rapid Fire (2)`; with no `range`: `Range -`.
    - armour: `AR 4 • Shield`.
    - augmetic: the effect (if not blank), then `Bonuses: <formatBonuses>` (if any); `''` when both are absent.
    - other: `''`.
  - `textLines(record) -> string[]` — for copy as text and Markdown (spec §4.2): `- <name> (Custom)`; then `    <formatStatLine>` if not empty; then `    Keywords: A, B` if any keywords; then each description line (split on `/\r?\n/`) indented by four spaces, if the description is not blank.

- [ ] **Step 1: Write the failing test**

```js
const rw = CW.ratedTraits('weapon'), ra = CW.ratedTraits('armor');
check('weapon rated traits hold Rad, Rending, Blast, Inflict', ['Rad', 'Rending', 'Blast', 'Inflict'].every(n => rw.includes(n)), true);
check('weapon rated traits leave out Agonising and Brutal', ['Agonising', 'Brutal'].some(n => rw.includes(n)), false);
check('armour rated traits hold Bulk, not Shield', [ra.includes('Bulk'), ra.includes('Shield')], [true, false]);
check('every rated weapon trait is in the weapon list', rw.every(n => CW.traitNames('weapon').includes(n)), true);
check('every rated armour trait is in the armour list', ra.every(n => CW.traitNames('armor').includes(n)), true);
check('Xenotech stat line', CW.formatStatLine(xenotechRecord), 'Damage (S) +4 • ED 4 • AP 0 • Range 2m • Agonising, Rad (2)');
check('§2.5 augmetic stat line', CW.formatStatLine(spineRecord), '+1 Strength, -1 Agility. • Bonuses: +1 Strength, -1 Agility');
check('Other stat line is empty', CW.formatStatLine(otherRecord), '');
check('rank bonuses print as +Rank', CW.formatBonuses({ resilience: 'rank', speed: 'doubleRank' }), '+Rank Resilience, +Double Rank Speed');
check('Xenotech text lines', CW.textLines({ ...xenotechRecord, description: 'Line one\nLine two', keywords: ['XENOS'] }), [
    '- Xenotech Blade (Custom)', '    Damage (S) +4 • ED 4 • AP 0 • Range 2m • Agonising, Rad (2)', '    Keywords: XENOS', '    Line one', '    Line two']);
```

Also: `rangedRecord` → `'Damage 7 • ED 1 • AP 0 • Range 12/24/36m • Salvo 2 • -'`; a melee record with no `reach` and no traits → `'Damage (S) +0 • ED 0 • AP 0 • -'`; an armour `{ ar: 4, traits: ['Shield'] }` → `'AR 4 • Shield'`; an augmetic with no effect and no bonuses → `''`; Other text lines with a description → `['- <name> (Custom)', '    <line>']`; `typeLabel` for all five shapes; with the glossary removed from the cache of `get(cwctx, 'DataLoader')`, `ratedTraits('weapon')` is `[]`; restore the cache after the check (`cache['glossary.json'] = DATA['glossary.json']`), because Task 7's checks use the glossary.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/test-custom-wargear.js`
Expected: exit 1, `CW.ratedTraits is not a function`.

- [ ] **Step 3: Implement the five helpers in `creator/js/custom-wargear.js`** (pure-helper section).

- [ ] **Step 4: Run all tests**

Run: `for f in scripts/test-*.js; do node "$f" > /dev/null || echo "FAIL $f"; done`
Expected: no output; app loads with no console error.

- [ ] **Step 5: Commit**

```bash
git add creator/js/custom-wargear.js scripts/test-custom-wargear.js
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Add the custom wargear stat line and text helpers (#33)"
```

---

### Task 4: State — add, update, load, custom archetype reset

**Model:** opus — the archetype reset remaps stored talent indices, and the load pass must never drop or reorder an entry.

**Files:**
- Modify: `creator/js/state.js:139-167` (`loadCharacter`), `:400-406` (`setCustomArchetype`), after `:787` (new mutators after `updateImprovisedWargear`)
- Test: `scripts/test-custom-wargear.js` (new section)

**Interfaces:**
- Consumes: Task 2 `CustomWargear.newId`, `CustomWargear.normalizeEntry`; Task 1 resolver; `DataLoader.getTalent(id).choiceType`; Task 2 test fixtures `CW`, `xenotech`.
- Produces:
  - `State.addCustomItem(record: object) -> number` — `id = newId(ids of all entries)`; pushes `{ id, isStarting: false, custom: record }`; runs `normalizeEntry` on it; `notifyListeners('wargear', id)`; returns the new index.
  - `State.updateCustomItem(wargearIndex: number, record: object) -> boolean` — `false` and no change when the index is out of range, the entry has no `custom`, or `record.kind !== entry.custom.kind`. Else replaces `entry.custom` with `record` (id kept: `record.id = entry.id`), sets `entry.upgrades = []` when the weapon `type` changed, runs `normalizeEntry` with the ids of the other entries, notifies `'wargear'`, returns `true`.
  - `loadCharacter(data)`: after the merge and before `notifyListeners('load')`, when `Array.isArray(this.character.wargear)`, walk the entries in order with one `usedIds` set; an entry that is not a plain object is skipped; an entry that has a `custom` key or an id that starts with `custom_` goes through `CustomWargear.normalizeEntry(entry, usedIds)`, and a `true` result logs one `console.warn` naming the entry index. No `CustomWargear` reference runs when no entry qualifies (`scripts/test-notes.js` loads `state.js` without it).
  - `setCustomArchetype()`: keeps `this.character.wargear.filter(w => w && w.custom)` in order instead of `[]`, then remaps talent choices per spec §2.7: for each talent entry that is an object whose `DataLoader.getTalent(id)?.choiceType` is `weapon_owned` or `armor_owned`, an old index of a kept entry becomes its new index, any other value becomes `null`. The new index keeps the old value's type (`'3'` → `'1'`, `3` → `1`). Other talents are not touched. The rest of the method is unchanged.

- [ ] **Step 1: Write the failing test**

State context in the pattern of `scripts/test-notes.js:18-38` (stubbed `localStorage`, no-op timers, `followers.js` first), plus the real `data-loader.js` (cache = `DATA`) and `custom-wargear.js`, then `state.js`. Count `console.warn` calls with a wrapper `console` object in the sandbox. Checks:

```js
State.character = State.createNewCharacter();
const i = State.addCustomItem(CW.buildRecord(xenotech));
const e = State.character.wargear[i];
check('addCustomItem pushes one entry', State.character.wargear.length, 1);
check('addCustomItem gives a fresh custom id', /^custom_[a-z0-9]{8}$/.test(e.id) && e.custom.id === e.id && e.isStarting === false, true);
check('the resolver finds the new item', DL.getWeapon(e.id).name, 'Xenotech Blade');
const j = State.addCustomItem(CW.buildRecord(xenotech));
check('two adds give two ids', State.character.wargear[j].id !== e.id, true);
```

Further checks: `updateCustomItem(i, melee record with name 'Renamed')` keeps `e.id`, sets the name, keeps `e.upgrades = ['x']`; the same with a ranged record clears `upgrades` to `[]`; an armour record returns `false` and leaves the entry unchanged; an out-of-range index returns `false`. `loadCharacter(JSON.parse(JSON.stringify(State.character)))` gives `canon` `wargear` equal to the saved one and 0 warnings. `loadCharacter({ wargear: [{ id: 'chainsword' }, { id: 'bad id', custom: 'oops' }, { id: 'custom_x', isStarting: false }] })`: length stays 3, entry 0 unchanged, entry 1 has `custom.name === 'Unreadable custom item'` and a valid new id, entry 2 gets a `custom` of kind `other`, 2 warnings. `loadCharacter({ wargear: [null, { id: 'chainsword' }] })` and `loadCharacter({ wargear: {} })` do not throw and leave `wargear` as given.

Custom archetype reset (stub `State.resetStats = () => {}`; real talent data): wargear `[chainsword, custom A (weapon), flak_armour, custom B (weapon)]` and talents `[{ id: 'trademark_weapon', choice: '3' }, { id: 'armourmonger_aoa', choice: 2 }, { id: 'uncanny', choice: 'Defence' }, 'some_plain_id']`:

```js
check('reset keeps the custom items in order', State.character.wargear.map(w => w.custom.name), ['Custom A', 'Custom B']);
check('Trademark Weapon on custom B moves to index 1', State.character.talents[0].choice, '1');
check('Armour-Monger on a book item is cleared', State.character.talents[1].choice, null);
check('a non-index choice is kept', State.character.talents[2].choice, 'Defence');
check('a plain talent id is kept', State.character.talents[3], 'some_plain_id');
```

Also a numeric choice `3` becomes `1`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/test-custom-wargear.js`
Expected: exit 1, `State.addCustomItem is not a function`.

- [ ] **Step 3: Implement the four changes in `creator/js/state.js`** as the Interfaces block says; the new mutators carry one-line comments in the style of `addImprovisedWargear`.

- [ ] **Step 4: Run all tests**

Run: `for f in scripts/test-*.js; do node "$f" > /dev/null || echo "FAIL $f"; done`
Expected: no output (`test-notes.js` and `test-followers.js` still pass). App loads with no console error.

- [ ] **Step 5: Commit**

```bash
git add creator/js/state.js scripts/test-custom-wargear.js
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Add custom items to State and keep them on a custom archetype reset (#33)"
```

---

### Task 5: Text safety — escape helpers and item-text sites

**Model:** sonnet

**Files:**
- Modify: `creator/tabs/character-sheet-tab.js:2585-2590` (`escapeHtml`), weapons `:915,952,954,967,970`, armour `:1094,1105,1106,1109,1111`, augmetics `:1187,1188,1190,1192,1211`, equipment `:1264,1265,1268,1270,1289`, talent choice `:1655`
- Modify: `creator/tabs/wargear-tab.js:910-915` (`escapeHtml`), `:178,179,202,203`
- Modify: `creator/tabs/talents-tab.js:323` and a new `escapeHtml` helper at the end of the object
- Modify: `creator/js/custom-wargear.js` (add `escapeHtml`, `escapeAttr`)
- Test: `scripts/test-custom-wargear.js` (new section)

**Interfaces:**
- Consumes: Task 1 resolver (the render checks use custom records); Task 2 test fixtures `xenotechRecordWithId`, `spineRecordWithId`.
- Produces:
  - Test fixtures at file scope: `sctx` (the sheet context below), `EVIL = '<b>"x\'</b>&'`, `SAFE = '&lt;b&gt;&quot;x&#39;&lt;/b&gt;&amp;'`, `SAFE_UPPER = '&lt;B&gt;&quot;X&#39;&lt;/B&gt;&amp;'` (the escape of `EVIL.toUpperCase()`: capital tag text, lower-case entity names), `RAW_TAG = /<\/?b>/i` (any raw `<b>`/`</b>`, either case).
  - `escapeHtml(text) -> string` on `CharacterSheetTab`, `WargearTab`, `TalentsTab` and `CustomWargear`, identical bodies: `''` for a falsy value (as today), else `String(text)` with `&`, `<`, `>`, `"`, `'` replaced by `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;` (ampersand first). No `document` use. `CustomWargear.escapeAttr(text)` returns `escapeHtml(text)` (the five-char version is attribute-safe; the name is kept for parity with `ImprovisedBuilder`).

- [ ] **Step 1: Write the failing test**

Sheet context: `creatorSandbox` with a `State` stub `{ character, getCharacter: () => character, getEquippedWeapons: () => [], isWeaponEquipped: () => false, getTalentEntry: () => null, getKeywords: () => [], getEffectiveTier: () => 1, isPsyker: () => false, hasTalent: () => false }`, a `PrerequisiteChecker` stub `{ getCharacterKeywords: () => [] }` and a `navigator.clipboard` stub (Task 6 uses it, as in `scripts/test-sheet-attributes.js:56`), then the real `derived-stats.js`, `improvised-builder.js`, `custom-wargear.js`, `character-sheet-tab.js`, `wargear-tab.js`, `talents-tab.js` (no `document` stub).

```js
for (const mod of ['CharacterSheetTab', 'WargearTab', 'TalentsTab', 'CustomWargear'])
    check(`${mod}.escapeHtml escapes the five characters`, get(sctx, mod).escapeHtml(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
```

Render checks, each with one custom entry whose `name`, `description`, `effect`, each trait and each keyword is `EVIL` (keywords `EVIL.toUpperCase()`): `renderWeapons`, `renderArmor`, `renderAugmetics`, `renderEquipment` of the sheet, and `WargearTab.renderOwnedItem` / `renderOwnedWeapon` for a book item named `EVIL` (spread a book record with `name: EVIL`): each output contains `SAFE` (and `SAFE_UPPER` for the keywords) and `RAW_TAG.test(output)` is `false` (case-insensitive, so a missed escape of an upper-cased keyword `<B>` fails). `renderTalents` with `trademark_weapon` choice `'0'` on a custom weapon named `EVIL` (stub `DataLoader.getTalent` is real) contains `SAFE` and `RAW_TAG.test` is `false`. The book Whip still renders its name `Whip` unchanged.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/test-custom-wargear.js`
Expected: exit 1, `document is not defined` or FAIL on the escape checks.

- [ ] **Step 3: Replace the helpers and escape each listed site**

Wrap each listed interpolation in `this.escapeHtml(...)`; traits and keywords escape per item before the join/map (`allTraits.map(t => this.escapeHtml(t)).join(', ')`). In the relic branches escape the base `weapon.name` / `armor.name` / `aug.name` / `equip.name` too. At `character-sheet-tab.js:1655` and `talents-tab.js:323` escape where `choiceDisplay` is set from `item.name`. Do not escape `'-'` fallbacks or numbers. Spec §5 item 5 lists sites that stay as they are.

- [ ] **Step 4: Run all tests**

Run: `for f in scripts/test-*.js; do node "$f" > /dev/null || echo "FAIL $f"; done`
Expected: no output (`test-sheet-attributes.js` still passes; its `document` stub is now unused). App loads with no console error; the sheet of an existing character looks the same.

- [ ] **Step 5: Commit**

```bash
git add creator/tabs/character-sheet-tab.js creator/tabs/wargear-tab.js creator/tabs/talents-tab.js creator/js/custom-wargear.js scripts/test-custom-wargear.js
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Escape quotes in the HTML helpers and escape wargear text on the sheet (#33)"
```

---

### Task 6: Sheet Range and Salvo, copy as text, Markdown

**Model:** sonnet

**Files:**
- Modify: `creator/tabs/character-sheet-tab.js:918-921` (range), `:990` (range cell), `:2044-2072` (`copySummary` wargear loop); new helpers next to `isWeaponCompatibleWithSimultaneousStrike` (`:1041`)
- Modify: `creator/js/character-io.js:231-255` (`createCharacterSheet` wargear loop)
- Test: `scripts/test-custom-wargear.js` (new section)

**Interfaces:**
- Consumes: Task 3 `CustomWargear.textLines(record)`; Task 5 `escapeHtml`; test fixtures `sctx` (Task 5), `CW`, `xenotechRecordWithId` (Task 2).
- Produces:
  - `CharacterSheetTab.weaponRangeText(weapon) -> string` (plain text) — ranged: as today (`range` string as stored; object → `short/medium/long` + `m`, missing part `-`; no range → `-`). Melee: `reach`, else `range`, else `-`; an integer or an all-digit string prints `<n>m`; any other string as stored.
  - `CharacterSheetTab.weaponSalvoText(weapon) -> string` — ranged weapon whose `salvo` is a number, or a non-empty string other than `-` → `Salvo <salvo>`; else `''`.
  - Range cell: `escapeHtml(weaponRangeText)`, plus `<div class="sheet-weapon-salvo">…</div>` with the escaped salvo text when it is not empty. No CSS change.
  - `copySummary` and `createCharacterSheet`: a branch `else if (item.custom)` (sheet) / `else if (item.custom && wargear)` (Markdown) after the improvised branch that writes `CustomWargear.textLines(wargear)` line by line.

- [ ] **Step 1: Write the failing test**

```js
const CS = get(sctx, 'CharacterSheetTab'), DL = get(sctx, 'DataLoader');
check('reach 2 prints 2m', CS.weaponRangeText({ type: 'melee', reach: 2 }), '2m');
check('melee range 2 prints 2m', CS.weaponRangeText({ type: 'melee', range: 2 }), '2m');
check('melee range "2" prints 2m', CS.weaponRangeText({ type: 'melee', range: '2' }), '2m');
check('melee Thrown text prints as stored', CS.weaponRangeText({ type: 'melee', range: 'Thrown S x 4' }), 'Thrown S x 4');
check('melee with no range prints -', CS.weaponRangeText({ type: 'melee' }), '-');
check('lasgun range', CS.weaponRangeText(DL.getWeapon('lasgun')), '12/24/36m');
check('lasgun salvo', CS.weaponSalvoText(DL.getWeapon('lasgun')), 'Salvo 2');
check('a "-" salvo prints nothing', CS.weaponSalvoText({ type: 'ranged', salvo: '-' }), '');
check('a melee weapon has no salvo line', CS.weaponSalvoText({ type: 'melee', salvo: 2 }), '');
```

Plus: `renderWeapons` for a character with `whip`, `greataxe_aoa`, `knife` and `lasgun` holds the range cells `4m`, `2m`, `Thrown S x 4` and `12/24/36m` followed by `Salvo 2`. `copySummary({ innerHTML: '' })` (clipboard stub as in `scripts/test-sheet-attributes.js:56`) for a character with `chainsword` and the Xenotech entry holds `  Chainsword` followed by `CW.textLines(xenotechRecordWithId).join('\n')`. `CharacterIO.createCharacterSheet` (sandbox as in `scripts/test-improvised.js:182-188`, with the real `CustomWargear` and a `getWargearItem` that returns the Xenotech record for its id) holds `- Xenotech Blade (Custom)\n    Damage (S) +4 • ED 4 • AP 0 • Range 2m • Agonising, Rad (2)\n`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/test-custom-wargear.js`
Expected: exit 1, `CS.weaponRangeText is not a function`.

- [ ] **Step 3: Implement the two helpers, the cell, and the two text branches**

- [ ] **Step 4: Run all tests**

Run: `for f in scripts/test-*.js; do node "$f" > /dev/null || echo "FAIL $f"; done`
Expected: no output; app loads with no console error; a book Whip shows `4m` on the sheet.

- [ ] **Step 5: Commit**

```bash
git add creator/tabs/character-sheet-tab.js creator/js/character-io.js scripts/test-custom-wargear.js
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Show the range of every weapon and the salvo of ranged weapons on the sheet (#33)"
```

---

### Task 7: The builder modal and the Custom Wargear card

**Model:** opus — the form state (hidden-field values kept, per-kind trait lists, chips, bonus rows, live validation without losing focus) is the design choice of this task.

**Files:**
- Modify: `creator/js/custom-wargear.js` (lifecycle, rendering, binding, save, form operations)
- Modify: `creator/tabs/wargear-tab.js:8-14` (`init`: `CustomWargear.onSaved = () => this.render();`), `:337-363` (card after the Improvised card), the button bind next to `btn-build-improvised` (`:390-395`)
- Modify: `creator/css/styles.css` (new section)
- Test: `scripts/test-custom-wargear.js` (new section)

**Interfaces:**
- Consumes: Tasks 2–3 helpers, Task 4 `State.addCustomItem` / `State.updateCustomItem`, Task 5 `escapeHtml` / `escapeAttr`; test fixtures `CW`, `F`, `xenotech`, `spine`, `ranged` (Task 2).
- Produces:
  - `CustomWargear.onSaved: function | null`, `CustomWargear.form: Form | null`.
  - `open(wargearIndex: number | null = null)` — builds the modal once (`buildModal`, which also calls `bind()` that one time; in the shape of `improvised-builder.js:63-96`: `#custom-item-modal.modal`, `.modal-content.modal-large`, header `#custom-item-title`, body `#custom-item-body`, footer Cancel `#custom-item-cancel` and Save `#custom-item-save`, appended to `#app`); `form = emptyForm()` for create, or `{ ...formFromRecord(entry.custom), editIndex }` for an entry with `custom`; then `render()` and shows the modal. Title "Create Custom Wargear" / "Edit Custom Wargear"; Save label "Add Wargear" / "Save Changes".
  - `close()`.
  - `bodyHtml(form) -> string` — pure; the kind selector (Weapon / Armor / Augmetic / Other; `disabled` when `editIndex !== null`), the Melee / Ranged selector for a weapon, and only the fields of the selected kind and type (spec §3.2 table, labels "Damage: S +" for melee, "Range (m)" for melee, Short / Medium / Long for ranged, AP hint "e.g. -2"); every number field (damage, ED, AP, range, short/medium/long, salvo, AR, value, bonus value) is `<input type="text" inputmode="numeric">`, never `type="number"`, so `validateForm` sees the typed text; each input carries `data-field="<form key>"`; each field has an empty `<span class="custom-item-error" data-error-for="<field>">`; trait chips, keyword chips and bonus rows; a preview `#custom-item-preview`. Every prefilled `value="…"` uses `escapeAttr`, the textarea body uses `escapeHtml`, chip text uses `escapeHtml`.
  - `render()` — sets the body from `bodyHtml(this.form)` and calls `refresh()`. It does not bind: the body element is never replaced, so binding on each render would stack listeners.
  - `refresh()` — no re-render: runs `validateForm`, writes each message into its `data-error-for` span, sets `#custom-item-save.disabled` when the error object is not empty, and sets the preview text (via `textContent`) to `formatStatLine(buildRecord(form))` only when the error object is empty, else to `''` (`buildRecord` assumes a valid form).
  - `bind()` — called once, from `buildModal`; delegated `input`, `change`, `click` and `keydown` listeners on `#custom-item-body` that read `this.form` at event time: for a `data-field` text/textarea/select input, `form[field] = value` then `refresh()` (no `render`); the kind and weapon-type selectors and the trait-pick select (to show or hide the rating box) call `render()`. Buttons for add trait, add typed trait, remove chip, add keyword, add/remove bonus row call the form operations below, then `render()`. Bonus-row controls carry `data-bonus-index="<i>"` and `data-bonus-part="key"|"mode"|"value"` (no `data-field`), and the delegated handlers route them to `form.bonuses[i]`: a `key` select change sets `.key` then `render()` (the other rows' key lists change); a `mode` select change sets `.value` to `'rank'` (Rank), `'doubleRank'` (Double Rank) or `'1'` (Number), then `render()` (the text box shows only in Number mode); typing in the `value` text box sets `.value` to the text, then `refresh()` only. Enter in the rating, typed-trait or keyword box acts as its Add button and does not submit or close.
  - Form operations (pure, return an error message or `null`; the caller shows it next to the box):
    - `addListTrait(form, name, rating) -> string|null` — `name` must be in `traitNames(kind)`; trimmed rating 1–30 chars or blank; stores `Name (rating)` or `Name` in `weaponTraits` / `armorTraits` per `form.kind`; exact duplicate → message, no add; 20 traits → message.
    - `addTypedTrait(form, text) -> string|null` — trimmed 1–60 chars; stores `normalizeTrait(text, kind)`; same duplicate and count rules.
    - `removeTrait(form, index)`.
    - `addKeyword(form, text) -> string|null` — trimmed, upper-cased, 1–40 chars; duplicate → no add; 20 → message.
    - `removeKeyword(form, index)`.
    - `availableBonusKeys(form, rowIndex) -> string[]` — `BONUS_KEYS` minus the keys of the other rows.
    - `addBonusRow(form) -> string|null` — pushes `{ key: '', value: '1' }`; 10 rows → message.
    - `removeBonusRow(form, index)`.
  - `save()` — returns when `validateForm` is not empty; `buildRecord(form)`; `State.addCustomItem(record)` or `State.updateCustomItem(form.editIndex, record)`; `close()`; `onSaved()`.
  - Wargear tab card: `<div class="holy-relic-cta">` with `<h4>Custom Wargear</h4>`, one sentence of text, and `<button class="btn-primary" id="btn-build-custom">Create Custom Wargear</button>`; always shown (no source or talent check); placed after `${improvisedCtaHtml}`; the click calls `CustomWargear.open()`.
  - Bonus value input: a text box (`type="text" inputmode="numeric"`) plus a select `Number` / `Rank` / `Double Rank`; `Rank` sets `value` to `'rank'`, `Double Rank` to `'doubleRank'`, `Number` sets it to `'1'` and shows the text box again (routing in `bind()`).

- [ ] **Step 1: Write the failing test**

```js
const f = CW.emptyForm();
check('a list trait with a rating is stored as Name (rating)', [CW.addListTrait(f, 'Rad', ' 2 '), f.weaponTraits], [null, ['Rad (2)']]);
check('an exact duplicate trait is not added', [CW.addListTrait(f, 'Rad', '2') !== null, f.weaponTraits.length], [true, 1]);
check('a typed trait matching a list name takes the list spelling', [CW.addTypedTrait(f, 'agonising'), f.weaponTraits[1]], [null, 'Agonising']);
check('a typed custom trait is kept as typed', [CW.addTypedTrait(f, 'Xenos Venom (2)'), f.weaponTraits[2]], [null, 'Xenos Venom (2)']);
check('armour traits go to their own list', (() => { const a = { ...CW.emptyForm(), kind: 'armor' }; CW.addTypedTrait(a, 'shield'); return [a.armorTraits, a.weaponTraits]; })(), [['Shield'], []]);
check('keywords are trimmed, upper-cased and not duplicated', (() => { CW.addKeyword(f, ' xenos '); CW.addKeyword(f, 'Xenos'); return f.keywords; })(), ['XENOS']);
check('a used bonus key is not offered again', (() => { const g = { ...CW.emptyForm(), kind: 'augmetic', bonuses: [{ key: 'strength', value: '1' }, { key: '', value: '1' }] }; return CW.availableBonusKeys(g, 1).includes('strength'); })(), false);
```

Plus: a rating of 31 chars → message, no add; a 61-char typed trait → message; an 11th bonus row → message; the 21st keyword → message. Edit prefill: for a record whose name is `a"b'c</textarea>$&` and description `</textarea><b>x</b>`, `bodyHtml(formFromRecord(record))` contains `a&quot;b&#39;c&lt;/textarea&gt;$&amp;` and `&lt;/textarea&gt;&lt;b&gt;x&lt;/b&gt;` and does not contain `</textarea><b>`; `buildRecord(formFromRecord(record))` equals the record minus `id` (`canon`). `bodyHtml` of an edit form has `disabled` on the kind selector, and of a create form does not. `bodyHtml` of an Other form has no `data-field="keywords"`-style keyword input and no trait picker. Number inputs: `bodyHtml` of `xenotech`, `ranged` and `spine` (two bonus rows) each contain `inputmode="numeric"` and do not contain `type="number"`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/test-custom-wargear.js`
Expected: exit 1, `CW.addListTrait is not a function`.

- [ ] **Step 3: Implement the modal, the form operations and the card**

Reuse the Improvised builder classes where they fit (`form-group`, `search-input`, `relic-option-group`, `relic-summary-block`, `btn-small`); new classes `custom-item-*` for the form grid, chips (removable, keyboard-focusable buttons), bonus rows and error text, with `STYLE_GUIDE.md` variables only. Wording of messages and card text is free (spec §7). Methods in style-guide order: state properties, lifecycle (`open`, `close`, `buildModal`), rendering (`render`, `bodyHtml`, `refresh`), event handlers (`bind`, `save`), form operations, pure helpers.

- [ ] **Step 4: Run all tests and smoke-test the modal**

Run: `for f in scripts/test-*.js; do node "$f" > /dev/null || echo "FAIL $f"; done`
Expected: no output. In the app: the card shows on the Wargear tab; Create opens the modal; change the kind three times (Armor, then Weapon, then Augmetic), then click "Add bonus" once: exactly one bonus row appears (listeners are bound once); close and reopen the modal and repeat: still one row per click; adding the Xenotech Blade puts it in the owned list under Weapons (the row shows the plain name until Task 8); no console error.

- [ ] **Step 5: Commit**

```bash
git add creator/js/custom-wargear.js creator/tabs/wargear-tab.js creator/css/styles.css scripts/test-custom-wargear.js
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Add the Custom Wargear builder and its card on the Wargear tab (#33)"
```

---

### Task 8: Owned list — Custom badge, stat line, Edit

**Model:** sonnet

**Files:**
- Modify: `creator/tabs/wargear-tab.js:76` (entry object), `:150-154` (bind), `:158-212` (`renderOwnedWeapon`, `renderOwnedItem`), new `renderCustomInfo` after `renderImprovisedInfo` (`:230-242`)
- Test: `scripts/test-custom-wargear.js` (new section)

**Interfaces:**
- Consumes: Task 3 `CustomWargear.formatStatLine`, `CustomWargear.typeLabel`; Task 5 `escapeHtml`; Task 7 `CustomWargear.open(index)`; test fixtures `sctx`, `EVIL`, `SAFE`, `SAFE_UPPER`, `RAW_TAG` (Task 5), `otherRecord`, `xenotechRecordWithId`, `spineRecordWithId` (Task 2).
- Produces:
  - The owned-list entry object (`:76`) gains `custom: item.custom`.
  - `WargearTab.renderCustomInfo(custom: object|undefined) -> { nameLine, typeLine, detailLine } | null` — `null` with no `custom`; `nameLine` = escaped name + ` <span class="badge-relic">Custom</span>`; `typeLine` = `typeLabel(custom)`; `detailLine` = `<div class="wargear-relic-detail text-muted">` + escaped `formatStatLine(custom)` + `</div>`, or `''` when the stat line is empty.
  - `renderOwnedWeapon` / `renderOwnedItem` use `renderRelicInfo || renderImprovisedInfo || renderCustomInfo` (weapon) and `renderRelicInfo || renderCustomInfo` (item); for a custom entry the Edit button has class `btn-edit-custom`; a weapon keeps its Upgrades button; Remove is unchanged.
  - `renderCurrentWargear` binds `.btn-edit-custom` to `CustomWargear.open(parseInt(btn.dataset.index, 10))`.

- [ ] **Step 1: Write the failing test**

```js
const WT = get(sctx, 'WargearTab');
const owned = (rec, i) => ({ ...rec, wargearIndex: i, isStarting: false, upgrades: [], custom: rec });
const wHtml = WT.renderOwnedWeapon(owned(xenotechRecordWithId, 0));
check('a custom weapon row has the Custom badge', wHtml.includes('<span class="badge-relic">Custom</span>'), true);
check('a custom weapon row has the type line', wHtml.includes('Melee Weapon'), true);
check('a custom weapon row has the stat line', wHtml.includes('Damage (S) +4 • ED 4 • AP 0 • Range 2m • Agonising, Rad (2)'), true);
check('a custom weapon row has Edit, Upgrades and Remove',
    ['btn-edit-custom', 'btn-manage-upgrades', 'btn-remove-wargear'].every(c => wHtml.includes(c)), true);
const aHtml = WT.renderOwnedItem(owned(spineRecordWithId, 1), 'augmetic');
check('a custom augmetic row shows its bonuses', aHtml.includes('Bonuses: +1 Strength, -1 Agility'), true);
check('a custom augmetic row has Edit and no Upgrades', [aHtml.includes('btn-edit-custom'), aHtml.includes('btn-manage-upgrades')], [true, false]);
```

Plus: an Other row has type line `Other` and no detail `<div>`; a row for a custom item named `EVIL` holds `SAFE` and `RAW_TAG.test` is `false`; a book item row has no `Custom` badge and no `btn-edit-custom`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/test-custom-wargear.js`
Expected: exit 1, FAIL on the badge checks.

- [ ] **Step 3: Implement `renderCustomInfo`, the two row branches, the entry field and the bind**

- [ ] **Step 4: Run all tests**

Run: `for f in scripts/test-*.js; do node "$f" > /dev/null || echo "FAIL $f"; done`
Expected: no output; in the app, Edit on a custom row opens the prefilled modal; no console error.

- [ ] **Step 5: Commit**

```bash
git add creator/tabs/wargear-tab.js scripts/test-custom-wargear.js
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Show custom items in the owned wargear list with a badge and Edit (#33)"
```

---

### Task 9: Cache bump and browser check

**Model:** sonnet

**Files:**
- Modify: `creator/index.html` — every `?v=N` → `?v=N+1`, where `N` is the current value (all `<script>` and `<link>` tags that carry `?v=`, 35 with the Task 2 tag; the `uniq -c` check in Step 1 is the proof).

**Interfaces:**
- Consumes: everything above. Produces: nothing new.

- [ ] **Step 1: Bump the versions**

Read the current value: `grep -o '?v=[0-9]*' creator/index.html | sort | uniq -c` must print one value on 35 tags (expected `35 ?v=122`). Replace every `?v=N` in `creator/index.html` with `?v=N+1` (expected `?v=123`). Verify: the same command prints one line, `35 ?v=N+1` (expected `35 ?v=123`); `git diff --stat $(git merge-base main HEAD) -- creator/js/web-api.js` prints nothing; the diff of this step lists only `creator/index.html`.

- [ ] **Step 2: Run all tests**

Run: `for f in scripts/test-*.js; do node "$f" > /dev/null || echo "FAIL $f"; done`
Expected: no output.

- [ ] **Step 3: Browser check (spec §6.2)**

Serve the repo root of the branch with `python3 -m http.server 8137`, open `http://localhost:8137/creator/`, start a new character with a species and a book archetype (dismiss the `beforeunload` dialog when it appears). `EVIL` below means the text `<b>"x'</b>&`. Record the console after each step; every step expects no console error.

1. Wargear tab → the "Custom Wargear" card shows after the Holy Relic card with no talent and no book filter needed. Expected: card and "Create Custom Wargear" button visible.
2. Create the Xenotech Blade: Weapon, Melee, Name `EVIL Xenotech Blade`, Damage 4, ED 4, Range 2, traits Agonising and Rad with rating 2. Expected: the preview reads `Damage (S) +4 • ED 4 • AP 0 • Range 2m • Agonising, Rad (2)`; Save enabled; the item shows under Weapons with the Custom badge and the name exactly as typed.
3. Open Create again, type a long name one key at a time, then type `1.5` into ED. Expected: focus and caret stay in each box while typing; ED shows a message, the preview is empty, and Save is disabled; `3` clears it. Type `--2` into Value. Expected: Value shows its message and Save stays disabled (nothing is saved); clear Value. Press Enter in the keyword box with text `xenos`. Expected: chip `XENOS` added, modal stays open. Change the kind three times (Armor, then Weapon, then Augmetic) and click "Add bonus" once. Expected: exactly one new bonus row. Cancel.
4. Create a ranged weapon `EVIL Las` (Damage 7, ED 1, AP -1, Range 12/24/36, Salvo 2, trait Rapid Fire 2). Then try Range 24/12/36. Expected: the bad order blocks Save; the good one saves under Weapons.
5. Create an armour `EVIL Plate` with AR 3 and trait typed as `shield`. Expected: chip shows `Shield`; item under Armor.
6. Create the §2.5 augmetic named `EVIL Hydraulic Spine` (bonuses Strength +1, Agility -1, keyword IMPERIUM, rarity Rare). Expected: it lists under Augmetics with `+1 Strength, -1 Agility. • Bonuses: +1 Strength, -1 Agility`.
7. Create an Other item `EVIL Lucky Coin` with a two-line description. Expected: under Equipment, type line `Other`.
7a. Create a second armour `EVIL Carapace` with AR 4 and no traits. Expected: under Armor (the Armour-Monger picker skips Shield items, `talents-tab.js:166`, so step 10 uses this one).
8. Add the book Whip and the book Great Axe (`greataxe_aoa`) from the browser. Expected: neither browser list shows any custom item.
9. Character sheet. Expected: weapon table shows the Xenotech Blade range `2m`, the Las `12/24/36m` with `Salvo 2` under it, Whip `4m`, Great Axe `2m`; armour, augmetic and equipment rows show the names, effects, descriptions and keywords as typed, with "Custom" as the source; nothing renders bold; Strength 1 higher and Agility 1 lower than base; the Strength and Agility tooltips name `EVIL Hydraulic Spine` as typed; the Resilience and Defence tooltips include the custom armour as typed.
10. Take Trademark Weapon on the Xenotech Blade and Armour-Monger on `EVIL Carapace` (Armour-Monger needs the Abundance of Apocrypha source on and its prerequisites met, or the "ignore prerequisites" house rule). Expected: the talent labels on the Talents tab and the sheet show the names as typed.
11. Upgrades on the Xenotech Blade: add one melee upgrade. Expected: it applies; Edit the blade, change only the description, save. Expected: upgrade kept. Edit again and switch to Ranged with a valid range. Expected: upgrades cleared.
12. Edit `EVIL Plate`. Expected: every field prefilled exactly, kind selector disabled; Save with no change keeps the item the same.
13. Archetype tab → switch to a custom archetype. Expected: all six custom items stay in the owned list; the book Whip and Great Axe are gone; Trademark Weapon still names the Xenotech Blade and Armour-Monger still names `EVIL Carapace`.
14. Print preview (sheet Print button). Expected: same text as the sheet, nothing renders as HTML.
15. Copy as text. Expected: each custom item prints `- <name> (Custom)` with its indented stat line, keywords and description lines, raw (`<b>"x'</b>&` literally).
16. Export the character to a file; reload the page (autosave restore). Expected: all items, upgrades and talent choices return unchanged.
17. Import the exported file. Expected: same result as step 16.
18. Remove one custom item. Expected: the confirm names it as typed; it disappears from the list and the sheet.

- [ ] **Step 4: Commit**

```bash
git add creator/index.html
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Bump the creator asset versions for Custom Wargear (#33)"
```

---

## Self-Review

1. **Spec coverage.** §2.1–2.2 → Task 1. §2.3 shapes → Task 2 (`buildRecord`), §2.4–2.5 examples are Task 2 checks. §2.6 mutators → Task 4. §2.7 reset → Task 4. §2.8 load → Task 2 (`normalizeEntry`) and Task 4 (wiring). §3.1 entry point and module → Tasks 2, 7. §3.2 fields and validation → Task 2 (`validateForm`), Task 7 (UI). §3.3 trait picker → Task 2 (`traitNames`, `normalizeTrait`), Task 3 (`ratedTraits`), Task 7. §3.4 keywords → Task 7. §3.5 bonuses → Tasks 2, 3, 7; application by unchanged `DerivedStats` → Task 1 checks. §3.6 owned list → Task 8. §4 consumers marked "unchanged" → Task 1 resolver plus the Task 9 walk; §4.1 → Task 6; §4.2 → Tasks 3, 6. §5 → Task 5 (and `escapeAttr` use in Task 7, Task 8 escape check). §6.1 → spread over Tasks 1–8. §6.2 → Task 9. §6.3 → Tasks 2 and 9.
2. **Step scan.** Each code step names the file, the signature and the pinned values; bodies are left to the implementer except the exact strings the spec fixes (stat lines, text lines, labels).
3. **Type consistency.** `Form` keys are defined once (Task 2 `emptyForm`) and used by name in Tasks 3 and 7; `usedIds` is a `Set<string>` in `newId`, `normalizeEntry` and `loadCharacter`; `normalizeEntry` returns `boolean`, logged by `loadCharacter`; `addCustomItem` returns the index and `updateCustomItem` a boolean; `weaponRangeText` / `weaponSalvoText` are plain text, escaped at the cell.
4. **Review Focus.** Each of the five lines has its check in the owning task (Tasks 2, 3, 4, 7) or browser step (Task 9 step 3); the focus-while-typing line is covered by the browser step only.
6. **Amendment (2026-11-14), changed tasks re-checked.** Base is `main`; `?v=` values are read from the file (Task 2 tag at the current value, Task 9 current + 1); no data version pinned. Task 7: `bind()` is one name, called once from `buildModal`; `render()` = `bodyHtml` + `refresh()`; the preview shows only for a valid form; number fields are `type="text" inputmode="numeric"`. Fixtures: Task 2 produces `CW`, `F`, the five forms and records and the two `…WithId` records; Task 5 produces `sctx`, `EVIL`, `SAFE`, `SAFE_UPPER`, `RAW_TAG`; every later use names its source in Consumes.
5. **Proportion.** The plan is about 1.3 times the length of the spec; code blocks are test assertions and exact strings only.

---

## Review record (2026-11-14)

The nine tasks ran one after the other on the branch `custom-wargear`, each with a task review. A review of the full branch followed, with one fix wave and one re-review. This section holds the rulings that the controller made during the run and the review items that were deferred.

### Rulings

- Ruling: no controller conflict table — two reviewer passes checked the interfaces, the green-after-each-task rule and about 45 line references — a cross-task conflict that both missed shows first in a task review.
- Ruling: the branch was cut before the data branch glossary-missing-traits merged — Task 1 touches only creator/js/data-loader.js and the new test file — main merges into custom-wargear before Task 2; a conflict in creator/index.html is then mine to resolve.
- Ruling: main (f360243: glossary traits, popup fixes, creator ?v=122) merged into custom-wargear before Task 2, as planned in pre-flight — no conflict.
- Ruling: Task 2 finding 1 gets the cleaner fix (one owner of the per-kind record shape, plus a fixed-point check for the five fixtures) — the smaller fix (a test tie only) leaves two copies that Tasks 3-8 build on — costs one more change inside Task 2 if the single owner changes a public result.
- Ruling: Task 2 Minor findings 2, 3, 4 go with fix round 1 (same code, same test section) — they are checks that cannot fail today — no cost if wrong beyond the round.
- Ruling: Task 5 concern 1 (talents-tab `.replace` with a string replacement expands `$&` in a custom name) is a correctness defect inside spec §5, so it goes back to the implementer BEFORE the review (SDD: a correctness concern is settled before review) — costs one resume; if wrong, the reviewer sees one more small commit.
- Ruling: main (719a07f) must merge into custom-wargear after the Task 6 review and before Task 7 — creator/index.html will conflict (34 tags at 123 on main, the Task 2 tag at 122 on the branch); resolution: take main's lines and set the custom-wargear.js tag to ?v=123; Task 9 then bumps to 124.
- Ruling: Task 6 finding 1 ("Salvo 0" shows on 81 book ranged weapons whose record stores salvo 0, while 77 records that store "-" show no Salvo line; core has 12 zeros, church 44 dashes, apocrypha 40 zeros and 26 dashes) — the code stands as the spec §4.1 says (a number prints, "-" hides): 0 and "-" are what each book prints, and the data is verbatim — costs one line in weaponSalvoText and one test flip if the owner wants 0 hidden; the owner is told and can rule before the ship.
- Ruling: Task 7 concern 2 (inputmode="numeric" gives some phones a keypad with no minus key; AP and the bonus value take negatives) goes back to the implementer BEFORE the review; it amends the plan's "every number field is type=text inputmode=numeric" — a field whose LIMITS range has min < 0 gets no inputmode, the others keep it — costs one resume; if wrong, a phone player types AP on a full keyboard.
- Ruling: Task 7 Minor findings 2 (focus to body in two cases), 3 (save() ignores a false from updateCustomItem), 4 (duplicate check against non-normalized chip text) go with fix round 1 — same code, small — no cost beyond the round.
- Ruling: Task 9 gets no separate task reviewer — its diff is the version bump only (35 lines in creator/index.html); the gate is the controller's checks (35 tags at one value, web-api.js unchanged against the merge base, no change under bestiary/data/shared, 15 scripts pass, 392 PASS lines in the feature test, 19 PASS rows in the step table) and the whole-branch review that follows at once — costs nothing if wrong, because the final review reads the same diff.
- Ruling: the Task 6 Salvo ruling is OVERTURNED — the sheet prints the Salvo line only for a salvo above 0 (or a non-numeric text such as "1d3"); the premise "0 is what the book prints" was false for at least six core records. formatStatLine keeps "Salvo 0" for a custom ranged weapon (it reads back what the player typed in the preview and the list). The data correction (0 to "-") is a separate data task for the owner — cost if wrong: one line and one test flip.
- Ruling: F3 gets the stronger fix — open() stores the entry id; save() finds the entry by id again and updates at its current index; if the entry is gone, the form closes and saves nothing — the reviewer's smaller fix (close without saving when the id differs) loses a valid edit after a mere index shift.
- Ruling: F4 goes into this fix wave although the live site has it today and the spec did not ask for it — it is a script-injection path through a shared character file, and each fix is one escape call — cost if wrong: none.
- Ruling: F6 comes OUT of the fix wave — min-width:0 with overflow-wrap:anywhere on .wargear-info shrinks the info column of a custom row to 61px at 360px, so the Custom badge breaks into "CUSTO / M" and the stat line breaks inside words; the cure for a name of 80 letters with no space made every custom row on a phone worse (defect of the controller's brief). The finding is parked: real, deferred; the right fix is a narrow-screen row layout (buttons below the text), for the owner — cost if wrong: a silly long name hides its row's buttons at 360px until the layout task.

### Deferred review items

- Task 1: minor (deferred): resolver test section sits at file scope, not in a block (names rctx, DL, RS, ID, noState) — carried to Task 2 dispatch as a first step
- Task 1: minor (deferred): getCustomRecord accepts an array as entry.custom (data-loader.js:107); getters reject it by kind
- Task 1: minor (deferred): no check can fail on the "never search the data cache for a custom_ id" rule (plan-mandated checks)
- Task 1: minor (deferred): "an Other item adds nothing" passes also when the Other item does not resolve
- Task 1: minor (deferred): no check for falsy State.character, non-array wargear, null entry in getCustomRecord
- Task 1: minor (deferred): the custom_ prefix test is in four places in data-loader.js
- Task 1: minor (deferred): canon has no check of its own
- Task 1: minor (deferred): report line 13 names the wrong check as the extra red one (report only)
- Task 2: minor (deferred): report claim "on a valid form only the keywords change" is false — buildRecord also normalizes trait spelling, drops duplicate/blank traits, cuts a typed trait at 60 chars and a keyword at 40 after upper case (ß doubles), with no message; validateForm checks only the trait count
- Task 2: minor (deferred): an invalid form now builds a normal-looking record (blank name → "Unnamed custom item", clamps) instead of null numbers; the precondition comment stays — a caller that skips validateForm saves a silently changed record
- Task 2: minor (deferred): four more "returns true" checks pass vacuously (test-custom-wargear.js :307-309, :311-312) — use withId
- Task 3: minor (deferred): test name "ranged stat line with AP -1 and two traits" has one trait (test-custom-wargear.js:365)
- Task 3: minor (deferred): `this.BONUS_LABELS[key] || key` fallback that no clean record reaches (custom-wargear.js:109)
- Task 3: minor (deferred): the glossary removal/restore is in two test sections; the Task 2 copy has no finally
- Task 4: minor (deferred): updateCustomItem with a string index ('0') puts the entry's own id into usedIds and changes the id (state.js:848); callers parseInt today; fix: filter by `w !== entry`
- Task 4: minor (deferred): no test remaps an armor_owned choice onto a kept custom armour (the code works per the reviewer's probe)
- Task 4: minor (deferred): no test that addCustomItem/updateCustomItem notify 'wargear' (autosave depends on it)
- Task 4: minor (deferred): no test for "no CustomWargear reference when no entry qualifies" with book entries present
- Task 4: reading for the final review: a load schedules no save, so a repaired save stays unrepaired in storage until the next edit; each restore gives a new random id and logs the warning again (talent choices hold indices, so nothing breaks)
- Task 5: minor (deferred): the tooltip check at test-custom-wargear.js:587 can never fail (the regex always ends on a quote)
- Task 5: minor (deferred): no render check for the two attribute sites of spec §5 item 4 (Resilience/Defence tooltip with the armour name, attribute tooltip with the augmetic source); only the escapeHtml unit check protects them
- Task 5: minor (deferred): safeAll check is imprecise ("holds the escaped name" passes when any field is escaped; the effect parameter is unused)
- Task 5: reading for the final review and the owner: older raw sites that a custom item cannot reach but an IMPORTED file can: an unknown upgrade id (wargear-tab.js:161), a talent choice that resolves to no item (talents-tab.js:315, character-sheet-tab.js:1647), catalog cards and upgrade names (book data only)
- Task 6: minor (deferred): no check covers the escape of the Salvo line (character-sheet-tab.js:920; book data has a string salvo "1d3")
- Task 6: minor (deferred): the class sheet-weapon-salvo is a third exception to the custom-item- prefix rule; the plan's exception list does not name it (plan text; the code is right)
- Task 6: minor (deferred): the copy test replaces sctx.navigator.clipboard.writeText and never restores it; the wargear reset is not in a finally
- Task 7: minor (deferred): a refused edit keeps the modal open but shows no reason (custom-wargear.js:430); not reachable until Task 8 adds the Edit caller, and then only if State refuses
- Task 7: minor (deferred, out of scope): the modal has no focus trap; if the player Tabs out and removes an earlier item while the Edit form is open, editIndex points at the next entry, and a custom item of the same kind there gets overwritten (state.js:839-852)
- Task 8: minor (deferred): the entry field and the Edit bind are checked only by a search of the source text; no test runs renderCurrentWargear with a custom entry; only the weapon Edit index is checked
- Task 8: minor (deferred): the Edit class and the info line choose between relic, improvised and custom in different orders (wargear-tab.js:181, :206); not reachable, because normalizeEntry deletes relic and improvised on a custom entry
- Task 9: concern for the final review and the owner: after a wargear removal, a stored talent choice (Trademark Weapon, Armour-Monger) keeps its old index, so it shows a wrong item or a bare number (existing behavior of removeWargearByIndex, out of scope by spec §2.7); the sheet showed "(5)" for Armour-Monger after step 18
- F5 Minor: a multi-line description shows as one line on the sheet and in print (white-space: pre-line would also change 43 book records) — for the owner, NOT in the wave
- F6 Minor: a long unbroken name pushes Edit and Remove off screen at 360px (.wargear-info) — in the wave
- F7 Minor: on open the focus stays behind the modal, no focus trap; the sheet prints "rank Resilience" where the list prints "+Rank Resilience" — initial focus in the wave; the trap and the wording wait

### Wave table

| Task | Model | Dispatches | Send-backs | Gate |
|---|---|---|---|---|
| Task 1 | sonnet | 1 | 0 | Approved |
| Task 2 | opus | 1 | 1 | Approved after fix round 1 |
| Task 3 | sonnet | 1 | 0 | Approved |
| Task 4 | opus | 1 | 0 | Approved |
| Task 5 | sonnet | 1 | 0 (1 pre-review fix on a self-reported concern) | Approved |
| Task 6 | sonnet | 1 | 0 | Approved after ruling |
| Task 7 | opus | 1 | 1 (plus 1 pre-review fix on a self-reported concern) | Approved after fix round 1 |
| Task 8 | sonnet | 1 | 0 | Approved |
| Task 9 | sonnet | 1 | 0 | Controller gate + final review |
| Fix wave | opus | 1 | 1 (F6 taken out) | Re-review: all addressed |
