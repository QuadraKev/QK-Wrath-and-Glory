# Holy Relic Mechanic (Redacted Records II) — Design

Date: 2026-07-11
Source: Redacted Records II, pp. 12–19 ("Holy Relics"). PDF page = printed page (offset 0).
Status: Approved (design presented and approved in-session).

## Goal

Let a player build a Holy Relic in the Character Creator as a mostly universal wargear
option: pick any eligible piece of wargear as the relic's base item and layer the book's
relic properties (Form, Origins, Power, Oddities) on top of it, following the RR2 GM
process. Creator-only UI; the relic tables live in the shared dataset.

## Approved decisions

- **One Power per relic** (book RAW: "Choose a Power").
- **Grenade or Missile Weapon form uses the Ammunition Relic Powers table** (the Sacred
  Shells sidebar groups relic grenades/missiles with relic ammo as single-use).
- **Roll buttons on every step** alongside manual choice, matching the book's dice
  (Form 2d6 on the 6×6 table, Origins/Powers/Oddities 1d6, Enemy Keyword 4d6).
- **Creator-only for now** — no Compendium/Rules Reference rendering, no bestiary changes.
- **No stat automation**: relic powers are display text (like talent text). E.g. Defender's
  +2 Defence is NOT applied to derived stats. Possible follow-up.
- **No relic ammunition**: the Relic Form table has no Ammunition form. The Ammunition
  powers table is reachable only via the Grenade or Missile form.
- **Unique-rarity wargear excluded** from base-item selection (rarity string `"Unique"`).
- **Edit support**: an owned relic can be reopened in the wizard prefilled and re-saved.

## User flow (wizard steps)

1. **Name** — required free-text custom name for the relic.
2. **Relic Form** — the 19 distinct forms from the 2d6 table, grouped (Weapons / Armour /
   Other). Roll button rolls the actual 6×6 table (first d6 = column, second d6 = row) so
   probabilities match the book's cell frequencies.
3. **Base item** — searchable list of wargear matching the form's filter (see Form
   filters). Unique rarity and `Vehicle -*` categories always excluded.
4. **Original Owner** — 6 options with verbatim descriptions + Roll 1d6.
5. **Anointment** — 6 options with verbatim descriptions + Roll 1d6.
6. **Relic Power** — the 6 powers of the form's powers table, full verbatim text + Roll
   1d6. If the power declares a sub-choice, a dependent picker appears:
   - `enemyKeyword` (Holy Hatred, Piercing Hatred, Blessed with Hatred, Logic of Hatred):
     the 21-keyword 4d6 table + Roll 4d6.
   - `attributeOrSkill` (Transformative Strength): any Attribute except Strength, or any
     Skill.
   - `skill` (Blessing of [Skill]): any Skill.
   - `condition` (Countersmite): the conditions from `glossary.json` (`conditions` object,
     14 entries).
7. **Oddities** — 6 checkboxes (multi-select, 0+; typically 1) + Roll 1d6 (adds one).
8. **Summary → Add** — review everything, then add to the character's wargear.

Changing Form resets Base item and Power (they depend on it). Grenade/missile relics show
the Sacred Shells single-use note in the wizard and in owned-item detail.

## Architecture

### Storage: base-item id + relic overlay

A relic is a normal `character.wargear` entry whose `id` is the base item's real id, plus
a `relic` object:

```js
{ id: 'bolt_pistol', isStarting: false, upgrades: [],
  relic: {
    name: "Absolution's Call",     // custom name (required)
    form: 'bolt_weapon',           // form id in holy-relics.json
    originalOwner: 'adeptus_ministorum',
    anointment: 'banished_a_daemon',
    power: 'piercing_hatred',
    powerChoice: 'Ork',            // only when the power declares a sub-choice
    oddities: ['oathbound']        // 0+ oddity ids
  } }
```

