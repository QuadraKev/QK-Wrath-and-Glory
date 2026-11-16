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
    'bestiary/js/threat-builder-state.js', 'bestiary/js/app.js', 'bestiary/tabs/encounter-tab.js',
    'bestiary/tabs/threats-tab.js', 'bestiary/tabs/threat-builder-tab.js']) SOURCES[rel] = readText(rel);

const tabStub = () => ({ init() {}, refresh() {} });
const classList = () => ({ add() {}, remove() {}, toggle() {}, contains() { return false; } });

// The min and max that the real inputs declare. Two of the five come from bestiary/index.html
// (the Players box and the inject count). The other three come from the markup that the tabs write
// (the detail initiative, the add quantity, the modal count). Other boxes get them from their markup.
const DECLARED = {
    'encounter-players': { min: '1', max: '10' },
    'player-detail-initiative': { min: '0', max: '99' },
    'threat-add-quantity': { min: '1', max: '20' },
    'builder-inject-count': { min: '1', max: '20' },
    'inject-modal-count': { min: '1', max: '20' }
};

// The recording document of scripts/test-tab-escapes.js, with one stable element for each id and selector.
// An element keeps its handlers in _on. querySelectorAll('.class') reads the markup that the last innerHTML
// set wrote, and returns one stable stub for each tag whose class list has the class. Its dataset, value,
// min and max come from the attributes of the tag.
function makeDocument() {
    const created = [];
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
            querySelector(sel) {
                if (!bySel[sel]) {
                    bySel[sel] = makeElement();
                    if (sel[0] === '#') Object.assign(bySel[sel], DECLARED[sel.slice(1)] || {});
                }
                return bySel[sel];
            },
            querySelectorAll(sel) {
                const m = /^(?:\.([\w-]+)|\[([\w-]+)\])$/.exec(sel);
                if (!m) return [];
                if (kids[sel]) return kids[sel];
                const found = [];
                for (const tag of html.match(/<(?:input|button|div|select)\b[^>]*>/g) || []) {
                    const attrs = attrsOf(tag);
                    if (m[1] ? !(attrs.class || '').split(/\s+/).includes(m[1]) : !(m[2] in attrs)) continue;
                    const kid = makeElement();
                    for (const k of Object.keys(attrs)) if (k.startsWith('data-')) kid.dataset[k.slice(5).replace(/-(\w)/g, (x, c) => c.toUpperCase())] = attrs[k];
                    kid.type = attrs.type || '';
                    kid.defaultValue = attrs.value || '';
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
            remove() { el._removed = (el._removed || 0) + 1; },
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
        createElement() { const el = makeElement(); created.push(el); return el; },
        created,
        body: { classList: classList(), appendChild(child) { return child; } }
    };
}

// One page of the app, with the real encounter tab and a store for localStorage.
// With realTabs, the real threats tab and builder tab load too, and App and Glossary are small stubs.
function makeApp(store = {}, realTabs = false) {
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
        Glossary: { init: async () => {}, enhanceDescriptions() {} },
        VehiclesTab: tabStub(), GlossaryTab: tabStub(), ReferencesTab: tabStub(), SettingsTab: tabStub()
    };
    if (realTabs) {
        sandbox.App = { updateThreatCount() {} };
    } else {
        Object.assign(sandbox, { ThreatsTab: tabStub(), ThreatBuilderTab: tabStub() });
    }
    vm.createContext(sandbox);
    const files = ['bestiary/js/data-loader.js', 'bestiary/js/bestiary-check.js', 'bestiary/js/encounter-state.js',
        'bestiary/js/threat-builder-state.js', 'bestiary/tabs/encounter-tab.js'];
    files.push(...(realTabs ? ['bestiary/tabs/threats-tab.js', 'bestiary/tabs/threat-builder-tab.js'] : ['bestiary/js/app.js']));
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
    return {
        EncounterState: get('EncounterState'), EncounterTab: get('EncounterTab'), App: get('App'),
        ThreatsTab: realTabs ? get('ThreatsTab') : null, ThreatBuilderTab: realTabs ? get('ThreatBuilderTab') : null,
        ThreatBuilderState: get('ThreatBuilderState'),
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
            set('-5');
            const afterNegative = read();
            set('');
            const afterEmpty = read();
            set('42');
            check(`${kind} initiative: 150, abc and -5 keep the value, an empty value clears it, 42 sets it`,
                [afterBig, afterText, afterNegative, afterEmpty, read()], [7, 7, 7, null, 42]);
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
            type('12');
            box.validity = { badInput: true };
            check(`list initiative ${kind}: a bad entry (value empty, badInput true) keeps 12 and the box shows 12`, type(''), { stored: 12, box: '12' });
            box.validity = { badInput: false };
            check(`list initiative ${kind}: an emptied box (badInput false) clears it`, type(''), { stored: null, box: '' });
            box.validity = undefined;
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
            playerCharacters: [{ id: '<b>id</b>', name: 'Ann', initiative: null, notes: '' }] }));
        // The load repairs a hostile initiative to null, so the state gets it after the load
        S.playerCharacters[0].initiative = '<b>i</b>';
        app.EncounterTab.renderPlayerCharacterInputs();
        check('D1: a player id and an initiative value are escaped in the rows', /<\/?b>/.test(rowsHtml(app)), false);
    });

    // ----- TB5a-2: a player above the count is not in the list and not in the order -----
    await group('list leaves out the players above the count', () => {
        const app = makeApp();
        const S = app.EncounterState;
        S.loadFromData(mkEnc({ settings: { tier: 1, playerCount: 4, name: 'x', round: 1 }, playerCharacters: players(6) }));
        const ids = () => S.getEncounterListItems().filter(i => i.type === 'player').map(i => i.id);
        check('list: count 4 and 6 players give 4 player items, and the two marked players are not in it',
            { ids: ids(), stored: S.playerCharacters.length }, { ids: ['p0', 'p1', 'p2', 'p3'], stored: 6 });
        S.updateSettings({ playerCount: 6 });
        check('list: after the count goes to 6, all six are in it', ids(), ['p0', 'p1', 'p2', 'p3', 'p4', 'p5']);
        S.updateSettings({ playerCount: 4 });
        S.encounterOrder = [{ type: 'player', id: 'p5' }, { type: 'player', id: 'p2' }, { type: 'player', id: 'ghost' }, { type: 'player', id: 'p0' }];
        let threw = null;
        let items = [];
        try { items = S.getEncounterListItems(); app.EncounterTab.renderEncounterList(); } catch (e) { threw = e.message; }
        check('list: a stored order with an entry of a marked player gives no throw and no hole',
            { threw, ids: items.map(i => i && i.id), order: S.encounterOrder.length }, { threw: null, ids: ['p2', 'p0', 'p1', 'p3'], order: 4 });
        S.updateSettings({ playerCount: 6 });
        check('list: when the count goes up, the player returns at the place of the stored order',
            S.getEncounterListItems().map(i => i.id), ['p5', 'p2', 'p0', 'p1', 'p3', 'p4']);
    });

    // ----- TB5a-6: a drop gives a place in the visible list, and the stored order holds hidden entries -----
    await group('moveItemInOrder with hidden entries', () => {
        const app = makeApp();
        const S = app.EncounterState;
        S.loadFromData(mkEnc({ settings: { tier: 1, playerCount: 4, name: 'x', round: 1 }, playerCharacters: players(6) }));
        const T = S.addVehicle('chimera');
        const entry = (id) => ({ type: id === T ? 'vehicle' : 'player', id });
        const setOrder = () => { S.encounterOrder = ['p4', 'p3', 'p2', 'p1', 'p0', 'p5', T].map(entry); };
        const shown = () => S.getEncounterListItems().map(i => i.id === T ? 'T' : i.id);
        const stored = () => S.encounterOrder.map(e => e.id === T ? 'T' : e.id);
        setOrder();
        check('move: the list shows p3 p2 p1 p0 T before the move', shown(), ['p3', 'p2', 'p1', 'p0', 'T']);
        S.moveItemInOrder('vehicle', T, 1);
        check('move: T dropped between p3 and p2 gives p3 T p2 p1 p0, and p4 and p5 stay stored',
            { list: shown(), p4: stored().includes('p4'), p5: stored().includes('p5'), length: stored().length },
            { list: ['p3', 'T', 'p2', 'p1', 'p0'], p4: true, p5: true, length: 7 });
        setOrder();
        S.moveItemInOrder('vehicle', T, 0);
        check('move: a drop at the first place gives T p3 p2 p1 p0', shown(), ['T', 'p3', 'p2', 'p1', 'p0']);
        setOrder();
        S.moveItemInOrder('player', 'p3', 5);
        check('move: a drop of p3 at the last place gives p2 p1 p0 T p3',
            { list: shown(), length: stored().length }, { list: ['p2', 'p1', 'p0', 'T', 'p3'], length: 7 });
        setOrder();
        S.moveItemInOrder('vehicle', T, 5);
        check('move: a drop of T at the last place keeps the list', shown(), ['p3', 'p2', 'p1', 'p0', 'T']);
    });

    await group('moveItemInOrder with no hidden entry', () => {
        const app = makeApp();
        const S = app.EncounterState;
        S.loadFromData(mkEnc({ settings: { tier: 1, playerCount: 4, name: 'x', round: 1 }, playerCharacters: players(3) }));
        const [ind] = S.addIndividual('sly_marbo_aaa', 1);
        const veh = S.addVehicle('chimera');
        const base = [{ type: 'player', id: 'p2' }, { type: 'individual', id: ind }, { type: 'player', id: 'p0' },
            { type: 'vehicle', id: veh }, { type: 'player', id: 'p1' }];
        // The move of the code before TB5a-6, on a copy of the order
        const oldMove = (order, type, id, newIndex) => {
            const cur = order.findIndex(e => e.type === type && e.id === id);
            const [moved] = order.splice(cur, 1);
            const adjusted = newIndex > cur ? newIndex - 1 : newIndex;
            order.splice(Math.max(0, Math.min(adjusted, order.length)), 0, moved);
            return order.map(e => e.id);
        };
        const diffs = [];
        for (let cur = 0; cur < base.length; cur++) {
            for (let t = 0; t <= base.length; t++) {
                S.encounterOrder = base.map(e => ({ ...e }));
                S.moveItemInOrder(base[cur].type, base[cur].id, t);
                const want = oldMove(base.map(e => ({ ...e })), base[cur].type, base[cur].id, t);
                if (JSON.stringify(S.encounterOrder.map(e => e.id)) !== JSON.stringify(want)) diffs.push([cur, t]);
            }
        }
        check('move: with no hidden entry each move gives the same order as before TB5a-6', diffs, []);
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

    // ----- The other inputs (Task 5b): the add counts, the rename modal, the player initiative boxes -----
    await group('add quantity', () => {
        const app = makeApp({}, true);
        const container = app.document.getElementById('threat-card');
        app.ThreatsTab.bindAddToEncounterEvents(container, 'sly_marbo_aaa');
        const box = container.querySelector('#threat-add-quantity');
        const btn = container.querySelector('#threat-add-to-encounter-btn');
        const type = (v) => { box.value = v; btn._on.click(); return { entries: app.EncounterState.individuals.length, box: String(box.value) }; };
        check('quantity: 25 adds nothing and shows 1', type('25'), { entries: 0, box: '1' });
        check('quantity: abc adds nothing and shows 1', type('abc'), { entries: 0, box: '1' });
        check('quantity: 3 adds 3 entries', type('3'), { entries: 3, box: '1' });
    });

    await group('inject count', () => {
        const app = makeApp({}, true);
        app.ThreatBuilderState.clear();
        app.ThreatBuilderState.updateField('name', 'Q');
        app.ThreatBuilderTab.bindEvents();
        const box = app.document.getElementById('builder-inject-count');
        box.value = '25';
        app.document.getElementById('btn-builder-inject')._on.click();
        check('inject count: 25 adds nothing and shows 1', { entries: app.EncounterState.individuals.length, box: String(box.value) }, { entries: 0, box: '1' });
        box.value = '2';
        app.document.getElementById('btn-builder-inject')._on.click();
        check('inject count: 2 adds 2 entries', app.EncounterState.individuals.length, 2);
    });

    await group('modal count', () => {
        const app = makeApp({}, true);
        app.ThreatBuilderState.clear();
        app.ThreatBuilderState.updateField('name', 'Q');
        app.ThreatBuilderTab.showInjectModal('Q', 2);
        const overlay = app.document.created.find(el => el.className === 'inject-modal-overlay');
        app.document.getElementById('inject-modal-name').value = 'Q';
        const box = app.document.getElementById('inject-modal-count');
        box.value = '25';
        overlay.querySelector('#inject-modal-add')._on.click();
        check('modal count: 25 adds nothing and keeps the modal open',
            { entries: app.EncounterState.individuals.length, removed: overlay._removed || 0, box: String(box.value) }, { entries: 0, removed: 0, box: '2' });
        box.value = '2';
        overlay.querySelector('#inject-modal-add')._on.click();
        check('modal count: 2 adds 2 entries and closes the modal',
            { entries: app.EncounterState.individuals.length, removed: overlay._removed || 0 }, { entries: 2, removed: 1 });
    });

    await group('player row initiative', () => {
        const app = makeApp();
        const S = app.EncounterState;
        S.loadFromData(mkEnc({ settings: { tier: 1, playerCount: 2, name: 'x', round: 1 }, playerCharacters: players(1) }));
        app.EncounterTab.renderPlayerCharacterInputs();
        const boxes = app.document.getElementById('player-character-inputs').querySelectorAll('.pc-initiative-input');
        const type = (box, v) => { box.value = v; box._on.change({ target: box }); return { stored: S.playerCharacters[0].initiative, box: String(box.value), pcs: S.playerCharacters.length }; };
        check('player row initiative: 12 is stored', type(boxes[0], '12'), { stored: 12, box: '12', pcs: 1 });
        check('player row initiative: 150 keeps 12 and the box shows 12', type(boxes[0], '150'), { stored: 12, box: '12', pcs: 1 });
        check('player row initiative: abc keeps 12 and the box shows 12', type(boxes[0], 'abc'), { stored: 12, box: '12', pcs: 1 });
        boxes[0].validity = { badInput: true };
        check('player row initiative: a bad entry (value empty, badInput true) keeps 12 and the box shows 12', type(boxes[0], ''), { stored: 12, box: '12', pcs: 1 });
        boxes[0].validity = { badInput: false };
        check('player row initiative: an emptied box (badInput false) clears it', type(boxes[0], ''), { stored: null, box: '', pcs: 1 });
        boxes[1].validity = { badInput: true };
        const emptyBad = type(boxes[1], '');
        check('player row initiative: a bad entry on an empty row creates no player and shows an empty box', { pcs: emptyBad.pcs, box: emptyBad.box }, { pcs: 1, box: '' });
        boxes[1].validity = undefined;
        const empty = type(boxes[1], '150');
        check('player row initiative: 150 on an empty row creates no player and shows an empty box', { pcs: empty.pcs, box: empty.box }, { pcs: 1, box: '' });
        const none = type(boxes[1], '');
        check('player row initiative: an empty value on an empty row creates no player', none.pcs, 1);
    });

    await group('player detail initiative', () => {
        const app = makeApp();
        const S = app.EncounterState;
        S.loadFromData(mkEnc({ playerCharacters: players(1) }));
        app.EncounterTab.selectedId = 'p0';
        app.EncounterTab.selectionType = 'player';
        app.EncounterTab.renderPlayerDetail(app.document.getElementById('encounter-detail'));
        const box = app.document.getElementById('player-detail-initiative');
        const type = (v) => { box.value = v; box._on.change({ target: box }); return { stored: S.playerCharacters[0].initiative, box: String(box.value) }; };
        check('player detail initiative: 12 is stored', type('12'), { stored: 12, box: '12' });
        check('player detail initiative: 150 keeps 12 and the box shows 12', type('150'), { stored: 12, box: '12' });
        check('player detail initiative: abc keeps 12 and the box shows 12', type('abc'), { stored: 12, box: '12' });
        box.validity = { badInput: true };
        check('player detail initiative: a bad entry (value empty, badInput true) keeps 12 and the box shows 12', type(''), { stored: 12, box: '12' });
        box.validity = { badInput: false };
        check('player detail initiative: an emptied box (badInput false) clears it', type(''), { stored: null, box: '' });
    });

    await group('builder skill fields', () => {
        const app = makeApp({}, true);
        const T = app.ThreatBuilderState;
        T.clear();
        T.threat.parsedSkills.default = 3;
        T.addSkillEntry(T.SKILL_NAMES[0], 3);
        delete T.threat.defence;
        app.ThreatBuilderTab.renderEditor();
        const editor = app.document.getElementById('builder-editor-sections');
        const fixed = editor.querySelectorAll('[data-skill]').find(b => b.dataset.skill === 'default');
        const entryBox = editor.querySelectorAll('.builder-skill-value')[0];
        const defBox = editor.querySelectorAll('[data-field]').find(b => b.dataset.field === 'defence');
        const bad = (box, v) => { box.value = v; box._on.input({ target: box }); box._on.change({ target: box }); };
        bad(fixed, '-2');
        check('skill Default: a bad entry keeps 3 and the box shows 3', { stored: T.threat.parsedSkills.default, box: String(fixed.value) }, { stored: 3, box: '3' });
        bad(fixed, '');
        check('skill Default: an empty entry keeps 3 and the box shows 3', { stored: T.threat.parsedSkills.default, box: String(fixed.value) }, { stored: 3, box: '3' });
        bad(entryBox, '-1');
        check('skill entry: a bad entry keeps 3 and the box shows 3', { stored: T.threat.parsedSkills.entries[0].value, box: String(entryBox.value) }, { stored: 3, box: '3' });
        bad(entryBox, 'abc');
        check('skill entry: abc keeps 3 and the box shows 3', { stored: T.threat.parsedSkills.entries[0].value, box: String(entryBox.value) }, { stored: 3, box: '3' });
        bad(defBox, '-5');
        check('builder field with no stored number: a bad entry shows the rendered value', { stored: T.threat.defence, box: String(defBox.value) }, { stored: undefined, box: '1' });
        // The dropdown change keeps the stored entry, also with a bad text in the value box
        editor.querySelector('.builder-skill-value[data-skill-index="0"]').value = 'abc';
        const select = editor.querySelectorAll('.builder-skill-select')[0];
        select.value = T.SKILL_NAMES[1];
        select._on.change({ target: select });
        check('skill dropdown: a change keeps the stored value of the entry', T.threat.parsedSkills.entries[0], { name: T.SKILL_NAMES[1], value: 3 });
    });

    console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) FAILED.`);
    process.exit(failures ? 1 : 0);
})();
