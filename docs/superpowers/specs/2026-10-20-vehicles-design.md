# Vehicles (Church of Steel) — Design

Date: 2026-10-20, revised 2026-10-21 after review. Issue: #28 "[Feature] Add Vehicles" (bestiary).
Status: design approved in conversation; spec for user approval.

## 1. Goal and scope

Add the vehicles of the *Church of Steel* sourcebook to the bestiary, with the vehicle rules in the
Rules Reference and vehicle support in the Encounter Builder.

In scope:

- All 107 vehicle stat blocks (pp. 64–111) as a new data file, `data/vehicles.json`, in the shared
  `data/` folder. Only the bestiary loads it in this round.
- The 12 vehicle traits (pp. 62–63) and the vehicle rules (pp. 29–31, 44–55, 60, 62) as two new
  sections of the shared `data/glossary.json`, shown in the Rules Reference of both apps.
- A new **Vehicles** tab in the bestiary, with search, a faction filter, the Settings source toggle,
  and a detail card.
- Vehicle entries in the Encounter Builder, with a Wounds tracker.

Out of scope for this round:

- The Workshop chapter (pp. 56–59): requisition, customisation, upgrades. Only "Ammo" and "Twin
  Weapons" (p. 60) come in, because the cards need them.
- Player-owned vehicles in the creator (a creator Vehicles view, vehicles on the character sheet).
- Computed "Twin" weapon profiles. The card shows the base profile and marks the line as Twin; the
  rule text explains the effect.
- Crew NPC stat blocks. The book has none. The only creature block, the Squig (p. 138), is
  ammunition and already exists as a threat.
- Inline glossary links for the new trait and rule names inside prose (§3).
- Copy text for vehicles. The encounter has no copy text today, and this round adds none.

## 2. Data: `data/vehicles.json`

A flat JSON array of 107 entries in book order, one per printed stat block.

### 2.1 Entry shape

```json
{
  "id": "chimera",
  "name": "Chimera",
  "faction": "Astra Militarum",
  "variantOf": null,
  "description": "The Chimera is an armoured transport with thousands of years of service vouching for its reliable, rugged design. The Astra Militarum regularly moves ground troops from fight to fight within its armoured shell, and many other vehicles are based on the venerable Chimera chassis. It is peppered in Gun Ports that allow Passengers to shoot out.",
  "options": "All Chimera-based tanks can carry a Hunter-Killer Missile and a Dozer Blade, plus either a Storm Bolter or a Heavy Stubber. Each may exchange its Heavy Bolter for a Heavy Flamer. The baseline Chimera's Multi-Laser can be exchanged for a Heavy Flamer, Heavy Bolter, Autocannon, or Twin Heavy Bolter.",
  "value": 10,
  "rarity": "Rare",
  "speed": 26,
  "manoeuvre": 3,
  "resilience": 16,
  "wounds": 15,
  "size": "Huge",
  "keywords": ["IMPERIUM", "ASTRA MILITARUM", "TRANSPORT"],
  "crew": "1 Pilot, 2 Crew, 12 Passengers",
  "traits": ["Amphibious", "Gun Ports", "Reliable", "Sealed"],
  "weapons": [
    { "text": "Heavy Bolter", "weaponId": "heavy_bolter", "count": 1 },
    { "text": "Lasgun Array (6 Lasguns)", "weaponId": "cos_lasgun_array", "count": 1 },
    { "text": "Multi-Laser", "weaponId": "cos_multi_laser", "count": 1 }
  ],
  "wargear": [
    { "text": "Smoke Launchers", "equipmentId": "cos_smoke_launchers" }
  ],
  "sidebar": null,
  "source": "church",
  "page": 84
}
```

The ids in `weapons` and `wargear` above are examples. The build step resolves the real ids. A Twin
line carries one more key, for example the Land Raider's
`{ "text": "2 Twin Lascannons", "weaponId": "lascannon", "count": 2, "twin": true }` (p. 70). A line
whose weapon exists only as several profile records carries `profileIds` in place of a resolved
`weaponId`, for example
`{ "text": "Prism Cannon", "weaponId": null, "count": 1, "profileIds": ["cos_prism_cannon_focused", "cos_prism_cannon_dispersed"] }`
(ids illustrative).

