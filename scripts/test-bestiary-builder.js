// Tests for the threat builder loads and the builder autosave of the bestiary (spec §4.2, §4.6, §5.2, §7.2):
// Add to Encounter and Import Threat after a change of the threat data (C8), the threat file gates (CB3),
// the repair of a loaded threat (C9), the pristine builder (C5, P2) and the ownership rule (CB1).
// Run: node scripts/test-bestiary-builder.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const readText = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const KEY_BLD = 'wng-bestiary-builder-autosave';
const THR_REPAIR = 'Threat data was repaired on load: ';

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

const tabStub = () => ({ init() {}, refresh() {} });
const classList = () => ({ add() {}, remove() {}, toggle() {}, contains() { return false; } });

// The document of makeApp: a stable stub element for each id
function makeStubDocument() {
    const byId = {};
    return {
        addEventListener() {},
        getElementById(id) { return byId[id] || (byId[id] = { classList: classList(), textContent: '', value: '' }); },
        querySelectorAll: () => []
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
function makeApp(store, withTab = false) {
    const warns = [];
    const notes = [];
    // Each confirm text, and the answer of the next confirm
    const confirms = [];
    let confirmAnswer = true;
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
        confirm: (text) => { confirms.push(text); return confirmAnswer; },
        ThreatsTab: tabStub(), VehiclesTab: tabStub(), GlossaryTab: tabStub(), ReferencesTab: tabStub(),
        ThreatBuilderTab: tabStub(), SettingsTab: tabStub()
    };
    if (!withTab) sandbox.EncounterTab = tabStub();
    vm.createContext(sandbox);
    const files = ['bestiary/js/data-loader.js', 'bestiary/js/bestiary-check.js', 'bestiary/js/encounter-state.js',
        'bestiary/js/threat-builder-state.js', 'bestiary/js/app.js'];
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
        window: sandbox.window, warns, notes, flush, confirms,
        setConfirm: (answer) => { confirmAnswer = answer; },
        // Loads one more real file into this page, and returns the named global
        load: (rel, name) => { vm.runInContext(readText(rel), sandbox, { filename: rel }); return get(name); }
    };
    if (withTab) app.EncounterTab = get('EncounterTab');
    return app;
}
const makeTabApp = (store) => makeApp(store, true);

// The wounds of the threat of each entry, and its max wounds
const woundsOf = ({ EncounterState, DataLoader }) =>
    EncounterState.individuals.map(i => [DataLoader.getThreat(i.threatId).wounds, i.maxWounds]);

