# Bug Pass of the Creator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the defects A1-A20 and B1-B11 of the creator so that no UI action loses a thing that the user made, no stored value goes wrong at load, and no list hides an entry.

**Architecture:** `XPCalculator` gets the known stat names and one baseline function. `State` gets four helpers (`_withRebase`, the power grant helpers, `_remapWargearRefs`, `_intInRange`), three named load steps, and same-id guards. Each tab shows an unknown id as a visible row with a Remove control. Small guards close the render defects. No new script file, no new CSS file.

**Tech Stack:** Vanilla JS, global-object modules, no build step. Tests are plain Node scripts that load the browser files into a `vm` context.

**Spec:** `docs/superpowers/specs/2026-11-15-bug-pass-creator-design.md`. Read it before each task. Each task names its spec sections.

## Global Constraints

- Follow `CLAUDE.md` and `STYLE_GUIDE.md` of the repo: vanilla JS, one `const` global object per file, no ES modules, no classes, no IIFEs, no build step.
- Write all prose (code comments, commit messages, visible UI text) in ASD-STE100 Simplified Technical English: short sentences, active voice.
- Author each commit `--author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>"`. No attribution line and no co-author line.
- The 19 existing test scripts stay green, except the lines that a task names as changed. Run: `for f in scripts/test-*.js; do node "$f" > "/tmp/claude-0/bugpass-$(basename "$f").log" 2>&1 || echo "FAIL $f"; done; echo done`. Read only the `FAIL` lines and the last lines of a failing log.
- Each new test follows the repo pattern: a plain Node script `scripts/test-*.js` that loads the real files into a `vm` context, prints `PASS` / `FAIL` lines and a summary line, and exits with code 1 on a failure. Copy the `check`, `load`, `get` helpers of `scripts/test-load-check.js:14-43`. A test that renders a tab copies the recording DOM stub of `scripts/test-tab-escapes.js:23-70` and adds a stub `addEventListener` that records the handler when the test must fire it.
- The "full sandbox" of a test means: `creator/js/data-loader.js` with `DataLoader.cache` filled from `data/` (`species`, `archetypes`, `talents`, `weapons`, `armor`, `equipment`, `psychic-powers`, `ascension-packages`, `backgrounds`, `weapon-upgrades`, `injuries-corruption`, `keyword-categories`, `holy-relics`, `glossary`, `threats`), then `xp-calculator.js`, `derived-stats.js`, `prerequisite.js`, `keyword-bonus.js`, `followers.js`, `custom-wargear.js`, `character-check.js`, `state.js`, `relic-wizard.js`, `improvised-builder.js`, with `window: { api: {} }`, a `localStorage` stub and `setTimeout: () => 0`. This is the context of the "setters" block, `scripts/test-load-check.js:196-208`.
- No browser window on the owner's desktop. No task needs a browser. If a check needs one, it is `headless: true` on a port that is not 8137.
- G1 has the highest priority: a load step changes a stored value only in the cases X1, X2, X3 of spec §2.1.
- Cache busting: Task 1 bumps `?v=129` to `?v=130` on all 36 tags of `creator/index.html`. No later task bumps it again: the branch ships as one deploy. Task 7 bumps the creator data version in `creator/js/web-api.js` from 47 to 48.
- Two tasks never change the same lines. Where two tasks change one file, the task numbers give the order. Each task names the functions it changes; it changes no other function of that file.
- Visible text of a new row or control uses the classes of its tab. Escape each id and each name that comes from the character with the `escapeHtml` of that tab, and use `escapeHtml(String(v))` for a number.

## Review Focus

1. **A raised value after a parent change (Task 3).** Expected: a skill or attribute that the user bought above the old free value stays; one at the old free value moves to the new free value. Pinned by the Tech-Adept to Ganger check and the raised Tech check.
2. **A power that the user bought (Task 4).** Expected: no archetype change, no ascension change and no Custom Archetype ability change removes it. Pinned by fixtures D, F and H.
3. **A talent choice after a wargear change (Task 5).** Expected: it names the same item, or it is `null` when its item goes. Pinned by the B1 sequence and the Custom Archetype sequence.
4. **The three load steps (Task 8).** Expected: each other value loads deep-equal; the no-op corpus and the setters block stay green with only the named fixture changes.
5. **A row for an unknown id (Tasks 9, 11, 12, 14).** Expected: each list shows it, escaped, with a Remove control in the tab, and the remove writes the existing setter.

---

### Task 1: Cache bump

**Files:**
- Modify: `creator/index.html:12-13` (two `<link>` tags), `:523-556` (34 `<script>` tags)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing for other tasks. No later task changes a `?v=` of this file.

- [ ] **Step 1: Write the failing check.** Run `grep -c '?v=130' creator/index.html`. Expected now: `0`.
- [ ] **Step 2: Change each `?v=129` to `?v=130`** on the 36 tags. Do not change the Google Fonts and Turnstile URLs.
- [ ] **Step 3: Run the check.** `grep -c '?v=130' creator/index.html` gives `36`. `grep -c '?v=129' creator/index.html` gives `0`.
- [ ] **Step 4: Mutation proof.** Change one tag back to `?v=129`: the first count gives `35`. Undo.
- [ ] **Step 5: Commit.** `git commit --author=... -m "Bump the creator cache version to 130"`

---

### Task 2: Known stat names and one baseline (A3, A2 part)

Spec: §4.1, §4.2. Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `creator/js/xp-calculator.js:79-113` (`calculateAttributeXP`, `calculateSkillXP`) and add three members
- Modify: `creator/js/state.js:577-603` (`resetStats`), `:623-643` (`decreaseAttribute`), `:662-673` (`decreaseSkill`)
- Test: `scripts/test-stat-baseline.js` (new)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `XPCalculator.ATTRIBUTE_KEYS: string[]` (7 names) and `XPCalculator.SKILL_KEYS: string[]` (18 names), in the order of `State.createNewCharacter()`.
  - `XPCalculator.getBaseline(character) -> { attributes: { [name]: number }, skills: { [name]: number } }` by spec §4.2. It reads `character.archetypeSkillChoices` when it is a plain object; Task 3 adds the writer.
  - `calculateAttributeXP(character, archetype)` and `calculateSkillXP(character, archetype)` keep their signatures. They use `getBaseline(character)` and ignore the `archetype` argument. A value above the table costs as the edge (12, 8). A value that is not a finite number costs 0.
  - `State.resetStats()` sets each known name to its baseline and does not touch another key.
  - `decreaseAttribute(attr)` and `decreaseSkill(skill)` take their minimum from `getBaseline`.

- [ ] **Step 1: Write the failing test** `scripts/test-stat-baseline.js` in the full sandbox. Build each character with `State.createNewCharacter()` and direct field writes. Checks:
  - `SKILL_KEYS` equals `Object.keys(State.createNewCharacter().skills)`; `ATTRIBUTE_KEYS` likewise.
  - Human, archetype `ganger`, skills all at the Ganger baseline plus `choice1: 4, choice2: 4`: `calculateSkillXP` is `0`. (Before: 40.)
  - The same character plus `attributes.foo = 3`: `calculateAttributeXP` equals the value without `foo`.
  - `attributes.strength = 13`: `calculateAttributeXP` is a finite number equal to `ATTRIBUTE_COSTS[12] - ATTRIBUTE_COSTS[baseline]`. `skills.weaponSkill = 9`: `calculateSkillXP` equals `SKILL_COSTS[8] - SKILL_COSTS[baseline]`.
  - `getBaseline` of Human `inquisitor` with no `archetypeSkillChoices`: `attributes.intellect === 4`, `attributes.willpower === 4`, each skill `0`, and no key `choice1` in `skills`. With `archetypeSkillChoices: { choice1: 'insight', choice2: 'scholar' }`: `insight === 4`, `scholar === 4`. With `{ choice1: 'zz' }`: each skill `0`.
  - Human `inquisitor`, `skills.choice1 = 7`, `skills.insight = 6`; `State.resetStats()`: `skills.choice1 === 7`, `skills.insight === 0`, and no skill value is NaN.
  - Human `inquisitor`, `archetypeSkillChoices: { choice1: 'insight' }`, `skills.insight = 4`: `State.decreaseSkill('insight') === false`.
