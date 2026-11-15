# Type check on a loaded character (creator) — Design

Date: 2026-11-15. Branch: `character-load-check`. Base: `f6a3be0` (`main`).
Status: spec for review. Line references are to the tree at `f6a3be0`.

Marks used below:

- **[Owner, 2026-11-15]** is the owner's word.
- **[Controller ruling, 2026-11-15]** is a binding ruling of the controller (R1-R10).
- **[Design agent]** is a decision of the agent that wrote this spec. Each one gives the cost if it is wrong.

## 1. Intent

Owner's words **[Owner, 2026-11-15]**: "Let's go ahead and implement the type check."

The creator loads a character object from two places. Both call `State.loadCharacter(data)`:

- a `.character` file that the user imports (`creator/js/character-io.js:48-70`, through `window.api.importCharacter` in `creator/js/web-api.js:162-175`);
- the autosave in `localStorage` (`creator/js/app.js:475-493`).

`State.loadCharacter` (`creator/js/state.js:139-180`) does a shallow merge `{ ...createNewCharacter(), ...data }`. Then it does two migrations and the custom wargear repair. It does not look at the type of a value. Thus a file from another person can put a string with HTML in a field that the code uses as a number, an enum or an id. Some render sites print such a field with no escape. The record of the last wave calls a type check in `State.loadCharacter` "the durable fix" (`docs/superpowers/plans/2026-11-14-sheet-tabs.md:658-659`).

A wrong type also breaks the app with no hostile intent. For example, `name: {}` makes `character.name.trim()` throw in `CharacterIO.save` (`character-io.js:21`, outside the `try`). The autosave can then keep a character that breaks each start of the app.

"Before" evidence. The script `probe-targettier.js` (scratch folder of the design session) loads the real `state.js` and `character-sheet-tab.js` in a Node `vm`. It gives `State.loadCharacter` this file:

```json
{ "name": "x", "ascensions": [{ "targetTier": "<img src=x onerror=alert(1)>", "type": "package", "packageId": "back_from_the_brink", "archetypeId": null }] }
```

Then it calls `CharacterSheetTab.renderAscensions(State.character)`. The result holds the raw `<img src=x onerror=alert(1)>` (`character-sheet-tab.js:1625`). In the browser, this runs script.

## 2. Goals and non-goals

### 2.1 Goals

1. After this change, a character that `State.loadCharacter` accepts has, for each known field, a value of the type that the code expects (§5, §6).
2. A hostile `.character` file cannot run script in the creator. Each sink of §8 is safe.
3. A file with a wrong type cannot make the app throw at load or at the render of a tab.
4. A character that some version of the app wrote loads with no change (R1).

### 2.2 Non-goals

- No new UI. No dialog and no toast for a repair (R7).
- No change to a stored shape. No new migration (R8).
- The bestiary app is out of scope (R8).
- No range limit on a number, and no new limit for a long render loop (R5, §9).
- No id pattern check (§8.3).
- `CharacterIO.validateCharacterData` (`character-io.js:144-182`) has no caller. It is dead code. This change does not use, change or delete it (R8). `getCharacterSummary` (`:128`) and `createCharacterSheet` (`:185`) have no caller too.

## 3. Rulings

Each ruling is binding. **[Controller ruling, 2026-11-15]** applies to R1-R10.

- **R1. No harm to a real save.** The check never changes a value that some version of this app can have written. This rule has the highest priority. The owner asks for caution with saved-character data, and a lost character has no recovery. Each field has evidence (§5, §6). Where a constraint is not proven safe, the check enforces the type only.
- **R2. Repair, do not reject.** A value of the wrong type gets a safe value, and the file still loads. For a top-level scalar, the safe value is the default of `createNewCharacter()`. For an entry of a list, the check repairs in place where possible. It drops an entry only from a list that no other part of the character references by index. The wargear list is index-referenced by talent choices (`state.js:165`). One exception: a top-level value that is not a plain object has nothing to repair (§7.2).
- **R3. One place.** The check runs inside `State.loadCharacter`, through a module that it calls. Thus both load paths get it. The existing migrations and the custom wargear repair stay. §7.1 gives the order of the steps.
- **R4. Sinks decide the constraints.** §8 is the inventory of each site in `creator/` that puts a value of the loaded character into HTML. Each site is in one class: (a) already escaped; (b) safe after the check, because the field is then a finite number, a boolean or a member of an enum; (c) an id that reaches the page raw; (d) free text that reaches the page raw. Class (d) gets `escapeHtml` at the site. Class (c) gets an escape at the site, or a constraint at load that every real id passes. In this codebase `escapeHtml(0)` returns `''`, so a number site uses `escapeHtml(String(v))`.
- **R5. Number limits.** The check enforces "finite number", and "integer" where the app writes only integers. A range limit is added only where the app's setters or UI enforce the same limit for all users, also with the house rule `ignorePrerequisites` on. §9 names each number field that can make a render loop very long.
- **R6. Unknown keys stay.** A key that the check does not know stays as it is, at the top level and inside entries (§10).
- **R7. No new UI.** A repair writes one `console.warn` that names the repaired paths, as the custom wargear repair does today (`state.js:173`).
- **R8. Scope.** The creator only. `CharacterIO.validateCharacterData` is dead code: do not use, change or delete it. No cleanup of adjacent code. No change to a stored shape. No new migration.
- **R9. Honest claim.** §8.1 states which files the inventory covered and how. §12 states what is not covered.
- **R10. Unknown keys in `attributes` and `skills`.** Inside `attributes` and `skills`, the key of an unknown entry stays (R6). Its value must be a finite number or `null`. Another value becomes `null`, and the path goes into the repaired list. Why: code reads these two maps through a key that comes from the data (`character.skills[key]`, `ascension-tab.js:479-483`), and the first inventory missed one such read. This rule closes that class at the load. R1 evidence: each writer of the two maps writes a `Math.max` result or a count (`state.js:236`, `:348`, `:355`, `:580`-`:658`), so a real save holds a number, or `null` from `NaN`. Cost if wrong: an unknown key with another value in a real save becomes `null`. No writer makes such a value. The known keys keep their rule (integer, else the default). **[Controller ruling, 2026-11-15]**

