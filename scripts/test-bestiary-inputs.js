// Tests for the number inputs of the encounter (spec §6.2 to §6.4): the limits of the state writers,
// the Players box, the initiative box of the encounter list, the player rows (D1), and the rule that a
// stored player above the player count stays after each load (ruling TB3-1).
// Run: node scripts/test-bestiary-inputs.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const readText = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const rt = v => JSON.parse(JSON.stringify(v));

const KEY_ENC = 'wng-bestiary-autosave';

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

// The min and max that the real inputs declare (bestiary/index.html). Other boxes get them from their markup.
const DECLARED = { 'encounter-players': { min: '1', max: '10' } };

// The recording document of scripts/test-tab-escapes.js, with one stable element for each id and selector.
// An element keeps its handlers in _on. querySelectorAll('.class') reads the markup that the last innerHTML
// set wrote, and returns one stable stub for each tag whose class list has the class. Its dataset, value,
// min and max come from the attributes of the tag.
function makeDocument() {
    const byId = {};
    const bySel = {};
    function attrsOf(tag) {
        const attrs = {};
        tag.replace(/([\w-]+)="([^"]*)"/g, (m, k, v) => { attrs[k] = v; return m; });
        return attrs;
    }
    function makeElement() {
        let html = '';
        let text = null;
        let kids = {};
        const el = {
            style: {},
            dataset: {},
            value: '',
            min: '',
            max: '',
            className: '',
            _on: {},
            classList: classList(),
            addEventListener(type, fn) { el._on[type] = fn; },
            appendChild(child) { return child; },
            querySelector(sel) { return bySel[sel] || (bySel[sel] = makeElement()); },
            querySelectorAll(sel) {
                const m = /^\.([\w-]+)$/.exec(sel);
                if (!m) return [];
                if (kids[sel]) return kids[sel];
                const found = [];
                for (const tag of html.match(/<(?:input|button|div)\b[^>]*>/g) || []) {
                    const attrs = attrsOf(tag);
                    if (!(attrs.class || '').split(/\s+/).includes(m[1])) continue;
                    const kid = makeElement();
                    for (const k of Object.keys(attrs)) if (k.startsWith('data-')) kid.dataset[k.slice(5)] = attrs[k];
                    kid.value = attrs.value || '';
                    kid.min = attrs.min || '';
                    kid.max = attrs.max || '';
                    found.push(kid);
                }
                kids[sel] = found;
                return found;
            },
            closest() { return null; },
            setAttribute() {},
            focus() {},
            select() {},
            remove() {},
            set textContent(v) { text = String(v); html = ''; },
            get textContent() { return text === null ? html : text; },
            set innerHTML(v) { html = String(v); text = null; kids = {}; },
            get innerHTML() {
                if (text === null) return html;
                return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            }
        };
        return el;
    }
    return {
        addEventListener() {},
        getElementById(id) {
            if (!byId[id]) {
                byId[id] = makeElement();
                Object.assign(byId[id], DECLARED[id] || {});
            }
            return byId[id];
        },
        querySelector() { return makeElement(); },
        querySelectorAll() { return []; },
        createElement() { return makeElement(); },
        body: { classList: classList(), appendChild(child) { return child; } }
    };
}

// One page of the app, with the real encounter tab and a store for localStorage.
function makeApp(store = {}) {
    const timers = new Map();
    let nextTimer = 1;
    const warns = [];
    const sandbox = {
        console: { log() {}, warn: (...args) => { warns.push(args.join(' ')); }, error: console.error },
        localStorage: {
            getItem: (k) => (k in store ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: (k) => { delete store[k]; }
        },
        setTimeout: (fn) => { const id = nextTimer++; timers.set(id, fn); return id; },
        clearTimeout: (id) => { timers.delete(id); },
        document: makeDocument(),
        window: { innerWidth: 1400, api: {} },
        history: { replaceState() {}, pushState() {} },
        location: { hash: '' },
        confirm: () => true,
        Glossary: { init: async () => {} },
        ThreatsTab: tabStub(), VehiclesTab: tabStub(), GlossaryTab: tabStub(), ReferencesTab: tabStub(),
        ThreatBuilderTab: tabStub(), SettingsTab: tabStub()
    };
    vm.createContext(sandbox);
    for (const rel of ['bestiary/js/data-loader.js', 'bestiary/js/bestiary-check.js', 'bestiary/js/encounter-state.js',
        'bestiary/js/threat-builder-state.js', 'bestiary/js/app.js', 'bestiary/tabs/encounter-tab.js'])
        vm.runInContext(SOURCES[rel], sandbox, { filename: rel });
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
    return {
        EncounterState: get('EncounterState'), EncounterTab: get('EncounterTab'), App: get('App'),
        window: sandbox.window, document: sandbox.document, store, warns, flush
    };
}

const mkEnc = (o = {}) => Object.assign({
    version: 1, settings: { tier: 1, playerCount: 4, name: 'Unnamed Encounter', round: 1 },
    individuals: [], mobs: [], playerCharacters: [], vehicles: [], encounterOrder: null, customThreats: []
}, o);
const players = (n) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'Pl' + i, initiative: null, notes: '' }));
const ROW = /class="player-character-row[ "]/g;
const EXTRA = /player-character-row--extra/g;
const MARK = 'Above player count';
const count = (re, text) => (text.match(re) || []).length;
const rowsHtml = (app) => app.document.getElementById('player-character-inputs').innerHTML;

