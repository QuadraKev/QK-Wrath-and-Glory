# Bug pass of the bestiary — Design

Date: 2026-11-15. Branch: `bug-pass-bestiary`. Base: `44084ae` (`main`).
Status: design. Line references are to the tree at `44084ae`.

Marks used below:

- **[Owner, 2026-11-15]** is the owner's word.
- **[Controller ruling, 2026-11-15]** is a binding ruling of the controller (G1-G11 and the ruling for each finding).
- **[Design agent]** is a decision of the agent that wrote this spec. Each one gives the cost if it is wrong.

## 1. The request

Owner's words **[Owner, 2026-11-15]**, after the character load check went live: "Let's do an overall pass for any bugs like those and clean them up in one go."

Three read-only audits then found the defects. This spec designs the corrections for the bestiary app (`bestiary/`). The findings in scope are:

- C1-C11 of audit 3 (the stored and imported data of the bestiary);
- the bestiary copy of B6 of audit 2 (a mob ability list shows "[object Object]");
- three items that audit 3 did not check: the hover and pin popups on custom threat text, the "Browse" pickers of the threat builder, and the mobile slide-up views.

This design found two more defects. They are D1 and D2 (§6.4, §4.7).

The audit files are session files. They are not in the repo. Thus each section below repeats the evidence of its findings (G10).

A different author writes the spec for the creator app. This work changes no file under `creator/`, `shared/` or `data/`.

## 2. Rulings

### 2.1 Rulings for the two apps (G1-G11)

**[Controller ruling, 2026-11-15]**. The full text is in the rules of the work session. The short form:

- **G1. No harm to stored data.** A correction never drops or changes a stored value at load. The two exceptions are a migration that keeps or restores what the user had, and a value that only a defect wrote and that no reader needs. The spec names each exception (§4.8). A stored value outside a new limit stays until the user edits it, and the render must cope with it.
- **G2. No silent delete through the UI.** A UI action does not delete a thing that the user made, unless the action names it. A thing that cannot stay valid stays stored and visible, with a clear mark and a Remove control.
- **G3. Correct the cause at the writer, and make the reader tolerant.** A writer stores only finite, valid values. A reader has a bound on each loop, a guard on each lookup, and a visible entry for an id that the data does not have.
- **G4. Limits.** Enforce only the `min` / `max` that an input declares, and the rules of the game with a book citation.
- **G5. No feature.** The only new controls are the smallest ones that a correction needs (§10).
- **G6. The book decides a rule of the game.** Where the book does not decide, the item goes into "Owner decisions" (§11).
- **G7.** A new stored field of the creator. Not applicable here.
- **G8. Scope by severity.** Each S1 and S2 finding gets a correction. An S3 finding gets a correction when it is a small guard. S4 items are listed only.
- **G9. Tests.** Each correction gets a check that fails before it.
- **G10. Honest claims.** §14 says what this spec does not prove.
- **G11. Design calls** have the mark **[Design agent]** and a cost.

### 2.2 Rulings for each finding

**[Controller ruling, 2026-11-15]**:

- **C1 and the three unchecked items.** After this work, no string from an imported file, from the storage or from an input field reaches the page as markup or breaks an attribute or a `<textarea>`. Each sink gets an escape that fits its context. The shipped dataset must look the same. The proof includes a DOM comparison for the shipped threats and a hostile file with a marker in each field.
- **C2, C3.** Text that the user types comes back as typed after each redraw, each edit and each reload: `Bob "Big" Smith`, `&lt;`, `&amp;`, `</textarea>`.
- **C4, C5.** A loaded encounter goes into the autosave. A user action that makes the encounter or the builder empty removes or replaces the stored state. The page start does not clear the stored state before the load reads it.
- **C6, C7.** Each number input accepts only a finite number inside its declared `min` / `max`. Another entry keeps the stored value, and the input shows the stored value again. The load brings a stored count outside the declared range to the nearest limit, with one console warning. This is a named exception to G1.
- **C8.** A threat that is already in the encounter keeps its own data when the builder adds a threat again. The max wounds and the stats of one entry must agree.
- **C9, C10, C11.** One module does a type check with repair for each stored object and each imported file, in the pattern of `CharacterCheck`. A top level of the wrong kind gives the existing error message for an import and a console warning for the storage, and the app starts. An entry whose threat id the data does not have stays as a visible row "Unknown threat (<id>)" with a Remove control. A custom threat from a file cannot replace a shipped threat. No catch for all errors around the load.
- **B6.** Show the mob abilities when the data holds a list. Correct the code, not the data.

## 3. Design summary

| Group | Findings | Section | Plan tasks |
|---|---|---|---|
| A. The type check at each load | C9, C10, C11, C7 (load part), D2 | §4 | 1, 3, 4 |
| B. The autosave | C4, C5 | §5 | 3, 4 |
| C. Number inputs and the player rows | C6, C7 (input part), D1 | §6 | 5a, 5b |
| D. Add to Encounter | C8 | §7 | 4 |
| E. Escapes | C1, C2, C3, the three unchecked items | §8 | 6, 7, 8, 9 |
| F. Mob ability lists | B6 | §9 | 6, 9 |

- A new file `bestiary/js/bestiary-check.js` holds one global object, `BestiaryCheck`. It holds the field rules, the load clamp, the number input rule and a compare of two threat records. **[Design agent]** One file keeps the rules in one place, and a Node test can load it alone. This is the `CharacterCheck` pattern. Cost if wrong: one more script tag.
- Plan Task 1 adds the module, its tag and the cache bump (`?v=96` to `?v=97` on all 16 tags, plus the new tag). Plan Task 2 adds a browser proof script that fails before the corrections. Tasks 3-9 (with 5a and 5b) make the corrections.

## 4. Group A: the type check at each load (C9, C10, C11, C7 load part, D2)

### 4.1 Findings

**C9 (S3). Wrong-shaped autosave values throw at start.** Evidence (audit 3, `shapes.out`): `customThreats: {}` gives `saved.customThreats.forEach is not a function` at `app.js:243`. `App.init` stops, so the builder restore and the deep link do not run. `individuals: {}` makes the encounter tab unusable. A builder `threat.id: 5` throws at `threat-builder-state.js:547`, and `skills: 5` throws at `:402`. Root cause: the readers test presence, not type.

**C10 (S3). Unknown ids and nameless custom threats throw.** Evidence: a mob with an unknown `threatId` throws `Cannot read properties of undefined (reading 'name')` when the user selects it. The throw is at `encounter-tab.js:1086`, and only when a free individual has the same unknown id (the "Add Troops to Mob" list). A custom threat with no `name` throws `localeCompare` in the Threats list (`threats-tab.js:134`). `handleImportThreat` and `loadThreatFromFile` call `threat.id.startsWith` with no type check. `handleLoadPlayers` calls `name.trim` on a value that can be a non-string (`encounter-state.js:491`). Root cause: an unguarded lookup result and no type check on imported fields.

