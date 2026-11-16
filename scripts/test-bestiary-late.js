// Tests for the late findings of the bug pass of the bestiary app (Task 10):
// the place of a moved entry, the picker index of the builder, the safe-integer rule of
// readIntegerInput and the "Skill of your choice" text of the Compendium.
// Run: node scripts/test-bestiary-late.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const readSource = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let failures = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// Runs one group of checks. A throw is one FAIL, so that the other groups still run.
function group(name, fn) {
    try {
        fn();
    } catch (e) {
        failures++;
        console.log(`FAIL  ${name}: threw ${e && e.message}`);
    }
}

// The state files schedule an autosave with setTimeout, so the context stubs the timers and the storage.
function makeContext() {
    const store = {};
    const sandbox = {
        console: { log() {}, warn() {}, error: console.error },
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
    for (const rel of ['bestiary/js/data-loader.js', 'bestiary/js/bestiary-check.js', 'bestiary/js/encounter-state.js',
        'bestiary/js/threat-builder-state.js', 'bestiary/tabs/references-tab.js', 'bestiary/tabs/vehicles-tab.js',
        'bestiary/tabs/encounter-tab.js']) load(rel);
    const get = (name) => vm.runInContext(name, sandbox);
    const ctx = {
        DataLoader: get('DataLoader'), BestiaryCheck: get('BestiaryCheck'), EncounterState: get('EncounterState'),
        ThreatBuilderState: get('ThreatBuilderState'), ReferencesTab: get('ReferencesTab'),
        VehiclesTab: get('VehiclesTab'), EncounterTab: get('EncounterTab'), sandbox
    };
    ctx.DataLoader.cache['threats.json'] = readJson('data/threats.json');
    ctx.DataLoader.cache['vehicles.json'] = readJson('data/vehicles.json');
    ctx.DataLoader.cache['threat-weapons.json'] = readJson('data/threat-weapons.json');
    return ctx;
}

const { DataLoader, BestiaryCheck, EncounterState, ThreatBuilderState, ReferencesTab, VehiclesTab, EncounterTab, sandbox } = makeContext();

// ----- Item 1 (TB10-1): the index that the drag gives is the number of list entries before the placeholder -----
// The caller counts the hidden original of the dragged entry too, so the index runs from 0 to the list length.
const mkEnc = (o = {}) => Object.assign({
    version: 1, settings: { tier: 1, playerCount: 4, name: 'x', round: 1 },
    individuals: [], mobs: [], playerCharacters: [], vehicles: [], encounterOrder: null, customThreats: []
}, o);
const players = (n) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'Pl' + i, initiative: null, notes: '' }));
const shown = () => EncounterState.getEncounterListItems().map(i => i.id);

group('move: 4 visible entries, each start and each place', () => {
    const base = ['p0', 'p1', 'p2', 'p3'];
    const diffs = [];
    for (let from = 0; from < 4; from++) {
        for (let place = 0; place <= 4; place++) {
            EncounterState.loadFromData(mkEnc({ playerCharacters: players(4) }));
            EncounterState.encounterOrder = base.map(id => ({ type: 'player', id }));
            EncounterState.moveItemInOrder('player', base[from], place);
            const want = base.filter((_, k) => k !== from);
            want.splice(place <= from ? place : place - 1, 0, base[from]);
            if (JSON.stringify(shown()) !== JSON.stringify(want)) diffs.push({ from, place, got: shown(), want });
        }
    }
    check('move: each of the 20 moves (16 different results) gives the expected order', diffs, []);
});

group('move: the last place puts the entry at the end', () => {
    EncounterState.loadFromData(mkEnc({ playerCharacters: players(3) }));
    EncounterState.encounterOrder = ['p0', 'p1', 'p2'].map(id => ({ type: 'player', id }));
    EncounterState.moveItemInOrder('player', 'p0', 3);
    check('move: p0 to place 3 of 3 gives p1 p2 p0', shown(), ['p1', 'p2', 'p0']);
});

