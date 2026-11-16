// Tests for Add Starting Wargear (spec 7.5), the three corrected starting ids (7.5) and the
// three corrected species maximums (5.2a).
// Run: node scripts/test-starting-wargear.js

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
for (const f of ['species.json', 'archetypes.json', 'talents.json', 'weapons.json', 'armor.json', 'equipment.json',
    'psychic-powers.json', 'ascension-packages.json', 'backgrounds.json', 'weapon-upgrades.json',
    'injuries-corruption.json', 'keyword-categories.json', 'holy-relics.json', 'glossary.json', 'threats.json'])
    DATA[f] = readJson(`data/${f}`);

// A recording DOM stub: each element keeps the handlers that addEventListener gets.
function makeElement() {
    const handlers = {};
    return {
        style: {}, dataset: {}, value: '', className: '', innerHTML: '', textContent: '',
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        addEventListener(type, fn) { handlers[type] = fn; },
        appendChild(child) { return child; },
        querySelector() { return makeElement(); },
        querySelectorAll() { return []; },
        handlers
    };
}
const els = {};
const doc = {
    getElementById(id) { return els[id] || (els[id] = makeElement()); },
    querySelector() { return makeElement(); },
    querySelectorAll() { return []; },
    createElement() { return makeElement(); },
    body: { appendChild(child) { return child; } }
};

