// Tests for the wargear index references in creator/js/state.js: an owned-item talent choice stays on its item
// when the wargear list changes, and Custom Archetype keeps the wargear of the user (spec §7.2, §7.3, §7.4).
// Run: node scripts/test-wargear-refs.js

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

const ctx = vm.createContext({
    console,
    document: { getElementById: () => null }, window: { api: {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setTimeout: () => 0, clearTimeout: () => {}
});
for (const f of ['data-loader.js', 'custom-wargear.js', 'improvised-builder.js', 'character-check.js', 'state.js',
    'xp-calculator.js', 'derived-stats.js', 'prerequisite.js', 'keyword-bonus.js', 'followers.js'])
    vm.runInContext(readSource(`creator/js/${f}`), ctx, { filename: f });
const get = name => vm.runInContext(name, ctx);
const DL = get('DataLoader'), State = get('State'), CW = get('CustomWargear'), IB = get('ImprovisedBuilder');
DL.cache = DATA;
State.init({});

// A new Human character with no archetype.
function human() {
    State.newCharacter();
    State.setSpecies('human');
    return State.character;
}
const ids = () => State.character.wargear.map(w => w.id);
const choices = () => State.character.talents.map(t => t.choice);
const relic = form => ({ name: 'Vow', form, originalOwner: null, anointment: null, power: null, oddities: [] });

// --- B1: a remove by index moves each choice with its item ---
function b1() {
    human();
    for (const id of ['knife', 'lasgun', 'laspistol', 'flak_armour', 'mesh_armour']) State.addWargear(id);
    State.character.talents = [{ id: 'trademark_weapon', choice: '1' }, { id: 'armourmonger_aoa', choice: 4 }];
}
b1();
State.removeWargearByIndex(0);
check('B1: remove index 0: the choices move to \'0\' and 3', choices(), ['0', 3]);
check('B1: remove index 0: wargear[0] is the lasgun', State.character.wargear[0].id, 'lasgun');
State.removeWargearByIndex(0);
check('B1: remove the lasgun: Trademark is null and Armour-Monger is 2', choices(), [null, 2]);

b1();
State.removeWargear('knife');
check('B1: removeWargear(knife) gives the same result as removeWargearByIndex(0)',
    [choices(), State.character.wargear[0].id], [['0', 3], 'lasgun']);

// --- Custom starting wargear: a remove moves the choice ---
human();
State.setCustomArchetype();
State.addCustomStartingWargear('knife');
State.addWargear('lasgun');
State.character.talents = [{ id: 'trademark_weapon', choice: '1' }];
State.removeCustomStartingWargear(0);
check('custom starting: after the remove of the knife, Trademark is \'0\'', choices(), ['0']);
check('custom starting: the lasgun stays', ids(), ['lasgun']);

// --- Relic: a change of kind clears the choice, the same kind keeps it ---
human();
State.addRelicWargear('flak_armour', relic('mundane_armour_or_clothing'));
State.character.talents = [{ id: 'armourmonger_aoa', choice: '0' }];
State.updateRelicWargear(0, 'lasgun', relic('las_weapon'));
check('relic: armour to weapon clears Armour-Monger', choices(), [null]);
human();
State.addRelicWargear('laspistol', relic('las_weapon'));
State.character.talents = [{ id: 'trademark_weapon', choice: '0' }];
State.updateRelicWargear(0, 'lasgun', relic('las_weapon'));
check('relic: weapon to weapon keeps Trademark', choices(), ['0']);

// --- A7: Custom Archetype keeps relics, improvised items, bought items and custom items ---
function a7Fixture() {
    human();
    State.setArchetype('imperial_guardsman');
    const starting = [];
    for (const entry of DL.getArchetype('imperial_guardsman').startingWargear) {
        const id = typeof entry === 'string' ? entry : entry.id;
        const qty = typeof entry === 'string' ? 1 : (entry.qty || 1);
        if (!DL.getWargearItem(id)) continue;
        for (let i = 0; i < qty; i++) {
            starting.push(State.character.wargear.length);
            State.addWargear(id, true);
        }
    }
    State.addRelicWargear('laspistol', relic('weapon'));
    State.addImprovisedWargear({ id: IB.BASE_IDS[0], improvised: { name: 'Leg', details: '', halfTime: 0, damageRank: false, removeUnwieldy: false, doubleRange: false, traits: [] } });
    State.addWargear('chainsword');
    const chainswordIndex = State.character.wargear.length - 1;
    State.addCustomItem(CW.buildRecord({ ...CW.emptyForm(), name: 'Custom A' }));
    State.character.talents = [{ id: 'trademark_weapon', choice: String(chainswordIndex) }];
    return { starting, chainswordIndex };
}
const { starting, chainswordIndex } = a7Fixture();
check('A7: the guardsman has some resolved starting items', starting.length > 0, true);
check('A7: getOldStartingEntries gives the starting indices', State.getOldStartingEntries(), starting);
State.setCustomArchetype();
const label = w => w.relic ? 'relic' : w.improvised ? 'improvised' : w.custom ? 'custom' : w.id;
check('A7: the wargear holds the relic, the improvised item, the chainsword and the custom item',
    State.character.wargear.map(label), ['relic', 'improvised', 'chainsword', 'custom']);
check('A7: Trademark names the chainsword', State.character.wargear[parseInt(choices()[0], 10)].id, 'chainsword');

// --- P5: a repeated id in the starting list counts each time ---
human();
State.setArchetype('death_cult_assassin');
State.addWargear('death_cult_power_blade', true);
State.addWargear('death_cult_power_blade', true);
check('P5: getOldStartingEntries holds both power blades', State.getOldStartingEntries(), [0, 1]);

// --- CC16, sequence 1: Custom, a standard archetype, Custom ---
human();
State.setCustomArchetype();
State.addCustomStartingWargear('knife');
State.setArchetype('imperial_guardsman');
check('CC16 seq 1: getOldStartingEntries leaves out the knife of the kept record', State.getOldStartingEntries(), []);
State.setCustomArchetype();
check('CC16 seq 1: one starting knife after Custom', State.character.wargear.filter(w => w.id === 'knife' && w.isStarting === true).length, 1);
check('CC16 seq 1: the record lists the knife', State.character.customArchetype.wargear, ['knife']);
State.removeCustomStartingWargear(0);
check('CC16 seq 1: after the remove, no knife entry', ids().includes('knife'), false);
check('CC16 seq 1: after the remove, the record list is empty', State.character.customArchetype.wargear, []);

// --- CC16, sequence 2: Custom, a species change, Custom ---
human();
State.setCustomArchetype();
State.addCustomStartingWargear('knife');
State.setSpecies('ogryn');
State.setCustomArchetype();
check('CC16 seq 2: one knife entry', ids().filter(id => id === 'knife').length, 1);
check('CC16 seq 2: the record lists the knife', State.character.customArchetype.wargear, ['knife']);

// --- A9 and B10: the display of an owned-item choice and of the number 0 ---
// A recording DOM stub: each element that the tabs create keeps its innerHTML.
const written = [];
ctx.document = {
    getElementById: () => ({ innerHTML: '', appendChild() {}, classList: { add() {}, remove() {} } }),
    createElement: () => {
        const el = { className: '', appendChild() {}, querySelector: () => ({ addEventListener() {} }), addEventListener() {} };
        let html = '';
        Object.defineProperty(el, 'innerHTML', { get: () => html, set: v => { html = v; written.push(v); } });
        return el;
    }
};
vm.runInContext('var Glossary = { enhanceElement() {} };', ctx);
for (const f of ['talents-tab.js', 'archetype-tab.js', 'character-sheet-tab.js'])
    vm.runInContext(readSource(`creator/tabs/${f}`), ctx, { filename: f });
const TalentsTab = get('TalentsTab'), ArchetypeTab = get('ArchetypeTab'), SheetTab = get('CharacterSheetTab');

human();
State.character.talents = [{ id: 'trademark_weapon', choice: null }];
written.length = 0;
TalentsTab.renderSelected();
check('A9: the talents tab shows a cleared choice', written.join('').includes('Trademark Weapon (no item selected)'), true);

const sheetNull = SheetTab.renderTalents({ talents: [{ id: 'trademark_weapon', choice: null }], wargear: [] });
check('A9: the sheet shows a cleared choice', sheetNull.includes('(no item selected)'), true);
check('A9: the sheet writes no Chosen note for a cleared choice', sheetNull.includes('Chosen:'), false);
const sheetAbsent = SheetTab.renderTalents({ talents: [{ id: 'trademark_weapon' }], wargear: [] });
check('A9: the sheet shows an absent choice', sheetAbsent.includes('(no item selected)'), true);
const sheetZero = SheetTab.renderTalents({ talents: [{ id: 'hatred', choice: 0 }], wargear: [] });
check('B10: the sheet shows the number choice 0', sheetZero.includes('Chosen: 0'), true);

// F4: a text choice and a talent with no choice keep their display
const plain = [{ id: 'angel_of_death' }, { id: 'hatred', choice: null }];
human();
State.character.talents = plain;
written.length = 0;
TalentsTab.renderSelected();
check('F4: the talents tab adds no item text to a text choice or to no choice', written.join('').includes('(no item selected)'), false);
check('F4: the sheet adds no item text to a text choice or to no choice', SheetTab.renderTalents(State.character).includes('(no item selected)'), false);
human();
State.character.talents = [{ id: 'hatred', choice: 'ORKS' }];
written.length = 0;
TalentsTab.renderSelected();
check('F4: the talents tab shows a text choice', written.join('').includes('Hatred (ORKS)'), true);
check('F4: the sheet shows a text choice', SheetTab.renderTalents(State.character).includes('Chosen: ORKS'), true);

// F5: an index with no item of the kind of the talent shows as a cleared choice, and the stored value stays
function f5(name, wargear, talent, shown) {
    human();
    State.character.wargear = wargear;
    State.character.talents = [talent];
    const stored = JSON.stringify(State.character.talents);
    written.length = 0;
    TalentsTab.renderSelected();
    const tabHtml = written.join('');
    const sheetHtml = SheetTab.renderTalents(State.character);
    if (shown === null) {
        check(`F5: ${name}: the talents tab shows no item selected`, tabHtml.includes('(no item selected)'), true);
        check(`F5: ${name}: the sheet shows no item selected`, sheetHtml.includes('(no item selected)'), true);
        check(`F5: ${name}: the sheet has no Chosen note`, sheetHtml.includes('Chosen:'), false);
    } else {
        check(`F5: ${name}: the talents tab shows the item name`, tabHtml.includes(`(${shown})`), true);
        check(`F5: ${name}: the sheet shows the item name`, sheetHtml.includes(`(${shown})`), true);
        check(`F5: ${name}: the tab and the sheet show no item selected`, tabHtml.includes('(no item selected)') || sheetHtml.includes('(no item selected)'), false);
    }
    check(`F5: ${name}: the render does not change the stored choice`, JSON.stringify(State.character.talents), stored);
}
const two = () => [{ id: 'knife', isStarting: false }, { id: 'flak_armour', isStarting: false }];
f5('a stale index', two(), { id: 'trademark_weapon', choice: '7' }, null);
f5('an item of the wrong kind', two(), { id: 'trademark_weapon', choice: '1' }, null);
f5('the string 0 with no wargear', [], { id: 'trademark_weapon', choice: '0' }, null);
f5('the number 0 with no wargear', [], { id: 'trademark_weapon', choice: 0 }, null);
f5('an armour talent on a weapon', two(), { id: 'armourmonger_aoa', choice: '0' }, null);
f5('a real weapon', two(), { id: 'trademark_weapon', choice: '0' }, DL.getWeapon('knife').name);
f5('a real armour', two(), { id: 'armourmonger_aoa', choice: 1 }, DL.getArmor('flak_armour').name);

// A text choice on an owned-item talent (an old save) shows as the text, as before Task 7.
human();
State.character.wargear = [{ id: 'knife', isStarting: false }];
State.character.talents = [{ id: 'trademark_weapon', choice: 'Chainsword' }];
written.length = 0;
TalentsTab.renderSelected();
const textTab = written.join('');
const textSheet = SheetTab.renderTalents(State.character);
check('F5: a text choice: the talents tab shows the text', textTab.includes('<span class="selected-talent-name">Trademark Weapon (Chainsword) </span>'), true);
check('F5: a text choice: the sheet shows the text in the name', textSheet.includes('<span class="sheet-talent-name">Trademark Weapon (Chainsword)</span>'), true);
check('F5: a text choice: the sheet writes the Chosen note', textSheet.includes('<strong class="sheet-talent-choice">Chosen: Chainsword</strong>. '), true);
check('F5: a text choice: no item selected is not shown', (textTab + textSheet).includes('(no item selected)'), false);
f5('an empty text', two(), { id: 'trademark_weapon', choice: '' }, null);

// --- A7: the confirm of a select of Custom Archetype ---
ArchetypeTab.renderCustomConfig = () => {};
const asked = [];
a7Fixture();
const before = JSON.stringify(State.character.wargear);
const beforeChoices = choices();
const expectedNames = State.getOldStartingEntries().map(index => DL.getWargearItem(State.character.wargear[index].id).name);
ctx.window.api.showConfirm = async message => { asked.push(message); return false; };
(async () => {
    await ArchetypeTab.selectCustomArchetype();
    check('A7: a cancel keeps the archetype', State.character.archetype.id, 'imperial_guardsman');
    check('A7: a cancel keeps the wargear', JSON.stringify(State.character.wargear), before);
    check('A7: a cancel keeps the talent choice', choices(), beforeChoices);
    check('A7: the confirm lists the names of the starting entries, in order', asked,
        [`Custom Archetype removes the starting wargear of Imperial Guardsman: ${expectedNames.join(', ')}. Continue?`]);
    ctx.window.api.showConfirm = async () => true;
    await ArchetypeTab.selectCustomArchetype();
    check('A7: an accept sets Custom Archetype', State.character.archetype.id, 'custom');
    check('A7: an accept keeps the relic, the improvised item, the chainsword and the custom item',
        State.character.wargear.map(label), ['relic', 'improvised', 'chainsword', 'custom']);

    // A standard archetype with bought items only: no confirm
    human();
    State.setArchetype('imperial_guardsman');
    State.addWargear('knife');
    asked.length = 0;
    ctx.window.api.showConfirm = async message => { asked.push(message); return true; };
    await ArchetypeTab.selectCustomArchetype();
    check('A7: a standard archetype with bought items only, no confirm', asked.length, 0);
    check('A7: a standard archetype with bought items only, the archetype is custom', State.character.archetype.id, 'custom');

    // No archetype and no starting entries: no confirm
    human();
    State.addWargear('knife');
    asked.length = 0;
    await ArchetypeTab.selectCustomArchetype();
    check('A7: no starting entries, no confirm', asked.length, 0);
    check('A7: no starting entries, the archetype is custom', State.character.archetype.id, 'custom');

    console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
    process.exit(failures ? 1 : 0);
})();
