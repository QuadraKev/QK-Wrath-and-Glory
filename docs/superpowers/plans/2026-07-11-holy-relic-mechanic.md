# Holy Relic Mechanic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player build a Holy Relic (Redacted Records II pp. 12–19) in the Character Creator: pick a base wargear item and layer the book's relic properties (Form, Origins, one Power, Oddities) on top via an 8-step wizard.

**Architecture:** A new shared data file `data/holy-relics.json` holds the verbatim RR2 tables. A relic is a normal `character.wargear` entry keeping the base item's real id plus a `relic` overlay object, so all existing stat plumbing (derived stats, damage math, upgrades, save/load) works unchanged. A new `RelicWizard` global module renders the wizard modal; the wargear tab gets an entry card and relic-aware owned-item display; the character sheet gets relic naming and a Holy Relics detail block.

**Tech Stack:** Vanilla JS, global-object module pattern, no build step. Data via `DataLoader` / `window.api.loadGameData`. Read `STYLE_GUIDE.md` before writing code.

**Spec:** `docs/superpowers/specs/2026-07-11-holy-relic-mechanic-design.md`

## Global Constraints

- All rules text in `data/holy-relics.json` is VERBATIM from RR2 pp. 13–19 as embedded in Task 1 (including the "consumes far less ammunition that it should" typo). Never paraphrase or invent text.
- One Power per relic. Oddities are multi-select (0 or more).
- Base-item eligibility, everywhere: `rarity !== 'Unique'`, weapon `category` must not start with `Vehicle`, and the item's `source` must pass `State.isSourceEnabled(item.source)`.
- Grenade or Missile Weapon form uses the `ammunition` powers table.
- The wizard and entry card are gated on `State.isSourceEnabled('redacted2')`.
- Creator-only: never touch `bestiary/`, `shared/`, or other `data/` files.
- No stat automation: relic powers are display text only; derived stats keep using the base item untouched.
- IDs snake_case. Never rename existing data ids.
- Cache busting: Task 1 bumps the data `?v` in `creator/js/web-api.js` by exactly 1 (36→37). Every task that touches creator JS/CSS/HTML bumps the `?v` on ALL `<script>`/`<link>` tags in `creator/index.html` together by 1.
- Commit per task, author `--author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>"`, trailer `Claude-Session: https://claude.ai/code/session_01GSNKXJXKP6tLGRcWE5uUCB`. Do NOT push. Git runs in WSL: from PowerShell wrap scripts as base64 → `wsl -d Ubuntu-24.04 -- bash -c "echo <b64> | base64 -d | bash"`; never print env vars or remote URLs.
- Working tree lives at `\\wsl.localhost\Ubuntu-24.04\root\projects\QK-Wrath-and-Glory` (PowerShell/Read/Edit tools) = `/root/projects/QK-Wrath-and-Glory` (WSL).
- Browser checks: serve the repo ROOT on port 8137 (`python3 -m http.server 8137` in WSL, or any static server) and open `http://localhost:8137/creator/`; hard-reload after `?v` bumps.

---

### Task 1: `data/holy-relics.json` + DataLoader wiring

**Files:**
- Create: `data/holy-relics.json`
- Modify: `creator/js/data-loader.js` (add file to `loadAll`, add getter)
- Modify: `creator/js/web-api.js` (line 20: `?v=36` → `?v=37`)

**Interfaces:**
- Produces: `DataLoader.getHolyRelics()` → the parsed object below, or `null` before load. `holy-relics.json` is loaded in `DataLoader.loadAll()` alongside the other files.

- [ ] **Step 1: Create `data/holy-relics.json` with EXACTLY this content** (2-space indent, UTF-8, LF newlines, trailing newline):

