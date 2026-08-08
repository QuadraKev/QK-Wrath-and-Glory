# Followers — design

Date: 2026-08-07
Issue: #21 "[Feature] Minion/Companion"
App: creator only. The bestiary does not change.

## Goal

Let a character keep followers — a single creature or a mob — on the character sheet, so the
player can review and track them in play. Followers reuse the threat statblocks in
`data/threats.json`, which only the bestiary reads today.

## Rules background

Several talents grant followers. They agree on the shape: choose a Threat, then use the printed
statblock.

| Source | Shape | Alternative stats |
| --- | --- | --- |
| Devotees (core p132) | Mob of Troops, Double Rank + 2 members | Yes |
| Companion (apocrypha p234) | One Troop | Yes |
| Companion, Elite (apocrypha p234) | One Elite | Yes |
| Familiar (apocrypha p236) | One Troop, Tiny or Small | Yes |
| Animal Companion (aeldari p60) | One BEAST, not Adversary at your Tier | No |
| Arbites Leashmaster (lex p12) | Cyber Mastiff | No |

The alternative stats are: Attributes and Skills equal `1 + Double Rank`, and neither can be
higher than the character's own value.

Two talents are NOT follower sources. Supreme Presence (core p140) sets Interaction Attack
targets. Daemonic Summons (dh p114) summons a Threat for 3 rounds, which is temporary and thus
not a roster entry.

## Scope decisions

1. `threats.json` loads on demand, never at startup.
2. Followers get their own builder section and a character-sheet block.
3. The picker is freeform. Any of the 844 threats can be a follower.
4. In scope: the alternative-stats toggle, live wounds and shock tracking, mob size with the
   attack bonus, and the full statblock card.
5. Followers cost no experience points. The talents that grant them already do.

## Data model

Add one array to `createNewCharacter()` in `creator/js/state.js`:

```js
followers: []
```

`State.loadCharacter()` spreads a blank character before it applies the loaded data, thus old
saves get the empty array automatically. No migration code is necessary.

Each follower:

```js
{
  id: "flw_1",                  // local id, for list operations
  threatId: "cyber_mastiff",    // key into data/threats.json
  name: "",                     // optional custom name; falls back to the threat name
  kind: "individual" | "mob",
  count: 1,                     // starting members; mob only
  livingCount: 1,               // current members; mob only. Drives the attack bonus
  useAlternativeStats: false,   // use 1 + Double Rank instead of the printed statblock
  currentWounds: null,          // null = undamaged
  currentShock: null,
  notes: ""
}
```

### The alternative-stats toggle

`useAlternativeStats` is a plain per-follower toggle. It is always available, and the app does
not try to work out which talent granted the follower. The player decides when the rule applies,
which matches how the picker itself is freeform.

The toggle carries the rule and its sources in its label and help text, so the decision is
informed:

> **Alternative stats** — Attributes and Skills become 1 + Double Rank, and neither can exceed
> your own. Granted by Devotees (core p132), Companion and Companion (Elite) (apocrypha p234),
> and Familiar (apocrypha p236). Animal Companion and the Arbites Cyber Mastiff use the printed
> statblock instead.

The default is off, which gives the printed statblock.

This drops the automatic Double Rank + 2 member count that a Devotees-aware design could have
filled in. The mob count is a plain number input the player sets. That is the intended trade:
one toggle and one number beats a talent registry that has to be kept in step with the data.

## Lazy loading

`data/threats.json` is 2.64 MB. The creator loads 2.21 MB in total today, thus an eager load
more than doubles every page load, including for players who never use followers.

Add `DataLoader.ensureThreatsLoaded()` to `creator/js/data-loader.js`:

- It fetches `threats.json` and `threat-weapons.json` through the existing
  `window.api.loadGameData()`, which applies the `?v=` cache-buster.
- It is idempotent and returns a promise. Concurrent calls share one fetch.
- It caches into `DataLoader.cache` with the same keys the other files use.

Two call sites await it, and both show a loading state:

1. The Followers section, when it is first opened.
2. `App.checkAutoSave()` and `CharacterIO.load()`, when the loaded character has a non-empty
   `followers` array, so the character sheet can render.

Add `getThreat(id)` and `getAllThreats()` accessors that mirror the bestiary's.

## New builder section

The section is appended as "10. Followers". An insert next to Talents would renumber sections 5
through 9 in the sidebar, which changes the numbers current users already know.

Files to touch:

| File | Change |
| --- | --- |
| `creator/js/app.js` | add `'followers'` to `SECTION_ORDER` (line 11) |
| `creator/js/app.js` | add a case to `refreshCurrentSection()` (line 296) |
| `creator/js/app.js` | add `FollowersTab.init()` to `App.init()` |
| `creator/js/state.js` | add `followers: []` and the follower methods |
| `creator/index.html` | add the sidebar item and the section container |
| `creator/index.html` | add the script tags for the three new files, and bump `?v=` |
| `creator/tabs/followers-tab.js` | new — the picker and the roster UI |
| `creator/js/followers.js` | new — the pure rule functions |
| `creator/js/threat-card.js` | new — the ported statblock card |
| `creator/tabs/character-sheet-tab.js` | add `renderFollowers()` |
| `creator/js/data-loader.js` | add the lazy loader and the accessors |
| `creator/css/styles.css` | add the ported threat-card styles |