## 4. Design summary

- A new file `creator/js/character-check.js` holds one global object, `CharacterCheck`. Its method `repair(character, defaults)` changes the character in place and returns the list of repaired paths. **[Design agent]** A separate file keeps the field rules in one place, and a Node test can load it alone. Cost if wrong: one more script tag.
- `State.loadCharacter` calls `CharacterCheck.repair` directly after the merge, before the existing steps (§7.1).
- Escapes go into 20 render sites (S1-S20) in 9 files (§8.4).
- `State.loadCharacter` throws an `Error` for a top level that is not a plain object. The import path shows the existing error message. The autosave path keeps the blank character (§7.2).

### 4.1 Rules that apply to each field

These rules apply to each row of §5 and §6.

1. **Plain object.** "Plain object" means `value !== null && typeof value === 'object' && !Array.isArray(value)`.
2. **Present with a wrong type.** The check replaces the value with the repair value of its row. It adds the path to the repaired list.
3. **Absent optional key.** An optional key that is absent stays absent. Each optional key has the word "optional" in its row. The app wrote shapes without these keys (for example a follower before `cb56749` has no `mobCount`, and a background entry from before the web app has no `bonusType`).
4. **Absent key with a default.** A key that `createNewCharacter()` holds inside `species`, `archetype`, `customArchetype`, `attributes`, `skills` or `background` gets its default when it is absent. The path goes into the repaired list. No app version from Electron 1.0.0 on wrote these objects without these keys: the 1.0.0 build and the initial web commit `3b17bac` have the same keys in `createNewCharacter()`. The period before 1.0.0 is not proven. There, the cost is one default key and one warning (the 1.0.0 `loadCharacter` already fills a missing `subOptions`, which hints at an older shape).
5. **Absent key that is not optional, inside a list entry or an overlay.** Inside a list entry, a `relic` or an `improvised` overlay, an absent key that its row does not mark "optional" gets the repair value of its row. The path goes into the repaired list. Where the repair of the key is "drop the entry", an absent key drops the entry. Why: the goal includes "no throw at render", and an absent `relic.oddities` is the same risk as a wrong type. R1: no real save without these keys was found (`followers.js` at `cac2cb3` and `cb56749`; `state.js:999`, `:1024`, `:1055` since `214c3e8`; the 1.0.0 build). The cost for a save from before 1.0.0 is a default key and one warning. **[Controller ruling, 2026-11-15]** (C8)
6. **Defaults.** The check takes each default from a fresh `createNewCharacter()` object (`defaults` argument). The check uses one default value at most one time, so no two fields share one array or object.
7. **Strings.** The check never trims, cuts or changes a string. A string of any content is a legal string.
8. **Numbers.** "Finite number" means `typeof v === 'number' && Number.isFinite(v)`. "Integer" means `Number.isInteger(v)`. JSON cannot carry `NaN`. JSON text `1e999` parses to `Infinity`, which fails "finite". A numeric string such as `"3"` is a wrong type: the check does not convert it (R2: the safe value is the default).
9. **Unknown keys.** The check does not read, change or delete an unknown key (R6). One exception: the value of an unknown key inside `attributes` or `skills` must be a finite number or `null` (R10).

## 5. Field table

"Legal shapes" lists each value that some app version writes, with the evidence. "Repair" is the value for a present value of the wrong type.

History that the evidence covers: the monorepo `git log` from `74924bb` (2026-06-13), the old repo `/root/projects/wrath-and-glory/wrath-and-glory-creator-web` from `3b17bac` (2026-02-13), and the Electron build "Wrath and Glory Character Creator 1.0.0" (2026-01-28). That build is on the owner's machine (`/mnt/c/Users/QuadraKev/OneDrive/Wrath and Glory Character Creator 1.0.0.exe`). The review of round 1 extracted its `app.asar` source into the scratch folder; none of it is in the repo. Its writers match `3b17bac` for each row of §5 and §6. The app before 1.0.0 is not in any history. For that period, the evidence is the readers that accept two shapes, and the repairs that the code does at render (§12).

### 5.1 Top-level scalars

| # | Path | Expected type | Legal shapes and evidence | Repair |
|---|---|---|---|---|
| 1 | `name` | string | Text input value: `setName` (`state.js:188-190`), `setting-tab.js:7`. Default `''`. | `''` |
| 2 | `setting` | string | Text input: `setSetting` (`state.js:218-220`), `setting-tab.js:27`. | `''` |
| 3 | `notes` | string | Textarea: `setNotes` (`state.js:989-991`), `notes-tab.js:7`, sheet notes box. | `''` |
| 4 | `tier` | integer | `parseInt(tier) \|\| 1` (`state.js:196`). The select has 1-4 (`index.html:195-200`, same in `3b17bac`). `WARGEAR_BUDGET` and `TIER_STARTING_XP` know 5. No range: the Electron period is not proven. | `1` |
| 5 | `rank` | integer or `null` | `parseInt(rank) \|\| 1` (`state.js:207`). The input `min 1 max 5` is not enforced on typed text, so a negative integer is legal. A typed number of 309 digits gives `parseInt(...) = Infinity`, which JSON saves as `null`. A `null` stays (R1). Each reader uses `rank \|\| 1` or `Number(rank) \|\| 1`. | `1` |
| 6 | `additionalXp` | integer or `null` | `parseInt(xp) \|\| 0` (`state.js:213`). A negative integer is legal. `null` as for row 5. It reaches the page only through `textContent` (`app.js:363-376`). | `0` |
| 7 | `corruption` | integer or `null` | `Math.max(0, parseInt(value) \|\| 0)` (`state.js:1048`). Integer ≥ 0, but no range is added (R5: not needed by a sink). `null` as for row 5. Each reader uses `corruption \|\| 0` (`derived-stats.js:457`, `injuries-tab.js:129`, `character-sheet-tab.js:1781`). | `0` |
| 8 | `currentWounds` | finite number or `null` | `setCurrentWounds` (`state.js:1133-1140`): `Math.max(0, Math.min(value, max))`, `null` for 0. `NaN` and `Infinity` save as `null`. Not proven integer: `max` is a derived number. | `null` |
| 9 | `currentShock` | finite number or `null` | `setCurrentShock` (`state.js:1154-1161`), same form. | `null` |
| 10 | `currentWealth` | finite number or `null` | `setCurrentWealth` (`state.js:1179-1187`): `null` at base, else `Math.max(0, value)`. | `null` |
| 11 | `currentWrath` | finite number or `null` | `setCurrentWrath` (`state.js:1229-1237`): `null` at 2, else `Math.max(0, value)`. | `null` |
| 12 | `currentFaith` | finite number or `null` | `setCurrentFaith` (`state.js:1255-1264`): `null` at max. | `null` |