group('move: two hidden players between the visible entries', () => {
    const stored = ['p0', 'p4', 'p1', 'p2', 'p5', 'p3'];
    const visible = ['p0', 'p1', 'p2', 'p3'];
    const diffs = [];
    for (let from = 0; from < 4; from++) {
        for (let place = 0; place <= 4; place++) {
            EncounterState.loadFromData(mkEnc({ playerCharacters: players(6) }));
            EncounterState.encounterOrder = stored.map(id => ({ type: 'player', id }));
            EncounterState.moveItemInOrder('player', visible[from], place);
            const want = visible.filter((_, k) => k !== from);
            want.splice(place <= from ? place : place - 1, 0, visible[from]);
            const order = EncounterState.encounterOrder.map(e => e.id);
            const hidden = order.filter(id => id === 'p4' || id === 'p5');
            const ok = JSON.stringify(shown()) === JSON.stringify(want)
                && JSON.stringify(hidden) === JSON.stringify(['p4', 'p5'])
                && order.length === 6;
            if (!ok) diffs.push({ from, place, got: shown(), hidden, length: order.length, want });
        }
    }
    check('move: with hidden entries the visible order is the expected one and the hidden entries keep their order', diffs, []);
});

group('move: a move to the own place changes nothing', () => {
    const diffs = [];
    for (const stored of [['p0', 'p1', 'p2', 'p3'], ['p0', 'p4', 'p1', 'p2', 'p5', 'p3']]) {
        const visible = stored.filter(id => id !== 'p4' && id !== 'p5');
        for (let from = 0; from < 4; from++) {
            for (const place of [from, from + 1]) {
                EncounterState.loadFromData(mkEnc({ playerCharacters: players(stored.length) }));
                EncounterState.encounterOrder = stored.map(id => ({ type: 'player', id }));
                const before = JSON.parse(JSON.stringify(EncounterState.encounterOrder));
                EncounterState.moveItemInOrder('player', visible[from], place);
                if (JSON.stringify(EncounterState.encounterOrder) !== JSON.stringify(before)) {
                    diffs.push({ stored: stored.length, from, place, got: EncounterState.encounterOrder.map(e => e.id) });
                }
            }
        }
    }
    check('move: from i to place i or i+1 leaves encounterOrder equal', diffs, []);
});

