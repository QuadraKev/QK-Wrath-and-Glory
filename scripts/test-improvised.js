// Tests for the Improvised Weaponry feature (issue #29): the two weapon records, the talent's
// profiles field, the pure resolver in creator/js/improvised-builder.js, the State mutators,
// and the Holy Relic base-item exclusion.
// Run: node scripts/test-improvised.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

let failures = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// --- data: both JSON files parse, the records and the profiles field exist ---
const weapons = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/weapons.json'), 'utf8'));
const talents = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/talents.json'), 'utf8'));
const melee = weapons.find(w => w.id === 'improvised_melee_weapon');
const firearm = weapons.find(w => w.id === 'improvised_simple_firearm');
const talent = talents.find(t => t.id === 'improvised_weaponry');

check('improvised_melee_weapon exists', !!melee, true);
check('improvised_simple_firearm exists', !!firearm, true);
check('weapon ids stay unique', new Set(weapons.map(w => w.id)).size, weapons.length);

check('melee name', melee.name, 'Improvised Melee Weapon');
check('melee type', melee.type, 'melee');
check('melee damage is (S) +2', melee.damage, { base: 2, attribute: 'strength', bonus: 0 });
check('melee ED 2', melee.ed, 2);
check('melee AP none', melee.ap, 0);
check('melee has no range', melee.range, undefined);
check('melee has no salvo', melee.salvo, undefined);
check('melee traits', melee.traits, ['Unwieldy (2)']);
check('melee keywords empty', melee.keywords, []);
check('melee value', melee.value, '-');
check('melee rarity', melee.rarity, '-');
check('melee source/page', [melee.source, melee.page], ['redacted1', 65]);

check('firearm name', firearm.name, 'Improvised Simple Firearm');
check('firearm type', firearm.type, 'ranged');
check('firearm damage 6', firearm.damage, { base: 6, attribute: null, bonus: 0 });
check('firearm ED 1', firearm.ed, 1);
check('firearm AP none', firearm.ap, 0);
check('firearm range 6/12/18', firearm.range, { short: 6, medium: 12, long: 18 });
check('firearm salvo none', firearm.salvo, '-');
check('firearm traits', firearm.traits, ['Unwieldy (2)']);
check('firearm keywords empty', firearm.keywords, []);
check('firearm value', firearm.value, '-');
check('firearm rarity', firearm.rarity, '-');
check('firearm source/page', [firearm.source, firearm.page], ['redacted1', 65]);

check('talent has the profiles field', talent.profiles, ['improvised_melee_weapon', 'improvised_simple_firearm']);
check('talent effect text is untouched', talent.effect.startsWith('You may make a Survival (Wil) or Tech (Int) Test'), true);

// --- resolver: creator/js/improvised-builder.js loads without a DOM ---
const sandbox = { console };
vm.createContext(sandbox);
const builderSource = fs.readFileSync(path.join(ROOT, 'creator/js/improvised-builder.js'), 'utf8');
const ImprovisedBuilder = vm.runInContext(builderSource + '\n;ImprovisedBuilder;', sandbox);
const R = (entry, base, rank) => JSON.parse(JSON.stringify(ImprovisedBuilder.resolve(entry, base, rank)));

const blank = { name: '', details: '', halfTime: 0, damageRank: false, removeUnwieldy: false, traits: [], doubleRange: false };
const opts = (o) => ({ id: 'x', isStarting: false, improvised: { ...blank, ...o } });

const plainMelee = R({ id: 'improvised_melee_weapon', isStarting: false }, melee, 3);
check('no overlay returns the base name', plainMelee.name, melee.name);
check('no overlay returns the base damage', plainMelee.damage, melee.damage);
check('no overlay returns the base traits', plainMelee.traits, melee.traits);

const noOpts = R(opts({}), firearm, 3);
check('no options keep the base damage', noOpts.damage, firearm.damage);
check('no options keep the base traits', noOpts.traits, firearm.traits);
check('no options keep the base range', noOpts.range, firearm.range);
check('an empty name keeps the base name', noOpts.name, firearm.name);

// name stays the base name (talents match weapon names); the custom name lives in improvised.name
check('a custom name leaves name as the base name', R(opts({ name: 'Pipe Gun' }), firearm, 1).name, firearm.name);
check('the custom name is exposed through improvised.name', R(opts({ name: 'Pipe Gun' }), firearm, 1).improvised.name, 'Pipe Gun');
check('the base name is kept as baseName', R(opts({ name: 'Pipe Gun' }), firearm, 1).baseName, firearm.name);

