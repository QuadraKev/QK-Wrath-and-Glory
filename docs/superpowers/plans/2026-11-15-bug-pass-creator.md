# Bug Pass of the Creator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the defects A1-A20 and B1-B11 of the creator so that no UI action loses a thing that the user made, no stored value goes wrong at load, and no list hides an entry.

**Architecture:** `XPCalculator` gets the known stat names and one baseline function. `State` gets the helpers `_withRebase`, `_archetypeGrantIds`, `_grantedPowerIds`, `_applyPowerGrants`, `_releasePowerGrants`, `_settleFreePicks`, `_remapWargearRefs` and `_intInRange`, three named load steps, two optional stored fields, and same-id guards. Each tab shows an unknown id as a visible row with a Remove control. Small guards close the render defects. No new script file, no new CSS file.

**Tech Stack:** Vanilla JS, global-object modules, no build step. Tests are plain Node scripts that load the browser files into a `vm` context.

**Spec:** `docs/superpowers/specs/2026-11-15-bug-pass-creator-design.md`. Read it before each task. Each task names its spec sections.

**Fix round 2 (re-review 1, controller rulings CC14-CC18).** The task numbers stay as in fix round 1. Fix round 1 (plan review 1, rulings CC1-CC13) gave the tasks new numbers. Old to new:

| Old | New | Old | New |
|---|---|---|---|
| 1 | 1 | 10 | 11 |
| 2 | 2 | 11 | 12 |
| 3 | 3 (3a) and 4 (3b) | 12 | 13 |
| 4 | 5 | 13 | 14 |
| 5 | 6 | 14 | 15 (14a) and 16 (14b) |
| 6 | 7 | 15 | 17 |
| 7 | 8 | 16 | 18 |
| 8 | 9 | 17 | 19 |
| 9 | 10 | | |

## Global Constraints

- Follow `CLAUDE.md` and `STYLE_GUIDE.md` of the repo: vanilla JS, one `const` global object per file, no ES modules, no classes, no IIFEs, no build step.
- Write all prose (code comments, commit messages, visible UI text) in ASD-STE100 Simplified Technical English: short sentences, active voice.
- Author each commit `--author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>"`. No attribution line and no co-author line.
- The 19 existing test scripts stay green, except the lines that a task names as changed. Run: `for f in scripts/test-*.js; do node "$f" > "/tmp/claude-0/bugpass-$(basename "$f").log" 2>&1 || echo "FAIL $f"; done; echo done`. Read only the `FAIL` lines and the last lines of a failing log.
- Each new test follows the repo pattern: a plain Node script `scripts/test-*.js` that loads the real files into a `vm` context, prints `PASS` / `FAIL` lines and a summary line, and exits with code 1 on a failure. Copy the `check`, `load`, `get` helpers of `scripts/test-load-check.js:14-43`. A test that renders a tab copies the recording DOM stub of `scripts/test-tab-escapes.js:23-70`; where a check must fire a handler or read a class, the stub records `addEventListener` handlers and keeps `classList` in a `Set`.
- The "full sandbox" of a test means: `creator/js/data-loader.js` with `DataLoader.cache` filled from `data/` (`species`, `archetypes`, `talents`, `weapons`, `armor`, `equipment`, `psychic-powers`, `ascension-packages`, `backgrounds`, `weapon-upgrades`, `injuries-corruption`, `keyword-categories`, `holy-relics`, `glossary`, `threats`), then `xp-calculator.js`, `derived-stats.js`, `prerequisite.js`, `keyword-bonus.js`, `followers.js`, `custom-wargear.js`, `character-check.js`, `state.js`, `relic-wizard.js`, `improvised-builder.js`, with `window: { api: {} }`, a `localStorage` stub and `setTimeout: () => 0`. This is the context of the "setters" block, `scripts/test-load-check.js:196-208`. Unless a fixture says otherwise, it calls `State.setIgnorePrerequisites(true)` and `State.setAdditionalXP('2000')` after `State.newCharacter()`.
- Each fixture below was checked against the data at `44084ae` (ids, archetype bonuses, species maximums). A check must fail on the code before its task; Step 2 of each task proves it.
- No browser window on the owner's desktop. No task needs a browser. If a check needs one, it is `headless: true` on a port that is not 8137.
- G1 has the highest priority: a load step changes a stored value only in the cases X1, X2, X3 of spec §2.1.
- Cache busting: Task 1 bumps `?v=129` to `?v=130` on all 36 tags of `creator/index.html` (lines 12-13 and 523-556). Task 17 changes only line 185 of that file (the Rank input), after Task 1. No later task bumps `?v=` again: the branch ships as one deploy. Task 8 bumps the creator data version in `creator/js/web-api.js` from 47 to 48.
- Two tasks never change the same lines. Where two tasks change one file, the table "Order of the tasks that share a file" at the end gives the order. Each task names the functions it changes; it changes no other function of that file. A line number is from the tree at `44084ae`; a later task finds its lines by the function name.
- Visible text of a new row or control uses the classes of its tab. Escape each id and each name that comes from the character with the `escapeHtml` of that tab, and use `escapeHtml(String(v))` for a number.

## Review Focus

1. **A raised value after a parent change (Task 3).** Expected: a value that the user bought above the old free value stays, except above the maximum of a new species; one at the old free value moves to the new free value. Pinned by the Tech-Adept checks and the Ogryn maximum check.
2. **A power that the user bought or picked (Task 5).** Expected: no archetype change, no ascension change and no ability change removes it; a free pick that no slot covers becomes paid. Pinned by fixtures D, F, H, J, K, L.
3. **A talent choice after a wargear change (Task 6).** Expected: it names the same item, or it is `null` when its item goes. Pinned by the B1 sequence and the Custom Archetype sequence.
4. **The three load steps (Task 9).** Expected: each other value loads deep-equal; the no-op corpus and the setters block stay green with only the named fixture changes.
5. **The start path and Load (Task 18).** Expected: empty storage, both keys, blocked storage and a cancelled Load each leave the character as it was.

---

### Task 1: Cache bump

**Files:**
- Modify: `creator/index.html:12-13` (two `<link>` tags), `:523-556` (34 `<script>` tags)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing for other tasks. Task 17 later changes line 185 of the same file; no line is shared.

- [ ] **Step 1: Write the failing check.** Run `grep -c '?v=130' creator/index.html`. Expected now: `0`.
- [ ] **Step 2: Change each `?v=129` to `?v=130`** on the 36 tags. Do not change the Google Fonts and Turnstile URLs.
- [ ] **Step 3: Run the check.** `grep -c '?v=130' creator/index.html` gives `36`. `grep -c '?v=129' creator/index.html` gives `0`.
- [ ] **Step 4: Mutation proof.** Change one tag back to `?v=129`: the first count gives `35`. Undo.
- [ ] **Step 5: Commit.** `git commit --author=... -m "Bump the creator cache version to 130"`

---

### Task 2: Known stat names, one baseline, the Stats tab limits (A3, A2 part, P4)

Spec: §4.1, §4.2. Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `creator/js/xp-calculator.js:79-113` (`calculateAttributeXP`, `calculateSkillXP`) and add three members
- Modify: `creator/js/state.js:577-603` (`resetStats`), `:623-643` (`decreaseAttribute`), `:662-673` (`decreaseSkill`)
- Modify: `creator/tabs/stats-tab.js:88-97` (the attribute minimum) and `:189` (the skill minimum)
- Test: `scripts/test-stat-baseline.js` (new)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `XPCalculator.ATTRIBUTE_KEYS: string[]` (7 names) and `XPCalculator.SKILL_KEYS: string[]` (18 names), in the order of `State.createNewCharacter()`.
  - `XPCalculator.getBaseline(character) -> { attributes: { [name]: number }, skills: { [name]: number } }` by spec §4.2. It reads `character.archetypeSkillChoices` when it is a plain object; Task 3 and Task 4 add the writers.
  - `calculateAttributeXP(character, archetype)` and `calculateSkillXP(character, archetype)` keep their signatures. They loop over `ATTRIBUTE_KEYS` / `SKILL_KEYS`, use `getBaseline(character)` and ignore the `archetype` argument. A value above the table costs as the edge (12, 8). A value that is not a finite number costs 0.
  - `State.resetStats()` sets each known name to its baseline and does not touch another key.
  - `decreaseAttribute(attr)`, `decreaseSkill(skill)` and the two minimums of the Stats tab take their minimum from `getBaseline(character)`.

- [ ] **Step 1: Write the failing test** `scripts/test-stat-baseline.js` in the full sandbox plus `creator/tabs/stats-tab.js` with the recording DOM stub. Build each character with `State.createNewCharacter()` and direct field writes. Checks:
  - `SKILL_KEYS` equals `Object.keys(State.createNewCharacter().skills)`; `ATTRIBUTE_KEYS` likewise.
  - Human, archetype `ganger` (skill bonus `cunning: 1`), each skill at the Ganger baseline, plus `choice1: 4, choice2: 4`: `calculateSkillXP` is `0`. (Before: 40.)
  - The same character plus `attributes.foo = 3`: `calculateAttributeXP` equals the value without `foo`.
  - `attributes.strength = 13`: `calculateAttributeXP` is a finite number equal to `ATTRIBUTE_COSTS[12] - ATTRIBUTE_COSTS[1]`. `skills.weaponSkill = 9`: `calculateSkillXP` equals `SKILL_COSTS[8] - SKILL_COSTS[0]`.
  - `getBaseline` of Human `inquisitor` (`attributeBonus: { intellect: 4, willpower: 4 }`) with no `archetypeSkillChoices`: `attributes.intellect === 4`, `attributes.willpower === 4`, each skill `0`, and no key `choice1` in `skills`. With `archetypeSkillChoices: { choice1: 'insight', choice2: 'scholar' }`: `insight === 4`, `scholar === 4`. With `{ choice1: 'zz' }`: each skill `0`.
  - Human `inquisitor`, `skills.choice1 = 7`, `skills.insight = 6`; `State.resetStats()`: `skills.choice1 === 7`, `skills.insight === 0`, and no skill value is NaN.
  - Human `inquisitor`, `archetypeSkillChoices: { choice1: 'insight' }`, `skills.insight = 4`: `State.decreaseSkill('insight') === false`.
  - The same character: `StatsTab.renderSkills()` writes the insight row with its decrease button disabled: the row HTML matches `/btn-decrease" data-skill="insight"[^>]*disabled/`.
- [ ] **Step 2: Run** `node scripts/test-stat-baseline.js`. Expected: FAIL lines for the Ganger check, the 13 / 9 checks, the `getBaseline` checks (no function), the reset check, the decrease check and the Stats tab check.
- [ ] **Step 3: Implement** the interface above.
- [ ] **Step 4: Run** the new test and all test scripts. Expected: all PASS.
- [ ] **Step 5: Mutation proof.** Put back the old body of `calculateSkillXP` (`xp-calculator.js:100-113` at `44084ae`: `Object.entries(character.skills)` with `baseline = archetype?.skillBonus?.[skill] || 0`): the Ganger check gives FAIL (`40`). Undo.
- [ ] **Step 6: Commit.** `git commit --author=... -m "Sum the XP of the known stat names only and add one stat baseline"`

---

### Task 3 (3a): A parent change keeps bought values; same-id guards; species maximum; the custom record stays (A4, A5, A6, A7b, CC2, CC7)

Spec: §5. Suggested dispatch: `implementer` with `model: opus` (it changes what the app stores).

**Files:**
- Modify: `creator/js/state.js:234-259` (`setSpecies`), `:344-371` (`setArchetype`: all lines except the psyker block `:372-387`), `:397-404` (`clearArchetype`: lines `:398-399` and `:403`), `:423-425` and `:452` (`setCustomArchetype`: the guard, the write, the removal of the record reset at `:425`, the removal of `resetStats()` at `:452`); add `_withRebase` and `_clampToSpeciesMaximums` after `resetStats`
- Modify: `creator/js/prerequisite.js:225` (the custom keywords count only when `character.archetype?.id === 'custom'`, CC14)
- Modify: `scripts/test-load-check.js:219` (comment) and `:294` (setters: the `skillChoiceKey` check)
- Modify: `scripts/test-custom-wargear.js:503` (the stub)
- Test: `scripts/test-stat-baseline.js` (extend)

**Interfaces:**
- Consumes: `XPCalculator.getBaseline`, `XPCalculator.ATTRIBUTE_KEYS`, `XPCalculator.SKILL_KEYS` (Task 2).
- Produces:
  - `State._withRebase(change: () => void)`: spec §5.2. The only rebase helper in both documents.
  - `State._clampToSpeciesMaximums()`: each attribute above `species.attributeMaximums[k] || 8` of the current species becomes that value (Core p.25).
  - `setSpecies(id)`: no change and no notify when `id === character.species.id`. Else `clearArchetype()` when an archetype is set, then `_withRebase` around the species write (the `Math.max` loop `:244-248` goes), then `_clampToSpeciesMaximums()`.
  - `setArchetype(id)`: no change and no notify when `id === character.archetype.id`. Else `_withRebase` around: the archetype write, `archetypeKeywordChoices = {}`, `archetypeSkillChoices = {}`. The `Math.max` loops `:355-367` go. The psyker block `:372-387` stays for Task 5.
  - `clearArchetype()`: `_withRebase` around `archetype = { id: null, xpCost: 0 }`. The record reset `:399` and `resetStats()` `:403` go (CC7). Lines `:400-402` stay for Task 5.
  - `setCustomArchetype()`: step 1 (guard) and step 4 (`_withRebase` around the archetype write; no reset of the stored record) of the final order of spec §5.2. Lines `:427-450` stay for Task 6. `resetStats()` at `:452` goes.
  - `PrerequisiteChecker.getCharacterKeywords`: `customArchetype.keywords` count only when the archetype is `custom` (spec §5.2, CC14). The other readers of the record already test this.

- [ ] **Step 1: Write the failing checks** in `scripts/test-stat-baseline.js` (full sandbox):
  - A6: `newCharacter`, `setSpecies('human')`, `setArchetype('imperial_guardsman')`, `increaseAttribute('strength')`. Snapshot `JSON.stringify(State.character)` and a listener call count. `setSpecies('human')`: the text is equal, and the count did not change. `setArchetype('imperial_guardsman')`: the same.
  - A7b and CC7: `setCustomArchetype()`, `setCustomArchetypeName('X')`, `addCustomKeyword('scum')`, `setCustomArchetype()`: `customArchetype.name === 'X'`. Then `setArchetype('ganger')`, `setCustomArchetype()`: name `'X'` and keywords `['SCUM']`. Then `setSpecies('ogryn')`: `archetype.id === null` and `customArchetype.name === 'X'`.
  - A4: character a = `newCharacter`, `setSpecies('human')`, `setArchetype('tech_adept')` (`intellect 2`, `scholar 2`, `tech 3`), `setArchetype('ganger')`. Character b = `newCharacter`, `setSpecies('human')`, `setArchetype('ganger')`. `XPCalculator.calculateSpentXP` of a equals that of b, and the attributes and skills of a and b are equal.
  - Raised value: `newCharacter`, Human, `tech_adept`, `increaseSkill('tech')` (3 to 4), `setArchetype('ganger')`: `skills.tech === 4`, `skills.scholar === 0`, `attributes.intellect === 1`.
  - P3: `newCharacter`, Human, `tech_adept`, `increaseSkill('tech')`, `setCustomArchetype()`: `attributes.intellect === 1`, `skills.scholar === 0`, `skills.tech === 4`.
  - CC14 (Q1): `newCharacter`, Human, `setCustomArchetype()`, `addCustomKeyword('psyker')`: `State.isPsyker() === true`. `setArchetype('ganger')`: `State.isPsyker() === false`. `setSpecies('ogryn')`: `State.isPsyker() === false`. `setCustomArchetype()` again: `true`.
  - A5: `newCharacter`, `setSpecies('ogryn')` (`strength 5, toughness 5`), `setSpecies('human')`: `calculateAttributeXP === 0` and each attribute is `1`.
  - Species change keeps a raised value: `newCharacter`, Human, `increaseAttribute('agility')` two times (to 3), `setSpecies('ogryn')`: `attributes.agility === 3` (Ogryn agility maximum 7).
  - CC2 (P2): `newCharacter`, Human, `setArchetype('ganger')`, `increaseAttribute('intellect')` two times (to 3), `setSpecies('ogryn')`: `attributes.intellect === 1` (Ogryn intellect maximum 1).
  - `scripts/test-load-check.js` setters: the `skillChoiceKey` entry (`:294`) becomes `!('choice1' in built.skills) && !('choice2' in built.skills)`; keep `skillChoiceKey: true` at `:300`. Change the comment at `:219` ("setArchetype no longer writes the data keys choice1 / choice2").
  - `scripts/test-custom-wargear.js:503`: replace `State.resetStats = () => {};` with `State._withRebase = change => change();`.
