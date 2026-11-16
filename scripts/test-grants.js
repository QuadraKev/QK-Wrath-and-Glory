// Tests for the reference-aware grants in creator/js/state.js: a granted power, discipline or talent
// goes only when no other current source grants it and the user did not select it (spec §6).
// Run: node scripts/test-grants.js

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
for (const f of ['species.json', 'archetypes.json', 'talents.json', 'weapons.json', 'armor.json', 'equipment.json',
    'psychic-powers.json', 'ascension-packages.json', 'backgrounds.json', 'weapon-upgrades.json',
    'injuries-corruption.json', 'keyword-categories.json', 'holy-relics.json', 'glossary.json', 'threats.json'])
    DATA[f] = readJson(`data/${f}`);

// Each console.warn call of the context, as one string.
const warns = [];
const ctx = vm.createContext({
    console: { log: console.log, error: console.error, info: console.info, warn: (...args) => { warns.push(args.join(' ')); } },
    document: { getElementById: () => null }, window: { api: {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setTimeout: () => 0, clearTimeout: () => {}
});
for (const f of ['data-loader.js', 'custom-wargear.js', 'character-check.js', 'state.js', 'xp-calculator.js',
    'derived-stats.js', 'prerequisite.js', 'keyword-bonus.js', 'followers.js', 'relic-wizard.js', 'improvised-builder.js'])
    vm.runInContext(readSource(`creator/js/${f}`), ctx, { filename: f });
const get = name => vm.runInContext(name, ctx);
const DL = get('DataLoader'), State = get('State'), XP = get('XPCalculator');
DL.cache = DATA;
State.init({});
State.setIgnorePrerequisites(true);

// A new character with the given tier, species and archetype, through the real setters.
function build(tier, archetypeId, speciesId = 'human') {
    State.newCharacter();
    State.setTier(String(tier));
    State.setAdditionalXP('2000');
    State.setSpecies(speciesId);
    if (archetypeId) State.setArchetype(archetypeId);
    return State.character;
}
const addPackage = (t, packageId) => State.setAscension(t, { type: 'package', packageId, archetypeId: null });
const clearSlot = t => State.setAscension(t, null);
const entryAt = t => State.character.ascensions.find(a => a.targetTier === t);
// [in psychicPowers, in freePowers]
const lists = id => [State.character.psychicPowers.includes(id), (State.character.freePowers || []).includes(id)];
const grantedPowers = t => entryAt(t)?.granted?.powers;

// --- A: the archetype's own Smite stays after the remove of a package that also grants it ---
build(2, 'wyrd_aoa');
addPackage(3, 'psychic_revelations');
clearSlot(3);
check('A: Wyrd plus and minus Psychic Revelations: smite is in psychicPowers and freePowers', lists('smite'), [true, true]);

// --- B: a chosen discipline stays after the remove of a package that unlocks it ---
build(2, 'sanctioned_psyker');
State.addDisciplineChoice('Runes of Fate');
addPackage(3, 'lost_seer_path_aoa');
check('B: unlockedDisciplines holds Runes of Fate once', State.character.unlockedDisciplines.filter(d => d === 'Runes of Fate').length, 1);
check('B: getUnlockedDisciplines holds Runes of Fate', State.getUnlockedDisciplines().includes('Runes of Fate'), true);
clearSlot(3);
check('B: after the clear, unlockedDisciplines still holds Runes of Fate', State.character.unlockedDisciplines.includes('Runes of Fate'), true);
check('B: after the clear, prescience is in neither list', lists('prescience'), [false, false]);
check('B: after the clear, scriers_gaze is in neither list', lists('scriers_gaze'), [false, false]);

// --- C: a package grant on a character that is not a psyker has a record and goes with the package ---
build(1, 'ganger');
addPackage(2, 'psychic_revelations');
check('C: the entry has granted.powers [smite]', grantedPowers(2), ['smite']);
clearSlot(2);
check('C: after the clear, smite is in neither list', lists('smite'), [false, false]);

// --- D: an archetype change releases the old grant and keeps a bought power ---
build(1, 'sanctioned_psyker');
State.addPower('chameleon');
State.setArchetype('ganger');
check('D: Sanctioned Psyker to Ganger: smite is in neither list', lists('smite'), [false, false]);
check('D: the bought chameleon stays paid', lists('chameleon'), [true, false]);

// --- F: a change to a different psyker archetype keeps a bought power and the shared grant ---
build(1, 'sanctioned_psyker');
State.addPower('chameleon');
State.setArchetype('wyrd_aoa');
check('F: Sanctioned Psyker to Wyrd: chameleon stays', State.character.psychicPowers.includes('chameleon'), true);
check('F: smite stays in both lists', lists('smite'), [true, true]);

// --- G: an ascension-granted talent goes only when no other package grants it ---
build(1, 'ganger');
addPackage(2, 'dauntless_reputation');
addPackage(3, 'dauntless_reputation');
const devotees = () => State.character.talents.filter(t => typeof t === 'object' && t.id === 'devotees' && t.ascensionGranted).length;
check('G: one devotees entry with ascensionGranted', devotees(), 1);
clearSlot(2);
check('G: after the clear of 2, devotees stays', devotees(), 1);
clearSlot(3);
check('G: after the clear of 3, devotees goes', devotees(), 0);

// --- H: the custom archetype ability releases its grant and keeps a bought power ---
build(1, null);
State.setCustomArchetype();
State.setCustomArchetypeAbility('sanctioned_psyker');
State.addPower('chameleon');
State.setCustomArchetypeAbility(null);
check('H: no ability: smite is in neither list', lists('smite'), [false, false]);
check('H: the bought chameleon stays', State.character.psychicPowers.includes('chameleon'), true);

// --- I: a species change clears the archetype and keeps a bought power ---
build(1, 'sanctioned_psyker');
State.addPower('chameleon');
State.setSpecies('ogryn');
check('I: Human to Ogryn: chameleon stays', State.character.psychicPowers.includes('chameleon'), true);
check('I: smite is in neither list', lists('smite'), [false, false]);

// --- J (P8, CC3): a free pick that the package also grants stays after the remove of the package ---
function buildJ() {
    build(1, 'farseer', 'aeldari');
    State.addFreePowerPick('prescience');
    addPackage(2, 'lost_seer_path_aoa');
}
buildJ();
check('J: the entry has granted.powers [scriers_gaze]', grantedPowers(2), ['scriers_gaze']);
clearSlot(2);
check('J: after the clear, prescience is in both lists', lists('prescience'), [true, true]);
check('J: after the clear, scriers_gaze is in neither list', lists('scriers_gaze'), [false, false]);

// --- K (adoption): a released archetype grant that a package also grants moves into the package record ---
build(2, 'wyrd_aoa');
addPackage(3, 'psychic_revelations');
check('K: the record of the package is empty', grantedPowers(3), []);
State.setArchetype('ganger');
check('K: Wyrd to Ganger: smite stays in both lists', lists('smite'), [true, true]);
check('K: the entry granted.powers holds smite', (grantedPowers(3) || []).includes('smite'), true);
clearSlot(3);
check('K: after the clear, smite is in neither list', lists('smite'), [false, false]);

// --- L (CC4): a free pick that no current slot covers stays as a paid power ---
build(1, 'sanctioned_psyker');
State.addFreePowerPick('chameleon');
State.setArchetype('ganger');
check('L: Sanctioned Psyker to Ganger: chameleon is paid', lists('chameleon'), [true, false]);
build(1, 'wyrd_aoa');
State.addFreePowerPick('chameleon');
State.setArchetype('sanctioned_psyker');
check('L: Wyrd to Sanctioned Psyker: chameleon stays free', lists('chameleon'), [true, true]);

// --- Q3: removePower also removes the id from the record ---
build(1, 'farseer', 'aeldari');
addPackage(2, 'lost_seer_path_aoa');
check('Q3: the record holds prescience and scriers_gaze', grantedPowers(2), ['prescience', 'scriers_gaze']);
State.removePower('prescience');
check('Q3: after removePower, the record holds scriers_gaze only', grantedPowers(2), ['scriers_gaze']);
check('Q3: after removePower, the freePowers record holds scriers_gaze only', entryAt(2)?.granted?.freePowers, ['scriers_gaze']);
State.addFreePowerPick('prescience');
clearSlot(2);
check('Q3: after the clear, prescience is in both lists', lists('prescience'), [true, true]);
check('Q3: after the clear, scriers_gaze is in neither list', lists('scriers_gaze'), [false, false]);

// --- the no-record rule: an entry from an old save ---
build(1, 'ganger');
State.character.ascensions = [{ targetTier: 2, type: 'package', packageId: 'psychic_revelations', archetypeId: null }];
State.character.psychicPowers = ['smite'];
State.character.freePowers = ['smite'];
clearSlot(2);
check('no record: after the clear, smite is in neither list', lists('smite'), [false, false]);

// --- fix round 1, F1: the release test, the release in setCustomArchetype and the apply of the kept ability ---
build(1, 'ganger');
check('F1: Ganger buys smite', State.addPower('smite'), true);
State.setArchetype('sanctioned_psyker');
State.setArchetype('ganger');
check('F1: a bought smite stays and stays paid after Sanctioned Psyker and Ganger', lists('smite'), [true, false]);
build(1, 'sanctioned_psyker');
State.setCustomArchetype();
check('F1: Sanctioned Psyker to Custom with no ability: smite is in neither list', lists('smite'), [false, false]);
build(1, null);
State.setCustomArchetype();
State.setCustomArchetypeAbility('sanctioned_psyker');
State.setArchetype('ganger');
State.setCustomArchetype();
check('F1: Custom (Sanctioned Psyker ability), Ganger, Custom: smite is in both lists', lists('smite'), [true, true]);

// --- fix round 1, F2: each change of source settles the free picks ---
build(1, 'sanctioned_psyker');
State.addFreePowerPick('chameleon');
State.setSpecies('ogryn');
check('F2 clearArchetype: Sanctioned Psyker, a pick of chameleon, Ogryn: chameleon is paid', lists('chameleon'), [true, false]);
build(1, 'sanctioned_psyker');
State.addFreePowerPick('chameleon');
State.setCustomArchetype();
check('F2 setCustomArchetype: Sanctioned Psyker, a pick of chameleon, Custom: chameleon is paid', lists('chameleon'), [true, false]);
build(1, null);
State.setCustomArchetype();
State.setCustomArchetypeAbility('sanctioned_psyker');
State.addFreePowerPick('chameleon');
State.setCustomArchetypeAbility(null);
check('F2 setCustomArchetypeAbility: a pick of chameleon, then no ability: chameleon is paid', lists('chameleon'), [true, false]);
build(1, 'ganger');
addPackage(2, 'psychic_revelations');
State.addFreePowerPick('chameleon');
clearSlot(2);
check('F2 setAscension: Ganger, Psychic Revelations, a pick of chameleon, clear: chameleon is paid', lists('chameleon'), [true, false]);

// --- fix round 1, F2 (S16): setAscension never copies a grant record from its argument ---
build(1, 'ganger');
const foreign = () => ({ powers: ['smite'], freePowers: ['smite'], talents: ['devotees'] });
State.setAscension(2, { type: 'package', packageId: null, archetypeId: null, granted: foreign() });
check('F2 S16: an empty package slot has no grant record', 'granted' in entryAt(2), false);
State.setAscension(2, { type: 'archetype', packageId: null, archetypeId: 'inquisitor', granted: foreign() });
check('F2 S16: an archetype ascension has no grant record', 'granted' in entryAt(2), false);
State.setAscension(2, { type: 'package', packageId: 'dauntless_reputation', archetypeId: null, granted: foreign() });
check('F2 S16: a package entry holds only its own record', entryAt(2).granted, { powers: [], freePowers: [], talents: ['devotees'] });

// --- fix round 1, F4 (TC5-2): ids that the data does not have ---
build(1, 'ganger');
addPackage(2, 'lost_seer_path_aoa');
check('F4: the Lost Seer record holds its powers', grantedPowers(2), ['prescience', 'scriers_gaze']);
entryAt(2).packageId = 'gone_package_x';
const powerXpBefore = XP.calculatePowerXP(State.character);
addPackage(3, 'dauntless_reputation');
check('F4: an unknown package: the power XP does not change', XP.calculatePowerXP(State.character), powerXpBefore);
check('F4: an unknown package: the recorded powers stay free', [lists('prescience'), lists('scriers_gaze')], [[true, true], [true, true]]);
build(1, 'sanctioned_psyker');
State.character.psychicPowers.push('gone_power_x');
State.character.freePowers.push('gone_power_x');
addPackage(2, 'dauntless_reputation');
check('F4: an unknown power id stays in freePowers after a new ascension', lists('gone_power_x'), [true, true]);

// --- round trip: the J character before the clear ---
buildJ();
const saved = JSON.parse(JSON.stringify(State.character));
warns.length = 0;
State.loadCharacter(JSON.parse(JSON.stringify(saved)));
check('round trip: the J character loads deep-equal', canon(JSON.parse(JSON.stringify(State.character))), canon(saved));
check('round trip: the J character writes no warning', warns, []);

console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
process.exit(failures ? 1 : 0);
