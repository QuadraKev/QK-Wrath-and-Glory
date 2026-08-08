# Lex Imperialis integration — design

Date: 2026-08-07
Book: *Lex Imperialis* (Cubicle 7, updated 28 July 2026), 18 pages, Adeptus Arbites player supplement.
Source PDF: `../.QK-Wrath-and-Glory-reference/books/official-sourcebooks/Lex Imperialis.pdf`

## Goal

Add all game content from *Lex Imperialis* to the shared dataset in `/data/`, and register the
book as a filterable source in both apps.

## Book content

| Content | Count | Target file |
| --- | --- | --- |
| Archetypes | 6 | `archetypes.json` |
| Backgrounds (3 origin, 3 accomplishment, 3 goal) | 9 | `backgrounds.json` |
| Talents | 10 | `talents.json` |
| Ranged weapons | 9 | `weapons.json` |
| Melee weapons | 6 | `weapons.json` |
| Armour (Arbites Carapace Armour) | 1 | `armor.json` |
| Wargear items | 3 | `equipment.json` |
| Framework (Exaction Squad EX-G-X784) | 1 | out of scope |
| D66 name table, D6 objectives table | 2 | out of scope |

The six archetypes are Arbites Arbitrator, Arbites Castigator, Arbites Chirurgant,
Arbites Revelatum, Arbites Leashmaster, and Arbites Proctor-Exactant.

All ten talents spend Glory instead of Wrath.

## Existing content that overlaps

The dataset already contains a homebrew Apocrypha Arbites toolkit: 8 archetypes, 14 weapons,
2 armours, 4 equipment items, and 13 threats. All homebrew names carry the suffix
"(Abundance of Apocrypha)", and their statistics differ from the official statistics.

Decision: the official entries and the homebrew entries coexist. The user selects between them
with the source filter. No homebrew entry is deleted.

## Source registration

New source code: `lex`. Display name: `Lex Imperialis`.

| File | Change |
| --- | --- |
| `creator/js/data-loader.js` | add `'lex': 'Lex Imperialis'` to `sourceDisplayNames` |
| `bestiary/js/data-loader.js` | add the same entry to its parallel `sourceDisplayNames` |
| `creator/tabs/settings-tab.js` | add `{ id: 'lex', label: 'Lex Imperialis' }` to `sourceButtons` |
| `creator/js/state.js` | add `'lex'` to the `enabledSources` default array |
| `STYLE_GUIDE.md` | add `lex` to the documented source-code list |

The `enabledSources` default is load-bearing. If the code is absent from that array, the app
hides all new content by default.

The bestiary builds its source-filter buttons from the `source` values in `threats.json`.
This book adds no threats, thus the bestiary needs no filter change.

## Identifiers and names

Official entries use bare snake_case ids, which is the convention for all official books.
Where a bare id collides with an existing id, the new id gets the suffix `_lex`.

Nine weapons are unique to the Arbites and keep clean names. Their homebrew twins already carry
the "(Abundance of Apocrypha)" suffix, thus no display collision occurs:

Arbites Shotpistol, Arbites Combat Shotgun, Arbites Grenade Launcher, Executioner Shotgun,
Webber, Arbites Grenade, Voltaic Shock Mine, Remote Detonation, Excruciator Maul.

Six weapons are reprints of weapons that other books already define. The book changes only the
keyword list. These entries get the parenthetical "(Adeptus Arbites)" and an `_lex` id:

| New id | New name | Reprint of |
| --- | --- | --- |
| `power_sword_lex` | Power Sword (Adeptus Arbites) | `power_sword` (core) |
| `power_maul_lex` | Power Maul (Adeptus Arbites) | `power_maul` (fspg) |
| `power_fist_lex` | Power Fist (Adeptus Arbites) | `power_fist` (voa) |
| `heavy_stubber_lex` | Heavy Stubber (Adeptus Arbites) | `heavy_stubber` (core) |
| `shock_maul_lex` | Shock Maul (Adeptus Arbites) | `shock_maul` (core) |
| `combat_knife_lex` | Combat Knife (Adeptus Arbites) | `knife` (core) |

All 15 weapons include `ADEPTUS ARBITES` in `keywords`. The keyword filter and the glossary
popups thus find all of them.

## New schema — archetype `suggested`