- [ ] **Step 2: Run** `node scripts/test-stat-baseline.js` and `node scripts/test-load-check.js`. Expected: FAIL for each new check, except two that pin a result of today's code: "species change keeps a raised value" (no archetype, so today's `Math.max` keeps 3) and CC2 (today the full reset gives 1). They guard the new rebase; the mutation proof of Step 5 proves CC2.
- [ ] **Step 3: Implement** the interface above.
- [ ] **Step 4: Run** all test scripts. Expected: all PASS.
- [ ] **Step 5: Mutation proof.** In `setArchetype`, write the archetype outside `_withRebase`: the A4 check gives FAIL. Remove the `_clampToSpeciesMaximums()` call: the CC2 check gives FAIL. Undo both.
- [ ] **Step 6: Commit.** `git commit --author=... -m "Keep bought stats when a parent changes, clamp to the species maximum, keep the custom record"`

---

### Task 4 (3b): The "any skill" choice field and setter (A2)

Spec: §4.4 (state part). Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `creator/js/state.js`: add `setArchetypeSkillChoice` after `_withRebase`
- Modify: `creator/js/character-check.js:54-58` (the `archetypeSkillChoices` row after row 22)
- Modify: `scripts/test-load-check.js:131` (corpus: one key), `:220` (setters: one new call after it), a new entry after `:296` and its expected value after `:300`, two new `HOSTILE` rows after `:350`
- Test: `scripts/test-stat-baseline.js` (extend)

**Interfaces:**
- Consumes: `_withRebase` (Task 3), `XPCalculator.SKILL_KEYS` (Task 2). `setArchetype` already resets the field to `{}` (Task 3).
- Produces:
  - `State.setArchetypeSkillChoice(key: string, skill: string) -> boolean` by spec §4.4. `''` clears. A refused call returns `false` and does not notify. An accepted call stores inside `_withRebase` and notifies `'stats'`.
  - `CharacterCheck` row: `archetypeSkillChoices` optional; a value that is not a plain object becomes `{}` (path `archetypeSkillChoices`); each value that is not a string becomes `''` (path `archetypeSkillChoices.<key>`). Copy the code of row 22.

- [ ] **Step 1: Write the failing checks.**
  - `scripts/test-stat-baseline.js`: `newCharacter`, Human, `setArchetype('inquisitor')`: no key of `skills` starts with `choice`. `setArchetypeSkillChoice('choice1', 'insight')` returns `true` and `skills.insight === 4`. `setArchetypeSkillChoice('choice2', 'insight')` returns `false`. `setArchetypeSkillChoice('choice2', 'scholar')`: `skills.scholar === 4`, `calculateSkillXP === 0`. `setArchetypeSkillChoice('choice1', 'medicae')`: `skills.insight === 0`, `skills.medicae === 4`. `setArchetypeSkillChoice('weaponSkill', 'insight')` returns `false`. `setArchetypeSkillChoice('choice1', 'zz')` returns `false`. Ganger: `setArchetypeSkillChoice('choice1', 'insight')` returns `false`.
  - `scripts/test-load-check.js`: corpus full character: add `archetypeSkillChoices: { choice1: 'insight' }` after `archetypeKeywordChoices` (`:131`). Setters: after `B.setArchetype('inquisitor')` add `B.setArchetypeSkillChoice('choice1', 'insight');`; a new entry `skillChoice: built.archetypeSkillChoices?.choice1 === 'insight'` with expected `skillChoice: true`. `HOSTILE` rows after `:350`: `[['archetypeSkillChoices'], OBJ_BAD, {}]` and `[['archetypeSkillChoices', 'choice1'], STR_BAD, '']`.
- [ ] **Step 2: Run** both scripts. Expected: FAIL for each new check (the setter is absent; the hostile rows keep the bad value).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** all test scripts. Expected: all PASS.
- [ ] **Step 5: Mutation proof.** Remove the "no other key holds it" test from the setter: the `('choice2', 'insight')` check gives FAIL. Undo.
- [ ] **Step 6: Commit.** `git commit --author=... -m "Store the skill of an any-skill archetype bonus"`

---

### Task 5: Reference-aware grants with a record (A8, A4 power part, CC3, CC4)

Spec: §6. Suggested dispatch: `implementer` with `model: opus`.

**Files:**
- Modify: `creator/js/state.js`: in `setArchetype`, one new first statement after the Task 3 guard (`const oldGrants = this._archetypeGrantIds();`, before the Task 3 `_withRebase` write) and the psyker block `:372-387`; in `clearArchetype`, one new first statement (the same read, before the Task 3 `_withRebase` write) and the power lines `:400-402` (Q4); `:466-487` (`setCustomArchetypeAbility` body); `setCustomArchetype` (steps 2, 5 and 7 of the final order of spec §5.2, as new lines); `:758-771` (`removePower`: also remove the id from each `granted` record, Q3); `setAscension` (`:1291-1323`: the `granted` rule and one `_settleFreePicks()` call before the notify), `:1326-1379` (`_applyAscensionEffects`), `:1382-1431` (`_removeAscensionEffects`); add the five helpers after `_removeAscensionEffects`
- Modify: `creator/js/character-check.js:117-124` (`_ascension`: the `granted` row)
- Modify: `scripts/test-load-check.js:133` (corpus: the first ascension gets a record), two new `HOSTILE` rows after `:367`
- Modify: `scripts/test-custom-wargear.js`: one new stub line after `:503` only if its sandbox cannot run the new helpers (name the reason in the commit body)
- Test: `scripts/test-grants.js` (new)

**Interfaces:**
- Consumes: Task 3 (`setArchetype`, `clearArchetype`, `setCustomArchetype` structure).
- Produces (spec §6.3):
  - `State._archetypeGrantIds() -> string[]`.
  - `State._grantedPowerIds(excludeEntry = null) -> Set<string>`.
  - `State._applyPowerGrants(ids: string[]) -> string[]` (the ids it added).
  - `State._releasePowerGrants(ids: string[], excludeEntry = null)` with the adoption rule.
  - `State._settleFreePicks()`.
  - Ascension entry field `granted: { powers: string[], freePowers: string[], talents: string[] }`, written by `_applyAscensionEffects` for each package entry whose package the data has; `setAscension` never copies it from `data`.
  - `_removeAscensionEffects(entry)`: with a record, release only the recorded ids; with no record, the no-record rule.
  - `setArchetype`, `setCustomArchetypeAbility`, `clearArchetype`, `setCustomArchetype`: read the old grant ids before the write, then `_releasePowerGrants(old)`, `_applyPowerGrants(new)`, `_settleFreePicks()`. No list is emptied. `setCustomArchetype` applies the grants of the kept ability archetype.
  - `removePower(id)`: also removes `id` from `granted.powers` and `granted.freePowers` of each ascension entry that has a record (spec §6.3, Q3).
  - `CharacterCheck._ascension`: optional `granted`; a value that is not a plain object is deleted (path `ascensions[i].granted`); `powers`, `freePowers`, `talents` are each an optional list of strings (`this._list(granted, key, [], path, paths, is.string, true)`).

- [ ] **Step 1: Write the failing test** `scripts/test-grants.js` (full sandbox). Use `State.setAscension(t, { type: 'package', packageId, archetypeId: null })` and `State.setAscension(t, null)`. Fixtures:
  - A: Human, tier 2, `wyrd_aoa`; add `psychic_revelations` at 3, then clear 3: `smite` is in `psychicPowers` and in `freePowers`.
  - B: Human, tier 2, `sanctioned_psyker`; `addDisciplineChoice('Runes of Fate')`; add `lost_seer_path_aoa` at 3: `unlockedDisciplines` holds `'Runes of Fate'` once, and `getUnlockedDisciplines()` holds it. Clear 3: `unlockedDisciplines` still holds it. `prescience` and `scriers_gaze` are in neither list.
  - C: Human, tier 1, `ganger`; add `psychic_revelations` at 2: the entry has `granted.powers` `['smite']`. Clear 2: `smite` is in neither list.
  - D: Human, `sanctioned_psyker`; `addPower('chameleon')` (Minor, 8 XP); `setArchetype('ganger')`: `smite` is in neither list; `chameleon` is in `psychicPowers` and not in `freePowers`.
  - F: Human, `sanctioned_psyker`, `addPower('chameleon')`; `setArchetype('wyrd_aoa')`: `chameleon` stays; `smite` stays in both lists.
  - G: Human, tier 1, `ganger`; `dauntless_reputation` at 2 and at 3: one `devotees` entry with `ascensionGranted`. Clear 2: it stays. Clear 3: it goes.
  - H: Human, `setCustomArchetype()`, `setCustomArchetypeAbility('sanctioned_psyker')`, `addPower('chameleon')`, `setCustomArchetypeAbility(null)`: `smite` is in neither list; `chameleon` stays.
  - I: Human, `sanctioned_psyker`, `addPower('chameleon')`, `setSpecies('ogryn')`: `chameleon` stays; `smite` is in neither list.
  - J (P8, CC3): `setSpecies('aeldari')`, `setArchetype('farseer')` (free picks: Divination, Runes of Fate, Runes of Fortune, count 2); `addFreePowerPick('prescience')`; add `lost_seer_path_aoa` at 2: the entry has `granted.powers` `['scriers_gaze']`. Clear 2: `prescience` is in both lists; `scriers_gaze` is in neither.
  - K (adoption): Human, tier 2, `wyrd_aoa`; add `psychic_revelations` at 3 (its record is empty); `setArchetype('ganger')`: `smite` stays in both lists and the entry's `granted.powers` holds `'smite'`. Clear 3: `smite` is in neither list.
  - L (CC4): Human, `sanctioned_psyker` (Minor free picks, count 1); `addFreePowerPick('chameleon')`; `setArchetype('ganger')`: `chameleon` is in `psychicPowers` and not in `freePowers`. Human, `wyrd_aoa` (Minor, count 2), `addFreePowerPick('chameleon')`, `setArchetype('sanctioned_psyker')`: `chameleon` stays in `freePowers`.
  - Q3: `setSpecies('aeldari')`, `setArchetype('farseer')`; add `lost_seer_path_aoa` at 2 (record `granted.powers`: `['prescience', 'scriers_gaze']`); `removePower('prescience')`: the record holds `['scriers_gaze']` only; `addFreePowerPick('prescience')`; clear 2: `prescience` is in both lists and `scriers_gaze` is in neither.
  - No-record rule: Human, tier 1, `ganger`; write `ascensions: [{ targetTier: 2, type: 'package', packageId: 'psychic_revelations', archetypeId: null }]` and `psychicPowers: ['smite'], freePowers: ['smite']` directly (an old save); clear 2: `smite` is in neither list.
  - Round trip: the J character before the clear, `JSON.parse(JSON.stringify(...))`, `State.loadCharacter`: loads deep-equal, with no warning.
  - `scripts/test-load-check.js`: corpus: the first ascension (`demanding_patron`, `:133`) gets `granted: { powers: [], freePowers: [], talents: [] }`. `HOSTILE` rows after `:367`: `[['ascensions', 0, 'granted'], OBJ_BAD, undefined]`, `[['ascensions', 0, 'granted', 'powers'], ARR_BAD, []]`, `[['ascensions', 0, 'granted', 'freePowers'], ARR_BAD, []]` and `[['ascensions', 0, 'granted', 'talents'], ARR_BAD, []]` (Q7). A mixed-list check: the full character with `granted: { powers: ['a', 5], freePowers: [null, 'b'], talents: [{}, 'c'] }` loads as `{ powers: ['a'], freePowers: ['b'], talents: ['c'] }`, with one warning that names `ascensions[0].granted.powers[1]`, `ascensions[0].granted.freePowers[0]` and `ascensions[0].granted.talents[0]`.
- [ ] **Step 2: Run** `node scripts/test-grants.js` and `node scripts/test-load-check.js`. Expected: FAIL for A, B, C, D, F, G, H, I, J, K, L, Q3, the four hostile rows and the mixed-list check.
- [ ] **Step 3: Implement** the interface above.
- [ ] **Step 4: Run** all test scripts. Expected: all PASS.
- [ ] **Step 5: Mutation proof.** Make the remove of an entry with a record release the package's full grant list: fixture J gives FAIL. Remove the adoption: fixture K gives FAIL. Undo both.
- [ ] **Step 6: Commit.** `git commit --author=... -m "Record and release only the powers that a source granted"`

---

### Task 6: Wargear index references in State (A9 / B1, A7)

Spec: §7.2, §7.3, §7.4 (state part). Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `creator/js/state.js:427-450` (`setCustomArchetype` wargear block: steps 3 and 6 of the final order of spec §5.2), `:562-574` (`removeCustomStartingWargear`), `:780-788` (`removeWargear`), `:791-799` (`removeWargearByIndex`), `:808-817` (`updateRelicWargear`); add `_remapWargearRefs` and `getOldStartingEntries` after `removeWargearByIndex`
- Modify: `scripts/test-custom-wargear.js:505-524` (the `setCustomArchetype` block: new expectations)
- Test: `scripts/test-wargear-refs.js` (new)

**Interfaces:**
- Consumes: the Task 3 and Task 5 lines of `setCustomArchetype` (do not change them).
- Produces:
  - `State._remapWargearRefs(newIndexOf: (oldIndex: number) => number)`: spec §7.3. It holds the loop of `:439-450`, which then goes from `setCustomArchetype`.
  - `State.getOldStartingEntries() -> number[]`: spec §7.4, with the quantity per id added up over the whole `startingWargear` list (a plain-text entry counts 1, P5). Before it takes the first `q` entries of an id, it leaves out as many of the first plain starting entries of that id as `customArchetype.wargear` lists (CC16). For a character whose archetype is `custom` or not in the data, `[]`.
  - `setCustomArchetype()` removes only the indices of `getOldStartingEntries()` (step 3 reads them before the write) and calls `_remapWargearRefs`.
  - The four remove and update setters call `_remapWargearRefs` after their splice. `updateRelicWargear` sets to `null` each owned-item choice on its index when `DataLoader.getWeapon` / `getArmor` of the new id no longer matches the talent's `choiceType`.