check('damage +Rank adds the rank to the bonus', R(opts({ damageRank: true }), melee, 3).damage, { base: 2, attribute: 'strength', bonus: 3 });
check('damage +Rank uses the rank passed in', R(opts({ damageRank: true }), firearm, 2).damage.bonus, 2);
check('damage +Rank off leaves the bonus at 0', R(opts({ damageRank: false }), firearm, 4).damage.bonus, 0);

check('remove Unwieldy drops exactly that trait', R(opts({ removeUnwieldy: true }), melee, 1).traits, []);
check('remove Unwieldy keeps added traits',
    R(opts({ removeUnwieldy: true, traits: ['Parry'] }), melee, 1).traits, ['Parry']);

check('added traits appear once each in book order',
    R(opts({ traits: ['Silent', 'Parry', 'Inflict (On Fire)', 'Parry'] }), melee, 1).traits,
    ['Unwieldy (2)', 'Inflict (On Fire)', 'Parry', 'Silent']);
check('all six traits in book order',
    R(opts({ traits: ['Pistol', 'Silent', 'Parry', 'Inflict (Restrained)', 'Inflict (Poisoned 3)', 'Inflict (On Fire)'] }), firearm, 1).traits,
    ['Unwieldy (2)', 'Inflict (On Fire)', 'Inflict (Poisoned 3)', 'Inflict (Restrained)', 'Parry', 'Pistol', 'Silent']);
check('an unknown trait is ignored', R(opts({ traits: ['Brutal'] }), melee, 1).traits, ['Unwieldy (2)']);

check('double ranges gives 12/24/36 for the firearm', R(opts({ doubleRange: true }), firearm, 1).range, { short: 12, medium: 24, long: 36 });
// A melee-type record that has a range object, so only the type guard keeps the range unchanged
const rangedMelee = { ...melee, range: { short: 4, medium: 8, long: 12 } };
check('double ranges leaves a melee record\'s range alone', R(opts({ doubleRange: true }), rangedMelee, 1).range, { short: 4, medium: 8, long: 12 });

// The resolver must not mutate the base record
ImprovisedBuilder.resolve(opts({ damageRank: true, removeUnwieldy: true, traits: ['Parry'], doubleRange: true }), firearm, 5);
check('the base damage is not mutated', firearm.damage, { base: 6, attribute: null, bonus: 0 });
check('the base traits are not mutated', firearm.traits, ['Unwieldy (2)']);
check('the base range is not mutated', firearm.range, { short: 6, medium: 12, long: 18 });

check('resolve with no base record returns null', ImprovisedBuilder.resolve(opts({}), null, 1), null);

// --- Shift count: halfTime + each flag + trait count ---
check('shiftCount of nothing is 0', ImprovisedBuilder.shiftCount(blank), 0);
check('shiftCount sums every option', ImprovisedBuilder.shiftCount({
    ...blank, halfTime: 2, damageRank: true, removeUnwieldy: true, traits: ['Parry', 'Silent'], doubleRange: true }), 7);
check('shiftCount of a missing overlay is 0', ImprovisedBuilder.shiftCount(undefined), 0);

// --- crafting time halves from 8 minutes ---
check('crafting time steps', [0, 1, 2, 3, 4, 5, 6].map(n => ImprovisedBuilder.craftingTime(n)),
    ['8 min', '4 min', '2 min', '1 min', '30 sec', '15 sec', '7.5 sec']);

// --- builder melee guards: Double Ranges is a Simple Firearm option only ---
ImprovisedBuilder.form = { ...blank, editIndex: null, baseId: 'improvised_melee_weapon', name: 'Shiv', doubleRange: true };
check('buildOverlay drops Double Ranges for the melee profile', ImprovisedBuilder.buildOverlay().doubleRange, false);

// selectProfile ends in a DOM re-render; stub it and DataLoader so the guard runs without a DOM
sandbox.DataLoader = { getWeapon: id => weapons.find(w => w.id === id) };
ImprovisedBuilder.render = () => {};
ImprovisedBuilder.form = { ...blank, editIndex: null, baseId: 'improvised_simple_firearm', name: 'Pipe Gun', doubleRange: true };
ImprovisedBuilder.selectProfile('improvised_melee_weapon');
check('switching to the melee profile clears Double Ranges', ImprovisedBuilder.form.doubleRange, false);

// --- State mutators ---
const stateStore = {};
const stateSandbox = {
    console,
    localStorage: {
        getItem: k => (k in stateStore ? stateStore[k] : null),
        setItem: (k, v) => { stateStore[k] = String(v); },
        removeItem: k => { delete stateStore[k]; }
    },
    setTimeout: () => 0,
    clearTimeout: () => {}
};
vm.createContext(stateSandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'creator/js/followers.js'), 'utf8'), stateSandbox);
const State = vm.runInContext(fs.readFileSync(path.join(ROOT, 'creator/js/state.js'), 'utf8') + '\n;State;', stateSandbox);
const notified = [];
State.notifyListeners = (type) => notified.push(type);