**C11 (S3). An imported custom threat can replace a shipped threat.** Evidence: `encounter-state.js:981` and `:1001` inject each `customThreats` entry with no `custom_` check, and `DataLoader.injectThreat` (`data-loader.js:552-559`) replaces the record with the same id. `shapes.out`: `marbo.name=NOT MARBO`. Root cause: `injectThreat` accepts any id.

**C7, load part (S2).** Evidence: `shapes.out`: a stored `playerCount: 300000` makes each page start take 35 s, because `renderPlayerCharacterInputs` loops to the count (`encounter-tab.js:124`). Root cause: no bound on a stored count.

**D2 (found in this design, S3). A dangling `mobId` hides an individual.** `getStandaloneIndividuals` (`encounter-state.js:800`) shows only an individual with no `mobId`. A mob shows only its members. An individual whose `mobId` names no mob is thus in no list, and the user cannot see or remove it. No app writer makes this state: `removeFromMob`, `disbandMob` and `removeMob` clear or remove the members. A hand-made file can make it.

### 4.2 Entry points and their gates

Each entry point tests the shape of the top level first. No `try`/`catch` goes around a load.

| Entry point | Today | Gate (new) | On a failed gate |
|---|---|---|---|
| Encounter autosave, `App.checkAutoSave` (`app.js:237-249`) | `if (saved && saved.encounter)` | `saved` and `saved.encounter` are plain objects | `console.warn('The auto-save was not loaded: it does not contain an encounter.')`. The blank encounter stays. The stored key stays. |
| Builder autosave, `App.checkAutoSave` (`app.js:252-255`) | `if (builderSave && builderSave.threat)` | `builderSave` and `builderSave.threat` are plain objects | `console.warn('The auto-save was not loaded: it does not contain a threat.')`. The empty builder stays. The stored key stays. |
| `.encounter` file, `EncounterState.loadEncounterFromFile` (`encounter-state.js:975`) | `if (result.success && result.data)` | `result.data` is a plain object with at least one of the keys `settings`, `individuals`, `mobs`, `playerCharacters`, `vehicles` | Return `{ success: false, error: 'Invalid encounter file' }`. The existing handler shows "Error loading: Invalid encounter file" (`encounter-tab.js:2051`). |
| `.threat` file into the builder, `ThreatBuilderState.loadThreatFromFile` (`threat-builder-state.js:324`) | `if (result.success && result.data)` | `result.data` is a plain object with at least one of the keys `name`, `abilities`, `attributes` | Return `{ success: false, error: 'Invalid threat file' }`. The existing handler shows "Error: Invalid threat file" (`threat-builder-tab.js:68`). |
| `.threat` file into the encounter, `EncounterTab.handleImportThreat` (`encounter-tab.js:2092`) | `if (!threat)` | as the builder `.threat` gate | The existing message "Error: Invalid threat file" (`:2103`). |
| `.players` file, `EncounterTab.handleLoadPlayers` (`encounter-tab.js:2140`) | `if (result.success && result.data)` | `result.data` is a plain object with the key `players` (the writer `handleSavePlayers`, `:2122-2129`, always writes it) | `this.showNotification('Error loading: Invalid player file')`. |

"Plain object" means `value !== null && typeof value === 'object' && !Array.isArray(value)`.

The two autosave gates apply only when the key holds a value. An absent key (`getAutoSave()` returns `null`) gives no gate and no warning, as today.

**[Controller ruling, 2026-11-15, CB3]** A file gate also requires one key of its own kind. Why: on iOS the file picker shows all files (`web-api.js:91`), so a user can pick a `.threat` or a `.players` file in Load Encounter. Without the key test, the check repairs such a file to an empty encounter. A file that fails a gate changes nothing: not the state, not the storage, not the ownership flags of §5.2.

### 4.3 Rules that apply to each field

1. **Present with a wrong type.** The check replaces the value with the repair value of its row and adds the path to the repaired list.
2. **Absent optional key.** It stays absent. Each optional key has the word "optional" in its row. Shipped threats lack many keys (for example 395 of 844 have no `quote`), and a custom threat made from a template keeps the shipped shape.
3. **Absent key that is not optional.** It gets the repair value of its row, and the path goes into the list.
4. **An entry that cannot be used.** An entry of a list that is not a plain object, or that has no string id where its row needs one, is dropped. The path goes into the list.
5. **Strings.** The check never trims, cuts or changes a string. A string of any content is legal. The escapes (§8) make it safe.
6. **Numbers.** "Finite number" means `typeof v === 'number' && Number.isFinite(v)`. A numeric string such as `"3"` is a wrong type.
7. **Unknown keys stay.** The check does not read, change or delete them. The shipped data has keys that no render reads (`mobActions`, `equipment`, `movement`, `mobBonuses`, `resilience2`).
8. **One warning.** Each load writes at most one `console.warn`, with all repaired paths: `'Encounter data was repaired on load: '`, `'Threat data was repaired on load: '` or `'Player data was repaired on load: '`, followed by `paths.join(', ')`. Path format: keys joined with `.`, an index as `[i]`, for example `individuals[2].bonus`.
9. **No range limit**, except the player count (§4.8, E1). The check does not enforce `min` / `max` on threat values (G1, G4).

### 4.4 Encounter fields (`BestiaryCheck.repairEncounter(data)`)

"Writer" gives the evidence for the legal shapes.

| Path | Legal shapes (writer) | Repair |
|---|---|---|
| `settings` | plain object (`clearEncounter` `:1015`, `updateSettings` `:735`) | `{ tier: 1, playerCount: 4, name: 'Unnamed Encounter', round: 1 }` |
| `settings.tier` | integer (`parseInt` of a select option, `encounter-tab.js:25`) | `1` |
| `settings.playerCount` | integer | not an integer: `4`. An integer outside 1-10: the nearest limit (E1). The C6 defect wrote `null`. |
| `settings.name` | string | `'Unnamed Encounter'`. A file load then sets the file name (existing). |
| `settings.round` | integer; optional (old saves have none, and the existing load default sets `1`) | `1` |
| `individuals` | array | `[]` |
| `individuals[i]` | plain object with a string `id` and a string `threatId` (`addIndividual` `:77-90`) | drop |
| `.bonus` | `'none'`, `'elite'` or `'adversary'` | `'none'` |
| `.currentWounds`, `.currentShock` | finite number. The C6 defect wrote `null` (E4). | `0` |
| `.maxWounds`, `.maxShock` | finite number, or `null` (the C6 defect wrote `null`) | `null`, then the load recomputes it (E2) |
| `.mobId` | string or `null` | `null`. A string that names no mob of the repaired `mobs` list: `null` (E3, D2). The check repairs `mobs` before it tests each `mobId`, so a member of a dropped mob also becomes a free row. |
| `.initiative` | finite number or `null`; optional | `null` |
| `.notes` | string; optional | `''` |
| `.additionalWeaponId` | string or `null`; optional (added after the first saves) | `null` |
| `.personalRuin` | finite number; optional (added after the first saves) | `0` |
| `mobs` | array | `[]` |
| `mobs[i]` | plain object with a string `id` and a string `threatId` (`createMob` `:256-262`) | drop |
| `.name` | string | `'Mob'` |
| `.initiative` | finite number or `null`; optional | `null` |
| `.notes` | string; optional | `''` |
| `playerCharacters` | array | `[]` |
| `playerCharacters[i]` | plain object with a string `id` (`addPlayerCharacter` `:493-498`) | drop |
| `.name` | string | `'Player'` (the default of `handleLoadPlayers` `:2158`) |
| `.initiative`, `.notes` | as for an individual | as for an individual |
| `vehicles` | array; optional (added `768715d`, 2026-10-23) | `[]` |
| `vehicles[i]` | plain object with a string `id` and a string `vehicleId` (`addVehicle` `:566-571`) | drop |
| `.wounds` | finite number | `0` |
| `.initiative` | finite number or `null`; optional | `null` |
| `encounterOrder` | array or `null`; optional | `null` |
| `encounterOrder[i]` | plain object with a string `type` and a string `id` | drop |
| `customThreats` | array; optional | `[]` |
| `customThreats[i]` | plain object; a string `id` that starts with `custom_`; the first entry for its id | drop (C11, §4.9; a repeated id is also dropped) |
| `customThreats[i].*` | §4.5 | §4.5 |
| `version`, other keys | any | stay |

