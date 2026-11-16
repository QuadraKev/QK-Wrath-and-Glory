// Tests for the number inputs (bug pass, spec section 10.2).
// Each setter of a number field accepts only an integer inside the range of its input. A refused value keeps
// the stored value, does not notify, and the input shows the stored value again. Rank is 1 to 3.
// A stored value outside a range stays at a load and at a render.
// Loads the real files with the real State and the real data.
// Run: node scripts/test-number-inputs.js

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

// A DOM stub. Each element is kept by id and records its handlers by event name.
function makeElement() {
    const handlers = {};
    return {
        style: {},
        dataset: {},
        // A real input turns a value into a string
        _value: '',
        get value() { return this._value; },
        set value(v) { this._value = String(v); },
        validity: { badInput: false },
        handlers,
        className: '',
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        addEventListener(evt, fn) { (handlers[evt] = handlers[evt] || []).push(fn); },
        removeEventListener() {},
        children: [],
        appendChild(child) { this.children.push(child); return child; },
        setAttribute() {},
        getAttribute() { return null; },
        focus() {},
        querySelector() { return makeElement(); },
        querySelectorAll() { return []; },
        closest() { return null; },
        contains() { return false; },
        set textContent(v) { this._text = String(v); this._html = ''; },
        get textContent() { return this._text === undefined ? (this._html || '') : this._text; },
        set innerHTML(v) { this._html = String(v); this._text = undefined; },
        get innerHTML() {
            if (this._text === undefined) return this._html || '';
            return this._text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }
    };
}
const byId = {};
const document = {
    getElementById(id) { return byId[id] || (byId[id] = makeElement()); },
    querySelector() { return makeElement(); },
    querySelectorAll() { return []; },
    createElement() { return makeElement(); },
    addEventListener() {},
    removeEventListener() {},
    body: { appendChild(child) { return child; } }
};

const CACHE = {};
for (const f of ['species.json', 'archetypes.json', 'talents.json', 'weapons.json', 'armor.json', 'equipment.json',
    'psychic-powers.json', 'ascension-packages.json', 'backgrounds.json', 'weapon-upgrades.json',
    'injuries-corruption.json', 'keyword-categories.json', 'holy-relics.json', 'glossary.json',
    'threats.json', 'threat-weapons.json'])
    CACHE[f] = readJson(`data/${f}`);

const ctx = vm.createContext({
    console,
    document,
    window: { getComputedStyle: () => ({ display: 'block' }), addEventListener() {}, removeEventListener() {} },
    MutationObserver: function () { this.observe = () => {}; },
    localStorage: {},
    setTimeout: () => 0,
    clearTimeout: () => {}
});
const load = rel => vm.runInContext(readSource(rel), ctx, { filename: rel });
const get = name => vm.runInContext(name, ctx);
load('creator/js/data-loader.js');
get('DataLoader').cache = CACHE;
for (const f of ['xp-calculator', 'derived-stats', 'prerequisite', 'character-check', 'state', 'improvised-builder',
    'custom-wargear', 'keyword-bonus', 'followers'])
    load(`creator/js/${f}.js`);
for (const f of ['setting', 'injuries', 'followers', 'character-sheet', 'archetype'])
    load(`creator/tabs/${f}-tab.js`);
vm.runInContext('var ThreatCard = { render: () => "" }; var Glossary = { enhanceElement() {} };', ctx);

const State = get('State');
const DerivedStats = get('DerivedStats');
const SettingTab = get('SettingTab');
const InjuriesTab = get('InjuriesTab');
const FollowersTab = get('FollowersTab');
const CharacterSheetTab = get('CharacterSheetTab');
const ArchetypeTab = get('ArchetypeTab');
const DataLoader = get('DataLoader');

const base = {
    name: 'H',
    species: { id: 'human', xpCost: 0, subOptions: [] },
    archetype: { id: 'imperial_guardsman', xpCost: 0 }
};
const loadCharacter = over => State.loadCharacter(JSON.parse(JSON.stringify({ ...base, ...over })));

let notified = 0;
State.addListener(type => { if (type !== 'load' && type !== 'reset') notified++; });

