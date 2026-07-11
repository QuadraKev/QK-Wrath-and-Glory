# Wargear Pass + Vehicle Wargear Category Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Redacted Records II's non-weapon wargear in the shared dataset, add a combined "Vehicle Wargear" filter to both apps' Compendium, then audit every official sourcebook for missing wargear.

**Architecture:** Static no-build web apps; all game data lives once in `/data/` as JSON arrays; both apps' Compendium tabs (`creator/tabs/references-tab.js`, `bestiary/tabs/references-tab.js` — parallel copies, edited in parallel, never synced wholesale) bucket entries at load time. Phase 1 = data additions + UI filter, ship immediately. Phase 2 = per-book extraction subagents, diff, verify against rendered pages, add per book.

**Tech Stack:** Vanilla JS (global-object modules), JSON data files, PowerShell + WSL (`pdftoppm`/`pdfgrep` for book pages), Playwright MCP for browser verification.

**Spec:** `docs/superpowers/specs/2026-07-10-wargear-pass-vehicle-category-design.md`

## Global Constraints

- All data text VERBATIM from the sourcebook. Invent nothing; keep book typos. `[AI-Generated]` prefix only on fields with no source-book text (should not be needed here).
- IDs snake_case; keywords arrays of UPPERCASE strings; missing display values `"-"`; `source`/`page` on every entry.
- Numeric book rarity maps: 1=Common, 2=Uncommon, 3=Rare, 4=Very Rare (5=Unique).
- Commits authored `--author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>"`; end commit messages with `Claude-Session: https://claude.ai/code/session_01GSNKXJXKP6tLGRcWE5uUCB`. NEVER print `$GH_TOKEN`; pipe git output through `-replace '(ghp|github_pat)_[A-Za-z0-9_]+','[REDACTED]'`.
- After any `/data/*.json` edit, bump the creator data version in `creator/js/web-api.js` (`?v=22` → `?v=23`, once for all of Phase 1). For JS/HTML edits, bump ALL `?v=` in that app's `index.html` together (creator 98→99, bestiary 87→88).
- Serve the repo ROOT on port 8137 for browser tests.
- The two `references-tab.js` files have intentional divergences — apply the SAME localized edit to each; do not copy one file over the other.
- Apocrypha is OUT of the Phase 2 audit (tracked on issue #15). Adventure modules and bestiary books are out too.
- Git commands run via WSL: `wsl -d Ubuntu-24.04 --cd /root/projects/QK-Wrath-and-Glory -- /usr/bin/git …`. Multi-line commit messages via the base64 trick (see Task 4 Step 4).
- Paths: repo at `\\wsl.localhost\Ubuntu-24.04\root\projects\QK-Wrath-and-Glory` (Windows) = `/root/projects/QK-Wrath-and-Glory` (WSL). Books at `/root/projects/.QK-Wrath-and-Glory-reference/books/official-sourcebooks/`.

---

### Task 1: RR2 armour → `data/armor.json`

**Files:**
- Modify: `data/armor.json` (append 2 entries before the closing `]`)

**Interfaces:**
- Produces: entries `novitiate_armour`, `sacresant_shield` with `source: "redacted2"`. Armor entry shape (match existing): `id, name, type, description, ar, traits, value, rarity, keywords, [invulnerable,] source, page`.
- Book's starred AR (`*3`) = `"ar": 3` plus `"invulnerable": true` (precedent: `storm_shield`, core p. 231).

- [ ] **Step 1: Append the two entries**

Locate the final entry in `data/armor.json` and append after it (inside the array):

```json
  {
    "id": "novitiate_armour",
    "name": "Novitiate Armour",
    "type": "light",
    "description": "Usually taking the form of a close-fitting corselet, vambraces, and greaves, this suit of carapace armour provides light protection without sacrificing mobility.",
    "ar": 3,
    "traits": [],
    "value": 3,
    "rarity": "Uncommon",
    "keywords": [
      "IMPERIUM",
      "ADEPTUS MINISTORUM",
      "ADEPTA SORORITAS"
    ],
    "source": "redacted2",
    "page": 45
  },
  {
    "id": "sacresant_shield",
    "name": "Sacresant Shield",
    "type": "shield",
    "description": "Polished to a gleaming shine and embellished with the sacred icons of the Adepta Sororitas, these powered shields provide considerable protection against assault. Many orders ensure they are blessed before and after every battle, a process involving anointment and the sacred litanies of cleansing.",
    "ar": 3,
    "traits": [
      "Shield",
      "Power Field"
    ],
    "value": 6,
    "rarity": "Rare",
    "keywords": [
      "FORCE FIELD",
      "IMPERIUM",
      "ADEPTUS MINISTORUM",
      "ADEPTA SORORITAS"
    ],
    "invulnerable": true,
    "source": "redacted2",
    "page": 45
  }
```

(Stats verified against a 150-dpi render of RR2 p. 45: Novitiate Armour AR 3, no traits, V3 R2; Sacresant Shield AR *3, Shield + Power Field, V6 R3.)

- [ ] **Step 2: Validate**

Run (PowerShell):
```powershell
$a = Get-Content "\\wsl.localhost\Ubuntu-24.04\root\projects\QK-Wrath-and-Glory\data\armor.json" -Raw | ConvertFrom-Json; "count=$($a.Count) dupes=$(($a | Group-Object id | Where-Object Count -gt 1).Count) rr2=$(($a | Where-Object source -eq 'redacted2').Count)"
```
Expected: `count=127 dupes=0 rr2=2` (was 125).

---

### Task 2: RR2 rituals → `data/equipment.json` (new `ritual` category)

**Files:**
- Modify: `data/equipment.json` (append 2 entries before the closing `]`)

**Interfaces:**
- Produces: entries `hephestian_foresight`, `julyannas_banishment` with `category: "ritual"`. Equipment entry shape (match the dh relic shape): `id, name, category, description, effect, value, rarity, keywords, source, page`.
- The Compendium shows unknown equipment categories as a capitalized badge automatically ("Ritual") — no UI change needed for this.

- [ ] **Step 1: Append the two entries**

```json
  {
    "id": "hephestian_foresight",
    "name": "Hephestian Foresight",
    "category": "ritual",
    "description": "Known only to the upper echelons of Enochian aristocracy and the Adeptus Ministorum that rule the Shrine World, this ritual attempts to divine the future through the myriad wisdoms of the God-Emperor disseminated by the Cult Imperialis.\n\nThe basis of the ritual known as Hephestian Foresight is simple: ask a wise and pious elder of Hephesteum's Rest (an Adeptus Ministorum monastery on Enoch, detailed in Litanies of the Lost) a simple question, and they will rake their recollections, scour sacred librariums, and potentially use sanctioned esotericism to divine an answer. Of course, this definition is broad, with myriad permutations depending on the parties performing or requisitioning the Ritual and the questions asked in its course.",
    "effect": "Hephestian Foresight functions similarly to the Psychometry Psychic Power (Wrath & Glory Rulebook, page 275), but where Psychometry deals with the past, Hephestian Foresight can purportedly also dredge up obscure information about the present and what may come to pass. Any clues gleaned are likely vague and fraught with ambiguous symbology, pointing towards some important fact the Agents must uncover and which may even be at odds with their goals.",
    "value": 8,
    "rarity": "Rare",
    "keywords": [],
    "source": "redacted2",
    "page": 9
  },
  {
    "id": "julyannas_banishment",
    "name": "Julyanna's Banishment",
    "category": "ritual",
    "description": "Of the many miracles attributed to Saint Julyanna, one of the strangest is the exorcism of a daemon said to possess the body of one of her attendants. The tale of Julyanna's Banishment is a frequent addition to the sermons of many Ministorum preachers in Gilead, and details of the long and gruesome ritual it entailed are relayed with relish.",
    "effect": "As relayed by the chief confessor of Enoch, the ritual requires various trappings, including holy texts, a dozen iron nails, and an icon of the God-Emperor. How many of these are essential, and how many merely embellishments added by successive generations of preachers is unclear. Certainly the devotion of the participants must be absolute. The possessed person must be present, ideally restrained, and within a circle drawn with warding symbols and passages from holy texts. The time taken is said to vary along with the potency of the daemon in question — at least an hour, perhaps several days. If successful, the daemon is cast back into the warp.\n\nIt is traditionally claimed that a daemon so banished may not return for a year and a day, though if this has any merit, or is merely related due to the fact that Julyanna's unfortunate attendant is said to have lingered on for only a single year after the experience, is unclear.",
    "value": 9,
    "rarity": "Very Rare",
    "keywords": [],
    "source": "redacted2",
    "page": 10
  }
```

(Transcribed from 150-dpi renders of RR2 pp. 9–10; re-check wording against `/tmp/rr2/p-09.png` and `/tmp/rr2/p-10.png` if in doubt — re-render with `pdftoppm -f 9 -l 10 -r 150 -png "Redacted Records II.pdf" /tmp/rr2/p` in the books directory if `/tmp/rr2` is gone.)

- [ ] **Step 2: Validate**

```powershell
$e = Get-Content "\\wsl.localhost\Ubuntu-24.04\root\projects\QK-Wrath-and-Glory\data\equipment.json" -Raw | ConvertFrom-Json; "count=$($e.Count) dupes=$(($e | Group-Object id | Where-Object Count -gt 1).Count) rituals=$(($e | Where-Object category -eq 'ritual').Count)"
```
Expected: `count=329 dupes=0 rituals=2` (was 327).

---

### Task 3: RR2 relics → `data/equipment.json` (existing `relic` category)

**Files:**
- Modify: `data/equipment.json` (append 4 entries before the closing `]`)

**Interfaces:**
- Produces: entries `rosarius_of_saint_agatha`, `skadi_matrix`, `the_cornerstone`, `the_unwilling_orb`, `category: "relic"`, same entry shape as Task 2. No printed Value/Rarity in the book → `"value": "-", "rarity": "-"`.

- [ ] **Step 1: Append the four entries**

```json
  {
    "id": "rosarius_of_saint_agatha",
    "name": "Rosarius of Saint Agatha",
    "category": "relic",
    "description": "Agatha de Souza was a manufactorum overseer on Gilead Primus during the Age of Apostasy. Records indicate she was burned at the stake for the murder of a Ministorum deacon, a supporter of Lord Vandire who wanted the weapons she manufactured. It is said that as the deacon's supporters crowded around Agatha's pyre in mockery, she prayed only for retribution. At the moment of Agatha's death, the pyre answered with a conflagration that wiped out the baying mob.\n\nHer Rosarius, a reward for exceeding production quotas, was the only item to survive the fire. A few weeks later news reached Gilead of Vandire's death, leading many to believe that Agatha died at the precise moment of Vandire's execution.",
    "effect": "It is a standard Rosarius, with the following additions; its power field crackles with arcs of golden electricity, even when dormant, giving the wearer +2 to Intimidation Interaction Attacks. Striking the field causes an energy backlash: unless the attacker passes a DN 3 Initiative (I) Test, they become Blinded and On Fire. The DN is raised by 1 for enemies with the HERETIC Keyword.",
    "value": "-",
    "rarity": "-",
    "keywords": [],
    "source": "redacted2",
    "page": 20
  },
  {
    "id": "skadi_matrix",
    "name": "Skadi Matrix",
    "category": "relic",
    "description": "The Skadi Matrix is a simple data chip, such as those installed in Servitors. However, its Machine Spirit refuses any attempt to study or copy its contents. Tech-Priests in Gilead are aware of (and jealously guard) only two Skadi Matrices in the system, though they chase any rumour of more.\n\nThey are in effect targeting algorithms, but sophisticated beyond the Adeptus Mechanicus. A Skadi Matrix draws data and power from nearby sensors, using them to track objects and calculate firing solutions for the user. The more data feeds it can access, the more complex and accurate its targeting abilities become. How it does this is a mystery. The oldest, most knowledgeable Magi mutter cryptically of fractal programming and emergent energy fields, but even they admit to speculation. Skadi Matrices are miracles of the Omnissiah, proof that He once granted Mankind mastery of the universe through knowledge.",
    "effect": "A Skadi Matrix must be installed in a Mind Impulse Unit. It automatically interfaces with any sensory technology within roughly 50m, including highly encrypted data feeds, which would concern other Imperial organisations deeply if they knew.\n\nThe user may declare a Ranged attack using the Skadi Matrix in combat. The syphoning of energy causes nearby lights to dim and devices to malfunction, inflicting a +1 DN penalty to enemy attacks until the end of the round. The user is granted up to +5 bonus dice for a Ranged Attack, but at a cost — the chip's calculations generate intense heat within the skull, causing severe injury. For every +1 bonus dice the user adds to the Ranged Attack, they suffer 2 Shock damage. If surrounding technology is absent, the maximum bonus may be limited as the GM decides.",
    "value": "-",
    "rarity": "-",
    "keywords": [],
    "source": "redacted2",
    "page": 22
  },
  {
    "id": "the_cornerstone",
    "name": "The Cornerstone",
    "category": "relic",
    "description": "Precisely which structure the Cornerstone came from is hotly debated in the Enochian Synod; some claim it was the first brick laid in Saint Julyanna's tomb, others that it marked the first temple on the planet, and more still that it belonged to the tomb of any number of other revered heroes and prophets of the Gilead Crusade. The Synod's sects can agree on precisely three points; it possesses great power, it should not be available to the public, and its theft by the Adeptus Mechanicus during the Age of Apostasy is intolerable.\n\nThe Cornerstone is a kiln-fired brick of a yellow-brown colour. Its surfaces are worn smooth from the touch of countless pilgrims over millennia. Detailed analysis reveals traces of gold and cerulean glaze, suggesting that its function was decorative rather than structural, but the Ministorum will not tolerate such blasphemy. This is of little interest to the Adeptus Mechanicus, who are utterly at a loss to explain its power.",
    "effect": "If a character is brave or foolish enough to touch the Cornerstone, they instantly lose the minimum number of Corruption Points required to lower their Corruption Level (Wrath & Glory Rulebook, page 285) by 1. For example, whether a character has 6-11 Corruption Points (Tarnished), they immediately reduce them to 5 (Pure). The affected character also takes 1 Mortal Wound for every Corruption Point removed in this way. This only works once; the Cornerstone will not save those who fall twice.",
    "value": "-",
    "rarity": "-",
    "keywords": [],
    "source": "redacted2",
    "page": 24
  },
  {
    "id": "the_unwilling_orb",
    "name": "The Unwilling Orb",
    "category": "relic",
    "description": "Genestealer Cults, though wildly varied, all share some similarities, due to their secretive nature and the hierarchy which develops under the Patriarch at each cult's heart. The Unwilling Orb is an artefact found across infestations. Cultists treat the Unwilling Orb with awed reverence; it is a manifestation of their Patriarch's power to defend his children and destroy those who would harm them. It is the third eye of one of the Imperium's Navigators, torn from its socket and preserved, somehow still alive, in a gemstone wrought by xenos alchemy. In battle it pulses with sickening light, protecting the faithful from enemy psychic powers with appalling ease, while allowing a Magus to channel an even greater portion of their Patriarch's ravenous psychic might.",
    "effect": "The Unwilling Orb is a Psychic Focus (Wrath & Glory Rulebook, page 239), with some additions. These abilities only apply for characters with the GENESTEALER CULT and PSYKER Keywords. It grants the user a number of bonus dice equal to the game's Tier to their Psychic Mastery (Wil) Tests. It allows the user to cast Deny the Witch up to twice each round as a Free Action. The character need not be aware that a Psychic Power is being cast.",
    "value": "-",
    "rarity": "-",
    "keywords": [],
    "source": "redacted2",
    "page": 26
  }
```

(Transcribed from 150-dpi renders of RR2 pp. 20–27. Source images `/tmp/rr2/p-20.png` … `p-27.png`.)

- [ ] **Step 2: Validate**

```powershell
$e = Get-Content "\\wsl.localhost\Ubuntu-24.04\root\projects\QK-Wrath-and-Glory\data\equipment.json" -Raw | ConvertFrom-Json; "count=$($e.Count) dupes=$(($e | Group-Object id | Where-Object Count -gt 1).Count) rr2=$(($e | Where-Object source -eq 'redacted2').Count)"
```
Expected: `count=333 dupes=0 rr2=6`.

---

### Task 4: Bump creator data cache + commit Phase 1a

**Files:**
- Modify: `creator/js/web-api.js:20`

**Interfaces:**
- Consumes: Tasks 1–3 data edits.

- [ ] **Step 1: Bump the data version**

In `creator/js/web-api.js` line 20, change `?v=22` → `?v=23`:
```js
const response = await fetch('../data/' + filename + '?v=23');
```

- [ ] **Step 2: Commit**

```powershell
$script = @'
cd /root/projects/QK-Wrath-and-Glory && /usr/bin/git add data/armor.json data/equipment.json creator/js/web-api.js && /usr/bin/git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Add Redacted Records II armour, rituals, and relics

Novitiate Armour and Sacresant Shield (p. 45) join armor.json. The two
Rituals (pp. 9-10) join equipment.json under a new ritual category, and
the four narrative relics (pp. 20-27) join the relic category, all with
verbatim book text. Bumps the creator data cache to v23.

Claude-Session: https://claude.ai/code/session_01GSNKXJXKP6tLGRcWE5uUCB"
'@; $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($script)); $out = wsl -d Ubuntu-24.04 -- bash -c "echo $b64 | base64 -d | bash"; ($out -join "`n") -replace '(ghp|github_pat)_[A-Za-z0-9_]+','[REDACTED]'
```
Expected: commit created, 3 files changed.

---

### Task 5: Vehicle Wargear filter — creator

**Files:**
- Modify: `creator/tabs/references-tab.js` (CATEGORIES list ~line 15; weapons loop ~lines 84–98; equipment loop ~lines 109–125)
- Modify: `creator/index.html` (filter button ~line 448; ALL `?v=98` → `?v=99`)

**Interfaces:**
- Produces: Compendium bucket key `vehicleWargear`, display name "Vehicle Wargear". Weapons with `category` starting `"Vehicle"` and equipment with `category === 'vehicle wargear'` land there (and leave Weapons/Grenades/Equipment). Task 6 applies the identical logic to the bestiary copy.

- [ ] **Step 1: Add the category to CATEGORIES**

In `creator/tabs/references-tab.js`, after the `grenades` line in `CATEGORIES`:
```js
        { key: 'grenades', name: 'Grenade/Missile', pluralName: 'Grenades & Missiles' },
        { key: 'vehicleWargear', name: 'Vehicle Wargear', pluralName: 'Vehicle Wargear' },
```

- [ ] **Step 2: Route vehicle weapons in the weapons loop**

Replace the body of the weapons loop (currently computing `isGrenade` then pushing) with:
```js
        // Weapons (separate grenades & missiles and vehicle wargear into their own categories)
        const grenadeCategories = ['Grenade', 'Missile', 'Explosive'];
        for (const w of DataLoader.getAllWeapons()) {
            const typeLabel = w.type === 'melee' ? 'Melee' : 'Ranged';
            const kws = (w.keywords || []).map(k => k.toUpperCase());
            const isVehicle = w.category && w.category.startsWith('Vehicle');
            const isGrenade = !isVehicle && ((w.category && grenadeCategories.includes(w.category)) || kws.includes('GRENADE') || kws.includes('MISSILE'));
            this.allEntries.push({
                ...w,
                category: isVehicle ? 'vehicleWargear' : (isGrenade ? 'grenades' : 'weapons'),
                categoryName: isVehicle ? 'Vehicle Wargear' : (isGrenade ? 'Grenade/Missile' : 'Weapon'),
                categoryPluralName: isVehicle ? 'Vehicle Wargear' : (isGrenade ? 'Grenades & Missiles' : 'Weapons'),
                briefInfo: typeLabel,
                searchText: `${w.name} ${w.description || ''} ${(w.traits || []).join(' ')} ${(w.keywords || []).join(' ')}`.toLowerCase()
            });
        }
```
Note: the vehicle check deliberately precedes the grenade check so `Vehicle - Missile` weapons (whose MISSILE keyword currently routes them to Grenades & Missiles) move to Vehicle Wargear.

- [ ] **Step 3: Route vehicle equipment in the equipment loop**

In the `Augmetics & Equipment` loop, insert a branch between the `augmetic` case and the final `else`:
```js
            } else if (e.category === 'vehicle wargear') {
                this.allEntries.push({
                    ...e, category: 'vehicleWargear', categoryName: 'Vehicle Wargear', categoryPluralName: 'Vehicle Wargear',
                    briefInfo: 'Vehicle Wargear',
                    searchText: `${e.name} ${e.description || ''} ${e.effect || ''}`.toLowerCase()
                });
            } else {
```

- [ ] **Step 4: Add the filter button and bump cache versions**

In `creator/index.html`, after the grenades button (~line 448):
```html
                            <button class="references-filter-btn" data-category="vehicleWargear">Vehicle Wargear</button>
```
Then replace ALL `?v=98` with `?v=99` throughout `creator/index.html` (lines 12–13 and 503–528; 28 occurrences).

- [ ] **Step 5: Commit**

```powershell
$script = @'
cd /root/projects/QK-Wrath-and-Glory && /usr/bin/git add creator/tabs/references-tab.js creator/index.html && /usr/bin/git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Add a Vehicle Wargear filter to the creator Compendium

Claude-Session: https://claude.ai/code/session_01GSNKXJXKP6tLGRcWE5uUCB"
'@; $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($script)); $out = wsl -d Ubuntu-24.04 -- bash -c "echo $b64 | base64 -d | bash"; ($out -join "`n") -replace '(ghp|github_pat)_[A-Za-z0-9_]+','[REDACTED]'
```

---

### Task 6: Vehicle Wargear filter — bestiary

**Files:**
- Modify: `bestiary/tabs/references-tab.js` (same three regions — its CATEGORIES and its weapons/equipment loops are textually identical to the creator's in these spots)
- Modify: `bestiary/index.html` (filter button ~line 291; ALL `?v=87` → `?v=88`)

**Interfaces:**
- Consumes: the exact snippets from Task 5 Steps 1–3 (apply them verbatim to the bestiary file — the surrounding divergences elsewhere in the file stay untouched).
- Produces: identical `vehicleWargear` bucket in the bestiary Compendium.

- [ ] **Step 1: Apply Task 5 Steps 1–3 edits to `bestiary/tabs/references-tab.js`**

Same three code changes, same content, in `bestiary/tabs/references-tab.js`. Touch only the CATEGORIES entry, the weapons loop, and the equipment branch — nothing else in the file.

- [ ] **Step 2: Add the filter button and bump cache versions**

In `bestiary/index.html`, after the grenades button (~line 291), add the same button line as Task 5 Step 4. Then replace ALL `?v=87` with `?v=88` (lines 12–13 and 351–363; 15 occurrences).

- [ ] **Step 3: Commit**

Same commit command as Task 5 Step 5 with files `bestiary/tabs/references-tab.js bestiary/index.html` and message `"Add a Vehicle Wargear filter to the bestiary Compendium"` (same trailer).

---

### Task 7: Phase 1 verification + push (deploy)

**Files:** none (verification only)

- [ ] **Step 1: Validate all changed JSON and serve**

```powershell
wsl -d Ubuntu-24.04 --cd /root/projects/QK-Wrath-and-Glory -- python3 -m http.server 8137
```
(run_in_background: true)

- [ ] **Step 2: Drive the creator Compendium (Playwright MCP)**

Navigate `http://localhost:8137/creator/?cb=vw1#references`, click COMPENDIUM. Verify:
- A "Vehicle Wargear" filter button exists; clicking it shows a "Vehicle Wargear (202)" heading (152 vehicle weapons + 50 vehicle equipment).
- Searching `Atalan Incinerator` shows it under Vehicle Wargear (not Weapons).
- Searching `Sacresant Shield` (filter: Armor) renders AR 3, traits Shield, Power Field, "Redacted Records II, p. 45".
- Searching `Skadi Matrix` (filter: Equipment) renders the relic with Value "-" and effect text.
- Searching `Hephestian Foresight` renders with badge "Ritual", Value 8, Rarity Rare.
- Weapons and Grenades & Missiles counts DROPPED accordingly (no vehicle items left inside; grenade count loses the `Vehicle - Missile` items).

- [ ] **Step 3: Drive the bestiary Compendium**

Navigate `http://localhost:8137/bestiary/?cb=vw1`, click COMPENDIUM, repeat the Vehicle Wargear filter check and one entry check (`Atalan Incinerator`).

- [ ] **Step 4: Check console for errors**

Playwright `browser_console_messages` level=error on both apps: nothing beyond the known favicon 404.

- [ ] **Step 5: Stop server, push**

```powershell
wsl -d Ubuntu-24.04 -- bash -c "pkill -f 'http.server 8137'"; $env:WSLENV = "GH_TOKEN/u"; $out = wsl -d Ubuntu-24.04 --cd /root/projects/QK-Wrath-and-Glory -- /usr/bin/git push origin main 2>&1; ($out -join "`n") -replace '(ghp|github_pat)_[A-Za-z0-9_]+','[REDACTED]'
```
Expected: `main -> main` push line; GitHub Pages deploys automatically.

---

### Task 8: Phase 2 — dispatch per-book extraction subagents

**Files:** none (subagent dispatch; results land in scratchpad files)

**Interfaces:**
- Produces: one inventory markdown per book in the session scratchpad, `wargear-inventory-<sourcekey>.md`, listing every statted wargear item (weapons, armour, equipment, augmetics) with page and full stats.

Books and source keys (folder `/root/projects/.QK-Wrath-and-Glory-reference/books/official-sourcebooks/`):

| PDF | source key |
|---|---|
| Core Rulebook.pdf | core |
| Forsaken System.pdf | fspg |
| Redacted Records I.pdf | redacted1 |
| Redacted Records II.pdf | redacted2 (armour/equipment/augmetics only — weapons + p.45 armour + rituals/relics already done) |
| Church of Steel.pdf | church |
| Vow of Absolution.pdf | voa |
| Aeldari Inheritance of Embers.pdf | aeldari |
| Departmento Munitorum Shotguns.pdf | shotguns |

- [ ] **Step 1: Dispatch one Agent per book** (general-purpose, `model: "opus"`, background, batch 2–3 at a time to bound token spend)

Prompt template (fill `<PDF>` and `<sourcekey>`):

```
Read the Wrath & Glory sourcebook PDF at
/root/projects/.QK-Wrath-and-Glory-reference/books/official-sourcebooks/<PDF>
(you can Read PDF pages directly; use the pages parameter, max 20 pages per call).

Produce a COMPLETE inventory of every player-facing wargear ITEM the book
defines with stats: weapons (incl. grenades/missiles/vehicle weapons), armour,
equipment, and augmetics. For each item record:
- name exactly as printed
- printed page number (read it off the page, not the PDF index)
- item type: weapon / armour / equipment / augmetic
- the full stat line as printed (weapons: Damage/ED/AP/Range/Salvo/Traits/
  Value/Rarity/Keywords; armour: AR/Traits/Value/Rarity/Keywords; equipment:
  Value/Rarity/Keywords if printed)
- whether it came from a stats TABLE or PROSE text

EXCLUDE: threat/NPC-statblock weapons, vehicles themselves, talents, psychic
powers, ascension packages, and anything with no stats at all (list those
separately at the end under "Named but unstatted").

Write the inventory as a markdown table (one section per item type) to:
C:\Users\QUADRA~1\AppData\Local\Temp\claude\--wsl-localhost-Ubuntu-24-04-root-projects-QK-Wrath-and-Glory\22407b85-6232-4d96-b094-850ed042f3e4\scratchpad\wargear-inventory-<sourcekey>.md
Also state the book's printed-page-to-PDF-page offset you observed.
Accuracy over speed: dense two-column stat tables are easy to misread — check
each row twice. Do not guess; if a cell is illegible note it as [unclear].
```

- [ ] **Step 2: Track completion**

Collect the returned inventories as agents finish (they notify on completion). Do not start Task 9 for a book until its inventory file exists and reads cleanly.

---

### Task 9: Phase 2 — per-book diff, verify, add (repeat ×8 books)

**Files (per book):**
- Modify: any of `data/weapons.json`, `data/armor.json`, `data/equipment.json`
- Modify: `creator/js/web-api.js` (data `?v` bump, once per commit that touches data)

**Interfaces:**
- Consumes: `wargear-inventory-<sourcekey>.md` from Task 8; data conventions from Global Constraints plus: secondary weapon profiles go in a `special` string ("Ranged: A X can be used as a Ranged weapon, using the following profile: …"); melee damage `{"base": N, "attribute": "strength", "bonus": 0}`; ranged damage `{"base": N, "attribute": null, "bonus": 0}`; melee reach-2 `"range": 2`; starred shield AR → `ar` + `"invulnerable": true`.

Per book, in this order — core, fspg, redacted1, redacted2, church, voa, aeldari, shotguns:

- [ ] **Step 1: Diff inventory vs dataset**

```powershell
# For each inventory item name, check all three data files (case-insensitive contains):
$w = Get-Content "\\wsl.localhost\Ubuntu-24.04\root\projects\QK-Wrath-and-Glory\data\weapons.json" -Raw | ConvertFrom-Json
$a = Get-Content "\\wsl.localhost\Ubuntu-24.04\root\projects\QK-Wrath-and-Glory\data\armor.json" -Raw | ConvertFrom-Json
$e = Get-Content "\\wsl.localhost\Ubuntu-24.04\root\projects\QK-Wrath-and-Glory\data\equipment.json" -Raw | ConvertFrom-Json
# ($all = $w + $a + $e; then for each name: $all | Where-Object { $_.name -like "*$name*" })
```
Classify each item: PRESENT (same stats), PRESENT-CONFLICT (stats differ from the book — check whether our entry cites a different book first; a reprint keeps the earliest official entry), or MISSING.

- [ ] **Step 2: Verify every MISSING and PRESENT-CONFLICT item against rendered pages**

```powershell
$script = 'cd "/root/projects/.QK-Wrath-and-Glory-reference/books/official-sourcebooks" && pdftoppm -f <N> -l <M> -r 150 -png "<PDF>" /tmp/audit/p'; # base64-wrap as usual
```
Read the PNGs (`\\wsl.localhost\Ubuntu-24.04\tmp\audit\p-*.png`). For dense tables re-render the table region at `-r 300` with `-x/-y/-W/-H` crops. NEVER add an entry from the subagent inventory alone.

- [ ] **Step 3: Add verified MISSING entries**

Append to the matching data file following the conventions block above; descriptions verbatim from the page render. Reprints identical to an existing entry from another book: skip, note in findings. Same name but genuinely different item: add with the official name; if the names collide exactly, keep both only when the apps can disambiguate (the Apocrypha suffix pattern) — otherwise flag in findings instead.

- [ ] **Step 4: Validate + commit the book**

Run the Task 1/2-style ConvertFrom-Json count check on every touched file (expected deltas from Step 3 count; `dupes=0`). If data changed, bump `creator/js/web-api.js` data `?v` by 1 in the same commit. Commit message: `"Add missing <Book Title> wargear from the all-books audit"` + session trailer; push after each book.

- [ ] **Step 5: Record findings**

Append to `scratchpad/wargear-audit-findings.md`: unstatted references, reprints skipped, stat conflicts (book vs book, table vs prose), book typos preserved, [unclear] cells that needed a re-render.

---

### Task 10: Phase 2 wrap-up — verification, findings report, memory

**Files:**
- Create: none in repo (findings delivered in chat; memory updated)

- [ ] **Step 1: Final browser pass**

Serve port 8137; in both apps' Compendium spot-check 2–3 newly added entries per data file (stats + source citation render correctly), confirm bucket counts, console clean.

- [ ] **Step 2: Deliver the findings report in chat**

Summarize per book: items added (count + notable), reprints skipped, conflicts needing a decision, unstatted items (e.g. RR2 robes/flight pack/cyber-beasts), and anything punted. Ask for decisions only where a real fork exists.

- [ ] **Step 3: Update memory**

Update `rr2-weapons-shipped.md` (RR2 now fully covered; retitle pointer in MEMORY.md) and add an audit-outcome memory if per-book gaps were found and filled.

---

## Self-review notes

- Spec coverage: Phase 1a (Tasks 1–4), Phase 1b (Tasks 5–6), verification/deploy (Task 7), Phase 2 audit (Tasks 8–9), findings report (Task 10). Vehicle filter covers both weapons and equipment per the "one combined filter" decision. Apocrypha exclusion enforced in Task 8's book list.
- The `Vehicle - Missile` → Vehicle Wargear reclassification (out of Grenades & Missiles) is intentional and called out in Task 5 Step 2 and Task 7 Step 2.
- Type consistency: bucket key `vehicleWargear` and display "Vehicle Wargear" used identically in Tasks 5, 6, 7; entry shapes in Tasks 1–3 match the existing `armor.json`/`equipment.json` shapes sampled from `storm_shield`/`bodyglove`/`endless_grimoire_dh`.