- [ ] **Step 2: Run** `node scripts/test-stat-baseline.js`. Expected: FAIL lines for the Ganger check, the 13 / 9 checks, the `getBaseline` checks (no function), the reset check and the decrease check.
- [ ] **Step 3: Implement** the interface above.
- [ ] **Step 4: Run** the new test and all test scripts. Expected: all PASS.
- [ ] **Step 5: Mutation proof.** Change the loop of `calculateSkillXP` back to `Object.entries(character.skills)`: the Ganger check gives FAIL (`40`). Undo.
- [ ] **Step 6: Commit.** `git commit --author=... -m "Sum the XP of the known stat names only and add one stat baseline"`

---

### Task 3: A parent change keeps raised values; the "any skill" choice (A4, A5, A6, A7b, A2)

Spec: §4.3 (not the load part), §4.4, §5. Suggested dispatch: `implementer` with `model: opus` (it changes what the app stores).

**Files:**
- Modify: `creator/js/state.js:234-259` (`setSpecies`), `:344-371` (`setArchetype`, all lines except the psyker block `:372-387`), `:397-404` (`clearArchetype`, only the `resetStats()` call at `:403` and a new first line), `:423-425` (`setCustomArchetype`: a guard before `:424`) and `:452` (`resetStats()` call); add `_withRebase`, `setArchetypeSkillChoice` after `resetStats`
- Modify: `creator/js/character-check.js:54-58` (add the `archetypeSkillChoices` row after row 22)
- Modify: `scripts/test-load-check.js:131` (corpus: one key), `:219-220` (setters: add one call), `:294` and `:300` (setters: the `skillChoiceKey` check), `:350` (the `HOSTILE` table: two new rows)
- Modify: `scripts/test-custom-wargear.js:503` (the stub)
- Test: `scripts/test-stat-baseline.js` (extend)

**Interfaces:**
- Consumes: `XPCalculator.getBaseline`, `XPCalculator.SKILL_KEYS` (Task 2).
- Produces:
  - `State._withRebase(change: () => void)`: reads `XPCalculator.getBaseline(this.character)`, calls `change()`, then moves each known attribute and skill by spec §5.2: a value `<=` the old free value becomes the new free value; another value becomes `Math.max(value, new free value)`.
  - `setSpecies(id)`: no change and no notify when `id === character.species.id`. Else `clearArchetype()` when an archetype is set, then `_withRebase` around the species write. It no longer applies `baseAttributes` with `Math.max` at `:244-248`.
  - `setArchetype(id)`: no change and no notify when `id === character.archetype.id`. Else `_withRebase` around: the archetype write, `archetypeKeywordChoices = {}`, `archetypeSkillChoices = {}`. The `Math.max` loops `:355-367` go. The psyker block `:372-387` stays for Task 4.
  - `clearArchetype()`: `_withRebase` around its field writes, in place of `resetStats()`. Lines `:400-402` stay for Task 4.
  - `setCustomArchetype()`: no change and no notify when `character.archetype.id === 'custom'`. `_withRebase` in place of `resetStats()` at `:452`.
  - `State.setArchetypeSkillChoice(key: string, skill: string) -> boolean` by spec §4.4. `''` clears. A refused call returns `false` and does not notify. An accepted call uses `_withRebase` and notifies `'stats'`.
  - `CharacterCheck` row: `archetypeSkillChoices` optional; a value that is not a plain object becomes `{}` (path `archetypeSkillChoices`); each value that is not a string becomes `''` (path `archetypeSkillChoices.<key>`). Copy the code of row 22.

- [ ] **Step 1: Write the failing checks** in `scripts/test-stat-baseline.js` (full sandbox, `State.setIgnorePrerequisites(true)`, `State.setAdditionalXP('2000')`):
  - A6: `newCharacter`, `setSpecies('human')`, `setArchetype('imperial_guardsman')`, `increaseAttribute('strength')`. Snapshot `JSON.stringify(State.character)` and a listener call count. `setSpecies('human')`: the character text is equal, and the listener count did not change. `setArchetype('imperial_guardsman')`: the same.
  - A7b: `setCustomArchetype()`, `setCustomArchetypeName('X')`, `setCustomArchetype()`: `customArchetype.name === 'X'`.
  - A4: character a = `newCharacter`, `setSpecies('human')`, `setArchetype('tech_adept')`, `setArchetype('ganger')`. Character b = `newCharacter`, `setSpecies('human')`, `setArchetype('ganger')`. `XPCalculator.calculateSpentXP(a) === XPCalculator.calculateSpentXP(b)`, and the attributes and skills of a and b are equal.
  - Raised value: `newCharacter`, Human, `tech_adept`, `increaseSkill('tech')` (3 to 4), `setArchetype('ganger')`: `skills.tech === 4`; `skills.scholar` and `attributes.intellect` equal the Ganger baseline of `getBaseline`.
  - A5: `newCharacter`, `setSpecies('ogryn')`, `setSpecies('human')`: `calculateAttributeXP === 0` and the attributes equal the Human baseline.
  - Species change keeps a raised value: `newCharacter`, Human, `increaseAttribute('agility')` twice (to 3), `setSpecies('ogryn')`: `attributes.agility === Math.max(3, <ogryn baseline agility>)`.
  - A2: `newCharacter`, Human, `setArchetype('inquisitor')`: no key of `skills` starts with `choice`, and no value is NaN. `setArchetypeSkillChoice('choice1', 'insight')` returns `true` and `skills.insight === 4`. `setArchetypeSkillChoice('choice2', 'insight')` returns `false`. `setArchetypeSkillChoice('choice2', 'scholar')`: `skills.scholar === 4`, `calculateSkillXP === 0`. `setArchetypeSkillChoice('choice1', 'medicae')`: `skills.insight === 0`, `skills.medicae === 4`. `setArchetypeSkillChoice('weaponSkill', 'insight')` returns `false`. `setArchetypeSkillChoice('choice1', 'zz')` returns `false`.
  - `scripts/test-load-check.js` setters: after `B.setArchetype('inquisitor')` (`:220`) add `B.setArchetypeSkillChoice('choice1', 'insight');`. Change the `skillChoiceKey` entry (`:294`) to `!('choice1' in built.skills) && built.archetypeSkillChoices?.choice1 === 'insight'`, and keep `skillChoiceKey: true` at `:300`. Change the comment at `:219`.
  - Corpus: add `archetypeSkillChoices: { choice1: 'insight' }` to the full character after `archetypeKeywordChoices` (`:131`); it is a real shape after this task, and the no-op check pins it.
  - `HOSTILE` rows, next to the `archetypeKeywordChoices` rows (`:350`): `[['archetypeSkillChoices'], OBJ_BAD, {}]` and `[['archetypeSkillChoices', 'choice1'], STR_BAD, '']`.
  - `scripts/test-custom-wargear.js:503`: replace `State.resetStats = () => {};` with `State._withRebase = change => change();`. Keep the meaning of the block: the stats are not under test there.