### 2.2 Field rules

| Field | Rule |
|---|---|
| `id` | snake_case of the printed name. A variant whose printed title is one word gets the family prefix: `land_raider_crusader`, `leman_russ_demolisher`, `falcon_firestorm`. A multi-word printed title stands alone: `attack_bike`, `wave_serpent`, `burna_bommer`. The Archaeopters follow their stored name: `archaeopter_fusilave`. Unique across the file. |
| `name` | The printed heading. A variant keeps the printed short title (`Crusader`) in `name`; the card shows the family through `variantOf`. The three Archaeopter entries store `Archaeopter <printed title>`, because they have no `variantOf` to carry the family. |
| `faction` | One of 11 fixed strings, in title case: `Imperial`, `Adepta Sororitas`, `Adeptus Astartes`, `Adeptus Mechanicus`, `Aeronautica Imperialis`, `Astra Militarum`, `Aeldari`, `Chaos Space Marines`, `Drukhari`, `Necron`, `Ork`. The book prints the section headings in capitals. If a printed heading differs in wording from this list, the extractor reports it and the list is corrected before the build. |
| `variantOf` | The family parent's `id` for a block that has no Value/Rarity line of its own, else `null`. Exception: the Archaeopter family (p. 79) has text and a Value but no block of its own, so its three blocks are top-level entries with `variantOf: null`, each carrying the family Value, Rarity, description and options. |
| `description` | Verbatim text under the heading, before the Value line. A variant's own paragraph, where printed, goes here. A variant with no paragraph stores `null`, and the card shows the family's text instead (§4). A loadout paragraph printed before the Value line belongs to `description` by this positional rule (Chaos Predator, Nightshade Interceptor, Vyper, War Walker). |
| `options` | Verbatim loadout paragraph after the Value line, or `null`. Lives on the parent only, except the Archaeopter case above. A paragraph that names several vehicles is printed once; the data copies it verbatim into the `options` of every top-level vehicle it names, so the reader of each named card sees it (the Rhino paragraph of p. 72 appears on six entries). A later text fix must change every copy. |
| `value`, `rarity` | From the printed Value/Rarity line. A variant copies its family's values. Where the family prose overrides a variant (Tornado and Typhoon Value 12, Vanquisher Rare), the variant stores the override. |
| `speed`, `manoeuvre`, `resilience`, `wounds` | Numbers from the `Spd / Man / Res / W` row. |
| `size` | The book's own size word, from the Vehicle Characteristics rule (p. 62): `Med` → `Medium`, `Large` → `Large`, `Huge` → `Huge`, `Gtn` → `Gargantuan`. `threats.json` has no vehicle sizes, and `Medium` is not relabelled as the threat word `Average`. |
| `keywords` | UPPERCASE strings, verbatim, including `TRANSPORTER` where printed and the `[LEGION]` and `[MARK OF CHAOS]` placeholders. |
| `crew` | The printed Crew Complement string, verbatim. |
| `traits` | Strings as printed, with values kept: `Turbo Boost (2)`. |
| `weapons[]` | One item per printed line. `text` is the line verbatim. `count` is the leading quantity (`2 Heavy Bolters` → 2), else 1. `twin: true` when the word `Twin` follows the optional leading quantity (`Twin Lascannon`, `2 Twin Big Shootas`); the key is absent otherwise. `weaponId` is the resolved `weapons.json` id or `null`. `profileIds`, an array of two or more `weapons.json` ids in file order, replaces a resolved `weaponId` when the printed weapon exists only as separate profile records (a Prism Cannon with a Focused and a Dispersed profile); `weaponId` is then `null`, and the key is absent otherwise. An empty box (`–` or `N/A`) gives `[]`. |
| `wargear[]` | One item per printed line. `text` verbatim; `equipmentId` the resolved `equipment.json` id or `null`. An empty box gives `[]`. |
| `sidebar` | `{ "title", "text" }` verbatim for a rule box inside the entry (Shokk Tunnel, p. 106), else `null`. |
| `source` | `"church"`, the short id that the wargear and glossary files already use for this book. |
| `page` | The printed page of the stat block. |

