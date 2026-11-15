// Tests for the escapes at the raw sites of seven tabs (sites S4-S20 of the load check spec, section 8.4).
// Each check puts a hostile value into one field of a character, renders the tab and looks for the raw value.
// Run: node scripts/test-tab-escapes.js

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

const EVIL = '<b>"x\'</b>&';
const EVIL_IMG = '<img src=x onerror=alert(1)>';
const QUOTE_BREAK = '" autofocus onfocus="alert(1)';
const RAW_TAG = /<\/?b>/i;

// A DOM stub. Each element is a stub whose innerHTML setter appends the string to `written`.
// A set of textContent stores the text. A read of innerHTML after that returns the text with only
// & < > escaped, as a browser does (the quote stays raw). The DOM escape helpers of the tabs need this.
function makeRecordingDocument() {
    const written = [];
    const byId = {};
    function makeElement() {
        let html = '';
        let text = null;
        const el = {
            style: {},
            dataset: {},
            value: '',
            className: '',
            classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
            addEventListener() {},
            appendChild(child) { return child; },
            querySelector() { return makeElement(); },
            querySelectorAll() { return []; },
            closest() { return null; },
            set textContent(v) { text = String(v); html = ''; },
            get textContent() { return text === null ? html : text; },
            set innerHTML(v) { html = String(v); text = null; written.push(html); },
            get innerHTML() {
                if (text === null) return html;
                return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            }
        };
        return el;
    }
    const document = {
        getElementById(id) { return byId[id] || (byId[id] = makeElement()); },
        querySelector() { return makeElement(); },
        querySelectorAll() { return []; },
        createElement() { return makeElement(); },
        body: { appendChild(child) { return child; } }
    };
    return { document, written };
}

// Runs a source file into a context. A top-level const stays visible to the later files of the context.
function load(ctx, rel) {
    vm.runInContext(readSource(rel), ctx, { filename: rel });
}

// Reads a global (also a const global) out of a context.
function get(ctx, name) {
    return vm.runInContext(name, ctx);
}

// --- context 1: the tabs with a stub State ---
const CACHE = {};
for (const f of ['species.json', 'archetypes.json', 'ascension-packages.json', 'keyword-categories.json',
    'injuries-corruption.json', 'psychic-powers.json', 'weapons.json', 'armor.json', 'equipment.json'])
    CACHE[f] = readJson(`data/${f}`);

const rec = makeRecordingDocument();
const character = {
    species: { id: 'human', xpCost: 0, subOptions: [] },
    languages: ['low_gothic'],
    freeLanguages: [],
    unlockedDisciplines: [],
    traumaticInjuries: [],
    archetypeKeywordChoices: {},
    ascensions: [],
    archetype: { id: 'inquisitorial_acolyte' },
    customArchetype: null,
    wargear: [],
    followers: []
};
const state = {
    character,
    getCharacter: () => state.character,
    getPsykerConfig: () => ({ disciplineChoices: 1 }),
    getRemainingDisciplineChoices: () => 0,
    getUnlockedDisciplines: () => [],
    getSpeciesSubOptions: () => state.character.species.subOptions,
    getSpeciesSubOptionsByType: t => state.character.species.subOptions.filter(o => o.type === t),
    getWargearBudgetUsed: () => 0,
    getWargearBudget: () => ({ totalValue: 15, maxValue: null, maxRarity: null }),
    isSourceEnabled: () => true,
    getKrootMutationCount: () => 1,
    canAddCustomWargear: () => true,
    getFreePowerChoiceStatus: () => [],
    getExtraKeywordKeys: () => []
};
const ctx = vm.createContext({ console, document: rec.document, State: state });
load(ctx, 'creator/js/data-loader.js');
get(ctx, 'DataLoader').cache = CACHE;
load(ctx, 'creator/js/keyword-bonus.js');
load(ctx, 'creator/js/followers.js');
for (const f of ['followers', 'archetype', 'ascension', 'background', 'injuries', 'powers', 'species'])
    load(ctx, `creator/tabs/${f}-tab.js`);