### 4.5 Custom threat fields (`BestiaryCheck.repairThreat(threat, prefix)`)

The legal shapes are the shapes of the 844 shipped threats (a template copy keeps them) and the shapes that the builder writes (`clear()` `threat-builder-state.js:280-307`, the inputs at `threat-builder-tab.js:526-545`). The repair values are the defaults of `clear()`. The function does not handle `id`: each caller has its own id rule (§4.6).

| Key | Legal shapes | Repair |
|---|---|---|
| `name` | string (required) | `''` |
| `source` | string; optional | `'Custom'` |
| `size` | string; optional (shipped: `Avg`, `(flight)` and others) | `'Average'` |
| `quote`, `attribution`, `description`, `defenceNote`, `speedNote`, `determination`, `skills`, `threatOptions`, `biomorphs` | string; optional | `''` |
| `page` | finite number or `null`; optional | `null` |
| `tierThreat` | plain object; optional (205 shipped threats have 4 tiers) | `{ '1': 'T', '2': 'T', '3': '-', '4': '-', '5': '-' }` |
| `tierThreat.<key>` | string | `'-'` |
| `keywords` | array of strings; optional | `[]`. An element that is not a string is dropped. |
| `attributes` | plain object; optional | `{ S: 1, T: 1, A: 1, I: 1, Wil: 1, Int: 1, Fel: 1 }` |
| `attributes.S`, `.T`, `.A`, `.I`, `.Wil`, `.Int`, `.Fel` | finite number; optional | `1` |
| `resilience` | plain object; optional | `{ value: 1, note: '' }` |
| `resilience.value` | finite number; optional | `1` |
| `resilience.note` | string; optional | `''` |
| `defence`, `wounds` | finite number; optional | `1` |
| `speed` | finite number; optional | `6` |
| `shock` | finite number or string (184 shipped threats hold `'-'`); optional | `1` |
| `conviction`, `resolve` | finite number or string (4 shipped `'-'`); optional | `0` |
| `abilities` | array; optional | `[]` |
| `abilities[i]` | plain object | drop |
| `abilities[i].type` | string | `'ABILITY'` |
| `abilities[i].name` | string | `''` |
| `abilities[i].stats`, `.description`, `.weaponId` | string; optional | `''` |
| `bonuses` | array; optional | `[]` |
| `bonuses[i]` | plain object | drop |
| `bonuses[i].name`, `.description` | string | `''` |
| `mobOptions`, `mobAbilities` | string, or an array of plain objects (8 shipped lists of `mobAbilities`, 4 of `mobOptions`); optional | `''` |
| `mobOptions[i]`, `mobAbilities[i]` (array form) | plain object | drop |
| `mobOptions[i].name`, `.description` (array form) | string | `''` |
| other keys (`mobActions`, `parsedSkills`, …) | any | stay |

Evidence for the shipped shapes: a scan of `data/threats.json` in this design session. Every shipped number is an integer, every shipped string field is a string, and no shipped threat has an id that starts with `custom_`.

### 4.6 Load flow and id rules

**Encounter (`EncounterState.loadFromData(data, priorPaths = [])`).** The caller has tested that `data` is a plain object.

1. `paths = priorPaths.concat(BestiaryCheck.repairEncounter(data))`.
2. Inject each entry of `data.customThreats` (existing).
3. Assign `settings` and the lists (existing). The `||` defaults stay.
4. **New:** for each individual with `maxWounds === null` or `maxShock === null` whose threat resolves, compute the value with `calculateMaxWounds` / `calculateMaxShock` and the loaded settings. Add the path, for example `individuals[0].maxWounds`.
5. If `paths.length > 0`, write the one warning of §4.3 rule 8.

`loadEncounterFromFile` becomes: gate (§4.2), then `this.loadFromData(result.data)`, then `this.settings.name = result.fileName`, `markClean()`, and the autosave of §5.

`App.checkAutoSave` repairs the top-level `saved.customThreats` with `BestiaryCheck.repairCustomThreatList(saved, 'customThreats', 'autosave.customThreats')`, injects it (existing), then calls `EncounterState.loadFromData(saved.encounter, thosePaths)`. **[Design agent]** The top-level list stays, because an older autosave can hold a custom threat only there. Cost if wrong: one more repaired list.

**Custom threat ids.**

- In an encounter (`customThreats`): an id that is not a string starting with `custom_` drops the entry (C11).
- In the builder (`loadThreatFromFile`, `loadFromAutoSave`) and in Import Threat: such an id gets a new `custom_` id. This is the existing behavior (`threat-builder-state.js:329`, `:547`; `encounter-tab.js:2108`), with a type test first.
- In the builder and in Import Threat, an id that the cache already holds with different data also gets a new id (C8, §7).

**Players file.** Gate, then `BestiaryCheck.repairPlayers(data)`:

| Path | Legal shapes (writer `handleSavePlayers` `:2122-2129`) | Repair |
|---|---|---|
| `playerCount` | integer; optional | not an integer: delete the key, so the current count stays. An integer outside 1-10: the nearest limit (E1). |
| `players` | array; optional | `[]` |
| `players[i]` | plain object | drop |
| `players[i].name` | string | `'Player'` |
| `players[i].notes` | string; optional | `''` |

A `.players` file is not stored, so its repairs change no stored value. After it replaces the players, `handleLoadPlayers` calls `EncounterState.markDirty()`, so the autosave follows also when the file holds no players (plan review, Q5).

### 4.7 Unknown threat ids (C10)