Text rule: every prose field (`description`, `options`, `sidebar`, `crew`, `traits`, `keywords`,
weapon and wargear `text`) holds verbatim book text, with straight apostrophes and quotes as the
existing data files use. No field in this feature gets an `[AI-Generated]` prefix. Where the book
has no text, the field is `null` or `[]`.

### 2.3 Resolution of weapon and wargear lines

The build step matches each line to a record by normalised name. Both sides are normalised the same
way: case folded, the leading quantity removed, the `Twin ` prefix removed, a trailing plural `s`
removed (`Saw Blades` and `Smoke Launchers` match the records `Saw Blade` and `Smoke Launcher`), and
a record-name suffix `(Vehicle)`, `(Weapon)` or `(Wargear)` removed, so a printed `Blaster` matches
the church-tier `Blaster (Vehicle)` before the infantry `Blaster`. A printed weapon that matches no
record by name, but matches two or more records in one tier whose names are the printed name plus a
profile label, is a profile family: the item gets `profileIds` with those ids in file order and
`weaponId: null`. Candidates come in tiers: first the `Vehicle - *` weapons with `source: "church"`, then `core`
records, then any other source. Heavy Bolter and Storm Bolter have no profile in this book and
resolve to the existing records, which carry `source: "voa"`; Lascannon resolves to the `core`
record. Two candidates with the same normalised name in one tier make an ambiguous match. Wargear
lines match the vehicle wargear in `equipment.json` the same way. A line that does not match, or
matches ambiguously, gets `null` and is listed in the build report. A short manual map inside the
build step handles the leftovers; a line that still does not resolve stays `null` and renders as
text.

## 3. Rules: new sections in `data/glossary.json`

Two new top-level sections, shaped like the existing ones: an object keyed by entry id, each entry
with `name`, `description`, `source: "church"` and `page`. Tables are embedded as
`<table class='glossary-table'>` inside the description, with the single-quoted attribute the
existing entries use. Every description is verbatim book text with straight apostrophes and quotes.

- `vehicleTraits`: the 12 definitions from pp. 62–63: All-Terrain, Amphibious, Bike, Flyer, Gun
  Ports, Gyro-Stabilised, Hover, Open Topped, Reliable, Sealed, Turbo Boost (X), Walker. The key is
  the snake_case name without the value: `turbo_boost`.
- `vehicleRules`: one entry per key in Appendix B.

Both apps' Rules Reference get two new categories, **Vehicle Traits** and **Vehicle Rules**. The
category lists are hard-coded in each app's `tabs/glossary-tab.js` and the category buttons in each
`index.html`; both get the two entries. A `#glossary/vehicleRules-<id>` deep link opens a rule.

**No inline links.** Neither popup engine (`js/glossary.js` in each app) adds the two sections to its
term map (`buildTermMap`). Registering them would turn every "Drive", "Ram", "Reload", "Ammo",
"Bike", "Walker" and "seal" in every description of both apps into a link, because `processText`
matches registered terms without regard to case and `addTermVariations` adds word stems. Instead,
the bestiary engine gets two popup types, `vehicleTrait` and `vehicleRule`, with labels in
`getTypeLabel`, and the vehicle card opens a popup by entry through `Glossary.showPopup`, as the
Threats card does for keyword chips (`threats-tab.js:811`). Rule text that names another rule stays
plain text.

## 4. Bestiary Vehicles tab

New file `bestiary/tabs/vehicles-tab.js`, global object `VehiclesTab`, modelled on `threats-tab.js`.

- **Display name:** wherever a vehicle's name appears outside its own card (the list, the encounter
  rows), a variant shows as `<name> (<family name>)`, for example `Crusader (Land Raider)`. A
  variant whose `name` already contains the family name shows the name alone: `Land Speeder
  Tornado`, not `Land Speeder Tornado (Land Speeder)`. `DataLoader.getVehicleDisplayName(vehicle)`
  builds it.