const BIG = '9'.repeat(309);
// The seven entries of the table of the report. `bad` is an entry that the browser cannot read: value '' with badInput.
const ENTRIES = [
    ['empty', { value: '' }],
    ['-5', { value: '-5' }],
    ['2.5', { value: '2.5' }],
    ['1e5', { value: '1e5' }],
    ['309 digits', { value: BIG }],
    ['abc', { value: 'abc' }],
    ['bad entry', { value: '', badInput: true }]
];

// The expected stored value of a cell. A refused entry keeps the start value. The cells of an accepted
// entry are listed: only 1e5 is a legal integer where the field has no upper bound.
const expectedStored = (start, accepted, name) => (name in accepted ? accepted[name] : start);

// Fires the handler of an event on an element with an entry.
function fire(el, evt, entry) {
    el.value = entry.value;
    el.validity = { badInput: !!entry.badInput };
    for (const fn of el.handlers[evt]) fn({ target: el });
}

// === The helper ===
{
    const f = (v, a, b) => State._intInRange(v, a, b);
    check('_intInRange: 2 in 1..3', f(2, 1, 3), 2);
    check('_intInRange: "2" in 1..3', f('2', 1, 3), 2);
    check('_intInRange: 4 in 1..3', f(4, 1, 3), null);
    check('_intInRange: 0 in 1..3', f(0, 1, 3), null);
    check('_intInRange: 2.5', f('2.5', 1, 3), null);
    check('_intInRange: empty string', f('', 0, Infinity), null);
    check('_intInRange: blank string', f('  ', 0, Infinity), null);
    check('_intInRange: abc', f('abc', 0, Infinity), null);
    check('_intInRange: Infinity', f(Infinity, 0, Infinity), null);
    check('_intInRange: NaN', f(NaN, 0, Infinity), null);
    check('_intInRange: null', f(null, 0, Infinity), null);
    check('_intInRange: 309 digits', f(BIG, 0, Infinity), null);
    check('_intInRange: "1e2" in 0..Infinity', f('1e2', 0, Infinity), 100);
}

// === The setters ===
{
    loadCharacter({ rank: 2 });
    const n = notified;
    for (const v of ['30000', '-5', '2.5', '1e5', '', '4', '0', 'abc']) {
        check(`setRank(${JSON.stringify(v)}) refuses`, State.setRank(v), false);
    }
    check('setRank: the rank stays 2', State.character.rank, 2);
    check('setRank: a refused value does not notify', notified, n);
    check('setRank("3") stores', [State.setRank('3'), State.character.rank], [true, 3]);
    check('setRank("1") stores', [State.setRank('1'), State.character.rank], [true, 1]);
    check('setRank: a stored value notifies', notified, n + 2);

    loadCharacter({ additionalXp: 7 });
    const m = notified;
    check('setAdditionalXP("-5") refuses', State.setAdditionalXP('-5'), false);
    check('setAdditionalXP(""): refuses', State.setAdditionalXP(''), false);
    check('setAdditionalXP: the value stays 7, no notify', [State.character.additionalXp, notified], [7, m]);
    check('setAdditionalXP("40") stores', [State.setAdditionalXP('40'), State.character.additionalXp], [true, 40]);
    check('setAdditionalXP("0") stores', [State.setAdditionalXP('0'), State.character.additionalXp], [true, 0]);

    loadCharacter({ corruption: 5 });
    const k = notified;
    check('setCorruptionPoints("-1") refuses', State.setCorruptionPoints('-1'), false);
    check('setCorruptionPoints: the value stays 5, no notify', [State.character.corruption, notified], [5, k]);
    check('setCorruptionPoints("12") stores', [State.setCorruptionPoints('12'), State.character.corruption], [true, 12]);

    loadCharacter({ tier: 3 });
    const t = notified;
    check('setTier("0") refuses', State.setTier('0'), false);
    check('setTier("6") refuses', State.setTier('6'), false);
    check('setTier: the tier stays 3, no notify', [State.character.tier, notified], [3, t]);
    check('setTier("5") stores', [State.setTier('5'), State.character.tier], [true, 5]);
    check('setTier("1") stores', [State.setTier('1'), State.character.tier], [true, 1]);
}