```json
{
  "source": "redacted2",
  "page": 12,
  "formTable": {
    "page": 13,
    "rows": [
      ["augmetic", "uncommon_tool_or_equipment", "projectile_weapon", "las_weapon", "flame_weapon", "melta_weapon"],
      ["uncommon_tool_or_equipment", "rare_tool_or_equipment", "common_tool_or_equipment", "projectile_weapon", "plasma_weapon", "bolt_weapon"],
      ["mundane_melee_weapon", "common_tool_or_equipment", "las_weapon", "mundane_armour_or_clothing", "projectile_weapon", "grenade_or_missile_weapon"],
      ["power_weapon", "mundane_melee_weapon", "chain_weapon", "las_weapon", "bolt_weapon", "projectile_weapon"],
      ["chain_weapon", "exotic_melee_weapon", "mundane_melee_weapon", "flame_weapon", "power_field", "mundane_armour_or_clothing"],
      ["force_weapon", "chain_weapon", "power_weapon", "mundane_melee_weapon", "mundane_armour_or_clothing", "powered_armour"]
    ]
  },
  "forms": {
    "augmetic": { "name": "Augmetic", "powersTable": "augmetic" },
    "common_tool_or_equipment": { "name": "Common Tool or Equipment", "powersTable": "tool" },
    "uncommon_tool_or_equipment": { "name": "Uncommon Tool or Equipment", "powersTable": "tool" },
    "rare_tool_or_equipment": { "name": "Rare Tool or Equipment", "powersTable": "tool" },
    "mundane_melee_weapon": { "name": "Mundane Melee Weapon", "powersTable": "melee" },
    "chain_weapon": { "name": "Chain Weapon", "powersTable": "melee" },
    "power_weapon": { "name": "Power Weapon", "powersTable": "melee" },
    "force_weapon": { "name": "Force Weapon", "powersTable": "melee" },
    "exotic_melee_weapon": { "name": "Exotic Melee Weapon", "powersTable": "melee" },
    "projectile_weapon": { "name": "Projectile Weapon", "powersTable": "ranged" },
    "las_weapon": { "name": "Las Weapon", "powersTable": "ranged" },
    "flame_weapon": { "name": "Flame Weapon", "powersTable": "ranged" },
    "plasma_weapon": { "name": "Plasma Weapon", "powersTable": "ranged" },
    "melta_weapon": { "name": "Melta Weapon", "powersTable": "ranged" },
    "bolt_weapon": { "name": "Bolt Weapon", "powersTable": "ranged" },
    "grenade_or_missile_weapon": { "name": "Grenade or Missile Weapon", "powersTable": "ammunition" },
    "mundane_armour_or_clothing": { "name": "Mundane Armour or Clothing", "powersTable": "armour" },
    "powered_armour": { "name": "Powered Armour", "powersTable": "armour" },
    "power_field": { "name": "Power Field", "powersTable": "armour" }
  },
  "origins": {
    "originalOwner": {
      "name": "Original Owner",
      "page": 14,
      "entries": [
        { "id": "adeptus_mechanicus", "roll": 1, "name": "Adeptus Mechanicus", "description": "Adeptus Mechanicus Relics can be inscrutable to those not well-versed in the Omnissiah's teachings. Many display machine code engravings, or mathematical formulae of significance. They usually follow STC patterns with slavish devotion, as innovation is considered an impossible affront to the fact that the Machine God already bestowed all knowledge upon Humanity many ages ago. Weapons are supremely powerful, while augmetics perform far above expected norms. Whether the source of their abilities is holy power or superior technology is irrelevant to a Tech-Priest, as they are one and the same." },
        { "id": "adeptus_ministorum", "roll": 2, "name": "Adeptus Ministorum", "description": "Adeptus Ministorum Relics are what most Imperial citizens think of when they think of Relics at all. While many are weapons, Adeptus Ministorum Relics also include the remains of saints and heroes that may be incorporated into useful wargear, revered tomes from learned sages, and all manner of everyday objects blessed by the Emperor and His most devout followers." },
        { "id": "archaeotech", "roll": 3, "name": "Archaeotech", "description": "Archaeotech Relics are items constructed in Humanity's ancient golden age. They often conform to Standard Template Construct patterns, which may overlap with Adeptus Mechanicus Relics, but many remain utterly unique in design. These items often far outstripped the capabilities of their contemporaries even before gaining supposedly miraculous abilities." },
        { "id": "astra_militarum", "roll": 4, "name": "Astra Militarum", "description": "Astra Militarum Relics are often plain in appearance, reflecting the mass production needed to supply the colossal armies of the Imperial Guard. More elaborately designed and decorated Relics almost all belonged to a highly decorated officer or hero. Weapons and armour are the most common Relics, though many others exist, from Entrenching Tools to copies of the Imperial Infantryman's Uplifting Primer." },
        { "id": "adeptus_astra_telepathica", "roll": 5, "name": "Adeptus Astra Telepathica", "description": "Adeptus Astra Telepathica Relics are mostly tied to knowledge or manipulation of the Immaterium, and are often a mix of holy and occult imagery that would confuse and worry the average Imperial citizen or priest. They range from skulls of renowned past psykers, to Bolters impregnated with psychic force, or tomes containing the true names of daemons." },
        { "id": "imperial_agents", "roll": 6, "name": "Imperial Agents", "description": "Imperial Agent Relics were once wielded by the Holy Ordos of the Inquisition, or the bold bearers of a Warrant of Trade. Such heirlooms are almost universally exotic in nature, incorporating the rarest and most esoteric of technologies. Artefacts of the Inquisition may incorporate hexagrammic seals, litanies to rebuke heretics and xenos, or engraved histories of the foul foes a weapon has slain. Relics once possessed by particularly pious Rogue Traders may have been present when worlds were discovered and conquered, or been crucial in bringing low the God-Emperor's foes beyond the borders of the Imperium." }
      ]
    },
    "anointment": {
      "name": "Anointment",
      "page": 15,
      "entries": [
        { "id": "heros_panoply", "roll": 1, "name": "Hero's Panoply", "description": "The item is known to have belonged to a hero of the Imperium, who made frequent use of it. Perhaps it was a powerful Relic even then, or perhaps it became one after its owner was canonised as a saint, or given some other exemplary title befitting the Faction they served." },
        { "id": "felled_a_champion", "roll": 2, "name": "Felled a Champion", "description": "The item became a Relic when it was used to defeat a mighty enemy champion. It may have protected the owner, or could have struck a decisive blow in battle." },
        { "id": "turned_the_tide", "roll": 3, "name": "Turned the Tide", "description": "When all seemed lost in a terrible battle, this Relic miraculously inspired the Imperium's soldiers to rally and achieve victory against all odds. Perhaps it is wreathed in golden light, or its mere reputation strikes fear into the foe." },
        { "id": "banished_a_daemon", "roll": 4, "name": "Banished a Daemon", "description": "The item gained its fame for being instrumental in banishing a foul daemon. It may be useful in binding daemons, or it could be especially damaging to creatures of the Immaterium." },
        { "id": "revelatory", "roll": 5, "name": "Revelatory", "description": "The object was recognised as a holy Relic when it led believers to some grand discovery. Perhaps it led the Adeptus Mechanicus to a fragment of STC technology, or inspired a pilgrimage to find the lost tomb of an Imperial hero." },
        { "id": "saviour", "roll": 6, "name": "Saviour", "description": "The Relic saved the life of a renowned hero. It could be suffused with pious energies, or may simply be a copy of The Imperial Infantryman's Uplifting Primer that stopped an assassin's bullet." }
      ]
    }
  },
  "powers": {
    "melee": {
      "name": "Melee Weapon Relic Powers",
      "page": 16,
      "entries": [
        { "id": "transformative_strength", "roll": 1, "name": "Transformative Strength", "choice": "attributeOrSkill", "description": "The weapon proves devastating in the most unlikely hands. Choose an Attribute or Skill besides Strength. The weapon's Damage is increased by that Attribute, instead of Strength." },
        { "id": "ranged_attack", "roll": 2, "name": "Ranged Attack", "description": "Whether arcs of warp-lightning or holy flame, the weapon can cast powerful attacks at a distance. By sacrificing 1 Shock, the wielder may declare a single ranged attack on their Turn, granting the weapon a Range of 6 - 12 - 18. The Damage and Weapon Traits are unchanged." },
        { "id": "unwavering_loyalty", "roll": 3, "name": "Unwavering Loyalty", "description": "The weapon chooses who can wield it. This is usually the Agent who discovers it, but may be the original owner, who might still be searching for it. In the hands of anyone else, it loses all Weapon Traits except Heavy (X) and Unwieldy (X). If it already has Heavy (X) or Unwieldy (X), the Rating is increased by 1." },
        { "id": "holy_hatred", "roll": 4, "name": "Holy Hatred", "choice": "enemyKeyword", "description": "The weapon hungers for the blood of the Imperium's enemies; roll on the Enemy Keyword Table (page 18) to determine which. When the weapon successfully hits an enemy with that Keyword, it gains the Brutal Trait. If it already possesses Brutal, the Extra Damage Dice gain +1 Damage (1-2 inflicts 1 Damage, 3-4 inflicts 2 Damage, 5-6 inflicts 3)." },
        { "id": "defender", "roll": 5, "name": "Defender", "description": "The weapon seems to anticipate the movements of both its wielder and their opponent, darting to parry blows almost before they are made. Even bullets and las blasts can be deflected on occasion. While wielding this weapon, you gain +2 to your Defence against both melee and ranged attacks." },
        { "id": "fearsome_aura", "roll": 6, "name": "Fearsome Aura", "description": "Power radiates in palpable waves from the weapon, sowing fear among enemies and emboldening allies. While wielded in combat, the owner causes Fear (if they already cause Fear, the DN to resist is increased by +2) in enemies, and allies who can see the weapon gain a +2 bonus dice to all Fear Tests." }
      ]
    },
    "ranged": {
      "name": "Ranged Weapon Relic Powers",
      "page": 16,
      "entries": [
        { "id": "vow_of_silence", "roll": 1, "name": "Vow of Silence", "description": "The weapon makes no sound at all when fired. Physical ammunition still makes a sound as it travels, and on impact, and firing such weapons always reduces your Stealth Score by a minimum of 1." },
        { "id": "mighty_roar", "roll": 2, "name": "Mighty Roar", "description": "The weapon makes a fearsome sound when fired. When making a ranged attack, the wielder can also make an Intimidation Interaction Attack on the target as a Free Action." },
        { "id": "blessed_efficiency", "roll": 3, "name": "Blessed Efficiency", "description": "Whether through arcane science or faith in the God-Emperor, this weapon consumes far less ammunition that it should. When reloading this weapon, roll 1d6; on a result of 5-6, no ammunition is consumed." },
        { "id": "piercing_hatred", "roll": 4, "name": "Piercing Hatred", "choice": "enemyKeyword", "description": "This weapon excels at killing specific enemies of the Imperium; roll on the Enemy Keyword Table (page 18) to determine which. Against enemies with that Keyword, the weapon ignores the target's base Resilience when reducing Damage (Armour applies as normal)." },
        { "id": "divine_guidance", "roll": 5, "name": "Divine Guidance", "description": "The weapon's shots are seemingly directed by the hand of the God-Emperor Himself. The user may shift an Icon to eliminate either a single category of penalty on the Test, or bonus to the target. Roll 1d6 to randomise between: 1-2. Eliminate Range Penalties, 3-4. Eliminate Vision Penalties, 5-6. Eliminate Size Penalties" },
        { "id": "righteous_fury", "roll": 6, "name": "Righteous Fury", "description": "The weapon seems to delight in causing particularly horrific wounds. Every Critical Hit with this weapon is improved as if 1 point of Glory had been spent. The wielder may still spend Glory points on additional effects, if available." }
      ]
    },
    "ammunition": {
      "name": "Ammunition Relic Powers",
      "page": 17,
      "entries": [
        { "id": "saints_tears", "roll": 1, "name": "Saint's Tears", "description": "This ammunition was anointed with the tears of a saint who vowed to avenge the many fallen soldiers of a battle. On a successful ranged attack, each enemy hit grants the user +1 Resilience until their next turn." },
        { "id": "lux_deum", "roll": 2, "name": "Lux Deum", "description": "The shell casings, prometheum canisters or charge packs bear the seal of a famously militant hero or saint. They burn with a supernatural light when fired, inflicting the Blinded Condition on a successful hit." },
        { "id": "sanguis_sancti", "roll": 3, "name": "Sanguis Sancti", "description": "Anointed with the blood of a saint who died in battle, this ammunition demands its targets share the same fate. A successful hit inflicts the Bleeding Condition, even if the target is normally immune to Bleeding; daemons bleed the very energy holding them together, while Necrons leak coolant, lubricants or whatever other xenos filth flows through their blasphemous necrodermis." },
        { "id": "blessed_with_hatred", "roll": 4, "name": "Blessed with Hatred", "choice": "enemyKeyword", "description": "This ammunition was blessed with prayers against a specific enemy of the Imperium. Roll on the Enemy Keyword Table (page 18). The weapon deals double damage to enemies with this Keyword." },
        { "id": "heretek_denunciation", "roll": 5, "name": "Heretek Denunciation", "description": "This ammunition reserves special hatred for the technology of the enemy, and rebukes their Machine Spirits. The target of an attack made with this ammunition cannot use a Power Field to roll Determination against Mortal Wounds caused by the attack. Additionally, targets hit with this ammo roll an automatic Complication on their next action, if that action uses any technology. Even unpowered melee weapons miss, fumble, or break. If the target has the HERETIC Keyword, attacks with this ammunition also have +Rank AP." },
        { "id": "furys_ally", "roll": 6, "name": "Fury's Ally", "description": "Emblazoned with potent religious wards and litanies of disgust, this ammunition feeds off the hatred of its user. A weapon using this ammunition gains the Force Trait; the attacker adds half their Willpower Rating to the Damage total. The user does not need to have the PSYKER Keyword to benefit." }
      ]
    },
    "armour": {
      "name": "Armour, Clothing, and Power Field Relic Powers",
      "page": 17,
      "entries": [
        { "id": "bulwark_of_the_soul", "roll": 1, "name": "Bulwark of the Soul", "description": "The Relic protects the soul as much as the body. While wearing this Relic, the DN of all Tests against Fear, Terror, or Intimidation are reduced by 1." },
        { "id": "blessed_healing", "roll": 2, "name": "Blessed Healing", "description": "The Relic slowly but surely knits flesh and bone back together in battle. At the end of each combat round, the wearer heals 1 Wound. Outside of combat, this relic will only activate to restore 1 Wound when its wearer is Dying. They still fall Prone and take a Memorable or Traumatic Injury." },
        { "id": "blessing_of_skill", "roll": 3, "name": "Blessing of [Skill]", "choice": "skill", "description": "The holy power of this Relic courses through the body, imparting knowledge or sharpening reflexes. The Gamemaster chooses a Skill; while worn, this Relic grants +2 bonus dice to that Skill. If you are using the optional rule Innate vs Learned (Wrath & Glory Rulebook, page 127), this allows a character to make a Test for Skills they would otherwise have at Rating 0." },
        { "id": "countersmite", "roll": 4, "name": "Countersmite", "choice": "condition", "description": "This Relic answers those who dare to strike its wearer with a mighty blow of its own, be it arcs of electricity, flames, or a gust of rending spectral blades. Choose a Condition (Wrath & Glory Rulebook, page 197). When an enemy successfully hits the wearer in close combat, they must pass a DN 3 Initiative (I) Test or take 1 level of that Condition." },
        { "id": "abhor_the_witch", "roll": 5, "name": "Abhor the Witch", "description": "This Relic is especially contemptuous of the warp, fortifying the wearer against it. When the wearer is targeted by a Psychic Power, the caster must increase the power's DN by 2." },
        { "id": "haste_of_the_righteous", "roll": 6, "name": "Haste of the Righteous", "description": "The Relic grants alarming quickness of thought and action in battle. During combat, enemies cannot take Free or Reflexive Actions against the wearer." }
      ]
    },
    "augmetic": {
      "name": "Augmetic Relic Powers",
      "page": 18,
      "entries": [
        { "id": "multitask_benediction", "roll": 1, "name": "Multitask Benediction", "description": "The sacred augmetic performs the function of two augmetics; an Augmetic Arm might also filter toxins from the bloodstream like an Augmetic Respirator, or include a Cardioproxy or Mechadendrite." },
        { "id": "supreme_craftsmanship", "roll": 2, "name": "Supreme Craftsmanship", "description": "This exquisite augmetic was crafted by high-ranking Tech-Priests, or hails from the Dark Age of Technology, and is heavily blessed by the Machine God. Any numeric bonuses from the Augmetic are doubled. If it's a Ballistic Mechadendrite weapon it gains the Mastercrafted Upgrade." },
        { "id": "voice_in_the_machine", "roll": 3, "name": "Voice in the Machine", "description": "The augmetic whispers knowledge of the Omnissiah's blessings in your mind, granting you an unusual affinity for technology. Owners gain the Binary Chatter Trait (Wrath & Glory Rulebook, page 130), even if they lack the ADEPTUS MECHANICUS Keyword. If they already possess Binary Chatter, the +Double Rank bonus becomes +Triple Rank." },
        { "id": "null_alloy", "roll": 4, "name": "Null-alloy", "description": "The augmetic is constructed from barely understood archaeotech materials with warp-resistant properties. Augmetic eyes can see through warp illusions, augmetic limbs or weapons inflict +2ED on psykers and daemons, and other augmetics grant +2 Defence against daemons and Psychic Powers." },
        { "id": "motive_force_discharge_capacitor", "roll": 5, "name": "Motive Force Discharge Capacitor", "description": "The augmetic slowly builds and stores an electrical charge from the owner's own bioelectric field. Once per game session, the owner may discharge this capacitor at a target up to 10m away. This is treated as Moderate Electricity Damage (Wrath & Glory Rulebook, page 201)." },
        { "id": "logic_of_hatred", "roll": 6, "name": "Logic of Hatred", "choice": "enemyKeyword", "description": "The augmetic is charged with animosity toward a specific enemy of the God-Emperor or Omnissiah. Roll on the Enemy Keyword Table. The augmetic hums or vibrates when enemies with that Keyword are within 20m (this may initially require a DN 3 Insight (Fel) Test for the Agent to recognise). In combat, the user gains +1 bonus dice on Attacks against that enemy." }
      ]
    },
    "tool": {
      "name": "Tool, Equipment and Trinket Relic Powers",
      "page": 18,
      "entries": [
        { "id": "blessing_of_opportunity", "roll": 1, "name": "Blessing of Opportunity", "description": "The wearer may make 1 extra Reflexive Action per round." },
        { "id": "righteous_wrath", "roll": 2, "name": "Righteous Wrath", "description": "On a Wrath Critical, the owner may make another attack as a Free Action." },
        { "id": "shield_of_purity", "roll": 3, "name": "Shield of Purity", "description": "The Relic repels the corruption of the Ruinous Powers. When making Corruption Tests, roll +2 bonus dice." },
        { "id": "punish_the_witch", "roll": 4, "name": "Punish the Witch", "description": "This Relic turns a psyker's powers against them. If a psyker targets the owner with a Psychic Power, they must substitute a die in their Psychic Mastery (Wil) Test with an extra Wrath die." },
        { "id": "wrathful_sacrifice", "roll": 5, "name": "Wrathful Sacrifice", "description": "The Relic's owner can inspire their allies to snatch victory from the jaws of defeat; the owner may spend a point of Wrath to allow an ally to re-roll failures." },
        { "id": "faith_endures", "roll": 6, "name": "Faith Endures", "description": "When rolling Determination, the owner rolls +1 bonus die." }
      ]
    }
  },
  "enemyKeywords": {
    "page": 18,
    "entries": [
      { "roll": 4, "keyword": "Vehicle" },
      { "roll": 5, "keyword": "Beast" },
      { "roll": 6, "keyword": "Mutant" },
      { "roll": 7, "keyword": "Psyker" },
      { "roll": 8, "keyword": "Necron" },
      { "roll": 9, "keyword": "Tyranid" },
      { "roll": 10, "keyword": "Daemon" },
      { "roll": 11, "keyword": "Heretic" },
      { "roll": 12, "keyword": "Khorne" },
      { "roll": 13, "keyword": "Nurgle" },
      { "roll": 14, "keyword": "Chaos" },
      { "roll": 15, "keyword": "Tzeentch" },
      { "roll": 16, "keyword": "Slaanesh" },
      { "roll": 17, "keyword": "Aeldari" },
      { "roll": 18, "keyword": "Ork" },
      { "roll": 19, "keyword": "Genestealer" },
      { "roll": 20, "keyword": "Drukhari" },
      { "roll": 21, "keyword": "T'au" },
      { "roll": 22, "keyword": "Kroot" },
      { "roll": 23, "keyword": "Abhuman" },
      { "roll": 24, "keyword": "Human" }
    ]
  },
  "oddities": {
    "name": "Relic Oddities",
    "page": 19,
    "entries": [
      { "id": "oathbound", "roll": 1, "name": "Oathbound", "description": "The Relic requires users to swear a specific oath. If the owner fails to uphold the oath, they can no longer activate the Relic's Powers. Such oaths are often engraved on the Relic, such as along a sword's blade, or on the cover of a book." },
      { "id": "appease_the_machine_spirit", "roll": 2, "name": "Appease the Machine Spirit", "description": "The Relic's Powers only activate when a specific prayer or hymn to the God-Emperor or Machine God is recited. Failure to recite the required words causes an automatic Complication." },
      { "id": "path_of_the_saints", "roll": 3, "name": "Path of the Saints", "description": "The Relic demands strict adherence to a particular moral code practised by its creator or previous owner. It should be something relatively easy that offers roleplaying opportunities, like 'never eat Grox meat' or 'do not drink wine', but any time this code is broken, the Relic forces the owner to roll on the Perils of the Warp Table (Wrath & Glory Rulebook, page 263)." },
      { "id": "challenging_canon", "roll": 4, "name": "Challenging Canon", "description": "The Relic sometimes grants the owner glimpses into its past. These often contradict established dogma, and could get the owner in serious trouble if mentioned in public. At the GM's discretion, the owner may attempt a DN 4 Insight (Fel) Test, to apply such memories to the current situation, such as appeasing the Machine Spirit of a high security vault door." },
      { "id": "ravaged_by_time", "roll": 5, "name": "Ravaged by Time", "description": "Through age, neglect, or both, the Relic is on the verge of falling apart. If a Complication is rolled during its use, it becomes damaged and must be repaired during a Respite before it can be used again." },
      { "id": "aware", "roll": 6, "name": "Aware", "description": "While not, strictly speaking, alive, the Relic has developed a rudimentary personality of its own, and may communicate with its owner through flashes of imagery or sound, or in dreams. Aware Relics have agendas, and encourage their owners to advance them, though they are rarely more complex than 'kill Orks' or 'honour the memory of my last owner'. They can also form opinions of people; someone who earns the Relic's displeasure may find its Powers abandoning them at a crucial moment." }
    ]
  },
  "sacredShells": "Ammunition with sacred power is extremely potent, but also very limited. If you run out of Ammo while using Relic Ammo, that's it; it's gone. Similarly, Relic grenades and missiles are explicitly single-use items. Make them count."
}
```

