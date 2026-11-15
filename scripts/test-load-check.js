// Tests for the type check on a loaded character (creator/js/character-check.js) and the load gate
// in State.loadCharacter, CharacterIO.load and App.checkAutoSave.
// Run: node scripts/test-load-check.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const readSource = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let failures = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// Deep copy with object keys sorted, so two records compare equal whatever their key order.
function canon(value) {
    if (Array.isArray(value)) return value.map(canon);
    if (value && typeof value === 'object') {
        const out = {};
        for (const key of Object.keys(value).sort()) out[key] = canon(value[key]);
        return out;
    }
    return value;
}

const DATA = {};
for (const f of ['glossary.json', 'weapons.json', 'armor.json', 'equipment.json'])
    DATA[f] = readJson(`data/${f}`);

// Runs a source file into a context. A top-level const stays visible to the later files of the context.
function load(ctx, rel) {
    vm.runInContext(readSource(rel), ctx, { filename: rel });
}

// Reads a global (also a const global) out of a context.
function get(ctx, name) {
    return vm.runInContext(name, ctx);
}

// Each console.warn call of a context, as one string.
const warns = [];

// A new context with the real data-loader.js and its data cache, custom-wargear.js, character-check.js
// and state.js. Its console records each warn call in warns.
function creatorSandbox(globals) {
    const ctx = vm.createContext({
        console: { log: console.log, error: console.error, info: console.info, warn: (...args) => { warns.push(args.join(' ')); } },
        localStorage: {},
        setTimeout: () => 0,
        clearTimeout: () => {},
        ...globals
    });
    load(ctx, 'creator/js/data-loader.js');
    get(ctx, 'DataLoader').cache = DATA;
    load(ctx, 'creator/js/custom-wargear.js');
    load(ctx, 'creator/js/character-check.js');
    load(ctx, 'creator/js/state.js');
    return ctx;
}

const EVIL = '<img src=x onerror=alert(1)>';
const INF = { __inf: true };            // sentinel: serialized as the JSON text 1e999
const rt = v => JSON.parse(JSON.stringify(v));