(async () => {
    // ----- The writers -----
    await group('writers', () => {
        const { EncounterState } = makeApp();
        const tryCount = (v) => { EncounterState.settings.playerCount = 4; EncounterState.updateSettings({ playerCount: v }); return EncounterState.settings.playerCount; };
        check('updateSettings: a playerCount of NaN, 0, 11 or "5" keeps the count',
            [NaN, 0, 11, '5'].map(tryCount), [4, 4, 4, 4]);
        check('updateSettings: a playerCount of 10 sets the count', tryCount(10), 10);
        const tryTier = (v) => { EncounterState.settings.tier = 1; EncounterState.updateSettings({ tier: v }); return EncounterState.settings.tier; };
        check('updateSettings: a tier of 6 or "3" keeps the tier', [6, '3'].map(tryTier), [1, 1]);
        check('updateSettings: a tier of 3 sets the tier', tryTier(3), 3);
        EncounterState.settings.playerCount = 4;
        EncounterState.updateSettings({ playerCount: 0, name: 'Kept name' });
        check('updateSettings: an invalid playerCount does not stop the other keys',
            { count: EncounterState.settings.playerCount, name: EncounterState.settings.name }, { count: 4, name: 'Kept name' });
    });

    await group('initiative writers', () => {
        const { EncounterState } = makeApp();
        const [ind] = EncounterState.addIndividual('sly_marbo_aaa', 1);
        const [mobId] = EncounterState.addIndividual('astra_militarum_trooper', 2, true);
        const pc = EncounterState.addPlayerCharacter('Ann');
        const veh = EncounterState.addVehicle('chimera');
        const sets = {
            individual: [(v) => EncounterState.setInitiative(ind, v), () => EncounterState.individuals.find(i => i.id === ind).initiative],
            mob: [(v) => EncounterState.setMobInitiative(mobId, v), () => EncounterState.mobs.find(m => m.id === mobId).initiative],
            player: [(v) => EncounterState.setPlayerCharacterInitiative(pc, v), () => EncounterState.playerCharacters.find(p => p.id === pc).initiative],
            vehicle: [(v) => EncounterState.setVehicleInitiative(veh, v), () => EncounterState.vehicles.find(v2 => v2.id === veh).initiative]
        };
        for (const [kind, [set, read]] of Object.entries(sets)) {
            set('7');
            set('150');
            const afterBig = read();
            set('abc');
            const afterText = read();
            set('');
            const afterEmpty = read();
            set('42');
            check(`${kind} initiative: 150 and abc keep the value, an empty value clears it, 42 sets it`,
                [afterBig, afterText, afterEmpty, read()], [7, 7, null, 42]);
        }
    });

    await group('addIndividual', () => {
        const { EncounterState } = makeApp();
        const out = [21, 0, 2.5].map(q => EncounterState.addIndividual('sly_marbo_aaa', q).length);
        check('addIndividual: a quantity of 21, 0 or 2.5 returns [] and adds no entry',
            { returned: out, entries: EncounterState.individuals.length }, { returned: [0, 0, 0], entries: 0 });
        check('addIndividual: a quantity of 20 adds 20 entries', EncounterState.addIndividual('sly_marbo_aaa', 20).length, 20);
    });

    // ----- The Players box -----
    await group('players box', () => {
        const app = makeApp();
        app.EncounterTab.bindEvents();
        const box = app.document.getElementById('encounter-players');
        const type = (v) => { box.value = v; box._on.change({ target: box }); return { count: app.EncounterState.settings.playerCount, box: String(box.value) }; };
        check('players box: an empty value keeps the count and shows it', type(''), { count: 4, box: '4' });
        check('players box: 11 keeps the count and shows it', type('11'), { count: 4, box: '4' });
        check('players box: abc keeps the count and shows it', type('abc'), { count: 4, box: '4' });
        check('players box: 7 sets the count', type('7'), { count: 7, box: '7' });
    });

    // ----- The initiative box of the encounter list -----
    await group('list initiative', () => {
        const app = makeApp();
        const S = app.EncounterState;
        const [ind] = S.addIndividual('sly_marbo_aaa', 1);
        const pc = S.addPlayerCharacter('Ann');
        const veh = S.addVehicle('chimera');
        app.EncounterTab.renderEncounterList();
        const boxes = app.document.getElementById('encounter-list').querySelectorAll('.initiative-input');
        check('list initiative: the boxes of the list declare 0 to 99', boxes.map(b => [b.min, b.max]), boxes.map(() => ['0', '99']));
        check('list initiative: the list has a box for each kind', boxes.map(b => b.dataset.type).sort(), ['individual', 'player', 'vehicle']);
        const stored = { individual: () => S.individuals[0].initiative, player: () => S.playerCharacters[0].initiative, vehicle: () => S.vehicles[0].initiative };
        for (const box of boxes) {
            const kind = box.dataset.type;
            const type = (v) => { box.value = v; box._on.change({ target: box }); return { stored: stored[kind](), box: String(box.value) }; };
            check(`list initiative ${kind}: 12 is stored`, type('12'), { stored: 12, box: '12' });
            check(`list initiative ${kind}: 150 keeps 12 and the box shows 12`, type('150'), { stored: 12, box: '12' });
            check(`list initiative ${kind}: abc keeps 12 and the box shows 12`, type('abc'), { stored: 12, box: '12' });
            check(`list initiative ${kind}: an empty value clears it`, type(''), { stored: null, box: '' });
        }
    });

    // ----- D1: the player rows -----
    await group('D1 rows', () => {
        const app = makeApp();
        const S = app.EncounterState;
        S.loadFromData(mkEnc({ settings: { tier: 1, playerCount: 2, name: 'x', round: 1 }, playerCharacters: players(3) }));
        app.EncounterTab.renderPlayerCharacterInputs();
        const html = rowsHtml(app);
        check('D1: a lower count keeps each player',
            { rows: count(ROW, html), extra: count(EXTRA, html), mark: count(new RegExp(MARK, 'g'), html), players: S.playerCharacters.length },
            { rows: 3, extra: 1, mark: 1, players: 3 });
        const btns = app.document.getElementById('player-character-inputs').querySelectorAll('.pc-remove-btn');
        check('D1: each remove button has the index of its row', btns.map(b => b.dataset.index), ['0', '1', '2']);
        btns[2]._on.click({ target: btns[2] });
        check('D1: the × of the marked row keeps the count',
            { players: S.playerCharacters.map(p => p.id), count: S.settings.playerCount }, { players: ['p0', 'p1'], count: 2 });
        const btns2 = app.document.getElementById('player-character-inputs').querySelectorAll('.pc-remove-btn');
        btns2[1]._on.click({ target: btns2[1] });
        check('D1: the × of a row inside the count lowers the count',
            { players: S.playerCharacters.map(p => p.id), count: S.settings.playerCount }, { players: ['p0'], count: 1 });
    });

    await group('D1 escapes', () => {
        const app = makeApp();
        const S = app.EncounterState;
        S.loadFromData(mkEnc({ settings: { tier: 1, playerCount: 1, name: 'x', round: 1 },
            playerCharacters: [{ id: '<b>id</b>', name: 'Ann', initiative: '<b>i</b>', notes: '' }] }));
        app.EncounterTab.renderPlayerCharacterInputs();
        check('D1: a player id and an initiative value are escaped in the rows', /<\/?b>/.test(rowsHtml(app)), false);
    });

    // ----- TB3-1: a stored player above the count stays after each load -----
    function verify12(label, app, store) {
        const S = app.EncounterState;
        app.EncounterTab.renderPlayerCharacterInputs();
        const html = rowsHtml(app);
        check(`${label}: the state keeps 12 players and the count is 10, with 2 marked rows`,
            { players: S.playerCharacters.length, count: S.settings.playerCount, rows: count(ROW, html), extra: count(EXTRA, html), mark: count(new RegExp(MARK, 'g'), html) },
            { players: 12, count: 10, rows: 12, extra: 2, mark: 2 });
        app.flush();
        S.markDirty();
        app.flush();
        const saved = store[KEY_ENC] ? JSON.parse(store[KEY_ENC]).encounter.playerCharacters.length : null;
        check(`${label}: the stored key keeps 12 players after the autosave write`, saved, 12);
    }

    await group('TB3-1 start', () => {
        const store = { [KEY_ENC]: JSON.stringify({ encounter: mkEnc({ settings: { tier: 1, playerCount: 12, name: 'x', round: 1 }, playerCharacters: players(12) }), customThreats: [], timestamp: 1 }) };
        const app = makeApp(store);
        app.App.checkAutoSave();
        verify12('TB3-1 start', app, store);
    });

    await group('TB3-1 Load Encounter', () => {
        const store = {};
        const app = makeApp(store);
        app.EncounterState.loadFromData(mkEnc({ settings: { tier: 1, playerCount: 12, name: 'x', round: 1 }, playerCharacters: players(12) }));
        verify12('TB3-1 Load Encounter', app, store);
    });

    await group('TB3-1 Load Players', async () => {
        const store = {};
        const app = makeApp(store);
        app.window.api.loadPlayersFile = async () => ({ success: true, data: { version: 1, playerCount: 12, players: players(12).map(p => ({ name: p.name, notes: '' })) }, fileName: 'P' });
        await app.EncounterTab.handleLoadPlayers();
        verify12('TB3-1 Load Players', app, store);
    });

    console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) FAILED.`);
    process.exit(failures ? 1 : 0);
})();
