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
const DataLoader = get('DataLoader');
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
check('BOX_LIMIT is 100', CharacterSheetTab.BOX_LIMIT, 100);

for (const [label, fn] of [['renderTrackingBoxes', 'renderTrackingBoxes'], ['renderFollowerBoxes', 'renderFollowerBoxes']]) {
    let html = '';
    const start = Date.now();
    try { html = CharacterSheetTab[fn]('wounds', 0, 30000); } catch (e) { html = 'THROW ' + e.message; }
    const ms = Date.now() - start;
    check(`${label} 30000: 100 boxes`, count(html, /class="tracking-box/g), 100);
    check(`${label} 30000: the rest as text`, html.includes('<span class="sheet-empty">+29900 more</span>'), true);
    check(`${label} 30000: under 200 ms`, ms < 200, true);

    const small = CharacterSheetTab[fn]('wounds', 2, 5);
    check(`${label} 5 boxes, 2 filled: 5 boxes`, count(small, /class="tracking-box/g), 5);
    check(`${label} 5 boxes, 2 filled: 2 filled`, count(small, /tracking-box (?:follower-box )?filled/g), 2);
    check(`${label} 5 boxes: no count text`, small.includes('more'), false);

    const stacked = CharacterSheetTab[fn]('wounds', 0, 57);
    check(`${label} 57 boxes: 57 boxes and no count text`, [count(stacked, /class="tracking-box/g), stacked.includes('more')], [57, false]);
    const exact = CharacterSheetTab[fn]('shock', 0, 100);
    check(`${label} 100 boxes: 100 boxes and no count text`, [count(exact, /class="tracking-box/g), exact.includes('more')], [100, false]);
    const over = CharacterSheetTab[fn]('shock', 120, 101);
    check(`${label} 101 boxes: 100 boxes, +1 more`, [count(over, /class="tracking-box/g), over.includes('+1 more')], [100, true]);
}
check('the filled count stays at the drawn boxes', count(CharacterSheetTab.renderTrackingBoxes('wounds', 120, 101), /tracking-box filled/g), 100);

// === The strip: the --n style uses the drawn count ===
{
    loadCharacter({});
    const strip = CharacterSheetTab.renderStripTrackers({ maxWounds: 30000, maxShock: 8 });
    check('strip: --n is the limit for 30000 Wounds', strip.includes('<div class="tracking-boxes" style="--n: 100">'), true);
    check('strip: --n is 8 for 8 Shock', strip.includes('<div class="tracking-boxes" style="--n: 8">'), true);
    const shockStrip = CharacterSheetTab.renderStripTrackers({ maxWounds: 8, maxShock: 30000 });
    check('strip: --n is the limit for 30000 Shock', [shockStrip.includes('<div class="tracking-boxes" style="--n: 100">'), shockStrip.includes('<div class="tracking-boxes" style="--n: 8">')], [true, true]);
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
loadCharacter({ talents: [faithTalent.id], currentFaith: 2 });
State.modifyCurrentFaith(-1);
check('Faith 2 of 1: "-" stores 0', State.character.currentFaith, 0);
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

// === The sheet shows an id that the data does not have (bug pass, spec sections 9.4 and 13.3) ===
// Each unknown entry is a visible row "Unknown <kind> (<id>)", escaped. The sheet has no controls.
// A character with no PSYKER keyword that holds stored powers or disciplines sees them on the sheet.
vm.runInContext('var navigator = { clipboard: { writeText(t) { globalThis.__copied = t; return { then() {} }; } } };', ctx);
{
    const HOSTILE = 'z<i>"q';
    const ESC = 'z&lt;i&gt;&quot;q';
    const has = (html, text) => html.includes(text);

    loadCharacter({ talents: ['zz'], wargear: [{ id: 'zz_w' }], memorableInjuries: [{ id: 'zz' }], traumaticInjuries: [{ id: 'zy' }], mutations: [{ id: 'zz' }] });
    let c = State.getCharacter();
    check('renderTalents: an unknown talent shows "Unknown talent (zz)"', has(CharacterSheetTab.renderTalents(c), 'Unknown talent (zz)'), true);
    check('renderEquipment: an unknown wargear id shows "Unknown wargear (zz_w)"', has(CharacterSheetTab.renderEquipment(c), 'Unknown wargear (zz_w)'), true);
    const injuries = CharacterSheetTab.renderInjuriesCorruption(c);
    check('renderInjuriesCorruption: "Unknown injury (zz)" for a memorable injury', has(injuries, 'Unknown injury (zz)'), true);
    check('renderInjuriesCorruption: "Unknown injury (zy)" for a traumatic injury', has(injuries, 'Unknown injury (zy)'), true);
    check('renderMutations: an unknown mutation shows "Unknown mutation (zz)"', has(CharacterSheetTab.renderMutations(c), 'Unknown mutation (zz)'), true);
    vm.runInContext('globalThis.__copied = null', ctx);
    CharacterSheetTab.copySummary(makeElement());
    check('copySummary: the text has "Unknown wargear (zz_w)"', has(String(get('__copied')), 'Unknown wargear (zz_w)'), true);
    check('copySummary: the text has "Unknown talent (zz)"', has(String(get('__copied')), 'Unknown talent (zz)'), true);

    // A hostile id shows as escaped text
    loadCharacter({
        talents: [HOSTILE], wargear: [{ id: HOSTILE }], memorableInjuries: [{ id: HOSTILE }], mutations: [{ id: HOSTILE }],
        psychicPowers: [HOSTILE], unlockedDisciplines: ['Biomancy']
    });
    c = State.getCharacter();
    check('hostile id: the talent row is escaped', has(CharacterSheetTab.renderTalents(c), `Unknown talent (${ESC})`), true);
    check('hostile id: the wargear row is escaped', has(CharacterSheetTab.renderEquipment(c), `Unknown wargear (${ESC})`), true);
    check('hostile id: the injury row is escaped', has(CharacterSheetTab.renderInjuriesCorruption(c), `Unknown injury (${ESC})`), true);
    check('hostile id: the mutation row is escaped', has(CharacterSheetTab.renderMutations(c), `Unknown mutation (${ESC})`), true);
    check('hostile id: the power row is escaped', has(CharacterSheetTab.renderPsychicPowers(c), `Unknown power (${ESC})`), true);
    check('hostile id: no raw "<i>" in the sheet rows', has(CharacterSheetTab.renderTalents(c) + CharacterSheetTab.renderEquipment(c) + CharacterSheetTab.renderPsychicPowers(c), 'z<i>'), false);

    // Ascension, background, species sub-option and weapon upgrade
    loadCharacter({
        ascensions: [{ type: 'package', packageId: 'zz_pkg', targetTier: 2 }, { type: 'archetype', archetypeId: HOSTILE, targetTier: 3 }],
        background: { origin: { id: HOSTILE }, accomplishment: { id: 'zz_acc' }, goal: { id: 'zz_goal' }, bonusUsed: null, bonusType: null },
        species: { id: 'human', xpCost: 0, subOptions: [{ type: 'zz_type', optionId: HOSTILE }] },
        wargear: [{ id: 'bolt_pistol', upgrades: ['zz_up'] }]
    });
    c = State.getCharacter();
    const asc = CharacterSheetTab.renderAscensions(c);
    check('renderAscensions: "Unknown ascension package (zz_pkg)"', has(asc, 'Unknown ascension package (zz_pkg)'), true);
    check('renderAscensions: "Unknown archetype (<escaped id>)"', has(asc, `Unknown archetype (${ESC})`), true);
    const bg = CharacterSheetTab.renderBackground(c);
    check('renderBackground: "Unknown origin (<escaped id>)"', has(bg, `Unknown origin (${ESC})`), true);
    check('renderBackground: "Unknown accomplishment (zz_acc)"', has(bg, 'Unknown accomplishment (zz_acc)'), true);
    check('renderBackground: "Unknown goal (zz_goal)"', has(bg, 'Unknown goal (zz_goal)'), true);
    const speciesHtml = CharacterSheetTab.renderSpeciesAbilities(c, DataLoader.getSpecies('human'));
    check('renderSpeciesAbilities: "Unknown sub-option (<escaped id>)"', has(speciesHtml, `Unknown sub-option (${ESC})`), true);
    const weaponsHtml = CharacterSheetTab.renderWeapons(c);
    check('renderWeapons: "Unknown upgrade (zz_up)"', has(weaponsHtml, 'Unknown upgrade (zz_up)'), true);

    // A book that the user turned off does not make an id unknown
    loadCharacter({ wargear: [{ id: 'bolt_pistol' }] });
    check('a known id shows no unknown row', has(CharacterSheetTab.renderWeapons(State.getCharacter()), 'Unknown'), false);

    // Powers of a character with no PSYKER keyword
    loadCharacter({ archetype: { id: 'ganger', xpCost: 0 }, psychicPowers: ['smite'] });
    c = State.getCharacter();
    check('ganger: State.isPsyker() is false', State.isPsyker(), false);
    check('ganger with a stored power: hasStoredPowers is true', CharacterSheetTab.hasStoredPowers(c), true);
    const smite = CharacterSheetTab.renderPsychicPowers(c);
    check('ganger with Smite: renderPsychicPowers is not empty', smite !== '', true);
    check('ganger with Smite: the output has "Smite"', has(smite, 'Smite'), true);
    check('ganger with Smite: the Powers tab shows', CharacterSheetTab.getVisibleSheetTabs(c).includes('powers'), true);
    vm.runInContext('globalThis.__copied = null', ctx);
    CharacterSheetTab.copySummary(makeElement());
    check('ganger with Smite: the copied text has PSYCHIC POWERS and Smite', /PSYCHIC POWERS[\s\S]*Smite/.test(String(get('__copied'))), true);

    loadCharacter({ archetype: { id: 'ganger', xpCost: 0 }, psychicPowers: [], unlockedDisciplines: ['Biomancy'] });
    c = State.getCharacter();
    check('ganger with a discipline: hasStoredPowers is true', CharacterSheetTab.hasStoredPowers(c), true);
    check('ganger with a discipline: the output has "Biomancy"', has(CharacterSheetTab.renderPsychicPowers(c), 'Biomancy'), true);

    loadCharacter({ archetype: { id: 'ganger', xpCost: 0 }, psychicPowers: ['psyniscience'], unlockedDisciplines: [] });
    c = State.getCharacter();
    check('ganger with only a universal ability: hasStoredPowers is false', CharacterSheetTab.hasStoredPowers(c), false);
    check('ganger with only a universal ability: renderPsychicPowers is empty', CharacterSheetTab.renderPsychicPowers(c), '');
    check('ganger with only a universal ability: no Powers tab', CharacterSheetTab.getVisibleSheetTabs(c).includes('powers'), false);

    // A render never writes into the character: one unknown entry of each kind
    loadCharacter({
        talents: ['zz'], wargear: [{ id: 'zz_w' }, { id: 'bolt_pistol', upgrades: ['zz_up'] }], memorableInjuries: [{ id: 'zz' }],
        traumaticInjuries: [{ id: 'zy' }], mutations: [{ id: 'zz' }], psychicPowers: ['zz'], unlockedDisciplines: ['Biomancy'],
        ascensions: [{ type: 'package', packageId: 'zz_pkg', targetTier: 2 }, { type: 'archetype', archetypeId: 'zz_arch', targetTier: 3 }],
        background: { origin: { id: 'zz_o' }, accomplishment: { id: 'zz_acc' }, goal: { id: 'zz_goal' }, bonusUsed: null, bonusType: null },
        species: { id: 'human', xpCost: 0, subOptions: [{ type: 'zz_type', optionId: 'zz_opt' }] }
    });
    const jsonBefore = JSON.stringify(State.character);
    let renderThrew = false;
    try { CharacterSheetTab.render(); } catch (e) { renderThrew = e.message; }
    check('render with one unknown entry of each kind: no throw', renderThrew, false);
    check('render with one unknown entry of each kind: the JSON of the character does not change', JSON.stringify(State.character) === jsonBefore, true);
    const sheetHtml = byId['character-sheet-content'] ? byId['character-sheet-content'].innerHTML : '';
    check('the sheet has no Remove control', /btn-remove|>Remove</.test(sheetHtml), false);
    check('the full sheet shows the unknown rows and the stored power', ['Unknown talent (zz)', 'Unknown wargear (zz_w)', 'Unknown power (zz)', 'Unknown mutation (zz)', 'Unknown injury (zz)'].filter(t => !sheetHtml.includes(t)), []);
}

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) FAILED.`);
process.exit(failures ? 1 : 0);
