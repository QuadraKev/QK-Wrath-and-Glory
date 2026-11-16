// Tests the box bound of the sheet and the tracker getters (bug pass, spec section 10.3).
// The two box functions draw at most CharacterSheetTab.BOX_LIMIT boxes and then the count of the rest as text.
// The getters of Wounds, Shock and Faith give the stored value inside the current maximum. A load, a getter
// and a render never change the stored value. Only a control (a setter) changes it.
// Loads the real files with the real State and the real data.
// Run: node scripts/test-sheet-bounds.js

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

// A DOM stub. A read of innerHTML after a set of textContent gives the text with & < > escaped.
function makeElement() {
    let html = '';
    let text = null;
    return {
        style: {},
        dataset: {},
        value: '',
        className: '',
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        addEventListener() {},
        removeEventListener() {},
        appendChild(child) { return child; },
        setAttribute() {},
        getAttribute() { return null; },
        focus() {},
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
load('creator/tabs/character-sheet-tab.js');
// Stubs for the cards that a full render of the sheet would build.
vm.runInContext('var ThreatCard = { render: () => "" }; var Glossary = { enhanceElement() {} };', ctx);

const State = get('State');
const DerivedStats = get('DerivedStats');
const CharacterSheetTab = get('CharacterSheetTab');

const count = (html, re) => (html.match(re) || []).length;
const base = {
    name: 'H',
    species: { id: 'human', xpCost: 0, subOptions: [] },
    archetype: { id: 'imperial_guardsman', xpCost: 0 }
};
const attrs = toughness => ({ strength: 1, toughness, agility: 1, initiative: 1, willpower: 1, intellect: 1, fellowship: 1 });
const loadCharacter = over => State.loadCharacter(JSON.parse(JSON.stringify({ ...base, attributes: attrs(1), ...over })));

// === The box functions ===
check('BOX_LIMIT is 50', CharacterSheetTab.BOX_LIMIT, 50);

for (const [label, fn] of [['renderTrackingBoxes', 'renderTrackingBoxes'], ['renderFollowerBoxes', 'renderFollowerBoxes']]) {
    let html = '';
    const start = Date.now();
    try { html = CharacterSheetTab[fn]('wounds', 0, 30000); } catch (e) { html = 'THROW ' + e.message; }
    const ms = Date.now() - start;
    check(`${label} 30000: 50 boxes`, count(html, /class="tracking-box/g), 50);
    check(`${label} 30000: the rest as text`, html.includes('<span class="sheet-empty">+29950 more</span>'), true);
    check(`${label} 30000: under 200 ms`, ms < 200, true);

    const small = CharacterSheetTab[fn]('wounds', 2, 5);
    check(`${label} 5 boxes, 2 filled: 5 boxes`, count(small, /class="tracking-box/g), 5);
    check(`${label} 5 boxes, 2 filled: 2 filled`, count(small, /tracking-box (?:follower-box )?filled/g), 2);
    check(`${label} 5 boxes: no count text`, small.includes('more'), false);

    const exact = CharacterSheetTab[fn]('shock', 0, 50);
    check(`${label} 50 boxes: 50 boxes and no count text`, [count(exact, /class="tracking-box/g), exact.includes('more')], [50, false]);
    const over = CharacterSheetTab[fn]('shock', 60, 51);
    check(`${label} 51 boxes: 50 boxes, +1 more`, [count(over, /class="tracking-box/g), over.includes('+1 more')], [50, true]);
}
check('the filled count stays at the drawn boxes', count(CharacterSheetTab.renderTrackingBoxes('wounds', 60, 51), /tracking-box filled/g), 50);

// === The strip: the --n style uses the drawn count ===
{
    loadCharacter({});
    const strip = CharacterSheetTab.renderStripTrackers({ maxWounds: 30000, maxShock: 8 });
    check('strip: --n is 50 for 30000 Wounds', strip.includes('<div class="tracking-boxes" style="--n: 50">'), true);
    check('strip: --n is 8 for 8 Shock', strip.includes('<div class="tracking-boxes" style="--n: 8">'), true);
}

// === The getters ===
const faithTalent = CACHE['talents.json'].find(t => t.effect && t.effect.includes('You gain +1 Faith.'));
check('data has a Faith talent', !!faithTalent, true);

loadCharacter({ talents: [faithTalent.id], currentFaith: 2 });
check('Faith: the maximum is 1', State.getMaxFaith(), 1);
check('Faith 2 of 1: the getter gives 1', State.getCurrentFaith(), 1);
check('Faith 2 of 1: the stored value stays 2 after the getter', State.character.currentFaith, 2);
State.modifyCurrentFaith(1);
check('Faith 2 of 1: "+" gives 1', State.getCurrentFaith(), 1);
loadCharacter({ talents: [faithTalent.id], currentFaith: 0 });
check('Faith 0 of 1: the getter gives 0', State.getCurrentFaith(), 0);
loadCharacter({ talents: [faithTalent.id], currentFaith: null });
check('Faith null: the getter gives the maximum', State.getCurrentFaith(), 1);
loadCharacter({ talents: [], currentFaith: 2 });
check('Faith 2 of 0: the getter gives 0', State.getCurrentFaith(), 0);
loadCharacter({ talents: [], currentFaith: null });
check('Faith null of 0: the getter gives 0', State.getCurrentFaith(), 0);

loadCharacter({ currentWounds: 7, currentShock: 9 });
const maxWounds = DerivedStats.calculateMaxWounds(State.character);
const maxShock = DerivedStats.calculateMaxShock(State.character);
check('Wounds: the maximum is 3', maxWounds, 3);
check('Wounds 7: the getter gives the lower of the stored value and the maximum', State.getCurrentWounds(), Math.min(7, maxWounds));
check('Wounds 7: the stored value stays 7', State.character.currentWounds, 7);
check('Shock 9: the getter gives the lower of the stored value and the maximum', State.getCurrentShock(), Math.min(9, maxShock));
check('Shock 9: the stored value stays 9', State.character.currentShock, 9);
loadCharacter({ currentWounds: 2, currentShock: null });
check('Wounds 2 of 3 and Shock null: the getters give 2 and 0', [State.getCurrentWounds(), State.getCurrentShock()], [2, 0]);

// A step with a control: "-" on Wounds 7 of 3 steps from 3 and stores 2.
loadCharacter({ currentWounds: 7, currentShock: 9 });
State.modifyCurrentWounds(-1);
State.modifyCurrentShock(1);
check('Wounds 7 of 3: "-" stores 2', State.character.currentWounds, 2);
check('Shock 9 of max: "+" stores the maximum', State.character.currentShock, maxShock);

// === A render changes no stored value (the owner rule) ===
{
    loadCharacter({ talents: [faithTalent.id], currentWounds: 7, currentShock: 9, currentFaith: 2 });
    const before = JSON.stringify(State.character);
    const stats = DerivedStats.getAllDerivedStats(State.character);
    const strip = CharacterSheetTab.renderStripTrackers(stats);
    let threw = false;
    try { CharacterSheetTab.render(); } catch (e) { threw = e.message; }
    check('render of the strip and of the sheet: no throw', threw, false);
    check('render of the strip and of the sheet: the JSON of the character does not change', JSON.stringify(State.character) === before, true);
    check('strip: Wounds 7 of 3 shows 3 filled boxes', count(strip, /tracking-box filled" data-type="wounds"/g), 3);
    check('strip: Faith shows 1', /sheet-strip-faith[\s\S]*?tracker-value">1</.test(strip), true);
}

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) FAILED.`);
process.exit(failures ? 1 : 0);