- [ ] **Step 2: Validate the file** (PowerShell):

```powershell
$h = Get-Content "\\wsl.localhost\Ubuntu-24.04\root\projects\QK-Wrath-and-Glory\data\holy-relics.json" -Raw | ConvertFrom-Json
$cells = $h.formTable.rows | ForEach-Object { $_ }
"cells: $($cells.Count)"                                    # expect 36
"forms: $(($h.forms | Get-Member -MemberType NoteProperty).Count)"  # expect 19
$formIds = ($h.forms | Get-Member -MemberType NoteProperty).Name
"unknown cell ids: $(@($cells | Where-Object { $_ -notin $formIds }).Count)"  # expect 0
"owner: $($h.origins.originalOwner.entries.Count) anoint: $($h.origins.anointment.entries.Count)"  # 6 / 6
foreach ($t in 'melee','ranged','ammunition','armour','augmetic','tool') { "$t: $($h.powers.$t.entries.Count)" }  # 6 each
"keywords: $($h.enemyKeywords.entries.Count)"               # 21 (rolls 4..24)
"oddities: $($h.oddities.entries.Count)"                    # 6
```

Expected: all counts as noted in the comments.

- [ ] **Step 3: Wire DataLoader.** In `creator/js/data-loader.js`: add `'holy-relics.json'` to the `files` array in `loadAll()` (after `'keyword-categories.json'`), add `holyRelics: results[12] || null` to the `gameData` object, and add this getter after `getWargearItem`:

```js
    // Get the Holy Relic creation tables (Redacted Records II)
    getHolyRelics() {
        return this.cache['holy-relics.json'] || null;
    },
```

- [ ] **Step 4: Bump the data cache.** In `creator/js/web-api.js` line 20, change `?v=36` to `?v=37`.

- [ ] **Step 5: Verify in the browser.** Serve repo root on port 8137, open `http://localhost:8137/creator/`, hard-reload, and in the console run `DataLoader.getHolyRelics()` — expect the object with all keys present and no console errors.

- [ ] **Step 6: Commit** (message subject: `Add the Holy Relic creation tables from Redacted Records II`; body notes verbatim transcription of pp. 13-19 and the creator data cache bump to v37).

---

### Task 2: State methods + RelicWizard module

**Files:**
- Modify: `creator/js/state.js` (two new methods after `removeWargearByIndex`, ~line 737)
- Create: `creator/js/relic-wizard.js`
- Modify: `creator/index.html` (add script tag for relic-wizard.js after the state.js/data-loader.js tags and before the tab scripts; bump ALL `?v` on script/link tags together)
- Modify: `creator/css/styles.css` (wizard styles, appended at end)

**Interfaces:**
- Consumes: `DataLoader.getHolyRelics()` (Task 1), `DataLoader.getAllWeapons()/getAllArmor()/getAllEquipment()/getWargearItem(id)`, `State.isSourceEnabled(source)`, `DataLoader.cache['glossary.json'].conditions` (object keyed by id, each value has `.name`).
- Produces (used by Tasks 3–4):
  - `State.addRelicWargear(itemId, relic)` — pushes `{ id: itemId, isStarting: false, relic }` and notifies `'wargear'`.
  - `State.updateRelicWargear(wargearIndex, itemId, relic)` — updates entry in place; if `itemId` differs from the existing id, resets `entry.upgrades` to `[]`; notifies `'wargear'`.
  - `RelicWizard.open(wargearIndex = null)` — opens the wizard modal; `null` = create, index = edit prefilled from the entry.
  - `RelicWizard.onSaved` — optional callback property; if set, called with no args after a relic is added/updated (Task 3 sets it to re-render the wargear tab).
  - The relic overlay shape stored on wargear entries:
    `{ name, form, originalOwner, anointment, power, powerChoice?, oddities: [] }`
    (`form`/`originalOwner`/`anointment`/`power`/`oddities[]` hold ids from holy-relics.json; `powerChoice` is a display string — an enemy keyword, attribute/skill name, skill name, or condition name — present only when the power has a `choice` field.)