- [ ] **Step 1: Write the failing test** `scripts/test-wargear-refs.js` (full sandbox). Fixtures:
  - B1: `addWargear` of `knife`, `lasgun`, `laspistol`, `flak_armour`, `mesh_armour`. Talents `[{ id: 'trademark_weapon', choice: '1' }, { id: 'armourmonger_aoa', choice: 4 }]`. `removeWargearByIndex(0)`: choices are `'0'` and `3`; `wargear[0].id === 'lasgun'`.
  - Then `removeWargearByIndex(0)` (the lasgun): the Trademark choice is `null`; Armour-Monger is `2`.
  - `removeWargear('knife')` on a fresh copy of the first fixture: the same result as `removeWargearByIndex(0)`.
  - Custom starting: `setCustomArchetype()`, `addCustomStartingWargear('knife')`, `addWargear('lasgun')`, Trademark `'1'`; `removeCustomStartingWargear(0)`: the choice is `'0'`.
  - Relic kind change: `flak_armour` at index 0 with Armour-Monger `'0'`; `updateRelicWargear(0, 'lasgun', relic)`: the choice is `null`. With `laspistol` at index 0 and Trademark `'0'`, `updateRelicWargear(0, 'lasgun', relic)`: the choice stays `'0'`.
  - A7: Human, `imperial_guardsman`; add each resolved starting id of that archetype with `addWargear(id, true)` (quantity respected); `addRelicWargear('laspistol', { name: 'Vow', form: 'weapon', originalOwner: null, anointment: null, power: null, oddities: [] })`; `addImprovisedWargear({ id: ImprovisedBuilder.BASE_IDS[0], improvised: { name: 'Leg', details: '', halfTime: 0, damageRank: false, removeUnwieldy: false, doubleRange: false, traits: [] } })`; `addWargear('chainsword')`; one custom item through `addCustomItem`. Trademark on the chainsword index. `getOldStartingEntries()` equals the starting indices. `setCustomArchetype()`: the wargear holds the relic, the improvised item, the chainsword and the custom item in that order, and the Trademark choice names the chainsword.
  - P5: Human, `setArchetype('death_cult_assassin')` (lists `death_cult_power_blade` two times); add two `death_cult_power_blade` with `addWargear(id, true)`: `getOldStartingEntries()` holds both indices.
  - CC16, sequence 1: Human, `setCustomArchetype()`, `addCustomStartingWargear('knife')`, `setArchetype('imperial_guardsman')` (its list holds `knife`): `getOldStartingEntries()` is `[]`. `setCustomArchetype()`: one `knife` entry with `isStarting: true`, and `customArchetype.wargear` is `['knife']`. `removeCustomStartingWargear(0)`: no `knife` entry, and the record list is `[]`.
  - CC16, sequence 2: Human, `setCustomArchetype()`, `addCustomStartingWargear('knife')`, `setSpecies('ogryn')`, `setCustomArchetype()`: one `knife` entry, and the record list is `['knife']`.
- [ ] **Step 2: Change `scripts/test-custom-wargear.js:505-524`.** The character there has no archetype, and each entry is bought. New expectations: the wargear keeps all four entries in order (`chainsword`, Custom A, `flak_armour`, Custom B); Trademark `'3'` stays `'3'`; Armour-Monger `2` stays `2`; the other three checks stay. Second fixture: each choice stays.
- [ ] **Step 3: Run** both scripts. Expected: FAIL for each new or changed check.
- [ ] **Step 4: Implement** the interface above.
- [ ] **Step 5: Run** all test scripts. Expected: all PASS.
- [ ] **Step 6: Mutation proof.** Remove the `_remapWargearRefs` call from `removeWargearByIndex`: the B1 check gives FAIL. Count the quantity per entry, not per id: the P5 check gives FAIL. Remove the CC16 exclusion: sequence 1 gives FAIL (the knife goes). Undo each.
- [ ] **Step 7: Commit.** `git commit --author=... -m "Keep owned-item talent choices on their item when the wargear list changes"`

---

### Task 7: Wargear references in the UI; the number choice 0 (A7 confirm, A9 display, B10)

Spec: §7.3 (display), §7.4 (confirm), §13 (B10). Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `creator/tabs/archetype-tab.js:97-100` (the Custom Archetype click) and add `selectCustomArchetype` after `renderList`
- Modify: `creator/tabs/talents-tab.js:313-326` (the choice display)
- Modify: `creator/tabs/character-sheet-tab.js:1664-1676` (the choice display; `:1665` is B10)
- Test: `scripts/test-wargear-refs.js` (extend)

**Interfaces:**
- Consumes: `State.getOldStartingEntries()` (Task 6).
- Produces:
  - `ArchetypeTab.selectCustomArchetype() -> Promise<void>`: when `getOldStartingEntries()` is not empty, it asks `window.api.showConfirm('Custom Archetype removes the starting wargear of <name>: <item names>. Continue?')` and returns on cancel. Then `State.setCustomArchetype()` and `this.renderCustomConfig()`. The click handler calls it.
  - Talents tab and sheet: an owned-item talent with a `null` or absent choice shows `<name> (no item selected)`. The sheet writes no "Chosen:" note for it.
  - Sheet `:1665`: `choice === null || choice === undefined ? '' : this.escapeHtml(String(choice))`.

- [ ] **Step 1: Write the failing checks** (recording DOM stub; load `talents-tab.js`, `archetype-tab.js`, `character-sheet-tab.js`; stub `Glossary.enhanceElement` and `ImprovisedBuilder.talentProfilesHtml` when the sandbox does not load them):
  - `TalentsTab.renderSelected()` with talents `[{ id: 'trademark_weapon', choice: null }]`: the written HTML contains `Trademark Weapon (no item selected)`.
  - `CharacterSheetTab.renderTalents(character)` with the same talent: contains `(no item selected)` and no `Chosen:`. With `[{ id: 'hatred', choice: 0 }]`: contains `Chosen: 0`.
  - A7 confirm: the A7 fixture of Task 6 up to `setCustomArchetype`. `window.api.showConfirm = async () => false`; `await ArchetypeTab.selectCustomArchetype()`: the archetype id and the wargear are unchanged, and the confirm text names "Imperial Guardsman". `showConfirm = async () => true`: the archetype id is `custom`. A character with no starting entries: no confirm call.
- [ ] **Step 2: Run.** Expected: FAIL for each new check.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** all test scripts. Expected: all PASS.
- [ ] **Step 5: Mutation proof.** Remove the confirm from `selectCustomArchetype`: the cancel check gives FAIL. Undo.
- [ ] **Step 6: Commit.** `git commit --author=... -m "Name the removed starting wargear and show a cleared item choice"`

---

### Task 8: Add Starting Wargear; data corrections (A10 / B2, P5, P13, CC15, CC16)

Spec: §5.2a, §7.5. Suggested dispatch: `implementer` (Sonnet). The task reviewer reads Core p.25 as an image (`pdftoppm`) to check the three species values.

**Files:**
- Modify: `creator/tabs/wargear-tab.js:437-451` and `:454-470` (the two add handlers) and add `addStartingWargear` after `renderWargearBrowser`
- Modify: `data/archetypes.json` (three entries, spec §7.5 table)
- Modify: `data/species.json` (three values, spec §5.2a table: `ork` strength 10 to 12, `ork` toughness 10 to 12, `aeldari` strength 8 to 7)
- Modify: `creator/js/web-api.js:20` (`?v=47` to `?v=48`)
- Test: `scripts/test-starting-wargear.js` (new)

**Interfaces:**
- Consumes: nothing.
- Produces: `WargearTab.addStartingWargear(entries: Array<string | { id, qty }>)`: it first adds up the quantity `q` of each id over the whole list (a string counts 1, an object counts `qty || 1`). For each id that `DataLoader.getWargearItem` resolves, it adds `max(0, q - n)` entries through `State.addWargear(id, true)`, where `n` is the count of entries with that id, `isStarting === true` and no overlay, less the count of that id in `customArchetype.wargear` (never below 0; CC16). Both buttons call it, then `this.render()`. The shared count between the two buttons is the design call of spec §7.5 (P13).

- [ ] **Step 1: Write the failing test** (full sandbox plus `creator/tabs/wargear-tab.js` with a recording DOM stub):
  - Data: `primaris_intercessor` holds `ballistic_appeasement_auto_reliquary`, `techmarine` holds `astartes_servo_arm`, `striking_scorpion` holds `mandiblasters`, and none holds the old id.
  - Data: the unresolved ids of the archetypes whose `source` is not `apocrypha`, sorted, equal exactly: `adept_robes` (two times), `augmetics`, `commissar_greatcoat`, `company_standard`, `disguise_kit`, `fine_clothing`, `haywire_mine`, `ripped_clothes`, `skitarii_war_plate`, `smoke_grenades` (two times), `tattered_robes` (13 entries).
  - Click: Human `rogue_trader`, `addStartingWargear(rogue_trader.startingWargear)`: 4 entries (no `fine_clothing`). A second call: still 4.
  - P5: Human `death_cult_assassin`: after one call, 2 `death_cult_power_blade` entries; after a second call, still 2.
  - Quantity: Human `incursor`: 3 `frag_grenades`; a second call adds none; `removeWargearByIndex` of one frag grenade, a third call adds one.
  - CC16, sequence 3: Human, `setCustomArchetype()`, `addCustomStartingWargear('knife')`, `setArchetype('imperial_guardsman')`, `addStartingWargear(imperial_guardsman.startingWargear)`: two `knife` entries. `setCustomArchetype()`: one `knife` entry, and the record list is `['knife']`. `removeCustomStartingWargear(0)`: no `knife` entry.
  - CC15: in `data/species.json`, `ork.attributeMaximums.strength === 12`, `ork.attributeMaximums.toughness === 12`, `aeldari.attributeMaximums.strength === 7`; each value of the five Core species equals the Core p.25 table (Human 8 for each; Ork 12, 12, 7, 7, 8, 7, 7; Aeldari 7, 7, 12, 12, 12, 10, 6; `astartes` 10, 10, 9, 9, 10, 10, 8; `primaris` 12, 12, 9, 9, 10, 10, 8, in the order Strength, Toughness, Agility, Initiative, Willpower, Intellect, Fellowship).
  - `creator/js/web-api.js` contains `'?v=48'` and not `'?v=47'`.
- [ ] **Step 2: Run.** Expected: FAIL for each check.
- [ ] **Step 3: Implement.** Change only the three ids in `data/archetypes.json` and the three values in `data/species.json`; keep the format of each file.
- [ ] **Step 4: Run** all test scripts. Expected: all PASS.
- [ ] **Step 5: Mutation proof.** Remove the resolve test: the Rogue Trader check gives 5 and FAIL. Count per entry and not per id: the Death Cult check gives 1 blade and FAIL. Undo both.
- [ ] **Step 6: Commit.** `git commit --author=... -m "Add only known starting wargear, once, and correct three starting ids"`

---

### Task 9: The load steps (A1 load part, A2 load part, A11 aliases, A15 load part, CC1, CC5)

Spec: §2.1, §4.3, §8.1, §9.2, §11.2. Suggested dispatch: `implementer` with `model: opus` (a load migration).

**Files:**
- Modify: `creator/js/state.js:158-173` (the dead migration body goes; the three steps go in its place) and add `ID_ALIASES` after `_AUTO_SAVE_KEY` (`:24`)
- Modify: `creator/js/character-check.js:105` (the `ascensionPackages` row, at the end of the §6.1 lists)
- Modify: `scripts/test-load-check.js:31-33` (add `backgrounds.json` to `DATA`), `:126-127` (remove `choice1` / `choice2` from the full character), `:166-188` (the legacy fixture), `:355` (the `HOSTILE` row `['skills', 'choice1']`: X1 now deletes that key, so the row uses the unknown key `['skills', 'zzSkill']` with the same bad values and expected `null`; R10 stays pinned), `:502-507` (the order test)

**Interfaces:**
- Consumes: Task 4 (`archetypeSkillChoices` is a known field); Task 5 (`granted` is a known field).
- Produces:
  - `State.ID_ALIASES = { talents: {4 pairs}, wargear: {3 pairs}, species: {1 pair} }`, spec §9.2.
  - In `loadCharacter`, after `CharacterCheck.repair` and before the custom wargear repair, in this order: X1 (delete `skills.choice`, `choice1`, `choice2`); X2 (aliases in place: each talent string or `.id`, but not onto an id that the talent list already holds (CC5); each `wargear[i].id`; each `customArchetype.wargear[i]`; `species.id`; for `aeldari_psychosensitive`, also push `{ type: 'psychosensitive', optionId: 'psyker' }` to `species.subOptions` when no entry of that type exists (CC1)); X3 (fill a missing `bonusType` from `DataLoader.getBackgrounds()` when it returns an object; else skip). No warning for X1-X3. The key `ascensionPackages` stays.
  - `CharacterCheck` row: `this._list(c, 'ascensionPackages', [], 'ascensionPackages', paths, isString, true)`.

- [ ] **Step 1: Write the failing checks** in `scripts/test-load-check.js`:
  - Legacy (`:183-188`): the expected character is `LEGACY()` with `ascensions: []` added; `ascensionPackages` stays `['back_from_the_brink']`; no warning. Rename the check to "legacy ascensionPackages stays".
  - Hostile: `ascensionPackages: EVIL` gives `[]` and one warning that names `ascensionPackages`; `['a', 5]` gives `['a']` and a warning that names `ascensionPackages[1]`.
  - Order (`:502-507`): `ascensions` is `[]`, `ascensionPackages` is `[]`, one warning.
  - X1: `skills: { ...base().skills, choice: null, choice1: 4, choice2: 0 }`: no key of `skills` starts with `choice`; the 18 skills load deep-equal; no warning. Remove `choice1: null, choice2: 4` from the full character (`:127`) and change its comment (`:126`).
  - X2: `talents: ['daemonic_summoning_dh', { id: 'forge_the_sword_dh', choice: null }, 'precision_shooter']`, `wargear: [{ id: 'forceshield', isStarting: true }, { id: 'lasgun', isStarting: false }]`, `customArchetype.wargear: ['mist_shield']`, `species: { id: 'aeldari_psychosensitive', xpCost: 10, subOptions: [{ type: 'path', optionId: 'path_of_the_artisan' }] }`: talents become `['daemonic_summons_dh', { id: 'forge_of_souls_dh', choice: null }, 'precision_shooter']`; wargear ids `['force_shield_aeldari', 'lasgun']`; custom wargear `['mistshield']`; species id `'aeldari'` and sub-options `[{ type: 'path', optionId: 'path_of_the_artisan' }, { type: 'psychosensitive', optionId: 'psyker' }]`; no warning.
  - CC1, no duplicate: the same species with `subOptions: [{ type: 'psychosensitive', optionId: 'psyker' }]` keeps one such entry.
  - CC5: `talents: ['forge_the_sword_dh', 'forge_of_souls_dh']` stays as it is.
  - X3: an origin `{ id: <the first origin of data/backgrounds.json that has a bonusType> }` with no `bonusType` gets that `bonusType`; an origin with `bonusType: 'wealth'` keeps `'wealth'`; the corpus origin `{ id: 'o1' }` stays with no `bonusType` (the no-op corpus stays green).
- [ ] **Step 2: Run** `node scripts/test-load-check.js`. Expected: FAIL for each new or changed check.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** all test scripts. Expected: all PASS.
- [ ] **Step 5: Mutation proof.** Remove the alias step: the X2 check gives FAIL. Remove the sub-option push: the CC1 part of X2 gives FAIL. Undo both.
- [ ] **Step 6: Commit.** `git commit --author=... -m "Keep the old ascension package list and add three named load steps"`

---

### Task 10: The Ascension tab (A1 notice, A12, A13, B9, unknown ascension ids)

