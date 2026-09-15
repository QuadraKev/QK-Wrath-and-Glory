// Tests for DataLoader.formatRarity() / DataLoader.requisitionDN() — the rarity penalty
// added to an item's Value to get its requisition DN (Core Rulebook p. 205-206).
// Both apps keep parallel copies of data-loader.js, so both are loaded and compared.
// Run: node scripts/test-rarity.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

// data-loader.js declares `const DataLoader`, which does not attach to the sandbox global,
// so evaluate the identifier as a trailing expression to get the object out. Nothing in the
// file runs at load time beyond the object literal, so `console` is the only stub needed.
function loadDataLoader(relPath) {
    const sandbox = { console };
    vm.createContext(sandbox);
    const source = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    return vm.runInContext(source + '\n;DataLoader;', sandbox);
}

const CreatorLoader = loadDataLoader('creator/js/data-loader.js');
const BestiaryLoader = loadDataLoader('bestiary/js/data-loader.js');

let failures = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// --- formatRarity: the five Rarity Penalties (Core Rulebook p. 206) ---
check('formatRarity Common', CreatorLoader.formatRarity('Common'), 'Common (+0)');
check('formatRarity Uncommon', CreatorLoader.formatRarity('Uncommon'), 'Uncommon (+1)');
check('formatRarity Rare', CreatorLoader.formatRarity('Rare'), 'Rare (+2)');
check('formatRarity Very Rare', CreatorLoader.formatRarity('Very Rare'), 'Very Rare (+3)');
check('formatRarity Unique', CreatorLoader.formatRarity('Unique'), 'Unique (+4)');

// --- formatRarity: missing / unknown values never throw ---
check('formatRarity passes "-" through', CreatorLoader.formatRarity('-'), '-');
check('formatRarity on undefined gives "-"', CreatorLoader.formatRarity(undefined), '-');
check('formatRarity on null gives "-"', CreatorLoader.formatRarity(null), '-');
check('formatRarity on an empty string gives "-"', CreatorLoader.formatRarity(''), '-');
check('formatRarity passes an unknown rarity through', CreatorLoader.formatRarity('Legendary'), 'Legendary');

// --- requisitionDN: Value + rarity penalty (Core Rulebook p. 205) ---
check('requisitionDN for a normal item', CreatorLoader.requisitionDN({ value: 6, rarity: 'Rare' }), 8);
check('requisitionDN for a Common item', CreatorLoader.requisitionDN({ value: 3, rarity: 'Common' }), 3);
check('requisitionDN for a Unique item', CreatorLoader.requisitionDN({ value: 5, rarity: 'Unique' }), 9);
check('requisitionDN for a value of 0', CreatorLoader.requisitionDN({ value: 0, rarity: 'Common' }), 0);
check('requisitionDN parses a numeric string value', CreatorLoader.requisitionDN({ value: '4', rarity: 'Uncommon' }), 5);

// --- requisitionDN: null whenever either half is unusable ---
check('requisitionDN with value "-"', CreatorLoader.requisitionDN({ value: '-', rarity: 'Rare' }), null);
check('requisitionDN with rarity "-"', CreatorLoader.requisitionDN({ value: 6, rarity: '-' }), null);
check('requisitionDN with a missing value', CreatorLoader.requisitionDN({ rarity: 'Rare' }), null);
check('requisitionDN with a missing rarity', CreatorLoader.requisitionDN({ value: 6 }), null);
check('requisitionDN with a non-numeric value', CreatorLoader.requisitionDN({ value: 'Varies', rarity: 'Rare' }), null);
check('requisitionDN with an unknown rarity', CreatorLoader.requisitionDN({ value: 6, rarity: 'Legendary' }), null);
check('requisitionDN with no item at all', CreatorLoader.requisitionDN(undefined), null);

// --- the bestiary copy must behave identically ---
const rarities = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Unique', '-', undefined, 'Legendary'];
check('bestiary formatRarity matches creator',
    rarities.map(r => BestiaryLoader.formatRarity(r)),
    rarities.map(r => CreatorLoader.formatRarity(r)));

const items = [
    { value: 6, rarity: 'Rare' },
    { value: 0, rarity: 'Common' },
    { value: '-', rarity: 'Rare' },
    { value: 6, rarity: '-' },
    { value: 5, rarity: 'Unique' },
    { value: 2, rarity: 'Very Rare' }
];
check('bestiary requisitionDN matches creator',
    items.map(i => BestiaryLoader.requisitionDN(i)),
    items.map(i => CreatorLoader.requisitionDN(i)));

// --- every rarity string in the shared dataset is one of the five (or "-") ---
const known = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Unique', '-'];
const unknownRarities = new Set();
for (const file of ['weapons', 'armor', 'equipment', 'weapon-upgrades']) {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', `${file}.json`), 'utf8'));
    data.forEach(i => {
        if (i.rarity !== undefined && !known.includes(i.rarity)) unknownRarities.add(i.rarity);
    });
}
check('the dataset only uses known rarities', [...unknownRarities], []);

console.log(failures === 0 ? '\nAll rarity tests passed.' : `\n${failures} test(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