### 5.2 Objects and their keys

| # | Path | Expected type | Legal shapes and evidence | Repair |
|---|---|---|---|---|
| 13 | `species` | plain object | `setSpecies` (`state.js:227-246`) writes `{ id, xpCost, subOptions }`. | default `{ id: null, xpCost: 0, subOptions: [] }` |
| 14 | `species.id` | string or `null` | Data id or `null` (`state.js:228`, `:245`). | `null` |
| 15 | `species.xpCost` | finite number | `species.cost \|\| 0`. All 24 species costs are integers. No reader uses it for XP. | `0` |
| 16 | `archetype` | plain object | `{ id, xpCost }` (`state.js:337-340`, `:388`, `:414`). | default `{ id: null, xpCost: 0 }` |
| 17 | `archetype.id` | string or `null` | Data id, `'custom'` or `null`. | `null` |
| 18 | `archetype.xpCost` | finite number | `archetype.cost \|\| 0`, `0` for custom. | `0` |
| 19 | `customArchetype` | plain object | `{ name, abilityArchetypeId, keywords, wargear }` (`state.js:389`, `:415`). | default `{ name: '', abilityArchetypeId: null, keywords: [], wargear: [] }` |
| 20 | `customArchetype.name` | string | Text input (`state.js:447-449`). | `''` |
| 21 | `customArchetype.abilityArchetypeId` | string or `null` | `archetypeId \|\| null` (`state.js:454`). | `null` |
| 22 | `archetypeKeywordChoices` | optional plain object, each value a string | Not in `createNewCharacter()`. `{}` from `setArchetype` (`state.js:343`). Values: `''`, a data option value, or typed text in upper case (`archetype-tab.js:321-338`). | not a plain object: `{}`. A value that is not a string: `''`. |
| 23 | `attributes` | plain object | Seven keys, each written by `state.js` setters only (`:236`, `:348`, `:580`, `:604`, `:628`) from integers. All data base values and bonuses are integers. | default object |
| 24 | `attributes.<strength … fellowship>` (7 keys) | integer | As row 23. No range: `increaseAttribute` caps at the species maximum or 8, but `setSpecies`/`setArchetype` use `Math.max` with data values. | `1` |
| 24a | `attributes.<unknown key>` | optional; finite number or `null` (R10) | No writer makes an unknown attribute key from the data today; R10 applies the same rule as row 26a. | `null` |
| 25 | `skills` | plain object | Eighteen keys, `state.js` setters only (`:355`, `:589`, `:643`, `:658`). | default object |
| 26 | `skills.<athletics … weaponSkill>` (18 keys) | integer | As row 25. | `0` |
| 26a | `skills.<unknown key>` | optional; finite number or `null` (R10) | Real saves hold `choice`, `choice1` and `choice2` with `null`. `setArchetype` writes `Math.max(undefined, 2)`, which is `NaN`, for the data keys of `skillBonus` (`state.js:355`; for example `inquisitorial_acolyte` has `choice`, `inquisitor` has `choice1` and `choice2`). JSON saves `NaN` as `null`. The Electron 1.0.0 data has the same keys. `resetStats` (`state.js:584-589`) can then write a number into such a key. | `null` |
| 27 | `background` | plain object | `{ origin, accomplishment, goal, bonusUsed }`. | default object |
| 28 | `background.origin`, `.accomplishment`, `.goal` | `null` or plain object | `{ id, bonusType }` or `null` (`state.js:945`). A pre-web save has `{ id }` with no `bonusType`: `repairMissingBonusTypes` exists since `3b17bac` (`background-tab.js:251-276`). | not `null` and not a plain object, or an `id` that is not a string: `null` |
| 29 | `background.<entry>.bonusType` | optional; string or `null` | Data `bonusType \|\| null` (all strings), or written at render by `repairMissingBonusTypes`. | `null` |
| 30 | `background.bonusUsed` | string or `null` | `'origin'`, `'accomplishment'`, `'goal'` from `btn.dataset.type` (`background-tab.js:156`), or `null`. No enum: no sink needs one. | `null` |

The list fields (`species.subOptions`, `customArchetype.keywords`, `customArchetype.wargear`, `ascensions`, `talents`, `wargear`, `psychicPowers`, `freePowers`, `unlockedDisciplines`, `memorableInjuries`, `traumaticInjuries`, `mutations`, `followers`, `languages`, `freeLanguages`, `customKeywords`) are in §6.

## 6. Lists

### 6.1 List table

"Index-referenced" means that another part of the character stores an index into the list. Only `wargear` is index-referenced: a talent choice of type `weapon_owned` or `armor_owned` stores a wargear index (`state.js:165`, `:417-440`). No other stored value is an index. The other remove setters use a runtime index only, from the rendered list.