Spec: §8. Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `creator/tabs/ascension-tab.js:8-55` (`render`), `:58-88` (`renderSlot`), `bindEvents` (new handlers only, at its end)
- Modify: `creator/js/state.js:1452-1457` (`getEffectiveTier`) and add `clearLegacyAscensionPackages` after `removeAscensionChoice`
- Test: `scripts/test-ascension-tab.js` (new)

**Interfaces:**
- Consumes: Task 9 (`ascensionPackages` stays at load).
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

### Task 11: The "any skill" choice in the UI (A2)

Spec: §4.4 (UI and prerequisite). Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `creator/tabs/archetype-tab.js:222` (one new call after `renderKeywordChoices`), `:256` (one new bind call), `:680-694` (`formatBonuses`); add `renderSkillChoices` and `bindSkillChoiceEvents` after `bindKeywordChoiceEvents`
- Modify: `creator/tabs/ascension-tab.js:474-484` (the skill part of `checkArchetypeAscensionPrereqs`)
- Test: `scripts/test-skill-choice-ui.js` (new)

**Interfaces:**
- Consumes: `State.setArchetypeSkillChoice` (Task 4), `XPCalculator.SKILL_KEYS` (Task 2).
- Produces:
  - `ArchetypeTab.renderSkillChoices(archetype, character) -> string`: `''` when the archetype has no `skillBonus` key outside `SKILL_KEYS`. Else a `detail-section` titled "Skill of your choice" with one `div.archetype-keyword-choice` per key, each with a label "Skill of your choice (<value>)" and a `select.skill-choice-select[data-choice-key]`: first option `-- Select a skill --`, then each skill (`DerivedStats.formatSkillName`) that no other key holds.
  - `bindSkillChoiceEvents(detail)`: on change, `State.setArchetypeSkillChoice(key, value)` then `this.renderDetail()`.
  - `formatBonuses`: a key outside `SKILL_KEYS` (skills only) prints `Skill of your choice <value>`.
  - `checkArchetypeAscensionPrereqs`: the real skill keys as today; the other keys count by spec §4.4: met when the count of different real skills at the value or more is at least the count of those keys. Text part: `Skills of your choice: <count> at <value> (have <n>)`, with the unmet class when unmet.

- [ ] **Step 1: Write the failing test** (full sandbox plus `archetype-tab.js` and `ascension-tab.js`, recording DOM stub):
  - `renderSkillChoices(<inquisitor>, character)` with no choice: two selects with `data-choice-key="choice1"` and `"choice2"`, each with 19 options. With `archetypeSkillChoices: { choice1: 'insight' }`: the `choice2` select has no `value="insight"` option.
  - `renderSkillChoices(<ganger>, character) === ''`.
  - `formatBonuses({ choice1: 4, choice2: 4 }, false) === 'Skill of your choice 4, Skill of your choice 4'`.
  - Prerequisite (`ignorePrerequisites` off): `inquisitor` with `skills.insight = 4` only: `met === false`, the text contains `Skills of your choice: 2 at 4 (have 1)`. With `insight 4` and `scholar 5`: `met === true`.
- [ ] **Step 2: Run.** Expected: FAIL for each check.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** all test scripts. Expected: all PASS.
- [ ] **Step 5: Mutation proof.** Count each `choice` key against the same highest skill: the one-skill check gives `met === true` and FAIL. Undo.
- [ ] **Step 6: Commit.** `git commit --author=... -m "Let the player select the skill of an any-skill archetype bonus"`

---

### Task 12: Unknown ids in the Wargear, Talents and Powers tabs (A11, B2, B11, CC8)

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
  - Powers: a `power-chip` with `Unknown power (<id>)` and the existing `.power-chip-remove`. The non-psyker branch writes the info box, then `<div id="selected-powers">` and the chosen discipline chips, and binds them. The chosen discipline chips show whenever `unlockedDisciplines` is not empty, also for a psyker archetype with `disciplineChoices: 0` (CC8).

- [ ] **Step 1: Write the failing test** (full sandbox plus the three tabs, recording DOM stub; stub `Glossary.enhanceElement`):
  - Wargear `[{ id: 'no_such', isStarting: true }, { id: 'lasgun', isStarting: false, upgrades: ['zz_up'] }]`: `renderCurrentWargear()` HTML contains `Unknown wargear (no_such)` and `data-index="0"` on a `btn-remove-wargear`, and `Unknown upgrade (zz_up)`. `showUpgradeModal(1)`: the modal HTML contains `Unknown upgrade (zz_up)` and `data-id="zz_up"`.
  - Talents `['zz_t', { id: 'zz<b>', ascensionGranted: true }]`: the HTML contains `Unknown talent (zz_t)`, `Unknown talent (zz&lt;b&gt;)`, and two `btn-remove`.
  - Powers: Human `sanctioned_psyker`, `psychicPowers: ['smite', 'zz_p']`: contains `Unknown power (zz_p)` and `data-id="zz_p"`. Human `ganger`, `psychicPowers: ['smite']`, `unlockedDisciplines: ['Biomancy']`, `ignorePrerequisites` off: the HTML contains `does not have psychic abilities`, `Smite`, and `data-discipline="Biomancy"`.
  - CC8: `setSpecies('aeldari')`, `setArchetype('farseer')` (`disciplineChoices: 0`), `unlockedDisciplines: ['Biomancy']`: the HTML contains `data-discipline="Biomancy"` on a `discipline-chosen-remove`.
- [ ] **Step 2: Run.** Expected: FAIL for each check.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** all test scripts. Expected: all PASS.
- [ ] **Step 5: Mutation proof.** Put back `if (!talent) continue;` in the Talents tab: the talent checks give FAIL. Undo.
- [ ] **Step 6: Commit.** `git commit --author=... -m "Show unknown wargear, upgrades, talents, powers and stored disciplines with a Remove control"`

---

### Task 13: Unknown ids in the Injuries, Background and Species tabs (A11, B11, A20)

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
  - Kroot, tier 1, three `mutation` sub-options with the first three option ids of the Kroot `mutation` config: two rows contain `(above the limit of Tier 1)`.
- [ ] **Step 2: Run.** Expected: FAIL for each new check.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** all test scripts. Expected: all PASS.
- [ ] **Step 5: Mutation proof.** Remove the tier mark: the Kroot check gives FAIL. Undo.
- [ ] **Step 6: Commit.** `git commit --author=... -m "Show unknown injuries, backgrounds and sub-options, and Kroot mutations above the tier"`

---

### Task 14: One background bonus; no write in a render (A14, A15)

Spec: §11. Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `creator/js/derived-stats.js:5-14` (`getBackgroundBonus`)
- Modify: `creator/tabs/background-tab.js:62-63` (the repair call goes), `:173-209` (`renderBonusDisplay`: the notice), `:252-276` (`repairMissingBonusTypes` goes)
- Modify: `creator/tabs/character-sheet-tab.js:76-77` (the repair call goes), `:2797-2825` (`repairBackgroundBonusTypes` goes)
- Test: `scripts/test-background-bonus.js` (new)

**Interfaces:**
- Consumes: Task 9 (X3 fills `bonusType` at load); Task 13 changed other lines of `populateSelects`.
- Produces: `DerivedStats.getBackgroundBonus(character, statType) -> 0 | 1` by spec §11.1. `renderBonusDisplay` removes the class `hidden` from `#background-bonus` and writes the spec §11.1 text when an entry is set and `bonusUsed` is `null`.

- [ ] **Step 1: Write the failing test** (full sandbox plus `background-tab.js` and `character-sheet-tab.js`, recording DOM stub whose `classList` is a `Set`):
  - Three entries with `bonusType: 'maxWounds'`, `bonusUsed: 'origin'`: `getBackgroundBonus(c, 'maxWounds') === 1`. `bonusUsed: null`: `0`. `bonusUsed: 'zz'`: `0`. `bonusUsed: 'goal'` with `goal: null`: `0`.
  - An origin with a real id and no `bonusType`: `BackgroundTab.render()` leaves `JSON.stringify(State.character)` unchanged.
  - `CharacterSheetTab.repairBackgroundBonusTypes === undefined` and `BackgroundTab.repairMissingBonusTypes === undefined`.
  - `bonusUsed: null`, origin set: `#background-bonus` HTML contains `Select one bonus with USE THIS BONUS`, and its `classList` does not hold `hidden` (P15).
- [ ] **Step 2: Run.** Expected: FAIL for each check.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** all test scripts. Expected: all PASS.
- [ ] **Step 5: Mutation proof.** Add back the `accomplishment` line of the old sum: the `bonusUsed: 'origin'` check gives `2` and FAIL. Undo.
- [ ] **Step 6: Commit.** `git commit --author=... -m "Apply one background bonus and stop the renders that write bonusType"`

---

### Task 15 (14a): Tracker getters and the box bound (B3 render, B5)

Spec: §10.3. Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `creator/tabs/character-sheet-tab.js:394`, `:398` (`--n`), `:710-727` (both box functions)
- Modify: `creator/js/state.js:1138-1141` (`getCurrentWounds`), `:1159-1161` (`getCurrentShock`), `:1256-1262` (`getCurrentFaith`)
- Test: `scripts/test-sheet-bounds.js` (new)

**Interfaces:**
- Consumes: Task 7 and Task 14 lines of the sheet (do not change them).
- Produces:
  - `CharacterSheetTab.BOX_LIMIT = 50`. Both box functions draw at most `BOX_LIMIT` boxes and then `<span class="sheet-empty">+<n> more</span>`. The `--n` style uses `Math.min(max, BOX_LIMIT)`.
  - The getters by spec §10.3.

- [ ] **Step 1: Write the failing test** (full sandbox plus `character-sheet-tab.js`; stub `ThreatCard.render` and `Glossary.enhanceElement` as needed):
  - `renderTrackingBoxes('wounds', 0, 30000)`: 50 `tracking-box` spans, the text `+29950 more`, and less than 200 ms. `renderFollowerBoxes('wounds', 0, 30000)`: the same. `renderTrackingBoxes('wounds', 2, 5)`: 5 boxes, 2 `filled`.
  - Getters: one talent whose `effect` contains `You gain +1 Faith.` (the first such talent of `data/talents.json`), `currentFaith: 2`: `getMaxFaith() === 1` and `getCurrentFaith() === 1`; `modifyCurrentFaith(1)` gives `getCurrentFaith() === 1`. `currentWounds: 7` with a max of 3 (Human, Toughness 1, tier 1, no talents): `getCurrentWounds() === Math.min(7, DerivedStats.calculateMaxWounds(c))` and `State.character.currentWounds === 7`.
- [ ] **Step 2: Run.** Expected: FAIL for each check except the 5-box check.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** all test scripts. Expected: all PASS.
- [ ] **Step 5: Mutation proof.** Remove the bound from `renderTrackingBoxes`: the box count check gives FAIL. Undo.
- [ ] **Step 6: Commit.** `git commit --author=... -m "Bound the tracker boxes and clamp the trackers to their maximum"`

---

### Task 16 (14b): The sheet: unknown rows and stored powers (A11, B11, P18)

Spec: §9.4 (sheet), §13.3. Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `creator/tabs/character-sheet-tab.js:348` (Powers tab test), `:1257-1268` (`renderEquipment`), `:1660-1662` (unknown talent), `:1720-1723` and `:1741-1742` (`renderPsychicPowers`), `:1793-1794`, `:1818-1819` (injuries), `:1869-1870` (mutations), `:2057-2058` (`copySummary` wargear), `:2086` (`copySummary` powers test)
- Test: `scripts/test-sheet-bounds.js` (extend)

**Interfaces:**
- Consumes: Task 15 lines of the sheet (do not change them).
- Produces:
  - `CharacterSheetTab.hasStoredPowers(character) -> boolean`: a `psychicPowers` id that is not in `State.UNIVERSAL_ABILITY_IDS`, or a non-empty `unlockedDisciplines` (P18). The three psyker tests use `State.isPsyker() || this.hasStoredPowers(character)`. `renderPsychicPowers` lists the stored disciplines when it shows for this reason.
  - Unknown rows by spec §13.3: the text `Unknown <talent|power|wargear|injury|mutation> (<id>)`, escaped.

- [ ] **Step 1: Write the failing checks** (stub `navigator.clipboard.writeText` to record the text):
  - `renderTalents` with `['zz']` contains `Unknown talent (zz)`; `renderEquipment` with `[{ id: 'zz_w' }]` contains `Unknown wargear (zz_w)`; `renderInjuriesCorruption` with a memorable injury `zz` contains `Unknown injury (zz)`; `renderMutations` with `zz` contains `Unknown mutation (zz)`; the `copySummary` text contains `Unknown wargear (zz_w)`.
  - Powers: Human `ganger`, `psychicPowers: ['smite']`: `renderPsychicPowers(c)` is not `''` and contains `Smite`. Human `ganger`, `psychicPowers: []`, `unlockedDisciplines: ['Biomancy']`: `hasStoredPowers(c) === true` and the output contains `Biomancy`.
- [ ] **Step 2: Run.** Expected: FAIL for each check.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** all test scripts. Expected: all PASS. (`scripts/test-sheet-tabs.js` stubs `State`; add `UNIVERSAL_ABILITY_IDS: []` to its stub only if a check needs it, and name the line in the commit body.)
- [ ] **Step 5: Mutation proof.** Remove the `unlockedDisciplines` test from `hasStoredPowers`: the Biomancy check gives FAIL. Undo.
- [ ] **Step 6: Commit.** `git commit --author=... -m "Show unknown ids and stored powers on the sheet"`

---

### Task 17: Number inputs; Rank 1 to 3 (B3, B4, CC11, CC12)

Spec: §2 (Rank and Tier rulings), §10.1, §10.2. Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `creator/index.html:185` (`max="5"` to `max="3"`; Task 1 already changed other lines of this file)
- Modify: `creator/js/state.js:204-225` (`setTier`, `setRank`, `setAdditionalXP`), `:1057-1060` (`setCorruptionPoints`); add `_intInRange` before `setName`
- Modify: `creator/tabs/setting-tab.js:11-24` (refresh the input after a refused value)
- Modify: `creator/tabs/injuries-tab.js` (the corruption handler near `:331`, not the lines of Task 13)
- Modify: `creator/tabs/followers-tab.js:218-224` (Members and Living)
- Test: `scripts/test-number-inputs.js` (new)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `State._intInRange(value, min, max) -> number | null` by spec §10.2.
  - `setRank` (1..3), `setAdditionalXP` (0..), `setCorruptionPoints` (0..), `setTier` (1..5): each returns `true` when it stores and `false` when it refuses; a refused value does not notify.
  - Setting tab: on `false`, `SettingTab.refresh()`. Corruption: on `false`, the input gets the stored value. Followers: Members `1..Infinity`, Living `0..follower.count`; on a refused value, no `applyFieldChange` and a re-render.

- [ ] **Step 1: Write the failing test** (full sandbox; plus `setting-tab.js` and `followers-tab.js` with a DOM stub that records `addEventListener` handlers):
  - Rank 2: `setRank('30000')`, `'-5'`, `'2.5'`, `'1e5'`, `''`, `'4'`: each returns `false`, the rank stays `2`, and the listener count does not change. `setRank('3')`: `true`, rank `3`.
  - `setAdditionalXP('-5')`: `false`; `'40'`: `true`, `40`. `setCorruptionPoints('-1')`: `false`; `'12'`: `12`. `setTier('0')`, `'6'`: `false`; `'5'`: `5`.
  - Setting tab: fire the `change` handler of `#character-rank` with `value: '30000'`: the input value is then `'2'`.
  - Followers: Members `'2.5'` and Living above Members keep the stored values.
  - G1: `loadCharacter({ ...<a valid character>, rank: 5 })` keeps `rank === 5`, and `DerivedStats.calculateMaxWounds` of it is a finite number.
  - `creator/index.html` holds `id="character-rank" value="1" min="1" max="3"`.
