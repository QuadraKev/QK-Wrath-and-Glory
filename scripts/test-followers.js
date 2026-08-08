// Tests for creator/js/followers.js — the pure rule maths behind the Followers feature.
// Run: node scripts/test-followers.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const sandbox = { console };
vm.createContext(sandbox);
// followers.js declares `const Followers`, which does not attach to the sandbox global,
// so evaluate the identifier as a trailing expression to get the object out.
const source = fs.readFileSync(path.join(ROOT, 'creator/js/followers.js'), 'utf8');
const Followers = vm.runInContext(source + '\n;Followers;', sandbox);

let failures = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// --- mob attack bonus: min(n-1, floor(n/2)), clamped at 0 ---
check('mobAttackBonus(0) clamps to 0', Followers.mobAttackBonus(0), 0);
check('mobAttackBonus(1) is 0', Followers.mobAttackBonus(1), 0);
check('mobAttackBonus(2) is 1', Followers.mobAttackBonus(2), 1);
check('mobAttackBonus(3) is 1', Followers.mobAttackBonus(3), 1);
check('mobAttackBonus(4) is 2', Followers.mobAttackBonus(4), 2);
check('mobAttackBonus(5) is 2', Followers.mobAttackBonus(5), 2);
check('mobAttackBonus(10) is 5', Followers.mobAttackBonus(10), 5);
check('mobAttackBonus handles a missing count', Followers.mobAttackBonus(undefined), 0);

// --- alternative stats: 1 + Double Rank, capped at the character's own value ---
check('rank 1 gives 3', Followers.alternativeStatValue(1, 99), 3);
check('rank 2 gives 5', Followers.alternativeStatValue(2, 99), 5);
check('rank 3 gives 7', Followers.alternativeStatValue(3, 99), 7);
check('capped at the character value', Followers.alternativeStatValue(3, 4), 4);
check('uncapped when the character value is missing', Followers.alternativeStatValue(3, null), 7);
check('defaults to rank 1 when rank is missing', Followers.alternativeStatValue(undefined, 99), 3);

// --- attribute key map covers all seven ---
check('THREAT_ATTR_MAP has seven entries', Object.keys(Followers.THREAT_ATTR_MAP).length, 7);
check('THREAT_ATTR_MAP maps threat keys to character keys',
    Object.keys(Followers.THREAT_ATTR_MAP).sort().join(','), 'A,Fel,I,Int,S,T,Wil');
check('THREAT_ATTR_MAP values are the character attribute names',
    Object.values(Followers.THREAT_ATTR_MAP).sort().join(','),
    'agility,fellowship,initiative,intellect,strength,toughness,willpower');

// --- blank follower factory ---
const f = Followers.create('cyber_mastiff');
check('create sets the threatId', f.threatId, 'cyber_mastiff');
check('create defaults to an individual', f.kind, 'individual');
check('create defaults count to 1', f.count, 1);
check('create defaults livingCount to 1', f.livingCount, 1);
check('create defaults the stats toggle to off', f.useAlternativeStats, false);
check('create leaves wounds untracked', f.currentWounds, null);
check('create leaves shock untracked', f.currentShock, null);
check('create gives an id', typeof f.id, 'string');
check('create ids are unique', Followers.create('a').id === Followers.create('b').id, false);

// --- every threatId used in the tests resolves in the dataset ---
const threats = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/threats.json'), 'utf8'));
const threatIds = new Set(threats.map(t => t.id));
check('cyber_mastiff resolves in data/threats.json', threatIds.has('cyber_mastiff'), true);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
