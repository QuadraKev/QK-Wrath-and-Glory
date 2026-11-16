# Bug pass of the creator — Design

Date: 2026-11-15. Branch: `bug-pass-creator`. Base: `44084ae` (`main`).
Status: design, fix round 2 (plan review 1 and re-review 1, controller rulings CC1-CC18, owner decisions on Rank and Tier). Line references are to the tree at `44084ae`.

Marks used below:

- **[Owner, 2026-11-15]** is the owner's word.
- **[Controller ruling]** is a binding ruling of the controller (G1-G11, and the ruling for each finding).
- **[Design agent]** is a decision of the agent that wrote this spec. Each one gives the cost if it is wrong.

Book references give the book page (not the PDF page). The PDFs are read-only and are not in the repo.

## 1. The request

Owner's words **[Owner, 2026-11-15]**, after the character load check went live: "Let's do an overall pass for any bugs like those and clean them up in one go."

Two read-only audits of the creator found the defects A1-A24 (stored data and writers, a `vm` sandbox with the real files) and B1-B11 (a walk through the real page in headless Chromium). The audit files are session files. Thus each finding that this spec corrects has its evidence, its root cause and its correction in this spec (G10).

## 2. The rulings

- G1-G11 of the controller apply as written. This spec refers to them by number. The two that decide the most: **G1** (no harm to stored data; each exception is named) and **G2** (no silent delete through the UI).
- The controller's ruling for each finding is in force. Each group below repeats the ruling in short form.
- The controller's rulings CC1-CC18 on plan review 1 and its re-review are in force. A sentence that a ruling decides is marked **[Controller ruling CCn]**.
- **Rank 1 to 3 [Owner, 2026-11-15; Controller ruling CC11].** Owner's words: "To my knowledge, rank is only 1 to 3. If I'm incorrect, this is something we'll need to find proof for." Book: Core p.146: "Your Rank can't decrease, and can't go above the maximum of 3." A search of the official sourcebooks found no Rank above 3. §10.2 applies it.
- **Tier 1 to 5 [Owner, 2026-11-15; Controller ruling CC12].** Owner's words: "Tier should be able to go up to 5. It's only up to 4 in the base book, but Vow of Absolution expands the tier to 5." Books: Core p.19 ("There are 4 Tiers of play"); Vow of Absolution p.125, "Introducing Tier 5", and its Tier 5 archetypes (pp.41, 42).
- The rulings R1-R10 of the load check spec (`docs/superpowers/specs/2026-11-15-character-load-check-design.md` §3) stay in force. `CharacterCheck` stays the single place for type repair at load. This spec names two exceptions:
  - **E1 (R6, R10).** The load deletes `skills.choice`, `skills.choice1` and `skills.choice2` (§4.3).
  - **E2 (R8).** This pass adds load steps that are migrations: the id aliases (§9.2) and the `bonusType` repair that moves from two renders into the load (§11.2). It also adds two optional stored fields: `archetypeSkillChoices` (§4.4) and `ascensions[i].granted` (§6.3).

### 2.1 Named exceptions to G1

A load step changes a stored value only in these cases:

| # | Load step | Why G1 permits it |
|---|---|---|
| X1 | Delete `skills.choice`, `skills.choice1`, `skills.choice2` (§4.3) | Only a defect wrote them (A2). After §4.2, no reader needs them. |
| X2 | Replace an old id with its new id through the alias table (§9.2). For `aeldari_psychosensitive`, also add the sub-option `{ type: 'psychosensitive', optionId: 'psyker' }` when it is absent (CC1) | A migration that restores what the user had. The commit that removed each old id names the new id. The sub-option keeps the PSYKER keyword of the old species record. |
| X3 | Fill a missing `bonusType` of a background entry from the data (§11.2) | It restores what the user had. The same value is written today by two renders. |

No other load step changes a stored value. The old `ascensionPackages` key now stays (§8.1). A stored value outside a new limit stays (§12, §13).

## 3. Design summary

- `XPCalculator` gets the known names of the attributes and the skills, and one function `getBaseline(character)` that returns the free value of each attribute and skill. Each XP sum, each decrease limit, Reset Stats and each change of a parent use it.
- A change of the species or the archetype moves only the values at or under the old free value. A raised value stays (`State._withRebase(change)`). On a change of species, an attribute above the maximum of the new species goes down to that maximum (CC2).
- A grant of a power, a discipline or a talent is reference-aware. A package ascension entry records the ids that its grant step added, and its remove releases only those (CC3). A source with no entry (the archetype) takes out only what no other current source grants and what the user did not select. A free pick that no current slot covers stops being free (CC4).
- The stored Custom Archetype record survives a change to a standard archetype and a species change (CC7).
- One helper `State._remapWargearRefs` keeps each owned-item talent choice on its item when the wargear list changes order or length.
- `State.loadCharacter` gets three named load steps (§2.1). The old `ascensionPackages` key stays, and the Ascension tab shows it.
- Each list of the character shows an id that the data does not have as a visible row "Unknown <kind> (<id>)" with a Remove control. The sheet shows the same text with no control.
- Small guards: number setters (Rank 1-3, CC11), tracker getters, render loop bounds, the relic form, the threat Mob Abilities, the weapon range, the settings storage, a confirm after the file pick of Load.
- No new script file. No new CSS file. Task 1 of the plan bumps `?v=129` to `?v=130` on all 36 tags of `creator/index.html`. The data task bumps the creator data version from 47 to 48.

## 4. Group 1: skill and attribute baselines (A2, A3)

### 4.1 Findings

- **A2 (S2).** `setArchetype` writes NaN into `skills.choice`, `choice1`, `choice2`. Evidence: `data/archetypes.json` gives `inquisitorial_acolyte` the `skillBonus` `{ choice: 2 }` and `inquisitor` `{ choice1: 4, choice2: 4 }`. `state.js:363-366` does `Math.max(undefined, 4)`, which is NaN; JSON saves it as `null`. `resetStats` (`state.js:594-600`) iterates `Object.keys(skills)` and writes 2 or 4 into the same keys. No control assigns the free ranks to a real skill. The audit script `inq-prereq.js` shows the Inquisitor archetype ascension never met: `choice1 4 (have 0), choice2 4 (have 0)`.
- **A3 (S2 through the UI).** `xp-calculator.js:84-95` and `:104-111` iterate `Object.entries` of `attributes` and `skills` with no key filter and index the cost table with no range. Evidence (`f5.js`, `switch.js`): `skills.choice=9` gives NaN XP; after Reset Stats on the Inquisitor and a change to Ganger, skill XP is 40 for two phantom keys.
- Book check (G6). Core Rulebook p.94, Inquisitorial Acolyte: "Increase a Skill of your choice to 2". Core p.116, Inquisitor: "Increase any two Skills of your choice to 4". Thus the Inquisitor bonus applies to two different skills.
- Root cause: the data uses placeholder keys for "any skill", and each writer and reader treats each key as a skill name.

### 4.2 Correction: known names and one baseline

- `XPCalculator.ATTRIBUTE_KEYS` (7 names) and `XPCalculator.SKILL_KEYS` (18 names), in the order of `State.createNewCharacter()`.
- `XPCalculator.getBaseline(character) -> { attributes: {name: n}, skills: {name: n} }`. An attribute gets `max(1, species.baseAttributes[k], archetype.attributeBonus[k])`. A skill gets `max(0, archetype.skillBonus[k])` for a real skill name `k`. For each `skillBonus` key that is not a skill name, the skill that `character.archetypeSkillChoices[key]` names (§4.4) gets `max(current baseline, skillBonus[key])`. A choice value that is not a skill name has no effect (G3).
- `calculateAttributeXP` and `calculateSkillXP` sum over the known names only. A value above the table (attribute 12, skill 8) costs as the table edge. A value at or under the baseline costs 0. Thus an unknown key has no effect on a total, and no total is NaN.
- `resetStats` sets each known name to its baseline. It does not touch an unknown key. `decreaseAttribute` and `decreaseSkill` take their minimum from the baseline. The Stats tab computes its own decrease limits (`stats-tab.js:88-101` for attributes, `:186-201` for skills); they also take the minimum from `getBaseline`, so the "-" button of a chosen skill at its free value is disabled (P4).