- An individual whose threat does not resolve shows the row name `Unknown threat (<id>)` instead of `Unknown` (`encounter-state.js:822`). The row keeps its Remove control (`×`, `encounter-tab.js:629`).
- A mob whose threat does not resolve shows its stored name followed by ` — Unknown threat (<id>)` (`encounter-state.js:846`). The mob row prints `item.name`, not `mob.name` (`encounter-tab.js:651`, plan Task 8), so the mark shows in the row. **[Design agent]** The mob keeps the name that the user knows, and the mark is added. Cost if wrong: a longer row name.
- In the mob detail, the "Add Troops to Mob" line and the member line use `Unknown threat (<id>)` when the threat does not resolve (`encounter-tab.js:1086`, `:1207`). This removes the throw of C10.
- An unknown vehicle id and an unknown additional weapon id already render "Unknown vehicle" and "Unknown weapon" with their Remove controls (audit 3, "Checked and found correct").
- D2: a dangling `mobId` becomes `null` at load (E3), so the individual shows as a free row with its Remove control.

### 4.8 Named exceptions to G1

| # | Stored value | Change at load | Why it is allowed |
|---|---|---|---|
| E1 | `settings.playerCount` outside 1-10 | the nearest limit | **[Controller ruling, 2026-11-15]** for C7: the count is work data, and a count that the UI cannot accept makes each start slow. One warning (the path is in the repair warning). |
| E2 | `maxWounds` / `maxShock` that is `null` or not a finite number | recomputed from the threat and the settings | The C6 defect wrote `null` (`NaN` in JSON). The value then shows the threat as dead after each reload. The recompute restores what the user had. When the threat does not resolve, the value stays `null`. The row then prints the current value and an empty max (`0/`), and `isIndividualDead` treats it as dead (`0 >= null`). The row keeps its Remove control. |
| E3 | `mobId` that names no mob | `null` | The value hides the entry (D2). `null` makes it visible again. No app writer makes it. |
| E4 | a value of a wrong type | the repair value of its row (§4.4, §4.5) | No app version writes a wrong type, with two exceptions. First, the first dataset of the old repo (`e029c42`) had 8 daemon engines with `defence`, `shock`, `conviction` and `resolve` set to `null`; the builder template search was live for some hours before `d0b1d5e` removed those threats, so a `.threat` file from that window can hold these `null` values, and `repairThreat` gives them the repair values of §4.5 (found in the review of Task 1). Second, the C6 defect. It wrote `NaN` (stored as `null`) into `playerCount` (E1 row: default `4`), `maxWounds` / `maxShock` (E2), and `currentWounds` / `currentShock` (`recalculateAllStats`, `encounter-state.js:727-728`: `Math.min(current, NaN)`; audit `p-playersEmpty.out` shows `[.., null, null, ..]`). A `null` current value becomes `0`, the value of a new entry. The real current value is lost since the defect wrote `NaN`; no load can restore it. |
| E5 | an entry that cannot be used (§4.3 rule 4), a `customThreats` entry with a shipped id or a repeated id | dropped | No app version writes such an entry: `_collectCustomThreats` (`:929-942`) keeps only `custom_` ids, once each. |

The check never writes the repaired data back at start. The stored autosave changes only at the next write (§5). Thus an unreadable or repaired autosave stays as stored until the user edits the encounter.

### 4.9 C11: the decision

**[Design agent]** The encounter load drops a `customThreats` entry whose id is not a `custom_` id. It does not give the entry a new id. Why: an individual that refers to `sly_marbo_aaa` can mean the shipped threat, so a new id cannot be mapped back with certainty. After the drop, such an individual shows the shipped threat. Its stored `maxWounds` stays (G1) until the next change of tier, player count or bonus recomputes it. No app version writes such a file (E5). Cost if wrong: a hand-made file shows shipped stats instead of its own.

### 4.10 Risk to stored data

The repairs E1-E5 are the only changes at load. A save that the app writes passes the check with no change and no warning. Plan Task 1 proves this with encounters and threats built through the real writers, and with all 844 shipped threats as templates (§14 states the limits).

## 5. Group B: the autosave (C4, C5)

### 5.1 Findings

**C4 (S2). A loaded encounter file is not autosaved.** Evidence (`p-loadNotAutosaved.out`): build encounter A, load file B, reload. A comes back. `loadEncounterFromFile` (`encounter-state.js:992`) calls `markClean()` and writes no autosave. In `rt.out`, B survived a reload only because an old debounce timer was still pending. Root cause: only `markDirty` writes the autosave.

**C5 (S2). Removing the last item does not update the autosave.** Evidence (`p-removeLast.out`): one threat, remove it, reload: the threat is back. `_performAutoSave` returns early for an empty state (`encounter-state.js:1035`, `threat-builder-state.js:515`). Root cause: an empty state skips the write instead of removing the key.

### 5.2 Correction

**[Controller ruling, 2026-11-15, CB1, CB2]** A page removes a stored key only when that page owns it. Why: a second tab with an empty state must never delete the work of the first tab. The review proved the risk with two contexts on one origin: tab B changed the tier on its empty encounter, and the key of tab A was gone two seconds later.

The old single-app site (`quadrakev.github.io/wrath-and-glory-bestiary-web/`) has the same origin as this site (`quadrakev.github.io`), so it can share `localStorage` and these two keys. The monorepo started as a copy of that app (`74924bb`). The ownership rule protects that case in the same way.

- Each state object gets one flag: `EncounterState._ownsAutoSave` and `ThreatBuilderState._ownsAutoSave`, `false` at start.
- The flag becomes `true` when the page writes its key (`_performAutoSave`) and when the page restores its state from the key (`App.checkAutoSave`, after a passed gate).
- "Empty" is `isEmpty()` for the encounter. For the builder it is "pristine" (below).
- `markDirty` / `_markDirty`: when the state is empty after the change, cancel the pending timer. If the flag is `true`, remove the key at once and set the flag to `false` (CB2). If the flag is `false`, do nothing to the storage. Else schedule the write as today.
- `_performAutoSave`: an empty state writes nothing and removes nothing. This covers a timer that was pending before Clear.
- `clearAutoSave()` of each state removes the key only when the flag is `true`, then sets the flag to `false`. Each removal goes through it: the empty rule above, `clearEncounter()` (`encounter-state.js:1022`), and the two builder Clear handlers (`threat-builder-tab.js:48`, `:103`). `clearEncounter()` and the builder `clear()` also cancel the pending timer. **[Design agent]** Clear follows the same rule as the other actions, so that Clear in a second tab cannot delete the work of the first tab. Cost if wrong: after Clear in a tab that never wrote the key, a reload of that tab shows the encounter of the other tab (the CB1 cost).
- `EncounterState.loadEncounterFromFile`: after a load that passed its gate, `clearTimeout(this._autoSaveTimer)`, then write at once (`_performAutoSave()`, which sets the flag). The state stays clean (no unsaved-changes flag). An empty loaded encounter follows the empty rule: the key goes only when the flag is `true`.
- Builder "pristine": `BestiaryCheck.sameThreatData(this.getThreatData(), this._newThreatData())` is `true`. `_newThreatData()` returns the `getThreatData()` form of a new threat: the literal of `_newThreat()` with `skills: 'Default 0'` (the `_serializeSkills` result for zero skills, `threat-builder-state.js:437-458`) and no `parsedSkills`. **[Design agent]** The builder's `isEmpty()` is true for a threat with keywords and stats but no name and no abilities. Removing the key in that case would lose work that the user has. Cost if wrong: a nameless partial threat now persists across a reload.