- [ ] **Step 1: Add the State methods** in `creator/js/state.js` directly after `removeWargearByIndex`:

```js
    // Add a Holy Relic wargear entry (base item id + relic overlay)
    addRelicWargear(itemId, relic) {
        this.character.wargear.push({ id: itemId, isStarting: false, relic: relic });
        this.notifyListeners('wargear', itemId);
    },

    // Update a Holy Relic wargear entry in place (edit flow)
    updateRelicWargear(wargearIndex, itemId, relic) {
        if (wargearIndex < 0 || wargearIndex >= this.character.wargear.length) return;
        const entry = this.character.wargear[wargearIndex];
        if (entry.id !== itemId) {
            entry.id = itemId;
            entry.upgrades = [];
        }
        entry.relic = relic;
        this.notifyListeners('wargear', itemId);
    },
```

- [ ] **Step 2: Create `creator/js/relic-wizard.js`.** Global-object module `const RelicWizard = {…}` following the existing modal pattern (see `WargearTab.initUpgradeModal`). Required internals:

**Constants:**

```js
    ATTRIBUTES: ['Strength', 'Toughness', 'Agility', 'Initiative', 'Willpower', 'Intellect', 'Fellowship'],
    SKILLS: ['Athletics', 'Awareness', 'Ballistic Skill', 'Cunning', 'Deception', 'Insight',
             'Intimidation', 'Investigation', 'Leadership', 'Medicae', 'Persuasion', 'Pilot',
             'Psychic Mastery', 'Scholar', 'Stealth', 'Survival', 'Tech', 'Weapon Skill'],
```