- [ ] **Step 2: Run.** Expected: FAIL for each check except the G1 check.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** all test scripts. Expected: all PASS.
- [ ] **Step 5: Mutation proof.** Use `parseInt(rank) || 1` again in `setRank`: the `'30000'` and `'4'` checks give FAIL. Undo.
- [ ] **Step 6: Commit.** `git commit --author=... -m "Refuse a typed number outside the range of its input and limit Rank to 3"`

---

### Task 18: Settings storage and the Load confirm (A16, A17, A18, CC6, P7, P14)

Spec: §12. Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `creator/js/state.js:1467-1481` (`setEnabledSources`, `setIgnorePrerequisites`); add `_SETTINGS_KEY` after `ID_ALIASES` (Task 9 added it after `_AUTO_SAVE_KEY`) and `saveSettings`, `getSavedSettings` after `clearAutoSave`
- Modify: `creator/js/character-io.js:48-70` (`load`)
- Modify: `creator/js/web-api.js:5-7` (one new `let _previousSaveFileHandle`), `:58-101` (`showOpenDialog`: keep the handle that was there before the pick) and add `cancelOpen` after `showOpenDialog` (Task 8 changed line 20 of this file; CC17)
- Modify: `creator/js/app.js:158-167` (Load handler), `:469-474` (`_mergeEnabledSources`), `:476-497` (`checkAutoSave`)
- Test: `scripts/test-settings-persist.js` (new)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `State._SETTINGS_KEY = 'wng-creator-settings'`. `State.saveSettings()`: writes `{ enabledSources, knownSources, ignorePrerequisites }` with `setItem` in a `try` (the `knownSources` rule of `_performAutoSave:1527`). `State.getSavedSettings() -> object | null`: `getItem` and the parse in one `try` (P7c).
  - `setEnabledSources` and `setIgnorePrerequisites` call `saveSettings()`.
  - `App._mergeEnabledSources(saved)`: uses only the string entries of `saved.enabledSources`.
  - `App.checkAutoSave()`: `const settings = State.getSavedSettings() || State.getAutoSave()`; `if (settings)` (P7a) it applies the sources only when `Array.isArray(settings.enabledSources)`, and `ignorePrerequisites` only when `=== true`. Then `const saved = State.getAutoSave()` and the character part as today with `saved?.character` (P7b). When no character loads, `State.markClean()` (P14a).
  - `window.api.cancelOpen()`: puts back the file handle that was there before the last `showOpenDialog` and sets the pending file to `null` (CC17).
  - `CharacterIO.load(confirmLoad = null)`: after `importCharacter` succeeds and before `State.loadCharacter`, `if (confirmLoad && !(await confirmLoad(dialogResult.filePaths[0]))) { window.api.cancelOpen?.(); return { success: false, error: 'Load cancelled.' }; }` (CC6, CC17).
  - Load handler: passes `confirmLoad` only when `character.name || character.species?.id || character.archetype?.id`; it asks `window.api.showConfirm('Load "<file name>"? Unsaved changes to the current character will be lost.', 'Load Character')`. No confirm before the file dialog.

- [ ] **Step 1: Write the failing test.** A context with the full sandbox, `character-io.js`, `app.js`, a `localStorage` stub on a shared `Map`, `document` with `addEventListener() {}` and a `getElementById` that records `click` handlers, `SettingsTab: { sourceButtons: [{ id: 'core' }, { id: 'fspg' }], refresh() {} }`, `SettingTab: { refresh() {} }`, `window.api` with `showOpenDialog: async () => ({ canceled: false, filePaths: ['Vex.character'] })`, `importCharacter: async () => ({ success: true, character: <a valid character named Vex> })`, `showMessage: async () => {}`, and `App.switchTab` / `App.switchSection` replaced by no-ops. Checks:
  - A16: blank character, `setEnabledSources(['core'])`: the settings key holds `enabledSources: ['core']`. `newCharacter()`: the key stays. A new context on the same `Map`: `App.checkAutoSave()` gives `State.enabledSources` `['core']`, and `State.isDirty === false` (P14a).
  - Fallback: only the old autosave `{ character: <a valid character named Kaelen>, enabledSources: ['core'], knownSources: ['core', 'fspg'], ignorePrerequisites: true }`: after `checkAutoSave()`, sources `['core']`, `ignorePrerequisites === true`, `State.character.name === 'Kaelen'`, and the settings key now exists.
  - P7a: empty storage: `checkAutoSave()` gives no throw, the default sources, and `isDirty === false`.
  - P7b: both keys, the settings key with `enabledSources: ['fspg']` and the autosave of Kaelen with `enabledSources: ['core']`: sources `['fspg']` and `State.character.name === 'Kaelen'`.
  - P7c: a `localStorage` whose `getItem` and `setItem` throw: `checkAutoSave()` and `setEnabledSources(['core'])` give no throw.
  - A17: autosave `enabledSources` of `{}`, `5`, `true`, `'core'`: no throw, and `State.enabledSources` is the default list. `['core', 5]` with `knownSources: ['core', 'fspg']`: `['core']`.
  - CC6: `CharacterIO.load(async name => { seen = name; return false; })`: `State.character` is unchanged, the result error is `'Load cancelled.'`, and `seen === 'Vex.character'`. `CharacterIO.load()` with no argument: the character is Vex.
  - CC17: a second context loads the real `creator/js/web-api.js` with `window.showOpenFilePicker` returning fake handles `h1`, then `h2` (each `getFile()` gives a file object; each `createWritable()` records its writes), `navigator.userAgent: 'Node'`, and a `document` stub. `await api.showOpenDialog()` (h1), then `await api.showOpenDialog()` (h2), then `api.cancelOpen()`, then `await api.exportCharacter({ name: 'x' })`: `h1` has one write and `h2` has none.
  - CC6 through the button: `App.initHeaderButtons()`; a character named Kaelen and `showConfirm = async (text) => { asked = text; return false; }`: fire the Load handler; the character is still Kaelen and `asked` contains `Vex.character`. With `true`: the character is Vex. A blank character: `showConfirm` is not called and the character is Vex.
- [ ] **Step 2: Run.** Expected: FAIL for each check (P7a and the blank-character check may already pass; Step 2 lists each FAIL).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** all test scripts, also `scripts/test-load-check.js:535-549` (`localStorage: {}`). Expected: all PASS.
- [ ] **Step 5: Mutation proof.** Test truthiness again in `checkAutoSave`: the `{}` check throws and gives FAIL. Read the character from `settings.character`: the P7b check gives FAIL. Remove the handle restore from `cancelOpen`: the CC17 check gives FAIL (`h2` gets the write). Undo each.
- [ ] **Step 6: Commit.** `git commit --author=... -m "Store the settings under their own key and confirm a Load after the file pick"`

---

### Task 19: Render guards (B6, B7, B8)

Spec: §13. Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `creator/js/threat-card.js:278-286` (`renderTextSection`)
- Modify: `creator/tabs/wargear-tab.js:642` (one line; Tasks 8 and 12 changed other lines of this file)
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

### Task 20: Late findings (the sub-option Confirm, the talent name on the sheet, the sub-faction select, the Compendium text, one test)

**Added by the controller on 2026-11-16, after the 19 planned tasks.** The task reviews found older defects that were in `main` before the pass. The owner asked for "an overall pass for any bugs like those" in one go, so the ones that a normal user can meet and that have a small correction are in this task **[Controller ruling TC20-0]**. Each item is independent. No item changes a stored shape, a number or a rule of the game. The other late findings go to the owner in the report.

**Files:**
- Modify: `creator/tabs/species-tab.js` (item 1), `creator/tabs/character-sheet-tab.js` and, only if a shared function is the smallest change, `creator/tabs/talents-tab.js` (item 2), `creator/tabs/archetype-tab.js` (item 3), `creator/tabs/references-tab.js` (item 4), `scripts/test-load-check.js` (item 5)
- Test: `scripts/test-creator-late.js` (new)
- No `?v=` change (`creator/index.html` is at `?v=130` for this branch). Nothing under `bestiary/`, `shared/` or `data/`.

**Item 1: Confirm in the optional sub-option window keeps a stored unknown option [TC20-1; rule G2 of the pass: no silent delete through the UI].**
- Defect (review of Task 13): in the optional sub-option window of the Species tab, Confirm with nothing picked deletes a stored option of that type whose id the data does not have (`creator/tabs/species-tab.js`, near lines 348 to 352). The user did not ask for that delete, and the autosave then stores the loss.
- Rule **[TC20-1a, a controller correction after the first commit of the task]**: Confirm changes a stored option only when the user made a choice in the window. With nothing picked for a type, a stored option of that type with an unknown id stays stored: the window never showed it as picked, so the user did not clear it. It keeps its "Unknown ..." row with its Remove control from Task 13. A known option that the user picks replaces the stored option of its type through the State setter, as before the task, also when the stored option is unknown: the pick names that type, and the readers of the sub-options (the sheet, `app.js`, `prerequisite.js`) use the first entry of a type, so a kept unknown entry would hide the new pick. No tab writes into the character directly, and no tab calls `State.notifyListeners`.
- Checks: nothing picked with one stored unknown option: the stored list is deep-equal to the list of before; a known option picked: the stored result is deep-equal to the result of the old code; a known option cleared with no unknown entry: deep-equal to the old code; the Remove control of the unknown row still deletes it.

**Item 2: the sheet shows a talent name as the Talents tab shows it [TC20-2].**
- Defect (review of Task 7): for a talent whose name has a placeholder, the sheet keeps the placeholder ("Hatred [Any] (ORKS)") and the Talents tab replaces it ("Hatred (ORKS)") (`creator/tabs/talents-tab.js`, near line 351: "Replace [Any], [Skill], [Trait], etc. with the actual choice").
- Rule: the talent row of the sheet, and the talent line of the sheet's copy text if it prints the name, show the same name text as the selected-talent row of the Talents tab, for each talent and each choice. The rules of Task 7 stay: an index choice with no item shows "(no item selected)"; a text choice shows as before; each value goes through the escape helper of its file.
- Use the smallest change. If the Talents tab computes the name inline, one function on the Talents tab object that both sites call is acceptable; say in the report what you did.
- Checks: for a character with (a) a placeholder talent with a text choice, (b) a talent with a wargear index choice, (c) the same with an index that has no item, (d) a talent with no choice, (e) an unknown talent id, (f) a hostile choice text: the name text of the sheet row equals the name text of the Talents tab row (compare the text of the two name elements); (a) holds no `[Any]` on the sheet. For a character whose talents have no placeholder, the sheet HTML is byte-equal to the HTML of the old code.

**Item 3: the sub-faction keyword select keeps the keyboard focus [TC20-3].**
- Defect (review and re-review 2 of Task 11): the sub-faction keyword select of the Archetype tab (`creator/tabs/archetype-tab.js`, near line 349) loses the focus on each change, and at the first typed letter, because the detail is drawn again. A keyboard user cannot step through the options. Its label is a `div` with no tie to the select.
- Rule: use the mechanism that Task 11 built for the "any skill" selects in the same file (rulings TC11-1 to TC11-6 in the spec: the select that the user changed has the focus after the change; an open type-ahead is not cut; the select has an `aria-label` with the text of its label). The stored result of a change is the same as before. The look does not change (no new class, no moved element).
- Checks: read the Task 11 checks (search the test scripts for `skill-choice-select`) and write the same kind for the keyword select: after a change, the element with the focus is the keyword select of the same key; the stored keyword choice is the value that the old code stored; the select has an `aria-label`. Browser proof (headless, in the report, not committed): Tab to the select, ArrowDown two times: the focus stays and the second key press changes the value again; type two letters fast: the option that starts with both letters is selected; a mouse change works as before.

**Item 4: the Compendium prints "Skill of your choice +4" [TC20-4].**
- Defect: the Compendium entry of an archetype with an "any skill" bonus prints the data key: "Choice1 +4, Choice2 +4" (Inquisitor) and "Choice +2" (`creator/tabs/references-tab.js`, near line 762, the `Skill Bonuses` line).
- Rule: a skill bonus key that matches `/^choice\d*$/` gives `` `Skill of your choice +${val}` `` (the words of the Archetype tab). Each other key gives the old expression. The bestiary copy of this tab gets exactly this line on its own branch; do not touch it.
- Checks: the entry of the Inquisitor archetype (read the real id in `data/archetypes.json`) holds "Skill of your choice +4, Skill of your choice +4" and no "Choice1"; an entry with normal skills is byte-equal to the old output.

**Item 5 (test only): the HOSTILE loop checks the path of each warning [TC20-5].**
- Gap (review of Task 4): the HOSTILE loop of `scripts/test-load-check.js` (near line 420) checks only the warning count, not the path text. A mutant that gives the `archetypeSkillChoices` row of `creator/js/character-check.js` the path `archetypeKeywordChoices` stays green.
- Rule: each hostile row names the path that its warning must hold, and the loop checks it. Do not change `creator/js/character-check.js`.
- Check: that mutant fails.

**Proof (report `task-20-report.md`):** for each item: the failing-first run of its checks at the base of the task, then the passing run; one mutation of each corrected line, copy and restore by `cp`, with the FAIL line. All `scripts/test-*.js` pass (32 with the new script); `scripts/test-load-check.js`, `scripts/test-sheet-tabs.js` and `scripts/test-sheet-bounds.js` pass with their old counts or more. `git diff --stat` holds only the files of this task.

**Commit:** one commit, `--author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>"`, no attribution line.

## Order of the tasks that share a file

| File | Tasks in order |
|---|---|
| `creator/index.html` | 1 (lines 12-13, 523-556), 17 (line 185) |
| `creator/js/web-api.js` | 8 (line 20), 18 (lines 5-7, 58-101, new `cancelOpen`) |
| `creator/js/prerequisite.js` | 3 (line 225) |
| `data/species.json`, `data/archetypes.json` | 8 |
| `creator/js/state.js` | 2, 3, 4, 5, 6, 9, 10, 15, 17, 18 |
| `creator/js/character-check.js` | 4, 5, 9 |
| `creator/tabs/character-sheet-tab.js` | 7, 14, 15, 16 |
| `creator/tabs/wargear-tab.js` | 8, 12, 19 |
| `creator/tabs/ascension-tab.js` | 10, 11 |
| `creator/tabs/archetype-tab.js` | 7, 11 |
| `creator/tabs/talents-tab.js` | 7, 12 |
| `creator/tabs/background-tab.js` | 13, 14 |
| `creator/tabs/injuries-tab.js` | 13, 17 |
| `scripts/test-load-check.js` | 3, 4, 5, 9 |
| `scripts/test-custom-wargear.js` | 3, 5, 6 |
| `scripts/test-stat-baseline.js` | 2, 3, 4 |
| `scripts/test-unknown-ids.js` | 12, 13 |
| `scripts/test-sheet-bounds.js` | 15, 16 |

`setCustomArchetype` gets its final statement order from three tasks (spec §5.2): Task 3 writes steps 1, 4 and 8; Task 5 adds steps 2, 5 and 7; Task 6 adds steps 3 and 6.

---

## Review record (2026-11-16)

Branch `bug-pass-creator`, base `44084ae` (`main`), head `8dc7c7a`, 63 commits. The commits of each task are in the wave table. The other 13 commits are documents: `7e2f18d`, `44da12d` and `3887009` (the spec and the plan, with two fix rounds), `4b82488`, `d09f51b`, `d008810`, `d5d21d1`, `2d096a0`, `fdb2e99`, `6676218` and `0483276` (spec and plan sentences of the controller after task reviews), `9d145bf` (one CSS comment), `8f33306` (Task 20 in the plan). Then the controller's commit with this record.

