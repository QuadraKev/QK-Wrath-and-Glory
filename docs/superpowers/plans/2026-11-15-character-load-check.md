# Type Check on a Loaded Character Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `State.loadCharacter` gives each known field of a loaded character the type that the code expects, and each render site that prints a raw id or raw free text escapes it.

**Architecture:** A new global object `CharacterCheck` (`creator/js/character-check.js`) repairs a merged character in place and returns the repaired paths. `State.loadCharacter` calls it directly after the merge, before the existing migrations and the custom wargear repair. A top level that is not a plain object throws, and the import path shows the existing error message. Twenty render sites (S1-S20) in eight files get an escape.

**Tech Stack:** Vanilla JS, global-object modules, no build step. Tests are plain Node scripts that load the browser files into a `vm` context.

**Spec:** `docs/superpowers/specs/2026-11-15-character-load-check-design.md`. Read it before each task. The field rules are in spec §4.1, §5 and §6. The sink list is in spec §8.4 and §8.5.

## Global Constraints

- Follow `CLAUDE.md` and `STYLE_GUIDE.md` of the repo: vanilla JS, one `const` global object per file, no ES modules, no classes, no IIFEs, no build step.
- Write all prose (code comments, commit messages, docs) in ASD-STE100 Simplified Technical English: short sentences, active voice, no phrasal verbs.
- Author each commit `--author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>"`. No attribution line and no co-author line.
- All 16 existing test scripts stay green. Run: `for f in scripts/test-*.js; do node "$f" > "/tmp/loadcheck-$(basename "$f").log" 2>&1 || echo "FAIL $f"; done; echo done`. Read only the `FAIL` lines and the last lines of a failing log.
- No browser window on the owner's desktop. Each browser run is `headless: true`. A headed run is only `env -u WAYLAND_DISPLAY xvfb-run -a node <script>`.
- R1 has the highest priority: the check never changes a value that some app version can have written. Do not add a constraint that spec §5 or §6 does not give. Do not add a range limit or an id pattern.
- No change to a stored shape, no new migration, no cleanup of adjacent code (R8). Do not use, change or delete `CharacterIO.validateCharacterData`.
- No new UI. A repair writes one `console.warn` (R7).
- Cache busting: Task 1 bumps `?v=128` to `?v=129` on ALL script and link tags of `creator/index.html` together (35 tags, plus the new one = 36). The later tasks do not bump again: the branch ships as one deploy. The data `?v=47` in `creator/js/web-api.js` stays.
- A number site uses `escapeHtml(String(v))`, because `escapeHtml(0)` returns `''`.

## Review Focus

1. **A real save that holds an unusual but legal value.** A follower `count` of `2.5` or `null`, a talent `choice` of the number `1`, a negative or `null` `rank`, an unknown skill key `choice1: null`, a background entry with no `bonusType`, a language with spaces and quotes. Expected: no change, no warning. Task 1 pins these in the no-op corpus.
2. **A wrong entry inside the index-referenced wargear list.** Expected: the entry is replaced in place, the list length and the order stay, and a talent choice that points at index 1 still points at the same item. Task 1 pins this.
3. **A hostile file that also triggers the old migration** (`ascensions: null` with a non-array `ascensionPackages`). Expected: no throw. Task 1 pins this.
4. **A file whose top level is `null`.** Expected: the import shows "Error loading character: The file does not contain a character." and the current character stays. Today it shows a success message. Task 1 pins this.
5. **A quote in free text that goes into a double-quoted attribute** (`customArchetype.name`, a language, a keyword choice). Expected: no attribute breakout. Task 3 pins this with a `"` in the hostile value.

---

### Task 1: The `CharacterCheck` module and the load gate

Suggested dispatch: `implementer` with `model: opus` (a design choice per field inside one new module).

**Files:**
- Create: `creator/js/character-check.js`
- Modify: `creator/js/state.js:139-180` (`loadCharacter`)
- Modify: `creator/js/character-io.js:55` (one condition)
- Modify: `creator/js/app.js:485-487` (`checkAutoSave`)
- Modify: `creator/index.html:523-557` (one new tag, 36 tags to `?v=129`)
- Test: `scripts/test-load-check.js` (new)
- Modify (existing tests that load `state.js` and call `loadCharacter`): `scripts/test-notes.js:37`, `scripts/test-custom-wargear.js:426`, `:486`, `:489`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `CharacterCheck.isPlainObject(value: any) -> boolean`: `value !== null && typeof value === 'object' && !Array.isArray(value)`.
  - `CharacterCheck.repair(character: object, defaults: object) -> string[]`: changes `character` in place by the rules of spec §4.1, §5 and §6. `defaults` is a fresh `State.createNewCharacter()`. Returns the repaired paths in visit order: the rows of spec §5 in table order, then the lists of spec §6.1 in table order; the keys of `attributes` and `skills` in `createNewCharacter()` order. Path format: keys joined with `.`, an array index as `[i]`. Examples: `tier`, `attributes.strength`, `ascensions[0]`, `ascensions[0].type`, `wargear[2].relic`, `archetypeKeywordChoices.[ORDO]`, `talents[1].choice`.
  - `CharacterCheck.DISCIPLINE_CHOICE_TALENTS = ['warped_mind', 'tormented_manifestation_aoa']`.
  - R10: inside `attributes` and `skills`, an unknown key stays, and its value must be a finite number or `null`; another value becomes `null` (path `skills.choice1`).
  - Spec §4.1 rule 5 (C8): inside a list entry, a `relic` or an `improvised` overlay, an absent key that the spec row does not mark "optional" gets the repair value of its row; where the repair is "drop the entry", the entry is dropped.
  - `State.loadCharacter(data)` throws `new Error('The file does not contain a character.')` when `!CharacterCheck.isPlainObject(data)`, and does not change `State.character`.
  - Warning text: `'Character data was repaired on load: ' + paths.join(', ')`, one call per load, only when `paths.length > 0`.

- [ ] **Step 1: Write the test harness and the no-op corpus in `scripts/test-load-check.js`**

Reuse the harness pattern of `scripts/test-custom-wargear.js:1-50` (`check`, `canon`, `load`, `get`, `creatorSandbox`). The sandbox loads, in this order: `creator/js/data-loader.js` (cache: `glossary.json`, `weapons.json`, `armor.json`, `equipment.json`), `creator/js/custom-wargear.js`, `creator/js/character-check.js`, `creator/js/state.js`. Its `console` records each `warn` call in `warns` and passes other calls to the real console. It also gets `localStorage: {}`, `setTimeout`, `clearTimeout`.

```js
const EVIL = '<img src=x onerror=alert(1)>';
const INF = { __inf: true };            // sentinel: serialized as the JSON text 1e999
const rt = v => JSON.parse(JSON.stringify(v));

// Serializes value (INF becomes 1e999), parses the text, and loads it.
// Returns { character, warns, threw } where character is a JSON copy of State.character.
function loadJson(value) { /* JSON.stringify with a replacer that writes '"__INF__"' for INF,
   replace '"__INF__"' with '1e999', JSON.parse, State.loadCharacter in try/catch */ }

// base(): the character below. setPath / getPath take a path array such as ['ascensions', 0, 'targetTier'].
function setPath(obj, path, value) {}
function getPath(obj, path) {}
```

The corpus (exact fixture; each value is a shape that some app version writes, spec §5-§6):