group('move: shown entries that are not stored (TB10-8)', () => {
    // Seven players, count 5: p5 and p6 are hidden. The stored order holds p0 p1 p2 and the hidden ones.
    // p3 and p4 are shown after the stored entries and have no stored entry.
    const stored = ['p0', 'p5', 'p1', 'p2', 'p6'];
    const visible = ['p0', 'p1', 'p2', 'p3', 'p4'];
    // mode 'none': no hidden player. 'stored': p5 and p6 are hidden and stored. 'unstored': p5 and p6 are hidden and have no stored entry (TB10-10).
    const setup = (mode) => {
        EncounterState.loadFromData(mkEnc({ settings: { tier: 1, playerCount: 5, name: 'x', round: 1 }, playerCharacters: players(mode === 'none' ? 5 : 7) }));
        EncounterState.encounterOrder = (mode === 'stored' ? stored : ['p0', 'p1', 'p2']).map(id => ({ type: 'player', id }));
    };
    for (const mode of ['none', 'stored', 'unstored']) {
        const withHidden = mode !== 'none';
        const tag = { none: 'no hidden player', stored: 'with hidden players', unstored: 'with hidden players that have no stored entry' }[mode];
        const before0 = mode === 'stored' ? 5 : 3;
        const full = mode === 'none' ? 5 : 7;
        setup(mode);
        check(`unstored: ${tag}, the list shows p0 p1 p2 p3 p4 before the move`, shown(), visible);
        const diffs = [];
        for (let from = 0; from < 5; from++) {
            for (let place = 0; place <= 5; place++) {
                setup(mode);
                EncounterState.moveItemInOrder('player', visible[from], place);
                const want = visible.filter((_, k) => k !== from);
                want.splice(place <= from ? place : place - 1, 0, visible[from]);
                const order = EncounterState.encounterOrder.map(e => e.id);
                const own = place === from || place === from + 1;
                // An own-place drop changes nothing. Any other move stores each shown entry one time, in the shown order.
                const storedShown = order.filter(id => visible.includes(id));
                const ok = JSON.stringify(shown()) === JSON.stringify(want)
                    && (own ? order.length === before0 : JSON.stringify(storedShown) === JSON.stringify(want) && order.length === full)
                    && new Set(order).size === order.length
                    && (!withHidden || own && mode === 'unstored' || JSON.stringify(order.filter(id => id === 'p5' || id === 'p6')) === JSON.stringify(['p5', 'p6']));
                if (!ok) diffs.push({ from, place, got: shown(), order, want });
            }
        }
        check(`unstored: ${tag}, each of the 30 moves lands at the place and stores each entry once, in the shown order`, diffs, []);
        setup(mode);
        EncounterState.moveItemInOrder('player', 'p0', 5);
        check(`unstored: ${tag}, a stored entry dropped at the end lands last`, shown(), ['p1', 'p2', 'p3', 'p4', 'p0']);
        setup(mode);
        EncounterState.moveItemInOrder('player', 'p0', 4);
        check(`unstored: ${tag}, a stored entry dropped between the two unstored entries lands between them`, shown(), ['p1', 'p2', 'p3', 'p0', 'p4']);
        setup(mode);
        EncounterState.moveItemInOrder('player', 'p4', 0);
        check(`unstored: ${tag}, an unstored entry dragged to the top lands first`, shown(), ['p4', 'p0', 'p1', 'p2', 'p3']);
        setup(mode);
        const before = JSON.stringify(EncounterState.encounterOrder);
        EncounterState.moveItemInOrder('player', 'p2', 2);
        EncounterState.moveItemInOrder('player', 'p2', 3);
        check(`unstored: ${tag}, an own-place drop leaves encounterOrder equal and adds no entry`, JSON.stringify(EncounterState.encounterOrder), before);
    }
});

group('move: a hidden player with no stored entry keeps its place (TB10-10)', () => {
    // Count 8: the list shows p0 to p6, ORK9, p7, CUL3. ORK9, p7 and CUL3 have no stored entry (initiative 9, 5, 3).
    const setup = () => {
        EncounterState.loadFromData(mkEnc({ settings: { tier: 1, playerCount: 8, name: 'x', round: 1 }, playerCharacters: players(8) }));
        const [ork] = EncounterState.addIndividual('sly_marbo_aaa', 1);
        const [cul] = EncounterState.addIndividual('sly_marbo_aaa', 1);
        EncounterState.setInitiative(ork, '9');
        EncounterState.setPlayerCharacterInitiative('p7', '5');
        EncounterState.setInitiative(cul, '3');
        EncounterState.encounterOrder = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map(id => ({ type: 'player', id }));
        return { ork, cul };
    };
    const names = (ids, ork, cul) => ids.map(id => (id === ork ? 'ORK9' : id === cul ? 'CUL3' : id));
    let { ork, cul } = setup();
    check('hidden unstored: the list shows p0 to p6, ORK9, p7, CUL3 at the count 8',
        names(shown(), ork, cul), ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'ORK9', 'p7', 'CUL3']);
    EncounterState.updateSettings({ playerCount: 5 });
    check('hidden unstored: at the count 5 the list shows p0 to p4, ORK9, CUL3',
        names(shown(), ork, cul), ['p0', 'p1', 'p2', 'p3', 'p4', 'ORK9', 'CUL3']);
    EncounterState.moveItemInOrder('player', 'p0', 7);
    check('hidden unstored: after the drag of p0 to the end the list shows p1 to p4, ORK9, CUL3, p0',
        names(shown(), ork, cul), ['p1', 'p2', 'p3', 'p4', 'ORK9', 'CUL3', 'p0']);
    const order = EncounterState.encounterOrder.map(e => e.id);
    check('hidden unstored: encounterOrder holds each entry, shown or hidden, one time', { length: order.length, unique: new Set(order).size }, { length: 10, unique: 10 });
    EncounterState.updateSettings({ playerCount: 8 });
    check('hidden unstored: at the count 8 the list shows p1 to p6, ORK9, p7, CUL3, p0',
        names(shown(), ork, cul), ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'ORK9', 'p7', 'CUL3', 'p0']);
    // An own-place drop adds no entry.
    ({ ork, cul } = setup());
    EncounterState.updateSettings({ playerCount: 5 });
    const before = JSON.stringify(EncounterState.encounterOrder);
    EncounterState.moveItemInOrder('player', 'p2', 2);
    check('hidden unstored: an own-place drop adds no entry', JSON.stringify(EncounterState.encounterOrder), before);
});

