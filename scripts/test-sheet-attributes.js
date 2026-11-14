// Regression test for issue #32: the character sheet must show the effective attribute value,
// with the mutation bonus included. Before the fix, renderAttributes added the equipment bonus
// only, and copySummary printed the base value. The Withered mutation (-1 Toughness, +2
// Willpower) showed Toughness 3 and Willpower 3 on the sheet, while the derived traits used 2 and 5.
//
// Loads the real derived-stats.js, the real character-sheet-tab.js and the real Withered entry.
// Run: node scripts/test-sheet-attributes.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const readSource = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let failures = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const equipment = readJson('data/equipment.json');
const equipmentById = Object.fromEntries(equipment.map(e => [e.id, e]));
const injuries = readJson('data/injuries-corruption.json');

let currentCharacter = null;
const clipboard = [];
const sandbox = {
    DataLoader: {
        getEquipment: id => equipmentById[id],
        getInjuriesCorruptionData: () => injuries,
        getSpecies: () => null,
        getArchetype: () => null,
        getTalent: () => null,
        getArmor: () => null,
        getWargearItem: id => equipmentById[id] || null
    },
    State: {
        getCharacter: () => currentCharacter,
        getKeywords: () => [],
        getEffectiveTier: () => 1,
        isPsyker: () => false
    },
    // escapeHtml() needs document.createElement
    document: {
        createElement() {
            let text = '';
            return {
                set textContent(value) { text = String(value); },
                get innerHTML() { return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
            };
        }
    },
    navigator: { clipboard: { writeText: (text) => { clipboard.push(text); return { then() {} }; } } },
    console
};
vm.createContext(sandbox);
// The files declare `const` globals, which do not attach to the sandbox global,
// so evaluate the identifier as a trailing expression to get each object out.
const DerivedStats = vm.runInContext(readSource('creator/js/derived-stats.js') + '\n;DerivedStats;', sandbox);
const CharacterSheetTab = vm.runInContext(readSource('creator/tabs/character-sheet-tab.js') + '\n;CharacterSheetTab;', sandbox);

const attributes = { strength: 3, toughness: 3, agility: 3, initiative: 3, willpower: 3, intellect: 3, fellowship: 3 };
const makeCharacter = (extra) => ({ rank: 1, attributes: { ...attributes }, skills: {}, wargear: [], mutations: [], ...extra });

// The HTML of one attribute cell, from its name span to the end of its abbreviation span.
function cellFor(html, name) {
    const start = html.indexOf(`<span class="sheet-compact-name">${name}</span>`);
    const open = html.lastIndexOf('<div', start);
    return html.slice(open, html.indexOf('</div>', start) + 6).replace(/\s+/g, ' ');
}

// --- a character with the Withered mutation ---
const withered = makeCharacter({ mutations: [{ id: 'withered' }] });
check('the Withered entry in the data gives -1 Toughness and +2 Willpower',
    injuries.mutations.find(m => m.id === 'withered').bonuses, { toughness: -1, willpower: 2 });
check('getEffectiveAttribute gives Toughness 2', DerivedStats.getEffectiveAttribute(withered, 'toughness'), 2);
check('getEffectiveAttribute gives Willpower 5', DerivedStats.getEffectiveAttribute(withered, 'willpower'), 5);

const witheredHtml = CharacterSheetTab.renderAttributes(withered);
const touCell = cellFor(witheredHtml, 'Toughness');
const wilCell = cellFor(witheredHtml, 'Willpower');
check('the sheet shows Toughness 2', touCell.includes('<span class="sheet-compact-value">2</span>'), true);
check('the sheet shows Willpower 5', wilCell.includes('<span class="sheet-compact-value">5</span>'), true);
check('the Toughness breakdown lists the mutation penalty', touCell.includes('-1 Withered'), true);
check('the Willpower breakdown lists the mutation bonus', wilCell.includes('+2 Withered'), true);
check('the Willpower breakdown lists base and total', wilCell.includes('Base: 3') && wilCell.includes('Total: 5'), true);
check('an attribute with a mutation bonus gets the modified styling',
    touCell.includes('sheet-trait-tappable') && wilCell.includes('sheet-trait-tappable'), true);
check('an attribute with no bonus keeps the plain styling',
    cellFor(witheredHtml, 'Strength').includes('sheet-trait-tappable'), false);

// --- mutation and equipment bonus on the same attribute: both are listed ---
const both = makeCharacter({ mutations: [{ id: 'withered' }], wargear: [{ id: 'augmetic_viscera' }] });
const touBoth = cellFor(CharacterSheetTab.renderAttributes(both), 'Toughness');
// The two bonuses cancel (+1 and -1), but the breakdown must still show where the value comes from.
check('the Toughness breakdown lists the equipment and the mutation',
    touBoth.includes('title="Base: 3 +1 Augmetic Viscera -1 Withered Total: 3"'), true);

// --- no mutation and no equipment bonus: same HTML as before the fix ---
const plainCell = (name, abbrev) => `<div class="sheet-compact-item"> <span class="sheet-compact-name">${name}</span> ` +
    `<span class="sheet-compact-value">3</span> <span class="sheet-compact-abbrev">[${abbrev}]</span> </div>`;
const plainHtml = CharacterSheetTab.renderAttributes(makeCharacter());
for (const [name, abbrev] of [['Strength', 'STR'], ['Toughness', 'TOU'], ['Agility', 'AGI'], ['Initiative', 'INI'],
    ['Willpower', 'WIL'], ['Intellect', 'INT'], ['Fellowship', 'FEL']]) {
    check(`a plain character renders ${name} as before`, cellFor(plainHtml, name), plainCell(name, abbrev));
}
const equipOnlyHtml = CharacterSheetTab.renderAttributes(makeCharacter({ wargear: [{ id: 'augmetic_arm' }] }));
check('an equipment-only bonus renders as before',
    cellFor(equipOnlyHtml, 'Strength'),
    '<div class="sheet-compact-item sheet-trait-tappable" title="Base: 3 +1 Augmetic Arm Total: 4"> ' +
    '<span class="sheet-compact-name">Strength</span> <span class="sheet-compact-value">4</span> ' +
    '<span class="sheet-compact-abbrev">[STR]</span> </div>');

// --- the plain-text copy holds the effective values ---
currentCharacter = withered;
CharacterSheetTab.copySummary({ innerHTML: '' });
const attrLine = (clipboard[0] || '').split('\n').find(line => line.startsWith('STR:'));
check('copySummary prints the effective attributes',
    attrLine, 'STR: 3 | TOU: 2 | AGI: 3 | INI: 3 | WIL: 5 | INT: 3 | FEL: 3');

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