```js
function base() {
    return {
        name: 'Kaelen', tier: 2, rank: 2, additionalXp: 40, setting: 'Gilead', notes: 'line 1\nline 2',
        species: { id: 'human', xpCost: 0, subOptions: [{ type: 'homeworld', optionId: 'death_world_aoa' }] },
        archetype: { id: 'imperial_guardsman', xpCost: 0 },
        customArchetype: { name: '', abilityArchetypeId: null, keywords: [], wargear: [] },
        ascensions: [],
        attributes: { strength: 3, toughness: 3, agility: 3, initiative: 3, willpower: 2, intellect: 1, fellowship: 1 },
        skills: { athletics: 0, awareness: 1, ballisticSkill: 2, cunning: 0, deception: 0, insight: 0, intimidation: 0, investigation: 0, leadership: 0, medicae: 0, persuasion: 0, pilot: 0, psychicMastery: 0, scholar: 0, stealth: 0, survival: 0, tech: 0, weaponSkill: 3 },
        talents: [], wargear: [], psychicPowers: [], freePowers: [], unlockedDisciplines: [],
        background: { origin: null, accomplishment: null, goal: null, bonusUsed: null },
        memorableInjuries: [], traumaticInjuries: [], mutations: [], followers: [],
        languages: ['low_gothic'], freeLanguages: [], corruption: 0,
        currentWounds: null, currentShock: null, currentWealth: null, currentWrath: null, currentFaith: null
    };
}
const CORPUS = {
    'new character': () => ({ ...base(), name: '', tier: 1, rank: 1, additionalXp: 0, setting: '', notes: '',
        species: { id: null, xpCost: 0, subOptions: [] }, archetype: { id: null, xpCost: 0 },
        attributes: { strength: 1, toughness: 1, agility: 1, initiative: 1, willpower: 1, intellect: 1, fellowship: 1 },
        skills: Object.fromEntries(Object.keys(base().skills).map(k => [k, 0])) }),
    'full character': () => ({ ...base(),
        rank: -3, additionalXp: -10, corruption: 7,
        // Real shape (spec §5 row 26a): setArchetype writes NaN (saved as null) for the data keys choice1/choice2; resetStats can write a number.
        skills: { ...base().skills, choice1: null, choice2: 4 },
        species: { id: 'kroot', xpCost: 10, subOptions: [{ type: 'mutation', optionId: 'a' }, { type: 'mutation', optionId: 'b' }] },
        archetype: { id: 'custom', xpCost: 0 },
        customArchetype: { name: 'Gun for hire', abilityArchetypeId: 'sanctioned_psyker', keywords: ['IMPERIUM', 'SCUM'], wargear: ['knife'] },
        archetypeKeywordChoices: { '[ORDO]': 'HERETICUS', '[FORGE WORLD]': '' },
        ascensions: [
            { targetTier: 2, type: 'package', packageId: 'demanding_patron', archetypeId: null, choices: { patronBenefit: 'wealth', '[ANY]': 'ADEPTUS MINISTORUM', '[ANY]2': '' } },
            { targetTier: 3, type: 'archetype', packageId: null, archetypeId: 'tactical_space_marine' },
            { targetTier: 4, type: 'package', packageId: null, archetypeId: null }
        ],
        talents: ['angel_of_death', { id: 'trademark_weapon', choice: '0' }, { id: 'armourmonger_aoa', choice: 1 },
            { id: 'acute_sense', choice: 'Sight' }, { id: 'acute_sense', choice: 'Hearing' }, { id: 'warped_mind', choice: 'Biomancy' },
            { id: 'trademark_weapon', choice: null }, { id: 'dauntless', ascensionGranted: true }],
        wargear: [
            { id: 'knife', isStarting: true },
            { id: 'lasgun', isStarting: false, equipped: true, upgrades: ['bayonet_lug'] },
            { id: 'chainsword', isStarting: false, equipped: false, upgrades: [] },
            { id: 'flak_armour', isStarting: false, relic: { name: 'Saint Ophelia\'s Mail', form: 'armour', originalOwner: 'a', anointment: 'b', power: 'c', oddities: ['d', 'e'], powerChoice: 'ORK' } },
            { id: 'laspistol', isStarting: false, relic: { name: 'Vow', form: 'weapon', originalOwner: 'a', anointment: 'b', power: 'c', oddities: [] } },
            { id: 'improvised_melee_weapon', isStarting: false, improvised: { name: 'Table leg', details: '', halfTime: 3, damageRank: true, removeUnwieldy: false, doubleRange: false, traits: ['Brutal'] } },
            { id: 'custom_ab12cd34', isStarting: false, equipped: true, upgrades: [], custom: { kind: 'weapon', name: 'Xenotech Blade', type: 'melee', description: '', damage: { base: 4, attribute: 'strength', bonus: 0 }, ed: 4, ap: -1, reach: 2, traits: ['Agonising', 'Rad (2)'], keywords: [], source: 'custom', id: 'custom_ab12cd34' } },
            { id: 'custom_0011aabb', isStarting: false, custom: { kind: 'other', name: 'Lucky coin', description: 'Shiny', category: 'Other', effect: '', keywords: [], source: 'custom', id: 'custom_0011aabb' } }
        ],
        psychicPowers: ['smite', 'psyniscience'], freePowers: ['smite'], unlockedDisciplines: ['Biomancy'],
        background: { origin: { id: 'o1', bonusType: 'wealth' }, accomplishment: { id: 'a1', bonusType: null }, goal: { id: 'g1' }, bonusUsed: 'origin' },
        memorableInjuries: [{ id: 'battle_scar', escalated: false }, { id: 'battle_scar', escalated: true }],
        traumaticInjuries: [{ id: 'hand', side: 'Left' }, { id: 'hand', side: null, reconstructed: true }, { id: 'head', side: 'Right', reconstructed: false }],
        mutations: [{ id: 'extra_appendages', subChoice: 'head' }, { id: 'extra_appendages', subChoice: null }],
        followers: [
            { id: 'flw_m1x2y3abcde', threatId: 'cultist', name: '', kind: 'individual', count: 1, livingCount: 1, mobCount: null, mobLivingCount: null, useAlternativeStats: false, currentWounds: null, currentShock: null, notes: '' },
            { id: 'flw_m1x2y3fghij', threatId: 'guardsman', name: 'Squad', kind: 'mob', count: 2.5, livingCount: 0, mobCount: 3, mobLivingCount: 2, useAlternativeStats: true, currentWounds: 2, currentShock: 1, notes: 'n' },
            { id: 'flw_m1x2y3klmno', threatId: 'servitor', name: 'Old', kind: 'mob', count: null, livingCount: null, useAlternativeStats: false, currentWounds: null, currentShock: null, notes: '' }
        ],
        languages: ['low_gothic', 'High Gothic', 'Ork "Pidgin" <trade>'], freeLanguages: ['High Gothic'],
        currentWounds: 3, currentShock: 2, currentWealth: 0, currentWrath: 5, currentFaith: 1 }),
    'pre-web shapes': () => ({ ...base(), customKeywords: ['VETERAN'], talents: [{ id: 'trademark_weapon', choice: 2 }] }),
    // A typed number of 309 digits gives parseInt(...) = Infinity, which JSON saves as null (spec §5 rows 5-7).
    'null numbers': () => ({ ...base(), rank: null, additionalXp: null, corruption: null })
};
// The web app wrote ascensionPackages from 2026-02-13 to 2026-02-16 (spec §7.1, finding F1).
const LEGACY = () => { const c = base(); delete c.ascensions; c.ascensionPackages = ['back_from_the_brink']; return c; };
```

The design session ran this exact corpus through today's `State.loadCharacter`: each character comes back deep-equal with no warning. The test must stay so after the change.

- [ ] **Step 2: Write the no-op checks**

```js
for (const [name, make] of Object.entries(CORPUS)) {
    const r = loadJson(make());
    check(`no-op: ${name} loads deep-equal`, canon(r.character), canon(rt(make())));
    check(`no-op: ${name} writes no warning`, r.warns, []);
}
{
    const r = loadJson(LEGACY());
    const expected = LEGACY(); delete expected.ascensionPackages; expected.ascensions = [];
    check('no-op: legacy ascensionPackages gets only the documented migration', canon(r.character), canon(rt(expected)));
    check('no-op: legacy ascensionPackages writes no warning', r.warns, []);
}
```

- [ ] **Step 3: Write the hostile checks**

Bad-value sets (spec §4.1 rule 8; `null` is not in a set where `null` is legal):

```js
const INT_BAD = [EVIL, '3', {}, [], null, true, INF, 2.5];
const INT_NULL_BAD = [EVIL, '3', {}, [], true, INF, 2.5];      // integer or null
const NUM_NULL_BAD = [EVIL, '3', {}, [], true, INF];          // finite number or null
const NUM_BAD = [EVIL, '3', {}, [], null, true, INF];         // finite number
const STR_BAD = [{}, [], null, 5, true];
const STR_NULL_BAD = [{}, [], 5, true];
const OBJ_BAD = [EVIL, [], null, 5];
const ARR_BAD = [EVIL, {}, null, 5];
const BOOL_BAD = [EVIL, 1, null, {}];
```

One table, run on `CORPUS['full character']()`. For each row and each bad value: `setPath` the value, `loadJson`, then

```js
check(`hostile ${label}: no throw`, r.threw, false);
check(`hostile ${label}: repaired`, canon(getPath(r.character, readPath)), canon(expected));
check(`hostile ${label}: one warning`, r.warns.length, 1);
```

