// Regression test for issue #20: `bonuses` values of 'rank' / 'doubleRank' must resolve to
// numbers before they reach any consumer. Before the fix, getEquipmentBonuses() emitted the raw
// string and consumers concatenated it, rendering Resilience as "100rank0000" on the character
// sheet. getMutationBonuses() had the same shape and is covered here too.
//
// Run: node scripts/test-bonus-resolution.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const equipment = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/equipment.json'), 'utf8'));
const byId = Object.fromEntries(equipment.map(e => [e.id, e]));
const injuries = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/injuries-corruption.json'), 'utf8'));

// No shipped mutation uses a rank-scaled bonus yet, so add one to the stubbed data to prove the
// code path resolves it. Guards the case from regressing when such a mutation is authored.
const injuriesForTest = {
    ...injuries,
    mutations: [...injuries.mutations, { id: 'test_rank_mutation', name: 'Test Rank Mutation', bonuses: { resilience: 'rank' } }]
};

// derived-stats.js needs only these DataLoader entry points for the paths under test.
const sandbox = {
    DataLoader: { getEquipment: id => byId[id], getInjuriesCorruptionData: () => injuriesForTest },
    console
};
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

// --- mutations share the same shape and must resolve the same way ---
const rankMut = { rank: 4, mutations: [{ id: 'test_rank_mutation' }] };
check('mutation rank-scaled bonus resolves to a number',
    typeof DerivedStats.getMutationBonuses(rankMut).resilience?.[0]?.value, 'number');
check('mutation rank-scaled bonus equals the character rank (4)',
    DerivedStats.getMutationBonusTotal(rankMut, 'resilience'), 4);
check('plain numeric mutation bonus still works (Bestial Hide, +1 Resilience)',
    DerivedStats.getMutationBonusTotal({ rank: 3, mutations: [{ id: 'bestial_hide' }] }, 'resilience'), 1);
check('negative mutation bonus still works (Gossamer Flesh, -1 Resilience)',
    DerivedStats.getMutationBonusTotal({ rank: 3, mutations: [{ id: 'gossamer_flesh' }] }, 'resilience'), -1);
check('mutation sub-choice bonus still works (Aberration/tortoise, +1 Resilience)',
    DerivedStats.getMutationBonusTotal({ rank: 3, mutations: [{ id: 'aberration', subChoice: 'tortoise' }] }, 'resilience'), 1);

let nonNumericMut = [];
for (const m of injuries.mutations || []) {
    const sets = [m.bonuses, ...(m.subChoices || []).map(s => s.bonuses)].filter(Boolean);
    for (const set of sets) {
        for (const key of Object.keys(set)) {
            const sub = (m.subChoices || []).find(s => s.bonuses === set);
            const char = { rank: 2, mutations: [{ id: m.id, ...(sub ? { subChoice: sub.id } : {}) }] };
            const total = DerivedStats.getMutationBonusTotal(char, key);
            if (typeof total !== 'number' || Number.isNaN(total)) nonNumericMut.push(`${m.id}.${key} -> ${JSON.stringify(total)}`);
        }
    }
}
check('every mutation bonus in data/injuries-corruption.json resolves to a number',
    nonNumericMut.length === 0 ? 'none' : nonNumericMut.join(', '), 'none');

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