(async () => {
    // 1, 2
    await group('C8: a reload', () => {
        const store = {};
        const app1 = makeApp(store);
        const T1 = app1.ThreatBuilderState;
        T1.clear();
        T1.updateField('name', 'C8');
        T1.updateField('wounds', 5);
        T1.injectIntoEncounter(1);
        T1.updateField('wounds', 12);
        app1.flush();

        const app2 = makeApp(store);
        app2.App.checkAutoSave();
        check('C8: after a reload the rename prompt shows', app2.ThreatBuilderState.wouldCauseNameCollision(), true);
        app2.ThreatBuilderState.injectIntoEncounter(1);
        const ids = app2.EncounterState.individuals.map(i => i.threatId);
        check('C8: after a reload each entry keeps its own wounds',
            { wounds: woundsOf(app2), ids: ids.length === 2 && ids[0] !== ids[1] }, { wounds: [[5, 5], [12, 12]], ids: true });
    });

    // 3
    await group('C8: one session', () => {
        const app = makeApp({});
        const T = app.ThreatBuilderState;
        T.clear();
        T.updateField('name', 'Twice');
        T.injectIntoEncounter(1);
        // Fix round 1 (F2): no prompt for an unchanged threat
        const prompt = T.wouldCauseNameCollision();
        T.injectIntoEncounter(1);
        check('C8: an unchanged threat added twice keeps one id',
            { prompt, ids: new Set(app.EncounterState.individuals.map(i => i.threatId)).size }, { prompt: false, ids: 1 });
    });

    // Fix round 1 (F2): the cache holds no record with the id of a new threat, so no prompt shows (spec §7.2)
    await group('C8: a new threat with the name of an entry', () => {
        const app = makeApp({});
        const T = app.ThreatBuilderState;
        T.clear();
        T.updateField('name', 'Same');
        T.injectIntoEncounter(1);
        T.clear();
        T.updateField('name', 'Same');
        T.updateField('wounds', 7);
        check('C8: a new threat with the name of an entry shows no prompt', T.wouldCauseNameCollision(), false);
    });

    // Fix round 1 (TB4-1): the new id goes to the key at once
    await group('TB4-1', () => {
        const store = {};
        const app1 = makeApp(store);
        const T1 = app1.ThreatBuilderState;
        T1.clear();
        T1.updateField('name', 'S');
        T1.updateField('wounds', 5);
        T1.injectIntoEncounter(1);
        T1.updateField('wounds', 12);
        app1.flush();
        const prompt = T1.wouldCauseNameCollision();
        T1.injectIntoEncounter(1);
        const newId = T1.threat.id;
        app1.flush();

        const app3 = makeApp(store);
        app3.App.checkAutoSave();
        const T3 = app3.ThreatBuilderState;
        const prompt3 = T3.wouldCauseNameCollision();
        T3.injectIntoEncounter(1);
        const ids = app3.EncounterState.individuals.map(i => i.threatId);
        check('TB4-1: a new app adds the split threat again with its id and no prompt',
            { prompt, prompt3, id: T3.threat.id === newId, ids: new Set(ids).size, last: ids[ids.length - 1] === newId },
            { prompt: true, prompt3: false, id: true, ids: 2, last: true });
    });

    // Fix round 1 (TB4-3 a): the name of the rename prompt goes to the key at once
    await group('TB4-3: rename', () => {
        const store = {};
        const app = makeApp(store);
        const T = app.ThreatBuilderState;
        T.clear();
        T.updateField('name', 'R');
        app.flush();
        T.injectIntoEncounter(1, 'R2');
        const next = makeApp(store);
        next.App.checkAutoSave();
        check('TB4-3: a rename is in the key at once', next.ThreatBuilderState.threat && next.ThreatBuilderState.threat.name, 'R2');
    });

    // Fix round 1 (TB4-3 b): Customize asks before it replaces a builder threat that is not pristine
    await group('TB4-3: Customize', () => {
        const app = makeApp({});
        const ThreatsTab = app.load('bestiary/tabs/threats-tab.js', 'ThreatsTab');
        app.App.switchTab = () => {};
        const T = app.ThreatBuilderState;
        // Fix round 2 (F4): a pristine builder gets the template with no confirm
        T.clear();
        app.setConfirm(false);
        ThreatsTab.customizeThreat('sly_marbo_aaa');
        check('TB4-3: Customize on a pristine builder asks nothing and loads the template',
            { asked: app.confirms.length, name: T.threat.name }, { asked: 0, name: app.DataLoader.getThreat('sly_marbo_aaa').name });
        T.clear();
        T.addKeyword('ORK');
        const before = JSON.stringify(T.getThreatData());
        app.setConfirm(false);
        ThreatsTab.customizeThreat('sly_marbo_aaa');
        check('TB4-3: Customize asks before it replaces a nameless threat with a keyword, and Cancel keeps it',
            { asked: app.confirms.length, same: JSON.stringify(T.getThreatData()) === before }, { asked: 1, same: true });
    });

    // 4
    await group('C8: Import Threat', async () => {
        const app = makeTabApp({});
        const files = [{ id: 'custom_imp', name: 'Imp', wounds: 5 }, { id: 'custom_imp', name: 'Imp', wounds: 9 }];
        app.window.api.loadThreatFile = async () => ({ success: true, data: files.shift() });
        await app.EncounterTab.handleImportThreat();
        await app.EncounterTab.handleImportThreat();
        const ids = app.EncounterState.individuals.map(i => i.threatId);
        check('C8: Import Threat of two versions of one file gives two ids',
            { first: app.DataLoader.getThreat(ids[0]).wounds, ids: new Set(ids).size }, { first: 5, ids: 2 });
    });

    // 5
    for (const [name, data] of [
        ['import: a file of 5 shows Error: Invalid threat file', 5],
        ['import: a players file shows Error: Invalid threat file', { version: 1, playerCount: 3, players: [] }]
    ]) {
        await group(name, async () => {
            const app = makeTabApp({});
            app.window.api.loadThreatFile = async () => ({ success: true, data });
            await app.EncounterTab.handleImportThreat();
            check(name,
                { note: app.notes[app.notes.length - 1], entries: app.EncounterState.individuals.length },
                { note: 'Error: Invalid threat file', entries: 0 });
        });
    }
    await group('import: an id of 7', async () => {
        const app = makeTabApp({});
        app.window.api.loadThreatFile = async () => ({ success: true, data: { id: 7, name: 'I7' } });
        await app.EncounterTab.handleImportThreat();
        const id = (app.EncounterState.individuals[0] || {}).threatId;
        check('import: an id of 7 gets a custom_ id',
            { custom: typeof id === 'string' && id.startsWith('custom_'), name: id && app.DataLoader.getThreat(id).name },
            { custom: true, name: 'I7' });
    });
    // Fix round 1 (F3)
    await group('import: skills of 5', async () => {
        const app = makeTabApp({});
        app.window.api.loadThreatFile = async () => ({ success: true, data: { id: 'custom_s5', name: 'S5', skills: 5 } });
        await app.EncounterTab.handleImportThreat();
        check('import: skills of 5 is repaired with one warning',
            { warns: app.warns, skills: app.DataLoader.getThreat('custom_s5') && app.DataLoader.getThreat('custom_s5').skills },
            { warns: [THR_REPAIR + 'skills'], skills: '' });
    });

    // 6
    for (const [name, data] of [
        ['load: a file of [] gives Invalid threat file', []],
        ['load: an encounter file gives Invalid threat file and changes nothing', { settings: {}, individuals: [] }]
    ]) {
        await group(name, async () => {
            const store = {};
            const app = makeApp(store);
            const T = app.ThreatBuilderState;
            T.clear();
            T.updateField('name', 'Held');
            app.flush();
            const before = { threat: JSON.stringify(T.threat), stored: store[KEY_BLD], owns: T._ownsAutoSave };
            app.window.api.loadThreatFile = async () => ({ success: true, data });
            const result = await T.loadThreatFromFile();
            app.flush();
            check(name,
                { result, threat: JSON.stringify(T.threat), stored: store[KEY_BLD], owns: T._ownsAutoSave },
                { result: { success: false, error: 'Invalid threat file' }, ...before });
        });
    }
    await group('load: an id of 5 and skills of 5', async () => {
        const app = makeApp({});
        const T = app.ThreatBuilderState;
        T.clear();
        app.window.api.loadThreatFile = async () => ({ success: true, data: { id: 5, name: 'L5', skills: 5 } });
        let threw = null;
        try { await T.loadThreatFromFile(); } catch (e) { threw = e.message; }
        const id = T.threat.id;
        const repairs = app.warns.filter(w => w.startsWith(THR_REPAIR));
        check('load: an id of 5 and skills of 5 load', {
            threw,
            custom: typeof id === 'string' && id.startsWith('custom_'),
            skills: threw === null ? T.getThreatData().skills : null,
            warns: repairs.length,
            named: repairs.length === 1 && repairs[0].slice(THR_REPAIR.length).split(', ').includes('skills')
        }, { threw: null, custom: true, skills: 'Default 0', warns: 1, named: true });
    });

    // 7
    await group('autosave: a stored threat with id 5', () => {
        const app = makeApp({});
        const T = app.ThreatBuilderState;
        let threw = null;
        try { T.loadFromAutoSave({ id: 5, name: 'B5' }); } catch (e) { threw = e.message; }
        const id = T.threat && T.threat.id;
        check('autosave: a stored threat with id 5 loads',
            { threw, name: T.threat && T.threat.name, custom: typeof id === 'string' && id.startsWith('custom_') },
            { threw: null, name: 'B5', custom: true });
    });
    // Fix round 1 (F3)
    await group('autosave: skills of 5', () => {
        const app = makeApp({});
        let threw = null;
        try { app.ThreatBuilderState.loadFromAutoSave({ name: 'S5', skills: 5 }); } catch (e) { threw = e.message; }
        check('autosave: skills of 5 is repaired with one warning', { threw, warns: app.warns }, { threw: null, warns: [THR_REPAIR + 'skills'] });
    });

    // 8
    await group('P2: a new threat is pristine', () => {
        const store = {};
        const app = makeApp(store);
        app.ThreatBuilderState.clear();
        app.ThreatBuilderState._performAutoSave();
        check('P2: a new threat is pristine', store[KEY_BLD], undefined);
    });
    await group('P2: the data form of a new threat', () => {
        const data = makeApp({}).ThreatBuilderState._newThreatData();
        check('P2: the data form of a new threat has skills Default 0',
            { skills: data.skills, parsedSkills: 'parsedSkills' in data }, { skills: 'Default 0', parsedSkills: false });
    });

    // 9
    await group('C5: pristine', () => {
        const store = {};
        const app = makeApp(store);
        const T = app.ThreatBuilderState;
        T.clear();
        T.updateField('name', 'X');
        app.flush();
        const wrote = store[KEY_BLD] !== undefined;
        T.updateField('name', '');
        check('C5: a builder made pristine by the owner removes the key at once', { wrote, key: store[KEY_BLD] }, { wrote: true, key: undefined });
    });

    // 10
    await group('C5: keyword', () => {
        const store = {};
        const app = makeApp(store);
        const T = app.ThreatBuilderState;
        T.clear();
        T.addKeyword('ORK');
        app.flush();
        check('C5: a nameless threat with a keyword persists', store[KEY_BLD] !== undefined, true);
    });

    // 11
    await group('CB1', () => {
        const store = {};
        const a = makeApp(store);
        const b = makeApp(store);
        a.ThreatBuilderState.clear();
        b.ThreatBuilderState.clear();
        a.App.checkAutoSave();
        b.App.checkAutoSave();
        a.ThreatBuilderState.updateField('name', 'A1');
        a.flush();
        const B = b.ThreatBuilderState;
        B.updateField('name', 'Z');
        B.updateField('name', '');
        b.flush();
        B.clear();
        B.clearAutoSave();
        const kept = store[KEY_BLD] ? JSON.parse(store[KEY_BLD]).threat.name : null;
        check('CB1: a second tab with a pristine builder keeps the key of the first tab', kept, 'A1');
    });

    // Fix round 1 (TB3-3): a newer text of another tab stays
    await group('TB3-3', () => {
        const run = (aWrites) => {
            const store = {};
            const first = makeApp(store);
            first.ThreatBuilderState.clear();
            first.ThreatBuilderState.updateField('name', 'W');
            first.flush();
            const a = makeApp(store);
            a.App.checkAutoSave();
            const b = makeApp(store);
            b.App.checkAutoSave();
            if (aWrites) {
                a.ThreatBuilderState.updateField('wounds', 9);
                a.flush();
            }
            const newer = store[KEY_BLD];
            b.ThreatBuilderState.updateField('name', '');
            b.flush();
            return { aName: a.ThreatBuilderState.threat.name, bName: b.ThreatBuilderState.threat.name, newer, now: store[KEY_BLD] };
        };
        const kept = run(true);
        check('TB3-3: a builder made pristine in a tab that restored keeps the newer text of the other tab',
            { restored: [kept.aName, kept.bName], wounds: kept.newer ? JSON.parse(kept.newer).threat.wounds : null, same: kept.now === kept.newer },
            { restored: ['W', ''], wounds: 9, same: true });
        const gone = run(false);
        check('TB3-3: a builder made pristine in a tab that restored removes its own text',
            { stored: gone.newer !== undefined, now: gone.now }, { stored: true });
    });

    // Fix round 1 (TB3-4): a restore that gives a pristine builder does not own the key
    await group('TB3-4', () => {
        const threat = makeApp({}).ThreatBuilderState._newThreatData();
        threat.wounds = 'x';
        const stored = JSON.stringify({ threat, timestamp: 1 });
        const store = { [KEY_BLD]: stored };
        const app = makeApp(store);
        app.App.checkAutoSave();
        const pristine = app.ThreatBuilderState._isPristine();
        app.ThreatBuilderState.updateField('name', '');
        app.flush();
        check('TB3-4: a pristine restore keeps the stored text', { pristine, same: store[KEY_BLD] === stored }, { pristine: true, same: true });
    });

    // 12
    await group('C8: the snapshot field', () => {
        check('C8: the snapshot field is gone', '_lastInjectedSnapshot' in makeApp({}).ThreatBuilderState, false);
    });

    console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) FAILED.`);
    process.exit(failures ? 1 : 0);
})();