- [ ] **Step 2: Run** `node scripts/test-stat-baseline.js` and `node scripts/test-load-check.js`. Expected: FAIL for each new check.
- [ ] **Step 3: Implement** the interface above.
- [ ] **Step 4: Run** all test scripts. Expected: all PASS.
- [ ] **Step 5: Mutation proof.** In `setArchetype`, call the change without `_withRebase`: the A4 check gives FAIL. Undo.
- [ ] **Step 6: Commit.** `git commit --author=... -m "Keep bought stats when a parent changes and store the any-skill choice"`

---

### Task 4: Reference-aware grants (A8, A4 power part)

Spec: §6. Suggested dispatch: `implementer` with `model: opus`.

**Files:**
- Modify: `creator/js/state.js:372-387` (`setArchetype` psyker block), `:400-402` (`clearArchetype` power lines), `:466-487` (`setCustomArchetypeAbility` body), `setCustomArchetype` (one new line directly after the Task 3 guard), `:1326-1379` (`_applyAscensionEffects`), `:1382-1431` (`_removeAscensionEffects`), `setAscension` (`:1295-1298`, only the argument of the remove call); add three helpers after `_removeAscensionEffects`
- Test: `scripts/test-grants.js` (new)

**Interfaces:**
- Consumes: Task 3 (`setArchetype`, `clearArchetype`, `setCustomArchetype` structure).
- Produces:
  - `State._grantedPowerIds(excludeEntry = null) -> Set<string>`: spec §6.3 (P1 or P2, plus P3 and P4 of each package ascension except `excludeEntry`, compared by identity).
  - `State._applyPowerGrants(ids: string[])`: an id not in `psychicPowers` goes into `psychicPowers` and `freePowers`. Another id stays as it is.
  - `State._releasePowerGrants(ids: string[], excludeEntry = null)`: an id that `_grantedPowerIds(excludeEntry)` does not hold and that is in `freePowers` goes from both lists. Another id stays.
  - `setArchetype`: reads the old grant ids before the archetype write; after the write, `_releasePowerGrants(old)` then `_applyPowerGrants(new)`. No list is emptied.
  - `setCustomArchetypeAbility(id)`: the same with the old and new ability archetype. No list is emptied.
  - `clearArchetype()`: `_releasePowerGrants` of the old archetype and the old ability archetype, in place of `:400-402`.
  - `setCustomArchetype()`: `_releasePowerGrants` of the old archetype grants after the archetype write.
  - `_applyAscensionEffects(entry)`: P3, P4 through `_applyPowerGrants`; P5 as today; P6 no longer written.
  - `_removeAscensionEffects(entry)`: P3, P4 through `_releasePowerGrants(ids, entry)`; P5 removes the `ascensionGranted` copy only when no other current package ascension (not `entry`) grants the talent; P6 removes nothing. `setAscension` calls it before it filters the entry out, as today.

- [ ] **Step 1: Write the failing test** `scripts/test-grants.js` (full sandbox, `setIgnorePrerequisites(true)`, `setAdditionalXP('2000')`). Use `State.setAscension(t, { type: 'package', packageId, archetypeId: null })` and `State.setAscension(t, null)`. Fixtures:
  - A: Human, tier 2, `wyrd_aoa`; add `psychic_revelations` at 3, then clear 3: `smite` is in `psychicPowers` and in `freePowers`.
  - B: Human, tier 2, `sanctioned_psyker`; `addDisciplineChoice('Runes of Fate')`; add `lost_seer_path_aoa` at 3: `unlockedDisciplines` holds `'Runes of Fate'` once and `getUnlockedDisciplines()` holds it. Clear 3: `unlockedDisciplines` still holds it. `prescience` and `scriers_gaze` are in neither list.
  - C: Human, tier 1, `ganger`; add `psychic_revelations` at 2, clear 2: `smite` is in neither list.
  - D: Human, `sanctioned_psyker`; `addPower(<the first Minor power with a cost>)`; `setArchetype('ganger')`: `smite` is in neither list; the bought power is in `psychicPowers` and not in `freePowers`.
  - F: Human, `sanctioned_psyker`, the same bought power; `setArchetype('wyrd_aoa')`: the bought power stays; `smite` stays in both lists.
  - G: Human, tier 1, `ganger`; `dauntless_reputation` at 2 and at 3: one `devotees` entry with `ascensionGranted`. Clear 2: it stays. Clear 3: it goes.
  - H: Human, `setCustomArchetype()`, `setCustomArchetypeAbility('sanctioned_psyker')`, the same bought power, `setCustomArchetypeAbility(null)`: `smite` is in neither list; the bought power stays.
  - I: Human, `sanctioned_psyker`, the same bought power, `setSpecies('ogryn')`: the bought power stays; `smite` is in neither list.
- [ ] **Step 2: Run** `node scripts/test-grants.js`. Expected: FAIL for A, B, D, F, G, H, I.
- [ ] **Step 3: Implement** the interface above.
- [ ] **Step 4: Run** all test scripts. Expected: all PASS.
- [ ] **Step 5: Mutation proof.** Make `_releasePowerGrants` skip the `_grantedPowerIds` test: fixture A gives FAIL. Undo.
- [ ] **Step 6: Commit.** `git commit --author=... -m "Remove a granted power only when no other source grants it"`

---

### Task 5: Wargear index references in State (A9 / B1, A7)

Spec: §7.2, §7.3, §7.4 (state part). Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `creator/js/state.js:427-450` (`setCustomArchetype` wargear block), `:562-574` (`removeCustomStartingWargear`), `:780-788` (`removeWargear`), `:791-799` (`removeWargearByIndex`), `:808-817` (`updateRelicWargear`); add `_remapWargearRefs` and `getOldStartingEntries` after `removeWargearByIndex`
- Modify: `scripts/test-custom-wargear.js:502-524` (the `setCustomArchetype` block: new expectations)
- Test: `scripts/test-wargear-refs.js` (new)

**Interfaces:**
- Consumes: Task 3 and Task 4 lines of `setCustomArchetype` (do not change them).
- Produces:
  - `State._remapWargearRefs(newIndexOf: (oldIndex: number) => number)`: spec §7.3. It contains the loop of `:439-450`, which then goes from `setCustomArchetype`.
  - `State.getOldStartingEntries() -> number[]`: spec §7.4. For a character whose archetype is `custom` or not in the data, `[]`.
  - `setCustomArchetype()` removes only the indices of `getOldStartingEntries()` (read before the archetype write) and calls `_remapWargearRefs`.
  - The four remove and update setters call `_remapWargearRefs` after their splice. `updateRelicWargear` sets to `null` each owned-item choice on its index when `DataLoader.getWeapon` / `getArmor` of the new id no longer matches the talent's `choiceType`.