### The owner's words

- 2026-11-15: "Let's do an overall pass for any bugs like those and clean them up in one go."
- 2026-11-15: "To my knowledge, rank is only 1 to 3. If I'm incorrect, this is something we'll need to find proof for."
- 2026-11-15: "Tier should be able to go up to 5. It's only up to 4 in the base book, but Vow of Absolution expands the tier to 5."

The owner gave no other word for this branch. Each other decision below is a controller ruling.

### How the wave ran

Two read-only audits of the creator found A1-A24 (stored data, in a `vm` sandbox) and B1-B11 (a walk through the real page in headless Chromium). A third audit found C1-C11 in the bestiary, which has its own branch. One general-purpose author (opus) wrote the spec and the plan, and one reviewer (opus, xhigh) reviewed them: 20 findings, then a scoped re-review with 7 new findings, closed in two fix rounds. The author also did a read-only book search for a Rank above 3. Each of Tasks 2 to 20 had one implementer dispatch and one review by a different agent (opus, xhigh) in a second worktree, detached at the task commit, while the next task started. Each fix round went back to the same implementer through SendMessage, and an Important finding got a scoped re-review by the same reviewer. The controller did Task 1 (one `sed`) with no separate review. The controller added Task 20 after the 19 planned tasks, because the task reviews found older defects that a normal user can meet and that have a small correction (ruling TC20-0).

### Rulings

The controller's general rules G1-G11 are in a session file. Spec §2 states the two that decide the most: G1 (no harm to stored data, each exception is named) and G2 (no silent delete through the UI). The table holds each ruling of the ledger and of the review files. The rulings with no id come first, in ledger order.

| Ruling | What was decided | Reason | Cost if wrong |
|---|---|---|---|
| (two plans) | The pass has two plans, one for each app, in two worktrees at the same time. | The apps share no file that the pass changes. | A merge conflict in a doc or a test, seen at the second merge. |
| (no spec stop) | The wave goes from the owner's request to the plan with no approval stop for the spec. | The owner asked for the cleanup "in one go", and the practice of this repo is rulings in the record. | A correction that the owner did not want. Each one is a separate commit and can go back. |
| (D1-D6 defaults) | The defaults of D1-D6 stay for the plan review, and each one goes to the owner in the report. The owner's words then withdrew the D1 default "keep 1 to 5" (CC11) and closed D2 (CC12). | None blocks the work, and each default is "no change". | One small follow-up change. |
| (D1 closed) | Rank is 1 to 3: input `max="3"`, setter range 1 to 3, Core p.146 as the citation. A stored rank of 4 or 5 stays until the user edits it (G1), unless the owner says to change it at load. | The book search found no Rank above 3 in an official book. | (not stated) |
| (no third plan review) | The plan gets no third review. | The task reviews check each correction. | A wrong plan line reaches an implementer. |
| (Task 1) | The controller does Task 1, and it gets no separate review. | One `sed` on one file, with the counts of the brief as the check. The Task 17 review reads the same file, and the final review checks the tags. | A tag with the old number, seen at the final review. |
| (wait rules) | Task 5 waits for the reviews of Tasks 2 and 3. Tasks 8, 12, 13, 15 and 18 each wait until one open review is in. Task 19 starts with three reviews open. | Three open reviews are the limit. The files of Task 19 are not in the scope of the open reviews. | Some minutes of wait. For Task 19: none. |
| (Task 2 F3) | The report text item F3 is parked. | The report is a session file and does not go into the repo. | None. |
| (Task 4 N4, Task 11 M1, Task 14 N1, Task 17 F5) | Each Minor test gap with the reviewer's own fixture goes to the same implementer, with no further re-review. | The final review has the commit in scope. | A weak check until the final review. |
| (Task 7 N1) | A talent choice of `'1abc'`, `'1.5'` or `1.5` stays parked. | No writer of any version makes such a value, and a change of the two bonus readers has more risk than the defect. | A hand-edited file shows a text and still gets the bonus. |
| CC1 | The alias step for `aeldari_psychosensitive` also adds the sub-option `{ type: 'psychosensitive', optionId: 'psyker' }` when it is absent. | The character keeps PSYKER. | (not stated) |
| CC2 | On a change of species, an attribute or a skill above the maximum of the new species goes down to that maximum. No mark and no new control. | The maximum is a rule of the game (G4). The old code reset the full stat block in this case. | A user who selects a species by mistake buys the points above the other maximum again. The XP is free again. |
| CC3 | An ascension entry records the ids that its grant step added (new optional field `ascensions[i].granted`). The remove releases only those. | A free pick of the user stays. | One more stored field with a check row. |
| CC4 | A free pick that no current slot covers leaves `freePowers` and stays in `psychicPowers`. | The power stays visible and its XP is correct. | (not stated) |
| CC5 | An alias does not map an entry onto an id that the same list already holds (talents, powers). That entry stays as an unknown row. Wargear can hold an item two times, so the alias maps it. | (not stated) | (not stated) |
| CC6 | The Load confirm comes after the file pick and before `State.loadCharacter`. It names the file. TC18-3 later added a condition. | A confirm before the file dialog can use up the user activation in Chromium (5 s), and Load then does nothing. | The user picks a file and then cancels. |
| CC7 | Custom Archetype selected again after a standard archetype keeps the stored custom record. A change of the base item in a relic or improvised edit clears `upgrades` (parked, spec §16). CC14 and CC16 added limits. | G2. | An old custom name shows again when the user selects Custom. |
| CC8 | The discipline chips with a remove control stay for each character that holds stored disciplines. `hasStoredPowers` gets the `unlockedDisciplines` test. | G2. | (not stated) |
| CC9 | Task 3 becomes 3a and 3b. Task 14 becomes 14a and 14b. | (not stated) | (not stated) |
| CC10 | P3, P4, P5, P7, P9 and P13-P17 apply as the reviewer wrote them. | (not stated) | (not stated) |
| CC11 | Rank 1 to 3 (D1 closed). | The owner's words of 2026-11-15 and Core p.146: "Your Rank can't decrease, and can't go above the maximum of 3." | (not stated) |
| CC12 | Tier 1 to 5 (D2 closed). The spec and the plan assumed that the Tier select already had 5 options. TC17-1 corrected that. | The owner's words of 2026-11-15. Core p.19 and Vow of Absolution p.125. | (not stated) |
| CC13 | D3 stays an owner decision with the default "no change". The spec lists what a species change loses after this pass. | (not stated) | (not stated) |
| CC14 | `creator/js/prerequisite.js:225` adds the custom keywords only when the archetype is `custom`. Each other reader of the `customArchetype` record gets the same test. | Re-review finding Q1: the kept record still added its keywords after Custom was left. | (not stated) |
| CC15 | The data gets the values of the Core p.25 table, after a compare of the full table. Task 8 corrects Ork Strength and Toughness 10 to 12 and Aeldari Strength 8 to 7. | The clamp and the increase limit read these values. | An erratum that the PDF does not hold. |
| CC16 | The once-only count and `getOldStartingEntries` leave out the entries that the kept custom record lists, counted per id. CC7 was not narrowed. | The record and the wargear list must agree after each sequence. | (not stated) |
| CC17 | The cancel path of the Load confirm puts back the file handle of before the pick (new `window.api.cancelOpen()`). | (not stated) | (not stated) |
| CC18 | Q3, Q4 and Q7 apply as the reviewer wrote them. | (not stated) | (not stated) |
| TC2-1, TC2-2 | Six test checks (F1, F2) and a report correction (F3). | F1 was a gap of the plan: each fixture was a Human. | (not stated) |
| TC2-3 | Three "Before the task" items go into "Late findings". | (not stated) | (not stated) |
| TC3-1 to TC3-3 | Four test checks, one comment in the past tense, report text. Named limit: a save made with the A4 defect keeps the old free values, and the rebase treats them as bought (G1: no change at load). | A gap of the plan's fixture list. | (not stated) |
| TC4-1 | The setter keeps the value of a skill before an "any skill" key selected it, in memory only (`State._skillChoicePrior`, not stored), and gives it back when the choice moves in the same session. | An arrow-key walk through the Task 11 select fires one change for each option. The users with an Inquisitor save and bought skills use the new select. | After a reload the old rule still applies (spec §17). |
| TC4-2 | F2, F3 and F4 apply as the reviewer wrote them. | (not stated) | (not stated) |
| TC4-3 | A change of archetype, a clear of the archetype and Custom Archetype in the same session give each kept skill the larger of the kept value and its new free value, then empty the memory. | Re-review finding N1. | (not stated) |
| TC4-4 | `resetStats` empties the memory. The restore gives `Math.max(Math.min(kept value, bonus), free value)`. | A value that the user decreased must not come back. | (not stated) |
| TC4-5 | Two report sentences corrected. | (not stated) | (not stated) |
| TC5-1 | No code change. A stale free power of an old archetype becomes paid at the next change of a source and stays stored and visible. No automatic remove. | The app cannot tell a stale grant from a free pick whose slot went (G2). | One click to remove it. The XP total can be under 0 until then. |
| TC5-2 | `_grantedPowerIds` also counts the recorded ids of an entry whose package the data does not have. `_settleFreePicks` leaves an unknown power id in `freePowers`. | (not stated) | (not stated) |
| TC5-3 | F1, F2, F5 and F6 apply as the reviewer wrote them. | (not stated) | (not stated) |
| TC6-1 | F1 and F2 (test scripts only). | (not stated) | (not stated) |
| TC6-2 | Five wargear record items go into "Late findings", with no change in this task. | (not stated) | (not stated) |
| TC7-1 | Display only: an owned-item talent choice that is an index with no item of the talent's kind shows "(no item selected)" in both views. The stored value does not change. | A raw index tells the user nothing (G3). | The text hides the stored number. |
| TC7-2 | F1-F4 apply as the reviewer wrote them. | (not stated) | (not stated) |
| TC7-3 | The fix round went further than TC7-1. Only an index with no item shows "(no item selected)". A choice that is not an index (an old text such as `'Chainsword'`) shows as before. | The old text tells the user what the old save selected. | An old text stays visible with no bonus. |
| TC8-1 | F1-F3 (test script and report). | (not stated) | (not stated) |
| TC8-2 | The controller corrects one spec sentence: a disabled "+", not no "+". | (not stated) | (not stated) |
| TC9-1 | Each alias table lookup tests an own key, with a check for each place. | A key that a plain object inherits (`constructor`) became a function, and the next autosave wrote `null`. | (not stated) |
| TC10-1 | The two sentences of spec §8.1 and §8.2 go into the page. | The plan left them out of the brief. | (not stated) |
| TC10-2 | F3, F4 and F5 apply. The B9 time limit is 100 ms. No separate re-review. | Minor items with the reviewer's own corrections. | (not stated) |
| TC11-1 | After a redraw, the focus goes back to the select of the same key. TC11-6 later removed the redraw for an accepted change. | A keyboard walk stopped after one key. | (not stated) |
| TC11-2 | The skill select gets the CSS of the sub-faction keyword select (look and 420 px limit). TC11-5 corrected the first rule. | The select was 978 px wide. | (not stated) |
| TC11-3 | `aria-label="Skill of your choice (<value>)"` on each select, with "1 of 2" and "2 of 2" when two selects have the same value. | The select had no accessible name. | (not stated) |
| TC11-4 | F4 and F5 apply as the reviewer wrote them. | (not stated) | (not stated) |
| TC11-5 | The first CSS rule lists `.skill-choice-select` with the same weight as `.keyword-choice-select`. | The scoped rule hid the gold focus border of `select:focus`. | (not stated) |
| TC11-6 | An accepted change does not draw the detail again. It updates the options of the other select in place. A refusal draws again. | The redraw cut the type-ahead of the browser. | (not stated) |
| TC12-1 | F1-F3 (test script only), with a scoped re-review for F1. | (not stated) | (not stated) |
| TC13-1 | F1-F3 (test checks and one report line). | (not stated) | (not stated) |
| TC14-1 | The background bonus box always tells the user what the stats do. An empty selected slot gives the notice. A selected unknown entry with one of the seven bonus types still applies its stored bonus and shows "Unknown <kind> (<id>)". | A hidden box with a bonus that applies leaves a number that nothing on the page explains. | One more notice. |
| TC14-2 | F2 and F3 apply as the reviewer wrote them. | (not stated) | (not stated) |
| TC15-1 | `BOX_LIMIT` is 100, not 50. | A legal stacked build reaches 57 Wounds. | A later book with more than 100 Wounds shows "+N more". |
| TC15-2 | F1 and F2 apply. | (not stated) | (not stated) |
| TC15-3 | The CSS rule in `creator/css/styles.css` for the count text is confirmed. | Without it the text wraps onto two lines. | (not stated) |
| TC16-1 | A long unknown id must wrap on the sheet and in the tabs of Tasks 10, 12 and 13. TC16-3 replaced the method (a rule on 19 shared classes) because it was wrong. | A real save can hold a 58-character id, and a Remove control must stay reachable on a phone. | A long id breaks in the middle of a word. |
| TC16-2 | F2 and F3 apply. | (not stated) | (not stated) |
| TC16-3 | The 19-class rule goes. The wrap applies only to the text of an "Unknown ..." row (one new class `unknown-entry-text`). | The shared name classes cannot tell a known row from an unknown one. The rule broke normal names (re-review N1). | Some test lines that pin the HTML of an unknown row change. |
| TC17-1 | The Tier select gets a Tier 5 option with 500 XP. | The owner's decision on Tier 1 to 5. The select had only 1 to 4, so the 31 Tier 5 archetypes never showed. | One option line. |
| TC17-2 | Each cell of the test tables gets an assertion with no condition. | Three mutations stayed green. | (not stated) |
| TC17-3 | The three `badInput` branches go. One check keeps the behavior. | The branches had no effect. | (not stated) |
| TC17-4 | The Rank hint becomes "Set your Character's Rank, between 1 and 3." | The range is a rule now (Core p.146). | (not stated) |
| TC17-5 | The label `5 - Vow of Absolution (500 XP)` stays. | Vow of Absolution p.125 and p.126 give Tier 5 no name (the controller read the page images). | One text. |
| TC18-1, TC18-2 | Test checks for the `cancelOpen` call and the start cases (F1, F2). | With the `cancelOpen` line removed, 47 of 47 checks passed. | (not stated) |
| TC18-3 | The Load confirm asks only when the file holds a character. | The confirm warned of a loss that could not occur. | None seen. |
| TC18-4 | A load that fails puts the file handle of before back. TC18-5 later limited it. | Else the next Save writes into a file that the user picked by mistake. | Save goes to the file of before. |
| TC18-5 | The `catch` calls `cancelOpen` only when `State.character` is still the object of before the load. | TC18-4 did not name that limit: a throw after the new character was in sent the Save to the old file. | None seen. |
| TC19-1 | F1-F4 (test script only). | (not stated) | (not stated) |
| TC19-2 | `renderSummaryStep` of the relic wizard reads the form through `getForm`. The spec number of threats with a list goes from 8 to 11 with this record. | Each read of the form uses the same own-key lookup. | (not stated) |
| TC20-0 | The late findings that a normal user can meet and that have a small correction go into one more task (Task 20) before the final review. The others go to the owner. | The owner asked for "an overall pass for any bugs like those" in one go. | One task and one review more before the merge. |
| TC20-1 | The first rule of item 1: Confirm writes only the options that the window offers, and an unknown stored option stays in each case. TC20-1a corrected it. | G2. | (not stated) |
| TC20-1a | A known pick replaces the stored option of its type through the State setter, as before the task. Only a Confirm with nothing picked keeps a stored unknown option. No tab writes into the character directly. | The readers use the first entry of a type, so a kept unknown entry hides a new pick. | A pick replaces an unknown option of the same type, as the code did before the pass. |
| TC20-2 | The sheet shows a talent name as the Talents tab shows it. | (not stated) | (not stated) |
| TC20-3 | The sub-faction keyword select keeps the focus, with the mechanism of Task 11 and an `aria-label`. | (not stated) | (not stated) |
| TC20-4 | The Compendium prints "Skill of your choice +N" for a key `choice`, `choice1` or `choice2`. | (not stated) | (not stated) |
| TC20-5 | Each HOSTILE row of `scripts/test-load-check.js` names the path of its warning, and the loop checks it. | A path mutant stayed green. | (not stated) |
| TC20-6 | A range band that is `null` prints `-` at the four creator sites that printed "null". | A normal user sees "RANGE 6/null/null" for four weapons. The sheet already printed `-`. | None seen. |
| TC20-7 | Confirm calls the setter for a type only when the type does not already store the picked id. | A button that the window showed as selected is not a pick. | None seen. |
| TC20-8 | No change for a talent choice `''`. The sheet keeps "Hatred [Any]" and the Talents tab keeps "Hatred ()". | The UI never stores `''`, and the rule "byte-equal to the old sheet" wins. | (not stated) |

