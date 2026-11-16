// Tests for the type check of the bestiary (bestiary/js/bestiary-check.js): the no-op corpus
// built through the real writers, the repair of each wrong value, the number input rule,
// the compare of two threat records, and the limits that the inputs declare.
// Run: node scripts/test-bestiary-check.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const readSource = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const rt = v => JSON.parse(JSON.stringify(v));

let failures = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// encounter-state.js and threat-builder-state.js schedule an autosave with setTimeout on every
// change and write it to localStorage, so the context stubs both. No-op timers leave no timer alive.
const store = {};
const warns = [];
const sandbox = {
    console: { log() {}, warn: (...args) => { warns.push(args.join(' ')); }, error: console.error },
    localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; }
    },
    setTimeout: () => 0,
    clearTimeout: () => {},
    App: { updateThreatCount() {} }
};
vm.createContext(sandbox);
const load = (rel) => vm.runInContext(readSource(rel), sandbox, { filename: rel });
load('bestiary/js/data-loader.js');
load('bestiary/js/bestiary-check.js');
load('bestiary/js/encounter-state.js');
load('bestiary/js/threat-builder-state.js');
const DataLoader = vm.runInContext('DataLoader', sandbox);
const BestiaryCheck = vm.runInContext('BestiaryCheck', sandbox);
const EncounterState = vm.runInContext('EncounterState', sandbox);
const ThreatBuilderState = vm.runInContext('ThreatBuilderState', sandbox);
DataLoader.cache['threats.json'] = readJson('data/threats.json');
DataLoader.cache['vehicles.json'] = readJson('data/vehicles.json');
DataLoader.cache['threat-weapons.json'] = readJson('data/threat-weapons.json');

// One encounter built through the real writers only
function buildEncounterCorpus() {
    EncounterState.clearEncounter();
    EncounterState.updateSettings({ tier: 3, playerCount: 5, name: 'Gate "7" & <Co>' });
    EncounterState.incrementRound(); EncounterState.incrementRound();
    const [a] = EncounterState.addIndividual('sly_marbo_aaa', 1);
    EncounterState.updateBonus(a, 'adversary');
    EncounterState.updateWounds(a, 3); EncounterState.updateShock(a, 1);
    EncounterState.setInitiative(a, '12');
    EncounterState.updateIndividualNotes(a, 'HP &lt;5 </textarea> "q"');
    EncounterState.setAdditionalWeapon(a, 'gone_weapon');
    const [champ] = EncounterState.addIndividual('tactical_space_marine', 1);
    EncounterState.updatePersonalRuin(champ, 2);
    EncounterState.updateBonus(champ, 'elite');
    const [mob] = EncounterState.addIndividual('astra_militarum_trooper', 4, true);
    EncounterState.setMobInitiative(mob, '7'); EncounterState.updateMobNotes(mob, 'n & m');
    const split = EncounterState.splitOffFromMob(mob, 2);
    EncounterState.setMobInitiative(split, '');                // a mob with a null initiative
    const p = EncounterState.addPlayerCharacter('Bob "Big" Smith');
    EncounterState.setPlayerCharacterInitiative(p, '15');
    EncounterState.updatePlayerCharacterNotes(p, '&amp;');
    const v = EncounterState.addVehicle('chimera');
    EncounterState.updateVehicleWounds(v, 2); EncounterState.setVehicleInitiative(v, '3');
    EncounterState.moveItemInOrder('player', p, 0);
    const p2 = EncounterState.addPlayerCharacter('Ann');
    EncounterState.setPlayerCharacterInitiative(p2, '');      // a player with a null initiative
    const v2 = EncounterState.addVehicle('chimera');
    EncounterState.setVehicleInitiative(v2, '');              // a vehicle with a null initiative
    ThreatBuilderState.loadTemplate('fire_warrior');           // list-shaped mobAbilities and mobOptions
    ThreatBuilderState.updateField('name', 'Custom FW');
    ThreatBuilderState.injectIntoEncounter(2);
    ThreatBuilderState.clear();
    ThreatBuilderState.updateField('name', 'Scratch');
    ThreatBuilderState.addAbility({ type: 'ACTION', name: 'Hit', description: 'd', stats: 's' });
    ThreatBuilderState.addBonus({ name: 'B', description: 'd' });
    ThreatBuilderState.addKeyword('ork');
    ThreatBuilderState.updateField('shock', '-');
    ThreatBuilderState.addSkillEntry('Athletics', 3);
    ThreatBuilderState.injectIntoEncounter(1);
    return JSON.parse(JSON.stringify(EncounterState.getEncounterData()));
}