`clear()` of the builder gets its literal from a new method `_newThreat()`, so that the pristine test and `clear()` use one object shape.

### 5.3 The stored keys after each case

"Owner" means that the flag of §5.2 is `true` in this page.

| Case | `wng-bestiary-autosave` | `wng-bestiary-builder-autosave` |
|---|---|---|
| Page start | read; never changed, also when the check repairs or refuses it. A restore makes the page the owner. | the same |
| Load of an `.encounter` file | written at once; the page becomes the owner. An empty loaded encounter removes the key only for an owner. A file that fails its gate changes nothing. | no change |
| Load of a `.threat` file into the builder | no change | written 2 s after the load (existing `_markDirty`). A file that fails its gate changes nothing. |
| Import Threat into the encounter | written 2 s after (existing) | no change |
| An edit | written 2 s after the last change (existing) | written 2 s after the last change |
| A change that makes the state empty (remove of the last item; a builder made pristine) | removed at once by an owner; no change for another page | the same |
| A change on a state that stays empty (tier, round, sort on an empty encounter) | no change | no change |
| Clear | removed at once by an owner; no change for another page | the same |
| New | The bestiary has no "New" action. Clear is the new encounter. A template (Customize, or the template search) replaces the builder threat: written 2 s after. | as left |

The encounter `isEmpty()` ignores the settings (`encounter-state.js:58-60`). Thus a change of tier or name on an empty encounter is not stored. This is existing behavior.

### 5.4 Risk to stored data

The autosave holds the loaded encounter instead of the previous one (intended, C4). A page removes a key only when it wrote or restored that key. A page with an empty state that never wrote the key cannot delete the work of another tab or of the old site. The start writes nothing.

## 6. Group C: number inputs and the player rows (C6, C7, D1)

### 6.1 Findings

**C6 (S2). The Players input is not validated.** Evidence (`p-playersEmpty.out`): with an Adversary in the encounter, clear the Players box. `parseInt('')` is `NaN` (`encounter-tab.js:30`). `calculateMaxWounds` (`encounter-state.js:681`) gives `NaN`, the row shows `W: NaN/NaN`, the autosave stores `null`, and after a reload the threat shows as dead. A count of 0 or less removes every player character (`encounter-tab.js:151-154`, not run in the audit). Root cause: no range or `NaN` check.

**C7 (S2). Typed counts make long renders, and the count is stored.** Evidence: Players 20000 renders 20000 rows in 1692 ms (`p-playersBig.out`). An add quantity of 20000 makes 20000 individuals, an 11 s render and a 4.5 MB autosave (`p-quantityBig.out`). `max="10"` and `max="20"` are not enforced. Root cause: no bound on counts from inputs.

**D1 (found in this design, S2). A lower player count deletes player characters at render.** `renderPlayerCharacterInputs` (`encounter-tab.js:150-154`) removes each player character above the count. Lower the count from 5 to 4, and player 5 with its notes and initiative is gone. The action does not name the player (G2). After the load clamp of E1, the same loop would delete each stored player above 10 at the start.

### 6.2 The input rule

`BestiaryCheck.readIntegerInput(input)` returns an integer, or `null`. It reads `input.value`, `input.min` and `input.max`. The value must match `/^-?\d+$/` after a trim and must be inside the declared `min` / `max`. An attribute that is absent or `''` sets no limit. **[Design agent]** Only integers pass, because no input declares a `step`, so the browser treats a fraction as invalid. Cost if wrong: a user cannot type `2.5`. No input value of this app is a fraction.

| Input | File:line (handler) | Declared | After |
|---|---|---|---|
| Players `#encounter-players` | `index.html:249` (`encounter-tab.js:29`) | 1-10 | A valid value updates the count. Else the count stays, and the box shows the stored count. |
| Initiative, player rows | `encounter-tab.js:131`, `:141` (`:181`) | 0-99 | `''` clears the initiative (existing). A valid value sets it. Else the value stays, and the box shows it. On an empty row, an invalid value creates no player. |
| Initiative, list rows | `:553`, `:587`, `:648`, `:681` (`:276`) | 0-99 | as above |
| Initiative, player detail | `:930` (`:942`) | 0-99 | as above |
| Add quantity, Threats tab | `threats-tab.js:477` (`:313`) | 1-20 | A valid value adds. Else nothing is added, and the box shows `1`. |
| Inject count, builder | `index.html:179` (`threat-builder-tab.js:122`) | 1-20 | as the add quantity |
| Count in the rename modal | `threat-builder-tab.js:1084` (`:1105`) | 1-20 | Else nothing is added, the modal stays open, and the box shows the count that the modal opened with. |
| Builder number fields (attributes, defence, resilience, wounds, conviction, resolve, speed) | `threat-builder-tab.js:287-503` (`:526-545`) | `min="0"`; wounds `min="1"`; no `max` | On `input`: a valid value is stored; else nothing changes. On `change`: the box shows the stored value. |
| Builder skill numbers | `:358`, `:370-378` (`:657`, `:684`) | `min="0"` | as the builder number fields |
| Split count | `encounter-tab.js:1097` | 1 to count-1 | No change. The handler validates (audit 3, "Checked and found correct"). |

**[Design agent]** A count that is not stored (add quantity, inject count) falls back to its default `1` instead of a stored value. Cost if wrong: a user who types 25 sees 1 and must type again.

**[Design agent]** The builder fields keep the `input` event, so the preview follows the typing. An invalid value during typing (for example an empty box) changes nothing; the `change` event then shows the stored value. Cost if wrong: one more listener per field.

### 6.3 The writers (G3)

- `EncounterState.updateSettings`: a `playerCount` that is not an integer in 1-10, or a `tier` that is not an integer in 1-5 (the five options of `#encounter-tier`), is ignored. The other keys apply.
- `setInitiative`, `setMobInitiative`, `setPlayerCharacterInitiative`, `setVehicleInitiative`: `''` or `null` stores `null`. A value whose `parseInt` is an integer in 0-99 stores it. Another value changes nothing.
- `addIndividual(threatId, quantity, asMob)`: a quantity that is not an integer in 1-20 returns `[]` and adds nothing.

The ranges come from constants of `BestiaryCheck` (`PLAYER_COUNT_MIN`, `PLAYER_COUNT_MAX`, `TIER_MIN`, `TIER_MAX`, `ADD_COUNT_MAX`, `INITIATIVE_MAX`). A test compares them with the `min` / `max` that the inputs declare (plan Task 1).

### 6.4 The player rows (D1)

`renderPlayerCharacterInputs` draws `Math.max(playerCount, playerCharacters.length)` rows. It no longer removes a player. A row whose index is not less than the count holds a stored player. It gets the class `player-character-row--extra` and the mark text "Above player count". Its `×` removes that player and does not change the count. The `×` of the other rows works as today. **[Design agent]** Cost if wrong: the user sees more rows than the count, and must remove the extra players with `×`. §11 asks the owner.