### Plan text that no longer matches the code

- Global constraints and Task 17: the plan says that Task 17 changes only line 185 of `creator/index.html`. The code also changes the hint at `:186` (TC17-4) and adds the option `5 - Vow of Absolution (500 XP)` at `:200` (TC17-1, TC17-5).
- Task 4: the plan has no memory of the value before a choice. The code has `State._skillChoicePrior`, `_keptSkillChoices` and `_restoreKeptSkillChoices`, used in `setArchetype`, `clearArchetype` and `setCustomArchetype`, and `resetStats` empties it (TC4-1, TC4-3, TC4-4).
- Task 7: the plan shows "(no item selected)" only for a `null` or absent choice. The code also shows it for an index with no item of the talent's kind, and shows a text choice as before, through `isIndexChoice` in each tab (TC7-1, TC7-3). Three expectations of `scripts/test-custom-wargear.js` changed.
- Task 10: the B9 time limit is 100 ms, not 500 ms (TC10-2). The notice and the row texts are the spec §8.1 and §8.2 sentences (TC10-1). The notice shows only for a list that is not empty, and an orphan entry with nothing chosen shows "Ascension package (none chosen)" with Remove (accepted deviations).
- Task 11: the plan draws the detail again after each change. The code updates the other select in place and draws again only on a refusal (TC11-6). It also has the focus rule (TC11-1), the CSS in `creator/css/styles.css` (TC11-2, TC11-5) and the `aria-label` (TC11-3).
- Task 14: the plan has one function `getBackgroundBonus` that returns 0 for an unknown `bonusUsed`. The code has the helper `DerivedStats.getAppliedBackgroundBonus`. A selected unknown entry with one of the seven stored bonus types still applies and shows as "Unknown <kind> (<id>): +1 <Bonus name>" (TC14-1).
- Task 15: the plan says `BOX_LIMIT = 50` and the check text `+29950 more`. The code has 100 (TC15-1). One CSS rule `.sheet-strip-trackers .tracking-boxes .sheet-empty` is in `creator/css/styles.css` (TC15-3).
- Task 16: the plan changes only `creator/tabs/character-sheet-tab.js`. The code also puts the class `unknown-entry-text` on the unknown rows of seven tab files, with one CSS rule (TC16-1, TC16-3). The sheet also shows unknown background entries, sub-options, ascensions and upgrades (accepted deviation).
- Task 17: the plan does not name the Tier option and the hint (refer to the first item). The handlers use the `change` event, and the `badInput` branches are gone (TC17-3).
- Task 18: the plan asks the confirm for each file. The code asks only when the file holds a character (TC18-3). Each exit after a pick that does not load calls `cancelOpen`, and the `catch` does so only when the character did not change (TC18-4, TC18-5). The start guard of ruling TB3-2 (the bestiary ledger) is in `App.init`: with no `CharacterCheck`, the page shows "The app did not load completely. Reload the page." and stops. The start returns early only when both storage keys are empty (accepted deviation).
- Task 19: the plan guards three lookups. The code has the helpers `getForm` and `getPowerTable`, four guarded sites and the summary step (TC19-2), and a local `escapeHtml` in `threat-card.js`.
- Task 20: item 1 holds TC20-1a, but not TC20-7. Item 6 (TC20-6) is not in the plan text, and its four files (`creator/tabs/wargear-tab.js`, `creator/js/relic-wizard.js`, `creator/js/improvised-builder.js`, `creator/js/custom-wargear.js`) are not in its file list. Item 2 uses two helpers on the sheet object, and the Talents tab is not changed. The copy text of the sheet now holds the talent choice. Item 3 has no redraw and no `focus()` call.
- Spec text (not plan): §13 B6 says that 8 threats hold a list, and the data has 11 (TC19-2). §17 says "The 50-box bound" (TC15-1 set 100).

### Evidence

| Task | Test script and checks at the end of the task | Mutation proof | Review in a real page |
|---|---|---|---|
| 1 | No script. `grep -c '?v=130'` gives 36, `?v=129` gives 0. | One tag back to `?v=129` gives 35 (plan step). | No separate review (ruling). |
| 2 | `test-stat-baseline.js` 72 (15 failed before). | Each of the six reviewer mutations fails its new check. | 152,656 runs: the only XP differences are the named case (276) and values above the cost table (4). The limits agree in 595,584 checks. The Stats tab HTML is the same for 6,000 normal characters. |
| 3 | `test-stat-baseline.js` 106 (17 failed before). | Two proofs. Each of the four reviewer mutations fails a new check. | A walk of 400 seeds with 80 steps against an independent model: no difference (the base differs in each class). Headless browser 44 of 44. |
| 4 | `test-stat-baseline.js` 127. | 2 FAIL lines, then five, three and three mutants each fail a new check. | No control yet. The memory never reaches the stored character, the export or the autosave. The species clamp holds after the restore. |
| 5 | `test-grants.js` 51, `test-load-check.js` 2092 (18 + 34 FAIL lines before). | Two proofs, then 11 mutants each fail. | 300 seeds of 40 steps with no difference (the base: 15472 "lost bought", 5423 "lost granted", 1767 "kept free with no source"). 400 old-shape characters load with no change. Re-review: 700 seeds plus 400 old saves. |
| 6 | `test-wargear-refs.js` 81. | Three proofs, then three mutants each fail. | 2000 sequences of 40 steps with no difference (the base: 490 choices on a different item, 827 on a removed item). The real Remove button and Custom card. CC16 in 7 sequences. |
| 7 | `test-wargear-refs.js` 75 (before the Task 6 fix round). | The confirm removed fails the two cancel checks. M1, M2, M5, M6, F5 and the TC7-3 mutation fail. | The confirm names exactly the 7 old starting entries. Cancel changes nothing. The pages of a normal character are the same bytes as at the base. |
| 8 | `test-starting-wargear.js` 42. | Two proofs. M4, M5, M6 and M7 each fail. | Page images Core pp.25, 90, 117, 236, Vow of Absolution pp.39, 41, 73, Aeldari pp.28, 94. Each of the 35 values of Core p.25 equals the data. The data diff is exactly 6 values. |
| 9 | `test-load-check.js` 2123 (17 failed before). | Two proofs, then three mutants fail. | 893 characters built through the real writers load with no change, also at a second load. Each of the 8 alias pairs has rename evidence. The real autosave and Load button paths. |
| 10 | `test-ascension-tab.js` 39 (42 at the head, after `1332f95`). | The loop start at `startingTier + 1` fails the two B9 checks. The four reviewer mutations each fail. | A tier of -300000 renders in 1 ms (the base: 30 s). No XP, tier, wounds, shock or wealth change against the base. Screenshots at 1280 px and 390 px. |
| 11 | `test-skill-choice-ui.js` 60. | The first mutation fails 4 checks. Then six mutations, two (5 and 4 checks) and one (2 checks). | The XP goes from 240 to 214 for two chosen skills and comes back. 233 of 235 archetype details are the same as at the base. 38 key presses give 36 changes with no loss of focus. The same gold focus border at 1280 px and 390 px. |
| 12 | `test-unknown-ids.js` 87 (17 failed before). | Two proofs. M4, M6-M10 and the F3 mutation each fail. | Each unknown entry shows, and its Remove takes exactly that entry. The Ganger removes give the XP back (20, 12, 2). The HTML of the three tabs is the same as at the base for psykers. |
| 13 | `test-unknown-ids.js` 107 (27 new checks failed before). | One proof. Seven mutations each fail. | XP, 13 derived values, keywords and the stored JSON are the same at the base and the task for 15 fixtures. The tabs of six normal characters are the same HTML. |
| 14 | `test-background-bonus.js` 97 (17 failed before; 104 at the head, after `1332f95`). | The first mutation fails 5 checks. Then five mutations, and one for each of the seven types. | Page images Core pp.42-44, 67, 86. 14 tab renders, 12 section switches and the sheet leave the JSON the same. Re-review: 708 states, no render changes the JSON (the base changed it in 144). |
| 15 | `test-sheet-bounds.js` 81 (16 failed before). | One proof. M4b, M8 and "the limit back at 50" each fail. | 24 runs leave the stored JSON and the autosave key as the file has them. Toughness 30000: 100 boxes and "+29902 more" in 15 to 21 ms (the base: 4025 ms). 57 Wounds give 57 boxes. |
| 16 | `test-sheet-bounds.js` 112, `test-unknown-ids.js` 128. | The `unlockedDisciplines` test removed fails two checks. Then nine, three and one mutations fail. | 37 sheet panes byte-equal to the base and 20 screenshot pairs pixel-equal. Re-review 1: 30 of 800 view pairs differed (N1). Re-review 2: 1210 view pairs, no box or line break differs. A 60-character discipline id still overflows at 320 px and 390 px, as before the task. |
| 17 | `test-number-inputs.js` 220. | The first mutation fails 14 checks. Then the three reviewer mutations, "option removed" and two more. | Each stored value outside the range stays through the load, each section, the sheet and the autosave. Tier 5 stores 5, and the header shows "0 / 500 XP". A Human at Tier 5 sees the six Tier 5 archetypes. Each of 20 bad entries is refused. |
| 18 | `test-settings-persist.js` 64 (25 failed before). | Five proofs, then each fix mutation fails its check. | 21 start cases: the task never loses the stored character (the base loses it in three). Ten sequences with a save picker that throws: no Save writes into a refused or declined file. |
| 19 | `test-render-guards.js` 58 (21 failed before). | The first mutation fails 6 checks. The F1-F4 and TC19-2 mutations each fail. | The 11 list threats show each entry (the base: "[object Object]"). The 37 text ranges show the data text (the base: "undefined/undefined/undefined"). A relic with the form `zz`, `''`, `constructor` or a number opens (the base throws at step 5). |
| 20 | `test-creator-late.js` 108, `test-load-check.js` 2795. | Each mutation fails. 470 picks give the same lists as `b15679f`. | Item 1 in 278 scenarios. Item 2: the sheet name equals the tab name in 6994 of 7429 cases (the 435 others have the choice `''`). Item 3: 117 selects in 180 archetypes. Item 5: eight path-only mutants fail. Item 6: no site prints "null" for 782 weapons. |

Gates of the branch at `8dc7c7a`:

- All 32 `scripts/test-*.js` scripts pass (the controller ran them). The writer of this record also ran them at `8dc7c7a`. Each one printed its pass line, and the last line of `test-xp-tip.js` was "All passed".
- `creator/index.html` has 36 tags at `?v=130` and 0 at `?v=129`.
- The data version of `creator/js/web-api.js:22` is 48.

### Visible changes for a user

- One background bonus in place of three. A save with no "USE THIS BONUS" selection loses up to 3 points (for example max wounds 4 to 3, influence 1 to 0, wealth 2 to 1), and a notice shows, until the user selects a bonus (Task 14).
- An old save with renamed talents or powers shows them under their new ids, and the spent XP can be higher after the alias (Task 9).
- Species maximums from Core p.25: Ork Strength and Toughness 10 to 12, Aeldari Strength 8 to 7 (Task 8). A species change clamps attributes to the new maximum (ruling CC2, Task 3).
- A change of species or archetype keeps the stats that the user bought. Before, it reset the full stat block (Task 3).
- The skill XP no longer counts the stored keys `choice`, `choice1` and `choice2` that the old code wrote (Tasks 2 and 9).
- A change of archetype, ascension or ability no longer removes a power that the user bought or picked. A Remove of an ascension releases only what it granted (Task 5).
- A talent choice stays on its item when the wargear list changes (Task 6). Custom Archetype asks a confirm that names the starting wargear that it removes (Task 7). A choice with no item shows "(no item selected)" (Task 7).
- Add Starting Wargear adds only known items, and only once (Task 8).
- The Ascension tab shows the old package list with a Remove control, and each ascension with no slot. An empty slot no longer raises the tier (Task 10).
- The Rank field accepts 1 to 3. A stored 4 or 5 stays until the user edits it. The hint reads "Set your Character's Rank, between 1 and 3." (Task 17).
- The Tier list has a fifth option, "5 - Vow of Absolution (500 XP)", and the Tier 5 archetypes show for the first time (Task 17, ruling TC17-1).
- A number field refuses a bad entry and shows the stored value again (Task 17).
- A new select for the "any skill" bonus of the Inquisitor and the Inquisitorial Acolyte. It is the one new control of the pass (Tasks 4 and 11).
- An entry whose id the data does not have shows as "Unknown ..." with a Remove control, in each tab and on the sheet (Tasks 10, 12, 13, 16). A long unknown id wraps inside its card (Task 16).
- Kroot mutations above the tier show a mark and a Remove control in the Species tab (Task 13).
- A non-psyker sees its stored powers on the sheet (Task 16).
- The books turned off in Settings and Ignore Prerequisites stay through a reload and New Character (Task 18).
- Load asks a confirm after the file pick, and only for a file that holds a character (Task 18).
- The sheet draws at most 100 tracker boxes. A tracker above its maximum shows the maximum (Task 15).
- A follower card shows each Mob Ability of a list (before: "[object Object]"). A text range shows its text (before: "undefined/undefined/undefined"). A relic with an unknown form opens (Task 19).
- The sheet shows a talent name as the Talents tab shows it, and the copy text holds the talent choice (Task 20).
- The sub-faction keyword select keeps the keyboard focus (Task 20).
- The Compendium prints "Skill of your choice +4". A range band with no value prints "-" (Task 20).
- A character that was a Custom Archetype with its own keywords and has a standard archetype now loses those keywords and each effect of them (for example the Psychic Powers rows of a custom `PSYKER` keyword). A kept custom record has no effect while the archetype is not `custom` (ruling CC14, Tasks 3 and 6). The record stays stored, the XP does not change, and the keywords come back when the user selects Custom Archetype again. The final review found that this change was in no list for the user (finding X1); 24 of 300 random characters built at the base differ in this way.
- A save in which two ascension package choices are stored empty showed an effective Tier 3 at the base (Wounds boxes 8, Shock 4). It shows the stored Tier 1 now (Wounds boxes 4, Shock 2). This closes audit finding A13 (Task 10); the final review named it for the user list.
- A range band with no value prints `-` ("6/-/-"; before, "6/null/null") in the Wargear tab, the relic wizard and two more places, for four weapons (Task 20, ruling TC20-6).