const saved = buildEncounterCorpus();
// The same encounter after the real writer clearEncounterOrder (encounterOrder: null)
EncounterState.clearEncounterOrder();
const savedNoOrder = rt(EncounterState.getEncounterData());

// The corpus without the keys that spec §4.4 marks optional
function OLD_SHAPES() {
    const old = rt(saved);
    delete old.settings.round;
    delete old.vehicles;
    delete old.encounterOrder;
    delete old.customThreats;
    for (const individual of old.individuals) {
        delete individual.personalRuin;
        delete individual.additionalWeaponId;
    }
    return old;
}

// --- No-op checks ---
{ const copy = rt(saved);
  check('no-op: the writer corpus repairs nothing', BestiaryCheck.repairEncounter(copy), []);
  check('no-op: the writer corpus stays deep-equal', copy, saved); }
{ const old = OLD_SHAPES(); const copy = rt(old);
  check('no-op: old shapes repair nothing', BestiaryCheck.repairEncounter(copy), []);
  check('no-op: old shapes stay deep-equal', copy, old); }
check('no-op: the corpus has an Elite individual and a null mob, player and vehicle initiative',
    [saved.individuals[1].bonus, saved.mobs[1].initiative, saved.playerCharacters[1].initiative, saved.vehicles[1].initiative],
    ['elite', null, null, null]);
{ const copy = rt(savedNoOrder);
  check('no-op: the corpus has a null encounterOrder', savedNoOrder.encounterOrder, null);
  check('no-op: a null encounterOrder repairs nothing', BestiaryCheck.repairEncounter(copy), []);
  check('no-op: a null encounterOrder stays deep-equal', copy, savedNoOrder); }
// each shipped record, and each shipped record as a builder template
let bad = [];
for (const t of readJson('data/threats.json')) {
    const c = rt(t); if (BestiaryCheck.repairThreat(c, '').length || JSON.stringify(c) !== JSON.stringify(t)) bad.push(t.id);
    ThreatBuilderState.loadTemplate(t.id); const d = ThreatBuilderState.getThreatData(); const e = rt(d);
    if (BestiaryCheck.repairThreat(e, '').length || JSON.stringify(e) !== JSON.stringify(d)) bad.push('template:' + t.id);
}
check('no-op: the 844 shipped threats and their templates repair nothing', bad, []);
{ ThreatBuilderState.clear(); const d = ThreatBuilderState.getThreatData();
  check('no-op: a new builder threat repairs nothing', BestiaryCheck.repairThreat(rt(d), ''), []); }

// --- Repair checks ---
// Each case: [name, makeData, repairFn, expectedPaths, [readValue, expectedValue]]
const base = () => rt(saved);
const enc = d => BestiaryCheck.repairEncounter(d);
const withData = (change) => () => { const d = base(); change(d); return d; };
const idsAfterFirst = saved.individuals.slice(1).map(i => i.id);
const fireWarrior = () => rt(DataLoader.getThreat('fire_warrior'));
const thr = t => BestiaryCheck.repairThreat(t, '');
const withThreat = (change) => () => { const t = fireWarrior(); change(t); return t; };
const ply = d => BestiaryCheck.repairPlayers(d);