(For `attributeOrSkill`, offer ATTRIBUTES minus Strength, then SKILLS, in one grouped dropdown. For `skill`, offer SKILLS. For `condition`, offer `Object.values(DataLoader.cache['glossary.json']?.conditions || {}).map(c => c.name)`.)

**Wizard state:** `{ editIndex: null, step: 0, name: '', formId: null, baseItemId: null, originalOwner: null, anointment: null, power: null, powerChoice: null, oddities: [] }`.

**Base-item filtering — implement exactly this logic:**

```js
    // Strip the dataset's " Weapons"/" Weapon" category-suffix variants: "Chain Weapons" -> "Chain"
    normalizeCategory(cat) {
        return (cat || '').replace(/ Weapons?$/, '');
    },

    // Universal eligibility: no Unique rarity, no vehicle categories, source enabled
    isEligible(item) {
        if (item.rarity === 'Unique') return false;
        if ((item.category || '').startsWith('Vehicle')) return false;
        return State.isSourceEnabled(item.source);
    },

    meleeByCategory(pred) {
        return (DataLoader.getAllWeapons() || []).filter(w =>
            w.type === 'melee' && this.isEligible(w) && pred(this.normalizeCategory(w.category)));
    },

    rangedByCategory(pred) {
        return (DataLoader.getAllWeapons() || []).filter(w =>
            w.type === 'ranged' && this.isEligible(w) && pred(this.normalizeCategory(w.category)));
    },

    toolsByRarity(rarity) {
        const excluded = ['augmetic', 'clothing', 'vehicle wargear', 'relic', 'ritual'];
        return (DataLoader.getAllEquipment() || []).filter(e =>
            this.isEligible(e) && !excluded.includes(e.category) && e.rarity === rarity);
    },

    hasPoweredTrait(a) {
        return (a.traits || []).some(t => /^Powered/.test(t));
    },

    // Returns the eligible base items for a form id
    getBaseItemsForForm(formId) {
        const MELEE_CORE = ['Low-Tech', 'Chain', 'Power', 'Force'];
        switch (formId) {
            case 'augmetic':
                return (DataLoader.getAllEquipment() || []).filter(e => this.isEligible(e) && e.category === 'augmetic');
            case 'common_tool_or_equipment':   return this.toolsByRarity('Common');
            case 'uncommon_tool_or_equipment': return this.toolsByRarity('Uncommon');
            case 'rare_tool_or_equipment':     return this.toolsByRarity('Rare');
            case 'mundane_melee_weapon': return this.meleeByCategory(c => c === 'Low-Tech');
            case 'chain_weapon':  return this.meleeByCategory(c => c === 'Chain');
            case 'power_weapon':  return this.meleeByCategory(c => c === 'Power');
            case 'force_weapon':  return this.meleeByCategory(c => c === 'Force');
            case 'exotic_melee_weapon': return this.meleeByCategory(c => !MELEE_CORE.includes(c));
            case 'projectile_weapon': return this.rangedByCategory(c => c === 'Solid Projectile');
            case 'las_weapon':    return this.rangedByCategory(c => c === 'Las');
            case 'flame_weapon':  return this.rangedByCategory(c => c === 'Flame');
            case 'plasma_weapon': return this.rangedByCategory(c => c === 'Plasma');
            case 'melta_weapon':  return this.rangedByCategory(c => c === 'Melta');
            case 'bolt_weapon':   return this.rangedByCategory(c => c === 'Bolt');
            case 'grenade_or_missile_weapon': {
                const cats = ['Grenade', 'Missile', 'Explosive'];
                return (DataLoader.getAllWeapons() || []).filter(w => {
                    if (!this.isEligible(w)) return false;
                    if (w.category && cats.includes(w.category)) return true;
                    const kws = (w.keywords || []).map(k => k.toUpperCase());
                    return kws.includes('GRENADE') || kws.includes('MISSILE');
                });
            }
            case 'mundane_armour_or_clothing': {
                const armor = (DataLoader.getAllArmor() || []).filter(a =>
                    this.isEligible(a) && !this.hasPoweredTrait(a) && !a.invulnerable);
                const clothing = (DataLoader.getAllEquipment() || []).filter(e =>
                    this.isEligible(e) && e.category === 'clothing');
                return armor.concat(clothing);
            }
            case 'powered_armour':
                return (DataLoader.getAllArmor() || []).filter(a => this.isEligible(a) && this.hasPoweredTrait(a));
            case 'power_field':
                return (DataLoader.getAllArmor() || []).filter(a => this.isEligible(a) && a.invulnerable === true);
            default:
                return [];
        }
    },
```

