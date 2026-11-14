# Character Sheet Tabs (creator) — Design

Date: 2026-11-13, revised 2026-11-13 after the owner's answers, a builder check, and the owner's
change to the compact mode. Issue: #25 "Placing/organizing the part of the character sheet into
tabs" (creator).
Status: approved by the owner on 2026-11-13 (§12).

Marks used below: **[Owner]** is a decision in the owner's words. **[Designer]** is a designer's
call that the owner saw and did not change. **[Designer, new]** is a call made while writing this
spec. Line references are to the tree at commit `079c581` and are evidence only. Issue #33 (Custom
Wargear) and the `issues-31-32` branch merge first and move lines in `character-sheet-tab.js`, so
every requirement names functions, classes and selectors, not lines.

## 1. Goal and scope

Today the Character Sheet is one long page: a header, then a left column (stats, powers, abilities,
background, notes) and a right column (wargear, followers). In play, the player scrolls to find a
block. This design splits the sheet into tabs, so that each block a player needs is one click away,
and keeps the character identity and the three combat trackers at the top of every tab.

The owner's reasons **[Owner]**: players look at Attributes, Traits and Skills "when rolling tests";
they look at Wargear "often since combat is a common part of the game"; they "need to reference
their abilities throughout many parts of the game". Character details "should supersede the tabs and
be visible regardless of the tab chosen".

Goals:

- Seven tabs in the owner's order: Character, Stats, Abilities, Wargear, Psychic Powers, Followers,
  Notes **[Owner]**.
- A strip above the tab bar with the name, species, archetype, Tier, Rank, keyword chips, and the
  Wounds, Shock and Wrath trackers, so that "a player on the Wargear tab can then mark a wound with
  no tab change" **[Owner]**.
- Print and Copy Summary keep working, with all content.
- The tab bar works with a keyboard and a screen reader.

Non-goals:

- No change to any block's content, except the move of Mutations out of Injuries & Corruption
  (§3.2), the move of the Wounds, Shock and Wrath trackers from Traits to the strip (§4.3), and the
  new Details block (§3.1).
- No markup change inside the blocks that #33 owns or that this feature only moves: `renderWeapons`,
  `renderArmor`, `renderAugmetics`, `renderEquipment`, `renderHolyRelics`, `renderFollowers` and
  `renderFollower` (§5.2, §9).
- No change to Copy Summary **[Designer]**.
- No change to the builder tabs, the bestiary, or the data.
- The feedback widget's "Section" label (`shared/feedback.js:30-35`) stays "CHARACTER SHEET"; it does
  not name the sheet tab.
- Keyboard access to the Wounds and Shock boxes and to the follower boxes. All of them are `<span>`s
  today, and they stay `<span>`s **[Designer, new]**: about 50 boxes as tab stops would put the tab
  bar out of reach. This is not a regression.

Anti-goals (do not do):

- Do not keep the selected tab in the URL hash or in `localStorage` **[Designer, new]** (§5.1).
- Do not keep a second live copy of the Wounds, Shock or Wrath controls anywhere (§4).
- Do not re-render on a tab switch, and do not re-render on a notes keystroke (§5).
- Do not remove inactive panes from the DOM; print needs them (§7).

Where the ten design problems are settled: strip (1) §4; Character tab (2) §3.1; re-render (3) §5.2;
visibility (4) §3.3; wide screens (5) §2.3; print (6) §7; tab bar semantics (7) §6; removal (8) §8;
selected-tab storage (9) §5.1; Custom Wargear (10) §9.

## 2. Layout

### 2.1 DOM structure

`render()` still writes one `innerHTML` into `#character-sheet-content` (`creator/index.html:429`).
`.sheet-actions` (Copy Summary, Print) stays above it, unchanged **[Designer]**. The new markup:

```
#character-sheet-content
├── div.sheet-strip                        ← pinned in full mode; display: contents in compact mode
│   ├── div.sheet-section.sheet-header-section   ← identity: name, subtitle, keyword chips
│   └── div.sheet-strip-bar                ← pinned in compact mode
│       ├── div.sheet-strip-trackers       ← Wounds boxes, Shock boxes, Wrath counter
│       └── div.sheet-tabbar[role=tablist]
│           └── button.sheet-tab-btn[role=tab] × visible tabs
└── div.sheet-panes
    └── div.sheet-pane[role=tabpanel] × visible tabs, in tab order; inactive ones have `hidden`
```

The strip and the panes must stay direct children of `#character-sheet-content`, so that the
pinned element's containing block spans the whole sheet. Pinning is `position: sticky; top: 0`.
The scroller is `#tab-character-sheet` (`.tab-fullwidth`, `creator/css/styles.css:250-255`); no
ancestor between it and the strip may get `overflow`. The pinned element has an opaque background
(`var(--bg-primary)` or the header gradient) and a `z-index` low enough to stay under every popup and
modal, for example 5. The lowest of those is the backdrop of the mobile drawer at 899
(`creator/css/styles.css:4386`); the drawer (`.sidebar`) is at 900 (`:4366`).

The `renderHeader` output becomes the identity part; it keeps the classes `sheet-section
sheet-header-section`, `sheet-character-name`, `sheet-subtitle`, `sheet-keywords` and
`sheet-keyword`, so that the glossary enhancement and the existing print rules still apply.

### 2.2 The two modes, box sizes, and the pinned height