const cases = [
    ['settings not an object', withData(d => { d.settings = 5; }), enc, ['settings'],
        [d => d.settings, { tier: 1, playerCount: 4, name: 'Unnamed Encounter', round: 1 }]],
    ['tier string', withData(d => { d.settings.tier = '3'; }), enc, ['settings.tier'], [d => d.settings.tier, 1]],
    ['playerCount null (C6 defect)', withData(d => { d.settings.playerCount = null; }), enc, ['settings.playerCount'], [d => d.settings.playerCount, 4]],
    ['playerCount 300000 (E1)', withData(d => { d.settings.playerCount = 300000; }), enc, ['settings.playerCount'], [d => d.settings.playerCount, 10]],
    ['playerCount 0 (E1)', withData(d => { d.settings.playerCount = 0; }), enc, ['settings.playerCount'], [d => d.settings.playerCount, 1]],
    ['playerCount 2.5', withData(d => { d.settings.playerCount = 2.5; }), enc, ['settings.playerCount'], [d => d.settings.playerCount, 4]],
    ['individuals object', withData(d => { d.individuals = {}; }), enc, ['individuals'], [d => d.individuals, []]],
    ['individual not an object', withData(d => { d.individuals[0] = 5; }), enc, ['individuals[0]'], [d => d.individuals.map(i => i.id), idsAfterFirst]],
    ['individual id number', withData(d => { d.individuals[0].id = 5; }), enc, ['individuals[0]'], [d => d.individuals.map(i => i.id), idsAfterFirst]],
    ['bonus unknown', withData(d => { d.individuals[0].bonus = 'x'; }), enc, ['individuals[0].bonus'], [d => d.individuals[0].bonus, 'none']],
    ['currentWounds string', withData(d => { d.individuals[0].currentWounds = '3'; }), enc, ['individuals[0].currentWounds'], [d => d.individuals[0].currentWounds, 0]],
    ['maxWounds string', withData(d => { d.individuals[0].maxWounds = 'x'; }), enc, ['individuals[0].maxWounds'], [d => d.individuals[0].maxWounds, null]],
    ['maxWounds null (legal)', withData(d => { d.individuals[0].maxWounds = null; }), enc, [], [d => d.individuals[0].maxWounds, null]],
    ['dangling mobId (E3)', withData(d => { d.individuals[0].mobId = 'nomob'; }), enc, ['individuals[0].mobId'], [d => d.individuals[0].mobId, null]],
    ['member of a dropped mob (P9)', withData(d => { d.mobs[0].threatId = 5; }), enc,
        ['individuals[4].mobId', 'individuals[5].mobId', 'mobs[0]'],
        [d => [d.individuals[4].mobId, d.individuals[5].mobId], [null, null]]],
    ['currentWounds null (C6 defect, E4)', withData(d => { d.individuals[0].currentWounds = null; }), enc, ['individuals[0].currentWounds'], [d => d.individuals[0].currentWounds, 0]],
    ['initiative string', withData(d => { d.individuals[0].initiative = 'x'; }), enc, ['individuals[0].initiative'], [d => d.individuals[0].initiative, null]],
    ['notes number', withData(d => { d.individuals[0].notes = 5; }), enc, ['individuals[0].notes'], [d => d.individuals[0].notes, '']],
    ['mob name number', withData(d => { d.mobs[0].name = 5; }), enc, ['mobs[0].name'], [d => d.mobs[0].name, 'Mob']],
    ['player name object', withData(d => { d.playerCharacters[0].name = {}; }), enc, ['playerCharacters[0].name'], [d => d.playerCharacters[0].name, 'Player']],
    ['vehicle wounds string', withData(d => { d.vehicles[0].wounds = 'x'; }), enc, ['vehicles[0].wounds'], [d => d.vehicles[0].wounds, 0]],
    ['vehicle with no vehicleId', withData(d => { delete d.vehicles[0].vehicleId; }), enc, ['vehicles[0]'],
        [d => d.vehicles.map(v => v.id), [saved.vehicles[1].id]]],
    // Fix round 1 (F3): one row for each part that the first table did not reach
    ['maxShock string', withData(d => { d.individuals[0].maxShock = 'x'; }), enc, ['individuals[0].maxShock'], [d => d.individuals[0].maxShock, null]],
    ['mob with no threatId', withData(d => { delete d.mobs[0].threatId; }), enc,
        ['individuals[4].mobId', 'individuals[5].mobId', 'mobs[0]'], [d => d.mobs.map(m => m.id), [saved.mobs[1].id]]],
    ['mob initiative string', withData(d => { d.mobs[0].initiative = 'x'; }), enc, ['mobs[0].initiative'], [d => d.mobs[0].initiative, null]],
    ['player initiative string', withData(d => { d.playerCharacters[0].initiative = 'x'; }), enc, ['playerCharacters[0].initiative'], [d => d.playerCharacters[0].initiative, null]],
    ['vehicle initiative string', withData(d => { d.vehicles[0].initiative = 'x'; }), enc, ['vehicles[0].initiative'], [d => d.vehicles[0].initiative, null]],
    ['order entry with no type', withData(d => { delete d.encounterOrder[0].type; }), enc, ['encounterOrder[0]'],
        [d => d.encounterOrder, saved.encounterOrder.slice(1)]],
    ['encounterOrder string', withData(d => { d.encounterOrder = 'x'; }), enc, ['encounterOrder'], [d => d.encounterOrder, null]],
    ['customThreats object', withData(d => { d.customThreats = {}; }), enc, ['customThreats'], [d => d.customThreats, []]],
    ['C11 shipped id', withData(d => { d.customThreats[0].id = 'sly_marbo_aaa'; }), enc, ['customThreats[0]'],
        [d => d.customThreats.map(t => t.id), [saved.customThreats[1].id]]],
    ['repeated id', withData(d => { d.customThreats.push(rt(d.customThreats[0])); }), enc, ['customThreats[2]'], [d => d.customThreats.length, 2]],

    ['threat: no name', withThreat(t => { delete t.name; }), thr, ['name'], [t => t.name, '']],
    ['threat: source number', withThreat(t => { t.source = 5; }), thr, ['source'], [t => t.source, 'Custom']],
    ['threat: page string', withThreat(t => { t.page = '3'; }), thr, ['page'], [t => t.page, null]],
    ['threat: tierThreat string', withThreat(t => { t.tierThreat = 'x'; }), thr, ['tierThreat'],
        [t => t.tierThreat, { '1': 'T', '2': 'T', '3': '-', '4': '-', '5': '-' }]],
    ['threat: tierThreat value number', withThreat(t => { t.tierThreat['2'] = 5; }), thr, ['tierThreat.2'], [t => t.tierThreat['2'], '-']],
    ['threat: keyword number', withThreat(t => { t.keywords = [5, 'ORK']; }), thr, ['keywords[0]'], [t => t.keywords, ['ORK']]],
    ['threat: attribute string', withThreat(t => { t.attributes.S = '<b>'; }), thr, ['attributes.S'], [t => t.attributes.S, 1]],
    ['threat: shock object', withThreat(t => { t.shock = {}; }), thr, ['shock'], [t => t.shock, 1]],
    ['threat: conviction array', withThreat(t => { t.conviction = []; }), thr, ['conviction'], [t => t.conviction, 0]],
    ['threat: ability not an object', withThreat(t => { t.abilities = [5]; }), thr, ['abilities[0]'], [t => t.abilities, []]],
    ['threat: ability type number', withThreat(t => { t.abilities[0].type = 5; }), thr, ['abilities[0].type'], [t => t.abilities[0].type, 'ABILITY']],
    ['threat: mobAbilities list', withThreat(t => { t.mobAbilities = [5, { name: 5, description: 'd' }]; }), thr,
        ['mobAbilities[0]', 'mobAbilities[1].name'], [t => t.mobAbilities, [{ name: '', description: 'd' }]]],
    ['threat: skills number', withThreat(t => { t.skills = 5; }), thr, ['skills'], [t => t.skills, '']],
    ['threat: unknown key stays', withThreat(t => { t.mobActions = 'kept'; }), thr, [], [t => t.mobActions, 'kept']],
    // Fix round 1 (F3)
    ['threat: tierThreat key outside 1-5', withThreat(t => { t.tierThreat['6'] = 5; }), thr, ['tierThreat.6'], [t => t.tierThreat['6'], '-']],
    ['threat: size number', withThreat(t => { t.size = 5; }), thr, ['size'], [t => t.size, 'Average']],
    ['threat: resilience values', withThreat(t => { t.resilience = { value: '4', note: 3 }; }), thr,
        ['resilience.value', 'resilience.note'], [t => t.resilience, { value: 1, note: '' }]],
    ['threat: bonuses entries', withThreat(t => { t.bonuses = [5, { name: 'B', description: 7 }]; }), thr,
        ['bonuses[0]', 'bonuses[1].description'], [t => t.bonuses, [{ name: 'B', description: '' }]]],

    ['players: playerCount string', () => ({ playerCount: '3', players: [] }), ply, ['playerCount'], [d => 'playerCount' in d, false]],
    ['players: playerCount 50', () => ({ playerCount: 50 }), ply, ['playerCount'], [d => d.playerCount, 10]],
    ['players: wrong entries', () => ({ players: [5, { name: 'A', notes: 5 }, { name: 7 }] }), ply,
        ['players[0]', 'players[1].notes', 'players[2].name'], [d => d.players, [{ name: 'A', notes: '' }, { name: 'Player' }]]],
    // Fix round 1 (F3)
    ['players: playerCount 2.5', () => ({ playerCount: 2.5, players: [] }), ply, ['playerCount'], [d => 'playerCount' in d, false]]
];
for (const [name, makeData, repairFn, expectedPaths, [readValue, expectedValue]] of cases) {
    const d = makeData();
    const paths = repairFn(d);
    check(`repair: ${name}`, { paths, value: readValue(d) }, { paths: expectedPaths, value: expectedValue });
}