When editing (`editIndex !== null`), always include the current base item in the step-3 list even if it no longer passes the filter (e.g. its source was disabled since creation).

**Dice helpers:**

```js
    rollD6() { return Math.floor(Math.random() * 6) + 1; },
    // Form: first d6 = column, second d6 = row on the 6x6 table
    rollForm() {
        const col = this.rollD6(), row = this.rollD6();
        return { col, row, formId: DataLoader.getHolyRelics().formTable.rows[row - 1][col - 1] };
    },
    roll4d6() { return this.rollD6() + this.rollD6() + this.rollD6() + this.rollD6(); },
```

Enemy-keyword roll: sum 4d6, select the entry with `roll === sum`. Oddity roll: roll 1d6, add that oddity if not already selected. Every roll shows its result (e.g. "Rolled 3, 5 → Mundane Melee Weapon") near the button.

**Steps (0-indexed), each with a title, body renderer, and validation gate for Next:**

0. **Name** — text input, required non-empty (trimmed). Escape all user text on render.
1. **Relic Form** — the 19 forms as selectable option cards grouped under headings: Weapons (Mundane Melee, Chain, Power, Force, Exotic Melee, Projectile, Las, Flame, Plasma, Melta, Bolt, Grenade or Missile), Armour (Mundane Armour or Clothing, Powered Armour, Power Field), Other (Augmetic, Common/Uncommon/Rare Tool or Equipment). Each card shows the form name and the count of eligible base items (`getBaseItemsForForm(id).length`); disable cards with count 0. "Roll 2d6" button. Changing form clears `baseItemId`, `power`, `powerChoice`.
2. **Base Item** — search input + compact selectable rows (name, category, rarity, key stat: melee `(S)+N` dmg / ranged dmg+range / armor AR / equipment effect first ~80 chars). Required.
3. **Original Owner** — 6 option cards (name + verbatim description) + "Roll 1d6". Required.
4. **Anointment** — 6 option cards + "Roll 1d6". Required.
5. **Relic Power** — heading shows the powers table's `name` from the data. 6 option cards with full verbatim descriptions + "Roll 1d6". If the selected power has `choice`, show the dependent picker below (enemy keyword list with "Roll 4d6" / grouped attribute-or-skill dropdown / skill dropdown / condition dropdown). Required; `powerChoice` required when the power declares a choice. Changing power clears `powerChoice`. For the `grenade_or_missile_weapon` form, show the Sacred Shells note (`sacredShells` text from the data, styled as an info box).
6. **Oddities** — 6 checkbox cards (name + verbatim description), 0+ allowed, + "Roll 1d6" (adds the rolled oddity).
7. **Summary** — everything chosen: name, form, base item (with its stat line), owner, anointment, power (+ choice) with text, oddities with text. Footer button "Add Relic" (create) / "Save Changes" (edit) → calls `State.addRelicWargear(baseItemId, relic)` or `State.updateRelicWargear(editIndex, baseItemId, relic)`, then closes the modal and calls `this.onSaved && this.onSaved()`.

Footer: Cancel (closes, no changes) / Back (step > 0) / Next (validated) / final action button. Modal id `relic-wizard-modal`, class `modal`, built once on first `open()` and reused; clicking the backdrop or × closes it. All text rendered from data files or escaped user input.

- [ ] **Step 3: Add wizard CSS** to `creator/css/styles.css` (append; follow existing CSS-variable conventions from STYLE_GUIDE.md and reuse `.modal`/`.modal-content` infrastructure). New classes: `.relic-wizard-progress` (step indicator), `.relic-option-card` (+ `.selected`, `:hover`, `[disabled]`), `.relic-option-group` heading, `.relic-roll-row` (button + result text), `.relic-summary` blocks, `.relic-info-note` (Sacred Shells box), `.badge-relic` (small amber/gold badge, same shape as `.badge-starting`).

- [ ] **Step 4: Register the script.** In `creator/index.html`, add `<script src="js/relic-wizard.js?v=N"></script>` grouped with the other `js/` scripts (after `state.js`, before the tab scripts), and bump the `?v` on ALL script/link tags together by 1 (use the current value found in the file; all tags end at the same new value N).