| # | Path | Index-referenced | Expected type (list) | Repair (list not an array) | Entry shape | Bad entry |
|---|---|---|---|---|---|---|
| 31 | `species.subOptions` | no | array | `[]` | `{ type: string, optionId: string }` (`state.js:270`, `:276`, `:278`). All data option ids and types are strings. | drop |
| 32 | `customArchetype.keywords` | no | array | `[]` | string (`state.js:484-486`) | drop |
| 33 | `customArchetype.wargear` | no | array | `[]` | string, a data item id (`state.js:543`) | drop |
| 34 | `ascensions` | no (keyed by `targetTier`) | array | `[]` | §6.2 | drop if not a plain object or if `targetTier` is not an integer; else repair keys |
| 35 | `talents` | no | array | `[]` | string id; or `{ id, choice }`; or `{ id, ascensionGranted: true }` (§6.3) | drop if not a string and not a plain object with a string `id`; else repair keys |
| 36 | `wargear` | **yes** | array | `[]` | §6.4 | never drop; replace in place (§6.4) |
| 37 | `psychicPowers` | no | array | `[]` | string, a data power id | drop |
| 38 | `freePowers` | no | array | `[]` | string | drop |
| 39 | `unlockedDisciplines` | no | array | `[]` | string, a discipline name (`powers-tab.js:224`, `state.js:1363-1366`) | drop |
| 40 | `memorableInjuries` | no | array | `[]` | `{ id: string, escalated: boolean }` (`state.js:999`, `:1016`) | drop if not a plain object with a string `id`; `escalated` not a boolean: `false` |
| 41 | `traumaticInjuries` | no | array | `[]` | `{ id: string, side: string \| null, reconstructed: optional boolean }` (`state.js:1024`, `:1041`). The UI writes `'Left'`, `'Right'` or `null` (`injuries-tab.js:115-119`, `:307`). | drop if not a plain object with a string `id`; `side` not a string and not `null`, or absent: `null`; `reconstructed` present and not a boolean: `false` |
| 42 | `mutations` | no | array | `[]` | `{ id: string, subChoice: string \| null }` (`state.js:1055`) | drop if not a plain object with a string `id`; `subChoice` not a string and not `null`: `null` |
| 43 | `followers` | no (keyed by `id`) | array | `[]` | §6.5 | drop if not a plain object or if `id` is not a string; else repair keys |
| 44 | `languages` | no | array | `['low_gothic']` (default) | string. `'low_gothic'` or free text that the user types (`background-tab.js:30-35`). | drop |
| 45 | `freeLanguages` | no | array | `[]` | string | drop |
| 46 | `customKeywords` | no | optional array | `[]` | string. No setter in either history writes it. `PrerequisiteChecker.getCharacterKeywords` reads it since `3b17bac` (`prerequisite.js:220-221`), so a pre-web save can hold it. | drop |

**[Design agent]** A list of strings drops each entry that is not a string. A string entry is never dropped. Cost if wrong: none for a real save, because each list of strings above holds only strings from a setter or from data.

### 6.2 Ascension entry (`ascensions[i]`)