// --- Number input rule (spec §6.2) ---
const inputCases = [
    ['5', '1', '10', 5], ['', '1', '10', null], ['0', '1', '10', null], ['11', '1', '10', null],
    ['2.5', '1', '10', null], ['abc', '0', '99', null], [' 7 ', '0', '99', 7], ['-3', '0', '', null],
    ['-3', '', '', -3], ['100', '0', '', 100]
];
for (const [value, min, max, expected] of inputCases) {
    check(`readIntegerInput('${value}', '${min}', '${max}')`, BestiaryCheck.readIntegerInput({ value, min, max }), expected);
}

// --- Compare of two threat records ---
{
    const record = fireWarrior();
    const reversed = {};
    for (const key of Object.keys(record).reverse()) reversed[key] = rt(record[key]);
    check('sameThreatData: keys in reverse order are the same', BestiaryCheck.sameThreatData(record, reversed), true);
    check('sameThreatData: another id is the same', BestiaryCheck.sameThreatData(record, { ...rt(record), id: 'custom_other' }), true);
    check('sameThreatData: wounds + 1 is different', BestiaryCheck.sameThreatData(record, { ...rt(record), wounds: record.wounds + 1 }), false);
    const nested = rt(record);
    const attributes = {};
    for (const key of Object.keys(record.attributes).reverse()) attributes[key] = record.attributes[key];
    nested.attributes = attributes;
    check('sameThreatData: a nested key order change is the same', BestiaryCheck.sameThreatData(record, nested), true);
    // Review of Task 1: the keys inside the items of a list are sorted too
    const itemKeys = rt(record);
    itemKeys.abilities = record.abilities.map(ability => {
        const out = {};
        for (const key of Object.keys(ability).reverse()) out[key] = rt(ability[key]);
        return out;
    });
    check('sameThreatData: a key order change inside the items of a list is the same',
        { items: itemKeys.abilities.length > 0, same: BestiaryCheck.sameThreatData(record, itemKeys) }, { items: true, same: true });
    // Fix round 1 (F3): the order of an array is part of the JSON
    check('sameThreatData: a list in another order is different',
        BestiaryCheck.sameThreatData(record, { ...rt(record), abilities: rt(record.abilities).reverse() }), false);
    // Fix round 1 (F4): an own __proto__ key is data, not the prototype
    check('sameThreatData: records that differ only under an own __proto__ key are different',
        BestiaryCheck.sameThreatData(JSON.parse('{"id":"a","__proto__":{"wounds":1}}'), JSON.parse('{"id":"a","__proto__":{"wounds":2}}')), false);
}