group('move: the own-place drop marks the state dirty', () => {
    EncounterState.loadFromData(mkEnc({ playerCharacters: players(3) }));
    EncounterState.encounterOrder = ['p0', 'p1', 'p2'].map(id => ({ type: 'player', id }));
    const original = EncounterState.markDirty;
    let calls = 0;
    EncounterState.markDirty = function () { calls++; return original.apply(this, arguments); };
    EncounterState.moveItemInOrder('player', 'p1', 1);
    EncounterState.markDirty = original;
    check('move: an own-place drop calls markDirty one time', calls, 1);
});

// ----- Item 2 (TB10-2): the picker index follows a change of the threat set -----
group('picker index', () => {
    const late = {
        id: 'custom_late_probe', name: 'Late Probe', source: 'x', page: '-',
        abilities: [{ type: 'ACTION', name: 'Zzz Late Ability', description: 'Late ability text.' }],
        bonuses: [{ name: 'Zzz Late Bonus', description: 'Late bonus text.' }]
    };
    const hasAbility = () => ThreatBuilderState.getAbilitiesByType('ACTION').some(e => e.ability.name === 'Zzz Late Ability');
    const hasBonus = () => ThreatBuilderState.getAllBonuses().some(e => e.bonus.name === 'Zzz Late Bonus');
    ThreatBuilderState._abilityIndex = null;
    ThreatBuilderState._bonusIndex = null;
    check('picker: before the load, no list holds the new names', { ability: hasAbility(), bonus: hasBonus() }, { ability: false, bonus: false });
    const indexOne = ThreatBuilderState._abilityIndex;
    const bonusOne = ThreatBuilderState._bonusIndex;
    ThreatBuilderState.getAbilitiesByType('ACTION');
    ThreatBuilderState.getAllBonuses();
    check('picker: with no change, the index objects stay the same',
        { ability: ThreatBuilderState._abilityIndex === indexOne, bonus: ThreatBuilderState._bonusIndex === bonusOne }, { ability: true, bonus: true });
    DataLoader.injectThreat(late);
    check('picker: after the load of a threat, the lists hold the new ability and bonus', { ability: hasAbility(), bonus: hasBonus() }, { ability: true, bonus: true });
    const indexTwo = ThreatBuilderState._abilityIndex;
    hasAbility();
    check('picker: after the rebuild, the index stays the same until the next change', ThreatBuilderState._abilityIndex === indexTwo, true);
    const changed = JSON.parse(JSON.stringify(late));
    changed.abilities[0].description = 'Second text of the ability.';
    changed.bonuses[0].description = 'Second text of the bonus.';
    DataLoader.injectThreat(changed);
    check('picker: after a second load with the same id and other data, the lists show the new texts', {
        ability: ThreatBuilderState.getAbilitiesByType('ACTION').filter(e => e.ability.name === 'Zzz Late Ability').map(e => e.ability.description),
        bonus: ThreatBuilderState.getAllBonuses().filter(e => e.bonus.name === 'Zzz Late Bonus').map(e => e.bonus.description)
    }, { ability: ['Second text of the ability.'], bonus: ['Second text of the bonus.'] });
    DataLoader.removeThreat('custom_late_probe');
    check('picker: after the delete of the threat, the lists do not hold them', { ability: hasAbility(), bonus: hasBonus() }, { ability: false, bonus: false });
});

