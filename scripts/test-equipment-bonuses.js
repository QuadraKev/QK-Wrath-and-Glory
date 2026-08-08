// Regression test for issue #20: equipment `bonuses` values of 'rank' / 'doubleRank' must
// resolve to numbers. Before the fix, getEquipmentBonuses() emitted the raw string and every
// consumer concatenated it, rendering Resilience as "100rank0000" on the character sheet.
//
// Run: node scripts/test-equipment-bonuses.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const equipment = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/equipment.json'), 'utf8'));
const byId = Object.fromEntries(equipment.map(e => [e.id, e]));

// derived-stats.js only needs DataLoader.getEquipment for the paths under test.
const sandbox = { DataLoader: { getEquipment: id => byId[id] }, console };
vm.createContext(sandbox);
// derived-stats.js declares `const DerivedStats`, which does not attach to the sandbox global,
// so evaluate the identifier as a trailing expression to get the object out.
const source = fs.readFileSync(path.join(ROOT, 'creator/js/derived-stats.js'), 'utf8');
const DerivedStats = vm.runInContext(source + '\n;DerivedStats;', sandbox);

let failures = 0;
function check(name, actual, expected) {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// --- the reported case: Arbites Assault Shield grants +Rank Resilience ---
const shieldChar = { rank: 3, wargear: [{ id: 'arbites_assault_shield' }] };

const collected = DerivedStats.getEquipmentBonuses(shieldChar).resilience || [];
check('getEquipmentBonuses emits a number, not the raw "rank" string',
    typeof collected[0]?.value, 'number');
check('bonus value resolves to the character rank (3)',
    collected[0]?.value, 3);
check('getEquipmentBonusTotal returns a number for rank-scaled bonuses',
    DerivedStats.getEquipmentBonusTotal(shieldChar, 'resilience'), 3);

// rank must actually scale
check('rank 1 resolves to 1',
    DerivedStats.getEquipmentBonusTotal({ rank: 1, wargear: [{ id: 'arbites_assault_shield' }] }, 'resilience'), 1);

// --- no regression for the 20 items whose bonuses are plain integers ---
check('plain numeric bonus still works (Augmetic Arm, +1 Strength)',
    DerivedStats.getEquipmentBonusTotal({ rank: 3, wargear: [{ id: 'augmetic_arm' }] }, 'strength'), 1);
check('two Augmetic Arms stack to +2',
    DerivedStats.getEquipmentBonusTotal({ rank: 3, wargear: [{ id: 'augmetic_arm' }, { id: 'augmetic_arm' }] }, 'strength'), 2);
check('absent bonus key returns 0',
    DerivedStats.getEquipmentBonusTotal(shieldChar, 'speed'), 0);
check('empty wargear returns 0',
    DerivedStats.getEquipmentBonusTotal({ rank: 3, wargear: [] }, 'resilience'), 0);

// --- every equipment bonus in the dataset must resolve numerically ---
let nonNumeric = [];
for (const item of equipment) {
    if (!item.bonuses) continue;
    for (const key of Object.keys(item.bonuses)) {
        const total = DerivedStats.getEquipmentBonusTotal({ rank: 2, wargear: [{ id: item.id }] }, key);
        if (typeof total !== 'number' || Number.isNaN(total)) nonNumeric.push(`${item.id}.${key} -> ${JSON.stringify(total)}`);
    }
}
check('every equipment bonus in data/equipment.json resolves to a number',
    nonNumeric.length === 0 ? 'none' : nonNumeric.join(', '), 'none');

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