// --- Constants against the declared limits ---
{
    const html = readSource('bestiary/index.html');
    const threatsTab = readSource('bestiary/tabs/threats-tab.js');
    const builderTab = readSource('bestiary/tabs/threat-builder-tab.js');
    const encounterTab = readSource('bestiary/tabs/encounter-tab.js');
    const tagOf = (text, id) => (text.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`)) || [''])[0];
    const attr = (tag, name) => (tag.match(new RegExp(`\\b${name}="([^"]*)"`)) || [])[1];
    const players = tagOf(html, 'encounter-players');
    check('constants: #encounter-players declares the player count limits',
        [attr(players, 'min'), attr(players, 'max')], [String(BestiaryCheck.PLAYER_COUNT_MIN), String(BestiaryCheck.PLAYER_COUNT_MAX)]);
    check('constants: #builder-inject-count declares the add count limit', attr(tagOf(html, 'builder-inject-count'), 'max'), String(BestiaryCheck.ADD_COUNT_MAX));
    check('constants: #threat-add-quantity declares the add count limit', attr(tagOf(threatsTab, 'threat-add-quantity'), 'max'), String(BestiaryCheck.ADD_COUNT_MAX));
    check('constants: #inject-modal-count declares the add count limit', attr(tagOf(builderTab, 'inject-modal-count'), 'max'), String(BestiaryCheck.ADD_COUNT_MAX));
    check('constants: encounter-tab.js has 7 initiative inputs with the initiative limit',
        encounterTab.split(`min="0" max="${BestiaryCheck.INITIATIVE_MAX}"`).length - 1, 7);
    const tierSelect = (html.match(/<select id="encounter-tier"[\s\S]*?<\/select>/) || [''])[0];
    const tierRange = [];
    for (let t = BestiaryCheck.TIER_MIN; t <= BestiaryCheck.TIER_MAX; t++) tierRange.push(String(t));
    check('constants: #encounter-tier has one option for each tier', [...tierSelect.matchAll(/<option value="([^"]*)"/g)].map(m => m[1]), tierRange);

    // --- Cache ---
    check('cache: index.html has 17 ?v=97', html.split('?v=97').length - 1, 17);
    check('cache: index.html has 0 ?v=96', html.split('?v=96').length - 1, 0);
    const at = name => html.indexOf(`<script src="js/${name}?v=`);
    const checkTag = html.indexOf('<script src="js/bestiary-check.js?v=97"></script>');
    check('cache: the bestiary-check.js tag comes after data-loader.js and before encounter-state.js',
        checkTag > at('data-loader.js') && at('data-loader.js') !== -1 && checkTag < at('encounter-state.js'), true);
}

// The module writes no warning: the loader of a later task writes the one warning of spec §4.3 rule 8
check('no warning', warns, []);

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) FAILED.`);
process.exit(failures ? 1 : 0);