- **List:** display name, faction, Value/Rarity. Search matches name, description and keywords. A
  faction select holds the 11 faction values. The Settings source toggle: the tab keeps a vehicle
  when `SettingsTab.isSourceEnabled(vehicle.source)` is true; that function already maps the short
  id `church` to the "Church of Steel" button (`settings-tab.js:61`). `DataLoader.getAllSources()`
  adds the mapped source name of every vehicle, so the button no longer depends on the single
  Church of Steel threat.
- **Card:** heading with name, faction, Value and Rarity, source and page; a stat strip Spd / Man /
  Res / W / Size; keyword chips (popup type `keyword`, as on threats; a keyword with no glossary
  entry is a plain chip); Crew Complement; trait chips (popup type `vehicleTrait`; `Turbo Boost (2)`
  opens `turbo_boost`); a weapons table with columns Name (the printed text), Damage, ED, AP,
  Range/Reach, Salvo, Traits, filled from the resolved record (a melee record carries `reach`, a
  ranged record `range`), with a "Twin" marker that opens the `twin_weapons` rule, one row per
  profile with the record's name in the Name column for a `profileIds` line, and the printed text
  alone when neither `weaponId` nor `profileIds` resolves; a wargear list with the resolved effect text, or the printed
  text alone when unresolved; the description; the options paragraph; the sidebar box; for a variant
  whose `description` or `options` is `null`, the family's text under the family name; a "Variant
  of <family>" link; an **Add to Encounter** button.
- **Wiring:** a tab button and a `#tab-vehicles` container in `bestiary/index.html`;
  `data-loader.js` adds `vehicles.json` to the file list and the positional mapping, plus
  `getVehicles()`, `getVehicle(id)` and `getVehicleDisplayName()`; `app.js` adds
  `VehiclesTab.init()`, the `switchTab` branch and the `#vehicles/<id>` deep link; the mobile
  detail uses the existing BottomSheet, as the Threats tab does; styles in
  `bestiary/css/styles.css`; a `?v=` bump of every script and link tag in `bestiary/index.html`.
- The creator does not load `vehicles.json`.

## 5. Encounter Builder

State lives in `bestiary/js/encounter-state.js`; rendering in `bestiary/tabs/encounter-tab.js`.

- **Entry:** a new `vehicles[]` array beside `individuals[]`, `mobs[]` and `playerCharacters[]`.
  An item holds `{ id, vehicleId, wounds, initiative }`: `id` from `generateId()`, `wounds` the
  damage taken (0 at add), `initiative` `null` until the user sets it, as for a player character.
  Max Wounds is the vehicle's `wounds` field. No bonus, no Shock, no mob, no Elite or Adversary
  scaling; those controls stay hidden for a vehicle. The item is destroyed when `wounds` exceeds
  Max Wounds (p. 62: "more Wounds than its Max Wounds"); the row then uses the dead-individual
  styling. No flag is stored. The + button stops at Max Wounds + 1. An item whose vehicle does not
  resolve is never shown as destroyed.
- **Functions:** `addVehicle(vehicleId)`, `removeVehicle(id)`, `updateVehicleWounds(id, delta)`,
  `setVehicleInitiative(id, value)` and `getVehicle(id)` are new. `isEmpty()`, `clearEncounter()`,
  `getEncounterData()`, `loadFromData()` and `getEncounterListItems()` include the array, and
  `moveItemInOrder` accepts the item type `vehicle`. `recalculateAllStats()` leaves vehicles alone.
- **Add:** the **Add to Encounter** button on the Vehicles card (§4) is the only add path, as the
  Threats card button is for threats. The Threat Builder and Import Threat stay threat-only.
- **List row:** display name, damage taken over Max Wounds, + and − buttons, the initiative input,
  remove. The row sorts with the others by initiative or by the custom order.
- **Detail panel:** the vehicle card in compressed form (stat strip, keywords, crew, traits, weapons
  with profiles, wargear), the Wounds controls, and a link to the Vehicle Damage rule
  (`#glossary/vehicleRules-vehicle_damage`). The scroll preservation from issue #26 covers the
  panel. On mobile the BottomSheet shows the same panel.