### Open decisions of the owner

| Item | Default in place |
|---|---|
| D3: a species change clears the archetype with no confirm. | No change in this pass. |
| D4: `minor_invocation` and `warpspeed` get no alias. | They show as Unknown rows with Remove. |
| D5: `company_standard` (Company Ancient) against `battle_standard`. | No change: it stays text. |
| D6: `smoke_grenades` (Incursor, Bladeguard) against `smoke_grenades_aoa`. | No change. |
| A stored Rank of 4 or 5 (D1 closed as Rank 1 to 3). | It stays until the user edits it, unless the owner says to change it at load. |
| TC5-1: stale free powers of an old archetype. | They become paid at the next change of a source and stay visible with Remove. The XP total can be under 0 until the user removes them. |
| The named limit of TC4-1: after a reload, a change of the "any skill" choice loses ranks that the user bought before the choice. | No stored record. The option of a stored record goes to the owner. |
| TC17-5: the label of the Tier 5 option. | `5 - Vow of Absolution (500 XP)`. |
| The source of the labels of Tier options 1 to 4 ("Defenders of Humanity", "Agents of Fate", "Elite Guardians", "Heroic Champions") is not known. Core p.19 gives no tier names. | No change. |
| The Apocrypha starting wargear prose (548 entries, spec §16). | Parked as a curation job. The click skips them. |
| The late findings below (TC20-0). | No change in this pass. |

### Late findings that are not corrected

Task 20 corrected five items of the list: the sub-option Confirm that deleted an unknown option, the talent name on the sheet, the focus and the label of the sub-faction select, the Compendium text, and the path check of the HOSTILE loop. Task 10 corrected no item of the list. The items below stay.

Rules of the game and book data:

- `getFreePowerChoiceStatus` (`state.js`, near `:1809`) counts a Lost Seer power as an archetype pick, so Wyrd with Psychic Revelations offers 2 Minor picks, not 3 (Task 5 review).
- No creator file reads `species.baseSkills` (17 species have it) (Task 2 review).
- Ghost Warrior and Custodian show an attribute maximum of 16 or 14, but "+" stops at 12 (Task 2 review).
- 2 background bonuses of the type Corruption and 1 of the type "Any Keyword" (`chaos_born_evil`, `chaos_ascension`, `rt_strange_alliance`) have no effect. The book gives them (Core p.86, p.67) (Task 14 review).
- Kroot mutations above the tier still give their bonuses, and the sheet lists them with no mark (Task 13 review).
- `primaris_intercessor` has `page: 90`, and the profile is on Core p.117. Aeldari p.28 lists "Aspect Shrine" for the Striking Scorpion, and the data list does not hold it (Task 8 review).
- The archetype `rogue_psyker_aoa` has the keyword text "PSYKER. You may not select the KHORNE keyword." (Task 12 review).

Stored data:

- `removeCustomStartingWargear` removes the first starting entry with that id, not the entry of the record (`state.js`, near `:543`) (Task 6 review).
- A Remove in the Wargear tab of a custom starting entry leaves the id in `customArchetype.wargear` (Task 6 review).
- Where two starting entries have the same id, `getOldStartingEntries` takes the first ones, also when one has an upgrade or a talent choice (Task 6 review).
- Armour-Monger stays when a relic armour becomes a shield (`state.js`, near `:939`) (Task 6 review).
- A stale index that is out of range points at the next bought item (Task 6 review).
- If only `getItem` of the storage throws, the start is blank and the first edit writes over the stored character (the same at the base) (Task 18 review).
- `state.js` (near `:1324`) rewrites a stored Members below 1 to 1 at any follower edit (a hand-edited file only) (Task 17 review).
- Two ascension entries with the same `targetTier` (a hand-edited file): the second is hidden and costs XP, and Remove takes both but releases only the grants of the first (Task 10 review).
- A known power id that is in `freePowers` only shows in no view, fills a free-pick slot and makes a later purchase free. No code writes that state (Task 12 review).
- The relic wizard drops the `powerChoice` of a known form with an unknown power at Save (a hand-edited file) (Task 19 review).
- A talent choice of `'1abc'` or `1.5` shows as text, but the bonus readers give the bonus to wargear[1] (a hand-edited file) (Task 7 re-review, parked N1).

Display:

- A talent choice `''` (a file only) shows "Hatred ()" in the Talents tab and "Hatred [Any]" on the sheet (Task 20 review, TC20-8).
- After "Other" in the sub-faction keyword select, a later redraw shows "-- Select --" with no custom input. A typed custom keyword stays lowercase in the input until a redraw. Escape does not close the species sub-option window (Task 20 review).
- A typed relic name of 40 characters with no space runs past the card at 320 px and 390 px. At 320 px the relic row buttons and the "Deny the Witch" DN text run past the card (Task 16 re-review).
- A settings change marks the page dirty, so a reload of a blank character still warns. A throw in the start path shows nothing on the page (Task 18 review).
- `setting-tab.js` (near `:42`) shows 1 for a stored Rank 0 or `null` and for a stored Tier 0 (Task 17 review).
- A follower with stored Wounds 9 of 4: a click on the last box stores 4 and does not clear the box. A negative stored Faith shows "-3". A stored Wounds 2.5 fills 3 boxes (Task 15 review).
- A species whose book is off in Settings is fully hidden for a character of that species. The species stays stored (Task 13 review).
- A stored tier of -300000 shows "Tier -299999 Campaign" in the header (Task 10 review).
- The relic wizard keeps an unknown oddity with no control to remove it. Steps 3 and 4 accept an unknown owner or anointment with no card selected. A relic on an unknown base item has no Edit button. A form `constructor` shows "Holy Relic (Object)" (Task 19 review).
- A stored attribute of 13 shows the "-" tip "−NaN XP" (`stats-tab.js:96`) (Task 2 review).
- A text choice that is the name of an item (`'Lasgun'`, the old format) shows "Trademark Weapon (Lasgun)" like a real choice, but no bonus applies (Task 7 re-review).

Test and proof tooling: no item stays. Task 20 item 5 corrected the one item.

**From the final review ("Before the branch")**

- Two open tabs of the creator share one autosave key. The tab whose 2-second timer fires last writes its character over the character of the other tab. The base does the same.


### Not checked

- Firefox and WebKit (each review). Safari, Android and iOS (Task 18). A real phone and phone keypads. macOS select keys. Screen-reader output.
- The Electron wrapper, and its async `showConfirm` (Tasks 7, 10, 18).
- The real `showOpenFilePicker` path of Load. Headless Chromium gives no file-chooser event for it, so the reviews used the `<input type=file>` fallback or the autosave restore (Tasks 7, 8, 10, 15, 18).
- Real user save files and how many exist (Tasks 2, 14). Saves built by the old web State (`3b17bac` to `9864ec6`) (Task 9). Files and data history of the older single-app repos (Tasks 14, 20).
- A real HTTP-cached old page. The P6 claim that a confirm before the picker uses up the user activation was not measured again (Task 18).
- The content of the file after Save. Task 17 checked only the stored state.
- The species maximums of the books other than Core p.25, an erratum of Core p.25, and 13 unresolved ids against the books (Task 8, spec §17).
- Some UI paths ran through the State setters, not through clicks: the Powers tab picks (Task 10), the relic wizard, the talent choice modal and the Upgrades modal (Task 6), the Ascension tab clicks (Task 16), the cards of Task 5.
- The Improvised builder in the page, and the custom wargear form ranges (Task 19).
- Keyboard access to the new buttons (Task 10) and to the × spans (Task 12). The style of the bonus notice (Task 14). The contrast of the "+N more" text and the low-height layout (Task 15).
- An unknown species or archetype id (Tasks 13, 16). Names longer than the longest real name of each kind (Task 16).
- A talent that grants a power (the data has none) and the Tormented Manifestation discount (Task 5). "Any skill" keys with different values (the data has none) (Task 11).
- The box bound and its timing on a phone (spec §17).
- The bestiary (out of scope of this branch).

### Wave table

| Task | Model | Dispatches | Send-backs | Gate | Commits |
|---|---|---|---|---|---|
| Audits (3) | opus (general-purpose) | 1 each | 0 | Read-only: A1-A24, B1-B11 (creator), C1-C11 (bestiary) | none |
| Spec and plan | opus (general-purpose) | 1 | 2 (+1 read-only book search) | Approved after 2 send-backs. Review: 2 Critical, 6 Important, 12 Minor. Re-review: 2 Important, 5 Minor. All closed. | `7e2f18d`, `44da12d`, `3887009` |
| Task 1 Cache bump | the controller (a trivial edit; no agent) | 0 | 0 | No separate review (ruling); the tag count was checked | `7d126c1` |
| Task 2 Known stat names, one baseline | sonnet | 1 | 1 | APPROVED | `9b9f463`, `6513ace` |
| Task 3 A parent change keeps bought values | opus | 1 | 1 | APPROVED | `762cae2`, `bc9e5c3` |
| Task 4 The "any skill" field and setter | sonnet | 1 | 3 | APPROVED | `b406b56`, `e916e0c`, `9794096`, `06409af` |
| Task 5 Reference-aware grants | opus | 1 | 1 | APPROVED | `a600b90`, `b00b793` |
| Task 6 Wargear index references in State | opus | 1 | 1 | APPROVED | `cf75b6c`, `e976ca8` |
| Task 7 Wargear references in the UI | sonnet | 1 | 2 | APPROVED | `efb3123`, `62dd58a`, `b99aac1` |
| Task 8 Add Starting Wargear; data | sonnet | 1 | 1 | APPROVED | `ced7ac3`, `c5d5029` |
| Task 9 The load steps | opus | 1 | 1 | APPROVED | `3d38086`, `48cb88d` |
| Task 10 The Ascension tab | sonnet | 1 | 1 | APPROVED (spec F1 and F2 closed by the fix round, no separate re-review, TC10-2) | `1635129`, `99035be` |
| Task 11 The "any skill" choice in the UI | sonnet | 1 | 3 | APPROVED | `2d182cd`, `a6c857d`, `5c79c87`, `1466624` |
| Task 12 Unknown ids: Wargear, Talents, Powers | sonnet | 1 | 1 | APPROVED | `dc72669`, `d76e169` |
| Task 13 Unknown ids: Injuries, Background, Species | sonnet | 1 | 1 | APPROVED | `6d44407`, `ccb163d` |
| Task 14 One background bonus | sonnet | 1 | 2 | APPROVED | `c80e877`, `2e81b22`, `0c35bb3` |
| Task 15 Tracker getters and the box bound | sonnet | 1 | 1 | APPROVED | `abc2f43`, `a4cf145` |
| Task 16 The sheet: unknown rows and stored powers | sonnet | 1 | 3 | APPROVED | `e3eeadc`, `904e318`, `1332f95`, `f6ab494` |
| Task 17 Number inputs; Rank 1 to 3 | sonnet | 1 | 2 | APPROVED | `b844c53`, `9d51628`, `8e93e39` |
| Task 18 Settings storage and the Load confirm | opus | 1 | 2 | APPROVED | `eca067f`, `f590847`, `c07d0e9` |
| Task 19 Render guards | sonnet | 1 | 1 | APPROVED | `bd5fe77`, `474f022` |
| Task 20 Late findings | sonnet | 1 | 2 (fix round 1 was a controller correction, fix round 2 a review finding) | APPROVED | `bfb3e58`, `b15679f`, `8dc7c7a` |
| Plan and task reviews | opus, xhigh | 20 (1 plan, 19 tasks) | 0 | 17 scoped re-reviews through the same reviewers: plan 1, Tasks 2, 3, 5, 6, 7, 12, 14 and 17 one each, Tasks 4, 11, 16 and 18 two each | none |
| Wave record draft | opus (`ste-writer`) | 1 | 0 | The controller added the final review part and corrected two rows | none |
| Final review of the branch | fable, effort xhigh (`general-purpose`) | 1 (resumed three times after HTTP 529) | 1 fix dispatch (X2, X3) to the Task 16 implementer | READY TO MERGE; X1 to X4 closed | `e04ba3c`, `e86dbf4` |

### Final review

The final review of the full branch ran on a `general-purpose` agent with the model `fable` at effort `xhigh`, on the range `44084ae..8dc7c7a`. The run stopped three times with a server error (HTTP 529). The controller resumed it each time, and the agent kept its context and its result files.

**Result: ready to merge.** No Critical finding, and no code defect above Minor.

| Finding | Severity | What | Correction |
|---|---|---|---|
| X1 | Important, doc | A character built at the base as Custom Archetype with keywords and then changed to a standard archetype loses those keywords at the head (ruling CC14). The change was in no list for the user. The same is true for audit finding A13 (two empty package radios: Tier 3 to Tier 1). | Spec section 5.3 (commit `e04ba3c`), the part "Visible changes for a user" of this record, and the report to the owner. No code change: the result is the rule of CC14. |
| X2 | Minor, code | The old-package notice printed an id that the data does not have with no wrap class. At 390 px, a 66-character id was cut at the edge of the notice. | Commit `e86dbf4`: the id goes into a span with the class `unknown-entry-text`. |
| X3 | Minor, test | No check rendered the sheet power pane of a psyker for the unknown mark. | Commit `e86dbf4`: one check with `sanctioned_psyker`. |
| X4 | Minor, doc | Three stale spec texts (the 50-box bound, the typed `1e5`, the count of threats with a list). | Commit `e04ba3c`. |

Controller ruling: commit `e86dbf4` had no separate re-review. The two findings are Minor, the correction is one product line, the implementer showed that each new check fails for its mutation, and the controller read the line and ran all 32 scripts.

Evidence of the review (the files are in the session scratch folder and are not in the repo):

- **Characters built at the base:** 281 characters built through the real page at `44084ae` and opened at the head through the autosave and through the Load button. The only differences are the named load step X1. No render writes.
- **Old save shapes:** 400 characters built with the old State setters and old data (Electron 1.0.0 and the web commits `3b17bac`, `c744cd0`, `c29e9cd`, `f23afe8`). The differences are only the load steps X1 (205 characters) and X2 (68) and the kept `ascensionPackages` (160). A second load changes nothing.
- **Walks at the head:** 551 walks with about 28,500 actions. Each action can change only the fields that it names. 0 violations. A mutated copy proved the model: 3 of 5 seeded defects were hit and reported.
- **Numbers:** 300 characters built at the base, about 60 numbers each. With the named causes removed, the only differences are the X1 keywords.
- **HTML:** 14 characters, 12 sections with the header, the sidebar and the sheet panes. 241 views are byte-equal. 64 differ, each by a named change.
- **Mutations:** 55 product-line mutants. 53 fail a check, 1 is equivalent, 1 is X3.
- **Audit findings:** A1 to A18, A20 and B1 to B11 are closed in a real page. A19 is parked (spec section 16).
- **Old and new code in turn:** no character is lost. The base page keeps `archetypeSkillChoices` and `granted`, deletes `ascensionPackages` as before, and shows a blank Tier select for Tier 5.
- **Deploy checks:** 36 tags at `?v=130`; the data version is 48; the data diff is six values; nothing changed under `bestiary/`, `shared/`, `feedback-worker/` or `.github/`. 32 of 32 scripts pass, and 38 of 38 pass in the merged tree of both branches. `git merge-tree` shows no conflict with `bug-pass-bestiary`.

Not checked by the final review: the real file pickers of the operating system (the harness used the file input path); Firefox, WebKit and a real phone; the sourcebook pages; the Electron wrapper; hand-edited hostile files beyond `scripts/test-load-check.js`.

Branch head after the final corrections: `e86dbf4` and this record. All 32 `scripts/test-*.js` pass there (the controller ran them).