- [ ] **Step 1: Write the failing test** `scripts/test-wargear-refs.js` (full sandbox). Fixtures:
  - B1: `addWargear` of `knife`, `lasgun`, `laspistol`, `flak_armour`, then the id of the data armour named "Mesh Armour" (look it up by name). Talents `[{ id: 'trademark_weapon', choice: '1' }, { id: 'armourmonger_aoa', choice: 4 }]`. `removeWargearByIndex(0)`: choices are `'0'` and `3`; `wargear[0].id === 'lasgun'`.
  - Then `removeWargearByIndex(0)` (the lasgun): the Trademark choice is `null`; Armour-Monger is `2`.
  - `removeWargear('knife')` on a fresh copy of the first fixture: the same result as `removeWargearByIndex(0)`.
  - Custom starting: `setCustomArchetype()`, `addCustomStartingWargear('knife')`, `addWargear('lasgun')`, Trademark on index 1; `removeCustomStartingWargear(0)`: the choice is `'0'`.
  - Relic kind change: `flak_armour` at index 0 with Armour-Monger `'0'`; `updateRelicWargear(0, 'lasgun', relic)`: the choice is `null`. A weapon-to-weapon change keeps a Trademark choice.
  - A7: Human, `imperial_guardsman`; add each resolved starting id of that archetype with `addWargear(id, true)` (quantity respected); `addRelicWargear('laspistol', { name: 'Vow', form: 'weapon', originalOwner: null, anointment: null, power: null, oddities: [] })`; `addImprovisedWargear({ id: ImprovisedBuilder.BASE_IDS[0], improvised: { name: 'Leg', details: '', halfTime: 0, damageRank: false, removeUnwieldy: false, doubleRange: false, traits: [] } })`; `addWargear('chainsword')`; one custom item through `addCustomItem`. Trademark on the chainsword index. `getOldStartingEntries()` equals the starting indices. `setCustomArchetype()`: the wargear holds the relic, the improvised item, the chainsword and the custom item in that order, and the Trademark choice names the chainsword.
- [ ] **Step 2: Change `scripts/test-custom-wargear.js:502-524`.** The character there has no archetype, and each entry is bought. New expectations: the wargear keeps all four entries in order; Trademark `'3'` stays `'3'`; Armour-Monger `2` stays `2`; the other three checks stay. Second fixture: each choice stays.
- [ ] **Step 3: Run** both scripts. Expected: FAIL for each new or changed check.
- [ ] **Step 4: Implement** the interface above.
- [ ] **Step 5: Run** all test scripts. Expected: all PASS.
- [ ] **Step 6: Mutation proof.** Remove the `_remapWargearRefs` call from `removeWargearByIndex`: the B1 check gives FAIL. Undo.
- [ ] **Step 7: Commit.** `git commit --author=... -m "Keep owned-item talent choices on their item when the wargear list changes"`

---

### Task 6: Wargear references in the UI; the number choice 0 (A7 confirm, A9 display, B10)

Spec: §7.3 (display), §7.4 (confirm), §13 (B10). Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `creator/tabs/archetype-tab.js:97-100` (the Custom Archetype click) and add `selectCustomArchetype` after `renderList`
- Modify: `creator/tabs/talents-tab.js:313-326` (the choice display)
- Modify: `creator/tabs/character-sheet-tab.js:1664-1676` (the choice display; `:1665` is B10)
- Test: `scripts/test-wargear-refs.js` (extend)

**Interfaces:**
- Consumes: `State.getOldStartingEntries()` (Task 5).
- Produces:
  - `ArchetypeTab.selectCustomArchetype() -> Promise<void>`: when `getOldStartingEntries()` is not empty, it asks `window.api.showConfirm('Custom Archetype removes the starting wargear of <name>: <item names>. Continue?')` and returns on cancel. Then `State.setCustomArchetype()` and `this.renderCustomConfig()`. The click handler calls it.
  - Talents tab and sheet: an owned-item talent with a `null` or absent choice shows `<name> (no item selected)`. The sheet writes no "Chosen:" note for it.
  - Sheet `:1665`: `choice === null || choice === undefined ? '' : this.escapeHtml(String(choice))`.

- [ ] **Step 1: Write the failing checks** (recording DOM stub; load `talents-tab.js`, `archetype-tab.js`, `character-sheet-tab.js`; stub `Glossary.enhanceElement`, `ImprovisedBuilder.talentProfilesHtml` when the sandbox does not load them):
  - `TalentsTab.renderSelected()` with talents `[{ id: 'trademark_weapon', choice: null }]`: the written HTML contains `Trademark Weapon (no item selected)`.
  - `CharacterSheetTab.renderTalents(character)` with the same talent: contains `(no item selected)` and no `Chosen:`. With `[{ id: 'hatred', choice: 0 }]`: contains `Chosen: 0`.
  - A7 confirm: the A7 fixture of Task 5 up to `setCustomArchetype`. `window.api.showConfirm = async () => false`; `await ArchetypeTab.selectCustomArchetype()`: the archetype id and the wargear are unchanged, and the confirm text names the archetype. `showConfirm = async () => true`: the archetype id is `custom`. A character with no starting entries: no confirm call.
- [ ] **Step 2: Run.** Expected: FAIL for each new check.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** all test scripts. Expected: all PASS.
- [ ] **Step 5: Mutation proof.** Remove the confirm from `selectCustomArchetype`: the cancel check gives FAIL. Undo.
- [ ] **Step 6: Commit.** `git commit --author=... -m "Name the removed starting wargear and show a cleared item choice"`

---

### Task 7: Add Starting Wargear (A10 / B2)

Spec: §7.5. Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `creator/tabs/wargear-tab.js:437-451` and `:454-470` (the two add handlers) and add `addStartingWargear` after `renderWargearBrowser`
- Modify: `data/archetypes.json` (three entries, spec §7.5 table)
- Modify: `creator/js/web-api.js:20` (`?v=47` to `?v=48`)
- Test: `scripts/test-starting-wargear.js` (new)

**Interfaces:**
- Consumes: nothing.
- Produces: `WargearTab.addStartingWargear(entries: Array<string | { id, qty }>)`: for each entry whose id `DataLoader.getWargearItem` resolves, it adds `max(0, qty - n)` entries through `State.addWargear(id, true)`, where `n` is the count of entries with that id and `isStarting === true`. Both buttons call it, then `this.render()`.

- [ ] **Step 1: Write the failing test** (full sandbox plus `creator/tabs/wargear-tab.js` with a recording DOM stub):
  - Data: `primaris_intercessor` holds `ballistic_appeasement_auto_reliquary`, `techmarine` holds `astartes_servo_arm`, `striking_scorpion` holds `mandiblasters`, and none holds the old id.
  - Data: the unresolved ids of the archetypes whose `source` is not `apocrypha`, sorted, equal exactly: `adept_robes` (twice), `augmetics`, `commissar_greatcoat`, `company_standard`, `disguise_kit`, `fine_clothing`, `haywire_mine`, `ripped_clothes`, `skitarii_war_plate`, `smoke_grenades` (twice), `tattered_robes` (13 entries).
  - Click: Human `rogue_trader`, `addStartingWargear(rogue_trader.startingWargear)`: 4 entries (no `fine_clothing`). A second call: still 4.
  - Quantity: Human `incursor` entries: 3 `frag_grenades`; a second call adds none; `removeWargearByIndex` of one frag grenade, a third call adds one.
  - `creator/js/web-api.js` contains `'?v=48'` and not `'?v=47'`.
- [ ] **Step 2: Run.** Expected: FAIL for each check.
- [ ] **Step 3: Implement.** Change only the three ids in `data/archetypes.json`; keep the format of the file.
- [ ] **Step 4: Run** all test scripts. Expected: all PASS.
- [ ] **Step 5: Mutation proof.** Remove the resolve test from `addStartingWargear`: the Rogue Trader check gives 5 and FAIL. Undo.
- [ ] **Step 6: Commit.** `git commit --author=... -m "Add only known starting wargear, once, and correct three starting ids"`

---

### Task 8: The load steps (A1 load part, A2 load part, A11 aliases, A15 load part)

Spec: §2.1, §4.3, §8.1, §9.2, §11.2. Suggested dispatch: `implementer` with `model: opus` (a load migration).