State methods, beside the existing state methods: `addFollower(threatId)`,
`removeFollower(id)`, `updateFollower(id, patch)`. Each calls `notifyListeners('character')`,
which triggers the existing auto-save.

## The picker

`creator/tabs/followers-tab.js` shows a searchable list of all threats:

- Search by name.
- Filter by role at the character's Tier, read from `tierThreat`: Troop, Elite, or Adversary.
- Filter by keyword.
- Filter by size.

No filter blocks a choice. The filters only narrow the list.

Each follower in the roster shows: the custom name, the Devotees flag, individual or mob, the
member count, the stats toggle when permitted, a notes field, and a remove control.

## Statblock card

Port `renderThreatCard` and its sub-renderers from `bestiary/tabs/threats-tab.js` into
`creator/js/threat-card.js`. The sub-renderers are `renderTierThreatTable`,
`renderAttributesTable`, `renderResilienceRow`, `renderCombatStatsTable`, `renderSkillsRow`,
`renderAbilities`, `renderBonuses`, `renderDeterminationRow`, `renderTextSection`, and
`renderBottomStatsTable`. They are pure functions of the threat object.

Two helpers come with them: `getThreatWeapon(weaponId)` and `formatSourcePage(threat)`.

Drop `renderAddToEncounterHeader`, which is specific to the encounter builder.

Port the `threat-card` styles into the creator stylesheet.

This creates a third parallel copy, beside `references-tab.js` and `glossary-tab.js`, which is
the repository's existing convention. The copies can drift. A later change that unifies them
into `shared/` is out of scope here, because it would rewrite working bestiary code.

## Computed rules

Two pure functions live in `creator/js/followers.js` so a test can call them without a browser.

Mob attack bonus, which is the formula `getMobAttackBonus()` in
`bestiary/js/encounter-state.js` already uses, at line 458:

```js
mobAttackBonus(livingCount) =
    Math.max(0, Math.min(livingCount - 1, Math.floor(livingCount / 2)))
```

The outer `Math.max(0, …)` matters. Without it, a mob of 0 living members returns -1. The
bestiary clamps the same way at line 462.

Alternative stats, which apply only when `useAlternativeStats` is true and the source permits
it:

```js
value = Math.min(1 + 2 * rank, characterValue)
```

Attributes map from the threat keys to the character keys: `S`→strength, `T`→toughness,
`A`→agility, `I`→initiative, `Wil`→willpower, `Int`→intellect, `Fel`→fellowship. The character
value comes from `DerivedStats.getEffectiveAttribute()`.

Threat skills are a free-text string, thus the card shows one line, `All Skills: N`, rather than
a parse of the printed string.

All four talents redefine Attributes and Skills only. None says anything about Wounds, Shock,
Defence, or Resilience, thus those keep the printed values. The card labels the mode, so the
reader can see which values changed.

## Character sheet

Add `renderFollowers(character)` to `creator/tabs/character-sheet-tab.js` and append it to
`sheet-body-right`, after `renderHolyRelics` at line 77.

Each follower shows:

- The name and the threat name.
- The full statblock card.
- Wounds and shock tracking boxes, through the existing `renderTrackingBoxes` helper.
- For a mob: the living-member stepper and the current attack bonus.

## Testing

Add `scripts/test-followers.js`, which follows `scripts/test-bonus-resolution.js`: plain Node,
no dependencies, exit code 1 on failure.

Cases:

1. `mobAttackBonus` for counts 0, 1, 2, 3, 4, 5, 10. Expect 0, 0, 1, 1, 2, 2, 5.
2. Alternative stats at rank 1, 2, and 3, which give 3, 5, and 7.
3. The cap. A rank 3 character with Strength 4 gets 4, not 7.
4. The threat-key to character-key attribute map covers all seven attributes.
5. Every `threatId` a test follower can hold resolves in `data/threats.json`.

Browser verification:

1. Startup does NOT fetch `threats.json`. Check the network requests.
2. Opening the Followers section fetches it once, and a second visit does not refetch.
3. Add a Cyber Mastiff. The card renders with the printed statblock and the toggle is off.
4. Turn the alternative-stats toggle on. Attributes and Skills switch to 1 + Double Rank, capped
   at the character's own, and the card labels the mode. Turn it off and the printed values
   return.
5. Switch a follower to a mob, set the count, and confirm the attack bonus matches
   `mobAttackBonus`.
6. Wounds and shock tracking persists through an auto-save and a reload.
7. Save to file and load back. The followers array round-trips.
8. A character saved before this feature loads with an empty followers array.

## Out of scope

- Temporary summons, such as Daemonic Summons, which last 3 rounds and are thus not roster
  entries. A player can still add one by hand, because the picker is freeform.
- Any bestiary change.
- Unifying the threat-card renderer into `shared/`.
- Experience-point or Influence costs for followers.