where `label` is the path plus `JSON.stringify` of the bad value, and `readPath` defaults to the row path. Rows (path, set, expected; spec row number):

```js
const HOSTILE = [
    [['name'], STR_BAD, ''], [['setting'], STR_BAD, ''], [['notes'], STR_BAD, ''],             // 1-3
    [['tier'], INT_BAD, 1], [['rank'], INT_NULL_BAD, 1], [['additionalXp'], INT_NULL_BAD, 0], [['corruption'], INT_NULL_BAD, 0], // 4-7
    ...['currentWounds', 'currentShock', 'currentWealth', 'currentWrath', 'currentFaith'].map(k => [[k], NUM_NULL_BAD, null]), // 8-12
    [['species'], OBJ_BAD, { id: null, xpCost: 0, subOptions: [] }], [['species', 'id'], STR_NULL_BAD, null], [['species', 'xpCost'], NUM_BAD, 0],
    [['archetype'], OBJ_BAD, { id: null, xpCost: 0 }], [['archetype', 'id'], STR_NULL_BAD, null], [['archetype', 'xpCost'], NUM_BAD, 0],
    [['customArchetype'], OBJ_BAD, { name: '', abilityArchetypeId: null, keywords: [], wargear: [] }],
    [['customArchetype', 'name'], STR_BAD, ''], [['customArchetype', 'abilityArchetypeId'], STR_NULL_BAD, null],
    [['archetypeKeywordChoices'], OBJ_BAD, {}], [['archetypeKeywordChoices', '[ORDO]'], STR_BAD, ''],
    [['attributes'], OBJ_BAD, { strength: 1, toughness: 1, agility: 1, initiative: 1, willpower: 1, intellect: 1, fellowship: 1 }],
    ...['strength', 'toughness', 'agility', 'initiative', 'willpower', 'intellect', 'fellowship'].map(k => [['attributes', k], INT_BAD, 1]),
    ...Object.keys(base().skills).map(k => [['skills', k], INT_BAD, 0]),
    // R10: an unknown key in attributes or skills keeps its key; a value that is not a finite number or null becomes null
    [['skills', 'choice1'], NUM_NULL_BAD, null], [['attributes', 'luck'], NUM_NULL_BAD, null],
    [['background'], OBJ_BAD, { origin: null, accomplishment: null, goal: null, bonusUsed: null }],
    [['background', 'origin'], [EVIL, [], 5, true], null], [['background', 'origin', 'id'], STR_BAD, null, ['background', 'origin']],
    [['background', 'accomplishment', 'bonusType'], STR_NULL_BAD, null], [['background', 'bonusUsed'], STR_NULL_BAD, null],
    // lists that are not arrays (spec §6.1)
    ...['species.subOptions', 'customArchetype.keywords', 'customArchetype.wargear', 'ascensions', 'talents', 'wargear',
        'psychicPowers', 'freePowers', 'unlockedDisciplines', 'memorableInjuries', 'traumaticInjuries', 'mutations',
        'followers', 'freeLanguages', 'customKeywords'].map(p => [p.split('.'), ARR_BAD, []]),
    [['languages'], ARR_BAD, ['low_gothic']],
    // ascension entry (spec §6.2); a dropped entry is read through the list length
    [['ascensions', 0, 'targetTier'], INT_BAD, 2, ['ascensions', 'length']],
    [['ascensions', 0, 'type'], STR_BAD, ''], [['ascensions', 0, 'packageId'], STR_NULL_BAD, null],
    [['ascensions', 0, 'choices'], [EVIL, [], 5, null], undefined], [['ascensions', 0, 'choices', '[ANY]'], STR_BAD, ''],
    // talent entry (spec §6.3)
    [['talents', 1, 'choice'], [{}, [], true, INF], null], [['talents', 5, 'choice'], [5, {}, true], null],
    [['talents', 7, 'ascensionGranted'], BOOL_BAD, false], [['talents', 1, 'id'], STR_BAD, 7, ['talents', 'length']],
    // wargear entry (spec §6.4): never dropped
    [['wargear', 1, 'isStarting'], BOOL_BAD, false], [['wargear', 1, 'equipped'], BOOL_BAD, false],
    [['wargear', 1, 'upgrades'], ARR_BAD, []], [['wargear', 1, 'id'], [5, {}, null], ''],
    [['wargear', 3, 'relic'], [EVIL, [], 5, null], undefined], [['wargear', 3, 'relic', 'name'], STR_BAD, ''],
    [['wargear', 3, 'relic', 'form'], STR_NULL_BAD, null], [['wargear', 3, 'relic', 'oddities'], ARR_BAD, []],
    [['wargear', 3, 'relic', 'powerChoice'], [5, {}, null], undefined],
    [['wargear', 5, 'improvised'], [EVIL, [], 5, null], undefined], [['wargear', 5, 'improvised', 'name'], STR_BAD, ''],
    [['wargear', 5, 'improvised', 'halfTime'], INT_BAD, 0], [['wargear', 5, 'improvised', 'damageRank'], BOOL_BAD, false],
    [['wargear', 5, 'improvised', 'traits'], ARR_BAD, []],
    // injuries and mutations
    [['memorableInjuries', 0, 'escalated'], BOOL_BAD, false], [['traumaticInjuries', 0, 'side'], STR_NULL_BAD, null],
    [['traumaticInjuries', 1, 'reconstructed'], BOOL_BAD, false], [['mutations', 0, 'subChoice'], STR_NULL_BAD, null],
    [['memorableInjuries', 0, 'id'], STR_BAD, 1, ['memorableInjuries', 'length']],
    // follower entry (spec §6.5)
    [['followers', 0, 'id'], STR_BAD, 2, ['followers', 'length']], [['followers', 0, 'threatId'], STR_BAD, ''],
    [['followers', 0, 'kind'], STR_BAD, 'individual'], [['followers', 1, 'count'], NUM_NULL_BAD, 1],
    [['followers', 1, 'livingCount'], NUM_NULL_BAD, 1], [['followers', 1, 'mobCount'], NUM_NULL_BAD, null],
    [['followers', 1, 'useAlternativeStats'], BOOL_BAD, false], [['followers', 1, 'currentWounds'], NUM_NULL_BAD, null]
];
```

A 4th row element is `readPath`. `getPath(x, [..., 'length'])` reads the array length. `undefined` means "the key is absent": check `!(key in parent)`. For the `customKeywords` row, the base is `CORPUS['pre-web shapes']()`.

Then these named checks:

```js
// bad entries in lists that are not index-referenced are dropped; good entries stay in order
check('hostile: bad entries of a string list are dropped', loadJson({ ...base(), psychicPowers: ['smite', 5, null, {}, 'psyniscience'] }).character.psychicPowers, ['smite', 'psyniscience']);
check('hostile: a talent that is not a string or an object with a string id is dropped',
    loadJson({ ...base(), talents: ['a', 5, null, [], { id: 5 }, { id: 'b', choice: 'x' }] }).character.talents, ['a', { id: 'b', choice: 'x' }]);
check('hostile: a sub-option with a number optionId is dropped',
    loadJson({ ...base(), species: { id: 'human', xpCost: 0, subOptions: [{ type: 'homeworld', optionId: 5 }, null] } }).character.species.subOptions, []);

// wargear: replace in place, keep the length and the order (index-referenced)
{
    const c = CORPUS['full character'](); c.wargear[0] = 'lasgun'; c.wargear[2] = null;
    const w = loadJson(c).character.wargear;
    check('hostile: wargear keeps its length', w.length, 8);
    check('hostile: a string wargear entry becomes an entry with that id', w[0], { id: 'lasgun', isStarting: false });
    check('hostile: a null wargear entry becomes a placeholder', w[2], { id: '', isStarting: false });
    check('hostile: wargear[1] is still the lasgun with its upgrade', [w[1].id, w[1].upgrades], ['lasgun', ['bayonet_lug']]);
}
{
    const c = CORPUS['full character'](); c.wargear[6].id = 5;
    const w = loadJson(c).character.wargear[6];
    check('hostile: a custom entry with a number id gets a new custom_ id', [/^custom_[a-z0-9]+$/.test(w.id), w.custom.id === w.id], [true, true]);
}

// the warning names the paths
{
    const c = base(); c.tier = EVIL; c.attributes.strength = '3'; delete c.attributes.agility;
    const r = loadJson(c);
    check('warning: one call names each repaired path',
        r.warns, ['Character data was repaired on load: tier, attributes.strength, attributes.agility']);
    check('warning: a missing attribute key gets its default', r.character.attributes.agility, 1);
}

// unknown keys stay (R6)
{
    const c = base(); c.zzz = { a: EVIL }; c.attributes.luck = 7; c.wargear = [{ id: 'knife', isStarting: true, zzz: [1] }];
    const r = loadJson(c);
    check('unknown keys stay at the top level and inside entries', [r.character.zzz, r.character.attributes.luck, r.character.wargear[0].zzz], [{ a: EVIL }, 7, [1]]);
    check('unknown keys write no warning', r.warns, []);
}

// spec §4.1 rule 5 (C8): an absent key that is not optional, one check per entry kind
{
    const full = CORPUS['full character'];
    const without = (path, key) => { const c = full(); delete getPath(c, path)[key]; return loadJson(c); };
    check('absent: a sub-option with no optionId is dropped', without(['species', 'subOptions', 0], 'optionId').character.species.subOptions.length, 1);
    check('absent: an ascension with no targetTier is dropped', without(['ascensions', 0], 'targetTier').character.ascensions.length, 2);
    check('absent: an ascension with no type gets \'\'', without(['ascensions', 1], 'type').character.ascensions[1].type, '');
    check('absent: a talent object with no id is dropped', without(['talents', 1], 'id').character.talents.length, 7);
    check('absent: a wargear entry with no id gets \'\'', without(['wargear', 1], 'id').character.wargear[1].id, '');
    check('absent: a relic with no oddities gets []', without(['wargear', 3, 'relic'], 'oddities').character.wargear[3].relic.oddities, []);
    check('absent: an improvised overlay with no halfTime gets 0', without(['wargear', 5, 'improvised'], 'halfTime').character.wargear[5].improvised.halfTime, 0);
    check('absent: a memorable injury with no escalated gets false', without(['memorableInjuries', 0], 'escalated').character.memorableInjuries[0].escalated, false);
    check('absent: a traumatic injury with no side gets null', without(['traumaticInjuries', 0], 'side').character.traumaticInjuries[0].side, null);
    check('absent: a mutation with no subChoice gets null', without(['mutations', 0], 'subChoice').character.mutations[0].subChoice, null);
    check('absent: a follower with no kind gets individual', without(['followers', 0], 'kind').character.followers[0].kind, 'individual');
    check('absent: a background entry with no id becomes null', without(['background', 'origin'], 'id').character.background.origin, null);
    const r = without(['wargear', 3, 'relic'], 'oddities');
    check('absent: the path goes into the one warning', r.warns, ['Character data was repaired on load: wargear[3].relic.oddities']);
}

// order: the check runs before the old migration (spec §7.1)
{
    const r = loadJson({ ...base(), ascensions: null, ascensionPackages: 'x' });
    check('order: a hostile ascensionPackages does not throw', r.threw, false);
    check('order: ascensions is [] and ascensionPackages is gone', [r.character.ascensions, 'ascensionPackages' in r.character], [[], false]);
}

// save no longer throws on a hostile name
check('a hostile name is a string after load, so name.trim() works', typeof loadJson({ ...base(), name: {} }).character.name, 'string');
```

- [ ] **Step 4: Write the gate checks**

```js
for (const top of [null, [], [1, 2], 'x', 5, true]) {
    const before = State.character;            // read after a good load of base()
    let message = null;
    try { State.loadCharacter(top); } catch (e) { message = e.message; }
    check(`gate: ${JSON.stringify(top)} throws`, message, 'The file does not contain a character.');
    check(`gate: ${JSON.stringify(top)} keeps the current character`, State.character === before, true);
}
```

Import path: load `creator/js/character-io.js` into the same context. Give the context `window.api = { showOpenDialog: async () => ({ canceled: false, filePaths: ['a.character'] }), importCharacter: async () => ({ success: true, character: null }) }`.

```js
check('import: a null file returns the error', await CharacterIO.load(), { success: false, error: 'The file does not contain a character.' });
```

Autosave path: load `creator/js/app.js` into a context with `document: { addEventListener() {} }`, `SettingTab: { refresh() {} }`, `SettingsTab: { refresh() {}, sourceButtons: [] }`, the real `State`, and `State.getAutoSave = () => ({ character: 'x' })`. Replace `App.switchTab` and `App.switchSection` with no-op functions.

```js
let threw = false; try { App.checkAutoSave(); } catch (e) { threw = true; }
check('autosave: a bad character does not throw', threw, false);
check('autosave: the warning names the reason', warns.includes('The auto-save was not loaded: it does not contain a character.'), true);
```

End the file with the summary lines of `scripts/test-custom-wargear.js` (`All checks passed` and `process.exit(failures ? 1 : 0)`). Wrap the file body in an `async` main function for the `await`.

- [ ] **Step 5: Run the test to see it fail**

Run: `node scripts/test-load-check.js 2>&1 | tail -3`
Expected: an error that `creator/js/character-check.js` does not exist, or FAIL lines.

- [ ] **Step 6: Implement `CharacterCheck` in `creator/js/character-check.js`**

One `const CharacterCheck = { … }` object with a header comment. `repair(character, defaults) -> string[]` applies spec §4.1, §5 and §6, row by row. It never reads data files. It does not touch `entry.custom` of a wargear entry (the existing repair owns it). It keeps the order of every list.

- [ ] **Step 7: Wire the check into `State.loadCharacter` (`creator/js/state.js:139-180`)**

Add step 1 (the gate) and step 3 (the call and the one warning) of spec §7.1. Do not change the existing steps or their order.

- [ ] **Step 8: Change the two load paths**

- `creator/js/character-io.js:55`: `if (result.success && result.character)` becomes `if (result.success)`.
- `creator/js/app.js:485-487`: call `State.loadCharacter(saved.character)` only if `CharacterCheck.isPlainObject(saved.character)` is true, with no `try`. If it is false, write `console.warn('The auto-save was not loaded: it does not contain a character.')` (spec §7.2, controller ruling after the review of Task 1). An error that is not the gate goes out of `checkAutoSave`. The lines after it (`SettingTab.refresh()` and on) do not change.

- [ ] **Step 9: Add the script tag and bump the cache keys in `creator/index.html`**

Add `<script src="js/character-check.js?v=129"></script>` on the line before `js/state.js`. Change `?v=128` to `?v=129` on all 35 other tags.

Run: `grep -c '?v=129' creator/index.html; grep -c '?v=128' creator/index.html`
Expected: `36` and `0`.

- [ ] **Step 10: Run the test to see it pass**

Run: `node scripts/test-load-check.js 2>&1 | tail -3`
Expected: `All checks passed`.

- [ ] **Step 11: Prove that each group of checks is not empty (mutation proof)**

Make each mutation, run the test, see the named group fail, then undo the mutation:

| Group | Mutation of the product code | Expected |
|---|---|---|
| no-op | In `CharacterCheck`, change the follower `count` rule from "finite number or null" to "integer". | `no-op: full character loads deep-equal` FAILS |
| hostile | In `CharacterCheck`, remove the `tier` rule. | each `hostile tier …: repaired` FAILS |
| R10 | In `CharacterCheck`, write `null` for every unknown key of `skills`, whatever its value. | `no-op: full character loads deep-equal` FAILS (`choice2: 4`) |
| R10 | In `CharacterCheck`, skip the unknown keys of `skills` and `attributes`. | each `hostile skills,choice1 …: repaired` and `hostile attributes,luck …: repaired` FAILS |
| absent | In `CharacterCheck`, repair the keys of a `relic` overlay only when they are present. | `absent: a relic with no oddities gets []` FAILS |
| gate | In `State.loadCharacter`, remove the gate. | each `gate: …` FAILS |
| order | In `State.loadCharacter`, move the `CharacterCheck.repair` call after the `ascensions` default. | `order: a hostile ascensionPackages does not throw` FAILS |

Record the seven results in the commit body as one line each.

- [ ] **Step 12: Update the two existing test scripts that load `state.js` and call `loadCharacter`**

`State.loadCharacter` now calls `CharacterCheck`, and the check changes two wargear values that one old check pins.

