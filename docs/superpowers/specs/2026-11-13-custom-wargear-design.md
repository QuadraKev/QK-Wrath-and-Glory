# Custom Wargear (creator) — Design

Date: 2026-11-13, revised 2026-11-13 after the owner's answers and a builder check. Issue: #33
"Custom Wargear" (creator).
Status: spec for owner approval.

Marks used below: **[Owner]** is a decision in the owner's words. **[Designer]** is a designer's
call that the owner saw and did not change. **[Designer, new]** is a call made while writing this
spec. Line references are to the tree at commit `079c581`.

## 1. Goal and scope

The player can add wargear that is not in a book: a weapon, an armour, an augmetic or an "Other"
item. After it is added, the item works like book wargear. It shows in the correct section of the
character sheet, with the stats and the description that the player typed.

Owner's words **[Owner]**:

- "The player needs to be able to add custom wargear. Categories can include Weapons, Armour, etc.
  There should be an Other category that is basically just a text box. Players should be able to
  customize Weapon/Armor stats, keywords, etc."
- Example: "Xenotech Blade: S+4 Damage +4 ED / Range 2 / Agonising, Rad (2)". The weapon needs a
  name, base damage (the +4 of S+4), ED, Range and keywords. ("Keywords" here are weapon `traits`
  in the data.) "Ranged weapons might need some additional qualities addressed."
- "It should show in the correct area of the character sheet based on wargear type, and it should
  display the stats and description provided by the player."
- "It should function essentially identically to book wargear once added."
- A custom Augmetic shows in the Augmetics area of the sheet, and "the player can also give stat
  bonuses (for example +1 Strength) that the sheet applies".
- "To my knowledge, there are melee weapons that have greater than 'normal' melee range. It might
  be worth adding range for every weapon."

Goals:

- Create, edit and remove a custom weapon (melee or ranged), armour, augmetic or Other item.
- Every place that handles an owned book item handles a custom item the same way: the owned list,
  equip, weapon upgrades, the talent pickers, derived stats, the sheet, print, copy as text, file
  export, file import and autosave.
- A custom augmetic's bonuses change the sheet as a book augmetic's bonuses do.
- The character file holds everything about the item. A file opens on any machine.
- Player text can never inject HTML.

Non-goals **[Designer]**:

- A start from a book item as a template.
- A Holy Relic or an Improvised Weapon built on a custom item.
- An Other item that changes stats (no `bonuses`).
- A library of custom items shared between characters.
- Any change to the bestiary or to `data/`.

Anti-goals **[Designer, new]**:

- No custom item in the wargear browser, the custom-archetype starting-wargear browser, the
  Compendium, the glossary popups, the relic builder base lists or the improvised builder.
- No dice expressions in numeric fields (`1d3` ED, `1d3` Salvo). Integers only.
- No bonus key that the equipment path does not apply end to end (§3.5).
- No version field and no save migration. Old saves load unchanged.

## 2. Storage model

### 2.1 Decision

**[Designer, new]** The full item record lives on its wargear entry, under a `custom` field, in the
shape that the data files use for that kind of item. Each custom entry has its own reserved id,
`custom_<8 random base-36 chars>`. The `DataLoader` resolvers return that record for a custom id
of the current character. All other consumers stay as they are.

Reasons:

- Every consumer resolves `entry.id` through `DataLoader.getWeapon` / `getArmor` / `getEquipment`
  / `getWargearItem` (`creator/js/data-loader.js:102,108,114,126`). One change there reaches all of
  them.
- The record is in the character, so file export (`creator/js/web-api.js:107`, a plain
  `JSON.stringify`) and autosave carry it. `State.loadCharacter` (`creator/js/state.js:139`) is a
  shallow merge, so the `custom` field round-trips with no load code.
- Remove is the existing `removeWargearByIndex` (`state.js:743`). It leaves no orphan.
- The `DataLoader.getAll*` lists (`data-loader.js:238-250`) read only the data cache. Every list
  built from them (browser, relic base lists, Compendium) excludes custom items with no change.
- A custom augmetic is an equipment record with `bonuses`, so `DerivedStats.getEquipmentBonuses`
  (`creator/js/derived-stats.js:629-646`) applies it with no second mechanism.

Alternatives rejected:

- (a) Hidden base records in `data/` plus an overlay, as Improvised does
  (`creator/js/improvised-builder.js:298`). It needs a `data/` change, which is out of scope. Each
  consumer must call a resolver: Improvised needed edits at `state.js:808`,
  `character-sheet-tab.js:869`, `character-io.js:242` and more, and about 20 consumers would need
  the same. An overlay cannot change the kind of item (weapon versus armour).
- (b) A separate `character.customWargear` store. Two stores must stay in step. Talent choices
  store a `character.wargear` index (`talents-tab.js:154`, `character-sheet-tab.js:1059`), so the
  item still needs a `wargear` entry, and the resolvers still need a change.

### 2.2 The resolver

`DataLoader.getCustomRecord(id)` **[Designer, new]**:

1. Return `undefined` unless `typeof id === 'string' && id.startsWith('custom_')`. Book lookups
   skip all new code.
2. Return `undefined` unless `typeof State !== 'undefined' && State.character`.
3. Find the first entry of `State.character.wargear` with `entry.id === id` and an object
   `entry.custom`. Return `entry.custom`, or `undefined`.

Then:

- `getWeapon(id)` returns the custom record when its `kind === 'weapon'`, else the book lookup.
- `getArmor(id)` does the same for `kind === 'armor'`.
- `getEquipment(id)` does the same for `kind === 'augmetic'` or `kind === 'other'`.
- `getWargearItem` needs no change.

A `custom_` id never falls back to the data files, and a data id never reaches the custom lookup.
No data id starts with `custom_` today (checked over `weapons.json`, `armor.json`,
`equipment.json`); a test keeps it so.

Layering: `DataLoader` now reads `State`. `data-loader.js` loads before `state.js`
(`creator/index.html:527,531`), but the read happens at call time, after all scripts load. The
`typeof` guard keeps the resolver safe in the Node tests and before `State` exists. The resolver
reads live state, so there is no cache to clear on load, new character or edit. The resolver
returns the stored object, as the book lookups return the cached object. No consumer mutates it.

The bestiary has its own `DataLoader` and is not touched.

### 2.3 Record shapes

Kinds: `"weapon"`, `"armor"`, `"augmetic"`, `"other"`.

Common keys: `kind`, `id` (same as `entry.id`), `name`, `description` (string, may be `""`),
`source: "custom"`. No `page`. `value` (integer) and `rarity` (`Common` | `Uncommon` | `Rare` |
`Very Rare` | `Unique`) are present only when the player set them.