### 4.3 Correction: the load deletes the phantom keys (X1, E1)

`State.loadCharacter` deletes `skills.choice`, `skills.choice1` and `skills.choice2` after `CharacterCheck.repair`. No warning: this is a migration, not a type repair. After §4.2 no reader uses these keys. Risk to stored data: these keys go from each save at the next save. They held `null`, `0`, `2` or `4`, and only the defect wrote them. The XP total falls where A3's phantom cost applied (to the correct value).

### 4.4 Correction: the "any skill" choice (new stored field, G7)

- New optional top-level field `archetypeSkillChoices: { <skillBonus key>: <skill name> }`. Example for the Inquisitor: `{ choice1: 'insight', choice2: 'scholar' }`.
- `setArchetype` sets it to `{}` together with `archetypeKeywordChoices` (`state.js:353`). It is absent in `createNewCharacter()`, so an old save loads with no change.
- New setter `State.setArchetypeSkillChoice(key, skill)`. It accepts `key` only when the current archetype has that `skillBonus` key and the key is not a skill name. It accepts `skill` only when it is a skill name that no other key of the same archetype holds (Core p.116: "any two Skills"), or `''` to clear. It stores the choice inside `_withRebase` (§5.2). Thus the chosen skill rises to the bonus value, and a skill that loses the choice goes back to its free value when the user did not raise it.
- `CharacterCheck` row (G7): optional; a value that is not a plain object becomes `{}`; each value that is not a string becomes `''`. This is the rule of `archetypeKeywordChoices` (row 22).
- The chosen skill is the free baseline for the XP cost and for the decrease limit (§4.2). With no choice, the character pays nothing extra and gets no free rank.
- UI (G5): the archetype detail gets one select per "any skill" key, in the pattern of the sub-faction keyword select (`archetype-tab.js:273-341`). Label: "Skill of your choice (<value>)". The first option is "-- Select a skill --". `formatBonuses` writes a `choice*` key as "Skill of your choice <value>" instead of "Choice1 4".
- Archetype ascension prerequisite (`ascension-tab.js:474-484`). **[Design agent]** The ruling says the prerequisites `choice1` / `choice2` use the chosen skill. That cannot work as written: the stored choice belongs to the character's own archetype, and the prerequisite belongs to the target archetype of the ascension. The nearest design: the prerequisite counts the "any skill" keys of the target archetype. It is met when the character has that number of different real skills at the value or more. Text when unmet: "Skills of your choice: 2 at 4 (have 1)". Cost if wrong: the owner wants a skill pick for the ascension; then one more select is needed. No stored data depends on this text.

### 4.5 Risk to stored data

None at load except X1. A character with a raised skill and an Inquisitor archetype keeps the raised value. When the user selects that skill as the choice, the XP cost of the free ranks goes away.

## 5. Group 2: a change of a parent (A4, A5, A6, A7b)

### 5.1 Findings

- **A4 (S2).** A change of the archetype keeps the free values of the old archetype and charges XP for them. Evidence: `archetype-tab.js:138-140` calls only `State.setArchetype(id)`. `state.js:355-367` raises with `Math.max` and never lowers. `switch.js`: `tech_adept spent 22`, then Ganger `spent 24 (ganger alone = 2)`.
- **A5 (S2).** A change of the species with no archetype keeps the old base attributes. Evidence: `state.js:244-253` raises with `Math.max`, and the reset runs only `if (this.character.archetype.id)`. `switch.js`: Ogryn then Human gives attribute XP 70.
- **A6 (S1).** A click on the selected species card (no sub-options) wipes the archetype, the stats and the powers. Evidence: `species-tab.js:118-127` returns early only for a species with `subOptions`. `reclick.js`: Wyrd with willpower 4 goes to no archetype, willpower 1, no powers.
- **A7b (S1).** A second click on Custom Archetype resets `customArchetype` (`state.js:425`). `custom-arch.js` shows the empty record.
- Found while designing (same root as A4). Today a species change resets all stats, raised values too (`setSpecies` -> `clearArchetype` -> `resetStats`). `setCustomArchetype` also calls `resetStats` (`state.js:452`).
- Root cause: `setArchetype` assumes a fresh character; the other parent changes reset everything; no setter has a same-id guard.

### 5.2 Correction

