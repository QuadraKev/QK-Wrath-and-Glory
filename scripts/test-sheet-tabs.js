// Tests for the Character Sheet tabs (issue #25).
//
// Loads the real creator/tabs/character-sheet-tab.js in a vm sandbox with hand-written stubs.
// The shared helpers are at file scope. Each task adds its checks in its own block below.
// Run: node scripts/test-sheet-tabs.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ===== Shared helpers =====

const ROOT = path.join(__dirname, '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const readSource = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let failures = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const INJURIES = readJson('data/injuries-corruption.json');

const EVIL = '<b>"x\'</b>&';
const SAFE = '&lt;b&gt;&quot;x&#39;&lt;/b&gt;&amp;';
const SAFE_UPPER = '&lt;B&gt;&quot;X&#39;&lt;/B&gt;&amp;';
const RAW_TAG = /<\/?b>/i;

const DERIVED = { maxWounds: 11, maxShock: 8, defence: 3, resilience: 6, determination: 3, speed: 6, conviction: 3, resolve: 2, passiveAwareness: 2, influence: 1 };

function makeCharacter(over) {
    const attributes = { strength: 3, toughness: 3, agility: 3, initiative: 3, willpower: 3, intellect: 3, fellowship: 3 };
    return {
        name: 'Kaelen', tier: 1, rank: 1, species: { id: 'human' }, archetype: { id: 'warrior' },
        attributes, skills: {}, wargear: [], talents: [], mutations: [], ascensions: [], followers: [], notes: '',
        ...over
    };
}

function makeState(character) {
    const state = {
        character, keywords: [], tier: 1, psyker: false, wounds: 0, shock: 0, wrath: 2, wealth: 0, faith: 0, maxFaith: 0,
        calls: [],
        getCharacter: () => state.character,
        getKeywords: () => state.keywords,
        getEffectiveTier: () => state.tier,
        isPsyker: () => state.psyker,
        getCurrentWounds: () => state.wounds,
        getCurrentShock: () => state.shock,
        getCurrentWrath: () => state.wrath,
        getCurrentWealth: () => state.wealth,
        getCurrentFaith: () => state.faith,
        getMaxFaith: () => state.maxFaith,
        getFollower: () => null
    };
    for (const name of ['setCurrentWounds', 'setCurrentShock', 'modifyCurrentWrath', 'modifyCurrentWealth',
        'modifyCurrentFaith', 'setNotes', 'toggleWeaponEquipped', 'updateFollower']) {
        state[name] = (...args) => { state.calls.push([name, ...args]); };
    }
    return state;
}

function makeDataLoader() {
    return {
        getSpecies: () => null,
        getArchetype: () => null,
        getInjuriesCorruptionData: () => INJURIES,
        getBackgrounds: () => null,
        getAscensionPackages: () => [],
        areThreatsLoaded: () => true,
        ensureThreatsLoaded: () => Promise.resolve()
    };
}

function stubEl({ cls = [], data = {}, attrs = {}, parent = null, rect = null, display = 'block' } = {}) {
    const classes = new Set(cls);
    const attributes = { ...attrs };
    const el = {
        parent,
        dataset: { ...data },
        listeners: {},
        focusCalls: [],
        disabled: false,
        scrollLeft: 0,
        offsetLeft: 0,
        offsetWidth: 0,
        clientWidth: 0,
        _display: display,
        classList: {
            contains: (c) => classes.has(c),
            add: (...names) => { names.forEach(c => classes.add(c)); },
            remove: (...names) => { names.forEach(c => classes.delete(c)); },
            toggle: (c, force) => {
                const on = force === undefined ? !classes.has(c) : !!force;
                if (on) classes.add(c); else classes.delete(c);
                return on;
            }
        },
        getAttribute: (name) => {
            if (name in attributes) return attributes[name];
            if (name.startsWith('data-')) {
                const key = name.slice(5).replace(/-([a-z])/g, (m, ch) => ch.toUpperCase());
                if (key in el.dataset) return el.dataset[key];
            }
            return null;
        },
        setAttribute: (name, value) => { attributes[name] = String(value); },
        removeAttribute: (name) => { delete attributes[name]; },
        hasAttribute: (name) => name in attributes,
        toggleAttribute: (name, force) => {
            const on = force === undefined ? !(name in attributes) : !!force;
            if (on) attributes[name] = ''; else delete attributes[name];
            return on;
        },
        closest: (sel) => {
            if (sel.startsWith('.') && classes.has(sel.slice(1))) return el;
            return el.parent ? el.parent.closest(sel) : null;
        },
        addEventListener: (type, fn) => { (el.listeners[type] = el.listeners[type] || []).push(fn); },
        focus: (opts) => { el.focusCalls.push(opts); },
        getBoundingClientRect: () => rect
    };
    Object.defineProperty(el, 'hidden', {
        get: () => 'hidden' in attributes,
        set: (value) => { if (value) attributes.hidden = ''; else delete attributes.hidden; }
    });
    Object.defineProperty(el, 'tabIndex', {
        get: () => ('tabindex' in attributes ? Number(attributes.tabindex) : -1),
        set: (value) => { attributes.tabindex = String(value); }
    });
    return el;
}

function makeDom() {
    const scroller = Object.assign(stubEl(), { scrollTop: 0 });
    const body = stubEl();
    const container = stubEl();
    let html = '';
    const document = {
        activeElement: body,
        getElementById: (id) => {
            if (id === 'character-sheet-content') return container;
            if (id === 'tab-character-sheet') return scroller;
            if (id === 'btn-print' || id === 'btn-copy-summary') return stubEl();
            return null;
        },
        querySelector: () => null,
        addEventListener: () => {}
    };
    Object.defineProperty(container, 'innerHTML', {
        get: () => html,
        set: (value) => {
            html = value;
            scroller.scrollTop = 0;
            document.activeElement = body;
        }
    });
    container.query = () => [];
    container.querySelectorAll = (sel) => container.query(sel);
    container.querySelector = (sel) => container.query(sel)[0] || null;
    container.contains = (el) => !!el && el !== body;
    const window = { getComputedStyle: (el) => ({ display: el._display }) };
    function MutationObserver() { this.observe = () => {}; }
    return { document, window, MutationObserver, container, scroller, body };
}

function sheetSandbox({ character, dom } = {}) {
    const theDom = dom || makeDom();
    const env = { dom: theDom, derived: { ...DERIVED } };
    env.state = makeState(character || makeCharacter());
    env.dataLoader = makeDataLoader();
    const derivedStats = {
        getArmorBreakdown: () => null,
        getResilienceBreakdown: () => null,
        getDefenceBreakdown: () => null,
        getAllDerivedStats: () => env.derived
    };
    env.ctx = vm.createContext({
        console,
        State: env.state,
        DataLoader: env.dataLoader,
        DerivedStats: derivedStats,
        document: theDom.document,
        window: theDom.window,
        MutationObserver: theDom.MutationObserver
    });
    // A top-level const does not attach to the vm global, so read the object as a trailing expression.
    env.sheet = vm.runInContext(readSource('creator/tabs/character-sheet-tab.js') + '\n;CharacterSheetTab;', env.ctx);
    return env;
}

const BLOCK_TITLES = {
    renderDetails: 'Details', renderAscensions: 'Ascension', renderInjuriesCorruption: 'Injuries & Corruption',
    renderBackground: 'Background', renderAttributes: 'Attributes', renderTraits: 'Traits', renderSkills: 'Skills',
    renderSpeciesAbilities: 'Species Abilities', renderArchetypeAbilities: 'Archetype Abilities',
    renderTalents: 'Talents', renderMutations: 'Mutations', renderWeapons: 'Weapons', renderArmor: 'Armor',
    renderAugmetics: 'Augmetics', renderEquipment: 'Equipment', renderHolyRelics: 'Holy Relics',
    renderPsychicPowers: 'Psychic Powers', renderFollowers: 'Followers', renderNotes: 'Notes'
};

function stubBlocks(sheet) {
    const originals = {};
    for (const [name, title] of Object.entries(BLOCK_TITLES)) {
        originals[name] = sheet[name];
        sheet[name] = () => `<div class="sheet-section"><h2 class="sheet-section-title">${title}</h2></div>`;
    }
    return function restore() {
        for (const [name, fn] of Object.entries(originals)) sheet[name] = fn;
    };
}

function titlesIn(html) {
    const titles = [];
    const re = /<(\w+)\b[^>]*class="[^"]*\bsheet-section-title\b[^"]*"[^>]*>([\s\S]*?)<\/\1>/g;
    let m;
    while ((m = re.exec(html))) titles.push(m[2].trim());
    return titles;
}

function count(html, re) {
    return (html.match(re) || []).length;
}

function tagOf(html, needle) {
    const at = html.indexOf(needle);
    if (at < 0) return '';
    const start = html.lastIndexOf('<', at);
    const end = html.indexOf('>', at);
    if (start < 0 || end < 0) return '';
    return html.slice(start, end + 1);
}

function mediaBlocks(css, query) {
    const blocks = [];
    let from = 0;
    while (true) {
        const at = css.indexOf('@media', from);
        if (at < 0) break;
        const open = css.indexOf('{', at);
        if (open < 0) break;
        from = open + 1;
        if (css.slice(at + 6, open).trim() !== query.trim()) continue;
        let depth = 1;
        let i = open + 1;
        while (i < css.length && depth > 0) {
            if (css[i] === '{') depth++;
            else if (css[i] === '}') depth--;
            i++;
        }
        blocks.push(css.slice(open + 1, i - 1));
    }
    return blocks;
}

function tabsSection() {
    const css = readSource('creator/css/styles.css');
    const at = css.indexOf('/* ===== Character Sheet Tabs (issue #25) ===== */');
    return at < 0 ? '' : css.slice(at);
}

// --- Task 1: Details block, display-name helpers, Mutations block ---
{
    // Details
    {
        const env = sheetSandbox();
        const sheet = env.sheet;
        env.state.tier = 3;
        env.dataLoader.getArchetype = id => ({ warrior: { name: 'Warrior' }, veteran: { name: 'Veteran' } })[id] || null;
        const ch = makeCharacter({ rank: 2, ascensions: [
            { type: 'archetype', archetypeId: 'veteran', targetTier: 3 },
            { type: 'package', packageId: 'x', targetTier: 4 },
            { type: 'archetype', archetypeId: 'missing', targetTier: 5 }] });
        const html = sheet.renderDetails(ch, { name: 'Human' }, { name: 'Warrior' });
        check('Details has the title', titlesIn(html), ['Details']);
        check('Details carries the print-hide class', html.includes('sheet-details-section'), true);
        check('Details rows', ['<strong>Name:</strong> Kaelen', '<strong>Species:</strong> Human', '<strong>Archetype:</strong> Warrior → Veteran (Tier 3)', '<strong>Tier:</strong> 3', '<strong>Rank:</strong> 2'].map(s => html.replace(/\s+/g, ' ').includes(s)), [true, true, true, true, true]);
        check('Details skips an unresolved ascension archetype', html.includes('Tier 5'), false);
        const plain = sheet.renderDetails(makeCharacter({ name: '', rank: undefined }), null, null).replace(/\s+/g, ' ');
        check('Details defaults', [plain.includes('<strong>Name:</strong> Unnamed Character'), plain.includes('<strong>Rank:</strong> 1'), plain.includes('<strong>Species:</strong> -')], [true, true, true]);
        // Escape: name, species, custom archetype name are EVIL
        const evil = makeCharacter({ name: EVIL, archetype: { id: 'custom' }, customArchetype: { name: EVIL } });
        const dHtml = sheet.renderDetails(evil, { name: EVIL }, null);
        check('Details escapes name, species and custom archetype', dHtml.split(SAFE).length - 1, 3);
        check('Details holds no raw <b>', RAW_TAG.test(dHtml), false);
        // An ascension archetype name is character text too
        env.dataLoader.getArchetype = id => (id === 'evil' ? { name: EVIL } : null);
        const ascHtml = sheet.renderDetails(makeCharacter({ ascensions: [{ type: 'archetype', archetypeId: 'evil', targetTier: 2 }] }), { name: 'Human' }, { name: 'Warrior' });
        check('Details escapes an ascension archetype name', [ascHtml.split(SAFE).length - 1, RAW_TAG.test(ascHtml)], [1, false]);
        // Strip identity
        env.state.keywords = [EVIL.toUpperCase()];
        const hHtml = sheet.renderHeader(evil, { name: EVIL }, null, env.state.keywords);
        check('renderHeader escapes name, species and archetype', hHtml.split(SAFE).length - 1, 3);
        check('renderHeader escapes keywords', hHtml.includes(SAFE_UPPER), true);
        check('renderHeader holds no raw <b>', RAW_TAG.test(hHtml), false);
        check('renderHeader keeps its classes', ['sheet-section sheet-header-section', 'sheet-character-name', 'sheet-subtitle', 'sheet-keywords', 'sheet-keyword'].every(c => hHtml.includes(c)), true);
    }

    // Display-name helpers
    {
        const { sheet } = sheetSandbox();
        const astartes = { name: 'Adeptus Astartes', subOptions: [
            { type: 'chapter', options: [{ id: 'ultra', name: 'Ultramarines' }] },
            { type: 'x', countByTier: true, options: [{ id: 'y', name: 'Skip' }] }] };
        const ch = makeCharacter({ species: { id: 'adeptus_astartes', subOptions: [{ type: 'chapter', optionId: 'ultra' }, { type: 'x', optionId: 'y' }] } });
        check('getSpeciesDisplayName adds the chapter and skips a countByTier option', sheet.getSpeciesDisplayName(ch, astartes), 'Adeptus Astartes (Ultramarines)');
        check('getSpeciesDisplayName gives a dash for no species', sheet.getSpeciesDisplayName(makeCharacter(), null), '-');
        check('getSpeciesDisplayName gives the plain name without sub-options', sheet.getSpeciesDisplayName(makeCharacter(), { name: 'Human' }), 'Human');
        check('getSpeciesDisplayName returns raw text', sheet.getSpeciesDisplayName(makeCharacter(), { name: EVIL }), EVIL);
        const custom = (name) => makeCharacter({ archetype: { id: 'custom' }, customArchetype: { name } });
        check('getArchetypeDisplayName gives the custom name', sheet.getArchetypeDisplayName(custom('Gunner'), { name: 'Warrior' }), 'Gunner');
        check('getArchetypeDisplayName gives the default for an empty custom name', sheet.getArchetypeDisplayName(custom(''), null), 'Custom Archetype');
        check('getArchetypeDisplayName gives the archetype name', sheet.getArchetypeDisplayName(makeCharacter(), { name: 'Warrior' }), 'Warrior');
        check('getArchetypeDisplayName gives a dash for no archetype', sheet.getArchetypeDisplayName(makeCharacter(), null), '-');
    }

    // Mutations split (real INJURIES data)
    {
        const witheredOnly = makeCharacter({ mutations: [{ id: 'withered' }] });
        const env = sheetSandbox({ character: witheredOnly });
        const sheet = env.sheet;
        check('Injuries block is empty for a character with only mutations', sheet.renderInjuriesCorruption(witheredOnly), '');
        const mHtml = sheet.renderMutations(witheredOnly);
        check('Mutations block has the title', titlesIn(mHtml), ['Mutations']);
        check('Mutations block keeps the item markup', [mHtml.includes('sheet-mutation-item'), mHtml.includes('sheet-mutation-name'), mHtml.includes('Withered')], [true, true, true]);

        const both = makeCharacter({ corruption: 3, mutations: [{ id: 'withered' }] });
        const iHtml = sheet.renderInjuriesCorruption(both);
        check('Injuries block still shows corruption', titlesIn(iHtml), ['Injuries & Corruption']);
        check('Injuries block holds no mutation', [iHtml.includes('sheet-mutation-item'), iHtml.includes('>Mutations<')], [false, false]);

        check('Mutations block is empty for no mutations', sheet.renderMutations(makeCharacter({ mutations: [] })), '');
        env.dataLoader.getInjuriesCorruptionData = () => null;
        check('Mutations block is empty without injuries data', sheet.renderMutations(witheredOnly), '');
    }
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