// ----- Item 3 (TB10-3): readIntegerInput refuses a number that is not a safe integer -----
group('readIntegerInput', () => {
    const modes = [['both', '0', '99'], ['min only', '0', ''], ['max only', '', '99'], ['none', '', '']];
    const big = [['22 digits', '1234567890123456789012'], ['9007199254740993', '9007199254740993'], ['1e21', '1e21']];
    for (const [modeName, min, max] of modes) {
        for (const [label, value] of big) {
            // The range of the box must hold the value, so a limit is not the reason for the refusal.
            const wide = { value, min: min === '' ? '' : min, max: max === '' ? '' : '9999999999999999999999999' };
            check(`readIntegerInput: ${label} is refused (${modeName})`, BestiaryCheck.readIntegerInput(wide), null);
        }
    }
    check('readIntegerInput: 9007199254740991 inside a range that holds it is accepted',
        BestiaryCheck.readIntegerInput({ value: '9007199254740991', min: '0', max: '9007199254740991' }), 9007199254740991);
    check('readIntegerInput: 9007199254740991 with no limit is accepted',
        BestiaryCheck.readIntegerInput({ value: '9007199254740991', min: '', max: '' }), 9007199254740991);
    check('readIntegerInput: -9007199254740993 is refused', BestiaryCheck.readIntegerInput({ value: '-9007199254740993', min: '', max: '' }), null);
    check('readIntegerInput: a legal value still passes', BestiaryCheck.readIntegerInput({ value: '12', min: '0', max: '99' }), 12);
});

// ----- Item 4 (TB10-4): the Compendium prints "Skill of your choice" -----
group('compendium skill bonus', () => {
    const archetypes = readJson('data/archetypes.json');
    const bonusLine = (html) => {
        const m = html.match(/<span class="ref-label">Skill Bonuses:<\/span> ([^<]*)<\/div>/);
        return m ? m[1] : null;
    };
    const inquisitor = archetypes.find(a => a.id === 'inquisitor');
    const html = ReferencesTab.renderArchetypeBody(inquisitor);
    check('compendium: the Inquisitor line holds "Skill of your choice +4" twice and no "Choice1"',
        { line: bonusLine(html), choice1: html.includes('Choice1') }, { line: 'Skill of your choice +4, Skill of your choice +4', choice1: false });
    const single = archetypes.find(a => a.skillBonus && Object.keys(a.skillBonus).some(k => /^choice\d*$/.test(k)) && a.id !== 'inquisitor');
    check('compendium: an entry with the key "choice" prints "Skill of your choice +2"',
        single ? bonusLine(ReferencesTab.renderArchetypeBody(single)) : null, 'Skill of your choice +2');
    // The expression of the line before the change
    const oldParts = (bonus) => Object.entries(bonus).map(([skill, val]) => `${skill.charAt(0).toUpperCase() + skill.slice(1)} +${val}`).join(', ');
    const diffs = [];
    let count = 0;
    for (const a of archetypes) {
        if (!a.skillBonus || Object.keys(a.skillBonus).length === 0) continue;
        if (Object.keys(a.skillBonus).some(k => /^choice\d*$/.test(k))) continue;
        count++;
        if (bonusLine(ReferencesTab.renderArchetypeBody(a)) !== oldParts(a.skillBonus)) diffs.push(a.id);
    }
    check('compendium: each entry with normal skills prints the old text', { diffs, some: count > 0 }, { diffs: [], some: true });
});