// === The Setting tab ===
const settingTable = {};
{
    SettingTab.init();
    const rank = byId['character-rank'], xp = byId['additional-xp'], tier = byId['tier-select'];
    check('Setting tab: Rank uses the change event', Object.keys(rank.handlers), ['change']);
    check('Setting tab: Additional XP uses the change event', Object.keys(xp.handlers), ['change']);
    check('Setting tab: Tier uses the change event', Object.keys(tier.handlers), ['change']);

    loadCharacter({ rank: 2, additionalXp: 7, tier: 3 });
    fire(rank, 'change', { value: '30000' });
    check('Setting tab: Rank 30000 refused, the input shows 2', [State.character.rank, rank.value], [2, '2']);
    fire(rank, 'change', { value: '3' });
    check('Setting tab: Rank 3 stored', State.character.rank, 3);

    // Each cell: the stored value and the text of the input. A refused entry shows the stored value again.
    // An accepted entry leaves the typed text in the input.
    for (const [name, entry] of ENTRIES) {
        const out = {};
        for (const [label, el, start, key, accepted] of [
            ['rank', rank, 2, 'rank', {}],
            ['xp', xp, 7, 'additionalXp', { '1e5': 100000 }],
            ['tier', tier, 3, 'tier', {}]
        ]) {
            loadCharacter({ rank: 2, additionalXp: 7, tier: 3 });
            fire(el, 'change', entry);
            out[label] = State.character[key];
            check(`Setting tab ${label} ${name}: stored value`, State.character[key], expectedStored(start, accepted, name));
            check(`Setting tab ${label} ${name}: input text`, el.value, name in accepted ? entry.value : String(start));
        }
        settingTable[name] = out;
    }
    // The lowest and the highest legal value of each field, through the handlers
    for (const [label, el, key, entries] of [
        ['rank', rank, 'rank', [['1', 1], ['3', 3]]],
        ['tier', tier, 'tier', [['1', 1], ['5', 5]]],
        ['xp', xp, 'additionalXp', [['0', 0]]]
    ]) {
        for (const [text, want] of entries) {
            loadCharacter({ rank: 2, additionalXp: 7, tier: 3 });
            fire(el, 'change', { value: text });
            check(`Setting tab ${label} ${text}: the lowest or highest legal value is stored`, State.character[key], want);
            check(`Setting tab ${label} ${text}: input text`, el.value, text);
        }
    }
    // A stored value outside the range stays after a refused entry and shows again
    loadCharacter({ rank: 5, additionalXp: -3 });
    fire(rank, 'change', { value: '', badInput: true });
    fire(xp, 'change', { value: 'abc' });
    check('Setting tab: a stored Rank 5 stays after a refused entry and shows 5', [State.character.rank, rank.value], [5, '5']);
    check('Setting tab: a stored XP -3 stays after a refused entry and shows -3', [State.character.additionalXp, xp.value], [-3, '-3']);
    fire(rank, 'change', { value: '4' });
    check('Setting tab: Rank 4 is refused and the stored 5 stays', State.character.rank, 5);
    fire(rank, 'change', { value: '3' });
    check('Setting tab: Rank 3 replaces the stored 5', State.character.rank, 3);
}

// === The Corruption input ===
const corruptionTable = {};
{
    let renders = 0;
    InjuriesTab.render = () => { renders++; };
    loadCharacter({ corruption: 5 });
    InjuriesTab.bindEvents(State.getCharacter(), CACHE['injuries-corruption.json']);
    const el = byId['corruption-points'];
    check('Corruption: the input uses the change event', Object.keys(el.handlers), ['change']);
    for (const [name, entry] of ENTRIES) {
        loadCharacter({ corruption: 5 });
        renders = 0;
        fire(el, 'change', entry);
        corruptionTable[name] = State.character.corruption;
        const accepted = { '1e5': 100000 };
        check(`Corruption ${name}: stored value`, State.character.corruption, expectedStored(5, accepted, name));
        check(`Corruption ${name}: input text`, el.value, name in accepted ? entry.value : '5');
        check(`Corruption ${name}: the tab renders only for a stored value`, renders, name in accepted ? 1 : 0);
    }
    loadCharacter({ corruption: 5 });
    fire(el, 'change', { value: '12' });
    check('Corruption: 12 stored', State.character.corruption, 12);
    check('Corruption: a stored value renders the tab', renders > 0, true);
    loadCharacter({ corruption: 5 });
    renders = 0;
    fire(el, 'change', { value: '0' });
    check('Corruption: 0 (the lowest legal value) is stored', State.character.corruption, 0);
    check('Corruption: 0 shows in the input', el.value, '0');
    check('Corruption: 0 renders the tab', renders, 1);
}