- One helper, one name in both documents: `State._withRebase(change: () => void)`. It reads `XPCalculator.getBaseline(this.character)` (the old baseline), calls `change()`, then reads the new baseline. For each known attribute and skill: a value at or under the old free value goes to the new free value. A value above the old free value stays, but never under the new free value (`Math.max`). **[Design agent]** The ruling says a raised value "stays". A raised value under the new free value goes up to it, as `setArchetype` does today. Cost if wrong: none to XP; the user sees a higher free value.
- Species maximum **[Controller ruling CC2]**: on a change of species, after the rebase, each attribute above `attributeMaximums[k]` of the new species (default 8, the rule of `increaseAttribute`) goes down to that maximum, and the XP total follows. Book: Core Rulebook p.25, "Species Maximums": "Your base Attribute Rating, before bonuses, can not exceed the value listed in the Table." A value above the maximum is not a legal character, and today's code resets the full stat block in this case, so the clamp loses less than today. No mark and no new control. The species data has no skill maximum (each species uses the skill maximum 8 of Core p.25), so the clamp applies to attributes only. Cost if wrong: a user who selects a species by mistake and goes back buys the points above the other maximum again; the XP is free again, so the cost is some clicks.
- `setArchetype(id)`: returns with no change and no notify when `id` is the current archetype id (A6 pattern, A7b). Else: the grant ids of the old archetype (§6), then `_withRebase` around the archetype write and the reset of `archetypeKeywordChoices` and `archetypeSkillChoices` to `{}`, then the grants (§6). The stored `customArchetype` record stays (CC7).
- `setSpecies(id)`: returns with no change when `id` is the current species id (A6). Else: when an archetype is set, `clearArchetype()` first (today's rule: a species change clears the archetype selection, see D3). Then `_withRebase` around the species write, then the species maximum clamp. Two steps compose: a value at the old free value of species plus archetype ends at the free value of the new species; a raised value stays unless it is above the new maximum.
- `clearArchetype()`: the old grant ids (§6), then `_withRebase` around the write `archetype = { id: null, xpCost: 0 }`, then the grants (§6). It no longer calls `resetStats`, and it no longer resets the `customArchetype` record **[Controller ruling CC7]**. The record does not depend on the species: the ability archetype list (`archetype-tab.js:360-363`) filters by source only, the keywords are free text, and the starting wargear budget depends on the tier (`state.js:412-418`). So a species change clears only the selection.
- A kept record has no effect while the archetype is not `custom` **[Controller ruling CC14]**. Each reader of the record was searched (`grep customArchetype` in `creator/`). The readers in `derived-stats.js:182`, `xp-calculator.js:186`, `:236`, `prerequisite.js:201`, `state.js:1580`, `app.js:417`, `character-sheet-tab.js:340`, `:1513`, `:2003` already test `archetype.id === 'custom'`; the budget functions `getWargearBudgetUsed` and `canAddCustomWargear` are called only from the custom view of the Archetype tab. One reader has no test: `prerequisite.js:225-227` adds `customArchetype.keywords` to the keywords of each character. It gets the same test. Evidence (re-review Q1): custom keyword PSYKER, then Ganger, gives `isPsyker() === true` on today's code.
- The starting items of a kept record **[Controller ruling CC16]**: the record lists its starting items in `customArchetype.wargear`, and each has an entry with `isStarting: true` and no overlay. The once-only count of §7.5 and `getOldStartingEntries` of §7.4 leave out, for each id, as many of the first such entries as the kept record lists. Thus the record and the wargear list agree after each of these sequences: Custom, a standard archetype, Custom; Custom, a species change, Custom; Custom, a standard archetype, Add Starting Wargear, Custom. CC7 is not narrowed.
- `setCustomArchetype()`, final statement order (Tasks 3, 5 and 6 write it together):
  1. guard: return with no change and no notify when the archetype is already `custom` (A7b) [Task 3];
  2. `const oldGrants = this._archetypeGrantIds()` [Task 5];
  3. `const drop = this.getOldStartingEntries()` [Task 6];
  4. `this._withRebase(() => { this.character.archetype = { id: 'custom', xpCost: 0 }; })` [Task 3]; no reset of the stored `customArchetype` record (CC7: Custom, then a standard archetype, then Custom again keeps the name, the keywords and the ability);
  5. `this._releasePowerGrants(oldGrants)` and `this._applyPowerGrants(<grants of the kept ability archetype>)` [Task 5];
  6. remove the `drop` indices and call `_remapWargearRefs` [Task 6];
  7. `this._settleFreePicks()` [Task 5];
  8. `this.notifyListeners('archetype')`.
- Reset Stats (Stats tab) keeps its meaning: each known value goes to the baseline.

### 5.3 What changes for the user

- A species change and an archetype change keep each value that the user bought above the old free value. Today a species change and Custom Archetype reset them. A user who wants the old reset uses Reset Stats.
- A species change lowers an attribute above the maximum of the new species to that maximum.

### 5.2a Data values corrected from the book (CC15)

The clamp of CC2 and the increase limit (`state.js:608`) read `attributeMaximums` of `data/species.json`. The table "Attribute Rating Maximums by Species" of Core Rulebook p.25 (read as an image) was compared with the data for each of its five species (Human, Ork, Aeldari, Adeptus Astartes, Primaris Astartes). Human, Adeptus Astartes and Primaris Astartes agree. Three values differ, and Task 8 corrects them:

| Species (data id) | Attribute | Old value | New value | Page |
|---|---|---|---|---|
| Ork (`ork`) | Strength | 10 | 12 | Core p.25 |
| Ork (`ork`) | Toughness | 10 | 12 | Core p.25 |
| Aeldari (`aeldari`) | Strength | 8 | 7 | Core p.25 |

The table also has a Speed row; the data has no speed maximum, so that row was not compared. A stored Aeldari Strength 8 stays until the user edits it or changes the species (G1); the Stats tab then shows no "+" for it. The species of the other books were not compared (§17). Cost if wrong **[Controller ruling CC15]**: an erratum that the PDF does not hold; the change is three numbers in one data file.
- A click on a selected card does nothing.
- The Custom Archetype record (name, keywords, ability, starting wargear list) comes back when the user selects Custom Archetype again.

### 5.4 Risk to stored data

None at load. Only future clicks change. A bought value above the old free value stays, except above a species maximum (CC2). A bought value equal to the old free value is lost (P17): for example, a Human buys Strength 3, selects an archetype with Strength 3, then selects Ganger; Strength goes to 1. The rule cannot tell a bought point from a free point at the same value. §17 lists this.

## 6. Group 3: reference-aware grants (A8, and the power part of A4)

### 6.1 Findings

- **A8 (S1).** The remove of an ascension package removes the archetype's own Smite and a discipline that the user chose. Evidence: `_applyAscensionEffects` skips a power that the character has (`state.js:1345-1354`); `_removeAscensionEffects` removes it with no condition (`:1399-1413`), and the same for disciplines (`:1415-1423`). `ascpow2.js`: Wyrd plus add and remove Psychic Revelations leaves `powers [] free []`. `ascpow.js`: a chosen Runes of Fate goes after Lost Upon the Seer Path is added and removed.
- **A4 (power part).** `switch.js`: Wyrd then Ganger keeps `["smite"]` free.
- Found while designing (G2). `setArchetype` to a psyker archetype empties `psychicPowers`, `freePowers` and `unlockedDisciplines` (`state.js:373-376`). `setCustomArchetypeAbility` does the same (`:469-471`, `:484-486`). `clearArchetype` does the same (`:400-402`). Each one deletes powers that the user bought and disciplines that the user chose, with no notice.
- Plan review P8: Farseer and Shadowseer free picks include Divination, and `lost_seer_path_aoa` grants `prescience` and `scriers_gaze` (Divination). Without a record, the remove of the package removes a free pick that the user selected.

### 6.2 The grant paths

| # | Source | What it grants | Where it is written today |
|---|---|---|---|
| P1 | Archetype `psykerConfig.grantedPowers` | powers, free | `state.js:379-386` |
| P2 | Custom Archetype ability archetype `psykerConfig.grantedPowers` | powers, free | `state.js:474-481` |
| P3 | Package `psykerConfig.grantedPowers` (Psychic Revelations: Smite) | powers, free | `state.js:1345-1355` |
| P4 | Package `powersGranted` (Lost Upon the Seer Path) | powers, free | `state.js:1358-1368` |
| P5 | Package `talentsGranted` (Dauntless Reputation: Devotees) | talent with `ascensionGranted: true` | `state.js:1332-1342` |
| P6 | Package `disciplinesUnlocked` (Lost Upon the Seer Path) | discipline | `state.js:1371-1378`; also read at render by `getUnlockedDisciplines` (`:1635-1644`) |
| P7 | Archetype and package `psykerConfig.unlockedDisciplines`, talents `warped_mind` / `tormented_manifestation_aoa`, the universal abilities | read at render only | `getUnlockedDisciplines`, `UNIVERSAL_ABILITY_IDS` |

An archetype ascension (type `archetype`) grants nothing to the stored lists. P7 stores nothing, so it needs no change. Only a package ascension has an entry that can hold a record (P3, P4, P5). The archetype and the ability archetype (P1, P2) have no entry.

### 6.3 Correction

- New optional stored field on a package ascension entry **[Controller ruling CC3]**: `granted: { powers: string[], freePowers: string[], talents: string[] }`. It holds the ids that the grant step of this entry really added to `psychicPowers`, to `freePowers` and (as an `ascensionGranted` talent) to `talents`. `_applyAscensionEffects` writes it for each package entry whose package the data has, also when the three lists are empty. `setAscension` never copies `granted` from its `data` argument. `CharacterCheck` row (G7): optional; a value that is not a plain object is deleted (path `ascensions[i].granted`); each of the three keys is an optional list of strings, and an entry that is not a string is dropped.
- New helper `State._archetypeGrantIds() -> string[]`: P1, or P2 for a custom archetype.
- New helper `State._grantedPowerIds(excludeEntry = null) -> Set<string>`: P1 or P2, plus P3 and P4 of each package ascension except `excludeEntry` (compare by identity).
- New helper `State._applyPowerGrants(ids) -> string[]`: for each id that is not in `psychicPowers`, push it to `psychicPowers` and to `freePowers`. It returns the ids it added. An id that is in `psychicPowers` stays as it is.
- New helper `State._releasePowerGrants(ids, excludeEntry = null)`: for each id that `_grantedPowerIds(excludeEntry)` does not hold and that is in `freePowers`, remove it from both lists. An id that another package entry still grants stays; **[Design agent]** the id then goes into the `granted` record of the first such entry that has a record ("adoption"), so the remove of that entry releases it later. Cost if wrong: without adoption, Wyrd plus Psychic Revelations, then Ganger, then the remove of the package leaves a free Smite with no source.
- Remove of a package entry: with a `granted` record, `_releasePowerGrants(granted.powers ∪ granted.freePowers, entry)` and, for each id of `granted.talents` that no other current package grants, remove the first `ascensionGranted` copy (or adopt it as above). With no record (a save from before this change), the no-record rule: P3 and P4 ids through `_releasePowerGrants(ids, entry)`, and P5 as above with the package's `talentsGranted`.
- `removePower(id)` also removes `id` from the `granted` record of each ascension entry (re-review Q3). Else a power that the user removed and then picked again as a free pick goes with the package. The Powers tab gives a remove control to a P4 power (`powers-tab.js:248`, `:274` mark only `psykerConfig.grantedPowers`).
- `setArchetype`, `setCustomArchetypeAbility`, `clearArchetype` and `setCustomArchetype` read the grant ids of the old source as their first statement after the guard, before the `_withRebase` write (re-review Q4), then release the grants of the old source and apply the grants of the new source. They do not empty the three lists. A source with no entry keeps the rule "no other current source grants it and the user did not select it".
- `_applyAscensionEffects`: P3 and P4 through `_applyPowerGrants` (record the result); P5 as today (record a talent that it adds); P6 is not stored any more (the render already reads it).
- New helper `State._settleFreePicks()` **[Controller ruling CC4]**: after each change of source (`setArchetype`, `clearArchetype`, `setCustomArchetype`, `setCustomArchetypeAbility`, `setAscension`), each id in `freePowers` that `_grantedPowerIds()` does not hold and that no `freePowerChoices` slot of `getPsykerConfig()` covers leaves `freePowers` and stays in `psychicPowers`. A slot covers the first `count` such ids, in the order of `freePowers`, whose discipline matches. The power stays visible and its XP is correct.
- **[Design agent]** A power that the user bought before a source grants it stays paid. Today `_applyAscensionEffects` makes it free. The rule needs this for a source with no entry (the archetype). Cost if wrong (P9): the user pays the XP of a power that a source also grants. To get it free, the user removes the power and then removes and adds the source again; for an archetype the same-id guard blocks a second click on the same card, so the user selects a different archetype first.
- **[Design agent]** P6 disciplines that an old save holds in `unlockedDisciplines` stay after the package goes. They show as chosen chips with a remove control (§9.3). Cost if wrong: one extra discipline chip for such a save.

### 6.4 What changes for the user

- Free picks, bought powers and chosen disciplines stay after an archetype change. They stay visible: the Powers tab and the sheet show stored powers and disciplines also for a character that is not a psyker (§9.4, §13.3).
- A free pick that no current slot covers stays as a paid power (CC4).
- A free pick that the user made before a package grants the same power stays after the remove of the package (the record holds only what the package added).

### 6.5 Risk to stored data

None at load. A save from before this change has no `granted` record; its packages keep the no-record rule. Only future clicks change, and they remove less than today.

## 7. Group 4: wargear index references and starting wargear (A7, A9 / B1, A10 / B2)

### 7.1 Findings

- **A9 / B1 (S2).** Removing a wargear entry leaves Trademark Weapon and Armour-Monger on the wrong item. Evidence: `wargear-tab.js:126-136` -> `state.js:791-799` splices with no remap. Talent choices store the index (`talents-tab.js:139-172`). Probe `p1-stale-index.js`: after Remove on the Knife, `Trademark Weapon (Laspistol)` and the +2 ED moves to the Laspistol; the Armour-Monger AR bonus goes.
- **A7 (S1).** Custom Archetype deletes each non-custom wargear entry, also holy relics and improvised items. Evidence: `state.js:432-438` keeps only `custom` entries; `custom-arch.js`: `["Oathkeeper","Boomstick","lasgun"]` becomes `[]`.
- **A10 / B2 (S2).** "Add Starting Wargear" stores ids that the data does not have; no tab shows them and no button removes them; each click adds all again. Evidence: `wargear-tab.js:437-450`; `starting.js`: unresolved by source `core 8/138, fspg 2/103, voa 5/52, aeldari 1/138, apocrypha 577/593`.
- Root causes: index references with no update on a splice; the keep rule of `setCustomArchetype` predates relics and improvised items; the add button does not check the id and has no once-only rule.

### 7.2 Stored index references

A search for each read of a wargear index in stored data (`_owned`, `wargearIndex`, `choice` in `creator/`) finds one kind only: the choice of a talent whose `choiceType` is `weapon_owned` (Trademark Weapon) or `armor_owned` (Armour-Monger). Readers: `derived-stats.js:575-590`, `talents-tab.js:314-326`, `character-sheet-tab.js:1664-1676`, `:1072-1088`. The editors of the relic, improvised and custom forms keep the index only while the modal is open; it is not stored.

### 7.3 Correction: one remap helper

- New helper `State._remapWargearRefs(newIndexOf)`, from the rule of `setCustomArchetype:439-450`. `newIndexOf(oldIndex)` returns the new index or `-1`. For each owned-item talent choice: an index that maps keeps its type (string or number) at the new index; an index that maps to `-1` becomes `null`; a choice that is not an index stays.
- Callers: `removeWargearByIndex`, `removeWargear` (no caller today; it changes the length, so it gets the helper too), `removeCustomStartingWargear`, `setCustomArchetype`, and the starting wargear removal of §7.4.
- `updateRelicWargear`: when the base item changes kind (weapon to armour, or the reverse), each owned-item choice on that index whose kind no longer matches becomes `null`.
- Display of a cleared choice (the ruling "a defined way"): the Talents tab and the sheet show "<talent name> (no item selected)". The sheet gives no Trademark bonus and no Armour-Monger bonus for it, as today for `null`. To select again, the user removes the talent and adds it again.

### 7.4 Correction: Custom Archetype keeps the user's wargear (A7)

- `setCustomArchetype` keeps each entry except the starting wargear of the old archetype. **[Design agent]** "Starting wargear of the old archetype" is: for each id of the old archetype's `startingWargear`, the total quantity `q` of that id (a plain-text entry counts 1, an object counts its `qty`, and the counts of repeated entries add up, P5), then the first `q` entries with that id, `isStarting === true` and no `relic`, `improvised` or `custom` overlay, after it leaves out the entries that the kept Custom Archetype record lists (CC16, §5.2). Thus an ascension wargear entry, a relic, an improvised item, a custom item and a bought item stay. Cost if wrong: an entry that the user wants to keep goes, but only behind the confirm below.
- New pure function `State.getOldStartingEntries() -> number[]` gives those indices. The Archetype tab asks a confirm before Custom Archetype when the list is not empty (G2: the action names what it removes): "Custom Archetype removes the starting wargear of <archetype name>: <names>. Continue?". Cancel changes nothing.
- A change between two standard archetypes keeps all wargear, as today (`state.js:369-370`).

### 7.5 Correction: Add Starting Wargear (A10 / B2)

- Both add buttons (`wargear-tab.js:437-451` for the archetype, `:454-470` for an archetype ascension) store an entry only when `DataLoader.getWargearItem(id)` resolves.
- Once-only rule: the click first adds up the quantity `q` of each id over the whole list (a plain-text entry counts 1, an object counts its `qty`; `death_cult_assassin` lists `death_cult_power_blade` twice, so `q = 2`, P5). Then it adds `max(0, q - n)` entries of that id, where `n` is the count of entries with that id, `isStarting === true` and no overlay, less the count of that id in the kept Custom Archetype record (CC16, §5.2; never below 0). A second click adds nothing.
- **[Design agent]** `n` counts each starting entry, so the archetype button and the archetype-ascension button (`wargear-tab.js:454-470`) count against each other for a shared id (P13). Example: `ministorum_priest` and an ascension to `death_cult_assassin` both list `laspistol` and `knife`; the second button adds no second copy. 153 same-faction pairs share a known id. Cost if wrong: the user adds the second copy from the wargear browser (a bought item, not marked Starting).
- The text of an entry that does not resolve stays visible in the archetype detail (`formatWargear`, unchanged) and in the starting wargear notice of the Wargear tab (unchanged).
- Data (`data/archetypes.json`). Of the 16 official-book ids that do not resolve, three have a real item under a different id. Each is checked against the book and against `data/`:

| Archetype | Old entry | New id | Evidence |
|---|---|---|---|
| `primaris_intercessor` | `ballistic_autoreliquary` | `ballistic_appeasement_auto_reliquary` | Core p.117 wargear: "Ballistic Appeasement Autoreliquary"; `equipment.json` item (core p.236) |
| `techmarine` | `servo_harness` | `astartes_servo_arm` | Vow of Absolution p.39 wargear: "Astartes Servo Arm"; old commit `eebe974` removed `servo_harness` as a placeholder |
| `striking_scorpion` | `mandiblaster` | `mandiblasters` | Old commit `eebe974`: "duplicate of mandiblasters; Aeldari p94 has only the plural" |

- The other 13 have no item in the data: book prose such as "any 2 Augmetics" (Core p.109), items with no definition in any book (old commit `c278f59`), or items that the old commit `9864ec6` removed as fabricated. They stay as text. The Apocrypha prose entries are parked (§16).

### 7.6 Risk to stored data

None at load. Already stale choices in a save stay as they are. Hidden starting entries in old saves stay; §9 makes them visible with a Remove control. The data change touches no save.

## 8. Group 5: ascensions (A1, A12, A13, B9)

### 8.1 A1: the old `ascensionPackages` key

- **A1 (S1).** Evidence: `state.js:144-145` merges the defaults, so `ascensions` is always `[]` and the migration at `:159` never runs; `:168-170` then deletes the old key. `f1.js`: `after load ascensions = [] has old key: false`. The body (if it ran) maps package k to `tier + k + 1`, which raises the effective tier. `scripts/test-load-check.js:166-187` asserts the loss.
- Old shape: an array of package id strings, no tier (Electron 1.0.0 and web `3b17bac` to `c744cd0`). All 21 old ids exist in `data/ascension-packages.json`.
- Correction **[Controller ruling]**: no automatic mapping. The load no longer deletes the key. The dead migration body (`state.js:158-173`) goes. `CharacterCheck` gives the key a type rule: optional list of strings; a non-array becomes `[]`; a non-string entry is dropped. The Ascension tab shows a notice when the list is not empty: the escaped package names (an id that the data does not have shows as the id), the sentence "These ascension packages come from an older version of the app. Select them again in the slots below.", and a button "Remove old package list" that calls the new setter `State.clearLegacyAscensionPackages()` (it deletes the key). The key costs no XP and has no effect.
- Not repairable: a save that one load and one save of the current app already wrote has lost the key. Only the user's original file still holds it.

### 8.2 A12 and A20 (see §9.6): an ascension with no slot

- **A12 (S2).** Evidence: `setTier` (`state.js:204-213`) does not touch `ascensions`; the slots are `tier` (creation, only when the archetype tier is lower) and `tier+1..5` (`ascension-tab.js:18-33`). `tier.js`: at tier 4 the slots are `[4,5]`, the stored entry is `[3]`, and its 30 XP stays.
- Correction (G2): the entry stays stored and keeps its cost and effects. The Ascension tab shows a block "Ascensions with no slot" before the slots and also before the tier 5 message (`:36-38`). Each row: the package or archetype name (or "Unknown ascension package (<id>)"), the text "Tier <n>. This ascension has no slot at the current Tier. Its XP cost and its effects stay until you remove it.", and a Remove button that calls `State.setAscension(n, null)` (the existing setter; it removes the effects).

### 8.3 A13: an empty slot raises the tier

- **A13 (S2).** Evidence: `ascension-tab.js:517-521` stores `{ type, packageId: null, archetypeId: null }`; `getEffectiveTier` (`state.js:1452-1457`) counts each entry. `asc-empty.js`: two empty radios raise the effective tier from 1 to 3, wounds from 3 to 7.
- Correction: `getEffectiveTier` counts an entry only when it has a `packageId` (type `package`) or an `archetypeId` (type `archetype`). Stored data does not change. Characters with empty entries show the correct, lower effective tier.

### 8.4 B9: the slot loop

- **B9 (S3).** `ascension-tab.js:27` starts at `startingTier + 1`. `p3.log`: tier -300000 renders in 3962 ms.
- Correction: the loop starts at `Math.max(1, startingTier + 1)`. The stored tier stays (G1).

### 8.5 Unknown ascension ids (A11)

A selected package or archetype id that the data does not have shows in its slot as "Unknown ascension package (<id>)" or "Unknown archetype (<id>)" with a Remove button (`State.setAscension(t, null)`).

### 8.6 Risk to stored data

Old saves keep `ascensionPackages` (today the load deletes it). This is the only change at load in this group.

## 9. Group 6: ids that the data does not have (A11, B2, B11, A20)

### 9.1 Findings

- **A11 (S2).** Old saves lose talents, powers and items silently. Evidence: `iddiff.js` (old web data `3b17bac` against today): 7 species ids, 6 talents, 3 armour, 14 equipment, 2 powers, 3 background origins. The readers skip an unknown id: `talents-tab.js:309`, `xp-calculator.js:123-126` (cost 0), `wargear-tab.js:72-75`.
- **B2 (S2).** `wargear-tab.js:72-75` hides an entry whose id does not resolve, so the user cannot remove it. Probe `p2-starting.js`: Rogue Trader stores 5 entries; the tab shows 4 Remove buttons.
- **B11 (S3).** `p4.log`: hidden with no remove control: talent, power, memorable injury, traumatic injury, mutation, mutation sub-choice, ascension archetype, keyword placeholder, ascension choice key, improvised base id. Shown raw: species sub-option, weapon upgrade, discipline, follower threat.

### 9.2 The 35 ids from the git history (X2)

Method: `git log -S'"<id>"' -- data/` in the old creator repo (`/root/projects/wrath-and-glory/wrath-and-glory-creator-web`) and in this repo. A rename needs evidence in the commit that removed the id **[Controller ruling]**.

Renamed (the alias table maps the old id to the new id at load):

| Old id | New id | List | Removing commit and its evidence |
|---|---|---|---|
| `daemonic_summoning_dh` | `daemonic_summons_dh` | talents | old `9864ec6`: "Fixed DH talent names ... Daemonic Summoning -> Daemonic Summons" |
| `embrace_the_gods_dh` | `eye_of_the_gods_dh` | talents | old `9864ec6`: "Embrace the God(s) -> Eye of the Gods" |
| `forge_the_sword_dh` | `forge_of_souls_dh` | talents | old `9864ec6`: "Forge the Sword -> Forge of Souls" |
| `one_or_more_allied_aeldari_or_drukhari_saga_of_majesty_aoa` | `saga_of_majesty_aoa` | talents | old `fad5e62`: "garbled ID/name ... Fixed ID, name" |
| `forceshield` | `force_shield_aeldari` | wargear | this repo `5506a1a`: "repoint the Autarch and Corsair Prince archetypes to the verbatim book entries (force_shield_aeldari, mistshield)". Stats change (P11): old `forceshield` AR 2, Power Field and Shield, Very Rare; `force_shield_aeldari` AR 3, Power Field, Unique |
| `mist_shield` | `mistshield` | wargear | this repo `5506a1a` (same). Stats change (P11): the old record had the trait Shield; `mistshield` has only Power Field (AR 2, Very Rare in both) |
| `mandiblaster` | `mandiblasters` | wargear | old `eebe974`: "duplicate of mandiblasters" |
| `aeldari_psychosensitive` | `aeldari` | species id | old `9864ec6`: "Consolidated Aeldari (Psychosensitive) into main Aeldari species". Same cost (10) and base attributes. The old record had the keywords `AELDARI, PSYKER`; today's `aeldari` gives PSYKER only through the optional sub-option `psychosensitive` / `psyker` (Core p.29: "Psychosensitive: You may choose to take the PSYKER Keyword."). So the alias step also adds `{ type: 'psychosensitive', optionId: 'psyker' }` to `species.subOptions` when it is absent (CC1) |

Removed (they show as unknown, §9.3): `precision_shooter`, `swift_attack` (fabricated, `9864ec6`); `skitarii_war_plate`, `tattered_robes`, `adept_robes`, `fine_clothing`, `disguise_kit`, `commissar_greatcoat` (fabricated, `9864ec6`); `ripped_clothes` (`87963b1`: not player equipment); `servo_harness`, `augmetics` (`eebe974`: placeholders); `company_standard`, `smoke_grenades`, `haywire_mine`, `ballistic_autoreliquary` (`c278f59`: no definition in any book); `heightened_senses` (`3350583`: not in the book); the sub-options `runes_of_battle`, `runes_of_fate`, `runes_of_fortune`, `bonesinging`, `phantasmancy` (`9864ec6`, removed with the psychosensitive species); `aeldari_craftworld`, `aeldari_outcast`, `aeldari_survivor` (`f23afe8`: fabricated origins); `minor_invocation`, `warpspeed` (see below).

- **[Design agent]** `minor_invocation` and `warpspeed` are classed as removed. Old commit `685e6a8` replaced each record in place with `malefic_invitation` and `warptime`, and calls this "6 completely wrong powers corrected". The old power did not exist in the book, so the alias would guess what the user wanted. Cost if wrong: the user sees two "Unknown power" rows and selects again. Listed in §15 Owner decisions.
- `ichor_injector` is not unknown: `data/weapons.json` still has it, and `getWargearItem` resolves it.
- The alias table: `State.ID_ALIASES = { talents: {...}, wargear: {...}, species: {...} }`. The load step maps a talent entry (string or `{ id }`), `wargear[i].id`, `customArchetype.wargear[i]` and `species.id`. It maps in place and keeps the order (talent choices store wargear indices). **[Controller ruling CC5]** A talent entry is not mapped when the list already holds the new id: a talent list cannot hold a non-repeatable talent two times, and a map would charge its XP two times (`xp-calculator.js:116-129`). The old entry then stays as an "Unknown talent" row with Remove, and costs 0 as today. Wargear can hold an item two times, so a wargear id is always mapped: a save that holds the old hidden id and a copy that the user added again shows two items (shields or mandiblasters), each with Remove.
- XP: an aliased entry costs what the new record costs, as it did when the user saved it. An unknown entry costs 0, as today (A11 (3)).

### 9.3 Correction: a visible row for each unknown id

Each list resolves against the full data: the getters of `DataLoader` do not filter by source, so a book that the user turned off does not make an id unknown. Each tab row has the text "Unknown <kind> (<id>)", escaped, and a Remove control. The existing remove setters do the work:

| List | Tab and site | Remove control |
|---|---|---|
| wargear | Wargear tab `wargear-tab.js:72-75`: a group "Unknown" | the existing `.btn-remove-wargear` (`removeWargearByIndex`) |
| weapon upgrades | owned weapon line `:166-169`; upgrade modal `:866-867` | the existing modal remove (`removeWeaponUpgrade`) |
| talents | Talents tab `talents-tab.js:308-309` | the existing REMOVE (`removeTalent` with the index), also for an `ascensionGranted` entry |
| powers | Powers tab `powers-tab.js:270-271` | the existing chip × (`removePower`) |
| disciplines | Powers tab setup `powers-tab.js:146-184`: chosen chips show whenever the stored list is not empty, also for a psyker archetype with `disciplineChoices: 0` (today `:146` hides them) and for a character with no PSYKER (§9.4) **[Controller ruling CC8]** | the existing × (`removeDisciplineChoice`) |
| background entries | Background tab selects `background-tab.js:65-90`: a selected, disabled option "Unknown origin (<id>)" | the select itself: "Select an Origin..." clears the entry |
| species sub-options | the selected species card `species-tab.js:81-100`: a row for a stored sub-option whose type or option the species does not have | a new Remove button (`removeSpeciesSubOption`) |
| ascension packages, ascension archetypes | Ascension tab (§8.5) | Remove (`setAscension(t, null)`) |
| memorable injuries, traumatic injuries, mutations | Injuries tab `injuries-tab.js:42-43`, `:87-88`, `:189-190` | the existing Remove buttons |
| follower threats | already shown raw with the existing Remove (`followers-tab.js`) | no change |

**[Design agent]** For the background entries, the select is the Remove control. A new button would duplicate the "Select ..." option. The unknown option is `disabled`, so a click on it cannot write `bonusType: null`. Cost if wrong: the owner wants a visible button; one button per select.

### 9.4 Powers of a character that is not a psyker

Today the Powers tab shows only an info box for a character without PSYKER (`powers-tab.js:45-54`), and the sheet hides the Powers tab and section (`character-sheet-tab.js:348`, `:1721`, `:2086`). The stored powers still cost XP (`xp-calculator.js:132-143`). After §6 this happens more often. Correction (G2: nothing that costs XP is hidden): when the stored `psychicPowers` hold an id that is not a universal ability, or `unlockedDisciplines` is not empty, the Powers tab shows the info box and, under it, the selected powers and the chosen discipline chips with their remove controls. The sheet shows its Powers tab and section by the same test (`hasStoredPowers`: a stored power that is not a universal ability, or a stored discipline, P18).

### 9.5 B11 items that are fields of an entry

The mutation sub-choice, the archetype keyword placeholder and the ascension choice key are fields inside an entry. The entry itself is visible and has a Remove control. They are parked (§16).

### 9.6 A20: Kroot mutations above the tier

- **A20 (S2 minor).** Evidence: `setTier` notifies only on an increase; `canAddMoreKrootMutations` (`state.js:330-334`) gates additions only. `reclick.js`: tier 3 to 1 keeps 3 mutations, 1 allowed.
- Correction (G2): the mutations stay stored. The selected Kroot card marks each `mutation` sub-option after the first `tier` entries: "<name> (above the limit of Tier <n>)" with a Remove button. Stored data does not change.

### 9.7 Risk to stored data

X2 only (eight aliases). The rows read the data and write nothing.

## 10. Group 7: number inputs and trackers (B3, B4, B5)

### 10.1 Findings

- **B3 (S2).** `state.js:216-219` (`parseInt(rank) || 1`) and the box loops `character-sheet-tab.js:710-727` have no bound. `p3.log`: rank 30000 typed gives a sheet render of 3146 ms; 300000 gives 38998 ms.
- **B4 (S2).** `numbers.log`: rank `-5` and Additional XP `-5` are stored. `creator/index.html:180,185` declare `min="0"` and `min="1" max="5"`; the browser does not enforce them on typed input. The `max="5"` was already in the first commit of the old creator repo (`3b17bac`); no book gives it.
- **B5 (S2).** `p5-trackers.js`: Faith 2 with a max of 1 shows 2; "+" then gives 1. `getCurrentFaith` (`state.js:1256-1262`) has no clamp; `currentWounds` 7 stays when the max drops to 3.
- Book check (G6): Core p.146: "Your Rank can't decrease, and can't go above the maximum of 3." The input declares 5. The owner decided Rank 1 to 3 (§2).

### 10.2 Correction

- New helper `State._intInRange(value, min, max) -> number|null`: `Number(value)` when it is an integer with `min <= n <= max` (`max` may be `Infinity`), else `null`. The inputs have no `step`, so the browser default step is 1: an integer is the declared form.
- The Rank input (`creator/index.html:185`) declares `min="1" max="3"` (CC11). Nothing else in `creator/` or `data/` assumes a Rank above 3.
- `setRank` (1..3), `setAdditionalXP` (0..), `setCorruptionPoints` (0..), `setTier` (1..5, the select; CC12). A value outside the range keeps the stored value and does not notify. The tab writes the stored value back into the input (`SettingTab.refresh`, the corruption input, the follower inputs).
- Follower Members (`min="1"`) and Living (`min="0"`, `max` = Members) in `followers-tab.js:218-224`: an entry outside the range keeps the stored value and re-renders.
- A stored value outside a range stays until the user edits that field (G1). A stored Rank of 4 or 5 (written by the old `max="5"`) stays: the input shows it (the browser marks it invalid but keeps it), each "+Rank" and "Double Rank" bonus uses it as today, and the box bound of §10.3 covers each count that it raises.

### 10.3 Correction: render bounds and tracker getters

- **[Design agent]** `renderTrackingBoxes` and `renderFollowerBoxes` draw at most 50 boxes. When the max is larger, a text "+<n> more" follows in a `span.sheet-empty`. The `--n` style of `:394` and `:398` uses the drawn count. The game has no box limit; G4 permits a render bound. Cost if wrong: a character with more than 50 wounds sees a count text for the rest. The book maximum for a real character is far below 50.
- `getCurrentWounds` and `getCurrentShock` return `min(stored, current max)`. `getCurrentFaith` returns `min(stored, max)`, and `max` when the stored value is `null`. The stored value stays (G1): the first step from the sheet writes a value inside the max through the existing setters. When the max rises again, the old stored damage shows again. That is the stored value of the user; this pass does not change it at a derived change.

### 10.4 Risk to stored data

None at load. A typed value outside the range is refused, so nothing new is stored outside it.

## 11. Group 8: background (A14, A15)

### 11.1 A14: one background bonus

- **A14 (S2).** `derived-stats.js:5-14` adds +1 for each entry whose `bonusType` matches and never reads `bonusUsed`. `bg.js`: three Max Wounds backgrounds give wounds 3 to 6.
- Book (G6): Core p.43: "Whatever approach you choose, you can only receive a single Background +1 bonus." The book decides.
- Correction: `getBackgroundBonus` counts only `background[background.bonusUsed]`, and only when `bonusUsed` is `origin`, `accomplishment` or `goal` (G3). With no selection it gives 0. The Background tab shows the text "Select one bonus with USE THIS BONUS. A character gets one Background bonus (Core Rulebook p.43)." in `#background-bonus` when an entry is set and `bonusUsed` is `null`.
- What changes for an existing character: a character with no `bonusUsed` loses each background bonus until the user selects one. A character with `bonusUsed` keeps that one bonus only. Stored data does not change.

### 11.2 A15: a render writes `bonusType` (X3)

- **A15 (S1).** `background-tab.js:63` -> `:252-276` and `character-sheet-tab.js:76-77` -> `:2797-2825` write `bonusType` into the character with no dirty flag. `f10.js`: after a render, the origin gets `bonusType` and max wounds goes from 3 to 4 with `isDirty false`.
- Correction: `State.loadCharacter` fills a missing `bonusType` from `DataLoader.getBackgrounds()` after `CharacterCheck.repair` (X3), only for an entry whose id the data has and whose `bonusType` is absent, `null` or `''`. Both render copies go (`repairMissingBonusTypes`, `repairBackgroundBonusTypes`), with their calls. The result for an old save is the same value, now at load instead of at render.

## 12. Group 9: settings and Load (A16, A17, A18)

- **A16 (S2).** `state.js:1522-1531`: the settings live only in the autosave; `_performAutoSave` skips a blank character (`:1518-1520`); `newCharacter` calls `clearAutoSave`. `sources.js`: a source change on a blank character is not stored.
- Correction: a new key `wng-creator-settings` holds `{ enabledSources, knownSources, ignorePrerequisites }`. `setEnabledSources` and `setIgnorePrerequisites` write it (`setItem` in a `try`). New `State.getSavedSettings()` reads it, with `getItem` and the parse in one `try` (blocked storage gives `null`, P7c). `App.checkAutoSave`:
  - `const settings = State.getSavedSettings() || State.getAutoSave()`; the settings part runs only `if (settings)` (empty storage, P7a);
  - the character always comes from `State.getAutoSave()?.character`, never from the settings object (P7b: with both keys, the autosaved character still loads);
  - when no character loads, `State.markClean()` after the settings part, so a blank character is not dirty and `beforeunload` does not warn (P14a).
- New Character does not touch the new key. The autosave still writes the settings too. **[Design agent]** That keeps an older app version in another tab working. Cost if wrong: a few bytes; and once the new key exists, a settings change made in a cached v129 tab is not read by the new version (P14b).
- **A17 (S3, F8).** `app.js:479-480` tests truthiness and `:471` spreads the value; `{}` throws `not iterable` and stops the start. Correction: the sources apply only when `Array.isArray`, and only the string entries. Else the default stays.
- **A18 (S2).** `app.js:158-167` loads with no confirm. New Character (`:135-145`) asks a confirm with no condition. Correction **[Controller ruling CC6]**: the confirm comes after the file pick and before `State.loadCharacter`. A confirm before the file dialog can block Load: `showConfirm` is the browser's `confirm()` (`web-api.js:178`), the file picker needs recent user activation, and Chromium keeps it for about 5 seconds (plan review P6, headless Chromium). `CharacterIO.load(confirmLoad)` takes an optional function; after `importCharacter` succeeds it calls `await confirmLoad(fileName)`, and on `false` it returns `{ success: false, error: 'Load cancelled.' }` with no change. The App handler passes a function that asks `window.api.showConfirm('Load "<file name>"? Unsaved changes to the current character will be lost.', 'Load Character')`. **[Design agent]** It asks only when the current character has content (a name, a species or an archetype: the test of `_performAutoSave`). Cost if wrong: one more click for a blank character.
- A cancelled confirm leaves no trace **[Controller ruling CC17]**. `showOpenDialog` sets the file handle of `web-api.js` to the picked file before the confirm (`web-api.js:68-69`, `:94`). When a later Save picker throws a non-Abort error, `exportCharacter` writes into that handle (`:116-122`), so a declined file could get the current character. Correction: `showOpenDialog` keeps the handle that was there before the pick, and a new `window.api.cancelOpen()` puts it back and clears the pending file. The cancel path of `CharacterIO.load` calls it. `CharacterIO.lastSavedPath` does not change, because `load` sets it only after `State.loadCharacter`.

## 13. Group 10: render guards (B6, B7, B8, B10)

- **B6 (S2).** `threat-card.js:42,278-286` prints `threat.mobAbilities` as a string; 8 threats hold a list of `{ name, description }`. Walk: "Mob Abilities [object Object]". Correction: `renderTextSection` renders a list as one `<p>` per entry with the name in `<strong>`. A string renders as today. The bestiary copy belongs to the other author.
- **B7 (S2).** `wargear-tab.js:642` assumes an object range; 37 ranged weapons hold a string. Correction: a string prints as stored; an object as `short/medium/long`; no range as `-`.
- **B8 (S3, F6).** `relic-wizard.js:295`, `:503`, `:770` read `relics.forms[formId].powersTable` with no guard. Correction: `open()` sets `formId` to `null` when the stored form is not a key of `relics.forms`, so step 1 asks for a form (`:630`). The three lookups get a guard. The stored relic does not change until the user saves.
- **B10 (S3, F7).** `character-sheet-tab.js:1665` calls `escapeHtml(choice)`, which returns `''` for the number `0`. Correction: the site uses `escapeHtml(String(choice))` when the choice is not `null` or `undefined` (the pattern of R4 of the load check spec).

### 13.3 The sheet rows for unknown ids

The sheet has no controls. It shows the text "Unknown <kind> (<id>)" at each site that skips an unknown id today: talents (`:1662`), powers (`:1742`), equipment (`renderEquipment`, `:1257-1268`: an entry that no getter resolves), memorable and traumatic injuries (`:1793-1794`, `:1818-1819`), mutations (`:1869-1870`), and the copied summary (`copySummary`, `:2057-2058`).

## 14. New controls

| # | Where | Control | Finding |
|---|---|---|---|
| 1 | Archetype tab, standard archetype detail | one select "Skill of your choice (<value>)" per "any skill" key | A2 |
| 2 | Archetype tab, Custom Archetype item | a confirm that names the starting entries it removes (only when there are some) | A7 |
| 3 | Header, Load button | a confirm after the file pick that names the file (only when the character has content) | A18 |
| 4 | Ascension tab | a notice with the button "Remove old package list" | A1 |
| 5 | Ascension tab | a block "Ascensions with no slot", one Remove button per row | A12 |
| 6 | Ascension tab, slot | a row "Unknown ascension package / archetype (<id>)" with a Remove button | A11 |
| 7 | Species tab, selected card | a Remove button per unknown sub-option and per Kroot mutation above the tier | A11, A20 |
| 8 | Wargear tab | a group "Unknown" whose rows use the existing Remove button; the upgrade modal lists an unknown upgrade with its existing remove | A11, B2 |
| 9 | Talents, Powers, Injuries tabs | unknown rows with the existing remove controls | A11, B11 |
| 10 | Powers tab, character with no PSYKER | the selected power chips and the chosen discipline chips under the info box | A8, A4 |
| 10b | Powers tab, psyker archetype with `disciplineChoices: 0` and stored disciplines | the chosen discipline chips with × (today hidden) | A8, CC8 |
| 11 | Background tab | a disabled option "Unknown <kind> (<id>)" in a select; a text that asks for one bonus | A11, A14 |

No new CSS file. Each row uses the classes of its tab (`btn-remove`, `btn-small`, `info-box`, `selected-chip`, `card-suboption`, `text-muted`).

## 15. Owner decisions

| # | Item | Book evidence | Default (the plan implements it) |
|---|---|---|---|
D1 (Rank) and D2 (Tier) are decided by the owner: see §2.

| # | Item | Book evidence | Default (the plan implements it) |
|---|---|---|---|
| D3 | A species change clears the archetype selection (`state.js:250-253`). After this pass it also loses: the archetype grants (§6), all species sub-options such as chapter, path and Kroot mutations (`state.js:240`), and the keyword and skill choices at the next archetype pick. It keeps: the stored Custom Archetype record (CC7), bought stats above the old free value and under the new maximums, talents, wargear, ascensions, free picks that a slot covers, bought powers and disciplines. No confirm. **[Controller ruling CC13]** | No book rule. G2 can read as "keep it with a mark". Not an audit finding. | No change in this pass. |
| D4 | `minor_invocation` -> `malefic_invitation`, `warpspeed` -> `warptime` | Old commit `685e6a8` replaced the records in place as "wrong powers corrected". | No alias: unknown rows. |
| D5 | `company_standard` (Company Ancient) -> `battle_standard`? | Vow of Absolution p.42 wargear: "Company Standard"; the data item `battle_standard` (VoA p.74) is named "Battle Standard". | No change: it stays text. |
| D6 | `smoke_grenades` (Incursor, Bladeguard) -> `smoke_grenades_aoa`? | VoA p.41 lists "3 Smoke Grenades"; the data item is from An Abundance of Apocrypha (p.361). | No change. |

## 16. Parked findings

| Finding | Reason |
|---|---|
| A19 | **[Controller ruling]** Only a hand-edited file holds it, and it has no effect. |
| A10 Apocrypha prose | 548 Apocrypha `startingWargear` entries are display names or prose. A curation job against the book for the owner. The click skips them (§7.5). |
| B11 sub-fields | Mutation sub-choice, keyword placeholder, ascension choice key: fields of an entry that is visible and removable (§9.5). |
| A21-A24 (S4) | Listed only: `newCharacter` throws with blocked storage; `state.js:153-156` is dead (A22, not removed here); rank/XP negative (closed by §10.2); attribute maximums 13-16 not reachable. |
| B S4 lines | Listed only: typed `1e5` and `2.5` (closed by §10.2); follower decimals (closed by §10.2); `references-tab.js:761-762` prints "Choice1 +4" (Compendium text, not character data). |
| Glossary, Electron wrapper | **[Controller ruling]** Out of scope. |
| Upgrades on a base item change (P19) | **[Controller ruling CC7]** A change of the base item in a relic or improvised edit clears `upgrades` (`state.js:813`, `:831`). An upgrade belongs to the base item, and the edit selects a new one. |

Unrelated dead code seen and not removed: `State.removeWargear` has no caller (it gets the remap helper only); `CharacterIO.createCharacterSheet` iterates `Object.entries` of the stats (`character-io.js:198`, `:214`) and has no caller.

## 17. What this spec does not prove

- A package entry from a save before this change has no `granted` record. For it, the no-record rule cannot tell a free pick from a grant when both name the same power and the pick came first, and cannot know if a power was bought before a grant. The archetype has no entry, so the same limit holds for its grants (§6.3).
- The rebase cannot tell a bought point from a free point at the same value: a bought value equal to the old free value goes to the new free value (§5.4, P17).
- The species maximum clamp uses `attributeMaximums` of `data/species.json`. The five species of the Core p.25 table were compared, and three values are corrected (§5.2a). The species of the other books (for example Ogryn and Ratling of the Forsaken System, the Kroot, the Apocrypha species) were not compared with their book pages. No erratum was checked.
- The alias table covers the ids that left the data since 2026-02-13 (`3b17bac`). It does not cover an Electron 1.0.0 save with ids that left the data before that commit.
- The injury and mutation ids and the follower `threatId`s were not compared with older data (Audit 1 did not check them). An unknown one shows as a row; no alias exists for them.
- The 50-box bound and the timing were not measured on a phone.
- The book checks cover Core pp.19, 25, 29, 43, 94, 109, 116, 117, 146 and Vow of Absolution pp.39, 41, 42, 125, 126. For the Rank search, the contents pages of each official sourcebook and the sections they point to were read; the adventure modules and the Apocrypha body were not read.
- The audit evidence was re-read in the code at `44084ae`. The audit scripts were not run again; the line numbers in this spec match the code.