- `scripts/test-notes.js`: before line 37 (`const stateSource = …`), add `vm.runInContext(fs.readFileSync(path.join(ROOT, 'creator/js/character-check.js'), 'utf8'), sandbox);`.
- `scripts/test-custom-wargear.js`: before line 426 (`load(sctx, 'creator/js/state.js');`), add `load(sctx, 'creator/js/character-check.js');`.
- `scripts/test-custom-wargear.js`, the check `'a null entry does not throw and stays'` (line 486 before the edit above): the check becomes `check('a null entry does not throw and becomes a placeholder', [threw, State.character.wargear], [false, [{ id: '', isStarting: false }, { id: 'chainsword' }]]);` (spec §6.4: never drop, replace in place; `isStarting` is optional, so `{ id: 'chainsword' }` stays).
- `scripts/test-custom-wargear.js`, the check `'wargear {} does not throw and stays'` (line 489 before the edit above): the check becomes `check('wargear {} does not throw and becomes []', [threw, State.character.wargear], [false, []]);` (spec §6.1 row 36).

The other scripts that load `state.js` (`test-improvised.js:149`, `test-followers.js:87`, `test-custom-wargear.js:1099`) do not call `loadCharacter`, so they need no change.

- [ ] **Step 13: Run all test scripts**

Run the command of the Global Constraints. Expected: no `FAIL` line, then `done`.

- [ ] **Step 14: Commit**

```bash
git add creator/js/character-check.js creator/js/state.js creator/js/character-io.js creator/js/app.js creator/index.html scripts/test-load-check.js scripts/test-notes.js scripts/test-custom-wargear.js
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Check the types of a loaded character

The new CharacterCheck module repairs each known field of a loaded character to the type that the code expects. State.loadCharacter calls it after the merge and before the old steps. A file whose top level is not an object now shows an error. <seven mutation-proof lines>"
```

---

### Task 2: Escape the raw sites of the character sheet

Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `creator/tabs/character-sheet-tab.js:1356`, `:1820`, `:1957-1958`
- Test: `scripts/test-sheet-tabs.js` (add one block before the summary lines)

**Interfaces:**
- Consumes: nothing from Task 1. These fields are legal strings, so the check does not change them.
- Produces: nothing for later tasks.

- [ ] **Step 1: Write the failing checks in `scripts/test-sheet-tabs.js`**

Add one block that uses the file's `sheetSandbox`, `makeCharacter`, `EVIL`, `SAFE` and `RAW_TAG`. Add to `env.dataLoader` the methods that these renders call: `getWargearItem: () => null`, `getHolyRelics: () => null`, `getBackgrounds: () => ({ origins: [], accomplishments: [], goals: [] })`. `getInjuriesCorruptionData` (the real `INJURIES`) is there already. Then:

```js
// S1: a relic entry whose base id is not in the data
{
    const env = sheetSandbox();
    const html = env.sheet.renderHolyRelics(makeCharacter({ wargear: [{ id: EVIL, isStarting: false, relic: { name: 'R', form: 'f', originalOwner: 'a', anointment: 'b', power: 'c', oddities: [] } }] }));
    check('S1 relic base id is escaped', [RAW_TAG.test(html), html.includes(SAFE)], [false, true]);
}
// S2: the injury side
{
    const env = sheetSandbox();
    const id = INJURIES.traumaticInjuries[0].id;
    const html = env.sheet.renderInjuriesCorruption(makeCharacter({ traumaticInjuries: [{ id, side: EVIL }] }));
    check('S2 injury side is escaped', [RAW_TAG.test(html), html.includes(SAFE)], [false, true]);
}
// S3: a language (free text)
{
    const env = sheetSandbox();
    const html = env.sheet.renderBackground(makeCharacter({ languages: ['low_gothic', EVIL] }));
    check('S3 language is escaped', RAW_TAG.test(html), false);
    check('S3 low_gothic still shows as Low Gothic', html.includes('Low Gothic'), true);
}
```

S3 title-cases before the escape, so its `SAFE` text is in upper case: assert only that no raw tag stays.

- [ ] **Step 2: Run the test to see the three checks fail**

Run: `node scripts/test-sheet-tabs.js 2>&1 | grep -E '^FAIL' ; node scripts/test-sheet-tabs.js 2>&1 | tail -1`
Expected: FAIL for S1, S2 and S3 (escaped checks).

- [ ] **Step 3: Escape the three sites**

- `:1356`: print `${this.escapeHtml(baseName)}`.
- `:1820`: `sideLabel` uses `this.escapeHtml(entry.side)`.
- `:1957-1958`: escape each name after the title-case transform, so the transform still sees the raw `_`: `this.escapeHtml(l.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()))`.

- [ ] **Step 4: Run the test to see it pass**

Run: `node scripts/test-sheet-tabs.js 2>&1 | tail -1`
Expected: `All checks passed`.

- [ ] **Step 5: Mutation proof**

Undo the escape at `:1820` only, run the test, see `S2 injury side is escaped` FAIL, then restore it. Record the result in the commit body.

- [ ] **Step 6: Run all test scripts**

Run the command of the Global Constraints. Expected: no `FAIL` line.

- [ ] **Step 7: Commit**

```bash
git add creator/tabs/character-sheet-tab.js scripts/test-sheet-tabs.js
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Escape the relic base id, the injury side and the languages on the sheet

These three values come from a loaded file. The sheet printed them with no escape. <mutation-proof line>"
```

---

### Task 3: Escape the raw sites of the other tabs

Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Modify: `creator/tabs/followers-tab.js:67`, `:75`, `:76`
- Modify: `creator/tabs/archetype-tab.js:306`, `:310`, `:356`, `:389`, `:412`; add `escapeAttr(text)` after `escapeHtml` (`:755`)
- Modify: `creator/tabs/ascension-tab.js:225`, `:230`, `:238` (S12-S14), `:374`, `:403`, `:472`, `:483` (S20); add `escapeHtml(text)` at the end of the object
- Modify: `creator/tabs/background-tab.js:231`; add `escapeAttr(text)` after `escapeHtml` (`:278`)
- Modify: `creator/tabs/injuries-tab.js:89`; add `escapeHtml(text)`
- Modify: `creator/tabs/powers-tab.js:151`; add `escapeHtml(text)`
- Modify: `creator/tabs/species-tab.js:91-93`, `:264`; add `escapeHtml(text)`
- Test: `scripts/test-tab-escapes.js` (new)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `escapeHtml(text: any) -> string` in `AscensionTab`, `InjuriesTab`, `PowersTab`, `SpeciesTab` (body as `character-sheet-tab.js:2787-2795`: `''` for a falsy value, else `String(text)` with `& < > " '` escaped). `escapeAttr(text: any) -> string` in `ArchetypeTab` and `BackgroundTab` (`this.escapeHtml(text).replace(/"/g, '&quot;')`, as `relic-wizard.js:825-827`).

- [ ] **Step 1: Write the harness and the failing checks in `scripts/test-tab-escapes.js`**

Harness: the pattern of `scripts/test-custom-wargear.js:1-50`, plus a recording DOM.

```js
// A DOM stub. Each element from getElementById / querySelector / createElement is a stub whose
// innerHTML setter appends the string to `written`. querySelectorAll returns []. classList has
// add/remove/toggle/contains. style is {}. appendChild returns its argument. Each element also has
// addEventListener (no-op) and a settable `value`.
// The DOM escape helpers (ArchetypeTab, BackgroundTab and FollowersTab escapeHtml) set textContent
// and read innerHTML. So: setting textContent stores the text, and reading innerHTML after that
// returns the stored text with only & < > escaped (as a browser does; NOT the quote).
// If the stub does not copy this, S11 passes before the fix and S4-S8 and S15 throw. If the stub
// also escapes ", S11 and S15 pass before the fix.
function makeRecordingDocument() { /* returns { document, written: [] } */ }
const EVIL = '<b>"x\'</b>&';
const QUOTE_BREAK = '" autofocus onfocus="alert(1)';
const RAW_TAG = /<\/?b>/i;
```

The context loads `creator/js/data-loader.js` (cache: `species.json`, `archetypes.json`, `ascension-packages.json`, `keyword-categories.json`, `injuries-corruption.json`, `psychic-powers.json`, `weapons.json`, `armor.json`, `equipment.json`), `creator/js/keyword-bonus.js`, `creator/js/followers.js` and the tab under test. `State` is a stub: `{ character, getCharacter: () => character, getPsykerConfig: () => ({ disciplineChoices: 1 }), getRemainingDisciplineChoices: () => 0, getUnlockedDisciplines: () => [], getSpeciesSubOptions: () => character.species.subOptions, getSpeciesSubOptionsByType: t => character.species.subOptions.filter(o => o.type === t), getWargearBudgetUsed: () => 0, getWargearBudget: () => ({ totalValue: 15 }) }`. Add a stub method only when a render calls it.