- [ ] **Step 5: Browser-verify standalone** (entry card comes in Task 3). Serve port 8137, hard-reload `http://localhost:8137/creator/`, console:
  - `RelicWizard.open()` — walk all 8 steps: name "Test Relic", form Bolt Weapon, pick Bolt Pistol, owner/anointment any, power Piercing Hatred → enemy keyword picker appears → pick/roll one, oddity Oathbound, summary shows everything, Add Relic.
  - `State.getCharacter().wargear` shows `{ id: 'bolt_pistol', …, relic: {…} }` (id per whatever bolt pistol's id is).
  - `RelicWizard.getBaseItemsForForm('power_field').every(i => i.invulnerable)` → true; `getBaseItemsForForm('bolt_weapon').some(w => w.rarity === 'Unique')` → false; `getBaseItemsForForm('grenade_or_missile_weapon').length` > 0.
  - Roll buttons produce in-range results (click Form roll several times).
  - No console errors.

- [ ] **Step 6: Commit** (subject: `Add the Holy Relic wizard for the Character Creator`; body describes the module, State methods, styles, and the index.html `?v` bump).

---

### Task 3: Wargear tab integration

**Files:**
- Modify: `creator/tabs/wargear-tab.js`
- Modify: `creator/index.html` (bump ALL `?v` together by 1)

**Interfaces:**
- Consumes: `RelicWizard.open(wargearIndex?)`, `RelicWizard.onSaved`, `State` relic entry shape, `DataLoader.getHolyRelics()`.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Entry card.** In `renderWargearBrowser()`, immediately before the `<div class="wargear-browser">` block, when `State.isSourceEnabled('redacted2')`, render:

```html
<div class="holy-relic-cta">
    <div class="holy-relic-cta-text">
        <h4>Holy Relic</h4>
        <p>Sanctify a piece of wargear using the Relic creation rules from Redacted Records II (pp. 12–19): choose a Form, a base item, Origins, a Power, and Oddities.</p>
    </div>
    <button class="btn-primary" id="btn-build-relic">Build a Holy Relic</button>
</div>
```

Bind `#btn-build-relic` → `RelicWizard.open()`. In `init()`, set `RelicWizard.onSaved = () => this.render();` so both create and edit refresh the tab. Add matching `.holy-relic-cta` CSS (flex row, accent border) to `creator/css/styles.css` if Task 2's styles don't already cover it.

- [ ] **Step 2: Relic-aware owned display.** In `renderCurrentWargear()` the grouping already works off the base id — don't change it. Update `renderOwnedWeapon(w)` and `renderOwnedItem(item, type)`: the entry objects already spread the base item plus `wargearIndex`, `isStarting`, `upgrades`; extend the loop to also carry `relic: item.relic`. When `relic` is present:
  - Name line: `${relic.name} <span class="badge-relic">Holy Relic</span>` (escape `relic.name`).
  - Type line: `Holy Relic (${formName}) • ${baseItem.name}`.
  - Detail line (small, muted): `Origin: ${ownerName}, ${anointmentName} • Power: ${powerName}${powerChoice ? ' (' + powerChoice + ')' : ''}${oddityNames.length ? ' • Oddities: ' + oddityNames.join(', ') : ''}` — resolve all names via `DataLoader.getHolyRelics()` (helper `getRelicDisplayParts(relic)` returning `{formName, ownerName, anointmentName, powerName, oddityNames}`; fall back to the raw id string if a lookup misses).
  - Actions: add `<button class="btn-small btn-edit-relic" data-index="…">Edit</button>` before Remove; weapons keep the Upgrades button.
  - Bind `.btn-edit-relic` → `RelicWizard.open(index)`.
  - The Remove confirm already names the base item; make it use the relic name when present (`item.relic?.name`).

- [ ] **Step 3: Bump `?v`** on all `creator/index.html` script/link tags together by 1.

- [ ] **Step 4: Browser-verify.** Hard-reload; on the Wargear tab: the Holy Relic card shows; build a relic end-to-end from the button; it appears in the owned list under the right group with badge + details; Edit reopens prefilled and saving a changed power updates the detail line; a relic Bolt Pistol still offers Upgrades; Remove asks using the relic name and removes it; disabling the Redacted Records II source in settings hides the card (and search/category filters still work). No console errors.

- [ ] **Step 5: Commit** (subject: `Add Holy Relic building to the Wargear tab`).

---

### Task 4: Character sheet + text export display

**Files:**
- Modify: `creator/tabs/character-sheet-tab.js`
- Modify: `creator/js/character-io.js` (wargear list in the text sheet, ~line 231)
- Modify: `creator/index.html` (bump ALL `?v` together by 1)

**Interfaces:**
- Consumes: relic entry shape, `DataLoader.getHolyRelics()`. Reuse/duplicate the small name-resolution helper pattern from Task 3 (`getRelicDisplayParts`-style lookups; keep it local to each file, matching the codebase's no-shared-helpers pattern).

- [ ] **Step 1: Weapons table naming.** In the sheet's weapon collection loop (`character-sheet-tab.js` ~line 661: `const weapon = DataLoader.getWeapon(item.id)`), when `item.relic` is present carry it through and render the weapon's display name as `${relic.name} (${weapon.name})` in the weapons table rows. Damage/traits/upgrade math stays on the base weapon — do not touch `calculateWeaponDamageDetailed`.

- [ ] **Step 2: Armor and equipment naming.** Wherever the sheet prints owned armor/equipment names from `character.wargear` (armor loop ~line 856, equipment loops ~lines 934/1010, plain-text lines ~line 1722), relic entries display `${relic.name} (${base.name})`.

- [ ] **Step 3: Holy Relics detail block.** After the section where the sheet renders wargear (same placement pattern as existing detail sections), add a "Holy Relics" section rendered only when the character has relic entries. For each relic:
  - Header: relic name, then `— Relic ${formName} (${base.name})`.
  - Line: `Original Owner: ${ownerName} • Anointment: ${anointmentName}`.
  - Power: name (+ `powerChoice` in parentheses when set) followed by the verbatim power description.
  - Oddities: each name + verbatim description (omit the block if none).
  - For `grenade_or_missile_weapon` relics, append the Sacred Shells note text.
  - Run `Glossary.enhanceElement` over the block if the sheet does so for similar text sections.

- [ ] **Step 4: Text exports.** In `character-sheet-tab.js`'s plain-text builder (~line 1722) and `character-io.js`'s sheet export (~line 231), relic entries print:

```
- {relic name} (Holy Relic — {base name})
    Power: {power name}{ (choice)}; Oddities: {names or "none"}
```

- [ ] **Step 5: Bump `?v`** on all `creator/index.html` script/link tags together by 1.

- [ ] **Step 6: Browser-verify.** Hard-reload; with one weapon relic, one armour relic, and one tool relic on the character: Character Sheet shows relic names in the weapons table and lists, the Holy Relics block shows full verbatim text, equip toggle + damage numbers unchanged from the mundane base, text export contains the relic lines. Save the character to a file, reload the app, load the file: relics intact. No console errors.

- [ ] **Step 7: Commit** (subject: `Show Holy Relics on the character sheet and exports`).

---

## Final verification (controller)

After all tasks: full Playwright pass per the spec's Verification section (three relic archetypes end-to-end, Unique/Vehicle exclusions spot-checked, upgrades on a relic weapon, save/load round-trip, edit + remove, source-gating). Then the final whole-branch review, then push after the user confirms.
