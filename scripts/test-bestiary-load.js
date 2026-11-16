// Tests for the encounter loads of the bestiary and the encounter autosave (spec §4.2, §4.6, §4.7, §5.2):
// the autosave restore at the start, the encounter file, the players file, the repair warnings,
// the write of a loaded file, the removal of the key for an empty state, and the ownership rule (CB1).
// Run: node scripts/test-bestiary-load.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const readText = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const rt = v => JSON.parse(JSON.stringify(v));

const KEY_ENC = 'wng-bestiary-autosave';
const KEY_BLD = 'wng-bestiary-builder-autosave';
const ENC_WARN = 'The auto-save was not loaded: it does not contain an encounter.';
const BLD_WARN = 'The auto-save was not loaded: it does not contain a threat.';
const ENC_REPAIR = 'Encounter data was repaired on load: ';

let failures = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// Runs one group of checks. A throw is one FAIL, so that the other groups still run.
async function group(name, fn) {
    try {
        await fn();
    } catch (e) {
        failures++;
        console.log(`FAIL  ${name}: threw ${e && e.message}`);
    }
}

const DATA = {
    'threats.json': readText('data/threats.json'),
    'vehicles.json': readText('data/vehicles.json'),
    'threat-weapons.json': readText('data/threat-weapons.json')
};
const SOURCES = {};
for (const rel of ['bestiary/js/data-loader.js', 'bestiary/js/bestiary-check.js', 'bestiary/js/encounter-state.js',
    'bestiary/js/threat-builder-state.js', 'bestiary/js/app.js', 'bestiary/tabs/encounter-tab.js']) SOURCES[rel] = readText(rel);

// A tab stub records each init() in inits
const tabStub = (name, inits) => ({ init() { inits.push(name); }, refresh() {} });
const classList = () => ({ add() {}, remove() {}, toggle() {}, contains() { return false; } });

// The document of makeApp: a stable stub element for each id
function makeStubDocument() {
    const byId = {};
    return {
        addEventListener() {},
        getElementById(id) { return byId[id] || (byId[id] = { classList: classList(), textContent: '', value: '', addEventListener() {} }); },
        querySelectorAll: () => [],
        body: { classList: classList(), textContent: '' }
    };
}

// The recording document of scripts/test-tab-escapes.js:24-60, with focus(), select() and remove()
// on its elements. It records the textContent of each element given to document.body.appendChild.
function makeRecordingDocument(notes) {
    const byId = {};
    function makeElement() {
        let html = '';
        let text = null;
        const el = {
            style: {},
            dataset: {},
            value: '',
            className: '',
            classList: classList(),
            addEventListener() {},
            appendChild(child) { return child; },
            querySelector() { return makeElement(); },
            querySelectorAll() { return []; },
            closest() { return null; },
            focus() {},
            select() {},
            remove() {},
            set textContent(v) { text = String(v); html = ''; },
            get textContent() { return text === null ? html : text; },
            set innerHTML(v) { html = String(v); text = null; },
            get innerHTML() {
                if (text === null) return html;
                return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            }
        };
        return el;
    }
    return {
        addEventListener() {},
        getElementById(id) { return byId[id] || (byId[id] = makeElement()); },
        querySelector() { return makeElement(); },
        querySelectorAll() { return []; },
        createElement() { return makeElement(); },
        body: { classList: classList(), appendChild(child) { notes.push(child.textContent); return child; } }
    };
}