**Files:**
- Modify: `creator/js/state.js:158-173` (the dead migration body goes; the three steps go in its place) and add `ID_ALIASES` after `_AUTO_SAVE_KEY` (`:24`)
- Modify: `creator/js/character-check.js` (the `ascensionPackages` row, at the end of the §6.1 lists, `:105`)
- Modify: `scripts/test-load-check.js:31-33` (add `backgrounds.json` to `DATA`), `:126-127` (remove `choice1` / `choice2` from the full character), `:166-187` (the legacy fixture), `:502-507` (the order test), `:355` (the `HOSTILE` row `['skills', 'choice1']`: X1 now deletes that key, so the row uses the unknown key `['skills', 'zzSkill']` with the same bad values and expected `null`; R10 stays pinned)

**Interfaces:**
- Consumes: Task 3 (`archetypeSkillChoices` is a known field).
- Produces:
  - `State.ID_ALIASES = { talents: {4 pairs}, wargear: {3 pairs}, species: {1 pair} }`, spec §9.2.
  - In `loadCharacter`, after `CharacterCheck.repair` and before the custom wargear repair, in this order: X1 (delete `skills.choice`, `choice1`, `choice2`); X2 (aliases in place: each talent string or `.id`, each `wargear[i].id`, each `customArchetype.wargear[i]`, `species.id`); X3 (fill a missing `bonusType` from `DataLoader.getBackgrounds()` when it returns an object; else skip). No warning for X1-X3. The key `ascensionPackages` stays.
  - `CharacterCheck` row: `this._list(c, 'ascensionPackages', [], 'ascensionPackages', paths, isString, true)`.

- [ ] **Step 1: Write the failing checks** in `scripts/test-load-check.js`:
  - Legacy (`:183-188`): the expected character is `LEGACY()` with `ascensions: []` added; `ascensionPackages` stays `['back_from_the_brink']`; no warning. Rename the check to "legacy ascensionPackages stays".
  - Hostile: `ascensionPackages: EVIL` gives `[]` and one warning that names `ascensionPackages`; `['a', 5]` gives `['a']` and a warning that names `ascensionPackages[1]`.
  - Order (`:502-507`): `ascensions` is `[]`, `ascensionPackages` is `[]`, one warning.
  - X1: `skills: { ...base().skills, choice: null, choice1: 4, choice2: 0 }`: no key of `skills` starts with `choice`; the 18 skills load deep-equal; no warning. Remove `choice1: null, choice2: 4` from the full character (`:127`) and change its comment (`:126`).
  - X2: `talents: ['daemonic_summoning_dh', { id: 'forge_the_sword_dh', choice: null }, 'precision_shooter']`, `wargear: [{ id: 'forceshield', isStarting: true }, { id: 'lasgun', isStarting: false }]`, `customArchetype.wargear: ['mist_shield']`, `species.id: 'aeldari_psychosensitive'`: talents become `['daemonic_summons_dh', { id: 'forge_of_souls_dh', choice: null }, 'precision_shooter']`; wargear ids `['force_shield_aeldari', 'lasgun']`; custom wargear `['mistshield']`; species id `'aeldari'`; no warning.
  - X3: an origin `{ id: <the first origin of data/backgrounds.json that has a bonusType> }` with no `bonusType` gets that `bonusType`; an origin with `bonusType: 'wealth'` keeps `'wealth'`; the corpus origin `{ id: 'o1' }` stays with no `bonusType` (the no-op corpus stays green).
- [ ] **Step 2: Run** `node scripts/test-load-check.js`. Expected: FAIL for each new or changed check.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** all test scripts. Expected: all PASS.
- [ ] **Step 5: Mutation proof.** Remove the alias step: the X2 check gives FAIL. Undo.
- [ ] **Step 6: Commit.** `git commit --author=... -m "Keep the old ascension package list and add three named load steps"`

---

### Task 9: The Ascension tab (A1 notice, A12, A13, B9, unknown ascension ids)

Spec: §8. Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `creator/tabs/ascension-tab.js:8-55` (`render`), `:58-88` (`renderSlot`), `bindEvents` (new handlers only, at its end)
- Modify: `creator/js/state.js:1452-1457` (`getEffectiveTier`) and add `clearLegacyAscensionPackages` after `removeAscensionChoice`
- Test: `scripts/test-ascension-tab.js` (new)

**Interfaces:**
- Consumes: Task 8 (`ascensionPackages` stays at load).
- Produces:
  - `State.getEffectiveTier()`: counts an entry only when `(type === 'package' && packageId) || (type === 'archetype' && archetypeId)`.
  - `State.clearLegacyAscensionPackages()`: deletes `character.ascensionPackages` and notifies `'ascension'`.
  - `AscensionTab.render()`: order of the output: the A1 notice (class `info-box`, button `#btn-clear-legacy-packages`), the block "Ascensions with no slot" (each row has a `button.btn-remove.btn-remove-ascension` with `data-target-tier`), then today's tier 5 message or the summary and the slots. The slot loop starts at `Math.max(1, startingTier + 1)`.
  - `renderSlot`: a selected `packageId` or `archetypeId` that the data does not have gives a row "Unknown ascension package (<id>)" or "Unknown archetype (<id>)" with the same remove button.
  - The remove buttons call `State.setAscension(tier, null)` and `this.render()`.

- [ ] **Step 1: Write the failing test** (full sandbox plus `ascension-tab.js`, recording DOM stub; read the HTML written to `#ascension-content`):
  - A13: tier 1, `ascensions: [{ targetTier: 2, type: 'package', packageId: null, archetypeId: null }]`: `getEffectiveTier() === 1`. With `packageId: 'back_from_the_brink'`: `2`.
  - A12: tier 4, ascension at 3 with `back_from_the_brink`: the HTML contains `Ascensions with no slot`, `Back from the Brink` and `data-target-tier="3"` on a `btn-remove-ascension`. Tier 5 with the same entry: the block and the tier 5 message both show.
  - A1: `ascensionPackages: ['back_from_the_brink', 'zz<b>']`: the HTML contains `Back from the Brink`, `zz&lt;b&gt;`, and `Remove old package list`. `clearLegacyAscensionPackages()`: `'ascensionPackages' in State.character === false`.
  - B9: tier `-300000`: render ends in less than 500 ms and the count of `class="ascension-slot"` is at most 6.
  - Unknown: tier 2, ascension at 3 with `packageId: 'zz'`: the HTML contains `Unknown ascension package (zz)`.
- [ ] **Step 2: Run.** Expected: FAIL for each check.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** all test scripts. Expected: all PASS.
- [ ] **Step 5: Mutation proof.** Start the slot loop at `startingTier + 1`: the B9 check gives FAIL. Undo.
- [ ] **Step 6: Commit.** `git commit --author=... -m "Show old, slotless and unknown ascensions with a Remove control"`

---

### Task 10: The "any skill" choice in the UI (A2)

Spec: §4.4 (UI and prerequisite). Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `creator/tabs/archetype-tab.js:222` (one new call after `renderKeywordChoices`), `:256` (one new bind call), `:680-694` (`formatBonuses`); add `renderSkillChoices` and `bindSkillChoiceEvents` after `bindKeywordChoiceEvents`
- Modify: `creator/tabs/ascension-tab.js:474-484` (the skill part of `checkArchetypeAscensionPrereqs`)
- Test: `scripts/test-skill-choice-ui.js` (new)