Checks (one per site; S-numbers are spec §8.4):

```js
check('S4-S6 follower id is escaped in data-follower-id and name',
    RAW_TAG.test(FollowersTab.renderRosterItem({ id: EVIL, threatId: 'x', name: '', kind: 'mob', count: 2, livingCount: 1, notes: '' }, character)), false);
check('S7 [ORDO] custom keyword value cannot break the attribute',
    ArchetypeTab.renderKeywordChoices(DataLoader.getArchetype('inquisitorial_acolyte'), { ...character, archetypeKeywordChoices: { '[ORDO]': QUOTE_BREAK } }).includes(QUOTE_BREAK), false);
check('S8 [ANY] text keyword value cannot break the attribute',
    ArchetypeTab.renderKeywordChoices(DataLoader.getArchetype('inquisitorial_acolyte'), { ...character, archetypeKeywordChoices: { '[ANY]': QUOTE_BREAK } }).includes(QUOTE_BREAK), false);
// S9-S11: character.archetype.id = 'custom', customArchetype = { name: QUOTE_BREAK, abilityArchetypeId: null, keywords: [EVIL], wargear: [EVIL] }
//   ArchetypeTab.renderCustomConfig(); joined = written.join('')
check('S9-S10 custom keywords and unknown starting wargear are escaped', RAW_TAG.test(joined), false);
check('S11 custom archetype name cannot break the value attribute', joined.includes(QUOTE_BREAK), false);
// S13-S14: AscensionTab.renderKeywordChoiceUI(<demanding_patron package>, { targetTier: 2 },
//   { targetTier: 2, type: 'package', packageId: 'demanding_patron', choices: { '[ANY]': QUOTE_BREAK, '[ANY]2': QUOTE_BREAK } })
//   demanding_patron has only [ANY] (category 'any', 0 options), so it reaches :230 and :238, not :225.
check('S13-S14 ascension keyword choices cannot break the value attribute', html.includes(QUOTE_BREAK), false);
// S12: AscensionTab.renderKeywordChoiceUI(<agent_of_inquisition_aoa package>, { targetTier: 2 },
//   { targetTier: 2, type: 'package', packageId: 'agent_of_inquisition_aoa', choices: { '[ORDO]': QUOTE_BREAK } })
//   [ORDO] has 3 options and allowCustom, so the custom input at :225 renders.
check('S12 [ORDO] custom choice cannot break the value attribute', html.includes(QUOTE_BREAK), false);
// S15: character.languages = ['low_gothic', QUOTE_BREAK]; BackgroundTab.renderLanguages()
//   The chip text (:230) keeps the raw quote, which is safe in text. Only the attribute (:231) is checked.
check('S15 language cannot break data-lang', written.join('').includes('data-lang="' + QUOTE_BREAK), false);
// S16: InjuriesTab.renderTraumaticInjuries({ traumaticInjuries: [{ id: <first data id>, side: EVIL }] }, <injuries data>)
check('S16 injury side is escaped', RAW_TAG.test(html), false);
// S17: character.unlockedDisciplines = [EVIL]; PowersTab.renderSetupSection()
check('S17 discipline is escaped in the chip and in data-discipline', RAW_TAG.test(html), false);
// S18: SpeciesTab.render() with character.species = { id: 'human', xpCost: 0, subOptions: [{ type: 'homeworld', optionId: EVIL }] }
check('S18 unknown sub-option id is escaped on the species card', RAW_TAG.test(written.join('')), false);
// S19: SpeciesTab.renderCurrentSubOption() with species 'kroot' and subOptions [{ type: 'mutation', optionId: EVIL }];
//   set the tab's current sub-option state as SpeciesTab.renderCurrentSubOption reads it (species-tab.js:154-160)
check('S19 unknown mutation id is escaped in the chip list', RAW_TAG.test(written.join('')), false);
// S20: a second context, as the review probe probe-unknown-skill.js: the REAL data-loader.js (cache: every
//   data/*.json), xp-calculator.js, derived-stats.js, prerequisite.js, state.js, keyword-bonus.js and
//   ascension-tab.js, plus the recording DOM. Do NOT load the character through State.loadCharacter: after
//   Task 1, R10 makes skills.choice1 null at load, and this check must prove the escape alone. So:
//   const c = State.createNewCharacter();
//   Object.assign(c, { name: 'H', rank: 3, species: { id: 'human', xpCost: 0, subOptions: [] },
//       archetype: { id: 'imperial_guardsman', xpCost: 0 },
//       ascensions: [{ targetTier: 2, type: 'package', packageId: null, archetypeId: null },
//                    { targetTier: 4, type: 'archetype', packageId: null, archetypeId: null }] });
//   c.attributes.willpower = EVIL_IMG; c.attributes.strength = EVIL_IMG;
//   c.skills.persuasion = EVIL_IMG; c.skills.athletics = EVIL_IMG; c.skills.choice1 = EVIL_IMG;
//   State.character = c; AscensionTab.render(); html = written.join('');
//   with EVIL_IMG = '<img src=x onerror=alert(1)>'. The design session ran this fixture on today's code: 12 raw
//   tags in the HTML (Willpower, Persuasion, Strength and choice1 lines). With the four escapes: 0.
check('S20 prerequisite values (have …) are escaped, also for the unknown key choice1', html.includes('<img'), false);
// The new helpers keep the two text rules
check('helpers: escapeHtml escapes & < > " \'', AscensionTab.escapeHtml(EVIL), '&lt;b&gt;&quot;x&#39;&lt;/b&gt;&amp;');
check('helpers: escapeAttr escapes a quote', ArchetypeTab.escapeAttr('a"b'), 'a&quot;b');
```

The comments give the input of each check. The implementer writes the call and reads the HTML as the comment says.

- [ ] **Step 2: Run the test to see the site checks fail**

Run: `node scripts/test-tab-escapes.js 2>&1 | grep -cE '^FAIL'`
Expected: one FAIL for each site check (the helper checks fail with "not a function").

- [ ] **Step 3: Add the helpers and escape the 17 sites (S4-S20 of spec §8.4)**

Use `escapeAttr` for a value inside a double-quoted attribute in `archetype-tab.js` and `background-tab.js`. Use `escapeHtml` in the other files: it escapes `"` already. At the four S20 lines, `(have ${current})` becomes `(have ${this.escapeHtml(String(current))})`. Do not change any other line.

- [ ] **Step 4: Run the test to see it pass**

Run: `node scripts/test-tab-escapes.js 2>&1 | tail -1`
Expected: `All checks passed`.

- [ ] **Step 5: Mutation proof**

Make each mutation, run the test, see the named check FAIL, then restore it. Record both results in the commit body.

- Undo `escapeAttr` at `background-tab.js:231` only (back to `${escaped}`): `S15 language cannot break data-lang` FAILS.
- Undo the escape at `ascension-tab.js:483` only: `S20 prerequisite values (have …) are escaped, also for the unknown key choice1` FAILS.

- [ ] **Step 6: Run all test scripts**

Run the command of the Global Constraints. Expected: no `FAIL` line.

- [ ] **Step 7: Commit**

```bash
git add creator/tabs/followers-tab.js creator/tabs/archetype-tab.js creator/tabs/ascension-tab.js creator/tabs/background-tab.js creator/tabs/injuries-tab.js creator/tabs/powers-tab.js creator/tabs/species-tab.js scripts/test-tab-escapes.js
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Escape the raw ids and the free text of a loaded file in seven tabs

The follower id, the keyword choices, the custom archetype values, the languages, the injury side, the disciplines, the sub-option ids and the prerequisite values of the Ascension tab now get an escape. A value inside a double-quoted attribute also escapes the quote. <two mutation-proof lines>"
```

---

### Task 4: Prove the number sinks through the real load

Suggested dispatch: `implementer` (Sonnet).

**Files:**
- Test: `scripts/test-load-check-render.js` (new). No product file changes.

