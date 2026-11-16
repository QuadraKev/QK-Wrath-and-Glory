// Tests for the settings storage and the Load confirm (bug pass spec §12; task 18).
// The enabled sources and "Ignore Prerequisites" persist under their own key, also for a blank character,
// and New Character keeps them. A start reads the old place in the autosave when the new key is missing.
// A stored source list that is not a list does not stop the start (A17).
// Load asks a confirm after the file pick, and a cancel puts back the file handle of web-api.js (CC6, CC17).
// The confirm asks only for a file with a character, and a load that fails also puts the handle back (TC18-3, TC18-4).
// App.init does not start when character-check.js did not load (TB3-2).
// Run: node scripts/test-settings-persist.js

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

const DATA = {};
for (const f of ['glossary.json', 'weapons.json', 'armor.json', 'equipment.json', 'backgrounds.json'])
    DATA[f] = readJson(`data/${f}`);

function load(ctx, rel) {
    vm.runInContext(readSource(rel), ctx, { filename: rel });
}
function get(ctx, name) {
    return vm.runInContext(name, ctx);
}

const SETTINGS_KEY = 'wng-creator-settings';
const AUTO_SAVE_KEY = 'wng-creator-autosave';
const DEFAULT_SOURCES = ['core', 'fspg', 'redacted1', 'redacted2', 'church', 'voa', 'aeldari', 'apocrypha', 'dh', 'shotguns', 'lex'];
const MESSAGE = 'The app did not load completely. Reload the page.';

// A valid character with the name that the caller gives.
function character(name) {
    return {
        name, tier: 2, rank: 2, additionalXp: 40, setting: 'Gilead', notes: '',
        species: { id: 'human', xpCost: 0, subOptions: [] },
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

// A localStorage stub on a shared Map. writes counts each setItem and removeItem call.
function storageOn(map) {
    const storage = {
        writes: 0,
        getItem: key => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => { storage.writes++; map.set(key, String(value)); },
        removeItem: key => { storage.writes++; map.delete(key); }
    };
    return storage;
}

// A localStorage whose getItem and setItem throw (a blocked storage).
const throwingStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); }
};

// A generic element stub. Each listener goes into handlers under "<id>:<type>".
function element(id, handlers) {
    return {
        id, style: {}, textContent: '', innerHTML: '',
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        addEventListener(type, fn) { handlers[`${id}:${type}`] = fn; }
    };
}

// A context with data-loader.js, custom-wargear.js, character-check.js (unless noCheck), state.js,
// character-io.js and app.js. App.switchTab and App.switchSection are no-ops.
function appSandbox(storage, { noCheck = false, globals = {} } = {}) {
    const handlers = {};
    const api = {
        showOpenDialog: async () => ({ canceled: false, filePaths: ['Vex.character'] }),
        importCharacter: async () => ({ success: true, character: character('Vex') }),
        showMessage: async () => {}
    };
    const ctx = vm.createContext({
        console: { log() {}, info() {}, error() {}, warn() {} },
        localStorage: storage,
        setTimeout: () => 0,
        clearTimeout: () => {},
        document: {
            body: { textContent: '' },
            addEventListener() {},
            querySelectorAll: () => [],
            getElementById: id => element(id, handlers)
        },
        SettingsTab: { sourceButtons: [{ id: 'core' }, { id: 'fspg' }], refresh() {}, init() {} },
        SettingTab: { refresh() {}, init() {} },
        window: { api, addEventListener() {} },
        location: { hash: '' },
        ...globals
    });
    load(ctx, 'creator/js/data-loader.js');
    get(ctx, 'DataLoader').cache = DATA;
    load(ctx, 'creator/js/custom-wargear.js');
    if (!noCheck) load(ctx, 'creator/js/character-check.js');
    load(ctx, 'creator/js/state.js');
    load(ctx, 'creator/js/character-io.js');
    load(ctx, 'creator/js/app.js');
    const State = get(ctx, 'State'), App = get(ctx, 'App'), CharacterIO = get(ctx, 'CharacterIO');
    State.character = State.createNewCharacter();
    App.switchTab = () => {};
    App.switchSection = () => {};
    return { ctx, State, App, CharacterIO, api, handlers };
}

const readKey = (map, key) => (map.has(key) ? JSON.parse(map.get(key)) : null);