// ----- Item 6 (TB10-6): a range band that is null prints "-" -----
group('range bands', () => {
    const WEAPONS = readJson('data/weapons.json');
    const oldText = (r) => `${r.short}/${r.medium}/${r.long}`;
    const gun = (range) => ({ id: 'late_gun', name: 'Late Gun', type: 'ranged', category: 'Pistols', damage: { base: 4, bonus: 0 }, ed: 1, ap: 0, range, traits: [] });
    const nullBand = { short: 6, medium: null, long: null };

    // Site 1: the wargear weapon of the data loader
    const wargear = (range) => DataLoader.normalizeWargearWeapon(gun(range)).range;
    check('range: normalizeWargearWeapon with two null bands gives 6/-/-', wargear(nullBand), '6/-/-');
    check('range: normalizeWargearWeapon with three numbers gives the old text', wargear({ short: 6, medium: 12, long: 24 }), '6/12/24');
    check('range: normalizeWargearWeapon prints 0 as 0', wargear({ short: 0, medium: null, long: 5 }), '0/-/5');
    const diffs = [];
    let numbered = 0;
    for (const w of WEAPONS) {
        if (!w.range || typeof w.range !== 'object') continue;
        if (w.range.short == null || w.range.medium == null || w.range.long == null) continue;
        numbered++;
        if (DataLoader.normalizeWargearWeapon(w).range !== oldText(w.range)) diffs.push(w.id);
    }
    check('range: for each weapon of the data with three numbers, the text is the old text', { diffs, some: numbered > 400 }, { diffs: [], some: true });
    const real = WEAPONS.filter(w => w.range && typeof w.range === 'object' && (w.range.short == null || w.range.medium == null || w.range.long == null));
    check('range: the four real weapons with a null band print no "null"',
        real.map(w => DataLoader.normalizeWargearWeapon(w).range).some(t => t.includes('null')), false);

    // Each site runs over the four real null-band weapons, over a band of 0 and over three numbers.
    const fmt = (r) => [r.short, r.medium, r.long].map(b => (b == null ? '-' : b)).join('/');
    const ranges = [...real.map(w => w.range), { short: 0, medium: 0, long: 0 }, { short: 0, medium: null, long: 5 }, { short: 6, medium: 12, long: 24 }];
    const saved = DataLoader.cache['weapons.json'];
    const sites = {
        wargear: (r) => DataLoader.normalizeWargearWeapon(gun(r)).range,
        launcher: (r) => DataLoader.normalizeLauncherWithAmmo(gun(r), { damage: { base: 5, bonus: 0 }, ed: 2, ap: -1, traits: [] }).range,
        formatRange: (r) => VehiclesTab.formatRange(r),
        card: (r) => (EncounterTab.renderWeaponPickerCard(gun(r)).match(/Range ([^<"]*)/) || [])[1],
        table: (r) => {
            DataLoader.cache['weapons.json'] = [gun(r)];
            const cell = ReferencesTab.renderTalentProfiles({ profiles: ['late_gun'] }).match(/<td>Late Gun<\/td><td>4<\/td><td>1<\/td><td>-<\/td><td>([^<]*)<\/td>/);
            return cell ? cell[1] : null;
        }
    };
    for (const [name, site] of Object.entries(sites)) {
        const diffs = ranges.map(r => ({ r, want: fmt(r), got: site(r) })).filter(x => x.got !== x.want);
        check(`range: the ${name} site prints "-" for a null band, 0 for a band of 0 and the old text for three numbers (${ranges.length} ranges)`, diffs, []);
    }
    DataLoader.cache['weapons.json'] = saved;
    check('range: formatRange keeps a text range and a missing range', [VehiclesTab.formatRange('Melee'), VehiclesTab.formatRange(undefined)], ['Melee', null]);
});

// ----- Item 7 (TB10-7): the empty state of the Compendium escapes the search text -----
group('compendium empty state', () => {
    const el = { innerHTML: '' };
    sandbox.document = { getElementById: () => el };
    ReferencesTab.allEntries = [];
    ReferencesTab._scrollHandler = null;
    const render = (query) => { ReferencesTab.searchQuery = query; ReferencesTab.renderEntries(); return el.innerHTML; };
    const hostile = render('<img src=x onerror=1>&"');
    check('compendium: a hostile search text gives no <img element and shows the text as typed',
        { img: /<img/i.test(hostile), text: hostile.includes('&lt;img src=x onerror=1&gt;&amp;"') }, { img: false, text: true });
    check('compendium: a plain search text gives the old output',
        render('bolter'), '<div class="glossary-empty"><p>No entries found for "bolter".</p></div>');
    check('compendium: an empty search text gives the old output', render(''), '<div class="glossary-empty"><p>No entries found.</p></div>');
    ReferencesTab.searchQuery = '';
});

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