const DataLoader = get(ctx, 'DataLoader');
const FollowersTab = get(ctx, 'FollowersTab');
const ArchetypeTab = get(ctx, 'ArchetypeTab');
const AscensionTab = get(ctx, 'AscensionTab');
const BackgroundTab = get(ctx, 'BackgroundTab');
const InjuriesTab = get(ctx, 'InjuriesTab');
const PowersTab = get(ctx, 'PowersTab');
const SpeciesTab = get(ctx, 'SpeciesTab');

// Runs one render with a fresh record. Returns the joined text of all innerHTML writes plus the returned value.
function record(fn) {
    rec.written.length = 0;
    const returned = fn();
    return rec.written.join('') + (typeof returned === 'string' ? returned : '');
}

// --- S4-S6: follower id ---
check('S4-S6 follower id is escaped in data-follower-id and name',
    RAW_TAG.test(FollowersTab.renderRosterItem({ id: EVIL, threatId: 'x', name: '', kind: 'mob', count: 2, livingCount: 1, notes: '' }, character)), false);

// --- S7, S8: archetype keyword choices ---
const acolyte = DataLoader.getArchetype('inquisitorial_acolyte');
check('S7 [ORDO] custom keyword value cannot break the attribute',
    ArchetypeTab.renderKeywordChoices(acolyte, { ...character, archetypeKeywordChoices: { '[ORDO]': QUOTE_BREAK } }).includes(QUOTE_BREAK), false);
check('S8 [ANY] text keyword value cannot break the attribute',
    ArchetypeTab.renderKeywordChoices(acolyte, { ...character, archetypeKeywordChoices: { '[ANY]': QUOTE_BREAK } }).includes(QUOTE_BREAK), false);

// --- S9-S11: custom archetype ---
{
    state.character = { ...character, archetype: { id: 'custom' },
        customArchetype: { name: QUOTE_BREAK, abilityArchetypeId: null, keywords: [EVIL], wargear: [EVIL] } };
    ArchetypeTab.currentTier = 1;
    const joined = record(() => ArchetypeTab.renderCustomConfig());
    check('S9-S10 custom keywords and unknown starting wargear are escaped', RAW_TAG.test(joined), false);
    check('S11 custom archetype name cannot break the value attribute', joined.includes(QUOTE_BREAK), false);
    state.character = character;
}

// --- S12-S14: ascension keyword choices ---
{
    const packages = CACHE['ascension-packages.json'];
    const patron = packages.find(p => p.id === 'demanding_patron');
    const html1 = AscensionTab.renderKeywordChoiceUI(patron, { targetTier: 2 },
        { targetTier: 2, type: 'package', packageId: 'demanding_patron', choices: { '[ANY]': QUOTE_BREAK, '[ANY]2': QUOTE_BREAK } });
    check('S13-S14 ascension keyword choices cannot break the value attribute', html1.includes(QUOTE_BREAK), false);
    const agent = packages.find(p => p.id === 'agent_of_inquisition_aoa');
    const html2 = AscensionTab.renderKeywordChoiceUI(agent, { targetTier: 2 },
        { targetTier: 2, type: 'package', packageId: 'agent_of_inquisition_aoa', choices: { '[ORDO]': QUOTE_BREAK } });
    check('S12 [ORDO] custom choice cannot break the value attribute', html2.includes(QUOTE_BREAK), false);
}

// --- S15: language in data-lang ---
{
    state.character = { ...character, languages: ['low_gothic', QUOTE_BREAK] };
    const joined = record(() => BackgroundTab.renderLanguages());
    check('S15 language cannot break data-lang', joined.includes('data-lang="' + QUOTE_BREAK), false);
    state.character = character;
}

// --- S16: injury side ---
{
    const data = DataLoader.getInjuriesCorruptionData();
    const html = InjuriesTab.renderTraumaticInjuries(
        { traumaticInjuries: [{ id: data.traumaticInjuries[0].id, side: EVIL }] }, data);
    check('S16 injury side is escaped', RAW_TAG.test(html), false);
}

// --- S17: discipline chip and data-discipline ---
{
    state.character = { ...character, unlockedDisciplines: [EVIL] };
    const html = PowersTab.renderSetupSection();
    check('S17 discipline is escaped in the chip and in data-discipline', RAW_TAG.test(html), false);
    state.character = character;
}