// === The Followers inputs ===
const membersTable = {}, livingTable = {};
{
    const mob = { id: 'flw_1', threatId: 'x', name: '', kind: 'mob', count: 4, livingCount: 2, notes: '', useAlternativeStats: false, currentWounds: null, currentShock: null };
    const makeInput = (field, type) => { const el = makeElement(); el.type = type; el.dataset.field = field; return el; };
    let renders = 0;
    // A render builds each input again from the stored values, as the real render does.
    FollowersTab.render = () => {
        renders++;
        const f = State.getFollower('flw_1');
        members.value = f.count;
        living.value = f.livingCount;
    };
    FollowersTab.updateSidebarCount = () => {};
    const container = document.getElementById('section-followers');
    const members = makeInput('count', 'number');
    const living = makeInput('livingCount', 'number');
    const item = makeElement();
    item.dataset.followerId = 'flw_1';
    item.querySelector = () => makeElement();
    item.querySelectorAll = () => [members, living];
    container.querySelector = () => null;
    container.querySelectorAll = sel => (sel === '.follower-item' ? [item] : []);

    loadCharacter({ followers: [mob] });
    FollowersTab.bindEvents();
    check('Followers: Members uses the change event', Object.keys(members.handlers), ['change']);
    check('Followers: Living uses the change event', Object.keys(living.handlers), ['change']);

    const stored = () => State.getFollower('flw_1');
    // Each cell: the stored value and the text of the input after the re-render. Every entry re-renders once.
    for (const [name, entry] of ENTRIES) {
        const acceptedMembers = { '1e5': 100000 };
        loadCharacter({ followers: [{ ...mob }] });
        renders = 0;
        fire(members, 'change', entry);
        membersTable[name] = stored().count;
        const wantMembers = expectedStored(4, acceptedMembers, name);
        check(`Followers Members ${name}: stored value`, stored().count, wantMembers);
        check(`Followers Members ${name}: input text`, members.value, String(wantMembers));
        check(`Followers Members ${name}: one re-render`, renders, 1);
        check(`Followers Members ${name}: Living is not changed`, stored().livingCount, 2);
        loadCharacter({ followers: [{ ...mob }] });
        renders = 0;
        fire(living, 'change', entry);
        livingTable[name] = stored().livingCount;
        check(`Followers Living ${name}: stored value`, stored().livingCount, 2);
        check(`Followers Living ${name}: input text`, living.value, '2');
        check(`Followers Living ${name}: one re-render`, renders, 1);
        check(`Followers Living ${name}: Members is not changed`, stored().count, 4);
    }
    loadCharacter({ followers: [{ ...mob }] });
    fire(members, 'change', { value: '2.5' });
    check('Followers: Members 2.5 keeps 4', stored().count, 4);
    fire(living, 'change', { value: '5' });
    check('Followers: Living above Members keeps 2', stored().livingCount, 2);
    fire(living, 'change', { value: '4' });
    check('Followers: Living equal to Members is stored', stored().livingCount, 4);
    fire(living, 'change', { value: '0' });
    check('Followers: Living 0 is stored', stored().livingCount, 0);
    fire(members, 'change', { value: '0' });
    check('Followers: Members 0 keeps 4', stored().count, 4);
    fire(members, 'change', { value: '6' });
    check('Followers: Members 6 is stored', stored().count, 6);
    // The lowest legal value of Members. Living is cut to Members by updateFollower.
    loadCharacter({ followers: [{ ...mob, count: 3, livingCount: 2 }] });
    renders = 0;
    fire(members, 'change', { value: '1' });
    check('Followers: Members 1 (the lowest legal value) is stored', stored().count, 1);
    check('Followers: Members 1 cuts Living 2 to 1', stored().livingCount, 1);
    check('Followers: Members 1 shows in the input after one re-render', [members.value, renders], ['1', 1]);
    // Living at its two limits
    loadCharacter({ followers: [{ ...mob }] });
    fire(living, 'change', { value: '0' });
    check('Followers: Living 0 (the lowest legal value) shows in the input', [stored().livingCount, living.value], [0, '0']);
    fire(living, 'change', { value: '4' });
    check('Followers: Living 4 (equal to Members) shows in the input', [stored().livingCount, living.value], [4, '4']);
}

