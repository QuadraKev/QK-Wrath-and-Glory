// Tests for StatsTab.xpTipText in creator/tabs/stats-tab.js — the hover tip on the Stats +/- buttons.
// Run: node scripts/test-xp-tip.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const sandbox = { console };
vm.createContext(sandbox);
// Both files declare `const`, which does not attach to the sandbox global, so evaluate
// the identifiers as trailing expressions. stats-tab.js only touches the DOM inside methods.
const XPCalculator = vm.runInContext(
    fs.readFileSync(path.join(ROOT, 'creator/js/xp-calculator.js'), 'utf8') + '\n;XPCalculator;', sandbox);
sandbox.XPCalculator = XPCalculator;
const StatsTab = vm.runInContext(
    fs.readFileSync(path.join(ROOT, 'creator/tabs/stats-tab.js'), 'utf8') + '\n;StatsTab;', sandbox);

let failures = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// Build the arguments the way renderAttributes / renderSkills do.
function attrArgs(direction, value, min, max, affordable) {
    const nextCost = XPCalculator.getNextAttributeCost(value);
    const refund = value > min ? XPCalculator.getAttributeIncreaseCost(value - 1, value) : 0;
    return { direction, value, min, max, nextCost, refund, canAfford: affordable };
}
function skillArgs(direction, value, min, max, affordable) {
    const nextCost = XPCalculator.getNextSkillCost(value);
    const refund = value > min ? XPCalculator.getSkillIncreaseCost(value - 1, value) : 0;
    return { direction, value, min, max, nextCost, refund, canAfford: affordable };
}

// --- attributes (cumulative table: 3 -> 4 costs 20-10 = 10, 4 -> 5 costs 35-20 = 15) ---
check('+ enabled shows the next attribute cost', StatsTab.xpTipText(attrArgs('+', 3, 1, 8, true)), '+10 XP');
check('- enabled shows the refund with a true minus sign', StatsTab.xpTipText(attrArgs('-', 4, 1, 8, true)), '−10 XP');
check('- at the floor says Minimum rank', StatsTab.xpTipText(attrArgs('-', 2, 2, 8, true)), 'Minimum rank');
check('+ at the species maximum says Maximum rank', StatsTab.xpTipText(attrArgs('+', 8, 1, 8, false)), 'Maximum rank');
check('+ unaffordable says what it needs', StatsTab.xpTipText(attrArgs('+', 4, 1, 8, false)), 'Not enough XP (needs 15)');
check('+ with a null next cost says Maximum rank', StatsTab.xpTipText(attrArgs('+', 12, 1, 14, false)), 'Maximum rank');

// --- skills (2 -> 3 costs 12-6 = 6, 3 -> 4 costs 20-12 = 8) ---
check('skill + enabled shows the next skill cost', StatsTab.xpTipText(skillArgs('+', 2, 0, 8, true)), '+6 XP');
check('skill - enabled shows the refund', StatsTab.xpTipText(skillArgs('-', 4, 0, 8, true)), '−8 XP');
check('skill - at rank 0 says Minimum rank', StatsTab.xpTipText(skillArgs('-', 0, 0, 8, true)), 'Minimum rank');
check('skill - at the archetype floor says Minimum rank', StatsTab.xpTipText(skillArgs('-', 2, 2, 8, true)), 'Minimum rank');
check('skill + at rank 8 says Maximum rank', StatsTab.xpTipText(skillArgs('+', 8, 0, 8, false)), 'Maximum rank');
check('skill + unaffordable says what it needs', StatsTab.xpTipText(skillArgs('+', 4, 0, 8, false)), 'Not enough XP (needs 10)');

console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
process.exit(failures ? 1 : 0);