async function main() {

// A16: a source change on a blank character persists, and New Character keeps it
{
    const map = new Map();
    const { State } = appSandbox(storageOn(map));
    State.setEnabledSources(['core']);
    check('A16: the settings key holds the sources of a blank character', readKey(map, SETTINGS_KEY)?.enabledSources, ['core']);
    State.newCharacter();
    check('A16: New Character keeps the settings key', readKey(map, SETTINGS_KEY)?.enabledSources, ['core']);
    const next = appSandbox(storageOn(map));
    next.App.checkAutoSave();
    check('A16: a new start reads the sources from the settings key', next.State.enabledSources, ['core']);
    check('A16: a start with no character is not dirty (P14a)', next.State.isDirty, false);
}

// Fallback: only the old autosave holds the settings
{
    const map = new Map();
    const stored = JSON.stringify({ character: character('Kaelen'), enabledSources: ['core'], knownSources: ['core', 'fspg'], ignorePrerequisites: true });
    map.set(AUTO_SAVE_KEY, stored);
    const { State, App } = appSandbox(storageOn(map));
    App.checkAutoSave();
    check('fallback: the sources come from the old autosave', State.enabledSources, ['core']);
    check('fallback: ignorePrerequisites comes from the old autosave', State.ignorePrerequisites, true);
    check('fallback: the autosaved character loads', State.character.name, 'Kaelen');
    check('fallback: the settings key now exists', map.has(SETTINGS_KEY), true);
    check('fallback: the settings key holds the sources and the house rule',
        [readKey(map, SETTINGS_KEY)?.enabledSources, readKey(map, SETTINGS_KEY)?.ignorePrerequisites], [['core'], true]);
    check('fallback: the autosave stays as it was', map.get(AUTO_SAVE_KEY) === stored, true);
}

// P7a: empty storage
{
    const map = new Map();
    const { State, App } = appSandbox(storageOn(map));
    let threw = null; try { App.checkAutoSave(); } catch (e) { threw = e.message; }
    check('P7a: an empty storage does not throw', threw, null);
    check('P7a: an empty storage keeps the default sources', State.enabledSources, DEFAULT_SOURCES);
    check('P7a: an empty storage is not dirty', State.isDirty, false);
}

// P7b: both keys; the settings come from the settings key, the character from the autosave
{
    const map = new Map();
    map.set(SETTINGS_KEY, JSON.stringify({ enabledSources: ['fspg'] }));
    map.set(AUTO_SAVE_KEY, JSON.stringify({ character: character('Kaelen'), enabledSources: ['core'] }));
    const { State, App } = appSandbox(storageOn(map));
    App.checkAutoSave();
    check('P7b: the sources come from the settings key', State.enabledSources, ['fspg']);
    check('P7b: the character comes from the autosave', State.character.name, 'Kaelen');
}

// TC18-2: a start with only the settings key refreshes the Settings tab; an empty storage does not
for (const [label, stored, expected] of [['only the settings key', { enabledSources: ['core'] }, 1], ['an empty storage', null, 0]]) {
    const map = new Map();
    if (stored) map.set(SETTINGS_KEY, JSON.stringify(stored));
    const { ctx, App } = appSandbox(storageOn(map));
    let refreshes = 0;
    ctx.SettingsTab.refresh = () => { refreshes++; };
    App.checkAutoSave();
    check(`TC18-2: a start with ${label} calls SettingsTab.refresh ${expected} time(s)`, refreshes, expected);
}

// TC18-2: only the value true turns Ignore Prerequisites on
for (const value of [1, 'yes']) {
    const map = new Map();
    map.set(SETTINGS_KEY, JSON.stringify({ enabledSources: ['core'], ignorePrerequisites: value }));
    const { State, App } = appSandbox(storageOn(map));
    App.checkAutoSave();
    check(`TC18-2: ignorePrerequisites ${JSON.stringify(value)} does not turn the house rule on`, State.ignorePrerequisites, false);
}

// P7c: a storage that throws
{
    const { State, App } = appSandbox(throwingStorage);
    let threw = null; try { App.checkAutoSave(); } catch (e) { threw = e.message; }
    check('P7c: checkAutoSave with a blocked storage does not throw', threw, null);
    threw = null; try { State.setEnabledSources(['core']); } catch (e) { threw = e.message; }
    check('P7c: setEnabledSources with a blocked storage does not throw', threw, null);
}

// A17: a stored source value that is not a list does not stop the start
for (const value of [{}, 5, true, 'core']) {
    const map = new Map();
    map.set(AUTO_SAVE_KEY, JSON.stringify({ character: character('Kaelen'), enabledSources: value }));
    const { State, App } = appSandbox(storageOn(map));
    let threw = null; try { App.checkAutoSave(); } catch (e) { threw = e.message; }
    check(`A17: enabledSources ${JSON.stringify(value)} does not throw`, threw, null);
    check(`A17: enabledSources ${JSON.stringify(value)} keeps the default sources`, State.enabledSources, DEFAULT_SOURCES);
    check(`A17: enabledSources ${JSON.stringify(value)} still restores the character`, State.character.name, 'Kaelen');
}
{
    const map = new Map();
    map.set(AUTO_SAVE_KEY, JSON.stringify({ character: character('Kaelen'), enabledSources: ['core', 5], knownSources: ['core', 'fspg'] }));
    const { State, App } = appSandbox(storageOn(map));
    App.checkAutoSave();
    check('A17: only the string entries of enabledSources apply', State.enabledSources, ['core']);
}

// CC6: CharacterIO.load asks the confirm after the file pick
{
    const { State, CharacterIO, api } = appSandbox(storageOn(new Map()));
    let cancels = 0;
    api.cancelOpen = () => { cancels++; };
    State.loadCharacter(character('Kaelen'));
    const before = State.character;
    let seen = null;
    const result = await CharacterIO.load(async name => { seen = name; return false; });
    check('CC6: a declined confirm keeps the character', [State.character === before, State.character.name], [true, 'Kaelen']);
    check('CC6: a declined confirm gives "Load cancelled."', result.error, 'Load cancelled.');
    check('CC6: the confirm gets the file name', seen, 'Vex.character');
    check('TC18-1: a declined confirm calls cancelOpen once', cancels, 1);
    await CharacterIO.load();
    check('CC6: a load with no confirm loads the file', State.character.name, 'Vex');
    check('TC18-1: an accepted load does not call cancelOpen', cancels, 1);
}

// TC18-3, TC18-4: the confirm asks only for a file with a character, and a load that fails puts the file handle back
{
    const NO_CHARACTER = 'The file does not contain a character.';
    // Runs one load with the import result that the caller gives. Returns the confirm calls, the cancelOpen calls,
    // the result and the name of the character after the load.
    async function loadWith(importResult, { canceledPick = false } = {}) {
        const { State, CharacterIO, api } = appSandbox(storageOn(new Map()));
        let cancels = 0, confirms = 0;
        api.cancelOpen = () => { cancels++; };
        if (canceledPick) api.showOpenDialog = async () => ({ canceled: true });
        api.importCharacter = async () => importResult();
        State.loadCharacter(character('Kaelen'));
        const result = await CharacterIO.load(async () => { confirms++; return true; });
        return { confirms, cancels, result, name: State.character.name };
    }
    const notJson = await loadWith(() => ({ success: false, error: 'Failed to read file: Unexpected token' }));
    check('TC18-3: a file that is not JSON gets no confirm', notJson.confirms, 0);
    check('TC18-4: a file that is not JSON calls cancelOpen once', notJson.cancels, 1);
    check('TC18-4: a file that is not JSON keeps Kaelen', notJson.name, 'Kaelen');
    const noCharacter = await loadWith(() => ({ success: true, character: null }));
    check('TC18-3: a file with no character object gets no confirm', noCharacter.confirms, 0);
    check('TC18-3: a file with no character object gives the error text of the gate', noCharacter.result, { success: false, error: NO_CHARACTER });
    check('TC18-4: a file with no character object calls cancelOpen once', noCharacter.cancels, 1);
    const canceled = await loadWith(() => ({ success: true, character: character('Vex') }), { canceledPick: true });
    check('TC18-4: a cancelled picker does not call cancelOpen', [canceled.cancels, canceled.result.error], [0, 'Load cancelled.']);
    const loaded = await loadWith(() => ({ success: true, character: character('Vex') }));
    check('TC18-3: a file with a character gets one confirm', loaded.confirms, 1);
    check('TC18-4: a load that succeeds does not call cancelOpen', [loaded.cancels, loaded.name], [0, 'Vex']);
}

// CC17: a cancel puts back the file handle that was there before the pick
{
    function handle(name) {
        const h = { name, writes: [] };
        h.getFile = async () => ({ name, text: async () => '{}' });
        h.createWritable = async () => ({ write: async data => { h.writes.push(data); }, close: async () => {}, abort: async () => {} });
        return h;
    }
    const h1 = handle('h1.character'), h2 = handle('h2.character');
    const picks = [h1, h2];
    const wctx = vm.createContext({
        console: { log() {}, info() {}, error() {}, warn() {} },
        navigator: { userAgent: 'Node' },
        document: { createElement: () => ({}), body: { appendChild() {}, removeChild() {} } },
        window: { showOpenFilePicker: async () => [picks.shift()], addEventListener() {} }
    });
    load(wctx, 'creator/js/web-api.js');
    const api = get(wctx, 'window').api;
    await api.showOpenDialog();
    await api.showOpenDialog();
    let threw = null; try { api.cancelOpen(); } catch (e) { threw = e.message; }
    check('CC17: cancelOpen exists and does not throw', threw, null);
    await api.exportCharacter({ name: 'x' });
    check('CC17: a Save after the cancel writes to the file of the first pick', [h1.writes.length, h2.writes.length], [1, 0]);
}

// CC6 through the Load button of the header
{
    const { State, App, api, handlers } = appSandbox(storageOn(new Map()));
    App.initHeaderButtons();
    const fire = handlers['btn-load:click'];
    State.loadCharacter(character('Kaelen'));
    let asked = null;
    api.showConfirm = async text => { asked = text; return false; };
    await fire();
    check('button: a declined confirm keeps Kaelen', State.character.name, 'Kaelen');
    check('button: the confirm names the file', typeof asked === 'string' && asked.includes('Vex.character'), true);
    api.showConfirm = async text => { asked = text; return true; };
    await fire();
    check('button: an accepted confirm loads Vex', State.character.name, 'Vex');
    State.character = State.createNewCharacter();
    let called = false;
    api.showConfirm = async () => { called = true; return true; };
    await fire();
    check('button: a blank character gets no confirm', called, false);
    check('button: a blank character loads Vex', State.character.name, 'Vex');
}

// TB3-2: App.init does not start when CharacterCheck did not load
{
    const map = new Map();
    const stored = JSON.stringify({ character: character('Kaelen'), enabledSources: ['core'], knownSources: ['core', 'fspg'] });
    map.set(AUTO_SAVE_KEY, stored);
    const storage = storageOn(map);
    const tabs = {};
    for (const name of ['SpeciesTab', 'ArchetypeTab', 'AscensionTab', 'StatsTab', 'TalentsTab', 'WargearTab', 'PowersTab',
        'BackgroundTab', 'InjuriesTab', 'FollowersTab', 'NotesTab', 'CharacterSheetTab', 'GlossaryTab', 'ReferencesTab'])
        tabs[name] = { init() {}, refresh() {} };
    const { ctx, State, App } = appSandbox(storage, { noCheck: true, globals: { Glossary: { init: async () => {} }, ...tabs } });
    const DataLoader = get(ctx, 'DataLoader');
    let loadAllCalls = 0;
    DataLoader.loadAll = async () => { loadAllCalls++; return {}; };
    let restored = 0;
    const realLoad = State.loadCharacter;
    State.loadCharacter = function (data) { restored++; return realLoad.call(this, data); };
    let threw = null; try { await App.init(); } catch (e) { threw = e.message; }
    check('TB3-2: no CharacterCheck: App.init does not throw', threw, null);
    check('TB3-2: no CharacterCheck: the page shows the message', get(ctx, 'document').body.textContent, MESSAGE);
    check('TB3-2: no CharacterCheck: no game data load and no restore', [loadAllCalls, restored], [0, 0]);
    check('TB3-2: no CharacterCheck: no State listener', State.listeners.length, 0);
    check('TB3-2: no CharacterCheck: no storage write', storage.writes, 0);
    check('TB3-2: no CharacterCheck: the autosave key is unchanged', map.get(AUTO_SAVE_KEY) === stored, true);
}

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) FAILED.`);
process.exit(failures ? 1 : 0);
}

main();