async function main() {
const ctx = creatorSandbox({
    window: { api: { showOpenDialog: async () => ({ canceled: false, filePaths: ['a.character'] }), importCharacter: async () => ({ success: true, character: null }) } }
});
load(ctx, 'creator/js/character-io.js');
const State = get(ctx, 'State');
const CharacterIO = get(ctx, 'CharacterIO');

// Serializes value (INF becomes 1e999), parses the text, and loads it.
// Returns { character, warns, threw } where character is a JSON copy of State.character.
function loadJson(value) {
    const text = JSON.stringify(value, (key, v) => (v === INF ? '__INF__' : v)).split('"__INF__"').join('1e999');
    const data = JSON.parse(text);
    warns.length = 0;
    let threw = false;
    try { State.loadCharacter(data); } catch (e) { threw = true; }
    return { character: rt(State.character), warns: warns.slice(), threw };
}

// setPath / getPath take a path array such as ['ascensions', 0, 'targetTier'].
function setPath(obj, keys, value) {
    let node = obj;
    for (const key of keys.slice(0, -1)) node = node[key];
    node[keys[keys.length - 1]] = value;
}
function getPath(obj, keys) {
    let node = obj;
    for (const key of keys) node = node[key];
    return node;
}

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

// --- the module interface ---
{
    const CC = get(ctx, 'CharacterCheck');
    check('isPlainObject is true only for an object that is not null and not an array',
        [CC.isPlainObject({}), CC.isPlainObject(null), CC.isPlainObject([]), CC.isPlainObject('x'), CC.isPlainObject(5)], [true, false, false, false, false]);
    check('DISCIPLINE_CHOICE_TALENTS', CC.DISCIPLINE_CHOICE_TALENTS, ['warped_mind', 'tormented_manifestation_aoa']);
}

// --- no-op: each shape that some app version writes loads with no change ---
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

// --- hostile: a value of the wrong type gets the repair value of its row ---
// Bad-value sets (spec §4.1 rule 8; null is not in a set where null is legal)
const INT_BAD = [EVIL, '3', {}, [], null, true, INF, 2.5];
const INT_NULL_BAD = [EVIL, '3', {}, [], true, INF, 2.5];      // integer or null
const NUM_NULL_BAD = [EVIL, '3', {}, [], true, INF];          // finite number or null
const NUM_BAD = [EVIL, '3', {}, [], null, true, INF];         // finite number
const STR_BAD = [{}, [], null, 5, true];
const STR_NULL_BAD = [{}, [], 5, true];
const OBJ_BAD = [EVIL, [], null, 5];
const ARR_BAD = [EVIL, {}, null, 5];
const BOOL_BAD = [EVIL, 1, null, {}];

// Rows: path, bad values, expected value, optional read path (spec row numbers in the comments)
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

for (const [rowPath, bads, expected, readPathArg] of HOSTILE) {
    const readPath = readPathArg || rowPath;
    for (const bad of bads) {
        const c = rowPath[0] === 'customKeywords' ? CORPUS['pre-web shapes']() : CORPUS['full character']();
        setPath(c, rowPath, bad);
        const r = loadJson(c);
        const label = `${rowPath} ${JSON.stringify(bad)}`;
        check(`hostile ${label}: no throw`, r.threw, false);
        if (expected === undefined) {
            const parent = getPath(r.character, readPath.slice(0, -1));
            check(`hostile ${label}: repaired`, isAbsent(parent, readPath[readPath.length - 1]), true);
        } else {
            check(`hostile ${label}: repaired`, canon(getPath(r.character, readPath)), canon(expected));
        }
        check(`hostile ${label}: one warning`, r.warns.length, 1);
    }
}
// True when parent is an object and key is absent from it.
function isAbsent(parent, key) {
    return parent !== null && typeof parent === 'object' && !(key in parent);
}

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
    const without = (keys, key) => { const c = full(); delete getPath(c, keys)[key]; return loadJson(c); };
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

// a repair of a data key named __proto__ writes the own key, not the prototype
{
    const r = loadJson(JSON.parse('{"archetypeKeywordChoices": {"__proto__": 5}, "skills": {"__proto__": "x"}}'));
    check('__proto__: the own key gets the repair value',
        [Object.getOwnPropertyDescriptor(r.character.archetypeKeywordChoices, '__proto__')?.value, Object.getOwnPropertyDescriptor(r.character.skills, '__proto__')?.value],
        ['', null]);
}

// --- gate: a top level that is not a plain object ---
loadJson(base());
for (const top of [null, [], [1, 2], 'x', 5, true]) {
    const before = State.character;            // read after a good load of base()
    let message = null;
    try { State.loadCharacter(top); } catch (e) { message = e.message; }
    check(`gate: ${JSON.stringify(top)} throws`, message, 'The file does not contain a character.');
    check(`gate: ${JSON.stringify(top)} keeps the current character`, State.character === before, true);
}

// import path: CharacterIO.load shows the error of the gate
check('import: a null file returns the error', await CharacterIO.load(), { success: false, error: 'The file does not contain a character.' });

// autosave path: App.checkAutoSave writes a warning and does not throw
{
    const actx = creatorSandbox({
        document: { addEventListener() {} },
        SettingTab: { refresh() {} },
        SettingsTab: { refresh() {}, sourceButtons: [] }
    });
    load(actx, 'creator/js/app.js');
    const AState = get(actx, 'State'), App = get(actx, 'App');
    AState.character = AState.createNewCharacter();
    AState.getAutoSave = () => ({ character: 'x' });
    App.switchTab = () => {};
    App.switchSection = () => {};
    warns.length = 0;
    let threw = false; try { App.checkAutoSave(); } catch (e) { threw = true; }
    check('autosave: a bad character does not throw', threw, false);
    check('autosave: the warning names the reason', warns.includes('The auto-save was not loaded: The file does not contain a character.'), true);
}

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) FAILED.`);
process.exit(failures ? 1 : 0);
}

main();