Rationale: every consumer (derived-stats armor breakdown, weapon damage math, the upgrade
modal, sheet rendering) resolves stats via `DataLoader.getWargearItem(item.id)`, so all
stat plumbing keeps working unchanged — matching the book ("a Relic Bolt Pistol begins
with the same Damage, ED, Range, Weapon Traits and Keywords as a mundane Bolt Pistol").
Weapon relics keep the Upgrades button. `State.loadCharacter` spreads saved data
wholesale, so `relic` round-trips through save/load with no IO changes.

### Data: `data/holy-relics.json` (new shared file)

All rules text VERBATIM from RR2 (including the "consumes far less ammunition that it
should" typo in Blessed Efficiency). Structure:

```jsonc
{
  "source": "redacted2",
  "page": 12,
  "formTable": [ /* 6 rows × 6 cols of form ids; formTable[row-1][col-1] */ ],
  "forms": { /* 19 entries: id → { name, powersTable } */ },
  "origins": {
    "originalOwner": [ /* 6 × { id, roll, name, description } */ ],
    "anointment":    [ /* 6 × { id, roll, name, description } */ ]
  },
  "powers": {
    "melee":      [ /* 6 × { id, roll, name, description, choice? } */ ],
    "ranged":     [ /* … */ ],
    "ammunition": [ /* … */ ],
    "armour":     [ /* … */ ],
    "augmetic":   [ /* … */ ],
    "tool":       [ /* … */ ]
  },
  "enemyKeywords": [ /* 21 × { roll, keyword } — 4d6 values 4–24 */ ],
  "oddities": [ /* 6 × { id, roll, name, description } */ ],
  "sacredShells": "…sidebar text verbatim…"
}
```

Loaded via `DataLoader.loadFile('holy-relics.json')` (added to `loadAll`), getter
`DataLoader.getHolyRelics()`.

### Form → powers table mapping

| Forms | Powers table |
|---|---|
| Mundane Melee, Chain, Power, Force, Exotic Melee Weapon | `melee` |
| Projectile, Las, Flame, Plasma, Melta, Bolt Weapon | `ranged` |
| Grenade or Missile Weapon | `ammunition` |
| Mundane Armour or Clothing, Powered Armour, Power Field | `armour` |
| Augmetic | `augmetic` |
| Common/Uncommon/Rare Tool or Equipment | `tool` |

### Form → base-item filters (JS, in the wizard module)

Global rules: exclude `rarity === 'Unique'`; exclude weapon categories starting with
`Vehicle`. Weapon category spellings are normalized (dataset has e.g. both "Chain" and
"Chain Weapons" — match after stripping a trailing " Weapons"/" Weapon").

- **Augmetic**: equipment, `category === 'augmetic'`.
- **Common/Uncommon/Rare Tool or Equipment**: equipment with that exact rarity, category
  NOT in {`augmetic`, `clothing`, `vehicle wargear`, `relic`, `ritual`}.
- **Mundane Melee Weapon**: melee, category `Low-Tech`.
- **Chain / Power / Force Weapon**: melee, normalized category `Chain` / `Power` / `Force`.
- **Exotic Melee Weapon**: melee, normalized category NOT in {`Low-Tech`, `Chain`,
  `Power`, `Force`} (Exotic, Chaos, Ork, Aeldari, Votann, Arc…).
- **Projectile Weapon**: ranged, normalized category `Solid Projectile`.
- **Las / Flame / Plasma / Melta / Bolt Weapon**: ranged, normalized category matches.
- **Grenade or Missile Weapon**: same rule as the wargear browser's grenades filter
  (category in {`Grenade`, `Missile`, `Explosive`} or GRENADE/MISSILE keyword).
- **Mundane Armour or Clothing**: armor entries with no `Powered (N)` trait and not
  `invulnerable`, PLUS equipment `category === 'clothing'`.
- **Powered Armour**: armor with a `Powered (N)` trait.
- **Power Field**: armor with `invulnerable: true` (the dataset's marker for the book's
  starred AR / force fields).

### UI

- Entry point: a distinctive "Holy Relic" card pinned at the top of the wargear browser
  (`creator/tabs/wargear-tab.js` → `renderWargearBrowser`), visible only when
  `State.isSourceEnabled('redacted2')`.
- Wizard: new module `creator/js/relic-wizard.js` (global `RelicWizard`), own modal
  (pattern: the existing upgrade modal), Back/Next navigation with per-step validation.
  `RelicWizard.open()` for create; `RelicWizard.open(wargearIndex)` for edit (prefilled).
- Attributes/Skills lists for sub-choices are consts in the wizard module (the app has no
  shared canonical list module).
- New CSS in `creator/css/styles.css` for wizard steps, option cards, and the Holy
  Relic badge.

### State

- `State.addWargear(itemId, isStarting)` gains an optional relic payload — new method
  `State.addRelicWargear(itemId, relic)` and `State.updateRelicWargear(wargearIndex,
  relic)` for edit (both push/patch the entry and notify `'wargear'` listeners).

### Display integration (creator only)

- **Owned wargear list** (`wargear-tab.js`): relic entries show the custom name, a
  "Holy Relic" badge, and the base item name; detail lines for form, origins, power
  (name + text + chosen parameter), oddities; Edit + Remove buttons. Grouped normally
  (weapon relics under Weapons, so Upgrades still available).
- **Character sheet** (`character-sheet-tab.js`): weapons/armor/equipment rows show the
  relic's custom name with the base name in parentheses; a Holy Relic detail block lists
  each relic's power and oddities text (like talent text). Plain-text export includes
  relic name, base item, power, and oddities.
- **Derived stats**: untouched.

## Book quirks (recorded, not fixed)

- The 2d6 Form table has 36 cells but only 19 distinct forms (e.g. Projectile Weapon
  appears 5 times). The picker shows 19; the Roll button uses the full table.
- The book's worked example ("He rolls a 3, then a 1. The Relic is a Force Weapon") does
  not match its own table under either die order (Force Weapon is at column 1, row 6).
  We read the first d6 as column, second as row.
- "Guided" convention from other books does not apply here; no new weapon traits are
  introduced by this feature.

## Cache busting

- Bump the data `?v` in `creator/js/web-api.js` (currently v36).
- Add the `relic-wizard.js` script tag and bump `?v` on ALL script/link tags in
  `creator/index.html` together.

## Verification

No test framework (no-build vanilla JS). Verify by JSON parse checks plus a Playwright
browser run against `http://localhost:8137/creator/`:

1. Build a weapon relic (e.g. Bolt Pistol, Piercing Hatred + enemy keyword), an armour
   relic (Blessing of [Skill]), and a tool relic — through the full 8-step wizard.
2. Confirm owned-list display, character-sheet display, and text export.
3. Confirm Unique-rarity items and Vehicle categories never appear as base items.
4. Confirm upgrades still work on a relic weapon; equip toggle works; damage math uses
   base stats.
5. Save the character, reload, confirm the relic round-trips.
6. Edit a relic (change power), confirm update. Remove it, confirm gone.
7. Confirm the Holy Relic card disappears when the Redacted Records II source is disabled.

## Out of scope / follow-ups

- Compendium/Rules Reference rendering of the relic tables (both apps).
- Automating power effects into derived stats.
- Relic ammunition as an upgrade-style pick.
- Bestiary support.