**Interfaces:**
- Consumes: `State.setArchetypeSkillChoice`, `XPCalculator.SKILL_KEYS` (Tasks 2, 3).
- Produces:
  - `ArchetypeTab.renderSkillChoices(archetype, character) -> string`: `''` when the archetype has no `skillBonus` key outside `SKILL_KEYS`. Else a `detail-section` titled "Skill of your choice" with one `div.archetype-keyword-choice` per key, each with a label "Skill of your choice (<value>)" and a `select.skill-choice-select[data-choice-key]`: first option `-- Select a skill --`, then each skill (`DerivedStats.formatSkillName`) that no other key holds.
  - `bindSkillChoiceEvents(detail)`: on change, `State.setArchetypeSkillChoice(key, value)` then `this.renderDetail()`.
  - `formatBonuses`: a key outside `SKILL_KEYS` (skills only) prints `Skill of your choice <value>`.
  - `checkArchetypeAscensionPrereqs`: the real skill keys as today; the other keys count by spec §4.4: met when the count of different real skills at the value or more is at least the count of those keys. Text part: `Skills of your choice: <count> at <value> (have <n>)`, with the unmet class when unmet.

- [ ] **Step 1: Write the failing test** (full sandbox plus `archetype-tab.js` and `ascension-tab.js`, recording DOM stub):
  - `renderSkillChoices(<inquisitor>, character)` with no choice: two selects with `data-choice-key="choice1"` and `"choice2"`, each with 19 options. With `archetypeSkillChoices: { choice1: 'insight' }`: the `choice2` select has no `value="insight"` option.
  - `renderSkillChoices(<ganger>, character) === ''`.
  - `formatBonuses({ choice1: 4, choice2: 4 }, false) === 'Skill of your choice 4, Skill of your choice 4'`.
  - Prerequisite: `inquisitor` with `skills.insight = 4` only: `met === false` (with `ignorePrerequisites` off), the text contains `Skills of your choice: 2 at 4 (have 1)`. With `insight 4` and `scholar 5`: `met === true`.
- [ ] **Step 2: Run.** Expected: FAIL for each check.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** all test scripts. Expected: all PASS.
- [ ] **Step 5: Mutation proof.** Count each `choice` key against the same highest skill: the one-skill check gives `met === true` and FAIL. Undo.
- [ ] **Step 6: Commit.** `git commit --author=... -m "Let the player select the skill of an any-skill archetype bonus"`

---

### Task 11: Unknown ids in the Wargear, Talents and Powers tabs (A11, B2, B11)

Spec: §9.3 (first five rows), §9.4. Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `creator/tabs/wargear-tab.js:72-75` (unknown entries go to a group "Unknown"), `:117-121` (render the group after Equipment), `:131` (the confirm name uses the id), `:166-169` (upgrade text), `:866-867` (upgrade modal)
- Modify: `creator/tabs/talents-tab.js:308-309` and the remove button lines `:343-345`
- Modify: `creator/tabs/powers-tab.js:45-54` (the non-psyker branch), `:146-184` (discipline chips), `:270-271`
- Test: `scripts/test-unknown-ids.js` (new)

**Interfaces:**
- Consumes: nothing.
- Produces: rows by spec §9.3:
  - Wargear: `<div class="wargear-group"><h4>Unknown</h4>` with one `wargear-item wargear-item-owned` per entry, text `Unknown wargear (<id>)`, and the existing `button.btn-remove-wargear[data-index]`.
  - Upgrades: `Unknown upgrade (<id>)` in the owned line and in the modal, where it gets the existing modal remove button with `data-id`.
  - Talents: a `selected-talent` with `Unknown talent (<id>)` and the existing `REMOVE` button (`data-id`), also when `ascensionGranted` is true.
  - Powers: a `power-chip` with `Unknown power (<id>)` and the existing `.power-chip-remove`. The non-psyker branch writes the info box, then `<div id="selected-powers">` and the chosen discipline chips, and binds them. The chosen discipline chips show whenever `unlockedDisciplines` is not empty.

- [ ] **Step 1: Write the failing test** (full sandbox plus the three tabs, recording DOM stub; stub `Glossary.enhanceElement`):
  - Wargear `[{ id: 'no_such', isStarting: true }, { id: 'lasgun', isStarting: false, upgrades: ['zz_up'] }]`: `renderCurrentWargear()` HTML contains `Unknown wargear (no_such)` and `data-index="0"` on a `btn-remove-wargear`, and `Unknown upgrade (zz_up)`. `showUpgradeModal(1)`: the modal HTML contains `Unknown upgrade (zz_up)` and `data-id="zz_up"`.
  - Talents `['zz_t', { id: 'zz<b>', ascensionGranted: true }]`: the HTML contains `Unknown talent (zz_t)`, `Unknown talent (zz&lt;b&gt;)`, and two `btn-remove`.
  - Powers: Human `sanctioned_psyker`, `psychicPowers: ['smite', 'zz_p']`: contains `Unknown power (zz_p)` and `data-id="zz_p"`. Human `ganger`, `psychicPowers: ['smite']`, `unlockedDisciplines: ['Biomancy']`, `ignorePrerequisites` off: the HTML contains `does not have psychic abilities`, `Smite`, and `data-discipline="Biomancy"`.
- [ ] **Step 2: Run.** Expected: FAIL for each check.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** all test scripts. Expected: all PASS.
- [ ] **Step 5: Mutation proof.** Put back `if (!talent) continue;` in the Talents tab: the talent checks give FAIL. Undo.
- [ ] **Step 6: Commit.** `git commit --author=... -m "Show unknown wargear, upgrades, talents and powers with a Remove control"`

---

### Task 12: Unknown ids in the Injuries, Background and Species tabs (A11, B11, A20)

Spec: §9.3 (other rows), §9.6. Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `creator/tabs/injuries-tab.js:41-43`, `:86-88`, `:188-190` (the three list maps)
- Modify: `creator/tabs/background-tab.js:65-90` (`populateSelects`, not the repair call at `:62-63`)
- Modify: `creator/tabs/species-tab.js:81-100` (selected card) and the card binding after `:117` (a remove handler with `stopPropagation`)
- Test: `scripts/test-unknown-ids.js` (extend)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - Injuries: an `injury-item` with `Unknown injury (<id>)` or `Unknown mutation (<id>)` and the existing remove button of its list (`data-index`).
  - Background: in each select, when the stored entry id is not in the data list, `<option value="<id>" selected disabled>Unknown <origin|accomplishment|goal> (<id>)</option>` after the first option.
  - Species: in the selected card, a `div.card-suboption` per stored sub-option whose `type` is not a config type or whose `optionId` is not an option of its config: `Unknown sub-option (<id>)`; and per `mutation` entry after the first `tier` entries of a `countByTier` config: `<name> (above the limit of Tier <n>)`. Each has `button.btn-small.btn-remove-suboption[data-type][data-option-id]` that calls `State.removeSpeciesSubOption(type, id)` and stops the card click.

- [ ] **Step 1: Write the failing checks** in `scripts/test-unknown-ids.js`:
  - `memorableInjuries: [{ id: 'zz_m', escalated: false }]`, `traumaticInjuries: [{ id: 'zz_t', side: null }]`, `mutations: [{ id: 'zz_mu', subChoice: null }]`: the HTML contains `Unknown injury (zz_m)`, `Unknown injury (zz_t)`, `Unknown mutation (zz_mu)`, and `data-index="0"` on each of the three remove classes.
  - Background origin `{ id: 'aeldari_craftworld', bonusType: 'wealth' }`: the origin select HTML contains `value="aeldari_craftworld" selected disabled` and `Unknown origin (aeldari_craftworld)`.
  - Species Human with `subOptions: [{ type: 'discipline', optionId: 'runes_of_fate' }]`: the card HTML contains `Unknown sub-option (runes_of_fate)` and `data-option-id="runes_of_fate"`.
  - Kroot, tier 1, three `mutation` sub-options with real option ids: two rows contain `(above the limit of Tier 1)`.