**Box counts to design for.** `calculateMaxWounds` (`creator/js/derived-stats.js:305-324`) is
2 × Tier + Toughness + species `woundBonus` + background bonuses + Uncanny (Wounds) and Feel No Pain
(each + Rank) + mutation and ability `maxWounds` bonuses. The largest real value: Tier 5 (10),
Custodian Toughness maximum 14 plus 2 from Augmetic Viscera and Cardioproxy (16), the Custodian
`maxWounds` bonus (4), three background bonuses (3), Rank 5 twice (10), and the three mutations with
a `maxWounds` bonus (2 + 2 + 3) — **50**. `calculateMaxShock` (`:326-342`) is Willpower + Tier +
background, sub-option, Uncanny, mutation and ability bonuses. The largest: Aeldari Willpower maximum
12 plus 2 from Autodogmatic Cortex and Neuroplastic Psychosectemy (14), Tier 5, three background
bonuses (3), Path of the Mourner (+ Rank, 5), Uncanny (5), a mutation (2) — **34**. The layout is
sized for 50 Wounds and 35 Shock **[Designer, new]**. A larger value only adds a row; nothing
breaks. A typical Tier 1–3 character has 8–20 Wounds and 5–15 Shock.

**Full mode** (wider than 768px and taller than 600px) **[Designer, new]**: the whole `.sheet-strip`
is pinned.

- Identity part: compact; the name is smaller than today's 28px; subtitle and chips as today.
- Tracker part: a grid of three columns — label (about 64px), boxes (the rest), and the Wrath counter
  (about 110px) spanning both rows. Wounds is row 1 and Shock is row 2. Boxes are 18px with a 4px
  gap, as today (`.tracking-box`, `.tracking-boxes`, `creator/css/styles.css:3196-3221`); inside the
  strip `.tracking-boxes` drops its `max-width: 450px` and its centering, and wraps to the left.
- Boxes per row (22px pitch): about 30 in the 900px sheet (769–1399px viewports above about 1000px),
  22–23 at a 769–850px viewport, and about 50 at 1400px and up. So 50 Wounds take 2 rows on desktop,
  3 rows on a narrow tablet, 1 row on a wide screen.

**Compact mode** (`@media (max-width: 768px), (max-height: 600px)`): the Wounds and Shock boxes stay
pinned and wrap to as many rows as they need. The owner: "On narrow viewports, Wounds/Shock boxes
can fill up multiple rows if needed. Probably the cleanest way to do it." **[Owner]**.

- `.sheet-strip` gets `display: contents`, and `.sheet-strip-bar` (the trackers and the tab bar) is
  pinned. The identity part (name, subtitle, keyword chips) scrolls away with the page
  **[Designer, new]**: it is still at the top of every tab, and leaving it out makes the pinned part
  90–120px shorter on a phone.
- Tracker part **[Designer, new]**: a grid of two columns — label (about 52px) and boxes (the rest).
  Wounds is row 1, Shock is row 2, and the Wrath counter is row 3 (buttons at least 32×32px).
  Boxes are 22px with a 4px gap, a larger touch target than the 18px of full mode; the 26px pitch
  also meets the WCAG 2.2 24px target-spacing rule. Boxes wrap to the left.
- Boxes per row, with the scroller padding of today and 12px padding inside the bar: 9 at 360px wide,
  24 at 768px wide, 23 in a 740×360 landscape phone, and about 31 in a 1280×560 window (the 900px
  sheet).
- The tab bar is one row that scrolls sideways (about 40px).

Pinned heights in compact mode **[Designer, new]**: 22px per box row, 4px between rows, 6px between
trackers, a 32px Wrath row, a 40px tab bar and 16px of vertical padding. "Typical" is 14 Wounds and
9 Shock; "worst" is 50 Wounds and 35 Shock.

| Viewport | Typical: rows (W + S) | Typical height | Worst: rows (W + S) | Worst height |
|---|---|---|---|---|
| 360×740 | 2 + 1 | about 170px (23%) | 6 + 4 | about 350px (47%) |
| 768×1024 | 1 + 1 | about 145px (14%) | 3 + 2 | about 225px (22%) |
| 740×360 (landscape phone) | 1 + 1 | about 145px (40%) | 3 + 2 | about 225px (62%) |
| 1280×560 | 1 + 1 | about 145px (26%) | 2 + 2 | about 200px (36%) |

**Low mode [Controller ruling, 2026-11-14; the owner can reverse it].** The first version of this
section had no special case for a short window and said that the worst case in a landscape phone
leaves about 135px for the pane. That figure was wrong: it did not count the app header, the tab
navigation and the footer (130px). Measured at 740×360, the scroller is 230px high, and the pinned
part of compact mode left 80px for a typical character and 2px for the worst case. So a third mode
exists: in `@media screen and (max-height: 480px)` the tracker rows are not pinned and scroll with
the page, and only the tab bar stays pinned (48px), which leaves 182px for the pane at 740×360.
Windows from 481px to 600px high keep compact mode. The owner's decision for a narrow viewport
(the boxes stay pinned and fill more rows) does not change. `_pinnedElement` returns the strip in
full mode, the strip bar in compact mode and the tab bar in low mode. The 740×360 row of the table
above describes compact mode and does not apply any more.

Measured room for the pane (pinned height / room): 360×740 typical 176 / 434px, worst case
358 / 252px; 1280×560 typical 150 / 280px, worst case 202 / 228px; 1280×481 worst case
202 / 149px. Only a Tier 5, Rank 5 character with the largest bonuses reaches the worst case.

Size targets (browser check, §10.2), each with a tolerance of 20px for fonts and borders:

- Full mode at 1280×800, eight keyword chips, 30 Wounds or fewer and 20 Shock or fewer: the pinned
  part is at most 240px tall.
- Full mode worst case at 800×800, two rows of chips, 50 Wounds and 35 Shock: at most 300px.
- Compact mode: the heights of the table above.

