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
    // A data-* attribute lives in dataset only, under its camelCase key, as in a browser.
    const dataKey = (name) => (name.startsWith('data-') ? name.slice(5).replace(/-([a-z])/g, (m, ch) => ch.toUpperCase()) : null);
    const dataset = { ...data };
    const attributes = {};
    for (const [name, value] of Object.entries(attrs)) {
        const key = dataKey(name);
        if (key) dataset[key] = String(value); else attributes[name] = value;
    }
    const el = {
        parent,
        dataset,
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
            const key = dataKey(name);
            if (key) return key in el.dataset ? el.dataset[key] : null;
            return name in attributes ? attributes[name] : null;
        },
        setAttribute: (name, value) => {
            const key = dataKey(name);
            if (key) el.dataset[key] = String(value); else attributes[name] = String(value);
        },
        removeAttribute: (name) => {
            const key = dataKey(name);
            if (key) delete el.dataset[key]; else delete attributes[name];
        },
        hasAttribute: (name) => {
            const key = dataKey(name);
            return key ? key in el.dataset : name in attributes;
        },
        toggleAttribute: (name, force) => {
            const on = force === undefined ? !el.hasAttribute(name) : !!force;
            if (on) el.setAttribute(name, ''); else el.removeAttribute(name);
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
    const windowListeners = {};
    const window = {
        listeners: windowListeners,
        getComputedStyle: (el) => ({ display: el._display }),
        addEventListener: (type, fn) => { (windowListeners[type] = windowListeners[type] || []).push(fn); }
    };
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
    // Timers wait in a queue: a check runs them with env.runTimers()
    env.timers = [];
    env.runTimers = () => { env.timers.splice(0).forEach(fn => fn()); };
    env.ctx = vm.createContext({
        console,
        setTimeout: (fn) => { env.timers.push(fn); },
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

// --- Task 2: Pane structure and the strip ---
{
    const PANE_TITLES = {
        character: ['Details', 'Ascension', 'Injuries & Corruption', 'Background'],
        stats: ['Attributes', 'Traits', 'Skills'],
        abilities: ['Species Abilities', 'Archetype Abilities', 'Talents', 'Mutations'],
        wargear: ['Weapons', 'Armor', 'Augmetics', 'Equipment', 'Holy Relics'],
        powers: ['Psychic Powers'], companions: ['Followers'], notes: ['Notes'] };

    // Panes and their wrappers
    {
        const { sheet } = sheetSandbox();
        const ctx = { character: makeCharacter(), species: null, archetype: null, keywords: [], derivedStats: DERIVED, breakdowns: { resilience: null, defence: null } };
        const restore = stubBlocks(sheet);
        try {
            check('SHEET_TABS is the §3 table', sheet.SHEET_TABS, [
                { id: 'character', label: 'Character' }, { id: 'stats', label: 'Stats' },
                { id: 'abilities', label: 'Abilities' }, { id: 'wargear', label: 'Wargear' },
                { id: 'powers', label: 'Psychic Powers' }, { id: 'companions', label: 'Followers' },
                { id: 'notes', label: 'Notes' }]);
            for (const [id, titles] of Object.entries(PANE_TITLES))
                check(`renderPane(${id}) gives its blocks in order`, titlesIn(sheet.renderPane(id, ctx)), titles);
            check('renderPane gives an empty string for an unknown id', sheet.renderPane('nope', ctx), '');

            // Two-column panes: left column from the first to the second column wrapper, right column after it
            const COL = 'class="sheet-pane-column"';
            const columns = (html) => {
                const first = html.indexOf(COL);
                const second = html.indexOf(COL, first + 1);
                return [titlesIn(html.slice(first, second)), titlesIn(html.slice(second))];
            };
            const wrappers = (html) => [count(html, /sheet-pane-columns/g), count(html, /class="sheet-pane-column"/g)];
            const charHtml = sheet.renderPane('character', ctx);
            check('character pane has one column pair', wrappers(charHtml), [1, 2]);
            check('character pane columns', columns(charHtml), [['Details', 'Ascension'], ['Injuries & Corruption', 'Background']]);
            const abilHtml = sheet.renderPane('abilities', ctx);
            check('abilities pane has one column pair', wrappers(abilHtml), [1, 2]);
            check('abilities pane columns', columns(abilHtml), [['Species Abilities', 'Archetype Abilities'], ['Talents', 'Mutations']]);
            const gearHtml = sheet.renderPane('wargear', ctx);
            check('wargear pane has one column pair', wrappers(gearHtml), [1, 2]);
            check('wargear pane has Weapons before the columns', titlesIn(gearHtml.slice(0, gearHtml.indexOf('sheet-pane-columns'))), ['Weapons']);
            check('wargear pane columns', columns(gearHtml), [['Armor', 'Augmetics'], ['Equipment', 'Holy Relics']]);

            const statsHtml = sheet.renderPane('stats', ctx);
            const statCols = statsHtml.split('class="sheet-column"');
            check('stats pane keeps sheet-columns', [count(statsHtml, /class="sheet-columns"/g), statCols.length - 1], [1, 2]);
            check('stats pane columns', [titlesIn(statCols[1]), titlesIn(statCols[2])], [['Attributes', 'Traits'], ['Skills']]);
            check('single-column panes have no column wrapper',
                ['powers', 'companions', 'notes'].map(id => sheet.renderPane(id, ctx).includes('sheet-pane-column')), [false, false, false]);

            sheet.renderAscensions = () => '';
            sheet.renderDetails = () => '';
            check('an empty column still renders', count(sheet.renderPane('character', ctx), /class="sheet-pane-column"/g), 2);
        } finally {
            restore();
        }
    }

    // Tab visibility (spec §10.1 case 2)
    {
        const env = sheetSandbox();
        const sheet = env.sheet;
        const areThreatsLoaded = env.dataLoader.areThreatsLoaded;
        try {
            check('visible tabs by default', sheet.getVisibleSheetTabs(makeCharacter()), ['character', 'stats', 'abilities', 'wargear', 'notes']);
            env.state.psyker = true;
            check('a psyker sees powers', sheet.getVisibleSheetTabs(makeCharacter()), ['character', 'stats', 'abilities', 'wargear', 'powers', 'notes']);
            env.state.psyker = true;
            check('a psyker with a follower sees powers before companions', sheet.getVisibleSheetTabs(makeCharacter({ followers: [{ id: 'f1' }] })),
                ['character', 'stats', 'abilities', 'wargear', 'powers', 'companions', 'notes']);
            env.state.psyker = false;
            const withFollower = makeCharacter({ followers: [{ id: 'f1' }] });
            check('a follower shows companions', sheet.getVisibleSheetTabs(withFollower), ['character', 'stats', 'abilities', 'wargear', 'companions', 'notes']);
            env.dataLoader.areThreatsLoaded = () => false;
            check('companions shows while threats load', sheet.getVisibleSheetTabs(withFollower), ['character', 'stats', 'abilities', 'wargear', 'companions', 'notes']);
        } finally {
            env.dataLoader.areThreatsLoaded = areThreatsLoaded;
        }
    }

    // render(): the strip, then one pane per visible tab
    {
        const env = sheetSandbox();
        const sheet = env.sheet;
        const restore = stubBlocks(sheet);
        try {
            env.state.psyker = true;
            sheet.render();
            const html = env.dom.container.innerHTML;
            const ids = [...html.matchAll(/id="sheet-pane-([a-z]+)"/g)].map(m => m[1]);
            const visible = ['character', 'stats', 'abilities', 'wargear', 'powers', 'notes'];
            check('render writes one pane per visible tab, in order', ids, visible);
            check('render gives every block in pane order', titlesIn(html), visible.flatMap(id => PANE_TITLES[id]));
            check('the strip comes before the panes, with no sheet-body', [html.indexOf('class="sheet-strip"') >= 0, html.indexOf('class="sheet-strip"') < html.indexOf('class="sheet-panes"'), html.includes('sheet-body')], [true, true, false]);
        } finally {
            restore();
        }
    }

    // The strip (spec §10.1 case 4)
    {
        const env = sheetSandbox();
        const sheet = env.sheet;
        const restore = stubBlocks(sheet);
        try {
            Object.assign(env.state, { wounds: 3, shock: 1, wrath: 4, keywords: ['IMPERIUM', 'ASTRA MILITARUM'] });
            sheet.render();
            const html = env.dom.container.innerHTML;
            check('11 Wounds boxes', count(html, /data-type="wounds" data-index=/g), 11);
            check('3 filled Wounds boxes', count(html, /tracking-box filled" data-type="wounds"/g), 3);
            check('8 Shock boxes, 1 filled', [count(html, /data-type="shock" data-index=/g), count(html, /tracking-box filled" data-type="shock"/g)], [8, 1]);
            check('one Wrath pair with labels', [count(html, /data-type="wrath"/g), html.includes('aria-label="Remove Wrath"'), html.includes('aria-label="Add Wrath"')], [2, true, true]);
            check('Wrath value 4 in the strip', /sheet-strip-wrath[\s\S]*?tracker-value">4</.test(html), true);
            check('identity outside the bar, trackers inside', [html.indexOf('sheet-character-name') < html.indexOf('sheet-strip-bar'), html.indexOf('sheet-strip-bar') < html.indexOf('data-type="wounds"'), html.lastIndexOf('data-type="wrath"') < html.indexOf('class="sheet-panes"')], [true, true, true]);
            check('one chip per keyword', count(html, /class="sheet-keyword"/g), 2);
            check('subtitle has Tier and Rank', [/sheet-subtitle[\s\S]*?Tier 1[\s\S]*?Rank 1/.test(html)], [true]);
            check('Wrath buttons are never disabled', /data-type="wrath"[^>]*disabled|disabled[^>]*data-type="wrath"/.test(html), false);
            check('Wrath buttons are type="button"', [tagOf(html, 'aria-label="Remove Wrath"').includes('type="button"'), tagOf(html, 'aria-label="Add Wrath"').includes('type="button"')], [true, true]);
            check('strip labels carry tracker-label', count(html, /class="sheet-strip-label tracker-label"/g), 2);

            env.state.wrath = 0;
            sheet.render();
            check('Wrath "−" at 0 is not disabled', tagOf(env.dom.container.innerHTML, 'aria-label="Remove Wrath"').includes('disabled'), false);

            env.derived.maxWounds = 50;
            sheet.render();
            check('50 max Wounds gives 50 boxes', count(env.dom.container.innerHTML, /data-type="wounds" data-index=/g), 50);

            // Zero max (Review Focus)
            env.derived.maxWounds = 0;
            env.derived.maxShock = 0;
            sheet.render();
            const zero = env.dom.container.innerHTML;
            check('zero max: no boxes, both labels, Wrath pair',
                [count(zero, /data-type="wounds"/g), count(zero, /data-type="shock"/g),
                    zero.includes('sheet-strip-label tracker-label">Wounds<'), zero.includes('sheet-strip-label tracker-label">Shock<'),
                    count(zero, /data-type="wrath"/g)],
                [0, 0, true, true, 2]);
        } finally {
            restore();
        }
    }

    // Traits keeps the trait grid, Faith and Wealth only
    {
        const env = sheetSandbox();
        const html = env.sheet.renderTraits(DERIVED, {});
        check('Traits has no boxes, no Wrath, has Wealth, no Faith',
            [html.includes('tracking-box'), html.includes('data-type="wrath"'), html.includes('data-type="wealth"'), html.includes('data-type="faith"')],
            [false, false, true, false]);
        env.state.maxFaith = 2;
        check('Traits has Faith when the max Faith is above 0', env.sheet.renderTraits(DERIVED, {}).includes('data-type="faith"'), true);
    }

    // Box clicks (spec §10.1 case 5)
    {
        const env = sheetSandbox();
        const sheet = env.sheet;
        const boxes = [
            stubEl({ cls: ['tracking-box'], data: { type: 'wounds', index: '4' } }),
            stubEl({ cls: ['tracking-box', 'filled'], data: { type: 'wounds', index: '1' } }),
            stubEl({ cls: ['tracking-box'], data: { type: 'shock', index: '2' } }),
            stubEl({ cls: ['tracking-box', 'filled'], data: { type: 'shock', index: '0' } })
        ];
        const query = env.dom.container.query;
        const render = sheet.render;
        let renders = 0;
        try {
            env.dom.container.query = sel => (sel === '.tracking-box:not(.follower-box)' ? boxes : []);
            sheet.render = () => { renders++; };
            sheet.bindSessionTrackingControls(env.dom.container);
            boxes.forEach(box => box.listeners.click.forEach(fn => fn()));
            check('box clicks set Wounds and Shock', env.state.calls,
                [['setCurrentWounds', 5], ['setCurrentWounds', 1], ['setCurrentShock', 3], ['setCurrentShock', 0]]);
            check('each box click renders', renders, 4);
        } finally {
            env.dom.container.query = query;
            sheet.render = render;
        }
    }
}

// --- Task 3: Tab bar, selection, keyboard ---
{
    const IDS5 = ['character', 'stats', 'abilities', 'wargear', 'notes'];
    const ALL7 = ['character', 'stats', 'abilities', 'wargear', 'powers', 'companions', 'notes'];
    const LABELS7 = ['Character', 'Stats', 'Abilities', 'Wargear', 'Psychic Powers', 'Followers', 'Notes'];

    const tabButtons = (ids) => ids.map(id => stubEl({ cls: ['sheet-tab-btn'], data: { sheetTab: id }, attrs: { 'aria-selected': 'false', tabindex: '-1' } }));
    const tabPanes = (ids) => ids.map(id => Object.assign(stubEl({ cls: ['sheet-pane'] }), { id: 'sheet-pane-' + id }));

    // Markup (spec §10.1 cases 3, 8, 9)
    {
        const env = sheetSandbox();
        const sheet = env.sheet;
        const restore = stubBlocks(sheet);
        try {
            sheet.render();
            const first = env.dom.container.innerHTML;
            check('default activeSheetTab is stats', sheet.activeSheetTab, 'stats');
            check('tablist has its aria-label', tagOf(first, 'role="tablist"').includes('aria-label="Character sheet sections"'), true);
            const at = (needle) => first.indexOf(needle);
            check('the tab bar lies in the bar, after the trackers and before the panes',
                [at('class="sheet-strip-bar"') < at('sheet-strip-trackers'), at('sheet-strip-trackers') < at('class="sheet-tabbar"'), at('class="sheet-tabbar"') < at('class="sheet-panes"')],
                [true, true, true]);

            env.state.psyker = true;
            env.state.character.followers = [{ id: 'f1' }];
            sheet.activeSheetTab = 'wargear';
            sheet.render();
            const html = env.dom.container.innerHTML;
            check('button labels in order', [...html.matchAll(/data-sheet-tab="[a-z]+"[^>]*>([^<]+)</g)].map(m => m[1].trim()), LABELS7);
            for (const id of ALL7) {
                const on = id === 'wargear';
                const btn = tagOf(html, 'id="sheet-tab-' + id + '"');
                check(`tab ${id} markup`,
                    [btn.includes('role="tab"'), btn.includes('type="button"'), btn.includes('class="sheet-tab-btn' + (on ? ' active"' : '"')),
                        btn.includes('aria-controls="sheet-pane-' + id + '"'), btn.includes('data-sheet-tab="' + id + '"'),
                        btn.includes('aria-selected="' + on + '"'), btn.includes(on ? 'tabindex="0"' : 'tabindex="-1"')],
                    [true, true, true, true, true, true, true]);
                const pane = tagOf(html, 'id="sheet-pane-' + id + '"');
                check(`pane ${id} markup`,
                    [pane.includes('role="tabpanel"'), pane.includes('aria-labelledby="sheet-tab-' + id + '"'), pane.includes('tabindex="0"'), / hidden/.test(pane)],
                    [true, true, true, !on]);
            }
            check('all seven panes are in the HTML in tab order', [...html.matchAll(/id="sheet-pane-([a-z]+)"/g)].map(m => m[1]), ALL7);

            // Fallback (Review Focus): the selected tab disappears
            for (const gone of ['powers', 'companions']) {
                env.state.psyker = false;
                env.state.character.followers = [];
                sheet.activeSheetTab = gone;
                sheet.render();
                const fb = env.dom.container.innerHTML;
                const shown = [...fb.matchAll(/<div class="sheet-pane"[^>]*>/g)].map(m => m[0]).filter(t => !/ hidden/.test(t)).map(t => (t.match(/id="(sheet-pane-[a-z]+)"/) || [])[1]);
                check(`fallback from ${gone}: stats is active`, sheet.activeSheetTab, 'stats');
                check(`fallback from ${gone}: one selected tab, stats`,
                    [count(fb, /aria-selected="true"/g), tagOf(fb, 'id="sheet-tab-stats"').includes('aria-selected="true"')], [1, true]);
                check(`fallback from ${gone}: only the stats pane shows`, shown, ['sheet-pane-stats']);
            }
        } finally {
            restore();
        }
    }

    // _nextSheetTabId (spec §10.1 case 8)
    {
        const { sheet } = sheetSandbox();
        check('ArrowRight wraps from the last tab', sheet._nextSheetTabId(IDS5, 'notes', 'ArrowRight'), 'character');
        check('ArrowLeft wraps from the first tab', sheet._nextSheetTabId(IDS5, 'character', 'ArrowLeft'), 'notes');
        check('Home gives the first tab', sheet._nextSheetTabId(IDS5, 'wargear', 'Home'), 'character');
        check('End gives the last tab', sheet._nextSheetTabId(IDS5, 'wargear', 'End'), 'notes');
        check('ArrowRight gives the next tab', sheet._nextSheetTabId(IDS5, 'stats', 'ArrowRight'), 'abilities');
        check('ArrowLeft gives the previous tab', sheet._nextSheetTabId(IDS5, 'stats', 'ArrowLeft'), 'character');
        check('another key gives null', sheet._nextSheetTabId(IDS5, 'stats', 'a'), null);
        check('an undefined current id gives null', sheet._nextSheetTabId(IDS5, undefined, 'ArrowRight'), null);
        check('a current id outside the list gives null', sheet._nextSheetTabId(IDS5, 'powers', 'ArrowRight'), null);
    }

    // handleSheetTabKeydown (spec §10.1 case 8 and Review Focus)
    {
        const keyEvent = (key, target) => {
            const e = { key, target, prevented: 0, preventDefault() { e.prevented++; } };
            return e;
        };
        for (const mode of ['buttons', 'textarea']) {
            const env = sheetSandbox();
            const sheet = env.sheet;
            const buttons = tabButtons(IDS5);
            const query = env.dom.container.query;
            const selectSheetTab = sheet.selectSheetTab;
            const recorded = [];
            try {
                env.dom.container.query = sel => (sel === '.sheet-tab-btn' ? buttons : []);
                sheet.selectSheetTab = id => { recorded.push(id); };
                const byId = id => buttons.find(b => b.dataset.sheetTab === id);
                if (mode === 'buttons') {
                    sheet.activeSheetTab = 'stats';
                    const e = keyEvent('ArrowRight', byId('notes'));
                    sheet.handleSheetTabKeydown(e);
                    check('ArrowRight on the notes button selects character', recorded, ['character']);
                    check('the character button gets the focus once', buttons.map(b => b.focusCalls.length), [1, 0, 0, 0, 0]);
                    check('the handled key calls preventDefault', e.prevented, 1);
                    check('the current tab comes from the button, not activeSheetTab', sheet.activeSheetTab, 'stats');

                    recorded.length = 0;
                    const other = keyEvent('a', byId('stats'));
                    sheet.handleSheetTabKeydown(other);
                    check('another key records nothing and keeps the default', [recorded, other.prevented, buttons.map(b => b.focusCalls.length)], [[], 0, [1, 0, 0, 0, 0]]);
                } else {
                    // The Notes textarea sits inside #character-sheet-content, so the keys reach the listener
                    const textarea = stubEl({ cls: ['sheet-notes-input'] });
                    sheet.activeSheetTab = 'notes';
                    const events = ['ArrowRight', 'ArrowLeft', 'Home', 'End'].map(k => keyEvent(k, textarea));
                    events.forEach(e => sheet.handleSheetTabKeydown(e));
                    check('textarea keys select no tab', recorded, []);
                    check('textarea keys focus no button', buttons.map(b => b.focusCalls.length), [0, 0, 0, 0, 0]);
                    check('textarea keys keep their default', events.map(e => e.prevented), [0, 0, 0, 0]);
                    check('textarea keys keep the active tab', sheet.activeSheetTab, 'notes');
                }
            } finally {
                env.dom.container.query = query;
                sheet.selectSheetTab = selectSheetTab;
            }
        }
    }

    // selectSheetTab (spec §10.1 case 8, §5.3)
    {
        const run = ({ panesTop, display, barDisplay = 'block', closeGlossary = true }) => {
            const env = sheetSandbox();
            const sheet = env.sheet;
            const buttons = tabButtons(IDS5);
            const panes = tabPanes(IDS5);
            const panesEl = stubEl({ cls: ['sheet-panes'], rect: { top: panesTop } });
            const strip = stubEl({ cls: ['sheet-strip'], display, rect: { bottom: 300 } });
            const bar = stubEl({ cls: ['sheet-strip-bar'], display: barDisplay, rect: { bottom: 150 } });
            const tabbar = stubEl({ cls: ['sheet-tabbar'], rect: { bottom: 50 } });
            env.dom.scroller.scrollTop = 900;
            const map = { '.sheet-tab-btn': buttons, '.sheet-pane': panes, '.sheet-panes': [panesEl], '.sheet-strip': [strip], '.sheet-strip-bar': [bar], '.sheet-tabbar': [tabbar] };
            env.dom.container.query = sel => map[sel] || [];
            const counters = { render: 0, breakdown: 0, glossary: 0 };
            const render = sheet.render;
            const closeBreakdown = sheet._closeBreakdownPopup;
            try {
                sheet.render = () => { counters.render++; };
                sheet._closeBreakdownPopup = () => { counters.breakdown++; };
                if (closeGlossary) env.ctx.Glossary = { closeAllPopups: () => { counters.glossary++; } };
                sheet.selectSheetTab('wargear');
            } finally {
                sheet.render = render;
                sheet._closeBreakdownPopup = closeBreakdown;
                delete env.ctx.Glossary;
            }
            return { sheet, buttons, panes, counters, scrollTop: env.dom.scroller.scrollTop };
        };

        const a = run({ panesTop: 120, display: 'block' });
        check('selectSheetTab sets activeSheetTab', a.sheet.activeSheetTab, 'wargear');
        check('button aria-selected', a.buttons.map(b => b.getAttribute('aria-selected')), ['false', 'false', 'false', 'true', 'false']);
        check('button tabindex', a.buttons.map(b => b.getAttribute('tabindex')), ['-1', '-1', '-1', '0', '-1']);
        check('button active class', a.buttons.map(b => b.classList.contains('active')), [false, false, false, true, false]);
        check('only the wargear pane is shown', a.panes.map(p => p.hidden), [true, true, true, false, true]);
        check('no re-render, one close per popup kind', [a.counters.render, a.counters.breakdown, a.counters.glossary], [0, 1, 1]);
        check('the pane under the strip scrolls it free (900 + 120 - 300)', a.scrollTop, 720);
        check('a pane below the strip leaves the scroll', run({ panesTop: 400, display: 'block' }).scrollTop, 900);
        check('compact mode pins the bar (900 + 100 - 150)', run({ panesTop: 100, display: 'contents' }).scrollTop, 850);
        check('low mode pins the tab bar only (900 + 40 - 50)', run({ panesTop: 40, display: 'contents', barDisplay: 'contents' }).scrollTop, 890);
        let error = null;
        try { run({ panesTop: 120, display: 'block', closeGlossary: false }); } catch (e) { error = e.message; }
        check('no Glossary in the context gives no error', error, null);
    }

    // init() wiring
    {
        const env = sheetSandbox();
        const sheet = env.sheet;
        const selectSheetTab = sheet.selectSheetTab;
        const handleSheetTabKeydown = sheet.handleSheetTabKeydown;
        const selected = [];
        const keyed = [];
        try {
            sheet.init();
            const listeners = env.dom.container.listeners;
            check('init adds one click and one keydown listener', [(listeners.click || []).length, (listeners.keydown || []).length], [1, 1]);
            sheet.selectSheetTab = id => { selected.push(id); };
            sheet.handleSheetTabKeydown = e => { keyed.push(e.key); };
            const target = stubEl({ cls: ['sheet-tab-btn'], data: { sheetTab: 'notes' } });
            listeners.click[0]({ target });
            listeners.keydown[0]({ key: 'ArrowRight', target });
            const outside = stubEl({ cls: ['sheet-notes-input'] });
            listeners.click[0]({ target: outside });
            check('a click on a tab button selects its tab', selected, ['notes']);
            check('a keydown reaches handleSheetTabKeydown', keyed, ['ArrowRight']);
        } finally {
            sheet.selectSheetTab = selectSheetTab;
            sheet.handleSheetTabKeydown = handleSheetTabKeydown;
        }
    }

    // _scrollActiveTabIntoBar
    {
        const { sheet, dom } = sheetSandbox();
        const query = dom.container.query;
        const scrollTo = ({ scrollLeft, offsetLeft, offsetWidth }) => {
            const bar = Object.assign(stubEl({ cls: ['sheet-tabbar'] }), { scrollWidth: 1000, scrollLeft, clientWidth: 300 });
            const btn = Object.assign(stubEl({ cls: ['sheet-tab-btn', 'active'] }), { offsetLeft, offsetWidth });
            dom.container.query = sel => (sel === '.sheet-tabbar' ? [bar] : sel === '.sheet-tab-btn.active' ? [btn] : []);
            sheet._scrollActiveTabIntoBar(dom.container);
            return bar.scrollLeft;
        };
        try {
            check('a button past the right edge: 4px beyond it', scrollTo({ scrollLeft: 0, offsetLeft: 400, offsetWidth: 80 }), 184);
            check('a button past the left edge: 4px beyond it', scrollTo({ scrollLeft: 100, offsetLeft: 50, offsetWidth: 80 }), 46);
            check('the left target clamps to 0', scrollTo({ scrollLeft: 100, offsetLeft: 2, offsetWidth: 80 }), 0);
            check('the right target clamps to the scroll range', scrollTo({ scrollLeft: 0, offsetLeft: 900, offsetWidth: 98 }), 700);
            check('a button inside the view changes nothing', scrollTo({ scrollLeft: 100, offsetLeft: 150, offsetWidth: 80 }), 100);
            dom.container.query = () => [];
            let error = null;
            try { sheet._scrollActiveTabIntoBar(dom.container); } catch (e) { error = e.message; }
            check('a missing bar gives no error', error, null);
        } finally {
            dom.container.query = query;
        }
    }
}

// --- Task 4: Strip CSS (pinning, the layout modes, boxes, tab buttons, panes, focus) ---
{
    const sec = tabsSection();
    check('section exists', sec.length > 0, true);
    check('hidden panes are hidden on screen', /\.sheet-pane\[hidden\]\s*\{\s*display:\s*none;?\s*\}/.test(sec), true);
    check('focus ring on tabs and tracker buttons', /\.sheet-tab-btn:focus-visible,\s*\.tracker-btn:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent-gold\)[^}]*outline-offset:\s*2px/.test(sec), true);
    const full = mediaBlocks(sec, 'screen').join('\n');
    const compact = mediaBlocks(sec, 'screen and (max-width: 768px), screen and (max-height: 600px)').join('\n');
    check('full mode pins the strip', /\.sheet-strip\s*\{[^}]*position:\s*sticky[^}]*top:\s*0/.test(full), true);
    check('compact mode unwraps the strip and pins the bar', [/\.sheet-strip\s*\{[^}]*display:\s*contents/.test(compact), /\.sheet-strip-bar\s*\{[^}]*position:\s*sticky/.test(compact)], [true, true]);
    check('compact tab bar scrolls sideways', /\.sheet-tabbar\s*\{[^}]*flex-wrap:\s*nowrap[^}]*overflow-x:\s*auto/.test(compact), true);
    const paddingSides = (rule) => {
        const sides = { top: 0, right: 0, bottom: 0, left: 0 };
        const short = rule.match(/(?:^|;)\s*padding:\s*([^;]+)/);
        if (short) { const v = short[1].trim().split(/\s+/).map(parseFloat); [sides.top, sides.right, sides.bottom, sides.left] = [v[0], v[1] ?? v[0], v[2] ?? v[0], v[3] ?? v[1] ?? v[0]]; }
        for (const side of Object.keys(sides)) { const m = rule.match(new RegExp(`padding-${side}:\\s*([\\d.]+)px`)); if (m) sides[side] = parseFloat(m[1]); }
        return sides;
    };
    const barRule = (compact.match(/\.sheet-tabbar\s*\{([^}]*)\}/) || [])[1] || '';
    check('compact tab bar has 4px padding on every side for the focus ring', Object.values(paddingSides(barRule)).every(v => v >= 4), true);
    check('strip labels set no colour', /\.sheet-strip-label\s*\{[^}]*color:/.test(sec), false);
    check('sticky only inside screen blocks', count(sec.replace(/@media screen[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/g, ''), /position:\s*sticky/g), 0);
    check('wide panes are two columns, on the screen only', /\.sheet-pane-columns\s*\{[^}]*grid-template-columns:\s*1fr 1fr/.test(mediaBlocks(sec, 'screen and (min-width: 1400px)').join('')), true);
    // A raw colour: a hex value, rgb()/rgba(), or a colour name in a declaration value (var() names and comments removed)
    const NAMED = /\b(white|black|red|green|blue|yellow|orange|purple|pink|gold|silver|gray|grey|navy|maroon|teal|aqua|cyan|lime|olive|brown|magenta|fuchsia|crimson|indigo|violet)\b/i;
    const hasRawColour = (css) => {
        const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
        if (/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(bare)) return true;
        return [...bare.matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/gi)].some(m => NAMED.test(m[2].replace(/var\([^)]*\)/g, '')));
    };
    check('the colour test finds a named colour', [hasRawColour('a { color: white; }'), hasRawColour('a { border: 1px solid Gold; }'), hasRawColour('a { color: var(--accent-gold); background: transparent; color: currentColor; }')], [true, true, false]);
    check('no raw colour', hasRawColour(sec), false);

    // The pinned part of each mode is opaque and sits at z-index 5; the tracker sizes of each mode
    const ruleOf = (css, selector) => {
        const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return (css.match(new RegExp(`(?:^|[};/])\\s*${esc}\\s*\\{([^}]*)\\}`)) || [])[1] || '';
    };
    const has = (rule, re) => re.test(rule);
    const low = mediaBlocks(sec, 'screen and (max-height: 480px)').join('\n');
    check('full mode: the strip is opaque', has(ruleOf(full, '.sheet-strip'), /background:\s*var\(--bg-primary\)/), true);
    check('full mode: the strip has z-index 5', has(ruleOf(full, '.sheet-strip'), /z-index:\s*5;/), true);
    check('compact mode: the bar is opaque', has(ruleOf(compact, '.sheet-strip-bar'), /background:\s*var\(--bg-primary\)/), true);
    check('compact mode: the bar has z-index 5', has(ruleOf(compact, '.sheet-strip-bar'), /z-index:\s*5;/), true);
    check('full mode tracker grid: label, boxes, Wrath', has(ruleOf(full, '.sheet-strip-trackers'), /grid-template-columns:\s*64px 1fr 112px;/), true);
    check('compact mode tracker grid: label, boxes', has(ruleOf(compact, '.sheet-strip-trackers'), /grid-template-columns:\s*52px 1fr;/), true);
    check('compact mode boxes are 22px', [/width:\s*22px/, /height:\s*22px/].map(re => has(ruleOf(compact, '.sheet-strip-trackers .tracking-box'), re)), [true, true]);
    check('compact mode Wrath buttons are 32px', [/width:\s*32px/, /height:\s*32px/].map(re => has(ruleOf(compact, '.sheet-strip-wrath .tracker-btn'), re)), [true, true]);

    // Low mode (a window 480px high or less): only the tab bar is pinned
    const lowBar = ruleOf(low, '.sheet-strip-bar');
    const lowTabbar = ruleOf(low, '.sheet-tabbar');
    check('low mode unwraps the strip bar, so it is not sticky', [has(lowBar, /display:\s*contents/), has(lowBar, /position:\s*sticky/)], [true, false]);
    check('low mode pins the tab bar', [/position:\s*sticky/, /top:\s*0;/, /background:\s*var\(--bg-primary\)/, /z-index:\s*5;/].map(re => has(lowTabbar, re)), [true, true, true, true]);
    check('low mode tab bar has 4px padding on every side for the focus ring', Object.values(paddingSides(lowTabbar)).every(v => v >= 4), true);

    // The sheet's scroller loses its top padding (a sticky element pins inside it) and the sheet gets the same space
    const rest = readSource('creator/css/styles.css').replace(sec, '');
    const topPad = (css) => {
        const rule = (css.match(/(?:^|[}/])\s*\.tab-fullwidth\s*\{([^}]*)\}/) || [])[1] || '';
        const m = rule.match(/padding-top:\s*([\d.]+)px/) || rule.match(/(?:^|;)\s*padding:\s*([\d.]+)px/);
        return m ? m[1] + 'px' : null;
    };
    const sheetPad = (css) => ((css.match(/#tab-character-sheet \.character-sheet\s*\{[^}]*padding-top:\s*([\d.]+px)/) || [])[1] || null);
    check('the sheet scroller has no top padding on screen', /#tab-character-sheet\s*\{[^}]*padding-top:\s*0;/.test(full), true);
    check('the sheet gets the top padding of the scroller at each breakpoint',
        [sheetPad(full), sheetPad(mediaBlocks(sec, 'screen and (max-width: 768px)').join('\n')), sheetPad(mediaBlocks(sec, 'screen and (max-width: 480px)').join('\n'))],
        [topPad(rest), topPad(mediaBlocks(rest, '(max-width: 768px)').join('\n')), topPad(mediaBlocks(rest, '(max-width: 480px)').join('\n'))]);

    // _pinnedElement follows the computed styles of the three modes
    {
        const env = sheetSandbox();
        const strip = stubEl({ cls: ['sheet-strip'] });
        const bar = stubEl({ cls: ['sheet-strip-bar'] });
        const tabbar = stubEl({ cls: ['sheet-tabbar'] });
        const map = { '.sheet-strip': [strip], '.sheet-strip-bar': [bar], '.sheet-tabbar': [tabbar] };
        env.dom.container.query = sel => map[sel] || [];
        const pinned = (stripDisplay, barDisplay) => {
            strip._display = stripDisplay;
            bar._display = barDisplay;
            const el = env.sheet._pinnedElement(env.dom.container);
            return el === strip ? 'strip' : el === bar ? 'bar' : el === tabbar ? 'tabbar' : String(el);
        };
        check('_pinnedElement: full, compact, low', [pinned('block', 'flex'), pinned('contents', 'flex'), pinned('contents', 'contents')], ['strip', 'bar', 'tabbar']);
    }
}

// --- Task 5: Remove jump-to-section ---
{
    const src = readSource('creator/tabs/character-sheet-tab.js'), css = readSource('creator/css/styles.css');
    check('no TOC member in the sheet module', [/_toc/.test(src), /_assignSectionIds|_buildTocList|_slugifySection|_ensureTocElements|_observeTabVisibility/.test(src)], [false, false]);
    check('no sheet-body in the module', /sheet-body/.test(src), false);
    check('no TOC or sheet-body CSS', [/\.sheet-toc-/.test(css), /\.sheet-body\b/.test(css), /jump-to-section/.test(css)], [false, false, false]);
    check('no tracker-row CSS (class has no markup)', /\.tracker-row(?![-\w])/.test(css), false);
    check('Notes comment no longer mentions the table of contents', /table of contents/i.test(src), false);
    check('escapeHtml stays', /\n    escapeHtml\(text\) \{/.test(src), true);
}

// --- Task 6: Re-render keeps the view ---
{
    // _focusKeyOf (spec §10.1 case 7, §5.2 table)
    {
        const { sheet, dom } = sheetSandbox();
        const follower = stubEl({ cls: ['sheet-follower'], data: { followerId: 'f1' } });
        check('focus key of a tab button', sheet._focusKeyOf(stubEl({ cls: ['sheet-tab-btn'], data: { sheetTab: 'wargear' } })), 'tab:wargear');
        check('focus key of a Wrath +', sheet._focusKeyOf(stubEl({ cls: ['tracker-btn', 'tracker-plus'], data: { type: 'wrath' } })), 'tracker:wrath:plus');
        check('focus key of a Faith -', sheet._focusKeyOf(stubEl({ cls: ['tracker-btn', 'tracker-minus'], data: { type: 'faith' } })), 'tracker:faith:minus');
        check('focus key of an equip checkbox', sheet._focusKeyOf(stubEl({ cls: ['weapon-equip-checkbox'], data: { wargearIndex: '3' } })), 'equip:3');
        check('focus key of a living button', sheet._focusKeyOf(stubEl({ cls: ['follower-living-btn'], data: { delta: '-1' }, parent: follower })), 'living:f1:-1');
        check('no focus key for a living button outside a follower', sheet._focusKeyOf(stubEl({ cls: ['follower-living-btn'], data: { delta: '1' } })), null);
        check('no focus key for a tracking box', sheet._focusKeyOf(stubEl({ cls: ['tracking-box'], data: { type: 'wounds', index: '0' } })), null);
        check('no focus key for body', sheet._focusKeyOf(dom.body), null);
        check('no focus key for null', sheet._focusKeyOf(null), null);
    }

    // render() keeps the scroll, the tab and the focus (spec §10.1 case 7, §5.2)
    {
        const run = ({ focus, matches, disabled = false, inside = true }) => {
            const env = sheetSandbox();
            const sheet = env.sheet;
            const dom = env.dom;
            const restore = stubBlocks(sheet);
            const contains = dom.container.contains;
            const oldPlus = stubEl({ cls: ['tracker-btn', 'tracker-plus'], data: { type: 'wrath' } });
            const newMinus = stubEl({ cls: ['tracker-btn', 'tracker-minus'], data: { type: 'wrath' } });
            const newPlus = stubEl({ cls: ['tracker-btn', 'tracker-plus'], data: { type: 'wrath' } });
            newPlus.disabled = disabled;
            const found = { newMinus, newPlus };
            let error = null;
            try {
                sheet.activeSheetTab = 'wargear';
                dom.scroller.scrollTop = 420;
                dom.document.activeElement = focus === 'body' ? dom.body : oldPlus;
                if (!inside) dom.container.contains = () => false;
                dom.container.query = sel => (sel === sheet._FOCUS_SELECTOR ? matches.map(name => found[name]) : []);
                try { sheet.render(); } catch (e) { error = e.message; }
            } finally {
                restore();
                dom.container.contains = contains;
            }
            return { sheet, dom, newMinus, newPlus, error };
        };

        const a = run({ focus: 'plus', matches: ['newMinus', 'newPlus'] });
        check('render gives no error', a.error, null);
        check('scroll kept', a.dom.scroller.scrollTop, 420);   // the innerHTML stub resets it to 0
        check('Wrath + refocused without scroll', [a.newPlus.focusCalls, a.newMinus.focusCalls], [[{ preventScroll: true }], []]);
        check('tab kept', a.sheet.activeSheetTab, 'wargear');

        const d = run({ focus: 'plus', matches: ['newMinus', 'newPlus'], disabled: true });
        check('a disabled match gets no focus, scroll kept', [d.newPlus.focusCalls, d.newMinus.focusCalls, d.dom.scroller.scrollTop], [[], [], 420]);

        const b = run({ focus: 'body', matches: ['newMinus', 'newPlus'] });
        check('a box click (focus on body) restores no focus, scroll kept', [b.newPlus.focusCalls, b.newMinus.focusCalls, b.dom.scroller.scrollTop], [[], [], 420]);

        const n = run({ focus: 'plus', matches: ['newMinus'] });
        check('no match gives no error and no focus', [n.error, n.newMinus.focusCalls], [null, []]);

        const o = run({ focus: 'plus', matches: ['newMinus', 'newPlus'], inside: false });
        check('focus outside the sheet restores no focus', [o.newPlus.focusCalls, o.newMinus.focusCalls], [[], []]);
    }

    // The Notes box keeps the focus and the caret across a re-render (the threat load re-renders once)
    {
        const notesBox = (start, end) => Object.assign(stubEl({ cls: ['sheet-notes-input'] }), {
            value: 'abcdef', selectionStart: start, selectionEnd: end, ranges: [],
            setSelectionRange(a, b) { this.ranges.push([a, b]); }
        });
        const { sheet } = sheetSandbox();
        check('focus key of the Notes box', sheet._focusKeyOf(notesBox(0, 0)), 'notes');
        for (const [start, end] of [[3, 3], [2, 5]]) {
            const env = sheetSandbox();
            const restore = stubBlocks(env.sheet);
            const oldNotes = notesBox(start, end);
            const newNotes = notesBox(6, 6);
            try {
                env.sheet.activeSheetTab = 'notes';
                env.dom.document.activeElement = oldNotes;
                env.dom.container.query = sel => (sel === env.sheet._FOCUS_SELECTOR || sel === '.sheet-notes-input' ? [newNotes] : []);
                env.sheet.render();
            } finally {
                restore();
            }
            check(`Notes box refocused with the selection ${start}-${end}`, [newNotes.focusCalls, newNotes.ranges], [[{ preventScroll: true }], [[start, end]]]);
        }
    }

    // A fallback to Stats starts the new pane at its top; no fallback keeps the scroll
    {
        const env = sheetSandbox();
        const restore = stubBlocks(env.sheet);
        const scrolls = [];
        try {
            for (const tab of ['companions', 'wargear']) {
                env.sheet.activeSheetTab = tab;   // no follower: companions is not a visible tab
                env.dom.scroller.scrollTop = 420;
                env.sheet.render();
                scrolls.push([env.sheet.activeSheetTab, env.dom.scroller.scrollTop]);
            }
        } finally {
            restore();
        }
        check('a fallback scrolls to 0, no fallback keeps 420', scrolls, [['stats', 0], ['wargear', 420]]);
    }

    // Saved follower values are escaped in renderFollower; the living keys stay unique
    {
        const env = sheetSandbox();
        const id = '"><img src=x onerror=1>';
        const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
        let html = '';
        let evil = '';
        let none = '';
        try {
            env.dataLoader.getThreat = () => ({ name: 'Thug', wounds: 2, shock: 1 });
            env.ctx.Followers = { mobAttackBonus: () => 0, alternativeStatValue: () => 3 };
            env.ctx.ThreatCard = { render: () => '' };
            const follower = { id, threatId: 'thug', name: '', kind: 'mob', count: 3, livingCount: 2, useAlternativeStats: false, currentWounds: null, currentShock: null, notes: '' };
            html = env.sheet.renderFollower(follower, env.state.character);
            evil = env.sheet.renderFollower({ ...follower, id: 'f1', count: EVIL, livingCount: EVIL }, env.state.character);
            none = env.sheet.renderFollower({ ...follower, id: 'f1', livingCount: 0 }, env.state.character);
        } finally {
            env.dataLoader.getThreat = makeDataLoader().getThreat;
            delete env.ctx.Followers;
            delete env.ctx.ThreatCard;
        }
        const attr = (html.match(/data-follower-id="([^"]*)"/) || [])[1];
        check('follower id is escaped, no raw tag', [attr, /<img/i.test(html)], [env.sheet.escapeHtml(id), false]);
        const item = stubEl({ cls: ['sheet-follower'], data: { followerId: decode(attr || '') } });
        const keys = [...html.matchAll(/class="follower-living-btn" data-delta="(-?1)"/g)]
            .map(m => env.sheet._focusKeyOf(stubEl({ cls: ['follower-living-btn'], data: { delta: m[1] }, parent: item })));
        check('the mob buttons get unique living keys with the decoded id', keys, ['living:' + id + ':-1', 'living:' + id + ':1']);
        check('saved living count and count are escaped', [evil.includes(SAFE + ' / ' + SAFE), RAW_TAG.test(evil)], [true, false]);
        check('a living count of 0 still prints 0', none.includes('>0 / 3<'), true);
    }
}

// --- Task 7: Print ---
{
    const sec = tabsSection();
    const print = mediaBlocks(sec, 'print').join('\n');
    const rule = sel => new RegExp(sel.replace(/[.[\]]/g, '\\$&') + '\\s*\\{([^}]*)\\}');
    const printRules = (css) => [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(m => ({ sels: m[1].replace(/\/\*[\s\S]*?\*\//g, '').split(',').map(x => x.trim()), body: m[2] }));
    check('print block exists', print.length > 0, true);
    check('hidden panes print', /display:\s*block\s*!important/.test((print.match(rule('.sheet-pane[hidden]')) || [])[1] || ''), true);
    check('tab bar does not print', /display:\s*none\s*!important/.test((print.match(rule('.sheet-tabbar')) || [])[1] || ''), true);
    check('Details does not print', /display:\s*none\s*!important/.test((print.match(rule('.sheet-details-section')) || [])[1] || ''), true);
    check('strip is static and block in print', [/\.sheet-strip,\s*\.sheet-strip-bar\s*\{[^}]*position:\s*static\s*!important/.test(print), /display:\s*block\s*!important/.test((print.match(rule('.sheet-strip')) || [])[1] || '')], [true, true]);
    check('trackers stay on one page', /page-break-inside:\s*avoid/.test((print.match(rule('.sheet-strip-trackers')) || [])[1] || ''), true);
    check('light theme clears the strip background', /body\.print-light-theme \.sheet-strip,[\s\S]*?background:\s*transparent/.test(print), true);
    check('light theme clears the bar and the trackers too', [/body\.print-light-theme \.sheet-strip-bar,/.test(print), /body\.print-light-theme \.sheet-strip-trackers\s*\{[^}]*border:\s*none/.test(print)], [true, true]);
    // Print never sees a screen rule: no sticky outside screen blocks (the Task 4 check), and the print block does not unpin a rule that is not there
    check('print block has no sticky rule', /sticky/.test(print), false);
    // Page breaks: the Stats blocks print whole, and a block title never stays alone at the foot of a page
    const breakRule = (sel) => printRules(print).filter(r => r.sels.includes(sel)).map(r => r.body).join('\n');
    check('print: the Stats blocks do not split across pages', [/page-break-inside:\s*avoid/.test(breakRule('.sheet-pane .sheet-column .sheet-section')), /(?:^|[;\s])break-inside:\s*avoid/.test(breakRule('.sheet-pane .sheet-column .sheet-section'))], [true, true]);
    check('print: the Stats columns may start on a new page (the old keep-with-header rule no longer has a header above them)', [/page-break-before:\s*auto/.test(breakRule('.sheet-pane .sheet-columns')), /(?:^|[;\s])break-before:\s*auto/.test(breakRule('.sheet-pane .sheet-columns'))], [true, true]);
    check('print: a block title stays with its block', [/page-break-after:\s*avoid/.test(breakRule('.sheet-section-title')), /(?:^|[;\s])break-after:\s*avoid/.test(breakRule('.sheet-section-title'))], [true, true]);
    // The printed trackers line up with the text of the printed cards (15px padding and a 1px border)
    check('print: the tracker block has the inset of the cards', /padding:\s*0 16px/.test(breakRule('.sheet-strip-trackers')), true);

    // The trackers print as rows: a label, then its boxes (or the Wrath value) directly after it, left-aligned
    const printDecls = (sel) => printRules(print).filter(r => r.sels.includes(sel)).map(r => r.body).join('\n');
    const trackers = printDecls('.sheet-strip-trackers');
    check('print trackers: a two-column grid, label then boxes', [/display:\s*grid/.test(trackers), /grid-template-columns:\s*auto 1fr/.test(trackers)], [true, true]);
    check('print Wrath group joins the grid columns', /display:\s*contents/.test(printDecls('.sheet-strip-wrath')), true);
    check('print tracker labels and the Wrath value are left-aligned', [printDecls('.sheet-strip-trackers .tracker-label'), printDecls('.sheet-strip-trackers .tracker-value')].map(d => /text-align:\s*left/.test(d)), [true, true]);
    check('print tracker boxes and controls start at the left', [printDecls('.sheet-strip-trackers .tracking-boxes'), printDecls('.sheet-strip-trackers .tracker-controls')].map(d => /justify-content:\s*flex-start/.test(d)), [true, true]);
    // No grid rule for the tracker container sits outside the @media screen blocks and the @media print block
    const withoutMedia = (css, keep) => {
        let out = '', from = 0;
        while (true) {
            const at = css.indexOf('@media', from);
            if (at < 0) { out += css.slice(from); break; }
            const open = css.indexOf('{', at);
            let depth = 1, i = open + 1;
            while (i < css.length && depth > 0) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; i++; }
            out += css.slice(from, at);
            if (!keep(css.slice(at + 6, open).trim())) out += css.slice(at, i);
            from = i;
        }
        return out;
    };
    const outsideScreenAndPrint = withoutMedia(sec, q => /^screen\b/.test(q) || q === 'print');
    const gridRuleOf = css => printRules(css).filter(r => r.sels.some(x => x.includes('.sheet-strip-trackers') && !x.includes('.sheet-strip-trackers ') ) ).some(r => /grid/.test(r.body));
    check('no tracker grid rule outside the screen and print blocks', gridRuleOf(outsideScreenAndPrint), false);
    check('the tracker grid rule finder sees a top-level rule, a screen rule and a print rule', [gridRuleOf('.sheet-strip-trackers { display: grid; }'), gridRuleOf(mediaBlocks(sec, 'screen').join('\n')), gridRuleOf(print)], [true, true, true]);

    // The light print theme: injury subheads, injury and mutation text, and the mutation card
    const light = (sel) => printRules(mediaBlocks(readSource('creator/css/styles.css'), 'print').join('\n')).filter(r => r.sels.includes('body.print-light-theme ' + sel)).map(r => r.body).join('\n');
    const has = (decl, re) => re.test(decl);
    check('light theme: injury subheads are dark with a light rule', [has(light('.sheet-subsection-title'), /(?:^|[;\s])color:\s*#333\s*!important/), has(light('.sheet-subsection-title'), /border-bottom-color:\s*#ccc\s*!important/)], [true, true]);
    check('light theme: injury and mutation names are black', [light('.sheet-injury-name'), light('.sheet-mutation-name')].map(d => has(d, /(?:^|[;\s])color:\s*#000\s*!important/)), [true, true]);
    check('light theme: injury and mutation descriptions are dark gray', [light('.sheet-injury-desc'), light('.sheet-mutation-desc')].map(d => has(d, /(?:^|[;\s])color:\s*#555\s*!important/)), [true, true]);
    check('light theme: the mutation effect is black', has(light('.sheet-mutation-effect'), /(?:^|[;\s])color:\s*#000\s*!important/), true);
    check('light theme: the mutation card is light', [has(light('.sheet-mutation-item'), /background:\s*#f0f0f0\s*!important/), has(light('.sheet-mutation-item'), /border-color:\s*#ccc\s*!important/)], [true, true]);

    // The Ascension card, the Follower threat card (reached through .sheet-follower) and the equipment cards in print
    const lightFollower = (sel) => light('.sheet-follower ' + sel);
    const bgOf = (d, v) => new RegExp('background:\\s*' + v + '\\s*!important').test(d);
    check('light theme: the Ascension card is light with dark text', [bgOf(light('.sheet-ascension-item'), '#f0f0f0'), has(light('.sheet-ascension-item'), /border-color:\s*#ccc\s*!important/), has(light('.sheet-ascension-name'), /(?:^|[;\s])color:\s*#000\s*!important/), ['.sheet-ascension-tier', '.sheet-ascension-cost', '.sheet-ascension-details'].map(c => has(light(c), /(?:^|[;\s])color:\s*#555\s*!important/)), has(light('.sheet-ascension-keywords'), /(?:^|[;\s])color:\s*#333\s*!important/)], [true, true, true, [true, true, true], true]);
    check('light theme: the Follower threat card is light with dark text', [
        bgOf(lightFollower('.threat-card'), '#fff'), bgOf(lightFollower('.threat-card-header'), '#f5f5f5'),
        ['.threat-stat-table th', '.resilience-row', '.determination-row', '.abilities-header', '.bonuses-header'].map(c => bgOf(lightFollower(c), '#f0f0f0')),
        [bgOf(lightFollower('.threat-stat-table td'), 'transparent'), has(lightFollower('.threat-stat-table td'), /(?:^|[;\s])color:\s*#000\s*!important/)],
        [bgOf(lightFollower('.threat-keyword'), '#eee'), has(lightFollower('.threat-keyword'), /border-color:\s*#333\s*!important/)]
    ], [true, true, [true, true, true, true, true], [true, true], [true, true]]);
    // The borders that keep the light cards readable on paper
    const borderOf = (d, prop, v) => new RegExp(prop + ':\\s*' + v + '\\s*!important').test(d);
    check('light theme: the light cards keep visible borders', [
        borderOf(lightFollower('.threat-card'), 'border-color', '#ccc'), borderOf(lightFollower('.threat-card-header'), 'border-bottom-color', '#333'),
        ['.threat-stat-table th', '.resilience-row', '.determination-row', '.abilities-header', '.bonuses-header'].map(c => borderOf(lightFollower(c), 'border-color', '#ddd')),
        borderOf(lightFollower('.threat-stat-table td'), 'border-color', '#ddd')
    ], [true, true, [true, true, true, true, true], true]);
    // Text that was pale on the dark cards of the screen becomes dark on the light cards
    check('light theme: the follower ability names are black', has(lightFollower('.ability-name'), /(?:^|[;\s])color:\s*#000\s*!important/), true);
    check('light theme: glossary terms in the Mutation and Follower cards are dark', ['.sheet-mutation-item .glossary-term', '.sheet-follower .glossary-term'].map(c => has(light(c), /(?:^|[;\s])color:\s*#333\s*!important/)), [true, true]);
    check('light theme: the mutation severity badges are dark', has(light('.sheet-mutation-severity'), /(?:^|[;\s])color:\s*#333\s*!important/), true);
    check('light theme: the Follower card rules never reach the card outside the sheet', /body\.print-light-theme \.threat-card\s*[,{]/.test(mediaBlocks(readSource('creator/css/styles.css'), 'print').join('\n')), false);
    // In print the equipment group (a tbody) must stay a grid card. A display: contents tbody puts the name, the Effect cell and the value side by side.
    const printAll = mediaBlocks(readSource('creator/css/styles.css'), 'print').join('\n');
    const equipGroup = printRules(printAll).filter(r => r.sels.includes('.sheet-equipment-table .sheet-equip-group')).map(r => r.body).join('\n');
    check('print: an equipment group is a grid card (not display: contents)', [has(equipGroup, /display:\s*grid\s*!important/), has(equipGroup, /width:\s*50%\s*!important/)], [true, true]);
    check('print: an equipment group keeps its padding inside the 50% width', [has(equipGroup, /box-sizing:\s*border-box\s*!important/), has(equipGroup, /padding:\s*8px 10px\s*!important/)], [true, true]);
}

// --- Final review fixes ---
{
    // F3: values from a character file are escaped in the strip and in Details
    {
        const env = sheetSandbox();
        const sheet = env.sheet;
        env.dataLoader.getArchetype = id => (id === 'veteran' ? { name: 'Veteran' } : null);
        const evilRank = makeCharacter({ rank: EVIL });
        const rankHtml = sheet.renderHeader(evilRank, null, null, []) + sheet.renderDetails(evilRank, null, null);
        check('F3: rank is escaped in the subtitle and in Details', [rankHtml.split(SAFE).length - 1, RAW_TAG.test(rankHtml)], [2, false]);
        const tierHtml = sheet.renderDetails(makeCharacter({ ascensions: [{ type: 'archetype', archetypeId: 'veteran', targetTier: EVIL }] }), null, null);
        check('F3: an ascension target tier is escaped in Details', [tierHtml.includes('Veteran (Tier ' + SAFE + ')'), RAW_TAG.test(tierHtml)], [true, false]);
        env.state.wrath = EVIL;
        const wrathHtml = sheet.renderStripTrackers(DERIVED);
        check('F3: the Wrath value is escaped in the strip', [wrathHtml.includes('tracker-value">' + SAFE + '<'), RAW_TAG.test(wrathHtml)], [true, false]);
        env.state.wrath = 0;
        check('F3: a Wrath of 0 prints 0', sheet.renderStripTrackers(DERIVED).includes('tracker-value">0<'), true);
    }

    // F1: a Tab focus inside the panes goes under the pinned part; other focus changes do not move the page
    {
        // The pinned strip ends at y=300 and the sheet is at scroll 900
        const setup = () => {
            const env = sheetSandbox();
            const strip = stubEl({ cls: ['sheet-strip'], rect: { bottom: 300 } });
            const panes = stubEl({ cls: ['sheet-panes'], rect: { top: 120 } });
            const pane = stubEl({ cls: ['sheet-pane'], parent: panes, rect: { top: 50 } });
            const inPane = (top, cls = ['weapon-equip-checkbox']) => stubEl({ cls, parent: pane, rect: { top } });
            const map = { '.sheet-strip': [strip], '.sheet-panes': [panes] };
            env.dom.container.query = sel => map[sel] || [];
            env.dom.scroller.scrollTop = 900;
            env.sheet.init();
            const listeners = env.dom.container.listeners;
            const tabKey = () => listeners.keydown[0]({ key: 'Tab', target: env.dom.body });
            const focusIn = (target) => listeners.focusin[0]({ target });
            return { env, strip, pane, inPane, listeners, tabKey, focusIn };
        };

        const a = setup();
        check('F1: init adds one focusin listener', (a.listeners.focusin || []).length, 1);
        a.tabKey();
        a.focusIn(a.inPane(100));
        check('F1: a Tab focus under the pinned part scrolls it 4px under it (900 + 100 - 300 - 4)', a.env.dom.scroller.scrollTop, 696);

        const b = setup();
        b.tabKey();
        b.focusIn(b.pane);
        check('F1: a Tab focus on the pane puts the pane top directly under the pinned part (900 + 50 - 300)', b.env.dom.scroller.scrollTop, 650);

        const c = setup();
        c.tabKey();
        c.focusIn(c.inPane(400));
        check('F1: a Tab focus below the pinned part keeps the scroll', c.env.dom.scroller.scrollTop, 900);

        const d = setup();
        d.focusIn(d.inPane(100, ['sheet-notes-input']));
        d.focusIn(d.inPane(100));
        check('F1: a mouse focus (no Tab key) on the Notes box or a checkbox keeps the scroll', d.env.dom.scroller.scrollTop, 900);

        const e = setup();
        e.tabKey();
        e.focusIn(stubEl({ cls: ['tracker-btn', 'tracker-plus'], parent: e.strip, rect: { top: 200 } }));
        check('F1: a Tab focus on a control of the pinned part keeps the scroll', e.env.dom.scroller.scrollTop, 900);

        const f = setup();
        f.tabKey();
        f.env.runTimers();
        f.focusIn(f.inPane(100));
        check('F1: the Tab key counts only for its own focus move (the flag clears after it)', f.env.dom.scroller.scrollTop, 900);

        // The focus restore of a re-render calls focus({ preventScroll: true }), which also fires focusin
        const g = setup();
        const box = g.inPane(100);
        box.focus = (opts) => { box.focusCalls.push(opts); g.focusIn(box); };
        g.env.dom.container.query = sel => (sel === g.env.sheet._FOCUS_SELECTOR ? [box] : sel === '.sheet-strip' ? [g.strip] : []);
        Object.assign(box.dataset, { wargearIndex: '0' });
        g.tabKey();
        g.env.sheet._restoreViewState({ scrollTop: 900, focusKey: 'equip:0', selection: null });
        check('F1: the focus restore of a re-render keeps the scroll', [box.focusCalls, g.env.dom.scroller.scrollTop], [[{ preventScroll: true }], 900]);
    }
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