- [ ] **Step 2: Run.** Expected: FAIL for each new check.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** all test scripts. Expected: all PASS.
- [ ] **Step 5: Mutation proof.** Remove the tier mark: the Kroot check gives FAIL. Undo.
- [ ] **Step 6: Commit.** `git commit --author=... -m "Show unknown injuries, backgrounds and sub-options, and Kroot mutations above the tier"`

---

### Task 13: One background bonus; no write in a render (A14, A15)

Spec: §11. Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `creator/js/derived-stats.js:5-14` (`getBackgroundBonus`)
- Modify: `creator/tabs/background-tab.js:62-63` (the repair call goes), `:173-209` (`renderBonusDisplay`: the notice), `:252-276` (`repairMissingBonusTypes` goes)
- Modify: `creator/tabs/character-sheet-tab.js:76-77` (the repair call goes), `:2797-2825` (`repairBackgroundBonusTypes` goes)
- Test: `scripts/test-background-bonus.js` (new)

**Interfaces:**
- Consumes: Task 8 (X3 fills `bonusType` at load); Task 12 changed other lines of `populateSelects`.
- Produces: `DerivedStats.getBackgroundBonus(character, statType) -> 0 | 1` by spec §11.1. `renderBonusDisplay` shows the spec §11.1 text when an entry is set and `bonusUsed` is `null`.

- [ ] **Step 1: Write the failing test** (full sandbox plus `background-tab.js` and `character-sheet-tab.js`, recording DOM stub):
  - Three entries with `bonusType: 'maxWounds'`, `bonusUsed: 'origin'`: `getBackgroundBonus(c, 'maxWounds') === 1`. `bonusUsed: null`: `0`. `bonusUsed: 'zz'`: `0`. `bonusUsed: 'goal'` with `goal: null`: `0`.
  - An origin with a real id and no `bonusType`: `BackgroundTab.render()` leaves `JSON.stringify(State.character)` unchanged.
  - `CharacterSheetTab.repairBackgroundBonusTypes === undefined` and `BackgroundTab.repairMissingBonusTypes === undefined`.
  - `bonusUsed: null`, origin set: `#background-bonus` HTML contains `Select one bonus with USE THIS BONUS`.
- [ ] **Step 2: Run.** Expected: FAIL for each check.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** all test scripts. Expected: all PASS.
- [ ] **Step 5: Mutation proof.** Add back the `accomplishment` line of the old sum: the `bonusUsed: 'origin'` check gives `2` and FAIL. Undo.
- [ ] **Step 6: Commit.** `git commit --author=... -m "Apply one background bonus and stop the renders that write bonusType"`

---

### Task 14: The sheet: unknown rows, box bound, tracker getters (A11, B3 render, B5)

Spec: §9.4 (sheet), §10.3, §13.3. Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `creator/tabs/character-sheet-tab.js:348` (Powers tab test), `:394`, `:398` (`--n`), `:710-727` (both box functions), `:1257-1268` (`renderEquipment`), `:1660-1662` (unknown talent), `:1720-1723` and `:1741-1742` (`renderPsychicPowers`), `:1793-1794`, `:1818-1819` (injuries), `:1869-1870` (mutations), `:2057-2058` (`copySummary` wargear), `:2086` (`copySummary` powers test)
- Modify: `creator/js/state.js:1138-1141` (`getCurrentWounds`), `:1159-1161` (`getCurrentShock`), `:1256-1262` (`getCurrentFaith`)
- Test: `scripts/test-sheet-bounds.js` (new)

**Interfaces:**
- Consumes: Task 6 and Task 13 lines of the sheet (do not change them).
- Produces:
  - `CharacterSheetTab.BOX_LIMIT = 50`. Both box functions draw at most `BOX_LIMIT` boxes and then `<span class="sheet-empty">+<n> more</span>`.
  - `CharacterSheetTab.hasStoredPowers(character) -> boolean`: a `psychicPowers` id that is not in `State.UNIVERSAL_ABILITY_IDS`. The three psyker tests use `State.isPsyker() || this.hasStoredPowers(character)`.
  - The getters by spec §10.3.
  - Unknown rows by spec §13.3: the text `Unknown <talent|power|wargear|injury|mutation> (<id>)`, escaped.

- [ ] **Step 1: Write the failing test** (full sandbox plus `character-sheet-tab.js`; stub `ThreatCard.render`, `Glossary.enhanceElement` as needed; stub `navigator.clipboard.writeText` to record the text):
  - `renderTrackingBoxes('wounds', 0, 30000)`: 50 `tracking-box` spans, the text `+29950 more`, and less than 200 ms. `renderFollowerBoxes('wounds', 0, 30000)`: the same. `renderTrackingBoxes('wounds', 2, 5)`: 5 boxes, 2 `filled`.
  - Getters: three talents whose effect has `You gain +1 Faith.`, then remove two, `currentFaith: 2`: `getCurrentFaith() === 1`; `modifyCurrentFaith(1)` gives `getCurrentFaith() === 1`. `currentWounds: 7` with a max of 3: `getCurrentWounds() === 3` and `State.character.currentWounds === 7`.
  - Unknown rows: `renderTalents` with `['zz']` contains `Unknown talent (zz)`; `renderEquipment` with `[{ id: 'zz_w' }]` contains `Unknown wargear (zz_w)`; `renderInjuriesCorruption` with a memorable injury `zz` contains `Unknown injury (zz)`; `renderMutations` with `zz` contains `Unknown mutation (zz)`; `copySummary` text contains `Unknown wargear (zz_w)`.
  - Powers: Human `ganger`, `psychicPowers: ['smite']`: `renderPsychicPowers(c)` is not `''` and contains `Smite`.
- [ ] **Step 2: Run.** Expected: FAIL for each check.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** all test scripts. Expected: all PASS. (`scripts/test-sheet-tabs.js` stubs `State`; add `UNIVERSAL_ABILITY_IDS: []` to its stub only if a check needs it, and name the line in the commit body.)
- [ ] **Step 5: Mutation proof.** Remove the bound from `renderTrackingBoxes`: the box count check gives FAIL. Undo.
- [ ] **Step 6: Commit.** `git commit --author=... -m "Bound the tracker boxes, clamp the trackers and show unknown ids on the sheet"`

---

### Task 15: Number inputs (B3, B4)

Spec: §10.1, §10.2. Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `creator/js/state.js:204-225` (`setTier`, `setRank`, `setAdditionalXP`), `:1057-1060` (`setCorruptionPoints`); add `_intInRange` before `setName`
- Modify: `creator/tabs/setting-tab.js:11-24` (refresh the input after a refused value)
- Modify: `creator/tabs/injuries-tab.js` (the corruption handler near `:331`, not the lines of Task 12)
- Modify: `creator/tabs/followers-tab.js:218-224` (Members and Living)
- Test: `scripts/test-number-inputs.js` (new)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `State._intInRange(value, min, max) -> number | null` by spec §10.2.
  - Each of the four setters returns `true` when it stores and `false` when it refuses; a refused value does not notify.
  - Setting tab: on `false`, `SettingTab.refresh()`. Corruption: on `false`, the input gets the stored value. Followers: Members `1..Infinity`, Living `0..follower.count`; on a refused value, no `applyFieldChange` and a re-render.