Each archetype block in the book prints a suggested build. The `archetypes.json` schema has no
field for it. Add an optional `suggested` object. The field is additive, thus all existing
archetypes stay valid.

```json
"suggested": {
  "attributesXp": 54,
  "attributes": { "strength": 4, "toughness": 4, "agility": 3, "initiative": 3,
                  "willpower": 2, "intellect": 3, "fellowship": 3 },
  "skillsXp": 26,
  "skills": { "athletics": 1, "awareness": 2, "ballisticSkill": 3, "intimidation": 3,
              "investigation": 3, "leadership": 2, "weaponSkill": 2 },
  "talents": [ { "name": "Bloodhound", "source": "redacted1", "page": 61 } ]
}
```

`creator/tabs/archetype-tab.js` renders the field in `renderDetail()`. The new block goes
between the wargear block and the info box. It uses the same conditional pattern as the
abilities block and the wargear block.

## Backgrounds

The nine backgrounds map to the `bonusType` strings that `creator/js/derived-stats.js` already
accepts: `maxWounds`, `resolve`, `determination`, `maxShock`, `influence`, `conviction`.

Each entry gets `factions: ["adeptus_arbites"]`. Note that no code reads the `factions` field
today. The field is documentary and keeps the new entries consistent with the existing ones.

## Talents

Each talent that grants a flat bonus to a derived statistic also gets a `bonuses` object. This
follows the convention from Issue 16. Valid keys: `maxWounds`, `maxShock`, `resolve`,
`determination`, `conviction`, `influence`, `resilience`, `speed`, `passiveAwareness`.

## Glossary

- Replace the `[AI-Generated]` description on the `keywords.adeptus_arbites` entry with
  verbatim text from page 3, and cite `lex`. This removes an AI-generated string.
- Add the page 14 sidebar "Using Glory" as a `terms` entry, because all ten talents refer to it.

## Cache busting

| File | Change |
| --- | --- |
| `creator/index.html` | all `?v=111` become `?v=112` |
| `bestiary/index.html` | all `?v=89` become `?v=90` |
| `creator/js/web-api.js` | data `?v=41` becomes `?v=42` |

`bestiary/js/web-api.js` applies no version parameter to data fetches. It needs no change.

## Out of scope

The Framework "Exaction Squad EX-G-X784" (page 16) needs a data structure and a UI that the repo
does not have. The D66 name table and the D6 objectives table (pages 6 to 7) have no home in the
data model. This content stays out of both apps.

## Typographic corrections

Data text is verbatim book text. The one exception is obvious typographic errors, which are
corrected. The book contains these:

| Location | Printed | Corrected |
| --- | --- | --- |
| Arbites Revelatum, description | "devices to to strip away" | "devices to strip away" |
| Arbites Castigator, description | "in the name of the emperor" | "the Emperor" |
| Ruthless Triage (Chirurgant) | "any Test to aquire information" | "acquire" |
| Watchdog (Leashmaster) | no terminal period | period added |
| Earn the Eagle, description | no terminal period | period added |
| Go For the Throat! (Cyber Mastiff) | "uses it's Plasteel Bite" | "uses its" |
| Castigator suggested talents | "Castigators Stance" | "Castigator's Stance" |

Two defects are recorded rather than corrected, because a correction needs information the book
does not supply:

- The page 18 armour table clips its keyword cell. It reads "ADEPTUS ARBITES," with a trailing
  comma, and artwork covers the rest. Only the confirmed keyword is stored.
- The Arbites Grenade Launcher prints an asterisk for Damage and ED, and the book gives no legend.
  The `special` field carries the standard grenade-launcher wording under an `[AI-Generated]`
  prefix.
- The Lone Wolf talent prints "Requirements: ADEPTUS ARBITES," with a trailing comma. A second
  requirement appears to be missing. Only the printed keyword is stored.

## Verification

Serve the repository root on port 8137. Then confirm that:

1. The creator lists the 6 archetypes in an "Adeptus Arbites" group.
2. Each archetype detail card shows the suggested build.
3. The 9 backgrounds apply the correct derived-statistic bonuses.
4. The "Lex Imperialis" source filter shows and hides all new content.
5. The new weapons, armour, and wargear render, and their glossary popups work.
6. The bestiary Compendium lists the new gear.
7. `python3 -m json.tool` reports valid JSON for every changed data file.