**[Designer, new]** `source: "custom"`, with `'custom': 'Custom'` added to
`DataLoader.sourceDisplayNames` (`data-loader.js:319`). Then `formatSourcePage` prints "Custom"
where a book item prints its book and page (sheet name cells, `character-sheet-tab.js:987`), with
no consumer change. `sourceDisplayNames` is read only through `getSourceDisplayName`
(`data-loader.js:334`), which runs for `formatSourcePage` and at `creator/tabs/archetype-tab.js:722`
(the book name of a talent's source). Neither builds the Settings source toggles, so they do not
change, and `archetype-tab.js:722` never sees a custom record.

**[Designer, new]** A blank `value` or `rarity` omits the key, not `"-"`. The armour and equipment
sheet rows show a rarity tag for any rarity except `Common` (`character-sheet-tab.js:1098,1258`),
so `"-"` would print a "-" tag. `requisitionDN` returns `null` for a missing value
(`data-loader.js:366`).

| Kind | Keys beyond the common keys |
|---|---|
| weapon, melee | `type: "melee"`, `damage: { base, attribute: "strength", bonus: 0 }`, `ed`, `ap`, `reach?`, `traits[]`, `keywords[]` |
| weapon, ranged | `type: "ranged"`, `damage: { base, attribute: null, bonus: 0 }`, `ed`, `ap`, `range: { short, medium, long }`, `salvo`, `traits[]`, `keywords[]` |
| armor | `ar`, `traits[]`, `keywords[]` |
| augmetic | `category: "augmetic"`, `effect`, `bonuses?`, `keywords[]` |
| other | `category: "Other"`, `effect: ""`, `keywords: []` |

Notes:

- Melee damage: `base` is the number after `S+`, and `attribute: "strength"`. Most book melee
  weapons store Strength damage this way (Chainsword: `{"base":5,"attribute":"strength","bonus":0}`,
  core p. 212); 18 book melee records have `attribute: null` (for example `cos_sentinel_chainsaw`,
  a vehicle weapon). **[Designer]** A custom melee weapon always adds Strength. The damage code
  adds the attribute (`derived-stats.js:511`, `character-sheet-tab.js:2360`).
- Melee range: **[Designer, new]** stored as `reach`, an integer, as the Core Rulebook records do
  (Whip, Neural Whip, Shock Whip: `reach: 4`, core p. 212). The wargear browser labels this field
  "Reach" (`wargear-tab.js:546`). The data also holds melee ranges as `range: 2` (19 records) and
  `range: "2"` (13 Apocrypha records); `reach` is the shape with one type and the book of record.
  The sheet reads all three shapes (§4.1).
- Ranged range: the object `{ short, medium, long }` that 531 of 568 ranged records use. The string
  form (grenades, `"(S) x2m or as Launcher"`) is not offered; the player can describe it in the
  description.
- `salvo`: an integer, as 490 of 568 ranged records use.
- `traits`: strings as the data stores them, with a rating in parentheses: `"Rad (2)"`.
- Armour: no `type` and no `invulnerable` key. No creator consumer reads armour `type`, and only the
  relic builder reads `invulnerable` (`relic-wizard.js:741,749,785`), which never sees a custom
  item. The `Invulnerable` armour trait carries the meaning on the sheet.
- Augmetic: `category: "augmetic"` is the value that the owned list (`wargear-tab.js:84`) and the
  sheet Augmetics table (`character-sheet-tab.js:1156-1162`) test. `effect` is the text of the
  sheet Effect column (`character-sheet-tab.js:1211`), as on book augmetics (Augmetic Arm:
  `"effect": "Gain +1 Strength per Augmetic Arm."`, `"bonuses": {"strength": 1}`, core p. 243).
  `bonuses` is an object of bonus key → value (§3.5); the key is absent when there is no bonus.
- Other: `category: "Other"` puts it in the Equipment group of the owned list
  (`wargear-tab.js:84`) and the Equipment table of the sheet (`character-sheet-tab.js:1246`), with
  "Other" as the type label. No `bonuses`, so it changes no stats (`derived-stats.js:634`).

### 2.4 Worked example: the Xenotech Blade

```json
{
  "id": "custom_k3v9q2xa",
  "isStarting": false,
  "custom": {
    "kind": "weapon",
    "id": "custom_k3v9q2xa",
    "name": "Xenotech Blade",
    "type": "melee",
    "description": "",
    "damage": { "base": 4, "attribute": "strength", "bonus": 0 },
    "ed": 4,
    "ap": 0,
    "reach": 2,
    "traits": ["Agonising", "Rad (2)"],
    "keywords": [],
    "source": "custom"
  }
}
```

`equipped` and `upgrades` are added to the entry by the existing code when the player uses them
(`state.js:794,838`).

### 2.5 Worked example: an augmetic

```json
{
  "id": "custom_p7d2m0zt",
  "isStarting": false,
  "custom": {
    "kind": "augmetic",
    "id": "custom_p7d2m0zt",
    "name": "Hydraulic Spine",
    "category": "augmetic",
    "description": "A salvaged spinal frame bolted to the vertebrae.",
    "effect": "+1 Strength, -1 Agility.",
    "bonuses": { "strength": 1, "agility": -1 },
    "keywords": ["IMPERIUM"],
    "rarity": "Rare",
    "source": "custom"
  }
}
```

### 2.6 State mutators

**[Designer, new]** Names avoid the existing custom-archetype methods `canAddCustomWargear`,
`addCustomStartingWargear` and `removeCustomStartingWargear` (`state.js:478,503,515`), which handle
a different feature.

- `State.addCustomItem(record)`: normalizes the record (§2.8), gives it a new id, pushes
  `{ id, isStarting: false, custom: record }`, notifies `'wargear'`.
- `State.updateCustomItem(wargearIndex, record)`: keeps `entry.id` and `record.id`, replaces
  `entry.custom`. If the weapon `type` changed (melee ↔ ranged), it sets `entry.upgrades = []`, as
  `updateImprovisedWargear` does on a base change (`state.js:781-784`). Notifies `'wargear'`.
- Remove: the existing `removeWargearByIndex` (`state.js:743`).

The kind cannot change in Edit **[Designer, new]**: a kind change would break the talent choices
that point at the entry (Trademark Weapon, Armour-Monger). The player removes the item and creates
a new one.

### 2.7 Custom archetype reset

`State.setCustomArchetype` (`state.js:400-406`) sets `this.character.wargear = []` (`:403`).
`setArchetype` keeps wargear on purpose (comment at `state.js:346-347`). A book item can be added
again from the browser; a custom item would be lost with every typed field.

**[Designer, new]** The reset keeps every entry that holds `custom`, in its current order, and
removes all other entries:

```js
const kept = this.character.wargear.filter(w => w.custom);
```

Talent choices: today the reset does not touch `character.talents` (`resetStats`, `state.js:529-554`,
changes only attributes and skills). A stored `weapon_owned` / `armor_owned` index (Trademark
Weapon, Armour-Monger) then points past the empty array and resolves to nothing. With kept entries
the array is not empty, so a stale index could land on a different item. **[Designer, new]** The
reset therefore remaps those choices: for each talent entry whose talent has `choiceType`
`weapon_owned` or `armor_owned` (`talents-tab.js:140,159`), an index of a kept entry becomes that
entry's new index; any other index becomes `null` (the player picks again). Other talent choices
are not indices and stay. `removeWargearByIndex` has the same index shift today; that is out of
scope here.

### 2.8 Load and normalization

**[Designer, new]** `State.loadCharacter` (`state.js:139`) calls
`CustomWargear.normalizeEntry(entry, usedIds)` for each wargear entry that has a `custom` field or
an id that starts with `custom_`. `addCustomItem` and `updateCustomItem` use the same function, so
there is one validation path. Autosave restore (`app.js:486`) and file import (`character-io.js:56`)
both go through `loadCharacter`.

Rules:

1. Never drop an entry. Talent choices store indices (`talents-tab.js:154`), so a dropped entry
   would move every later choice to the wrong item. A broken entry is repaired, and the player can
   Edit or Remove it.
2. `custom` is not a plain object: replace it with
   `{ kind: "other", name: "Unreadable custom item", description: "" }` before step 3.
3. `kind` not one of `weapon`, `armor`, `augmetic`, `other`: `"other"`.
4. Each field is coerced to its §3 type and limits: strings trimmed and cut to the maximum length;
   integers parsed and clamped, else the default; arrays filtered to strings, cut to the maximum
   count; keywords upper-cased and de-duplicated; traits normalized as in §3.3. Keys that the kind
   does not use are dropped (so `bonuses` survives only on an augmetic). `category` is set from the
   kind. `source` is set to `"custom"`.
5. `bonuses` (augmetic): a key not in the §3.5 list is dropped; a value that is not an integer in
   -10..10 other than 0, and not `"rank"` or `"doubleRank"`, is dropped; an empty object removes
   the `bonuses` key.
6. `entry.id` is not `/^custom_[a-z0-9]+$/`, or another entry of this character already uses it:
   give the entry a new id. Then `custom.id = entry.id`.
7. Delete `entry.relic` and `entry.improvised` (not supported on custom items). Delete
   `entry.upgrades` and `entry.equipped` unless the kind is weapon.
8. Log one `console.warn` per repaired entry.

An id is unique only inside one character; two characters can hold the same id with no effect,
because only the loaded character is resolved. A `custom_` entry that a cached older creator
build hides (unknown id) still round-trips through the shallow merge.

## 3. The builder form

### 3.1 Entry point

**[Designer]** A "Custom Wargear" card on the Wargear tab, after the Holy Relic and Improvised
Weapon cards (`wargear-tab.js:337-363`), with the same `holy-relic-cta` markup and a
"Create Custom Wargear" button. **[Designer, new]** The card always shows: it needs no source book
and no talent.

The button opens a modal built once, in the style of the Improvised Weapon builder
(`improvised-builder.js:22-96`): `modal-content modal-large`, header, body, footer with Cancel and
Save. The new module is `creator/js/custom-wargear.js`, global `CustomWargear`, with `open(index)`
(null = create), `close()`, the render and bind methods, and the pure helpers that the tests load
without a DOM: `newId(usedIds)`, `buildRecord(form)`, `normalizeEntry(entry, usedIds)`,
`ratedTraits(kind)`, `formatStatLine(record)`.

### 3.2 Fields

At the top, a kind selector: Weapon / Armor / Augmetic / Other (UI spelling matches the existing
"Armor" and "Augmetics" headings). For Weapon, a Melee / Ranged selector. The form shows only the
fields of the selected kind and type. Values in hidden fields are kept while the modal is open, but
`buildRecord` writes only the keys of the selected kind (§2.3). In Edit, the kind selector is
disabled (§2.6).

| Field | Kinds | Input | Stored | Default | Validation |
|---|---|---|---|---|---|
| Name | all | text | `name` | `""` | required; 1–80 chars after trim |
| Damage | weapon | integer; melee label "Damage: S +" | `damage.base` | 0 | 0–30 |
| ED | weapon | integer | `ed` | 0 | 0–20 |
| AP | weapon | integer, hint "e.g. -2" | `ap` | 0 | -10–10 (data uses negatives: `psykana_mercy_blade` AP -1) |
| Range | melee | integer, label "Range (m)", optional | `reach` | blank (no key) | 1–50 |
| Range | ranged | three integers: Short / Medium / Long | `range` | blank | each 1–999; required; short ≤ medium ≤ long |
| Salvo | ranged | integer | `salvo` | 1 | 0–20 |
| AR | armor | integer | `ar` | 0 | 0–20 |
| Traits | weapon, armor | picker (§3.3) | `traits[]` | `[]` | at most 20 |
| Effect | augmetic | text, optional | `effect` | `""` | at most 500 chars |
| Bonuses | augmetic | bonus rows (§3.5) | `bonuses` | none (no key) | §3.5 |
| Keywords | weapon, armor, augmetic | chip input (§3.4) | `keywords[]` | `[]` | at most 20; each 1–40 chars |
| Description | all | textarea | `description` | `""` | optional; at most 2000 chars |
| Value | all | integer, optional | `value` | blank (no key) | 0–30 |
| Rarity | all | select with a blank first option | `rarity` | blank (no key) | one of the five rarities |

Save is disabled while a field is invalid; the invalid field shows a short message under it. A
live preview line under the form shows `formatStatLine` of the current values (§4.2).

### 3.3 Trait picker

**[Designer]** Picked from the book trait lists: `weaponTraits` for a weapon, `armorTraits` for
armour, in `data/glossary.json` (read from `DataLoader.cache['glossary.json']`, which
`Glossary.init` loads; `creator/js/glossary.js:582`). Both are objects keyed by trait key, with
`{ name, source, page, description }` values: use `Object.values(...)`, sorted by `name`.

- A select (or searchable list) of trait names, an optional rating text box, and an Add button.
  The list holds only the glossary trait names (42 weapon, 8 armour).
- **[Designer, new]** The rating box shows only for a rated trait. `ratedTraits(kind)` returns the
  names that are in the glossary list of that kind AND appear with a parenthesised rating on at
  least one book record of that kind (`getAllWeapons()` or `getAllArmor()`). Today it gives, for
  weapons: Unwieldy, Rending, Arc, Rapid Fire, Sniper, Rad, Blast, Heavy, Inflict, Blessed, Mortal,
  Mounted, Bane; for armour: Bulk, Powered, Fear. Book records also rate Haywire and Volatile
  (weapons) and Bulky (armour); these are not in the glossary lists today. **[Owner]** D3: a trait
  that the books define must be in the glossary lists, so that the player does not type it. A
  separate data task (branch `glossary-missing-traits`) adds every book trait that the weapon and
  armour records use and the lists miss, with the verbatim book text, before this feature ships.
  The picker and `ratedTraits` are derived at run time, so they follow the data with no list to
  maintain and need no code change for the new entries.
- The rating is free text, 1–30 chars, because book ratings are not always numbers
  (`Inflict (Poison 5)`, `Mounted (Medium)`, `Bane (Flyer)`). Stored as `"<Name> (<rating>)"`, or
  `"<Name>"` with no rating.
- **[Owner]** A "custom trait" text box (1–60 chars) adds a trait that is not in the list ("There
  should be an option for a custom trait though."), with its rating typed in the same box, for
  example `Xenos Venom (2)`.
  **[Designer, new]** A typed trait whose name part (before any `(`) matches a list name without
  regard to case is rewritten to the list spelling: `shield` → `Shield`, `rad (2)` → `Rad (2)`.
  Code tests exact names: `Shield` (`derived-stats.js:595`), `Pistol` and `Two-Handed`
  (`data-loader.js:424-425`, `character-sheet-tab.js:1045-1048`). Any other typed trait is kept as
  typed and shows with no popup.
- Traits show as removable chips in the order added. An exact duplicate is not added.

### 3.4 Keyword input

Same behavior as the custom-archetype keyword input (`State.addCustomKeyword`, `state.js:445`):
the text is trimmed and upper-cased, a duplicate is not added, each keyword is a removable chip.
Keywords feed the talent rules that test keywords (for example Angel of Death, `BOLT`,
`character-sheet-tab.js:2216-2221`) and the upgrade restrictions (`data-loader.js:415`), as book
keywords do.

### 3.5 Bonus editor (augmetic only)

**[Owner]** "The player can also give stat bonuses (for example +1 Strength) that the sheet
applies." The editor offers only keys that the equipment path applies end to end, that is, keys
that some code reads through `getEquipmentBonusTotal` or `getEquipmentBonuses`
(`derived-stats.js:629-653`):

| Key | Label | Where the bonus is applied | Where the sheet shows it |
|---|---|---|---|
| `strength`, `toughness`, `agility`, `initiative`, `willpower`, `intellect`, `fellowship` | the attribute name | `getEffectiveAttribute` (`derived-stats.js:142-145`), which feeds the derived stats (`:262,281,297,308,329,358,374,391,408`), skill totals (`:461-466`), attack pools (`character-sheet-tab.js:2147`) and melee damage (`derived-stats.js:512`, `character-sheet-tab.js:2361`) | attribute grid value and tooltip with one line per source (`character-sheet-tab.js:735-765`) |
| `speed` | Speed | `calculateSpeed` (`derived-stats.js:348`) | Speed value (no breakdown tooltip today) |
| `defence` | Defence | `calculateDefence` (`derived-stats.js:264`), `getDefenceBreakdown` (`:693`) | Defence value and tooltip, as one "Equipment" line |
| `resilience` | Resilience | `calculateResilience` (`derived-stats.js:283`), `getResilienceBreakdown` (`:660`) | Resilience value and tooltip, as one "Equipment" line |

These are the ten keys that book equipment uses (all on augmetics). No other key is read from
equipment bonuses: skill keys, Wounds, Shock and the rest would be stored and never applied, so the
editor does not offer them.

Editor:

- Rows of a key select and a value input, an "Add bonus" button, and a remove button per row.
- A key appears in at most one row (the stored form is an object); the key select of a new row
  offers only the unused keys. At most ten rows.
- Value: an integer from -10 to 10, not 0. Negative values are allowed (book: Willpower -1,
  Fellowship -2).
- **[Designer, new]** The value input also offers "Rank" and "Double Rank", stored as `"rank"` and
  `"doubleRank"`. `getBonusValue` resolves both (`derived-stats.js:170-173`), and a book augmetic
  uses `"rank"` for Resilience. Cost: one select beside the number.
- Rows with no key or an invalid value block Save with a message. No rows: no `bonuses` key.

**[Designer, new]** The `effect` text is not generated from the bonuses. The player writes it, as a
book effect is written; the preview line and the owned-list detail line show the bonuses
(`+1 Strength, -1 Agility`), so the player sees what the sheet applies.

Source name in the tooltips: `getEquipmentBonuses` labels each bonus with the item name
(`derived-stats.js:641`). The attribute tooltip prints it in `title="..."`
(`character-sheet-tab.js:759,763`), which the fixed `escapeHtml` makes safe (§5). The Defence and
Resilience tooltips print the word "Equipment", not the name. Speed has no tooltip.

### 3.6 Owned list: badge, Edit, Remove

In `renderCurrentWargear` (`wargear-tab.js:71-155`), a custom entry groups by its kind through the
resolvers, with no change to the grouping code (an augmetic lands in Augmetics by its `category`,
`wargear-tab.js:84`). `renderOwnedWeapon` and `renderOwnedItem` get a third info branch beside
`renderRelicInfo` / `renderImprovisedInfo` (`wargear-tab.js:171-207`):

- Name line: escaped name, then `<span class="badge-relic">Custom</span>` (the Improvised badge
  reuses `badge-relic` the same way, `wargear-tab.js:238`).
- Type line: "Melee Weapon", "Ranged Weapon", "Armor", "Augmetic" or "Other".
- Detail line: the escaped `formatStatLine(record)`.
- Buttons: Edit (class `btn-edit-custom`, opens `CustomWargear.open(index)`), Upgrades for a weapon
  (the existing button), Remove (the existing button and confirm; the confirm uses the native
  `confirm`, `web-api.js:185`, so the name needs no escaping there).

## 4. Consumers

"Unchanged" means the code works through the resolver with no edit. Escaping work is in §5 and is
not repeated here.

| Consumer | Location | Behavior | Verdict |
|---|---|---|---|
| Owned list, grouping | `wargear-tab.js:71-90` | groups by kind via resolvers | unchanged |
| Owned list, rows | `wargear-tab.js:158-212` | Custom badge, stat line, Edit | change (§3.6) |
| Remove | `wargear-tab.js:125-136`, `state.js:743` | removes the entry | unchanged |
| Custom archetype reset | `state.js:400-406` | clears all wargear | change (§2.7) |
| Upgrade modal and validation | `wargear-tab.js:790-896`, `state.js:828-852`, `data-loader.js:376` | upgrades by `type`, `traits`, `keywords` | unchanged |
| Equipped weapons | `state.js:802-817` | resolver | unchanged |
| Sheet weapon table | `character-sheet-tab.js:861-1027` | damage, ED, AP, traits, description, keywords | change: Range cell and Salvo (§4.1) |
| Sheet armour block | `character-sheet-tab.js:1073-1150` | AR, traits, description | unchanged |
| Sheet augmetics | `character-sheet-tab.js:1156-1230` | custom augmetic has `category: "augmetic"`; name, effect, description, keywords | unchanged |
| Sheet equipment | `character-sheet-tab.js:1242-1300` | Other: name, `effect` "-", description | unchanged |
| Sheet Holy Relics block | `character-sheet-tab.js:1312` | filters `item.relic`; custom entries have none | unchanged |
| Armour, Resilience, Defence | `derived-stats.js:567-621,652-715` | best AR, `Shield` trait | unchanged |
| Equipment bonuses | `derived-stats.js:629-653` | custom augmetic `bonuses` applied; Other has none | unchanged |
| Attribute grid and tooltip | `character-sheet-tab.js:735-765` | lists each bonus with the item name | unchanged (escaping §5) |
| Talent pickers `weapon_owned`, `armor_owned` | `talents-tab.js:140-172` | list custom items by name | unchanged (buttons use `textContent`, `talents-tab.js:104`) |
| Talent labels | `talents-tab.js:312-351`, `character-sheet-tab.js:1645-1669` | show the chosen item name | change: escape (§5) |
| Trademark Weapon | `character-sheet-tab.js:1054,2236` | by wargear index | unchanged |
| Name-matching talents | `character-sheet-tab.js:2216-2221` (Angel of Death), `:2297-2301` (Devastator Doctrine) | match by name, as book items do | unchanged **[Designer, new]**: "function identically" includes a name match |
| Simultaneous Strike | `character-sheet-tab.js:1041-1051` | `Two-Handed`, `Pistol` traits | unchanged |
| Copy as text | `character-sheet-tab.js:2044-2072` | name only for book items | change (§4.2) |
| `CharacterIO.createCharacterSheet` (Markdown) | `character-io.js:185-255` | name only for book items; no caller in the app | change (§4.2) |
| Print | sheet render | same HTML as the sheet | unchanged |
| File export, import, autosave | `web-api.js:107,168`, `state.js:139,1441` | JSON round trip | change: normalize on load (§2.8) |
| Wargear browser | `wargear-tab.js:454-520` | `getAll*` | excluded, unchanged |
| Custom-archetype starting wargear | `archetype-tab.js:578-580`, `state.js:468-490` | `getAll*`, ids from the browser | excluded, unchanged |
| Starting-wargear lists | `wargear-tab.js:300,325`, `archetype-tab.js:386,748`, `references-tab.js:770` | archetype data ids | excluded, unchanged |
| Relic builder base lists and summary | `relic-wizard.js:246,381,687-749,776` | `getAll*`; edit path only for an existing relic base | excluded, unchanged |
| Improvised builder | `improvised-builder.js:8,24` | fixed `BASE_IDS` | excluded, unchanged |
| Compendium and glossary popups | `references-tab.js:87`, `glossary.js:356` | `getAll*` | excluded, unchanged |
| Source filter | `state.js:1398` | browser lists only | unchanged |
| Bestiary | — | own `DataLoader` | not touched |

### 4.1 Sheet weapon table: Range and Salvo

The sheet prints a range only for a ranged weapon (`character-sheet-tab.js:918-921`); every melee
weapon shows "-". It prints no Salvo for any weapon.

**[Owner]** Range shows for every weapon, book and custom: "It might be worth adding range for
every weapon." The Range cell:

- Ranged: unchanged (`range` string as stored, or `short/medium/long` + `m`).
- Melee: `reach`, else `range`, else "-". This covers the three book shapes: `reach` integer
  (11 records, for example `whip`), `range` integer (19, for example `bedlam_staff_aoa`) and
  `range` string (15: 13 × `"2"` such as `greataxe_aoa`, and 2 × `"Thrown S x 4"` such as `knife`).
  An integer, or a string of digits only, prints as `<n>m`; any other string prints as stored. 48
  book melee records gain a value.

**[Designer, new]** Salvo shows for every ranged weapon, book and custom: the Range cell adds a
second line `Salvo <n>` when `salvo` is a number or a string other than `"-"`. The owner's answer
names range only; Salvo is a stat the player types, and "display the stats provided" needs it.

### 4.2 Copy as text and Markdown

Book items print the name only; the reader can look them up. A custom item cannot be looked up.
**[Designer, new]** Copy as text (`character-sheet-tab.js:2044-2072`) adds a branch for
`item.custom`, after the relic and improvised branches:

```
- Xenotech Blade (Custom)
    Damage (S) +4 • ED 4 • AP 0 • Range 2m • Agonising, Rad (2)
    <each description line, indented>
```

Armour: `AR <n> • <traits or ->`. Augmetic: the effect, then `Bonuses: +1 Strength, -1 Agility`
when present (`Rank` and `Double Rank` print as `+Rank`, `+Double Rank`). Other: the name line and
the description lines. Keywords add a line `Keywords: A, B` when present. The stat line is
`CustomWargear.formatStatLine(record)`.

`CharacterIO.createCharacterSheet` (`character-io.js:185`) builds Markdown but has no caller in the
app: no button in `creator/index.html`; only `scripts/test-improvised.js:189,196` calls it.
**[Designer, new]** It gets the same branch, for consistency with the Improvised branch there; only
a Node test can reach it.

Both are plain text and write the text as typed (§5).

## 5. Text safety

Player text reaches HTML through `name`, `description`, `effect`, `traits`, `keywords`, the stat
line and the bonus source name. Today many sites interpolate book text raw (for example
`character-sheet-tab.js:915,952,954,970`). The `escapeHtml` helpers in `character-sheet-tab.js:2585`
and `wargear-tab.js:910` use `textContent` → `innerHTML`, which does not escape `"` or `'`.
Tooltips are built as `title="${this.escapeHtml(...)}"`; the Resilience and Defence tooltips
(`character-sheet-tab.js:514`) contain the armour name (`derived-stats.js:589,667,670,700`), and
the attribute tooltip (`character-sheet-tab.js:763`) contains the augmetic name. A custom item
named `x" onmouseover="...` would break out of the attribute.

**[Designer, new]** Rules:

1. Escape at output, not at input. The stored record holds the text as typed. The text exports
   need the raw text, and escape-at-input would show `&amp;` there.
2. `escapeHtml` in `character-sheet-tab.js` and `wargear-tab.js` becomes a string replace of
   `&`, `<`, `>`, `"`, `'` (to `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`). It is then safe in text
   and in a double- or single-quoted attribute. `talents-tab.js` has no helper and gets the same
   one. `CustomWargear` has its own, as `ImprovisedBuilder` does (`improvised-builder.js:397-407`).
3. Escape every item text field at every HTML site that can show a custom item, for book and custom
   items alike. The book data has no HTML: no `<` tag in any `name`, `description`, `effect`,
   `traits` or `keywords` of `weapons.json`, `armor.json` or `equipment.json` (checked), so
   escaping book text changes no output. Sites (checked against the code):
   - `wargear-tab.js`: name `:178,202`, category `:179,203`, and the new custom branch;
   - `character-sheet-tab.js`, weapons: traits `:915`, description `:952`, keywords `:954`, name
     `:970` (the book-name branch; the relic branch `:967` also prints the base `weapon.name`,
     which is never custom, and is escaped all the same);
   - armour: traits `:1094`, name `:1106` (and the base name in `:1105`), description `:1109`,
     keywords `:1111`;
   - augmetics: name `:1188` (and `:1187`), description `:1190`, keywords `:1192`, effect `:1211`;
   - equipment: name `:1265` (and `:1264`), description `:1268`, keywords `:1270`, effect `:1289`;
   - talent choice: escape `choiceDisplay` where it is set from the item name (`:1655`); that
     covers both `nameWithChoice` (`:1662`) and `Chosen: ...` (`:1669`);
   - `talents-tab.js`: escape `choiceDisplay` where it is set from the item name (`:323`), which
     covers `displayName` (`:329,332`) printed at `:351`.
4. Attribute contexts: the tooltips at `character-sheet-tab.js:514` (armour names),
   `:763` (augmetic bonus source names) and `:944-947` (numbers and talent names) use the fixed
   `escapeHtml`. The new modal escapes every prefilled `value="..."` and textarea body.
5. Checked and safe with no change: the breakdown popup lines (escaped, `character-sheet-tab.js:2468-2470`);
   the weapon damage, ED, AP and dice tooltips, whose bonus sources are talent and upgrade names
   (`:2165-2167,2346-2391`); the upgrade modal title (`textContent`, `wargear-tab.js:805`); the
   talent choice buttons (`textContent`, `talents-tab.js:104`); the Remove confirm (native
   `confirm`). The stats tab never prints an equipment bonus source (`stats-tab.js:155-168`).
6. Glossary enhancement (`glossary.js:545-557`) runs a term regex over `innerHTML`, so it sees
   escaped text. No glossary term name is `amp`, `lt`, `gt`, `quot` or `39` (checked over all 927
   names), so it cannot match inside an entity.
7. Text outputs (copy as text, `createCharacterSheet`) are not HTML and write raw text. Book names
   are not escaped there either.

## 6. Tests and housekeeping

### 6.1 `scripts/test-custom-wargear.js`

In the pattern of `scripts/test-improvised.js`: `node scripts/test-custom-wargear.js`, a `vm`
sandbox, hand-written stubs (`State` with a `character.wargear` array; `DataLoader.cache` filled
from the real JSON files), the `check(name, actual, expected)` helper, and a non-zero exit on
failure. Behaviors:

- Data guard: no id in `weapons.json`, `armor.json`, `equipment.json` starts with `custom_`.
- Resolver (`data-loader.js` in the sandbox): `getWeapon` returns a `weapon` record and
  `undefined` for an `armor`, `augmetic` or `other` record with the same id; `getArmor` returns
  only `armor`; `getEquipment` returns `augmetic` and `other` and nothing else; `getWargearItem`
  finds all four kinds; an unknown `custom_` id, or a `custom_` id on an entry with no `custom`,
  gives `undefined`; a book id gives the book record; with no `State` defined, a `custom_` id gives
  `undefined`; `getAllWeapons`/`getAllArmor`/`getAllEquipment` never contain a custom record.
- `buildRecord`: the Xenotech Blade form gives exactly the §2.4 `custom` object; the augmetic form
  gives exactly the §2.5 `custom` object; a ranged form gives `range {short,medium,long}` and
  `salvo` and no `reach`; a melee form gives no `range` or `salvo`; an armour form gives `ar` and
  no weapon keys; an augmetic form with no bonus rows gives no `bonuses` key; an Other form gives
  `category: "Other"`, `effect: ""`, `keywords: []` and no `bonuses`; blank value and rarity give
  no keys.
- `normalizeEntry`: each rule of §2.8, one check per rule: non-object `custom`; unknown kind;
  out-of-range and non-numeric numbers; over-long strings; lower-case and duplicate keywords; a
  typed `shield` becomes `Shield`; an augmetic bonus with an unknown key (`wounds`), a 0, a 99 and
  a string other than `rank`/`doubleRank` is dropped, `"rank"` is kept, an all-invalid object
  removes `bonuses`; `bonuses` on an Other or a weapon is removed; a bad id and a duplicate id get
  new unique ids and `custom.id === entry.id`; `relic`, `improvised` removed;
  `upgrades`/`equipped` removed from a non-weapon; the entry count never changes.
- `newId`: matches `/^custom_[a-z0-9]{8}$/` and avoids every id in `usedIds`.
- `ratedTraits`: weapons contain `Rad`, `Rending`, `Blast`, `Inflict` and not `Agonising`,
  `Brutal`, `Haywire`, `Volatile`; armour contains `Bulk` and not `Shield`, `Bulky`; every name it
  returns is in the glossary list of that kind.
- `formatStatLine`: the melee, ranged, armour, augmetic and Other forms of §4.2.
- State (`state.js` in the sandbox): `addCustomItem` pushes one entry with a fresh id;
  `updateCustomItem` keeps the id, replaces the record, and clears `upgrades` only on a type
  change; `loadCharacter` of a `JSON.parse(JSON.stringify(character))` copy gives an equal
  `wargear`; `loadCharacter` repairs a malformed entry in place.
- Custom archetype reset (`setCustomArchetype`, with a stubbed `resetStats` and talent data):
  wargear `[book, custom A, book, custom B]` becomes `[custom A, custom B]`; Trademark Weapon on
  custom B (index 3) becomes 1; Armour-Monger on a book item becomes `null`; a talent with a
  non-index choice keeps it.
- Derived stats (`derived-stats.js` in the sandbox): a custom armour with AR 5 is the best armour;
  a custom item with the `Shield` trait counts as shield AR; the §2.5 augmetic gives
  `getEquipmentBonuses(...).strength` = `[{ value: 1, source: "Hydraulic Spine" }]` and lowers
  effective Agility by 1; a `"rank"` Resilience bonus at rank 3 adds 3; an Other item adds nothing.
- Sheet range text: a helper (or the extracted cell logic) gives `2m` for `reach: 2`, `range: 2`
  and `range: "2"`, `Thrown S x 4` for that string, `-` for none, and the ranged text plus
  `Salvo 2` for a ranged weapon with `salvo: 2`.
- Escaping: the `escapeHtml` of `character-sheet-tab.js`, `wargear-tab.js` and `talents-tab.js`
  (load each object in the sandbox) maps `<a href="x">'&` to
  `&lt;a href=&quot;x&quot;&gt;&#39;&amp;`.

### 6.2 Browser check

Serve the repo root on port 8137 and open `/creator/`. Create the Xenotech Blade, a ranged weapon,
an armour with `Shield`, the §2.5 augmetic, and an Other item; give each a name with
`<b>"x'</b>&`. Check the owned list (augmetic under Augmetics), the sheet (weapon table with melee
range and Salvo, armour, augmetics, equipment, the Strength and Agility tooltips, Resilience and
Defence tooltips), a book Whip and a book `greataxe_aoa` in the weapon table, Trademark Weapon and
Armour-Monger, an upgrade, switching to a custom archetype (custom items stay), print preview, copy
as text, file export, reload (autosave), and file import. The name shows as typed everywhere, and
nothing renders as HTML.

### 6.3 Cache busting

Per `CLAUDE.md`: add `<script src="js/custom-wargear.js?v=N">` to `creator/index.html` after
`js/improvised-builder.js` (`creator/index.html:533`), and bump every `?v=` in
`creator/index.html` together (120 → 121 at this commit). No `data/` file changes, so the creator
data `?v=` in `creator/js/web-api.js` stays. No `shared/` file and no bestiary file changes.

## 7. Left to the builder

- The modal layout, the CSS for the form, the chips and the bonus rows (reuse the Improvised
  builder classes where they fit; new classes use the CSS variables of `STYLE_GUIDE.md`).
- The random source for `newId` (`Math.random` is enough).
- The exact wording of validation messages and of the card text.
- Whether the trait list is a `<select>` or a filtered list.
- The split of the plan into tasks. Suggested order: (1) `CustomWargear` pure helpers, resolver,
  State mutators, normalization, the archetype reset, and the test script; (2) the escaping changes
  of §5 with their tests; (3) the modal, the bonus editor and the Wargear tab changes; (4) the sheet
  Range/Salvo cell and copy as text; (5) cache busting and the browser check.

## 8. Decisions by the owner

- D1. A fourth kind, Augmetic, shows in the Augmetics area of the sheet, and "the player can also
  give stat bonuses (for example +1 Strength) that the sheet applies" (§2.3, §2.5, §3.5).
- D2. Range shows for every weapon, book and custom: "It might be worth adding range for every
  weapon." (§4.1). Salvo for every ranged weapon remains a designer's call.
- D3. Book traits belong in the glossary lists, and a custom trait stays possible: "If they're
  defined in the books, then the player shouldn't have to type them. There should be an option for
  a custom trait though." (§3.3). The glossary data fix is a separate data task that ships before
  this feature.
- Approval: the owner approved this design on 2026-11-13 ("The design looks good for custom
  items."), with D3 as the one change.