### 2.3 Sketches and pane layout per width

Desktop, full mode (1000–1399px; `.character-sheet` max-width 900px as today):

```
                                          [Copy Summary] [Print]
┌──────────────────────────────────────────────────────────────┐ ┐
│ Brother Kaelen                                               │ │
│ Human (Cadia) • Imperial Guardsman • Tier 2 • Rank 1         │ │
│ [IMPERIUM] [ASTRA MILITARUM] [CADIA]                         │ │
│ Wounds  ■■■□□□□□□□□□□□                         Wrath         │ │ pinned
│ Shock   ■□□□□□□□□                            [−] 2 [+]       │ │
│ (Character) (Stats) (Abilities) (Wargear) (Followers) (Notes)│ │
└──────────────────────────────────────────────────────────────┘ ┘
┌ Stats pane ──────────────────────────────────────────────────┐
│ ┌ Attributes ────────────┐ ┌ Skills ──────────────────────┐ │
│ └────────────────────────┘ │                              │ │
│ ┌ Traits ────────────────┐ │                              │ │
│ │ Defence 3  Resil. 6 …  │ │                              │ │
│ │ Faith [−] 1 [+]  Wealth [−] 2 [+]                       │ │
│ └────────────────────────┘ └──────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

Narrow tablet, full mode (800px), 50 Wounds and 35 Shock — 23 boxes per row:

```
┌──────────────────────────────────────────────────────┐ ┐
│ Brother Kaelen                                       │ │
│ Custodian • Shield-Captain • Tier 5 • Rank 5         │ │
│ [IMPERIUM] [ADEPTUS CUSTODES] [ … ]                  │ │
│ Wounds  ■■■■■■■■□□□□□□□□□□□□□□□            Wrath     │ │
│         □□□□□□□□□□□□□□□□□□□□□□□          [−] 2 [+]   │ │ pinned
│         □□□□                                         │ │
│ Shock   ■■□□□□□□□□□□□□□□□□□□□□□                      │ │
│         □□□□□□□□□□□□                                 │ │
│ (Character) (Stats) (Abilities) (Wargear) (Followers)│ │
│ (Notes)                                              │ │
└──────────────────────────────────────────────────────┘ ┘
```

Wide (1440px): the same strip as desktop at full width; 50 Wounds fit on one row.

Phone, compact mode (360px), typical character (14 Wounds, 9 Shock) — 9 boxes per row:

```
[Copy Summary] [Print]
┌────────────────────────────┐
│ Brother Kaelen             │
│ Human (Cadia) • Imperial … │  scrolls away
│ [IMPERIUM] [ASTRA MILIT…]  │
├────────────────────────────┤ ┐
│ Wounds ■■■□□□□□□           │ │
│        □□□□□               │ │
│ Shock  ■□□□□□□□□           │ │ pinned, about 170px
│ Wrath  [−] 2 [+]           │ │
│ (Character)(Stats)(Abil… ⇢ │ │ tab bar: one row, scrolls sideways
└────────────────────────────┘ ┘
┌ Attributes ────────────────┐   single column
```

Phone, compact mode (360px), worst case (50 Wounds, 35 Shock):

```
├────────────────────────────┤ ┐
│ Wounds ■■■■■■■■□           │ │
│        □□□□□□□□□           │ │
│        □□□□□□□□□           │ │
│        □□□□□□□□□           │ │
│        □□□□□□□□□           │ │ pinned, about 350px
│        □□□□□               │ │
│ Shock  ■■□□□□□□□           │ │
│        □□□□□□□□□           │ │
│        □□□□□□□□□           │ │
│        □□□□□□□□            │ │
│ Wrath  [−] 2 [+]           │ │
│ (Character)(Stats)(Abil… ⇢ │ │
└────────────────────────────┘ ┘
```

Pane layout per width **[Designer, new]**. "Wide" is 1400px and up, where `.character-sheet` keeps
`max-width: none` as today. In every layout the page order (the DOM order, which is also the
single-column order and the print order) is the order of §3.

| Pane | Phone (≤768px) | Tablet and desktop (769–1399px) | Wide (≥1400px) |
|---|---|---|---|
| Character | one column | one column | two columns: Details, Ascension \| Injuries & Corruption, Background |
| Stats | one column | existing `.sheet-columns`: Attributes + Traits \| Skills | same as desktop |
| Abilities | one column | one column | two columns: Species Abilities, Archetype Abilities \| Talents, Mutations |
| Wargear | one column | one column | Weapons full width, then two columns: Armor, Augmetics \| Equipment, Holy Relics |
| Psychic Powers, Followers, Notes | one column | one column | one column, full width |

The two-column panes use a new wrapper pair, `.sheet-pane-columns > .sheet-pane-column`, that is a
two-column grid at 1400px and up and a plain block below. The left wrapper holds the first blocks of
the §3 order and the right wrapper the rest, so the DOM order never changes. Stats keeps
`.sheet-columns` and its existing rules. An empty column (all its blocks return `''`) still renders
its wrapper; the grid leaves the space empty.

The tab bar: a flex row of pill buttons in the style of `.wargear-tab-btn`
(`creator/css/styles.css:1340-1360`). It wraps in full mode. In compact mode it is one row with
`flex-wrap: nowrap` and `overflow-x: auto` **[Designer]**; after a render and after a switch, the
selected tab is scrolled into view inside the bar without a vertical scroll of the page.

**Additions after the final review [Controller rulings, 2026-11-14].**

- In compact and low mode, the tab bar stays one row and shows a 24px edge fade on each side that
  has more tabs. Reason: at 360px the bar showed four whole tabs and a clean right edge, so nothing
  told the player about the other tabs. The fade has the bar background (`var(--bg-primary)`), takes
  no pointer events and exists only in the screen rules. The state comes from `scrollLeft`,
  `clientWidth` and `scrollWidth` of the bar. It changes after a render, after a switch, when the bar
  scrolls, and on a window resize. When all tabs fit, no fade shows.
- The scroll into view keeps 32px of room on a side that has more tabs, so the selected tab is clear
  of the fade and a part of the next tab shows. At the first and the last tab, the 4px padding of the
  bar keeps the room for the focus ring.
- A window resize (for example a rotate) also scrolls the selected tab into view. The resize does
  nothing while the sheet is not displayed.

## 3. Block-to-tab mapping

**[Designer]**, with the Details block and the Mutations split as **[Designer, new]**:

| Tab id | Label | Blocks, in order (render function) |
|---|---|---|
| `character` | Character | Details (`renderDetails`, new), Ascension (`renderAscensions`), Injuries & Corruption (`renderInjuriesCorruption`, without mutations), Background with Languages (`renderBackground`) |
| `stats` | Stats | Attributes (`renderAttributes`), Traits (`renderTraits`), Skills (`renderSkills`) |
| `abilities` | Abilities | Species Abilities (`renderSpeciesAbilities`), Archetype Abilities (`renderArchetypeAbilities`), Talents (`renderTalents`), Mutations (`renderMutations`, new) |
| `wargear` | Wargear | Weapons (`renderWeapons`), Armor (`renderArmor`), Augmetics (`renderAugmetics`), Equipment (`renderEquipment`), Holy Relics (`renderHolyRelics`) |
| `powers` | Psychic Powers | Psychic Powers (`renderPsychicPowers`) |
| `companions` | Followers | Followers (`renderFollowers`) |
| `notes` | Notes | Notes (`renderNotes`) |

The tab order is the owner's order **[Owner]**. The sixth tab's label is "Followers" **[Owner]**.
The module holds the table as one constant, `SHEET_TABS`, an array of `{ id, label }` in this
order, and one method, `renderPane(tabId, ctx)`, that returns the pane's blocks as HTML. `ctx`
carries the values that `render()` computes once today (`character`, `species`, `archetype`,
`keywords`, `derivedStats`, the two breakdowns). The block render functions keep their names and
their signatures.

### 3.1 The Character tab and the Details block

The owner's list for Character repeats name, race, Tier, Rank and class, which the strip already
shows. The Character tab shows them again as a labelled **Details** block **[Designer, new]**, because
the owner listed them and a labelled form reads more clearly than the strip's bullet line. The
Details block has no trackers and no keyword chips.

`renderDetails(character, species, archetype)` returns a `.sheet-section` titled "Details" with these
rows, in a `<dl>` or the existing `.sheet-background-item` form:

- **Name**: `character.name` or "Unnamed Character", escaped.
- **Species**: the same string as the strip subtitle (species name plus the Chapter or Path). Move
  that logic out of `renderHeader` into one helper, `getSpeciesDisplayName(character, species)`,
  used by both.
- **Archetype**: the same name as the strip, then, for each entry of `character.ascensions` with
  `type === 'archetype'` whose archetype resolves, ` → <name> (Tier <targetTier>)` in array order.
  This covers the owner's "class(es)".
- **Tier**: `State.getEffectiveTier()`, as in the strip.
- **Rank**: `character.rank || 1`.

The Details block does not print (§7), because the printed strip carries the same facts.

### 3.2 Mutations block

The owner wants mutations "in detail" in Abilities **[Owner]**. Move the mutation part of
`renderInjuriesCorruption` (the `Mutations` `<h3>` and its items) into a new
`renderMutations(character)` with an `<h2 class="sheet-section-title">Mutations</h2>`. The item
markup and classes (`.sheet-mutation-*`) stay the same, so `enhanceWithGlossary` still enhances
`.sheet-mutation-effect`. `renderMutations` returns `''` when `DataLoader.getInjuriesCorruptionData()`
is null or `character.mutations` is empty.

`renderInjuriesCorruption` then hides when there are no memorable injuries, no traumatic injuries
and `corruption === 0`; mutations no longer count.

### 3.3 Tab visibility, fallback, and empty tabs

A hidden tab has no button and no pane in the DOM. The rules, in one method
`getVisibleSheetTabs(character)` that returns tab ids in tab order **[Designer]**:

- `powers` is visible when `State.isPsyker()` is true. This is the same condition that
  `renderPsychicPowers` uses today, and a psyker always has the two universal powers, so the tab is
  never empty.
- `companions` is visible when `(character.followers || []).length > 0`. It stays visible while the
  threat data loads or after the load failed: the pane then shows the existing notice from
  `renderFollowersNotice` ("Loading threat data…" or the failure text).
- All other tabs are always visible.

Fallback **[Designer, new]**: at the start of every render, if `activeSheetTab` is not in
`getVisibleSheetTabs(character)`, set `activeSheetTab = 'stats'`. The old choice is not remembered;
if the tab comes back later, the player selects it again.

Empty always-visible tabs need no new text, because each one always has a block **[Designer, new]**:
Character always has Details and Background (Background always shows Languages); Stats always has
its three blocks; Abilities always has Talents, which shows "No talents learned" when empty; Wargear
always has Weapons ("No weapons equipped") and Armor ("No armor equipped"); Notes always has the
editor.

## 4. The strip

### 4.1 Content

Identity part: name, subtitle (species • archetype • Tier • Rank), keyword chips, as `renderHeader`
gives them today **[Owner]**. Tracker part: Wounds, Shock and Wrath **[Owner]**. Faith and Wealth
stay in Stats **[Owner]**.

### 4.2 Tracker forms

The owner: "For wounds and shock specifically, I prefer the boxes to the counters. This allows the
user to visualize their remaining wounds/shock. We can use counters for the other values."
**[Owner]**. So, at every width:

- **Wounds and Shock** are rows of boxes, built by the existing `renderTrackingBoxes(type, current,
  max)`: one `<span class="tracking-box" data-type="wounds|shock" data-index="i">` per point, the
  first `current` of them `filled`. Values: `State.getCurrentWounds()` and `derivedStats.maxWounds`,
  `State.getCurrentShock()` and `derivedStats.maxShock`. Sizes and wrap: §2.2.
- **Wrath** is a counter: the existing markup, `.tracker-btn tracker-minus` and `.tracker-btn
  tracker-plus` with `data-type="wrath"`, and `.tracker-value`. The `aria-label`s are "Remove Wrath"
  and "Add Wrath" **[Designer, new]**.

The click handler for the player's boxes stays as it is: the `.tracking-box:not(.follower-box)` loop
in `bindSessionTrackingControls`. It now serves the boxes in the strip. What a click does, as today:

- A click on an **empty** box at index `i` sets the value to `i + 1`: it fills that box and every box
  before it.
- A click on a **filled** box at index `i` sets the value to `i`: it clears that box and every box
  after it. A click on the first box when only it is filled sets 0.
- The value goes through `State.setCurrentWounds` or `State.setCurrentShock`, which clamp to
  0..max and store 0 as `null`; then the handler calls `render()`.

The Wrath buttons are never `disabled` **[Designer, new]**; `State.setCurrentWrath` clamps at 0 and
has no maximum, so a click at 0 on "−" is a no-op. Reason: a disabled button cannot keep focus after
the re-render (§5.2). Faith and Wealth counters do not change.

### 4.3 What Traits shows

`renderTraits` keeps the static trait grid and the Faith (only when `State.getMaxFaith() > 0`) and
Wealth counters. It no longer renders the Wounds row, the Shock row or the Wrath counter. The boxes
and the Wrath counter exist once in the page, in the strip.

## 5. Behaviour

### 5.1 Selected tab

- A module property, `activeSheetTab`, default `'stats'`. The sheet opens on Stats **[Designer]**.
- The value stays for the whole page session, across main-tab switches **[Designer]**. It does not
  reset on a new character or on a load **[Designer, new]**; the fallback (§3.3) covers a tab that
  the new character does not have.
- A page reload starts on Stats again. No URL hash, no `localStorage` **[Designer, new]**: the app
  keeps no other UI choice in either, and the hash would change the feedback widget's label.

### 5.2 Re-render keeps the view **[Designer, new]**

Choice: keep the full re-render, and restore the view around it. Do not split the render into a
strip part and pane parts. Reasons: every existing trigger (box, counter, equip checkbox, follower
control, threat load, `App.switchTab('character-sheet')` at `creator/js/app.js:242`) goes through
one `render()`, the strip depends on the same derived stats as the panes, and three restore steps
are less code and less risk than per-part render and bind paths.

`render()` does, in order:

1. `_captureViewState()`: read `scrollTop` of `#tab-character-sheet`, and the focus key of
   `document.activeElement` (null when the focus is outside the sheet or on an element with no key).
2. Apply the fallback (§3.3), build the HTML, write `innerHTML`, run the existing bind calls
   (`enhanceWithGlossary`, `bindWeaponEquipCheckboxes`, `bindBreakdownTooltips`,
   `bindSessionTrackingControls`, `bindFollowerTracking`, `bindNotesInput`), without the two TOC
   calls (§8).
3. `_restoreViewState(state)`: set the scroller's `scrollTop` back; if a focus key was captured,
   find the element in the container with the same key (compare computed keys; do not build a
   selector from the key). If it exists and is not `disabled`, call `focus({ preventScroll: true })`.
   Otherwise the focus is not restored.

The selected tab survives because the build reads `activeSheetTab`.

Focus keys come from attributes that exist today; no block markup changes. One helper,
`_focusKeyOf(el)`, gives **[Designer, new]**:

| Element | Key | Attributes (verified) |
|---|---|---|
| `.sheet-tab-btn` (new) | `tab:<id>` | `data-sheet-tab` (new markup, §6) |
| `.tracker-btn` (Wrath, Faith, Wealth) | `tracker:<type>:<minus\|plus>` | `data-type`, class `tracker-minus` / `tracker-plus` (`character-sheet-tab.js:541-567`) |
| `.weapon-equip-checkbox` | `equip:<index>` | `data-wargear-index` (`:937`) |
| `.follower-living-btn` | `living:<followerId>:<delta>` | `data-delta` (`:661,664`), `data-follower-id` on the closest `.sheet-follower` (`:681`) |
| anything else | null | — |

The boxes (`.tracking-box`, `data-type`, `data-index`) are `<span>`s, so a box click does not focus
anything and leaves `document.activeElement` on `body`. After a box click, the key is null, focus is
not restored, and the scroll position and the tab are restored. The mob buttons are `disabled` at 0
and at the full count (`:662,665`); after a click that reaches a bound, focus is lost. This is
accepted **[Designer, new]**.

The notes editor keeps its rule: `bindNotesInput` saves on `input` and does not re-render. A tracker
click while the Notes tab is open re-renders the textarea from state, as today.

**Additions after the task reviews [Controller rulings, 2026-11-14].**

- The Notes textarea has a focus key too: `.sheet-notes-input` is in `_FOCUS_SELECTOR`, its key is
  `notes`, and the view state also holds its `selectionStart` and `selectionEnd`, which the restore
  sets again after the focus. Reason: the sheet re-renders one time when the threat data for
  followers finishes its load, and a player who types in Notes at that moment lost the focus and
  the caret.
- When the selected tab went away and `render()` falls back to Stats, the captured scroll position
  becomes 0, so that Stats shows from its top.
- `renderFollower` escapes the values that come from the saved character (`follower.id`,
  `follower.livingCount`, `follower.count`), because a character file can come from another
  person.

**Additions after the final review [Controller rulings, 2026-11-14].**

- The view state also holds the `scrollTop` of the Notes box, when the box exists. The restore sets
  it on the new box, with or without the focus, after the caret. Reason: a tracker click while the
  Notes tab is open re-renders the box, and the box went back to its first line.
- The strip and the Details block escape the Wrath value, the Rank and the target tier of an
  ascension, because a character file can come from another person.

### 5.3 Tab switch

`selectSheetTab(id)` does not re-render. It:

1. Sets `activeSheetTab`.
2. Toggles the `hidden` attribute on the panes, and `aria-selected`, `tabindex` and the `active`
   class on the buttons (§6).
3. Closes open popups: `this._closeBreakdownPopup()` and `Glossary.closeAllPopups()` (when
   `Glossary` exists).
4. Scrolls only when the new pane's top would sit under the pinned part: if
   `panes.getBoundingClientRect().top < pinned.getBoundingClientRect().bottom`, add the difference
   to the scroller's `scrollTop` (a negative number), so the new pane starts directly under the
   pinned part. `pinned` is `.sheet-strip` in full mode and `.sheet-strip-bar` in compact mode.
   Otherwise the scroll stays.

The click and keydown listeners for the tab bar are delegated once, in `init()`, on `#character-sheet-content`, with `closest()` (STYLE_GUIDE "Event
Handling").

## 6. Tab bar semantics **[Designer, new]**

Use the WAI-ARIA Tabs pattern with automatic activation (a switch is cheap, §5.3):

- `div.sheet-tabbar` has `role="tablist"` and `aria-label="Character sheet sections"`.
- Each tab is a `<button type="button" class="sheet-tab-btn" role="tab" id="sheet-tab-<id>"
  aria-controls="sheet-pane-<id>" data-sheet-tab="<id>">`. The selected one has
  `aria-selected="true"`, `tabindex="0"` and the `active` class; the others have
  `aria-selected="false"` and `tabindex="-1"`.
- Each pane is `<div class="sheet-pane" role="tabpanel" id="sheet-pane-<id>"
  aria-labelledby="sheet-tab-<id>" tabindex="0">`, with `hidden` when not selected.
- Keys on a focused tab: ArrowRight and ArrowLeft move to the next and previous visible tab, with
  wrap; Home and End move to the first and last. Each move selects the tab and focuses its button.
  Enter and Space work through the native button click. Tab moves from the tab bar into the pane.
- Focus style: `.sheet-tab-btn:focus-visible` and `.tracker-btn:focus-visible` get `outline: 2px solid var(--accent-gold); outline-offset: 2px`.
  Today only form fields have a focus rule (`creator/css/styles.css:402-406`, `:1329`, `:2199`,
  `:2398`, a gold border); no button has one.
- `.sheet-pane[hidden] { display: none; }` is stated in CSS, so no later rule shows a hidden pane on
  screen.

**Additions after the final review [Controller rulings, 2026-11-14].**

- A keyboard focus inside the panes goes under the pinned part. Reason: the browser scrolls a
  focused control into the scrollport, and the pinned part covers the top of the scrollport, so a
  control could have the focus and change with no part of it visible. One `focusin` listener on
  `#character-sheet-content` compares the top of the target with the bottom of the pinned part at
  that moment and scrolls the page up by the difference: a control goes 4px under the pinned part for
  its focus ring, a pane goes directly under it. No height is stored, and no `scroll-padding-top` is
  used, because it scrolls the page for each focus on a control of the pinned part.
- Only the focus move of a Tab key press starts this scroll. A mouse or touch focus, the focus
  restore of a re-render, and a control of the pinned part do not move the page.
- A focused pane shows the gold ring of the other sheet controls, drawn inside the pane
  (`outline-offset: -2px`), so the scroller does not clip it. This is a screen rule only. The
  transition of a tab button names its properties, so its focus ring shows gold at once.

## 7. Print

Print shows the whole sheet, whichever tab is selected **[Designer]**:

- The strip prints first as a static block (`position: static`, `display: block` for `.sheet-strip`
  in every mode): the identity part, then the tracker part. The on-screen boxes print as they are
  **[Designer, new]**: they are real boxes with their filled state, and the light-theme rules for
  `.tracking-box` and `.tracking-box.filled` (`body.print-light-theme`, from about
  `creator/css/styles.css:5244`) already style them for paper. No print-only copy is needed. The
  Wrath counter prints its value; the existing print rule hides every `.tracker-btn`.
- The tab bar does not print.
- Every pane prints, in tab order: `@media print { .sheet-pane[hidden] { display: block !important; } }`.
  Each block keeps its own `<h2>`; no pane title is added.
- The Details block does not print (§3.1).
- The existing print rules keep working because the block classes do not change. Remove the print
  rule for `.sheet-body` (it no longer exists, §8). Keep `.sheet-header-section { page-break-after:
  avoid }`, and add `page-break-inside: avoid` for `.sheet-strip-trackers`.
- The light-theme rules need entries for `.sheet-strip`, `.sheet-strip-trackers` and
  `.sheet-strip-bar` (transparent background, no border) so the pinned background does not print
  dark.

The print order changes from today: Character comes before Stats, and Mutations print in Abilities.
This follows "Print gives all sections in the order of the tabs" **[Designer]**.

## 8. Removal of jump-to-section

The tabs replace the jump-to-section button and panel **[Designer]**. Remove:

- In `character-sheet-tab.js`: the properties `_tocFab`, `_tocPanel`, `_tocEscHandler`,
  `_tocDismissHandler` and their comment; the `_ensureTocElements()` and `_observeTabVisibility()`
  calls and comment in `init()`; the methods `_ensureTocElements`, `_observeTabVisibility`,
  `_slugifySection`, `_assignSectionIds`, `_buildTocList`, `_toggleTocPanel`, `_openTocPanel`,
  `_closeTocPanel`; the `_assignSectionIds` and `_buildTocList` calls at the end of `render()`.
  Today these are at lines 4–8, 26–29, 105–107 and 110–254.
- In `creator/css/styles.css`: the whole "Character Sheet Table of Contents (jump-to-section)"
  section, `.sheet-toc-fab`, `.sheet-toc-panel`, `.sheet-toc-header`, `.sheet-toc-list`,
  `.sheet-toc-item`, with its `@media (max-width: 768px)` and `@media print` blocks (today
  5731–5833).
- The `.sheet-body`, `.sheet-body-left`, `.sheet-body-right` wrappers in `render()`, the
  `@media (min-width: 1400px) .sheet-body` grid rule (4324–4329), and the print `.sheet-body` rule
  (4831–4834). `.sheet-body-left` and `.sheet-body-right` have no CSS.
- The comment "always shown so it stays in the table of contents" on `renderNotes`; Notes stays
  always shown.

Keep `escapeHtml`; other code uses it. No code outside the sheet uses the section ids or the TOC
classes (checked over `creator/`, `shared/`, `scripts/`).

## 9. Interaction with Custom Wargear (#33)

#33 ships first and edits `renderWeapons`, `renderAugmetics`, `escapeHtml` and the copy text in
`character-sheet-tab.js` (spec `2026-11-13-custom-wargear-design.md` §4, §5). This feature:

- calls `renderWeapons`, `renderArmor`, `renderAugmetics`, `renderEquipment` and `renderHolyRelics`
  unchanged, from `renderPane('wargear', ctx)`, and adds no attribute inside them (§5.2 reads
  `data-wargear-index`, which exists);
- uses `escapeHtml` for the Details name, as `renderHeader` does, and takes #33's fixed version as
  it is;
- does not touch the copy text;
- must be built on a tree that has #33 and `issues-31-32` merged. The builder locates code by
  function name and re-checks the attributes of §5.2 there. If #33's `escapeHtml` no longer calls
  `document.createElement`, the test sandbox does not need that stub.

## 10. Tests and housekeeping

### 10.1 `scripts/test-sheet-tabs.js`

A Node script in the pattern of `scripts/test-sheet-attributes.js`: load the real
`creator/tabs/character-sheet-tab.js` in a `vm` sandbox with hand-written stubs for `State`,
`DataLoader`, `DerivedStats` and `document`. For the mapping tests, replace each block render
function on the module with a stub that returns
`<div class="sheet-section"><h2 class="sheet-section-title">NAME</h2></div>`, so the tests check
composition without game data. Cases:

1. **Mapping**: `SHEET_TABS` ids and labels are exactly the §3 table, in order (the sixth label is
   "Followers"). For each tab, `renderPane` gives the block titles of §3 in order; for Abilities that
   is Species Abilities, Archetype Abilities, Talents, Mutations, also with the wide-screen wrappers
   in the markup.
2. **Visibility**: `getVisibleSheetTabs` with `isPsyker` false and no followers gives `character,
   stats, abilities, wargear, notes`; with `isPsyker` true it adds `powers` in place; with one
   follower it adds `companions` in place, also when `DataLoader.areThreatsLoaded()` is false.
3. **Fallback**: with `activeSheetTab = 'powers'` and `isPsyker` false, the built HTML selects
   Stats (`aria-selected="true"` only on `sheet-tab-stats`, only `sheet-pane-stats` without
   `hidden`) and `activeSheetTab` is `'stats'`. Same for `'companions'` with no followers.
4. **Strip content**: the strip HTML has the escaped name, the subtitle parts, and one chip per
   keyword. With current Wounds 3 of 11 and Shock 1 of 8, it has 11 `.tracking-box[data-type="wounds"]`
   with 3 `filled` and 8 `.tracking-box[data-type="shock"]` with 1 `filled`, one Wrath
   `.tracker-btn` pair and the Wrath value. The trackers and the tab bar are inside
   `.sheet-strip-bar`, and the identity part is outside it.
   The whole sheet HTML has these boxes and the Wrath pair once; Traits has no `.tracking-box` and
   no Wrath button, but has `wealth` (and `faith` only when `getMaxFaith() > 0`). With max 50 the
   strip has 50 Wounds boxes.
5. **Box clicks**: with stub box elements (class list, `dataset`, captured click listener) passed
   through `bindSessionTrackingControls`, and `render` stubbed: a click on empty Wounds box 4 calls
   `State.setCurrentWounds(5)`; a click on filled box 1 calls `setCurrentWounds(1)`; the same for
   Shock with `setCurrentShock`; each click calls `render` once.
6. **Mutations split**: with the real `renderInjuriesCorruption` and `renderMutations` and the real
   `data/injuries-corruption.json`, a character with only a mutation gives `''` from
   `renderInjuriesCorruption` and a "Mutations" block from `renderMutations`.
7. **Re-render keeps the view**: `_focusKeyOf` gives the keys of the §5.2 table for stub elements of
   each kind, and null for a `.tracking-box` and for `body`. With a stub scroller (`scrollTop` 420),
   a stub container, and `document.activeElement` a Wrath "+" stub, after `render()` the scroller's
   `scrollTop` is 420, the new Wrath "+" received `focus({ preventScroll: true })`, and
   `activeSheetTab` is unchanged. With a `disabled` match, `focus` is not called.
8. **Tab bar**: tab buttons carry `role="tab"`, matching `aria-controls` / pane `id`, and
   `tabindex="0"` only on the selected one. The keydown handler: ArrowRight from the last visible
   tab goes to the first; ArrowLeft from the first goes to the last; Home and End.
9. **Print markup**: with `activeSheetTab = 'wargear'`, every visible pane is in the HTML in tab
   order. A text check on `creator/css/styles.css` finds, inside an `@media print` block, rules that
   show `.sheet-pane[hidden]` and hide `.sheet-tabbar`.
10. **Removal**: the module source has no `_toc` and no `_assignSectionIds`; `styles.css` has no
    `.sheet-toc-`.

`scripts/test-sheet-attributes.js` and the other existing test scripts must still pass.

### 10.2 Browser check

Serve the repo root on port 8137 and open `/creator/`. Use a psyker with two followers (one mob), a
mutation, an injury, corruption, a relic and an augmetic. Also use a Tier 5, Rank 5 character with
about 50 Wounds and 35 Shock.

- Each tab shows the blocks of §3, Abilities in the order Species Abilities, Archetype Abilities,
  Talents, Mutations at every width. Psychic Powers and Followers show and hide with the PSYKER
  keyword and the follower list; a hidden selected tab falls back to Stats.
- Full mode, on Wargear, scroll down: click an empty Wounds box, a filled Wounds box and a Shock box.
  The boxes fill and clear as in §4.2, and the tab and the scroll position stay. Click Wrath "+":
  the value changes, and the tab, the scroll position and the focus stay.
- Click an equip checkbox: the tab, the scroll and the focus stay. Click a follower mob button: the
  tab and the scroll stay; the focus stays unless the button became `disabled` (0 living or the full
  count), where the focus is lost.
- Compact mode (360×740, 768×1024, 740×360 and 1280×560), on Wargear, scrolled down: the identity
  part has scrolled away; the boxes, the Wrath counter and the tab bar stay pinned; tap a box, the
  value changes, the tab and the scroll stay. With the worst-case character the box rows wrap and
  the pinned heights match the table of §2.2.
- Type in Notes; the caret stays; switch tabs and back; the text is there.
- Keyboard only: Tab to the bar, arrows, Home, End, Tab into the pane; the focus ring shows on the tabs
  and the Wrath buttons.
- Widths 360, 768, 800, 1024, 1280, 1440 and a 1280×560 window: the size targets of §2.2, the box
  rows wrap and never cause a horizontal page scroll, the pane layouts of §2.3, the tab bar scrolls
  sideways in compact mode.
- A glossary popup and a breakdown popup close on a tab switch and show above the pinned part.
- Print preview from the Wargear tab: strip with the box rows and the Wrath value, no tab bar, no
  Details block, all blocks in tab order, light theme.
- Copy Summary output is the same as before the change.
- New character and Load: the selected tab stays when the new character has it.

### 10.3 Cache busting

Per `CLAUDE.md`: bump every `?v=` in `creator/index.html` together, to the next number after #33's
bump. No `data/` file changes, so the creator data `?v=` in `creator/js/web-api.js` stays. No
`shared/` file and no bestiary file changes.

## 11. Left to the builder

- The exact look of the strip, the box grid, the Wrath counter and the tab pills,
  within the sizes of §2.2, the CSS variables of `STYLE_GUIDE.md`, and the `.wargear-tab-btn` model.
- The markup of the Details rows (`<dl>` or `.sheet-background-item` paragraphs).
- The internal shape of `ctx` and the names of private helpers not named here.
- The split of the plan into tasks. Suggested order: (1) `SHEET_TABS`, `getVisibleSheetTabs`,
  `renderPane`, `renderDetails`, `renderMutations`, the strip markup, and test cases 1–6 and 9–10;
  (2) the TOC removal; (3) view restore, `_focusKeyOf`, `selectSheetTab`, keyboard
  handling, and test cases 7–8; (4) the CSS for the two modes, the box grid, pane layouts, focus and
  print; (5) cache busting and the browser check.

## 12. Decisions by the owner

- **Strip content**: name, species, archetype, Tier, Rank and keyword chips, plus the Wounds, Shock
  and Wrath trackers, so that "a player on the Wargear tab can then mark a wound with no tab change".
  Faith and Wealth stay in Stats.
- **Tracker forms**: "For wounds and shock specifically, I prefer the boxes to the counters. This
  allows the user to visualize their remaining wounds/shock. We can use counters for the other
  values." Wounds and Shock are box rows at every width; Wrath, Faith and Wealth are counters.
- **Tab name**: the sixth tab is "Followers".
- **Compact mode**: "On narrow viewports, Wounds/Shock boxes can fill up multiple rows if needed.
  Probably the cleanest way to do it." On a viewport 768px wide or less, or 600px tall or less, the
  Wounds boxes, the Shock boxes, the Wrath counter and the tab bar stay pinned, and the boxes wrap to
  more rows when one row is full (§2.2). This replaces the earlier designer's call of a pinned status
  line.
- **Approval**: "Everything else looks good." (2026-11-13).