| Key | Expected type | Legal shapes and evidence | Repair |
|---|---|---|---|
| `targetTier` | integer | `parseInt(dataset.targetTier)` (`ascension-tab.js:512`, `:567`); the legacy migration writes `startingTier + index + 1`. | not an integer: drop the entry |
| `type` | string | `'package'` or `'archetype'` (`ascension-tab.js:516-553`). No enum: no sink prints it. | `''` |
| `packageId` | string or `null` | `data.packageId \|\| null` (`state.js:1297`). | `null` |
| `archetypeId` | string or `null` | `data.archetypeId \|\| null` (`state.js:1298`). | `null` |
| `choices` | optional plain object, each value a string | Keys: `pkg.choiceType`, a placeholder such as `[ANY]`, or `[ANY]2` and up. Values: a data option value, `''`, or typed text in upper case (`ascension-tab.js:567-625`). | not a plain object: delete the key (an absent `choices` is the app's own shape, `state.js:1301`). A value that is not a string: `''`. |

**[Design agent]** An ascension entry with a `targetTier` that is not an integer is dropped. The `targetTier` is the key of the entry (`state.js:1285`, `:1425`), so no repair in place has a meaning. Cost if wrong: a hand-edited file loses one ascension. No app version writes a non-integer `targetTier`.

### 6.3 Talent entry (`talents[i]`)

| Key | Expected type | Legal shapes and evidence | Repair |
|---|---|---|---|
| (entry) | string, or plain object | String id (`state.js:686`), or object (`:684`, `:1329`). Two-shape readers: `state.js:673`, `:698`, `:721`, `:1211`, `prerequisite.js:62-64`. | §6.1 row 35 |
| `id` | string | Data talent id. | not a string: drop the entry |
| `choice` | optional; string, finite number or `null` | The talents tab writes a string (`talents-tab.js:254-279`: `dataset.value`, `textContent` or typed text). `setCustomArchetype` keeps a number choice as a number and writes `null` (`state.js:433-438`). No writer that stores a number was found (Electron 1.0.0 `talents-tab.js:239` and each web version store `dataset.value`, a string). The number type is kept for safety. | `null` (the value that `state.js:436` writes for "pick again") |
| `choice` of `warped_mind` or `tormented_manifestation_aoa` | optional; string or `null` | The choice is a discipline name. `getUnlockedDisciplines` pushes it (`state.js:1636-1641`), and `powers-tab.js:19` calls `d.toLowerCase()` on it. | `null` |
| `ascensionGranted` | optional boolean | `true` only (`state.js:1329`). | `false` |

**[Design agent]** The two discipline talents get a stricter `choice` type than other talents. The check uses the same id list as `state.js:1636`. It uses no data file, so it works before the data loads. Cost if wrong: none for a real save, because these choices come from a list of discipline names.

### 6.4 Wargear entry (`wargear[i]`, index-referenced)

The list is index-referenced, so the check never drops an entry and never changes the order.

| Key | Expected type | Legal shapes and evidence | Repair |
|---|---|---|---|
| (entry) | plain object | Every writer writes an object: `addWargear` (`state.js:765`), `addCustomStartingWargear` (`:545`), `addRelicWargear` (`:793`), `addImprovisedWargear` (`:811`), `addCustomItem` (`:831`), and the old archetype starting wargear in `3b17bac` (`{ id, isStarting: true }`). | a string: `{ id: <the string>, isStarting: false }`. Another value: `{ id: '', isStarting: false }`. An empty id finds no item, so the Wargear tab skips the entry (`wargear-tab.js:74-75`). |
| `id` | string | Data item id, or `custom_` + 8 of `[a-z0-9]`. | `''`. For a custom entry, the existing repair then gives a new `custom_` id (`custom-wargear.js:775-777`). |
| `isStarting` | optional boolean | `isStarting = false` default parameter, or `true` (`state.js:545`, `wargear-tab.js:441-465`). | `false` |
| `equipped` | optional boolean | `!item.equipped` (`state.js:859`). | `false` |
| `upgrades` | optional array of strings | Data upgrade ids (`state.js:902-911`), `[]` on a base change (`:803`, `:821`, `:845`). | not an array: `[]`. Drop each entry that is not a string. |
| `relic` | optional plain object | `relic-wizard.js:650-663`, one shape since `f3af40d`. | not a plain object: delete the key |
| `relic.name` | string | Trimmed text, not empty at save. | `''` |
| `relic.form`, `.originalOwner`, `.anointment`, `.power` | string or `null` | Data ids, not `null` at save. The wizard state uses `null` for "not chosen". | `null` |
| `relic.oddities` | array of strings | Data ids, can be empty. | not an array: `[]`. Drop each entry that is not a string. |
| `relic.powerChoice` | optional string | A keyword, an attribute or skill name, or a condition name. | delete the key |
| `improvised` | optional plain object | `improvised-builder.js:263-273`, one shape since `d981a94`. | not a plain object: delete the key |
| `improvised.name`, `.details` | string | Trimmed text. | `''` |
| `improvised.halfTime` | integer | Integer ≥ 0 from the + and − buttons (`improvised-builder.js:228-232`), no upper limit. | `0` |
| `improvised.damageRank`, `.removeUnwieldy`, `.doubleRange` | boolean | Booleans (`:263-273`). | `false` |
| `improvised.traits` | array of strings | A subset of the `TRAITS` constant. | not an array: `[]`. Drop each entry that is not a string. |
| `custom` | (not typed by this check) | The existing `CustomWargear.normalizeEntry` repair owns the custom record (`custom-wargear.js:766-788`). It runs after this check (§7.1). | — |

**[Design agent]** A wargear entry that is not an object becomes a placeholder entry with an empty id, in place. Today such an entry makes the Wargear tab throw (`wargear-tab.js:74`). The placeholder keeps each talent index correct, and no tab shows it. Cost if wrong: an invisible entry stays in the list until the next export. It counts in the `wargear.length` text of the tab badge.

### 6.5 Follower entry (`followers[i]`)

| Key | Expected type | Legal shapes and evidence | Repair |
|---|---|---|---|
| `id` | string | `'flw_' + base36` (`followers.js:35`). | not a string: drop the entry |
| `threatId` | string | Data threat id (`followers-tab.js:100`, `:200`). | `''` |
| `name`, `notes` | string | Text input and textarea. | `''` |
| `kind` | string | `'individual'` or `'mob'` (radio values, `followers-tab.js:75-76`). No enum: no sink prints it. | `'individual'` |
| `count`, `livingCount` | finite number or `null` | `Number(input.value)` of a number input with no step check (`followers-tab.js:221`), so `2.5` is legal. A typed `1e309` gives `Infinity`, which saves as `null`. `updateFollower` (`state.js:1118-1119`). | `1` (the value of `Followers.create`) |
| `mobCount`, `mobLivingCount` | optional; finite number or `null` | `null` at create, or copies of the counts (`state.js:1105-1106`). Absent before `cb56749`. | `null` |
| `useAlternativeStats` | boolean | Checkbox `checked`. | `false` |
| `currentWounds`, `currentShock` | finite number or `null` | `null` at create; `index + 1` or `index` from a box click (`character-sheet-tab.js:197-203`). | `null` |

## 7. Load flow

### 7.1 Order of the steps in `State.loadCharacter(data)`

1. **New: the gate.** If `data` is not a plain object, throw `new Error('The file does not contain a character.')`. `State.character` does not change.
2. Merge: `this.character = { ...newChar, ...data }` (existing, `state.js:140-141`).
3. **New: the type check.** `const repaired = CharacterCheck.repair(this.character, this.createNewCharacter())`. If `repaired.length > 0`, write one `console.warn('Character data was repaired on load: ' + repaired.join(', '))`.
4. The `species.subOptions` initialization (existing, `:143-146`). After step 3 it never changes anything. It stays (R3).
5. The `ascensionPackages` migration (existing, `:148-157`). It stays (R3).
6. The delete of `ascensionPackages` (existing, `:158-160`).
7. The `ascensions` default (existing, `:161-163`).
8. The custom wargear repair (existing, `:165-176`). It writes its own warning per entry.
9. `notifyListeners('load')` and `isDirty = false` (existing).

**[Design agent]** The type check runs before the migrations, not after. The migration at step 5 calls `.map` on `ascensionPackages` when `ascensions` is falsy, so a hostile file can make it throw before a later check. Cost if wrong: see the next paragraph.

The legacy migration has been dead since it was added. `ascensions: []` came into `createNewCharacter()` in the same commit as the migration (`c744cd0`, 2026-02-16 in the old repo). The merge thus always gives a truthy `ascensions` when the file has no `ascensions` key, and the migration never runs. Step 6 then deletes the package list. The script `probe-legacy.js` (scratch folder) proves it: `loadCharacter({ tier: 2, ascensionPackages: ['a', 'b'] })` gives `ascensions: []`. With the check first, the only change is for a file with an explicit `ascensions: null` and an `ascensionPackages` array. The check makes `ascensions` `[]`, so the migration does not run. No app version writes `ascensions: null`. The dead migration is a finding (§11), not a part of this change (R8: no new migration).

### 7.2 A top level that is not a plain object

Today (evidence: `probe-legacy.js` and `character-io.js:55`):

- `null`, `0`, `false` or `""`: `CharacterIO.load` skips `loadCharacter` and returns `{ success: true }`. The app shows "Character loaded successfully!" and loads nothing.
- An array, a string, a number or `true`: the merge spreads index keys (`'0'`, `'1'`, …) into a new character. The app shows success.

After this change **[Design agent]**:

- **Import path.** `character-io.js:55` becomes `if (result.success)`. `loadCharacter` then throws for each value that is not a plain object. The `catch` at `character-io.js:66-69` returns `{ success: false, error: 'The file does not contain a character.' }`. The click handler (`app.js:164-165`) shows "Error loading character: The file does not contain a character." This is the existing error path. `State.character` does not change, because the gate is step 1.
- **Autosave path.** `checkAutoSave` (`app.js:485-487`) calls `State.loadCharacter(saved.character)` inside a `try`. On a throw, it writes `console.warn('The auto-save was not loaded: ' + e.message)`. For a throw of the gate (step 1), the blank character stays. A throw after the merge (for example in a `'load'` listener at `state.js:178`) leaves the autosave in `State.character`; the warning then says "not loaded" although the character is in place. After the check, no such throw is known. Today a throw there stops `App.init` at each start. The autosave entry stays in `localStorage` until the next autosave writes over it.

Cost if wrong: a file whose top level is an array or a string loaded as a blank character before. It now shows an error. Such a file holds no character data, so nothing is lost.

## 8. Sink inventory

### 8.1 Coverage and method (R9)

Covered: every `.js` file in `creator/js/` (16 files) and `creator/tabs/` (16 files), and the inline script of `creator/index.html`. The pass ran in three parts:

- `creator/tabs/character-sheet-tab.js`: read in full in 7 parts, then a `grep -n '\${'` of each line without `escapeHtml`.
- The wargear group (`wargear-tab.js`, `custom-wargear.js`, `relic-wizard.js`, `improvised-builder.js`, `threat-card.js`, `followers-tab.js`, `followers.js`): read in full, except `relic-wizard.js`. In that file, a grep of each `${`, `innerHTML`, `relic.`, `entry.`, `State.` and `wargear[` line came first, then a read of all render and prefill code.
- All other files: a grep of `innerHTML`, `insertAdjacentHTML`, `outerHTML`, `textContent`, `${`, `character.` and `State.`, then a read of each render function that a grep found.
- Fix round 1 (C3): one more search for reads of the character through a key that is not a literal, over `creator/js` and `creator/tabs`. The greps: `(skills|attributes|choices|Choices|bonuses)\[[^'"0-9]`, `(skills|attributes)\?\.\[`, `getEffectiveAttribute\(<x>, <variable>`, and `Object.entries|Object.keys|Object.values|for … in` over the character or one of its objects. Each read was traced to HTML. Result: four reads reach HTML raw, all in `ascension-tab.js` (`:370`→`:374`, `:497`→`:403`, `:468`→`:472`, `:479`→`:483`). They are S20 (§8.4). The key comes from the data: package prerequisites and archetype `attributeBonus`/`skillBonus`. The data holds three skill keys that are not known keys (`choice`, `choice1`, `choice2` in `skillBonus`) and one package skill key `deceive` (`harlequin` package). `deceive` goes to the `skillRequirement` branch (`:381-396`), which compares only. The other reads compare only, sum numbers into a number, or use a fixed key list (sheet `:745`, `:815`, `:2037`, `:2157`; `talents-tab.js:199`; `stats-tab.js:87`, `:187`; `prerequisite.js:20`, `:30`, `:231`, `:252`; `xp-calculator.js:84`, `:104`; `state.js:572`, `:584`). The `choices[...]` reads are S7, S8 and S12-S14, and sheet `:1593` prints a data label only.

Each `${…}` was traced to its source: the character, a data file, a constant or UI state. The helpers that hand character values back were followed: `DataLoader` lookups (a `custom_` id gives the custom record), `DerivedStats`, `XPCalculator`, `State.getEffectiveTier`, `PrerequisiteChecker.getCharacterKeywords`, `Followers`, `ImprovisedBuilder.resolve`/`displayName`. No inline handler (`onclick=` and others) exists in `creator/`. No site uses `insertAdjacentHTML` or `outerHTML` with a character value.

Not covered: the bestiary app (out of scope), `shared/feedback.js` (it reads no character), and the CSS. A site that reaches HTML only through a browser API not in the grep list (for example `document.write`) was not searched; a grep for `document.write` in `creator/` finds nothing.

Data text reached by a valid id is not a character value. The fallback branch for an id that is not found is a character value.

### 8.2 Counts

| Class | Sites | Action |
|---|---|---|
| (a) already escaped | 71 | none |
| (b) safe after the check | 51 | none; the check makes the field a finite number (§5, §6) |
| (c) id raw | 10 | escape at the site for 8; 2 need nothing (an exact lookup finds the id first) |
| (d) free text raw | 17 | escape at the site |

Fix round 1 moved four rows from (b) to (d): `ascension-tab.js:374`, `:403`, `:472` and `:483` (S20). Through a key from the data, these sites can print the value of an unknown key, which is free text in a hostile file. R10 also types that value at the load; the escape stays as a second guard (C1).

A "site" is one row of the inventory notes. A row can cover a group of cells (for example the 18 skill rows of one template). `archetype-tab.js:389` is in both (c) and (d). Two sites that use a DOM `textContent` helper inside a double-quoted attribute are counted in (d), because that helper does not escape `"`.

The four helpers that drop `0` (`escapeHtml(0)` returns `''`) are used with `String()` first at each number site of class (a). No (a) site loses a number, except one display item (§11, F7).

### 8.3 Class (c): escape at the site, not an id constraint

**[Design agent]** Each class (c) site gets an escape at the site. The check enforces "string" for ids, and no pattern. Evidence: 3 of the 4 321 ids in `/data` fail `/^[A-Za-z0-9_-]+$/` (`brôkhyr_iron_master_aoa`, `kâhl_aoa`, `wonders_of_the_brôkhyr_aoa`), and discipline names and languages are not ids (`'High Gothic'` is a legal language). Cost if wrong: none for safety; an escape is always acceptable (R4).

### 8.4 Sites that change (classes (c) and (d))

| # | file:line | Field | Class | Action |
|---|---|---|---|---|
| S1 | `tabs/character-sheet-tab.js:1356` | `wargear[i].id` of a relic entry, via `base ? base.name : item.id` | c | `this.escapeHtml(baseName)` |
| S2 | `tabs/character-sheet-tab.js:1820` | `traumaticInjuries[i].side` | d | escape `entry.side` in `sideLabel` |
| S3 | `tabs/character-sheet-tab.js:1957-1958` | `languages[i]` (free text, title-cased) | d | escape each name after the title-case transform |
| S4 | `tabs/followers-tab.js:67` | `followers[i].id` in `data-follower-id` | c | `this.escapeHtml(follower.id)` |
| S5 | `tabs/followers-tab.js:75` | `followers[i].id` in `name="kind-…"` | c | `this.escapeHtml(follower.id)` |
| S6 | `tabs/followers-tab.js:76` | as S5 | c | as S5 |
| S7 | `tabs/archetype-tab.js:306` | `archetypeKeywordChoices[p]` in `value="…"` | d | `this.escapeAttr(currentValue)` |
| S8 | `tabs/archetype-tab.js:310` | as S7 | d | as S7 |
| S9 | `tabs/archetype-tab.js:356` | `customArchetype.keywords[i]` | d | `this.escapeHtml(k)` |
| S10 | `tabs/archetype-tab.js:389` | `customArchetype.wargear[i]` via `item?.name \|\| itemId` (a custom record name is free text) | c + d | `this.escapeHtml(item?.name \|\| itemId)` |
| S11 | `tabs/archetype-tab.js:412` | `customArchetype.name` in `value="…"` with the DOM helper | d | `this.escapeAttr(custom.name)` |
| S12 | `tabs/ascension-tab.js:225` | `ascensions[i].choices[p]` in `value="…"` | d | `this.escapeHtml(currentValue)` (new helper) |
| S13 | `tabs/ascension-tab.js:230` | as S12 | d | as S12 |
| S14 | `tabs/ascension-tab.js:238` | `ascensions[i].choices[key]` in `value="…"` | d | `this.escapeHtml(choices[key] \|\| '')` |
| S15 | `tabs/background-tab.js:231` | `languages[i]` in `data-lang="…"` with the DOM helper | d | `this.escapeAttr(language)` |
| S16 | `tabs/injuries-tab.js:89` (printed at `:93`) | `traumaticInjuries[i].side` | d | escape `entry.side` in `sideLabel` (new helper) |
| S17 | `tabs/powers-tab.js:151` | `unlockedDisciplines[i]`, text and `data-discipline` | c | escape both uses (new helper) |
| S18 | `tabs/species-tab.js:93` (built at `:91`) | `species.subOptions[i].optionId` via `option?.name \|\| sel.optionId` | c | escape each name (new helper) |
| S19 | `tabs/species-tab.js:264` | as S18 | c | as S18 |
| S20 | `tabs/ascension-tab.js:374`, `:403`, `:472`, `:483` | `attributes[key]`, `skills[key]` with a key from the data (`choice1` and `choice2` are unknown keys) in `(have ${current})` | d | `this.escapeHtml(String(current))` at each of the four lines (new helper) |

S12 (`:225`) runs only for a keyword category that has options and `allowCustom`. `demanding_patron` (`[ANY]`, category `any` with 0 options) does not reach it. `agent_of_inquisition_aoa` (`[ORDO]`, 3 options, `allowCustom`) does.

Helpers **[Design agent]**:

- `ascension-tab.js`, `injuries-tab.js`, `powers-tab.js` and `species-tab.js` have no helper. Each gets an `escapeHtml(text)` method at the end of its object. The body is the same as `character-sheet-tab.js:2787-2795` (it escapes `& < > " '`). Cost if wrong: four copies of a 7-line helper. The codebase already has one copy per file.
- `archetype-tab.js` and `background-tab.js` have a DOM helper that does not escape `"`. Each gets an `escapeAttr(text)` method, the same as `relic-wizard.js:824-827` (`this.escapeHtml(text).replace(/"/g, '&quot;')`). The existing `escapeHtml` does not change.
- The relic display at S1 and the sheet sites use the existing `CharacterSheetTab.escapeHtml`.

The two (c) sites that need nothing: `powers-tab.js:286` and `talents-tab.js:345`. Each prints an id only after an exact `===` lookup in the data found it.

### 8.5 Class (b) sites, by field

These sites need no code change. After the check, the field is a finite number, so the template prints only digits, `-`, `.` or `e`.

| Field (type after the check) | Sites |
|---|---|
| `attributes.*` (integer) | sheet `:578` traits, `:765` attributes (7 cells), `:831` skill totals, `:983` dice, `:984` damage; stats-tab `:113`, `:165`, `:215` |
| `skills.*` (integer) | sheet `:829`, `:831`, `:983`; stats-tab `:165`, `:212`, `:215` |
| `rank` (integer or `null`; each reader uses `rank \|\| 1`) | sheet `:578`, `:831`, `:984`, `:990` (through talent and path bonuses); improvised-builder `:182`, `:376` (through `resolve`) |
| `tier` (integer) | ascension-tab `:21`, `:30`, `:44`, the 9 `data-target-tier`/`name` lines (`:63`-`:333`); archetype-tab `:404` |
| `ascensions[i].targetTier` (integer) | sheet `:1625` |
| `corruption` (integer or `null`; each reader uses `corruption \|\| 0`) | stats-tab `:165` (through `getCorruption`); injuries-tab `:153` |
| `followers[i].count`, `.livingCount` (finite number or `null`) | followers-tab `:78`, `:79` |
| `wargear[i].improvised.halfTime` (integer) | improvised-builder `:177`, `:206` |

The other (b) sites are numbers today by construction (`*`, `Math.min`, `Number()`, a `> 0` guard), or the existing custom repair types their field. The notes list each one.

### 8.6 Free text that is safe today

These fields are free text, and each site escapes them already (class (a)): `name`, `customArchetype.name` (sheet), `notes`, follower `name`/`notes`/`threatId`, talent `choice`, the relic and improvised overlay text, the custom record text, and the keyword chips of the sheet (`:483`). The keyword list holds free text from `customArchetype.keywords`, `customKeywords`, `archetypeKeywordChoices` and ascension `choices`. Its other sink is the footer, which uses `textContent` (`app.js:454`).

## 9. Number fields and long render loops (R5)

No range limit is added (§5). These number fields can make a render loop very long. The check does not bound them, and this change does not bound them. Each is a finding (§11).

| Field | Loop | Bounded? |
|---|---|---|
| `tier` | `ascension-tab.js:27`, `for (t = tier + 1; t <= 5; t++)` | No. A tier of `-1e9` builds about 1e9 slots. After the check, `Infinity` is gone, but a large negative integer stays. |
| `attributes.toughness`, `attributes.willpower` (and the bonuses that add to max Wounds and max Shock) | `character-sheet-tab.js:722`, `renderTrackingBoxes` | No. A toughness of `1e9` gives 1e9 boxes. Today `1e999` (Infinity) loops with no end; after the check it cannot. |

`improvised.halfTime` feeds `Math.pow` only. `followers[i].count` drives no loop. The current session values only compare.

## 10. Unknown keys (R6)

Unknown keys stay. No site in `creator/` prints an unknown key as HTML. One class of site prints the value of an unknown key: `ascension-tab.js:374`, `:403`, `:472` and `:483` read `attributes[key]` and `skills[key]` with a key from the data, and the data has the unknown skill keys `choice`, `choice1` and `choice2`. The first inventory missed this class (review finding P1). Two guards close it: R10 makes each unknown value in `attributes` and `skills` a finite number or `null` at the load, and S20 escapes the four sites. Evidence for the rest, from the three inventory parts and the C3 search (§8.1):

- The attribute and skill rows of the sheet and the stats tab use fixed name lists (sheet `:734`, `:783`; stats tab).
- `Object.entries(asc.choices)` (sheet `:1593`) prints only the label of a data option whose value matches. `getExtraKeywordKeys` (`ascension-tab.js:253`) prints a key only when it is a data placeholder plus digits.
- `Object.entries(archetypeKeywordChoices)` and `Object.entries(asc.choices)` (`prerequisite.js:231`, `:251`) add a string value to the keyword list. After the check, each value is a string, and each keyword sink escapes (§8.6).
- The custom repair rebuilds `entry.custom` and drops unknown keys inside the custom record. This is existing behavior (`custom-wargear.js:770-773`). Unknown keys on the wargear entry stay.

Unknown keys have one effect outside HTML: `xp-calculator.js:84`, `:104` sum `Object.entries(character.attributes)` and `skills`. An unknown key with a number value changes the XP total, which `app.js` writes with `textContent`. This is existing behavior, and R6 keeps it (§11, F5).

## 11. Findings not solved

| # | Finding | Why it stays |
|---|---|---|
| F1 | The legacy `ascensionPackages` migration is dead since `c744cd0`. Each save with `ascensionPackages` loses its packages at load: the Electron 1.0.0 saves (its `state.js:42`, `:804-805` write `ascensionPackages`) and the web saves from 2026-02-13 to 2026-02-16. | R8: no new migration. The owner can decide. |
| F2 | `ascension-tab.js:27` loops from `tier + 1` to 5 with no lower bound. A large negative tier hangs the tab. | R5: list, do not design a limit. |
| F3 | `renderTrackingBoxes` (`character-sheet-tab.js:722`) has no upper bound. A large toughness or willpower hangs the sheet. | R5. |
| F4 | The comment at `state.js:107` says the injury side is `"left"`/`"right"`. The UI writes `'Left'`/`'Right'`. | R8: no cleanup of adjacent code. The spec uses an escape, not an enum. |
| F5 | An unknown key in `attributes` or `skills` changes the XP total, or makes it `NaN`. | R6. |
| F6 | The relic wizard throws at step 5 when `relic.form` is a string that is not a form id (`relic-wizard.js:295`, `:770`). A type check cannot find an unknown id without the data. | The wizard is a modal, not a tab render. |
| F7 | `escapeHtml(0)` returns `''`, so a talent choice of `0` (a wargear index) shows nothing on the sheet when `wargear[0]` is not a weapon or armour (`character-sheet-tab.js:1665`). | Display only, no safety effect. Existing. |
| F8 | `app.js:471` spreads `saved.enabledSources`. A value that is truthy and not iterable throws at start. | Not a character value (R8 scope). |
| F9 | `CharacterIO.validateCharacterData`, `getCharacterSummary` and `createCharacterSheet` have no caller. | R8: mention only. |
| F10 | `repairMissingBonusTypes` (`background-tab.js:251-276`, `character-sheet-tab.js:2798`) writes `bonusType` into the character at render. | Existing behavior. A no-op test must load only, not render. |
| F11 | `setArchetype` writes `Math.max(undefined, value)`, which is `NaN`, for the data keys `choice`, `choice1` and `choice2` of `skillBonus` (`state.js:355`). JSON saves it as `null`. | R8: this change does not correct it. R10 keeps the `null`. |

## 12. What this spec does not prove

- The Electron build 1.0.0 (2026-01-28) is evidence (§5). Its writers match `3b17bac` for each row. The app before 1.0.0 is not in any history and not in any build on this machine. For that period, the evidence is the readers in today's code that accept two shapes (talents as a string or an object, a background entry with no `bonusType`, `customKeywords`). The check enforces only types that these readers also need. It enforces no range and no pattern.
- No real `.character` file from a user is on this machine. The no-op corpus of the plan uses shapes from the setters and the readers.
- `relic-wizard.js` was searched with grep first, then read in the render and prefill parts only.