- **Persistence:** `getEncounterData()` writes `vehicles` beside the other arrays, and every path
  that saves or loads an encounter (autosave, Save Encounter, Load Encounter through
  `loadEncounterFromFile()`) carries it; `version` stays 1, because an added array is not a
  breaking change. `loadFromData()` treats a missing `vehicles` as `[]`. An item whose `vehicleId` no longer resolves is kept: the row shows "Unknown vehicle"
  and the panel shows "Vehicle data not found", the same as a threat whose id no longer resolves.
  An older client (the frozen single-app bestiary shares this origin's `wng-bestiary-autosave`)
  ignores `vehicles` and drops it on its next autosave. Accepted: that snapshot gets no new
  features.

## 6. Transcription and verification

1. **Extract.** Five Opus extractors run in parallel, one per faction group (Appendix A). Each
   renders its pages with `pdftoppm` at 200 dpi (300 dpi crops where digits are small), reads the
   images, and writes a JSON fragment outside the repo. The fragment holds every field of §2.1
   except `weaponId` and `equipmentId`, which the build step fills. Two more extractors transcribe
   the traits and the rules (Appendix B).
2. **Build.** A throwaway node script outside the repo merges the fragments in book order, resolves
   the weapon and wargear ids (§2.3), writes `data/vehicles.json` and the glossary sections, and
   prints a report of unresolved and ambiguous lines and the distinct `faction` values.
3. **Verify.** A second, independent Opus pass re-reads every block against the page renders: the
   `Spd / Man / Res / W / Size` row, Value and Rarity, keywords, crew, traits, the weapon and
   wargear lines, and the prose (`description`, `options`, `sidebar`), and lists each mismatch word
   for word. The same pass covers the trait and rule texts. The mismatches are fixed from the page.
   The main session spot-checks five entries and two rules against the renders.
4. **Clean up.** The page renders are copyrighted. They stay outside the repo and are deleted at the
   end.

## 7. Tests and housekeeping

- `scripts/test-vehicles.js`, in the pattern of `scripts/test-followers.js`:
  - 107 entries; unique ids; every required field present with the right type; `twin`, where
    present, is `true`.
  - Per-faction counts as in Appendix A (Imperial 8, Adepta Sororitas 5, Adeptus Mechanicus 8,
    Aeronautica Imperialis 4, Adeptus Astartes 23, Astra Militarum 18, Aeldari 10, Drukhari 4,
    Necron 6, Chaos Space Marines 4, Ork 17); `faction` in the fixed set of §2.2.
  - `size` in `Medium`, `Large`, `Huge`, `Gargantuan`.
  - Every non-null `weaponId` and `equipmentId` resolves to a record; every `profileIds` array has
    two or more ids that all resolve, beside a `null` `weaponId`; every `variantOf` resolves to
    an entry of the same faction with `variantOf: null`; the three overrides hold (Land Speeder
    Tornado and Typhoon `value` 12, Leman Russ Vanquisher `rarity` `Rare`).
  - No string in the new data starts with `[AI-Generated]`.
  - `vehicleTraits` has the 12 keys; `vehicleRules` has the 40 required keys of Appendix B and at
    most 42 entries.
- Cache busting: every `?v=` tag in `bestiary/index.html` (new tab script included); every `?v=` tag
  in `creator/index.html` for the Rules Reference change; the creator data `?v=` in
  `creator/js/web-api.js` for the glossary change.
- `CLAUDE.md` data file list: add `vehicles.json` as bestiary-only.

## 8. Risks

- **Transcription errors** in dense stat rows and long prose. Mitigation: Opus extractors, the
  independent second pass over every field, and the spot check.
- **Name resolution** for Ork and Aeldari weapon names that differ between the block and the
  appendix. Mitigation: the manual map and `null` fallback, with the build report as the checklist.
- **Term collisions** if the new names ever become inline links. Mitigation: §3 registers none. A
  later round that wants inline links needs an allow-list of distinctive multi-word names.

## 9. Plan shape

One implementation plan in two waves. Wave 1 is data: extraction, build, the verify pass, the
glossary sections, and the test script. Wave 2 is UI: the Rules Reference categories in both apps,
the Vehicles tab, and the Encounter Builder, each built against the real data file. Wave 2 starts
when wave 1's test passes.

## Appendix A — The 107 vehicles by faction group and page

An asterisk marks a block without its own Value/Rarity line; such a block gets `variantOf`. A dagger
marks the three Archaeopter blocks, which also lack their own Value/Rarity line but are top-level
entries by the §2.2 exception.

**Group 1 — Imperial (8), Adepta Sororitas (5), Adeptus Mechanicus (8), Aeronautica Imperialis (4).**
Imperial, pp. 64–66: Achilles Ridgerunner, Avachrus Ridgerunner (64); Dirtcycle, Goliath Truck,
Goliath Rockgrinder (65); Tauros, Tauros Venator, Wolfquad (66). Adepta Sororitas, pp. 67–68:
Castigator, Exorcist (67); Immolator, Repressor, Adepta Sororitas Rhino (68). Adeptus Mechanicus,
pp. 79–81: Archaeopter Stratoraptor†, Archaeopter Fusilave†, Archaeopter Transvector† (79, in printed column order; the
Archaeopter family text and Value sit on the page, with no block of their own); Onager Dunecrawler,
Skorpius Disintegrator (80); Skorpius Dunerider, Ironstrider Ballistarius, Sydonian Dragoon (81).
Aeronautica Imperialis, pp. 82–84: Aquila Lander, Arvus Lighter, Vulture Gunship (82); Valkyrie (84).

**Group 2 — Adeptus Astartes (23), pp. 69–78.** Assault Bike, Attack Bike*, Scout Bike* (69); Land
Raider, Crusader*, Redeemer* (70); Land Speeder, Land Speeder Tornado*, Land Speeder Typhoon* (71);
Land Speeder Storm, Rhino (72); Razorback (73); Predator Annihilator, Predator Destructor (74);
Vindicator, Whirlwind (75); Gladiator, Gladiator Reaper*, Gladiator Valiant* (76); Impulsor, Invader
ATV (77); Repulsor, Repulsor Executioner* (78).

**Group 3 — Astra Militarum (18), pp. 84–91.** Chimera (84); Hellhound, Devil Dog, Bane Wolf (85);
Basilisk, Deathstrike, Hydra (86); Manticore, Wyvern, Leman Russ (87); Demolisher*, Eradicator*,
Punisher*, Vanquisher* (88, in printed column order); Scout Sentinel, Armoured Sentinel (89); Taurox, Taurox Prime (91).

**Group 4 — Aeldari (10), Drukhari (4), Necron (6).** Aeldari, pp. 92–96: Aeldari Jetbike (92);
Falcon, Fire Prism*, Firestorm*, Night Spinner* (93); Wave Serpent*, Hemlock Wraithfighter (94);
Nightshade Interceptor, Vyper (95); War Walker (96). Drukhari, pp. 99–100: Raider, Ravager (99);
Reaver Jetbike, Venom (100). Necron, pp. 101–103: Catacomb Command Barge, Doom Scythe (101);
Doomsday Ark, Ghost Ark (102); Tomb Blade, Triarch Stalker (103).

**Group 5 — Chaos Space Marines (4), Ork (17).** Chaos, pp. 97–98: Chaos Rhino (97); Chaos Predator,
Chaos Vindicator, Chaos Land Raider (98). Ork, pp. 104–111: Warbike, Boomdakka Snazzwagon (104);
Deffkilla Wartrike, Kustom Boosta Blasta (105); Megatrakk Scrapjet, Shokkjump Dragsta (106); Trukk,
Rukkatrukk Squigbuggy (107); Wazbom Blastajet, Battlewagon (108); Bonebreaka, Gunwagon, Kill Rig
(109); Deffkopta (110); Dakkajet, Blitza-Bommer, Burna-Bommer* (111).

Pages 83 and 90 hold no blocks. The survey counted 107 `Spd` headers and 87 Value/Rarity lines: 86
inside blocks plus the Archaeopter family line. The 21 marked blocks (18 asterisks, 3 daggers) are
the 107 minus 86.

## Appendix B — Rules entries for `vehicleRules`

One entry per key. The 40 plain keys are required. The two keys marked † exist only when the book
prints text under that section heading before its first sub-heading; the extractor decides from the
page. "Vehicle Weapons" (p. 60) gets no entry of its own: its other text is Workshop content. A table
belongs to the entry under whose heading it is printed; the Example Pilot Tests table and the
Vehicle Complications d6 table (pp. 46–50) go to the action entry they sit under, or to
`vehicle_actions` when they sit under the section heading. `page` is the page where the heading is
printed; where the table below gives a range, the extractor records the exact page.

| Key | Heading | Page |
|---|---|---|
| `benevolence_of_the_omnissiah` | Benevolence of the Omnissiah | 29 |
| `masters_of_machines` | Masters of Machines | 29 |
| `miraculum_mobili` | Miraculum Mobili | 29 |
| `bleeding_edge_technology` | Bleeding-Edge Technology | 30 |
| `wraithbone` | Wraithbone | 30 |
| `orks_build_tuff` | Orks Build Tuff | 31 |
| `green_wunz_only` | Green Wunz Only | 31 |
| `interacting_with_vehicles` † | Interacting with Vehicles | 44 |
| `embarking` | Embarking & Disembarking | 44 |
| `actions_inside` | Actions Inside a Vehicle | 44–45 |
| `complications` | Vehicle Complications (with its table) | 44–45 |
| `movement_on_a_vehicles_exterior` | Movement on a Vehicle's Exterior | 44 |
| `vehicle_roles` | Vehicle Roles (with the Pilot, Crew and Passenger actions table) | 45–46 |
| `vehicle_actions` † | Vehicle Actions | 46 |
| `drive` | Drive | 46–50 |
| `brace_for_impact` | Brace for Impact | 46–50 |
| `breakneck_speed` | Breakneck Speed | 46–50 |
| `xenos_tech` | Xenos Tech | 47 |
| `emergency_repair` | Emergency Repair | 46–50 |
| `evasive_manoeuvres` | Evasive Manoeuvres | 46–50 |
| `line_up_the_shot` | Line Up the Shot | 46–50 |
| `the_bigger_they_are` | Optional Rule: The Bigger They Are… | 48 |
| `open_fire` | Open Fire | 46–50 |
| `ram` | Ram | 46–50 |
| `reload` | Reload | 46–50 |
| `high_speed_tactics` | High-Speed Tactics | 50 |
| `attacking_from_a_vehicle` | Attacking from a Vehicle | 51 |
| `attacking_a_vehicles_occupants` | Attacking a Vehicle's Occupants | 51 |
| `vehicle_defence` | Vehicle Defence | 52 |
| `damaged_vehicles` | Damaged Vehicles | 52 |
| `vehicles_and_conditions` | Vehicles & Conditions | 53 |
| `out_of_control` | Out of Control | 53 |
| `called_shots` | Called Shots against Vehicles (with the two DN tables) | 53–54 |
| `vehicle_damage` | Vehicle Damage (the d66 table) | 54 |
| `repairing_vehicles` | Repairing Vehicles | 55 |
| `vehicle_explosions` | Vehicle Explosions (with its table) | 55 |
| `crash_and_burn` | Optional Rule: Crash and Burn | 55 |
| `built_to_last` | Optional Rule: Built to Last | 55 |
| `ammo` | Vehicle Ammo | 60 |
| `twin_weapons` | Twin Weapons | 60 |
| `vehicle_characteristics` | Vehicle Characteristics (with the Influence Modifier table) | 62 |

The page 50 sidebar "Vehicle Ammo" restates the page 60 rule in a shorter form, so it has no entry of its own. Decision of 2026-10-23, after Part 2 shipped. The page 60 entry `ammo` is the single "Vehicle Ammo" entry.