// === G1: a stored value outside the range stays at a load and at a render ===
{
    const attrs = { strength: 1, toughness: 1, agility: 1, initiative: 1, willpower: 1, intellect: 1, fellowship: 1 };
    for (const over of [{ rank: 5 }, { rank: -2 }, { additionalXp: -9 }, { corruption: -4 }]) {
        loadCharacter({ attributes: attrs, ...over });
        const key = Object.keys(over)[0];
        check(`G1: a loaded ${key} ${over[key]} stays`, State.character[key], over[key]);
        const before = JSON.stringify(State.character);
        let threw = false;
        try { SettingTab.refresh(); CharacterSheetTab.render(); } catch (e) { threw = e.message; }
        check(`G1: ${key} ${over[key]}: the Setting tab and the sheet render with no throw`, threw, false);
        check(`G1: ${key} ${over[key]}: the JSON of the character does not change`, JSON.stringify(State.character) === before, true);
    }
    loadCharacter({ attributes: attrs, rank: 5 });
    check('G1: calculateMaxWounds of a Rank 5 character is finite', Number.isFinite(DerivedStats.calculateMaxWounds(State.character)), true);
}

// === Tier 5 (Vow of Absolution) ===
{
    const html = readSource('creator/index.html');
    const options = [...html.matchAll(/<option value="(\d+)">(\d) - [^<]*\((\d+) XP\)<\/option>/g)].map(m => [m[1], m[3]]);
    check('index.html: the Tier select offers 1 to 5 with 100 to 500 XP',
        options.filter(o => /^[1-5]$/.test(o[0])).map(o => o.join(':')), ['1:100', '2:200', '3:300', '4:400', '5:500']);
    const XPCalculator = get('XPCalculator');
    check('XPCalculator: the starting XP of Tier 5 is 500', XPCalculator.TIER_STARTING_XP[5], 500);
    loadCharacter({ tier: 5 });
    SettingTab.refresh();
    check('Tier 5: a stored Tier 5 shows in the select, and the select has that option',
        [byId['tier-select'].value, options.some(o => o[0] === byId['tier-select'].value)], ['5', true]);
    check('Tier 5: setTier(5) stores 5', [State.setTier(5), State.character.tier], [true, 5]);
    const ids = tier => DataLoader.filterArchetypes('primaris', tier, null).map(a => a.id);
    check('Tier 5: the archetype data holds terminator at tier 5', DataLoader.getAllArchetypes().find(a => a.id === 'terminator').tier, 5);
    check('Tier 5: the filter lists terminator at Tier 5', ids(5).includes('terminator'), true);
    check('Tier 5: the filter hides terminator at Tier 4', ids(4).includes('terminator'), false);
    // The list of the Archetype tab
    const text = el => (el.innerHTML || '') + el.children.map(text).join('');
    loadCharacter({ tier: 5, species: { id: 'primaris', xpCost: 0, subOptions: [] }, archetype: null });
    byId['archetype-list'] = makeElement();
    ArchetypeTab.searchQuery = '';
    ArchetypeTab.renderList();
    check('Tier 5: the list of the Archetype tab shows Terminator', text(byId['archetype-list']).includes('Terminator'), true);
    loadCharacter({ tier: 4, species: { id: 'primaris', xpCost: 0, subOptions: [] }, archetype: null });
    byId['archetype-list'] = makeElement();
    ArchetypeTab.renderList();
    check('Tier 4: the list of the Archetype tab does not show Terminator', text(byId['archetype-list']).includes('Terminator'), false);
}

// === The Rank input of the page ===
{
    const html = readSource('creator/index.html');
    check('index.html: the Rank input declares value 1, min 1, max 3', html.includes('id="character-rank" value="1" min="1" max="3"'), true);
    check('index.html: the hint of the Rank input', html.includes('<span class="form-hint">Set your Character\'s Rank, between 1 and 3.</span>'), true);
}

console.log('\nTable (stored value after each entry; start Rank 2, XP 7, Tier 3, Corruption 5, Members 4, Living 2)');
for (const [name] of ENTRIES) {
    console.log(`  ${name.padEnd(11)} Rank ${settingTable[name].rank}  XP ${settingTable[name].xp}  Tier ${settingTable[name].tier}  Corruption ${corruptionTable[name]}  Members ${membersTable[name]}  Living ${livingTable[name]}`);
}

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) FAILED.`);
process.exit(failures ? 1 : 0);