The count still drives the Adversary bonus (`calculateMaxWounds`), as today.

### 6.5 Risk to stored data

A stored value outside a range stays as stored (G1), except the player count (E1). A stored initiative of 150 stays and shows. A stored builder wounds of `-3` stays, and the threat shows as dead at once (existing, audit 3 S4). The user can now only type a value inside the range.

## 7. Group D: Add to Encounter after a reload (C8)

### 7.1 Finding

**C8 (S2).** Evidence (`p-builderStaleId.out`): make a threat with wounds 5, Add to Encounter, change wounds to 12, reload, Add to Encounter again. The result is `[[id,5,0],[id,12,0]]`: both entries use the same id, and the first entry now shows wounds 12 with max wounds 5. Root cause: `injectIntoEncounter` (`threat-builder-state.js:377`) gives a new id only when `_lastInjectedSnapshot` is set. `loadFromAutoSave` (`:553`) and a page reload set it to `null`. `DataLoader.injectThreat` then replaces the record that the first entry uses. The same path exists for `loadThreatFromFile` after a reload, and for Import Threat of two versions of one `.threat` file.

### 7.2 Correction

- `BestiaryCheck.sameThreatData(a, b)` compares two threat records as JSON with sorted keys and without `id`. **[Design agent]** Sorted keys, because a record from storage and a record from the builder can have their keys in a different order. Cost if wrong: none for the data; a false "different" gives one more id.
- `injectIntoEncounter`: after the name override, `const held = DataLoader.getThreat(data.id)`. If `held` exists and `!BestiaryCheck.sameThreatData(held, data)`, give `data` and `this.threat` a new id. Then inject and add as today.
- `wouldCauseNameCollision` uses the same test instead of the snapshot: a collision is a held record with different data, and an encounter entry whose threat has the same name. **[Design agent]** The rename prompt then works also after a reload. Cost if wrong: the prompt can show in a case where it did not show before (a changed threat after a reload).
- `_lastInjectedSnapshot` is then unused. Its declaration and its four writes are removed (`:33`, `:169`, `:309`, `:382`, `:553`).
- `handleImportThreat`: after the id rule of §4.6, the same test gives a new id when the cache holds a different record with that id.

The encounter load (`loadFromData`) still replaces a record with the same id. The loaded encounter replaces the whole encounter, so no entry of the old encounter uses the old record.

### 7.3 Risk to stored data

None for existing saves. A changed threat gets a new id, so each entry keeps the data it was made with.

## 8. Group E: escapes (C1, C2, C3 and the three unchecked items)

### 8.1 Findings

**C1 (S1). Script from an imported file runs.** Evidence (`xss.out`, `xss2.out`, with the marker `<img src=x onerror=...>` in each field): script ran from the name, keywords and tier values in the Threats list (`threats-tab.js:157-199`); from nearly each field in the threat card (`:364ff`) and the builder preview (`threat-builder-tab.js:735ff`); from the encounter detail (`encounter-tab.js:971-1020`, `:1236-1398`); and from the notes of an individual, a mob and a player (`:1020`, `:1105`, `:936`), where a `</textarea>` closes the box. The builder number inputs (`value="..."`) break out of the attribute. Root cause: `threats-tab.js` has no escape, and the encounter and builder templates put threat strings and notes raw into `innerHTML`.

This design found more sinks of the same kind (probe `probe1.js` of the design session, headless, on the base tree):

- The **Browse** pickers of the builder (`threat-builder-tab.js:948-958`, `:1012-1021`) run script from a custom ability or bonus name, the stats and the threat name. `stripHtml` (`:1230-1234`) assigns the description to `innerHTML` of a new `div`. The browser loads an `<img>` in such a `div` also when it is not in the page, so the `onerror` runs.
- The **template search** of the builder (`:157-159`) runs script from the name and the source.
- The **Copy** button of the threat card (`threats-tab.js:776-779`, `:789-792`) runs script from an ability or bonus description in the same way as `stripHtml`.

**C2 (S1). A player name escape does not escape `"`.** Evidence (`xss2.out`): `value="${this.escapeHtml(pc.name)}"` (`encounter-tab.js:129`) uses a DOM helper (`:215-219`) that does not escape `"`. A `.players` file runs a focus handler. A typed `Bob "Big" Smith` shows as `Bob ` after the next redraw, and the next edit stores the cut name. Root cause: a text escape in an attribute.

**C3 (S2). Notes with an entity change on the next edit.** Evidence (`p-notesEntity.out`): stored `HP &lt;5 then flee`, the box shows `HP <5 then flee`, and one key press stores `!HP <5 then flee`. Root cause: the notes go raw into a `<textarea>` (`:936`, `:1020`, `:1105`), and the box decodes the entity.

**C3, second cause (found in plan review 1, P5).** The HTML parser drops one line feed directly after a `<textarea>` start tag. A note that starts with a line break (`"\nfirst line"`) thus reads back as `first line` after a redraw, and the next key press stores it so. The escape alone does not correct this. The builder textareas (`threat-builder-tab.js:226`, `:431`, `:470`) have the same defect. Correction: each template writes one `\n` directly after each `<textarea …>` start tag, before the escaped value. The parser drops that `\n`, so the box holds the stored value exactly. Sites: `encounter-tab.js:936`, `:1020`, `:1105` (plan Task 8) and `threat-builder-tab.js:226`, `:431`, `:470` (plan Task 7).

### 8.2 The shipped text holds no markup

