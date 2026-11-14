// Regression test for issue #31: the Corruption Levels table must have no gap and no overlap.
// The Core Rulebook p. 285 prints "11-15" for level 2. This is a misprint, because 11 is in two
// rows (level 1 is 6-11). The data holds 12 on purpose (#31), so the levels are 0-5, 6-11, 12-15,
// 16-20, 21-25 and 26+.
//
// Run: node scripts/test-corruption-table.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const injuries = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/injuries-corruption.json'), 'utf8'));
const table = injuries.corruptionTable;

let failures = 0;
function check(name, actual, expected) {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

check('the first row starts at corruption 0', table[0].min, 0);
for (let i = 1; i < table.length; i++) {
    check(`row ${i} (level ${table[i].level}) starts one above the end of row ${i - 1}`,
        table[i].min, table[i - 1].max + 1);
}
check('the last row has no maximum', table[table.length - 1].max, null);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