- [ ] **Step 1: Write the failing test** (full sandbox; plus `setting-tab.js` and `followers-tab.js` with a DOM stub that records `addEventListener` handlers):
  - Rank 2: `setRank('30000')`, `'-5'`, `'2.5'`, `'1e5'`, `''`: each returns `false`, the rank stays `2`, and the listener count does not change. `setRank('3')`: `true`, rank `3`.
  - `setAdditionalXP('-5')`: `false`; `'40'`: `true`, `40`. `setCorruptionPoints('-1')`: `false`; `'12'`: `12`. `setTier('0')`, `'6'`: `false`; `'4'`: `4`.
  - Setting tab: fire the `change` handler of `#character-rank` with `value: '30000'`: the input value is then `'2'`.
  - Followers: Members `'2.5'` and Living above Members keep the stored values.
  - G1: `loadCharacter({ ...<a valid character>, rank: 30000 })` keeps `rank === 30000`.
- [ ] **Step 2: Run.** Expected: FAIL for each check except the G1 check.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** all test scripts. Expected: all PASS.
- [ ] **Step 5: Mutation proof.** Use `parseInt(rank) || 1` again in `setRank`: the `'30000'` check gives FAIL. Undo.
- [ ] **Step 6: Commit.** `git commit --author=... -m "Refuse a typed number outside the range of its input"`

---

### Task 16: Settings storage and the Load confirm (A16, A17, A18)

Spec: §12. Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `creator/js/state.js:1467-1481` (`setEnabledSources`, `setIgnorePrerequisites`); add `_SETTINGS_KEY` after `_AUTO_SAVE_KEY` (Task 8 added `ID_ALIASES` after that line: add the key after `ID_ALIASES`) and `saveSettings`, `getSavedSettings` after `clearAutoSave`
- Modify: `creator/js/app.js:158-167` (Load handler), `:469-474` (`_mergeEnabledSources`), `:476-497` (`checkAutoSave`)
- Test: `scripts/test-settings-persist.js` (new)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `State._SETTINGS_KEY = 'wng-creator-settings'`. `State.saveSettings()`: writes `{ enabledSources, knownSources, ignorePrerequisites }` in a `try` (the `knownSources` rule of `_performAutoSave:1527`). `State.getSavedSettings() -> object | null` (a `try` around the parse).
  - `setEnabledSources` and `setIgnorePrerequisites` call `saveSettings()`.
  - `App._mergeEnabledSources(saved)`: uses only the string entries of `saved.enabledSources`.
  - `App.checkAutoSave()`: `const settings = State.getSavedSettings() || State.getAutoSave()`; it applies the sources only when `Array.isArray(settings.enabledSources)`, and `ignorePrerequisites` only when `=== true`; then the character part as today. It returns early only after the settings part.
  - Load handler: when `character.name || character.species?.id || character.archetype?.id`, `await window.api.showConfirm('Load a character? Unsaved changes will be lost.', 'Load Character')`; on cancel, return before `CharacterIO.load()`.

- [ ] **Step 1: Write the failing test.** A context with `state.js` (and its loads), `app.js`, a `localStorage` stub on a shared `Map`, `document` with `addEventListener() {}` and a `getElementById` that records `click` handlers, `SettingsTab: { sourceButtons: [{ id: 'core' }, { id: 'fspg' }], refresh() {} }`, `SettingTab: { refresh() {} }`, `CharacterIO: { load: async () => { loads++; return { success: false, error: 'Load cancelled.' }; } }`, and `App.switchTab` / `App.switchSection` replaced by no-ops. Checks:
  - A16: blank character, `setEnabledSources(['core'])`: the settings key holds `enabledSources: ['core']`. `newCharacter()`: the key stays. A new context on the same `Map`: `App.checkAutoSave()` gives `State.enabledSources` `['core']`.
  - Fallback: only the old autosave `{ character: <a valid character>, enabledSources: ['core'], knownSources: ['core', 'fspg'], ignorePrerequisites: true }`: after `checkAutoSave()`, sources `['core']`, `ignorePrerequisites === true`, and the settings key now exists.
  - A17: autosave `enabledSources` of `{}`, `5`, `true`, `'core'`: no throw, and `State.enabledSources` is the default list. `['core', 5]`: `['core']`.
  - A18: `App.initHeaderButtons()`; a character with a name and `showConfirm = async () => false`: fire the Load handler; `loads === 0`. With `true`: `loads === 1`. A blank character: no confirm call and `loads === 1`.
- [ ] **Step 2: Run.** Expected: FAIL for each check.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** all test scripts. Expected: all PASS.
- [ ] **Step 5: Mutation proof.** Test truthiness again in `checkAutoSave`: the `{}` check throws and gives FAIL. Undo.
- [ ] **Step 6: Commit.** `git commit --author=... -m "Store the settings under their own key and confirm before Load"`

---

### Task 17: Render guards (B6, B7, B8)

Spec: §13. Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `creator/js/threat-card.js:278-286` (`renderTextSection`)
- Modify: `creator/tabs/wargear-tab.js:642` (one line; Task 11 changed other lines of this file)
- Modify: `creator/js/relic-wizard.js:67` (`open`), `:295`, `:503`, `:770` (the three lookups)
- Test: `scripts/test-render-guards.js` (new)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ThreatCard.renderTextSection(label, text)`: an array renders one `<p><strong>name</strong>: description</p>` per entry; a string renders as today; an empty value gives `''`.
  - Wargear browser range: a string prints as stored; an object as `short/medium/long`; else `-`.
  - `RelicWizard.open(index)`: `formId` is the stored form only when `relics.forms` has it, else `null`. The three lookups use a guard and give no throw for an unknown form.

- [ ] **Step 1: Write the failing test** (load `threat-card.js`, `wargear-tab.js`, `relic-wizard.js` in the full sandbox with a recording DOM stub):
  - `ThreatCard.render(<necron_warrior from data/threats.json>)` contains `Their Number Is Legion` and not `[object Object]`. A threat with a string `mobAbilities` contains that string.
  - `WargearTab.renderRangedWeaponsCards([<the first ranged weapon with a string range>], {})` contains that string and not `undefined`.
  - Wargear `[{ id: 'flak_armour', isStarting: false, relic: { name: 'X', form: 'zz', originalOwner: null, anointment: null, power: null, oddities: [] } }]`: `RelicWizard.open(0)` gives no throw and `RelicWizard.wizard.formId === null`. With `wizard.formId = 'zz'` and `wizard.power = 'p'` set directly, `getSelectedPower()` gives `null` and no throw.
- [ ] **Step 2: Run.** Expected: FAIL for each check.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** all test scripts. Expected: all PASS.
- [ ] **Step 5: Mutation proof.** Remove the array branch: the Necron check gives FAIL. Undo.
- [ ] **Step 6: Commit.** `git commit --author=... -m "Render Mob Abilities lists, text ranges and relics with an unknown form"`

---

## Order of the tasks that share a file

| File | Tasks in order |
|---|---|
| `creator/js/state.js` | 2, 3, 4, 5, 8, 9, 14, 15, 16 |
| `creator/js/character-check.js` | 3, 8 |
| `creator/tabs/character-sheet-tab.js` | 6, 13, 14 |
| `creator/tabs/wargear-tab.js` | 7, 11, 17 |
| `creator/tabs/ascension-tab.js` | 9, 10 |
| `creator/tabs/archetype-tab.js` | 6, 10 |
| `creator/tabs/talents-tab.js` | 6, 11 |
| `creator/tabs/background-tab.js` | 12, 13 |
| `creator/tabs/injuries-tab.js` | 12, 15 |
| `scripts/test-load-check.js` | 3, 8 |
| `scripts/test-custom-wargear.js` | 3, 5 |

Each line number in a task is from the tree at `44084ae`. A later task finds its lines by the function name, because an earlier task moves them.
