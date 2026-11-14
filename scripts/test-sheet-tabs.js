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

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