State.character = { wargear: [] };
const overlay = { ...blank, name: 'Shiv', traits: ['Parry'] };
State.addImprovisedWargear({ id: 'improvised_melee_weapon', improvised: overlay });
check('addImprovisedWargear pushes a normal wargear entry', JSON.parse(JSON.stringify(State.character.wargear[0])),
    { id: 'improvised_melee_weapon', isStarting: false, improvised: overlay });
check('addImprovisedWargear notifies wargear', notified.pop(), 'wargear');

State.character.wargear[0].upgrades = ['some_upgrade'];
State.updateImprovisedWargear(0, { id: 'improvised_melee_weapon', improvised: { ...overlay, name: 'Big Shiv' } });
check('an edit with the same base id keeps upgrades', State.character.wargear[0].upgrades, ['some_upgrade']);
check('an edit replaces the overlay', State.character.wargear[0].improvised.name, 'Big Shiv');
check('updateImprovisedWargear notifies wargear', notified.pop(), 'wargear');

State.updateImprovisedWargear(0, { id: 'improvised_simple_firearm', improvised: overlay });
check('an edit that changes the base id sets the id', State.character.wargear[0].id, 'improvised_simple_firearm');
check('an edit that changes the base id resets upgrades', State.character.wargear[0].upgrades, []);

State.updateImprovisedWargear(5, { id: 'improvised_melee_weapon', improvised: overlay });
check('an out-of-range edit is a no-op', State.character.wargear.length, 1);

// --- Holy Relic base-item list excludes improvised ids ---
const relicSandbox = { console, State: { isSourceEnabled: () => true } };
vm.createContext(relicSandbox);
const RelicWizard = vm.runInContext(fs.readFileSync(path.join(ROOT, 'creator/js/relic-wizard.js'), 'utf8') + '\n;RelicWizard;', relicSandbox);
check('relic wizard rejects the improvised melee weapon', RelicWizard.isEligible(melee), false);
check('relic wizard rejects the improvised firearm', RelicWizard.isEligible(firearm), false);
check('relic wizard still accepts a knife', RelicWizard.isEligible(weapons.find(w => w.id === 'knife')), true);

// --- Markdown export prints the custom name, the base name and the options for an improvised weapon ---
const anyFn = new Proxy({}, { get: () => () => ({}) });
const ioSandbox = {
    console, ImprovisedBuilder, DerivedStats: anyFn, PrerequisiteChecker: { getCharacterKeywords: () => [] },
    DataLoader: { getSpecies: () => null, getArchetype: () => null, getWargearItem: id => weapons.find(w => w.id === id) }
};
vm.createContext(ioSandbox);
const CharacterIO = vm.runInContext(fs.readFileSync(path.join(ROOT, 'creator/js/character-io.js'), 'utf8') + '\n;CharacterIO;', ioSandbox);
const exportText = CharacterIO.createCharacterSheet({
    rank: 2, attributes: {}, skills: {}, talents: [], psychicPowers: [],
    wargear: [{ id: 'improvised_melee_weapon', improvised: { name: 'Table Leg', details: 'Snapped off', halfTime: 1, damageRank: true, removeUnwieldy: false, traits: [], doubleRange: false } }]
});
check('export line has the custom name and base name', exportText.includes('- Table Leg (Improvised — Improvised Melee Weapon)'), true);
check('export has the stat line, options and details', ['Damage (S) +4', 'Shifts: 2', 'Snapped off'].every(s => exportText.includes(s)), true);

const twoLineText = CharacterIO.createCharacterSheet({
    rank: 1, attributes: {}, skills: {}, talents: [], psychicPowers: [],
    wargear: [{ id: 'improvised_melee_weapon', improvised: { ...blank, name: 'Table Leg', details: 'Snapped off\nWrapped in wire' } }]
});
check('export indents every line of two-line details',
    twoLineText.split('\n').filter(l => l.includes('Snapped off') || l.includes('Wrapped in wire')),
    ['    Snapped off', '    Wrapped in wire']);

// --- displayName prints the base name once when the custom name matches it ---
check('displayName prints the base name once when the names are equal',
    ImprovisedBuilder.displayName('Improvised Melee Weapon', 'Improvised Melee Weapon'), 'Improvised Melee Weapon');
check('displayName prints custom (base) when the names differ',
    ImprovisedBuilder.displayName('Table Leg', 'Improvised Melee Weapon'), 'Table Leg (Improvised Melee Weapon)');

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