**Interfaces:**
- Consumes (from Task 1): `State.loadCharacter(data)` runs `CharacterCheck.repair`. `creator/js/character-check.js` exists.
- Consumes (from Task 3): the S20 escapes at `ascension-tab.js:374`, `:403`, `:472`, `:483` are in the tree. They matter only for the mutation proof of the two Ascension prerequisite rows (Step 4). Task 4 uses no code of `scripts/test-tab-escapes.js`; it defines its own DOM stub.
- Produces: nothing.

- [ ] **Step 1: Write the harness**

One `vm` context with the real files, in the `creator/index.html` order: `data-loader.js` (cache: all data files that `creator/js/data-loader.js` reads for these renders, read from `data/`), `xp-calculator.js`, `derived-stats.js`, `prerequisite.js`, `character-check.js`, `state.js`, `improvised-builder.js`, `custom-wargear.js`, `keyword-bonus.js`, `followers.js`, then the tabs below. Define a recording DOM in this file (the test scripts share no module):

```js
// Each element from getElementById / querySelector / createElement is a stub: setting innerHTML
// appends the string to `written`; querySelectorAll returns []; querySelector returns null or a stub;
// classList has add/remove/toggle/contains; style is {}; appendChild returns its argument;
// addEventListener is a no-op; value is settable. Setting textContent stores the text, and reading
// innerHTML after that returns the text with only & < > escaped (as a browser does).
function makeRecordingDocument() { /* returns { document, written: [] } */ }
// Clears `written`, runs fn, returns written.join('').
function recorded(fn) {}
```

Helper:

```js
const EVIL = '<img src=x onerror=alert(1)>';
// Loads the hostile character through the real State.loadCharacter (JSON round trip first).
function loadHostile(over) { /* State.loadCharacter(JSON.parse(JSON.stringify({ ...base, ...over }))) */ }
const noRawTag = html => !html.includes('<img');
```

`base` is `{ name: 'H', species: { id: 'human', xpCost: 0, subOptions: [] }, archetype: { id: 'imperial_guardsman', xpCost: 0 } }`. `over` puts `EVIL` into the field of the row.

- [ ] **Step 2: Write one check per (b) field and site of spec §8.5**

```js
// [label, over, render]  render returns the HTML string (or the joined recorded innerHTML)
const B_SINKS = [
    ['attributes on the sheet', { attributes: { strength: EVIL } }, () => CharacterSheetTab.renderAttributes(State.character)],
    ['traits on the sheet', { attributes: { toughness: EVIL }, rank: EVIL }, () => CharacterSheetTab.renderTraits(DerivedStats.getAllDerivedStats(State.character))],
    ['skills on the sheet', { skills: { weaponSkill: EVIL } }, () => CharacterSheetTab.renderSkills(State.character)],
    ['weapon cells on the sheet', { rank: EVIL, attributes: { strength: EVIL }, wargear: [{ id: 'chainsword', isStarting: false, equipped: true }] }, () => CharacterSheetTab.renderWeapons(State.character)],
    ['Ascension card targetTier', { ascensions: [{ targetTier: EVIL, type: 'package', packageId: 'back_from_the_brink', archetypeId: null }] }, () => CharacterSheetTab.renderAscensions(State.character)],
    ['stats tab attributes', { attributes: { agility: EVIL } }, () => recorded(() => StatsTab.renderAttributes())],
    ['stats tab derived stats', { corruption: EVIL, attributes: { willpower: EVIL } }, () => recorded(() => StatsTab.renderDerivedStats())],
    ['stats tab skills', { skills: { awareness: EVIL } }, () => recorded(() => StatsTab.renderSkills())],
    // A string tier builds no slot (ascension-tab.js:27-39), so a tier row cannot fail: no tier row here.
    // The prerequisite text renders only for a slot with a package or an archetype type (review probe probe-task4-vacuous.js).
    ['ascension tab package prerequisites', { attributes: { willpower: EVIL }, skills: { persuasion: EVIL }, ascensions: [{ targetTier: 2, type: 'package', packageId: null, archetypeId: null }] }, () => recorded(() => AscensionTab.render())],
    ['ascension tab archetype prerequisites', { attributes: { strength: EVIL }, skills: { athletics: EVIL }, rank: 3, ascensions: [{ targetTier: 4, type: 'archetype', packageId: null, archetypeId: null }] }, () => recorded(() => AscensionTab.render())],
    ['archetype tab tier', { tier: EVIL, archetype: { id: 'custom', xpCost: 0 } }, () => recorded(() => ArchetypeTab.renderCustomConfig())],
    ['injuries tab corruption', { corruption: EVIL }, () => InjuriesTab.renderCorruption(State.character, DataLoader.getInjuriesCorruptionData())],
    ['followers tab counts', { followers: [{ id: 'flw_a', threatId: 'x', name: '', kind: 'mob', count: EVIL, livingCount: EVIL, notes: '' }] }, () => FollowersTab.renderRosterItem(State.character.followers[0], State.character)],
    ['improvised form halfTime and rank', { rank: EVIL, wargear: [{ id: 'improvised_melee_weapon', isStarting: false, improvised: { name: 'L', details: '', halfTime: EVIL, damageRank: true, removeUnwieldy: false, doubleRange: false, traits: [] } }] }, () => recorded(() => { ImprovisedBuilder.open(0); })]
];
for (const [label, over, render] of B_SINKS) {
    loadHostile(over);
    let html = '', threw = false;
    try { html = render(); } catch (e) { threw = e.message; }
    check(`(b) ${label}: no throw`, threw, false);
    check(`(b) ${label}: no raw tag`, noRawTag(html), true);
}
```

Where a data id in a row does not exist in `/data` (check `chainsword`, `improvised_melee`, `back_from_the_brink`), use an id that does, and keep the field under test. Where a render needs more `State` or DOM, add the minimum stub; do not change product code.

- [ ] **Step 3: Run the test to see it pass**

Run: `node scripts/test-load-check-render.js 2>&1 | tail -1`
Expected: `All checks passed`.

- [ ] **Step 4: Mutation proof**

1. In `creator/js/state.js`, comment out the `CharacterCheck.repair` call (and its warning). Run the test. Expected: a `(b) … no raw tag` FAIL for each of `attributes on the sheet`, `skills on the sheet`, `Ascension card targetTier`, `stats tab attributes` and `injuries tab corruption`. Restore the line.
2. The two Ascension prerequisite rows have two guards: the check (Task 1) and the S20 escapes (Task 3). So the first mutation alone cannot fail them. Comment out the `CharacterCheck.repair` call AND undo the four S20 escapes in `creator/tabs/ascension-tab.js` (`:374`, `:403`, `:472`, `:483`, back to `(have ${current})`). Run the test. Expected: `(b) ascension tab package prerequisites: no raw tag` and `(b) ascension tab archetype prerequisites: no raw tag` FAIL. Restore both files.

Record the FAIL lists of both mutations in the commit body. Run `git status --short` after the restore: it must show only `?? scripts/test-load-check-render.js`.

- [ ] **Step 5: Run all test scripts**

Run the command of the Global Constraints. Expected: no `FAIL` line.

- [ ] **Step 6: Commit**

```bash
git add scripts/test-load-check-render.js
git commit --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>" -m "Test the number sinks through the real character load

Each test loads a hostile value through State.loadCharacter and renders the site. The HTML must not hold the raw tag. <two mutation-proof lines>"
```

---

## Review record (2026-11-15)

Branch `character-load-check`, base `f6a3be0`. Commits, in sequence: `5ca625f` (spec and plan), `d1c7390` (plan fix round), `8f9336a` (eight text items), `eab27c7` (Task 1), `d53b9b1` (the autosave ruling in the spec and the plan), `a12075c` (Task 1 fix round), `44176ab` (Task 2), `083f494` (Task 3), `6747d99` (Task 4), `978824b` (Task 2 fix round), `56ac472` (Task 3 fix round), `2b4aae9` (helper rule in the spec), `888dd6d` (Task 4 fix round), `36c6f45` (two comment lines), `9ffcb53` (four spec texts after the final review), `5647fc1` and `523d1a4` (the test block of finding X1), then the controller's commit with this record.

### Owner decision

- "Let's go ahead and implement the type check. Everything else looks good for now."

### Rulings

The rulings R1 to R10 are in spec §3. R10 came from the plan review. The rulings below came from the reviews and from the work.