const ctx = vm.createContext({
    console, document: doc, window: { api: {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setTimeout: () => 0, clearTimeout: () => {}
});
for (const f of ['data-loader.js', 'custom-wargear.js', 'character-check.js', 'state.js', 'xp-calculator.js',
    'derived-stats.js', 'prerequisite.js', 'keyword-bonus.js', 'followers.js', 'relic-wizard.js', 'improvised-builder.js'])
    vm.runInContext(readSource(`creator/js/${f}`), ctx, { filename: f });
vm.runInContext(readSource('creator/tabs/wargear-tab.js'), ctx, { filename: 'wargear-tab.js' });
const get = name => vm.runInContext(name, ctx);
const DL = get('DataLoader'), State = get('State'), WT = get('WargearTab');
DL.cache = DATA;
State.init({});
State.setIgnorePrerequisites(true);

// The real click handlers: renderWargearBrowser stores them on the stub. render is counted and does not draw.
let renders = 0;
WT.render = () => { renders++; };
const ascensionButtons = [];
function bindButtons() {
    delete els['btn-add-starting'];
    els['additional-wargear'] = makeElement();
    els['additional-wargear'].querySelectorAll = sel => (sel === '.btn-add-ascension-wargear' ? ascensionButtons : []);
    WT.renderWargearBrowser();
}
function clickStarting() {
    bindButtons();
    els['btn-add-starting'].handlers.click();
}
function clickAscension(archetypeId) {
    ascensionButtons.length = 0;
    const btn = makeElement();
    btn.dataset.archetypeId = archetypeId;
    ascensionButtons.push(btn);
    bindButtons();
    btn.handlers.click();
}

const archetype = id => DATA['archetypes.json'].find(a => a.id === id);
const count = id => State.character.wargear.filter(w => w.id === id).length;
function build(archetypeId) {
    State.newCharacter();
    State.setSpecies('human');
    if (archetypeId) State.setArchetype(archetypeId);
}

// --- data: three corrected ids ---
{
    const has = (id, item) => archetype(id).startingWargear.some(e => (typeof e === 'string' ? e : e.id) === item);
    check('primaris_intercessor holds ballistic_appeasement_auto_reliquary', has('primaris_intercessor', 'ballistic_appeasement_auto_reliquary'), true);
    check('primaris_intercessor does not hold ballistic_autoreliquary', has('primaris_intercessor', 'ballistic_autoreliquary'), false);
    check('techmarine holds astartes_servo_arm', has('techmarine', 'astartes_servo_arm'), true);
    check('techmarine does not hold servo_harness', has('techmarine', 'servo_harness'), false);
    check('striking_scorpion holds mandiblasters', has('striking_scorpion', 'mandiblasters'), true);
    check('striking_scorpion does not hold mandiblaster', has('striking_scorpion', 'mandiblaster'), false);
}

// --- data: the unresolved ids of the archetypes of the official books ---
{
    const unresolved = [];
    for (const a of DATA['archetypes.json']) {
        if (a.source === 'apocrypha') continue;
        for (const e of a.startingWargear || []) {
            const id = typeof e === 'string' ? e : e.id;
            if (!DL.getWargearItem(id)) unresolved.push(id);
        }
    }
    check('the unresolved ids of the official archetypes', unresolved.sort(), [
        'adept_robes', 'adept_robes', 'augmetics', 'commissar_greatcoat', 'company_standard', 'disguise_kit',
        'fine_clothing', 'haywire_mine', 'ripped_clothes', 'skitarii_war_plate', 'smoke_grenades', 'smoke_grenades',
        'tattered_robes']);
}

// --- click: only entries that resolve, and once ---
{
    build('rogue_trader');
    WT.addStartingWargear(archetype('rogue_trader').startingWargear);
    check('Rogue Trader: 4 entries after one call', State.character.wargear.length, 4);
    check('Rogue Trader: no fine_clothing entry', count('fine_clothing'), 0);
    WT.addStartingWargear(archetype('rogue_trader').startingWargear);
    check('Rogue Trader: still 4 entries after a second call', State.character.wargear.length, 4);
}

// --- P5: an id that the list holds twice ---
{
    build('death_cult_assassin');
    WT.addStartingWargear(archetype('death_cult_assassin').startingWargear);
    check('P5: 2 death_cult_power_blade entries after one call', count('death_cult_power_blade'), 2);
    WT.addStartingWargear(archetype('death_cult_assassin').startingWargear);
    check('P5: still 2 after a second call', count('death_cult_power_blade'), 2);
}

// --- quantity ---
{
    build('incursor');
    const list = archetype('incursor').startingWargear;
    WT.addStartingWargear(list);
    check('Incursor: 3 frag_grenades after one call', count('frag_grenades'), 3);
    WT.addStartingWargear(list);
    check('Incursor: still 3 after a second call', count('frag_grenades'), 3);
    State.removeWargearByIndex(State.character.wargear.findIndex(w => w.id === 'frag_grenades'));
    WT.addStartingWargear(list);
    check('Incursor: a third call after a removal gives 3 again', count('frag_grenades'), 3);
}

// --- CC16, sequence 3: Custom, a standard archetype, Add Starting Wargear, Custom ---
{
    build(null);
    State.setCustomArchetype();
    State.addCustomStartingWargear('knife');
    State.setArchetype('imperial_guardsman');
    WT.addStartingWargear(archetype('imperial_guardsman').startingWargear);
    check('CC16: two knife entries after the click', count('knife'), 2);
    State.setCustomArchetype();
    check('CC16: one knife entry after Custom', count('knife'), 1);
    check('CC16: the record lists knife once', State.character.customArchetype.wargear, ['knife']);
    State.removeCustomStartingWargear(0);
    check('CC16: no knife entry after the record removal', count('knife'), 0);
}

// --- the two buttons, through the real handlers ---
{
    build('rogue_trader');
    renders = 0;
    clickStarting();
    check('archetype button: 4 entries after one click', State.character.wargear.length, 4);
    check('archetype button: render runs once', renders, 1);
    clickStarting();
    check('archetype button: still 4 entries after a second click', State.character.wargear.length, 4);

    build('imperial_guardsman');
    State.character.ascensions.push({ type: 'archetype', archetypeId: 'death_cult_assassin' });
    renders = 0;
    clickAscension('death_cult_assassin');
    check('ascension button: adds the list of the ascension archetype', count('death_cult_power_blade'), 2);
    check('ascension button: does not add the list of the main archetype', count('lasgun'), 0);
    check('ascension button: render runs once', renders, 1);
    clickAscension('death_cult_assassin');
    check('ascension button: still 2 blades after a second click', count('death_cult_power_blade'), 2);
}

// --- a bought item does not count against the starting list ---
{
    build('death_cult_assassin');
    State.addWargear('laspistol');
    WT.addStartingWargear(archetype('death_cult_assassin').startingWargear);
    check('a bought laspistol stays and a starting laspistol is added', count('laspistol'), 2);
    check('one laspistol entry is a starting entry', State.character.wargear.filter(w => w.id === 'laspistol' && w.isStarting).length, 1);
}

// --- the record of a kept custom archetype never makes the count negative ---
{
    build(null);
    State.setCustomArchetype();
    State.addCustomStartingWargear('knife');
    State.setArchetype('imperial_guardsman');
    State.removeWargearByIndex(State.character.wargear.findIndex(w => w.id === 'knife'));
    check('the record lists knife and no entry is left', [State.character.customArchetype.wargear, count('knife')], [['knife'], 0]);
    WT.addStartingWargear(archetype('imperial_guardsman').startingWargear);
    check('Add after the removal of the knife entry gives 1 knife', count('knife'), 1);
}

// --- an entry with an overlay is not a starting entry ---
{
    build('imperial_guardsman');
    State.character.wargear.push({ id: 'knife', isStarting: true, relic: { name: 'Relic knife' } });
    WT.addStartingWargear(archetype('imperial_guardsman').startingWargear);
    check('a relic knife does not count as a starting knife', State.character.wargear.filter(w => w.id === 'knife' && !w.relic).length, 1);
    check('the relic knife stays', State.character.wargear.filter(w => w.id === 'knife' && w.relic).length, 1);
}

// --- CC15: species maximums ---
{
    const max = id => DATA['species.json'].find(s => s.id === id).attributeMaximums;
    check('ork strength maximum is 12', max('ork').strength, 12);
    check('ork toughness maximum is 12', max('ork').toughness, 12);
    check('aeldari strength maximum is 7', max('aeldari').strength, 7);
    const order = ['strength', 'toughness', 'agility', 'initiative', 'willpower', 'intellect', 'fellowship'];
    const table = {
        human: [8, 8, 8, 8, 8, 8, 8],
        ork: [12, 12, 7, 7, 8, 7, 7],
        aeldari: [7, 7, 12, 12, 12, 10, 6],
        astartes: [10, 10, 9, 9, 10, 10, 8],
        primaris: [12, 12, 9, 9, 10, 10, 8]
    };
    for (const [id, values] of Object.entries(table))
        check(`${id} maximums equal the Core p.25 table`, order.map(k => max(id)[k]), values);
}

// --- data version ---
{
    const web = readSource('creator/js/web-api.js');
    check("web-api.js contains '?v=48'", web.includes("'?v=48'"), true);
    check("web-api.js does not contain '?v=47'", web.includes("'?v=47'"), false);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAIL`);
process.exit(failures === 0 ? 0 : 1);