// One page of the app. Two apps on one store are two tabs of one origin.
// With noCheck, the page has no bestiary-check.js (a page that did not load completely).
function makeApp(store, withTab = false, noCheck = false) {
    const warns = [];
    const notes = [];
    const inits = [];
    const timers = new Map();
    let nextTimer = 1;
    const sandbox = {
        console: { log() {}, warn: (...args) => { warns.push(args.join(' ')); }, error: console.error },
        localStorage: {
            getItem: (k) => (k in store ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: (k) => { delete store[k]; }
        },
        setTimeout: (fn) => { const id = nextTimer++; timers.set(id, fn); return id; },
        clearTimeout: (id) => { timers.delete(id); },
        document: withTab ? makeRecordingDocument(notes) : makeStubDocument(),
        window: { innerWidth: 1400, api: {} },
        history: { replaceState() {}, pushState() {} },
        location: { hash: '' },
        confirm: () => true,
        Glossary: { init: async () => {} },
        ThreatsTab: tabStub('ThreatsTab', inits), VehiclesTab: tabStub('VehiclesTab', inits),
        GlossaryTab: tabStub('GlossaryTab', inits), ReferencesTab: tabStub('ReferencesTab', inits),
        ThreatBuilderTab: tabStub('ThreatBuilderTab', inits), SettingsTab: tabStub('SettingsTab', inits)
    };
    if (!withTab) sandbox.EncounterTab = tabStub('EncounterTab', inits);
    vm.createContext(sandbox);
    const files = ['bestiary/js/data-loader.js', 'bestiary/js/bestiary-check.js', 'bestiary/js/encounter-state.js',
        'bestiary/js/threat-builder-state.js', 'bestiary/js/app.js'];
    if (noCheck) files.splice(1, 1);
    if (withTab) files.push('bestiary/tabs/encounter-tab.js');
    for (const rel of files) vm.runInContext(SOURCES[rel], sandbox, { filename: rel });
    const get = (name) => vm.runInContext(name, sandbox);
    const DataLoader = get('DataLoader');
    for (const f of Object.keys(DATA)) DataLoader.cache[f] = JSON.parse(DATA[f]);
    // Runs each pending timer (also a timer that a timer starts) and empties the list
    const flush = () => {
        while (timers.size > 0) {
            const [id, fn] = timers.entries().next().value;
            timers.delete(id);
            fn();
        }
    };
    const app = {
        EncounterState: get('EncounterState'), ThreatBuilderState: get('ThreatBuilderState'), DataLoader, App: get('App'),
        window: sandbox.window, document: sandbox.document, warns, notes, inits, flush
    };
    if (withTab) app.EncounterTab = get('EncounterTab');
    return app;
}
const makeTabApp = (store) => makeApp(store, true);

// One encounter built through the real writers only (a copy of scripts/test-bestiary-check.js)
function buildEncounterCorpus({ EncounterState, ThreatBuilderState }) {
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

// The fixture helpers of scripts/browser-bestiary.js
const mkInd = (id, threatId, o = {}) => Object.assign({
    id, threatId, bonus: 'none', currentWounds: 0, currentShock: 0, maxWounds: 5, maxShock: 4,
    mobId: null, initiative: null, notes: '', additionalWeaponId: null, personalRuin: 0
}, o);
const mkEnc = (o = {}) => Object.assign({
    version: 1, settings: { tier: 1, playerCount: 4, name: 'Unnamed Encounter', round: 1 },
    individuals: [], mobs: [], playerCharacters: [], vehicles: [], encounterOrder: null, customThreats: []
}, o);
const autosave = (encounter) => JSON.stringify({ encounter, customThreats: [], timestamp: 1 });
// Fixture B of the c4 scenario of scripts/browser-bestiary.js
const fixtureB = () => mkEnc({
    settings: { tier: 2, playerCount: 3, name: 'B', round: 4 },
    playerCharacters: [{ id: 'p1', name: 'Bravo', initiative: null, notes: '' }]
});
const repairedPaths = (warns) => warns.filter(w => w.startsWith(ENC_REPAIR)).map(w => w.slice(ENC_REPAIR.length).split(', '));

(async () => {
    // 1
    await group('restore: the writer corpus', () => {
        const store = {};
        const app1 = makeApp(store);
        const corpus = buildEncounterCorpus(app1);
        app1.flush();
        const before = store[KEY_ENC];
        const app2 = makeApp(store);
        app2.App.checkAutoSave();
        check('restore: the writer corpus loads with no change',
            { data: rt(app2.EncounterState.getEncounterData()), warns: app2.warns }, { data: corpus, warns: [] });
        app2.flush();
        check('restore: the writer corpus leaves the stored string unchanged', store[KEY_ENC] === before, true);
    });

    // 2
    await group('restore: individuals {}', () => {
        const stored = JSON.stringify({ encounter: { individuals: {} }, timestamp: 1 });
        const store = { [KEY_ENC]: stored };
        const app = makeApp(store);
        let threw = null;
        try { app.App.checkAutoSave(); } catch (e) { threw = e.message; }
        check('restore: individuals {} does not throw', threw, null);
        check('restore: individuals {} gives []', app.EncounterState.individuals, []);
        const paths = repairedPaths(app.warns);
        check('restore: individuals {} writes one warning that names individuals',
            { warns: app.warns.length, names: paths.length === 1 && paths[0].includes('individuals') }, { warns: 1, names: true });
        app.flush();
        check('restore: individuals {} leaves the stored string unchanged', store[KEY_ENC] === stored, true);
    });

    // 3
    await group('restore: top-level customThreats {}', () => {
        const valid = mkEnc({ individuals: [mkInd('c9i1', 'sly_marbo_aaa', { maxWounds: 14, maxShock: 10 })] });
        const store = {
            [KEY_ENC]: JSON.stringify({ encounter: valid, customThreats: {}, timestamp: 1 }),
            [KEY_BLD]: JSON.stringify({ threat: { name: 'Kept' } })
        };
        const app = makeApp(store);
        let threw = null;
        try { app.App.checkAutoSave(); } catch (e) { threw = e.message; }
        check('restore: top-level customThreats {} does not stop the builder restore',
            { threw, name: app.ThreatBuilderState.threat && app.ThreatBuilderState.threat.name }, { threw: null, name: 'Kept' });

        // Fix round 1 (F5): the paths of the top-level list go into the one warning
        const store2 = { [KEY_ENC]: JSON.stringify({ encounter: valid, customThreats: [5], timestamp: 1 }) };
        const app2 = makeApp(store2);
        app2.App.checkAutoSave();
        check('restore: a bad top-level custom threat is named autosave.customThreats[0]', repairedPaths(app2.warns), [['autosave.customThreats[0]']]);
    });

    // 4
    for (const [label, stored] of [['5', '5'], ['[]', '[]'], ['{}', '{}']]) {
        await group(`gate: an autosave of ${label}`, () => {
            const store = { [KEY_ENC]: stored };
            const app = makeApp(store);
            let threw = null;
            try { app.App.checkAutoSave(); } catch (e) { threw = e.message; }
            app.flush();
            check(`gate: an autosave of ${label} is not loaded`,
                { threw, warns: app.warns, stored: store[KEY_ENC] }, { threw: null, warns: [ENC_WARN], stored });
        });
    }

    // 5
    await group('gate: a builder autosave whose threat is a string', () => {
        const stored = JSON.stringify({ threat: 'x' });
        const store = { [KEY_BLD]: stored };
        const app = makeApp(store);
        let threw = null;
        try { app.App.checkAutoSave(); } catch (e) { threw = e.message; }
        app.flush();
        check('gate: a builder autosave whose threat is a string is not loaded',
            { threw, warns: app.warns, stored: store[KEY_BLD] }, { threw: null, warns: [BLD_WARN], stored });
    });

    // 6
    await group('start: no stored key', () => {
        const app = makeApp({});
        app.App.checkAutoSave();
        check('start: no stored key gives no warning', app.warns, []);
    });

    // 7
    await group('E1', () => {
        const stored = autosave(mkEnc({
            settings: { tier: 1, playerCount: 300000, name: 'Big', round: 1 },
            individuals: [mkInd('c7i1', 'sly_marbo_aaa', { maxWounds: 14, maxShock: 10 })]
        }));
        const store = { [KEY_ENC]: stored };
        const app = makeApp(store);
        app.App.checkAutoSave();
        check('E1: a stored count of 300000 loads as 10', app.EncounterState.settings.playerCount, 10);
        check('E1: one warning names settings.playerCount',
            app.warns.filter(w => w.startsWith(ENC_REPAIR) && w.includes('settings.playerCount')).length, 1);
        app.flush();
        check('E1: the stored string is unchanged', store[KEY_ENC] === stored, true);
    });

    // 8
    await group('E2', () => {
        const store = { [KEY_ENC]: autosave(mkEnc({
            settings: { tier: 1, playerCount: 4, name: 'E2', round: 1 },
            individuals: [mkInd('e2i1', 'sly_marbo_aaa', { bonus: 'adversary', maxWounds: null, maxShock: 10 })]
        })) };
        const app = makeApp(store);
        app.App.checkAutoSave();
        const wounds = app.DataLoader.getThreat('sly_marbo_aaa').wounds;
        const paths = repairedPaths(app.warns);
        check('E2: a null maxWounds is recomputed',
            { max: app.EncounterState.individuals[0].maxWounds, named: paths.length === 1 && paths[0].includes('individuals[0].maxWounds') },
            { max: wounds + 4 + 1, named: true });

        const store2 = { [KEY_ENC]: autosave(mkEnc({ individuals: [mkInd('e2i2', 'gone', { maxWounds: null })] })) };
        const app2 = makeApp(store2);
        app2.App.checkAutoSave();
        check('E2: a null maxWounds of an unknown threat stays null', app2.EncounterState.individuals[0].maxWounds, null);

        // Fix round 1 (F5): a null maxShock
        const store3 = { [KEY_ENC]: autosave(mkEnc({
            individuals: [mkInd('e2i3', 'sly_marbo_aaa', { bonus: 'adversary', maxWounds: 19, maxShock: null })]
        })) };
        const app3 = makeApp(store3);
        app3.App.checkAutoSave();
        const shock = app3.DataLoader.getThreat('sly_marbo_aaa').shock;
        check('E2: a null maxShock is recomputed',
            { max: app3.EncounterState.individuals[0].maxShock, paths: repairedPaths(app3.warns) },
            { max: shock + 4 + 1, paths: [['individuals[0].maxShock']] });

        // Fix round 1 (F6): the path uses the index of the loaded data, also after a dropped entry
        const store4 = { [KEY_ENC]: autosave(mkEnc({
            individuals: [5, mkInd('e2i4', 'sly_marbo_aaa', { maxWounds: null })]
        })) };
        const app4 = makeApp(store4);
        app4.App.checkAutoSave();
        check('E2: the path uses the index of the loaded data', repairedPaths(app4.warns), [['individuals[0]', 'individuals[1].maxWounds']]);
    });

    // 9
    await group('D2', () => {
        const store = { [KEY_ENC]: autosave(mkEnc({ individuals: [mkInd('d2i1', 'sly_marbo_aaa', { mobId: 'nomob' })] })) };
        const app = makeApp(store);
        app.App.checkAutoSave();
        check('D2: a dangling mobId shows the entry as a free row',
            app.EncounterState.getEncounterListItems().map(i => [i.type, i.id]), [['individual', 'd2i1']]);
    });

    // 10
    await group('C10', () => {
        const store = { [KEY_ENC]: autosave(mkEnc({
            individuals: [
                mkInd('c10i1', 'gone'),
                mkInd('c10i2', 'gone', { mobId: 'c10m1' }),
                mkInd('c10i3', 'gone', { mobId: 'c10m1' })
            ],
            mobs: [{ id: 'c10m1', threatId: 'gone', name: 'M', initiative: null, notes: '' }]
        })) };
        const app = makeApp(store);
        app.App.checkAutoSave();
        const items = app.EncounterState.getEncounterListItems();
        const nameOf = type => (items.find(i => i.type === type) || {}).name;
        check('C10: an unknown individual is named Unknown threat (gone)', nameOf('individual'), 'Unknown threat (gone)');
        check('C10: an unknown mob is named M — Unknown threat (gone)', nameOf('mob'), 'M — Unknown threat (gone)');
    });

    // 11
    await group('C11', async () => {
        const app = makeApp({});
        const shipped = app.DataLoader.getThreat('sly_marbo_aaa').name;
        const data = mkEnc({
            individuals: [mkInd('c11i1', 'sly_marbo_aaa', { maxWounds: 14, maxShock: 10 })],
            customThreats: [{ id: 'sly_marbo_aaa', name: 'NOT MARBO' }]
        });
        app.window.api.loadEncounterFile = async () => ({ success: true, data, fileName: 'F' });
        await app.EncounterState.loadEncounterFromFile();
        const paths = repairedPaths(app.warns);
        check('C11: a file cannot replace a shipped threat',
            { name: app.DataLoader.getThreat('sly_marbo_aaa').name, named: paths.length === 1 && paths[0].includes('customThreats[0]') },
            { name: shipped, named: true });
    });

    // 12
    await group('C4', async () => {
        const store = {};
        const app = makeApp(store);
        app.EncounterState.addIndividual('sly_marbo_aaa', 1);
        app.flush();
        app.window.api.loadEncounterFile = async () => ({ success: true, data: fixtureB(), fileName: 'F' });
        await app.EncounterState.loadEncounterFromFile();
        const expected = fixtureB();
        expected.settings.name = 'F';
        check('C4: a loaded file is in the autosave at once',
            { stored: store[KEY_ENC] ? JSON.parse(store[KEY_ENC]).encounter : null, unsaved: app.EncounterState.hasUnsavedChanges() },
            { stored: expected, unsaved: false });
    });

    // Final review round (X2): an empty encounter file removes the key only for an owner (spec §5.3, row 2)
    await group('C4 empty file', async () => {
        const stored = (store) => (KEY_ENC in store ? store[KEY_ENC] : null);
        const loadEmpty = async (app) => {
            app.window.api.loadEncounterFile = async () => ({ success: true, data: mkEnc(), fileName: 'Empty' });
            await app.EncounterState.loadEncounterFromFile();
        };

        // The page wrote the key
        const store1 = {};
        const writer = makeApp(store1);
        writer.EncounterState.addIndividual('sly_marbo_aaa', 1);
        writer.flush();
        const wrote = stored(store1) !== null;
        await loadEmpty(writer);
        check('C4: an owner that wrote the key loads an empty file: the key is removed', { wrote, key: stored(store1) }, { wrote: true, key: null });

        // The page restored its state from the key
        const store2 = {};
        const first = makeApp(store2);
        first.EncounterState.addIndividual('sly_marbo_aaa', 1);
        first.flush();
        const restorer = makeApp(store2);
        restorer.App.checkAutoSave();
        const restored = restorer.EncounterState.individuals.length;
        await loadEmpty(restorer);
        check('C4: an owner that restored the key loads an empty file: the key is removed', { restored, key: stored(store2) }, { restored: 1, key: null });

        // The page did not write or restore the key: the key stays unchanged
        const store3 = {};
        const other = makeApp(store3);
        other.EncounterState.addIndividual('sly_marbo_aaa', 1);
        other.flush();
        const kept = stored(store3);
        const stranger = makeApp(store3);
        await loadEmpty(stranger);
        check('C4: a page that does not own the key loads an empty file: the key stays', { written: kept !== null, same: stored(store3) === kept }, { written: true, same: true });

        // The page restored the key, but another tab wrote a newer text after that: the key stays (TB3-3)
        const store4 = {};
        const tabA = makeApp(store4);
        tabA.EncounterState.addIndividual('sly_marbo_aaa', 1);
        tabA.flush();
        const tabB = makeApp(store4);
        tabB.App.checkAutoSave();
        const restoredB = tabB.EncounterState.individuals.length;
        tabA.EncounterState.incrementRound();
        tabA.flush();
        const newer = stored(store4);
        await loadEmpty(tabB);
        check('C4: a page whose stored text is not its own loads an empty file: the newer key stays',
            { restored: restoredB, newerRound: newer ? JSON.parse(newer).encounter.settings.round : null, same: stored(store4) === newer },
            { restored: 1, newerRound: 2, same: true });
    });

    // 13
    const badFiles = [
        ['gate: a file whose top level is an array gives an error', []],
        ['gate: a threat file in Load Encounter gives an error', { name: 'X', abilities: [] }],
        ['gate: a players file in Load Encounter gives an error', { version: 1, playerCount: 3, players: [] }]
    ];
    for (const [name, data] of badFiles) {
        await group(name, async () => {
            const store = {};
            const app = makeApp(store);
            app.EncounterState.addIndividual('sly_marbo_aaa', 1);
            app.flush();
            const before = { state: JSON.stringify(app.EncounterState.getEncounterData()), stored: store[KEY_ENC], owns: app.EncounterState._ownsAutoSave };
            app.window.api.loadEncounterFile = async () => ({ success: true, data, fileName: 'F' });
            const result = await app.EncounterState.loadEncounterFromFile();
            app.flush();
            check(name,
                { result, state: JSON.stringify(app.EncounterState.getEncounterData()), stored: store[KEY_ENC], owns: app.EncounterState._ownsAutoSave },
                { result: { success: false, error: 'Invalid encounter file' }, ...before });
        });
    }

    // 14
    await group('C5', () => {
        const store = {};
        const app = makeApp(store);
        const [id] = app.EncounterState.addIndividual('sly_marbo_aaa', 1);
        app.flush();
        const wrote = store[KEY_ENC] !== undefined;
        app.EncounterState.removeIndividual(id);
        check('C5: removing the last individual removes the key at once', { wrote, key: store[KEY_ENC] }, { wrote: true, key: undefined });

        const store2 = {};
        const app2 = makeApp(store2);
        const p = app2.EncounterState.addPlayerCharacter('Ann');
        app2.flush();
        const wrote2 = store2[KEY_ENC] !== undefined;
        app2.EncounterState.removePlayerCharacter(p);
        check('C5: removing the only player removes the key at once', { wrote: wrote2, key: store2[KEY_ENC] }, { wrote: true, key: undefined });
    });

    // 15, 16
    await group('CB1', () => {
        const store = {};
        const a = makeApp(store);
        const b = makeApp(store);
        a.App.checkAutoSave();
        b.App.checkAutoSave();
        const [id] = a.EncounterState.addIndividual('sly_marbo_aaa', 1);
        a.flush();
        const kept = store[KEY_ENC];
        b.EncounterState.updateSettings({ tier: 2 });
        b.EncounterState.incrementRound();
        b.EncounterState.clearEncounterOrder();
        b.flush();
        const afterEdits = store[KEY_ENC];
        b.EncounterState.clearEncounter();
        b.flush();
        check('CB1: a second tab with an empty encounter keeps the key of the first tab',
            { written: kept !== undefined, afterEdits: afterEdits === kept, afterClear: store[KEY_ENC] === kept },
            { written: true, afterEdits: true, afterClear: true });

        const c = makeApp(store);
        c.App.checkAutoSave();
        const restored = c.EncounterState.individuals.map(i => i.id);
        c.EncounterState.removeIndividual(id);
        check('CB1: a restore makes the page the owner', { restored, key: store[KEY_ENC] }, { restored: [id], key: undefined });
    });

    // Fix round 1 (TB3-3): a newer text of another tab stays
    await group('TB3-3', () => {
        const store = {};
        const a = makeApp(store);
        a.App.checkAutoSave();
        a.EncounterState.addIndividual('sly_marbo_aaa', 1);
        a.flush();
        const b = makeApp(store);
        b.App.checkAutoSave();
        const [bId] = b.EncounterState.individuals.map(i => i.id);
        a.EncounterState.incrementRound();
        a.flush();
        const newer = store[KEY_ENC];
        b.EncounterState.removeIndividual(bId);
        check('TB3-3: a remove in a tab that restored keeps the newer text of the other tab',
            { bRestored: bId !== undefined, newerRound: newer ? JSON.parse(newer).encounter.settings.round : null, same: store[KEY_ENC] === newer },
            { bRestored: true, newerRound: 2, same: true });
    });

    // Fix round 1 (TB3-4): a restore that gives an empty state does not own the key
    await group('TB3-4', () => {
        const stored = JSON.stringify({ encounter: { individuals: {} }, timestamp: 1 });
        const store = { [KEY_ENC]: stored };
        const app = makeApp(store);
        app.App.checkAutoSave();
        app.EncounterState.updateSettings({ tier: 2 });
        app.flush();
        check('TB3-4: an empty restore does not own the key', { owns: app.EncounterState._ownsAutoSave, same: store[KEY_ENC] === stored }, { owns: false, same: true });
    });

    // Fix round 1 (TB3-2): a page with no BestiaryCheck does not start
    await group('TB3-2', async () => {
        const run = async (noCheck) => {
            const stored = autosave(mkEnc({ individuals: [mkInd('t2i1', 'sly_marbo_aaa', { maxWounds: 14, maxShock: 10 })] }));
            const store = { [KEY_ENC]: stored };
            const app = makeApp(store, false, noCheck);
            app.window.api.onCheckUnsavedChanges = () => {};
            app.window.addEventListener = () => {};
            app.DataLoader.loadAll = async () => ({});
            let threw = null;
            try { await app.App.init(); } catch (e) { threw = e.message; }
            app.flush();
            return {
                threw, message: app.document.body.textContent, inits: app.inits.length > 0,
                restored: app.EncounterState.individuals.length, same: store[KEY_ENC] === stored
            };
        };
        check('TB3-2: with BestiaryCheck the app starts and restores',
            await run(false), { threw: null, message: '', inits: true, restored: 1, same: true });
        check('TB3-2: with no BestiaryCheck the app shows the message and does not start',
            await run(true), { threw: null, message: 'The app did not load completely. Reload the page.', inits: false, restored: 0, same: true });
    });

    // 17
    await group('players: gates', async () => {
        for (const [name, data] of [
            ['players: a file of [] shows Error loading: Invalid player file', []],
            ['players: an encounter file in Load Players shows the same error', { settings: {}, individuals: [] }]
        ]) {
            const app = makeTabApp({});
            app.EncounterState.addPlayerCharacter('Ann');
            app.window.api.loadPlayersFile = async () => ({ success: true, data, fileName: 'P' });
            await app.EncounterTab.handleLoadPlayers();
            check(name,
                { note: app.notes[app.notes.length - 1], players: app.EncounterState.playerCharacters.map(p => p.name) },
                { note: 'Error loading: Invalid player file', players: ['Ann'] });
        }
    });
    await group('players: repair', async () => {
        const app = makeTabApp({});
        app.window.api.loadPlayersFile = async () => ({ success: true, data: { version: 1, playerCount: 50, players: [{ name: 7 }] }, fileName: 'P' });
        await app.EncounterTab.handleLoadPlayers();
        check('players: count 50 and a name 7 load as 10 and Player',
            { count: app.EncounterState.settings.playerCount, players: app.EncounterState.playerCharacters.map(p => p.name), warns: app.warns },
            { count: 10, players: ['Player'], warns: ['Player data was repaired on load: playerCount, players[0].name'] });
    });

    // 18
    await group('Q5', async () => {
        const store = {};
        const app = makeTabApp(store);
        app.EncounterState.addPlayerCharacter('Ann');
        app.EncounterState.addPlayerCharacter('Bob');
        app.flush();
        const wrote = store[KEY_ENC] !== undefined;
        app.window.api.loadPlayersFile = async () => ({ success: true, data: { version: 1, playerCount: 2, players: [] }, fileName: 'P' });
        await app.EncounterTab.handleLoadPlayers();
        app.flush();
        const next = makeApp(store);
        next.App.checkAutoSave();
        check('Q5: an empty player file removes the players for good',
            { wrote, players: next.EncounterState.playerCharacters }, { wrote: true, players: [] });
    });

    console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) FAILED.`);
    process.exit(failures ? 1 : 0);
})();