1. C1 (plan review P1, Critical): `ascension-tab.js:483` read `character.skills[key]` through a key of the archetype data and printed the value raw. The site became S20, with an escape at `:374`, `:403`, `:472` and `:483`.
2. C2: R10. Inside `attributes` and `skills`, an unknown key stays, but its value must be a finite number or `null`. This closes the class of reads through a data key at the load.
3. C3: the author did a second search for reads of the character through a key that is not a literal. It found no more site.
4. C4: real saves hold `skills.choice`, `choice1` or `choice2` with `null`, because `state.js:355` writes NaN. The no-op corpus holds this shape. The NaN write stays (spec F11).
5. C6: the Electron 1.0.0 build is evidence for R1. The plan reviewer installed `p7zip-full` and read the installer from the owner's OneDrive folder. It changed nothing there, and no file of the build is in the repo. The owner was told.
6. C7: `rank`, `additionalXp` and `corruption` are "integer or `null`". A 309-digit entry saves as `null`, and R1 has priority.
7. C8: inside a list entry or an overlay, an absent key that the table does not mark "optional" gets its repair value. Where the repair is "drop the entry", an absent key drops the entry.
8. T1-1: the autosave path tests the shape and uses no `try`. A catch for all errors hides a script that did not load. The app then starts blank, and the next autosave writes over the stored character. Accepted with it: the outer `if (saved.character)` is gone, so an autosave with no `character` key writes the warning. The writer always writes the key.
9. T1-2 and T4-1: a gap in a fixture table of the plan went directly to the implementer when the reviewer named each row and ran each correction. It did not go through the plan author.
10. T2-1 and T3-1: the small test gaps of Tasks 2 and 3 were taken, not parked. The two fix rounds had no separate re-review, because each was the reviewer's own correction in 5 to 10 test lines. The final review ran 14 mutants against the new checks of `978824b`, `56ac472` and `888dd6d`, and each check failed for its mutant.
11. T3-2: the four new `escapeHtml` helpers return `''` only for `null` and `undefined`, so `0` prints as `0`. The spec Helpers paragraph records this. S7 and S12 keep the `isCustom ? ... : ''` ternary around the escape.
12. T4-2: no render row for sheet `:990` and for `:831` through a species path option. Each reads `rank` with the same expression (`character.rank || 1`) as the sites that the rows prove, and the check types `rank` at the load.
13. X1 (final review, Important, test): done before the merge. A new block in `scripts/test-load-check.js` builds a character through the real writers and asserts that the load gives the same character and no warning. It guards R1 against the next change of a stored shape. The scoped re-review approved the block and named five more list writers whose entries the check can drop (a power, a free power pick, a discipline, a custom keyword, a custom starting item). They went into the block in `523d1a4`, with a second build for the custom archetype. That commit had no further re-review: the correction was the reviewer's own, a mutant of each of the five writers failed the new checks, and the controller ran all test scripts.
14. Process: each task review ran in a second worktree, detached at the task commit, so that the next task could start at the same time. Fix rounds stayed in sequence. Test logs went to the session scratch folder, not to the `/tmp/loadcheck-*.log` paths of the plan text. The final review started together with the scoped re-review of the Task 4 fix round.

### Plan lines that no longer match the code

- Task 4, the row table: four rows changed in `888dd6d` (a talent in the two `rank` rows of the sheet, `skills.weaponSkill` in the weapons row, `skills.tech` in place of `skills.athletics`, a legal second entry and one more check in the `targetTier` row). The script has 29 checks.
- Task 1: `scripts/test-load-check.js` has more rows than the HOSTILE table of the plan (23 rules got a row in `a12075c`), a `'__NONFINITE__'` replacer in `loadJson`, and the block of ruling 13. The script has 2015 checks.
- Tasks 2 and 3: one more check for S1, one for S3 and one for S4 to S6.
- The log paths (ruling 14).

### Evidence of the final review

- R1: 580 characters, each built with 60 to 70 operations through the real writers in a real page, loaded with 0 changes, 0 warnings and 0 throws, and each result was equal to the load at `f6a3be0`. Six older shapes on the same files gave 3480 loads that were equal to the base. The only warning was `species.subOptions` (spec §4.1 rule 4).
- The goal: 4527 hostile files went through the real load and through the render of each tab, the sheet and the modals in headless Chromium. The result was 0 injected elements, 0 attribute breaks and 0 script runs. At the base, script ran for 80 of the 1128 standard files, and each of S1 to S20 appeared.
- 1776 files with a degenerate value (`null`, `''`, `-1.5`, `1e21`, an absent key, a wrong container): no throw at the load or at a tab render, apart from spec F3. The relic wizard modal throws for some (spec F6).
- No visible change: the DOM of 12 sections, the sheet, the sidebar, the header and the footer for 80 characters with plain text had 0 differences from the base. With `& < > " '` in the text, the only difference was the `"` escape in `value` attributes (S7, S8, S11, S13).
- The real paths: import through the Load button and the file input in headless Chromium and WebKit, and the autosave in Chromium and Firefox. Seven bad top levels gave the error dialog and kept the character.

### Findings outside this work

- Spec §11 holds F1 to F11. The largest is F1: the `ascensionPackages` migration never runs, so each save with that key (the Electron 1.0.0 saves included) loses its ascension packages at load. The file on the disk stays intact. This change does not correct it (R8). The owner decides.
- The old snapshot site (`wrath-and-glory-creator-web`) uses the same autosave key. On the same origin, its autosave loads in this app. Its writers match the spec rows.
- `Glossary.processText` (`creator/js/glossary.js:149-196`) runs its term regex over serialized HTML, attribute values included. No element that it processes holds a character value in an attribute at this time.
- The custom wargear repair deletes `equipped` from a custom entry that is not a weapon (`custom-wargear.js:781-786`). The UI cannot set it there.

### Parked items

| Item | Why it was left |
|---|---|
| The commit body of `a12075c` says "22 rules" and lists 23. | The count came from the review. No history rewrite. |
| The check `legal entry renders` of the render test hangs on the row label `'Ascension card targetTier'`. A rename of the row removes the check with no message. | A reading of the re-review. The label and the check are 20 lines apart in one file. |
| A warning path uses the index of the loaded file. A custom entry with a bad `relic` gets two warnings (the check and the custom repair). A save with no `species.subOptions` gets one warning. | R7 covers one `console.warn` of the check. No user sees the console. |
| `ascension-tab.js:237` prints `data-key="${key}"` raw. | The key comes from the package data, not from the character. |
| The site counts of spec §8.2 come from inventory notes that are not in the repo. | Spec §12 says so. The final review tested the result. |
| The two routes of ruling 12. | Refer to the ruling. |

### Not checked

- A real `.character` file from a user. None is on this machine.
- The Electron wrappers (separate projects). A wrapper with its own script list needs the new `character-check.js` tag before `state.js`. Without it, each load fails with `CharacterCheck is not defined`.
- The app before Electron 1.0.0 (no history, no build).
- Import through the file dialog in Firefox. The hostile files and the DOM comparison ran in Chromium only.
- Spec F2 (a large negative `tier`) was not run again.
- The block of ruling 13 calls the setters with the value types that the UI handlers pass. The handlers themselves, and the `open()` methods of the relic wizard, the improvised builder and the custom wargear form, do not run in it. The 580 characters of the final review went through the real page.

### Wave table

| Task | Model | Dispatches | Send-backs | Gate |
|---|---|---|---|---|
| Spec and plan | opus (general-purpose) | 1 | 1 | Plan review: 1 Critical, 6 Important, 6 Minor, all closed; 8 Minor text items corrected by the controller |
| Task 1 The check and the load gate | opus (implementer) | 1 | 3 (fix round 1; the X1 block after the final review; five more writers for that block) | Review: compliant, 1 Important, 3 Minor, all closed; APPROVED |
| Task 2 Sheet escapes | sonnet | 1 | 1 (two checks) | Review: compliant, APPROVED, 2 Minor; corrected |
| Task 3 Tab escapes | sonnet | 1 | 1 (one check, one dead stub) | Review: compliant, APPROVED, 3 Minor; corrected |
| Task 4 Render tests | sonnet | 1 | 1 (four rows) | Review: compliant, 1 Important, 3 Minor, all closed; APPROVED; 1 Minor comment corrected by the controller |
| Plan and task reviews | opus, xhigh | 5 | 0 | 4 scoped re-reviews through the same reviewers: plan, Task 1, Task 4, the X1 block |
| Final review | fable, xhigh | 1 | 0 | Ready to merge (0 Critical; 1 Important test gap, closed by ruling 13; 3 Minor spec texts corrected by the controller) |