A scan of `data/threats.json` in this design session: 0 HTML tags, 0 entities and no stray `<` or `>` in any string field. 73 strings hold a bare `&` (for example the source "Threat Assessment: Daemons & Heretics"). Many hold `'` or `"`. The HTML parser makes the same text node from a raw `&` and from `&amp;`, and from a raw quote and from its entity. Thus an escape of each threat string in text context gives the same DOM for each shipped threat. **[Design agent]** All threats get the escape, not only custom threats. No shipped text depends on markup. Cost if wrong: none for the shipped data (the plan's DOM comparison proves it); a custom threat that holds markup now shows the markup as text, which is the C1 ruling.

The Copy text and the pickers no longer parse a description as HTML. They use the string as it is. For the shipped data this gives the same text, because no shipped string has a tag or an entity. `stripHtml` is then unused and is removed.

The glossary enhancement (`glossary.js:553-579`) reads the `innerHTML` of an element and adds term spans by a regular expression. After the escapes, that `innerHTML` holds only text, `&amp;`, `&lt;`, `&gt;` and `&nbsp;`. No glossary term is `amp`, `lt`, `gt` or `nbsp` (591 names checked; plan Task 6 tests the term map). A term span wraps only text. Thus `glossary.js` needs no change.

### 8.3 Helpers

**[Controller ruling, 2026-11-15, CB7]** No value is escaped two times. In each view, a custom name `A & "B" <C>` reads back as typed (`textContent` in the browser; one escape level in the HTML string of a unit test). The DOM comparison finds a double escape only in shipped text, so the plan adds this check for custom values.

- `ThreatsTab.escapeHtml(value)` (new, at the end of the object) and `EncounterTab.escapeHtml(value)` (new body for `:215-219`): `null` and `undefined` give `''`; another value is `String(value)` with `& < > " '` replaced by `&amp; &lt; &gt; &quot; &#39;`. A number such as `0` prints as `0`. The new body of the encounter helper corrects C2 at `:129` and keeps each existing caller.
- `ThreatBuilderTab` keeps its `escapeHtml` (DOM, text and `<textarea>` context) and `escapeAttr` (`:1226-1228`, double-quoted attributes).
- `ThreatsTab.renderMobEntries(list)` (new, B6, §9) is used by the threat card. The mini card has its own list markup (§9).

### 8.4 Coverage and method

Covered: the four files whose renders take threat, encounter or input values (`threats-tab.js`, `threat-builder-tab.js`, `encounter-tab.js`, `glossary.js`), plus `app.js`, `settings-tab.js` and `vehicles-tab.js`. Method: a `grep -n '\${'` of each line without an escape call (95, 101 and 196 lines in the first three files), a grep of `innerHTML`, `insertAdjacentHTML`, `outerHTML` and `document.write`, then a read of each render function. Each `${…}` was traced to its source: a threat record, an encounter entry, a file, an input, the shipped data by a lookup, a constant, or code.

**[Design agent]** The rule for the implementer is simpler than a class for each site: each interpolation of a value from a threat record, an encounter entry, a file or an input gets the escape of its context, also when the check makes it a number. The exceptions are constants, loop indexes, glossary keys, values that code computes from numbers (bar widths, `.length` counts, the mob attack bonus), and shipped data that a lookup finds (vehicles, threat weapons, the weapon picker). Cost if wrong: more escape calls than the minimum.

### 8.5 Site groups that change

| # | File:lines | Function | Values | Task |
|---|---|---|---|---|
| T-1 | `threats-tab.js:162-169` | `renderThreatList` | `data-threat-id`, name, keywords | 6 |
| T-2 | `:190`, `:198` | `renderTierBadges` | tier level | 6 |
| T-3 | `:372-373`, `:413`, `:421-424`, `:429` | `renderThreatCard` | keyword text, name, quote, attribution, source and page (`formatSourcePage`), description | 6 |
| T-4 | `:478` | `renderAddToEncounterHeader` | `data-threat-id` | 6 |
| T-5 | `:500`, `:506` | `renderTierThreatTable` | tier keys and values | 6 |
| T-6 | `:531`, `:546-547`, `:564-566`, `:579` | attributes, resilience, combat stats, skills | values and notes | 6 |
| T-7 | `:596`, `:599`, `:603`, `:609-610` | `renderAbilities` | stats, description, type, name | 6 |
| T-8 | `:639-640`, `:658`, `:670`, `:688-691` | bonuses, determination, `renderTextSection` (+B6), bottom stats | names, texts, values | 6 |
| T-9 | `:776-779`, `:789-792` | `buildThreatCopyText` | descriptions: plain text, no DOM parse | 6 |
| B-1 | `threat-builder-tab.js:158` | `renderTemplateDropdown` | `data-id`, name, source | 7 |
| B-2 | `:287`, `:303`, `:311`, `:330`, `:334`, `:358`, `:370`, `:374`, `:378`, `:495`, `:499`, `:503` | editor sections | `value="…"` of the number fields and of the shock text field | 7 |
| B-3 | `:747`, `:761-765`, `:770` | `renderPreviewCard` | keywords, name, source and page, quote, attribution, description | 7 |
| B-4 | `:924-956` | `renderAbilityPickerItems` | type (text and `data-type`), name, threat name, description text (no `stripHtml`) | 7 |
| B-5 | `:1016-1020` | `renderBonusPickerItems` | name, threat name, description text (no `stripHtml`) | 7 |
| B-6 | `:1084` | `showInjectModal` | count value | 7 |
| B-7 | `:1230-1234` | `stripHtml` | removed (unused after B-4, B-5) | 7 |
| N-0 | `encounter-tab.js:215-219` | `escapeHtml` | new body (C2) | 8 |
| N-1 | `:128-143` | `renderPlayerCharacterInputs` | `data-id`, initiative value | 5a (with D1) |
| N-2 | `:549-694` | `renderPlayerItem`, `renderIndividualItem`, `renderMobItem`, `renderVehicleItem` | ids in `data-*`, initiative values, bonus class, wound, shock and ruin numbers | 8 |
| N-3 | `:931`, `:936` | `renderPlayerDetail` | initiative value, notes (C3) | 8 |
| N-4 | `:1020`, `:1105` | individual and mob notes | notes (C3) | 8 |
| N-5 | `:971-1013` | `renderIndividualDetail` (except `:1020`) | threat name, bonus, numbers, ruin, mob name | 9 |
| N-6 | `:1055`, `:1085-1086` | `renderMobDetail` (except `:1105`) | mob name, ids, threat name (C10 guard), numbers | 9 |
| N-7 | `:1155` | `renderVehicleDetailPanel` | stored wounds | 9 |
| N-8 | `:1205-1226` | `renderMobMemberItem` | ids, threat name (C10 text), numbers | 9 |
| N-9 | `:1236-1396` | `renderThreatCardMini` | each threat value (+B6) | 9 |

### 8.6 Sites that stay safe with no change

- `settings-tab.js:20-23` prints source names raw, but `SettingsTab.init` runs before `checkAutoSave` (`app.js:111`, `:123`), and the buttons are not drawn again. Thus only shipped sources reach it.
- `glossary.js:449-458` (the popup) prints only glossary and compendium data, found by the name of a clicked term. A custom threat gives only the text that the term regular expression matches, and that text is escaped (§8.2).
- `vehicles-tab.js` reads only shipped vehicles. The encounter finds a vehicle by its id, and an unknown id shows "Unknown vehicle".
- The weapon and ammo pickers (`encounter-tab.js:1578-1876`) and the additional weapon section (`:1424-1479`) print shipped weapons. An unknown weapon id shows "Unknown weapon".
- Each notification uses `textContent` (`threats-tab.js:340`, `threat-builder-tab.js:1138`, `encounter-tab.js:2064`). The encounter name is set by `.value` (`:104-108`). The count lines use `textContent`.
- The deep link (`app.js:136-154`) passes the hash to lookups only (audit 3, `hash.js`).

### 8.7 The three items that audit 3 did not check

- **Hover and pin popups on custom text.** The popup content is shipped data (§8.6). The anchor is a term span inside escaped text. Plan Task 2 hovers and clicks a term inside a hostile description and asserts no script and no injected element.
- **The Browse pickers.** They were sinks (§8.1). Group B-4, B-5 corrects them.
- **The mobile slide-up views.** `BottomSheet.open` (`app.js:12-20`) calls the same render functions as the desktop (`threats-tab.js:221`, `encounter-tab.js:715`, `:874`, `threat-builder-tab.js:111`). The escapes thus cover them. Plan Task 2 runs the hostile views also at a width of 390 px.

### 8.8 Proof

Plan Task 2 adds `scripts/browser-bestiary.js`. It runs headless Chromium against a static server that it starts itself.

- **DOM comparison.** For each shipped threat: the threat card, the encounter mini card, the builder preview of the template and the Copy text. Also the Threats list and both Browse pickers. Each is the browser's `innerHTML` after the glossary enhancement, with white space folded. A snapshot of the base tree is compared with the result. Expected: 0 differences, except the 11 threats of B6 (§9).
- **Hostile files.** An `.encounter`, a `.threat` and a `.players` file with a marker in each field and in each id. Each view, at 1400 px and 390 px: 0 script runs, 0 elements with the marker attribute (no attribute break-out), 0 injected `<img>` elements.

### 8.9 Risk to stored data

None. The escapes are at render. No stored string changes.

## 9. Group F: mob ability lists (B6)

**B6 (S2, audit 2, bestiary copy confirmed).** Evidence: `probe1.js` of this design session, headless, base tree. `renderTextSection` (`threats-tab.js:664-673`) and the mini card (`encounter-tab.js:1372-1384`) print `${text}`. For a list this gives `[object Object]`. 11 shipped threats hold a list: 8 in `mobAbilities` (`necron_warrior`, `triarch_praetorian`, `canoptek_wraith`, `lokhust_destroyer`, `fire_warrior`, `sniper_drone`, `gun_drone`, `kroot_hounds`) and 4 in `mobOptions` (`xv25_stealth_battlesuit_shasui`, `fire_warrior`, `pathfinder`, `kroot_carnivore`). The card and the mini card of each show "[object Object]", and the text of the abilities is not visible. Root cause: the render expects a string, and the data has two shapes.

Correction (code, not data):

- `ThreatsTab.renderMobEntries(list)` returns, for each entry, `<div class="bonus-item"><span class="bonus-name" data-glossary-enhance>NAME:</span> <span class="bonus-description" data-glossary-enhance>DESCRIPTION</span></div>`, with each value escaped. This is the markup of `renderBonuses` (`:637-642`). **[Design agent]** The card shows a mob ability list in the same form as the bonuses. Cost if wrong: a style change later.
- `renderTextSection(label, value)`: a string prints as today, escaped. An array prints the header and `renderMobEntries(value)`. An empty string or an empty array prints nothing.
- The mini card: a string prints as today, escaped. An array prints `<div class="mini-section"><div class="mini-section-label">LABEL</div><div class="mini-abilities">…</div></div>` with one `ability-mini` element per entry (name in `ability-name-mini`, description in `ability-desc-mini`), as the mini card prints the bonuses (`:1240-1246`, `:1351-1356`).

`mobActions` (1 threat, `lokhust_destroyer`) is not printed anywhere. That is a gap in what the app shows, not this defect (§12).

## 10. New controls

| Control | Where | Why |
|---|---|---|
| Mark "Above player count" on a player row | `encounter-tab.js`, `renderPlayerCharacterInputs`; one CSS class `player-character-row--extra` | D1 (G2): a stored player above the count stays visible with a mark. Its existing `×` is the Remove control. |
| Row text "Unknown threat (<id>)" | encounter list, mob detail | C10: a visible entry for an unknown id. The existing `×` is the Remove control. |

No other control is new. The error texts and the console warnings use existing paths.

## 11. Owner decisions

No rule of the game is in scope. Each range comes from a `min` / `max` that an input declares or from the options of a select. The book decides nothing here (G6).

One product choice is put here for the owner:

- **Players above the count (D1).** Today, a lower count deletes the players above it at once. G2 does not allow a silent delete. Recommended default (the plan implements it): the players stay, with the mark of §10 and their `×`. The other option is a confirm dialog that names the players before a lower count deletes them. That is a new dialog (G5), so it is not the default.

## 12. Parked findings

| Finding | Severity | Reason |
|---|---|---|
| A file with very many entries (for example 20000 individuals or players) renders slowly. | S3 | The input limits stop such a count from a typed value. A file can still hold it. A bound on the list render hides entries (G2), and paging is a feature (G5). |
| The autosave fails above the `localStorage` quota with only a console warning (`encounter-state.js:1044`). | S3 | Not reproduced. With the input limits, only a very large file reaches the quota. A visible message is a new control. |
| Two entries of one list with the same id (hand-made file). | S3 | No app writer makes it. Select and remove then act on the first entry. A repair needs a choice between the entries. |

The first version of this spec parked `glossary-tab.js:309` (a selector built from the hash id with no `CSS.escape`). **[Controller ruling, 2026-11-15, CB6]** Prove it or remove it. A headless check (`hashsel.js` of the design session) set ten hash values with `"`, `\`, `'`, `]`, `{}` and a line break. The URL encodes `"` as `%22` and drops the line break, and no `querySelector` call threw. The item is removed.

S4 items (listed only):

- A `.players` file does not keep the initiative (by design).
- A builder wounds value typed below 1 gave negative max wounds (audit 3). The input rule (§6.2) now refuses it. A stored value stays (G1).
- `mobActions`, `equipment`, `movement`, `mobBonuses` and `resilience2` of the shipped data are not printed anywhere.
- A tier outside 1-5 in a file stays (G1). The tier select then shows no option.

## 13. Audit findings that differ from their description

- **C1** missed four sinks: the two Browse pickers, the template search and the Copy button (§8.1). The audit marked the pickers "not verified".
- **C10**: the mob detail throws only when a free individual has the same unknown threat id. The throw is in the "Add Troops to Mob" list (`encounter-tab.js:1086`), not in the mob header.
- **C6**: the audit text "0 or negative deletes all PCs" is one case of D1. Any lower count deletes the players above it (§6.1).
- **C7**: the audit proposed "clamp at input only". The controller ruling also clamps the stored count at load (E1).
- **B6**: confirmed in the bestiary. The audit counted 8 threats for `mobAbilities`. `mobOptions` has the same defect for 4 more threats (11 threats in all, because `fire_warrior` has both).

## 14. What this spec does not prove

- No real `.encounter`, `.threat` or `.players` file from a user is on this machine. The no-op proof of plan Task 1 uses saves from the real writers and the 844 shipped threats as templates.
- The bestiary before the monorepo (the single-app repo) is not in this history. Older save shapes are known only from the readers that accept them (`round` absent, `vehicles` absent, `personalRuin` absent, the top-level `customThreats`). The check accepts each of them.
- The sink inventory of §8.5 comes from greps and reads of the files named in §8.4. A sink that a browser API outside the grep list makes was not searched. The browser proof of plan Task 2 tests the result, not the inventory.
- The DOM comparison covers the shipped threats, the Threats list and the Browse pickers. It does not cover the Glossary, Compendium and Vehicles tabs, which this work does not change.
- The real key shapes of the old single-app site were not read (its repo is not on this machine). The check accepts each shape that today's readers accept, and the ownership rule (§5.2) keeps a page with an empty state from deleting its key.
- The design session ran the audit scripts' cases only where §13 says so. The other evidence lines quote the audit files.
