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

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