// --- S18: unknown sub-option id on the species card ---
{
    state.character = { ...character, species: { id: 'human', xpCost: 0, subOptions: [{ type: 'homeworld', optionId: EVIL }] } };
    const joined = record(() => SpeciesTab.render());
    check('S18 unknown sub-option id is escaped on the species card', RAW_TAG.test(joined), false);
    state.character = character;
}

// --- S19: unknown mutation id in the chip list of the modal ---
{
    const kroot = DataLoader.getSpecies('kroot');
    state.character = { ...character, species: { id: 'kroot', xpCost: 0, subOptions: [{ type: 'mutation', optionId: EVIL }] } };
    SpeciesTab.pendingSubOptions = { species: kroot, configs: [].concat(kroot.subOptions), currentIndex: 0 };
    const joined = record(() => SpeciesTab.renderCurrentSubOption());
    check('S19 unknown mutation id is escaped in the chip list', RAW_TAG.test(joined), false);
    state.character = character;
}

// --- the new helpers ---
// A missing helper must show as a FAIL line, not stop the script.
function attempt(fn) {
    try { return fn(); } catch (e) { return `THROWS ${e.message}`; }
}
check('helpers: escapeHtml escapes & < > " \'', attempt(() => AscensionTab.escapeHtml(EVIL)), '&lt;b&gt;&quot;x&#39;&lt;/b&gt;&amp;');
check('helpers: escapeHtml keeps the number 0', attempt(() => AscensionTab.escapeHtml(0)), '0');
check('helpers: escapeHtml gives an empty string for undefined', attempt(() => AscensionTab.escapeHtml(undefined)), '');
for (const [name, tab] of [['InjuriesTab', InjuriesTab], ['PowersTab', PowersTab], ['SpeciesTab', SpeciesTab]])
    check(`helpers: ${name}.escapeHtml escapes & < > " '`, attempt(() => tab.escapeHtml(EVIL)), '&lt;b&gt;&quot;x&#39;&lt;/b&gt;&amp;');
check('helpers: ArchetypeTab.escapeAttr escapes a quote', attempt(() => ArchetypeTab.escapeAttr('a"b')), 'a&quot;b');
check('helpers: BackgroundTab.escapeAttr escapes a quote', attempt(() => BackgroundTab.escapeAttr('a"b')), 'a&quot;b');

// --- S20: prerequisite values on the Ascension tab, through the real State ---
// The character is set on State directly. The load repair (R10) would turn the unknown key choice1 into null,
// and this check must prove the escape alone.
{
    const rec2 = makeRecordingDocument();
    const cache2 = {};
    for (const f of fs.readdirSync(path.join(ROOT, 'data')).filter(n => n.endsWith('.json')))
        cache2[f] = readJson(`data/${f}`);
    const ctx2 = vm.createContext({ console, document: rec2.document, window: {}, localStorage: { getItem() { return null; }, setItem() {} } });
    load(ctx2, 'creator/js/data-loader.js');
    get(ctx2, 'DataLoader').cache = cache2;
    for (const f of ['xp-calculator', 'derived-stats', 'prerequisite', 'state', 'keyword-bonus'])
        load(ctx2, `creator/js/${f}.js`);
    load(ctx2, 'creator/tabs/ascension-tab.js');
    const State2 = get(ctx2, 'State');
    const Ascension2 = get(ctx2, 'AscensionTab');
    const c = State2.createNewCharacter();
    Object.assign(c, { name: 'H', rank: 3, species: { id: 'human', xpCost: 0, subOptions: [] },
        archetype: { id: 'imperial_guardsman', xpCost: 0 },
        ascensions: [{ targetTier: 2, type: 'package', packageId: null, archetypeId: null },
                     { targetTier: 4, type: 'archetype', packageId: null, archetypeId: null }] });
    c.attributes.willpower = EVIL_IMG; c.attributes.strength = EVIL_IMG;
    c.skills.persuasion = EVIL_IMG; c.skills.athletics = EVIL_IMG; c.skills.choice1 = EVIL_IMG;
    State2.character = c;
    Ascension2.render();
    const html = rec2.written.join('');
    check('S20 prerequisite values (have …) are escaped, also for the unknown key choice1', html.includes('<img'), false);
    check('S20 fixture reaches the (have …) text', html.includes('(have '), true);
}

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
