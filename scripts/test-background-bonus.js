// Tests for the one background bonus and for the renders that write nothing (spec 11.1, 11.2; bug pass task 14).
// The core rulebook gives a character one Background +1 bonus: the one that USE THIS BONUS selects (Core p.43).
// With no selection the derived values get no background bonus, and the Background tab tells the user to select one.
// A render of the Background tab or the sheet never writes bonusType into the character.
// Run: node scripts/test-background-bonus.js

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

// A DOM stub. The classList of each element is a Set, so a test reads the class hidden.
function makeRecordingDocument() {
    const byId = {};
    function makeElement() {
        let html = '';
        let text = null;
        const classes = new Set();
        const el = {
            style: {}, dataset: {}, value: '', className: '',
            classList: {
                add(c) { classes.add(c); }, remove(c) { classes.delete(c); },
                toggle(c) { classes.has(c) ? classes.delete(c) : classes.add(c); }, contains: c => classes.has(c)
            },
            addEventListener() {}, removeEventListener() {},
            appendChild(child) { return child; },
            setAttribute() {}, getAttribute() { return null; }, focus() {},
            querySelector() { return makeElement(); },
            querySelectorAll() { return []; },
            closest() { return null; },
            contains() { return false; },
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
    const document = {
        getElementById(id) { return byId[id] || (byId[id] = makeElement()); },
        querySelector() { return makeElement(); },
        querySelectorAll() { return []; },
        createElement() { return makeElement(); },
        addEventListener() {}, removeEventListener() {},
        body: { appendChild(child) { return child; } }
    };
    return { document, byId };
}

const rec = makeRecordingDocument();
const CACHE = {};
for (const f of ['species.json', 'archetypes.json', 'talents.json', 'weapons.json', 'armor.json', 'equipment.json',
    'psychic-powers.json', 'ascension-packages.json', 'backgrounds.json', 'weapon-upgrades.json',
    'injuries-corruption.json', 'keyword-categories.json', 'holy-relics.json', 'glossary.json',
    'threats.json', 'threat-weapons.json'])
    CACHE[f] = readJson(`data/${f}`);

const ctx = vm.createContext({
    console,
    document: rec.document,
    window: { getComputedStyle: () => ({ display: 'block' }), addEventListener() {}, removeEventListener() {}, api: {} },
    MutationObserver: function () { this.observe = () => {}; },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setTimeout: () => 0, clearTimeout: () => {}
});
const load = rel => vm.runInContext(readSource(rel), ctx, { filename: rel });
const get = name => vm.runInContext(name, ctx);
for (const f of ['data-loader', 'xp-calculator', 'derived-stats', 'prerequisite', 'character-check', 'state',
    'improvised-builder', 'custom-wargear', 'keyword-bonus', 'followers'])
    load(`creator/js/${f}.js`);
get('DataLoader').cache = CACHE;
for (const f of ['background', 'character-sheet']) load(`creator/tabs/${f}-tab.js`);
const State = get('State'), DerivedStats = get('DerivedStats');
const BackgroundTab = get('BackgroundTab'), CharacterSheetTab = get('CharacterSheetTab');
State.init({});

const BG = CACHE['backgrounds.json'];
const origin = BG.origins[0], accomplishment = BG.accomplishments[0], goal = BG.goals[0];

// Three entries that all give Max Wounds.
const threeWounds = bonusUsed => ({
    background: {
        origin: { id: 'o1', bonusType: 'maxWounds' },
        accomplishment: { id: 'a1', bonusType: 'maxWounds' },
        goal: { id: 'g1', bonusType: 'maxWounds' },
        bonusUsed
    }
});

// --- getBackgroundBonus ---
check('bonusUsed origin: three Max Wounds entries give 1', DerivedStats.getBackgroundBonus(threeWounds('origin'), 'maxWounds'), 1);
check('bonusUsed accomplishment: gives 1', DerivedStats.getBackgroundBonus(threeWounds('accomplishment'), 'maxWounds'), 1);
check('bonusUsed goal: gives 1', DerivedStats.getBackgroundBonus(threeWounds('goal'), 'maxWounds'), 1);
check('bonusUsed null: gives 0', DerivedStats.getBackgroundBonus(threeWounds(null), 'maxWounds'), 0);
check('bonusUsed unknown value: gives 0', DerivedStats.getBackgroundBonus(threeWounds('zz'), 'maxWounds'), 0);
check('bonusUsed is a key of the object, not of the background: gives 0', DerivedStats.getBackgroundBonus(threeWounds('bonusUsed'), 'maxWounds'), 0);
check('bonusUsed goal with goal null: gives 0',
    DerivedStats.getBackgroundBonus({ background: { origin: { id: 'o1', bonusType: 'maxWounds' }, accomplishment: null, goal: null, bonusUsed: 'goal' } }, 'maxWounds'), 0);
check('the selected entry has another bonusType: gives 0',
    DerivedStats.getBackgroundBonus({ background: { origin: { id: 'o1', bonusType: 'wealth' }, accomplishment: { id: 'a1', bonusType: 'maxWounds' }, goal: null, bonusUsed: 'origin' } }, 'maxWounds'), 0);
check('an entry with no bonusType gives 0',
    DerivedStats.getBackgroundBonus({ background: { origin: { id: 'o1' }, accomplishment: null, goal: null, bonusUsed: 'origin' } }, 'maxWounds'), 0);
check('a character with no background gives 0', DerivedStats.getBackgroundBonus({}, 'maxWounds'), 0);

// A key of the background object other than the three slots does not count, whatever it holds.
check('bonusUsed names an extra key with a bonusType: gives 0',
    DerivedStats.getBackgroundBonus({ background: { origin: null, accomplishment: null, goal: null, extra: { bonusType: 'maxWounds' }, bonusUsed: 'extra' } }, 'maxWounds'), 0);
check('bonusUsed names a key of the prototype: gives 0',
    DerivedStats.getBackgroundBonus({ background: { origin: null, accomplishment: null, goal: null, bonusUsed: 'constructor' } }, 'maxWounds'), 0);
check('a selected entry with a bonusType outside the seven derived types gives 0',
    DerivedStats.getBackgroundBonus({ background: { origin: { id: 'o1', bonusType: 'corruption' }, accomplishment: null, goal: null, bonusUsed: 'origin' } }, 'corruption'), 0);

// The derived value follows the one bonus.
function human() {
    State.newCharacter();
    State.setSpecies('human');
    return State.character;
}
{
    const c = human();
    const none = DerivedStats.calculateMaxWounds ? DerivedStats.calculateMaxWounds(c) : null;
    c.background = threeWounds(null).background;
    const withNone = DerivedStats.calculateMaxWounds(c);
    c.background.bonusUsed = 'origin';
    const withOne = DerivedStats.calculateMaxWounds(c);
    check('max wounds: three entries and no selection add nothing', withNone, none);
    check('max wounds: three entries and one selection add 1', withOne, none + 1);
}

// --- the repairs are gone ---
check('CharacterSheetTab.repairBackgroundBonusTypes is gone', typeof CharacterSheetTab.repairBackgroundBonusTypes, 'undefined');
check('BackgroundTab.repairMissingBonusTypes is gone', typeof BackgroundTab.repairMissingBonusTypes, 'undefined');

// --- a render writes nothing ---
{
    const c = human();
    c.background = { origin: { id: origin.id }, accomplishment: { id: accomplishment.id, bonusType: null }, goal: { id: goal.id, bonusType: '' }, bonusUsed: 'origin' };
    const before = JSON.stringify(State.character);
    BackgroundTab.render();
    check('BackgroundTab.render leaves the character as it was (entries with no bonusType)', JSON.stringify(State.character), before);
    let threw = null;
    try { CharacterSheetTab.render(); } catch (e) { threw = e.message; }
    check('CharacterSheetTab.render runs', threw, null);
    check('CharacterSheetTab.render leaves the character as it was (entries with no bonusType)', JSON.stringify(State.character), before);
}

// --- the notice with no selection ---
{
    const NOTICE = 'Select one bonus with USE THIS BONUS';
    const c = human();
    c.background = { origin: { id: origin.id, bonusType: origin.bonusType }, accomplishment: null, goal: null, bonusUsed: null };
    const el = rec.document.getElementById('background-bonus');
    el.classList.add('hidden');
    BackgroundTab.render();
    check('no selection: the bonus box holds the notice', el.innerHTML.includes(NOTICE), true);
    check('no selection: the notice names the book rule', el.innerHTML.includes('A character gets one Background bonus (Core Rulebook p.43).'), true);
    check('no selection: the bonus box is not hidden', el.classList.contains('hidden'), false);

    c.background.bonusUsed = 'origin';
    BackgroundTab.render();
    check('selected: the box shows the selected bonus', el.innerHTML.includes('Selected Bonus:') && el.innerHTML.includes(origin.name), true);
    check('selected: the notice is gone', el.innerHTML.includes(NOTICE), false);

    c.background = { origin: null, accomplishment: null, goal: null, bonusUsed: null };
    BackgroundTab.render();
    check('no entry and no selection: the bonus box is hidden', el.classList.contains('hidden'), true);
}

// --- the box tells the user what the stats do (spec 11.1; fix round 1) ---
{
    const NOTICE = 'Select one bonus with USE THIS BONUS';
    const el = rec.document.getElementById('background-bonus');
    const setUp = background => {
        const c = human();
        c.background = { origin: null, accomplishment: null, goal: null, bonusUsed: null, ...background };
        return c;
    };
    const maxWounds = () => DerivedStats.calculateMaxWounds(State.character);
    const state = () => ({ notice: el.innerHTML.includes(NOTICE), hidden: el.classList.contains('hidden') });

    // (a) The selected slot is empty: no bonus, and the notice shows when another slot holds an entry.
    const baseWounds = DerivedStats.calculateMaxWounds(setUp({}));
    let c = setUp({ origin: { id: origin.id, bonusType: 'maxWounds' }, bonusUsed: 'goal' });
    let snapshot = JSON.stringify(State.character);
    BackgroundTab.render();
    check('(a) empty selected slot: max wounds get no bonus', maxWounds(), baseWounds);
    check('(a) empty selected slot, another slot set: the notice shows and the box is not hidden', state(), { notice: true, hidden: false });
    check('(a) a render leaves the character as it was', JSON.stringify(State.character), snapshot);
    check('(a) bonusUsed stays goal', State.character.background.bonusUsed, 'goal');
    c = setUp({ bonusUsed: 'goal' });
    BackgroundTab.render();
    check('(a) empty selected slot, no entry at all: the box is hidden', state().hidden, true);

    // (b) The selected entry has an id that the data does not have: the stored bonus applies and the box shows it.
    c = setUp({ origin: { id: 'zz<b>', bonusType: 'maxWounds' }, bonusUsed: 'origin' });
    snapshot = JSON.stringify(State.character);
    BackgroundTab.render();
    check('(b) unknown selected entry: the stored maxWounds bonus applies', maxWounds(), baseWounds + 1);
    check('(b) unknown selected entry: the box is not hidden and shows no notice', state(), { notice: false, hidden: false });
    check('(b) the box shows the entry, marked as unknown, and the bonus',
        el.innerHTML, '<strong>Selected Bonus:</strong> <span class="unknown-entry-text">Unknown origin (zz&lt;b&gt;)</span>: +1 Max Wounds');
    check('(b) a render leaves the character as it was', JSON.stringify(State.character), snapshot);
    c = setUp({ goal: { id: 'zz_g', bonusType: 'wealth' }, bonusUsed: 'goal' });
    BackgroundTab.render();
    check('(b) unknown goal with a wealth bonus: the box names it',
        el.innerHTML, '<strong>Selected Bonus:</strong> <span class="unknown-entry-text">Unknown goal (zz_g)</span>: +1 Wealth');
    check('(b) the derived values and the box use one test',
        DerivedStats.BACKGROUND_BONUS_TYPES.map(t => DerivedStats.getBackgroundBonus(State.character, t)), [0, 0, 0, 0, 0, 0, 1]);

    // (c) The selected entry is unknown and its stored bonusType is absent or not one of the seven: no bonus, the notice shows.
    for (const bonusType of [undefined, null, '', 'corruption', 'keyword', 'zz']) {
        const entry = bonusType === undefined ? { id: 'zz_a' } : { id: 'zz_a', bonusType };
        c = setUp({ accomplishment: entry, bonusUsed: 'accomplishment' });
        snapshot = JSON.stringify(State.character);
        BackgroundTab.render();
        check(`(c) unknown selected entry with bonusType ${JSON.stringify(bonusType)}: no bonus`,
            DerivedStats.BACKGROUND_BONUS_TYPES.map(t => DerivedStats.getBackgroundBonus(State.character, t)), [0, 0, 0, 0, 0, 0, 0]);
        check(`(c) unknown selected entry with bonusType ${JSON.stringify(bonusType)}: the notice shows`, state(), { notice: true, hidden: false });
        check(`(c) unknown selected entry with bonusType ${JSON.stringify(bonusType)}: a render leaves the character as it was`, JSON.stringify(State.character), snapshot);
    }
}

// --- each of the seven types raises its own stat, and the box names it (fix round 2) ---
// The calculator and the type string come from the source of derived-stats.js, not from a list of this test.
// The words of the box come from the stat names of the sheet (character-sheet-tab.js).
{
    const el = rec.document.getElementById('background-bonus');
    const source = readSource('creator/js/derived-stats.js');
    const calculators = [...source.matchAll(/(calculate\w+)\(character\)\s*\{(?:(?!\n    \w+\(.*\{)[\s\S])*?getBackgroundBonus\(character, '(\w+)'\)/g)]
        .map(m => ({ fn: m[1], type: m[2] }));
    const WORDS = {
        determination: 'Determination', conviction: 'Conviction', influence: 'Influence', resolve: 'Resolve',
        maxShock: 'Max Shock', maxWounds: 'Max Wounds', wealth: 'Wealth'
    };
    const statKey = { calculateDetermination: 'determination', calculateMaxWounds: 'maxWounds', calculateMaxShock: 'maxShock',
        calculateConviction: 'conviction', calculateResolve: 'resolve', calculateInfluence: 'influence', calculateWealth: 'wealth' };
    check('derived-stats.js has seven calculators that read a background bonus', calculators.map(c => c.type).sort(), Object.keys(WORDS).sort());
    for (const { fn, type } of calculators) {
        const lists = [['origin', BG.origins], ['accomplishment', BG.accomplishments], ['goal', BG.goals]];
        const [slot, list] = lists.find(([, l]) => l.some(r => r.bonusType === type)) || [];
        check(`${type}: the data has a real entry with this bonusType`, !!list, true);
        if (!list) continue;
        const record = list.find(r => r.bonusType === type);
        const c = human();
        c.background = { origin: null, accomplishment: null, goal: null, bonusUsed: null };
        c.background[slot] = { id: record.id, bonusType: record.bonusType };
        const none = DerivedStats[fn](c);
        const noneAll = DerivedStats.getAllDerivedStats(c);
        c.background.bonusUsed = slot;
        BackgroundTab.render();
        check(`${type} (${slot} ${record.id}): ${fn} gives 1 more than with no selection`, DerivedStats[fn](c), none + 1);
        const all = DerivedStats.getAllDerivedStats(c);
        check(`${type}: only ${statKey[fn]} changes in getAllDerivedStats`,
            Object.keys(all).filter(k => all[k] !== noneAll[k]), [statKey[fn]]);
        check(`${type}: the box of a known entry has no unknown mark`, el.innerHTML.includes('unknown-entry-text'), false);
        check(`${type}: the box shows the entry of the data with its name`,
            el.innerHTML.startsWith('<strong>Selected Bonus:</strong> ' + record.name.replace(/&/g, '&amp;')), true);
        // The same entry as an unknown id: the box names the bonus that applies.
        c.background[slot] = { id: 'zz_unknown', bonusType: record.bonusType };
        BackgroundTab.render();
        check(`${type}: an unknown selected entry shows +1 ${WORDS[type]}`,
            el.innerHTML, `<strong>Selected Bonus:</strong> <span class="unknown-entry-text">Unknown ${slot} (zz_unknown)</span>: +1 ${WORDS[type]}`);
    }
}

// --- the escapes of the selected bonus (a data fixture with markup in the name and the text) ---
{
    const el = rec.document.getElementById('background-bonus');
    const DataLoader = get('DataLoader');
    const saved = DataLoader.cache['backgrounds.json'];
    const evil = id => ({ id, name: 'N<b>&x', bonusDescription: 'D<b>&y', bonusType: 'maxWounds' });
    DataLoader.cache['backgrounds.json'] = { origins: [evil('eo')], accomplishments: [evil('ea')], goals: [evil('eg')] };
    try {
        for (const slot of ['origin', 'accomplishment', 'goal']) {
            const c = human();
            c.background = { origin: null, accomplishment: null, goal: null, bonusUsed: slot };
            c.background[slot] = { id: 'e' + slot[0], bonusType: 'maxWounds' };
            BackgroundTab.renderBonusDisplay();
            check(`escape (${slot}): the box holds the name and the text escaped once`,
                el.innerHTML, '<strong>Selected Bonus:</strong> N&lt;b&gt;&amp;x: D&lt;b&gt;&amp;y');
            check(`escape (${slot}): no raw tag in the box`, /<b>/.test(el.innerHTML), false);
        }
    } finally {
        DataLoader.cache['backgrounds.json'] = saved;
    }
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
