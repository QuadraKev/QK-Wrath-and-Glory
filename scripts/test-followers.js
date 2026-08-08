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

// --- State's follower mutators (addFollower/removeFollower/getFollower/updateFollower) ---
// state.js is not a pure module: it touches localStorage/setTimeout/clearTimeout via
// notifyListeners -> _scheduleAutoSave, so the sandbox stubs those. It also references
// Followers as a bare global, so followers.js is run into the same context first.
const stateStore = {};
const stateSandbox = {
    console,
    localStorage: {
        getItem: k => (k in stateStore ? stateStore[k] : null),
        setItem: (k, v) => { stateStore[k] = String(v); },
        removeItem: k => { delete stateStore[k]; }
    },
    // No-op timers: state.js schedules an auto-save via setTimeout/clearTimeout on every
    // notifyListeners() call. The real timers would leave a debounce timer live for the
    // life of the process, which would fire inside _performAutoSave after the tests are
    // done making assertions.
    setTimeout: () => 0,
    clearTimeout: () => {}
};
vm.createContext(stateSandbox);
vm.runInContext(source, stateSandbox); // defines Followers in this context
const stateSource = fs.readFileSync(path.join(ROOT, 'creator/js/state.js'), 'utf8');
const State = vm.runInContext(stateSource + '\n;State;', stateSandbox);

// addFollower
State.character = { followers: [] };
const add1 = State.addFollower('cyber_mastiff');
check('addFollower pushes an entry onto character.followers', State.character.followers.length, 1);
check('addFollower returns the pushed entry', add1 === State.character.followers[0], true);
const add2 = State.addFollower('cyber_mastiff');
check('a second addFollower produces a distinct id', add1.id === add2.id, false);

// removeFollower
State.character = { followers: [] };
const rm1 = State.addFollower('cyber_mastiff');
const rm2 = State.addFollower('cyber_mastiff');
const rm3 = State.addFollower('cyber_mastiff');
State.removeFollower(rm2.id);
check('removeFollower removes the right entry and keeps the others',
    State.character.followers.map(f => f.id), [rm1.id, rm3.id]);
State.removeFollower('nonexistent-id');
check('removeFollower on an unknown id is a no-op',
    State.character.followers.map(f => f.id), [rm1.id, rm3.id]);

// getFollower
check('getFollower returns undefined for an unknown id', State.getFollower('nonexistent-id'), undefined);

// updateFollower: patch merge
State.character = { followers: [] };
const upd = State.addFollower('cyber_mastiff');
State.updateFollower(upd.id, { name: 'Fido', notes: 'a good dog' });
check('updateFollower merges a patch', { name: upd.name, notes: upd.notes }, { name: 'Fido', notes: 'a good dog' });

// updateFollower: individual forces count/livingCount to 1
State.updateFollower(upd.id, { kind: 'individual', count: 5, livingCount: 3 });
check('individual forces count to 1', upd.count, 1);
check('individual forces livingCount to 1', upd.livingCount, 1);

// updateFollower: mob clamps livingCount into [0, count]
State.character = { followers: [] };
const mob = State.addFollower('cyber_mastiff');
State.updateFollower(mob.id, { kind: 'mob', count: 8, livingCount: 12 });
check('mob clamps a livingCount above count down to count', mob.livingCount, 8);
State.updateFollower(mob.id, { livingCount: -3 });
check('mob clamps a negative livingCount up to 0', mob.livingCount, 0);

// updateFollower: count is clamped to at least 1
State.updateFollower(mob.id, { count: 0 });
check('mob count of 0 becomes at least 1', mob.count, 1);
State.updateFollower(mob.id, { count: -5 });
check('mob count of a negative number becomes at least 1', mob.count, 1);
State.updateFollower(mob.id, { count: 'abc' });
check('mob count of a non-numeric value becomes at least 1', mob.count, 1);

// updateFollower: mob -> individual -> mob remembers the mob's numbers
State.character = { followers: [] };
const mem = State.addFollower('cyber_mastiff');
State.updateFollower(mem.id, { kind: 'mob', count: 8, livingCount: 5 });
State.updateFollower(mem.id, { kind: 'individual' });
check('switching mob -> individual still shows count 1', mem.count, 1);
check('switching mob -> individual still shows livingCount 1', mem.livingCount, 1);
State.updateFollower(mem.id, { kind: 'mob' });
check('switching back to mob restores the remembered count', mem.count, 8);
check('switching back to mob restores the remembered livingCount', mem.livingCount, 5);

// updateFollower: a follower that was always individual gets 1/1 on its first switch to mob
State.character = { followers: [] };
const alwaysIndividual = State.addFollower('cyber_mastiff');
State.updateFollower(alwaysIndividual.id, { kind: 'mob' });
check('a follower with no remembered mob numbers becomes a mob of 1/1',
    { count: alwaysIndividual.count, livingCount: alwaysIndividual.livingCount }, { count: 1, livingCount: 1 });

// updateFollower: remembered mob numbers survive a JSON.stringify/JSON.parse round-trip
State.character = { followers: [] };
const roundTrip = State.addFollower('cyber_mastiff');
State.updateFollower(roundTrip.id, { kind: 'mob', count: 8, livingCount: 5 });
State.updateFollower(roundTrip.id, { kind: 'individual' });
const revived = JSON.parse(JSON.stringify(roundTrip));
State.character.followers = [revived];
State.updateFollower(revived.id, { kind: 'mob' });
check('a follower survives JSON.stringify/JSON.parse with its remembered mob numbers intact',
    { count: revived.count, livingCount: revived.livingCount }, { count: 8, livingCount: 5 });

// updateFollower: intervening individual-to-individual patches must not clobber the
// remembered mob numbers. wasMob is captured fresh at the top of each call, so it is
// only true on the actual mob -> individual transition, not on later edits made while
// already individual (a name change, then a notes change).
State.character = { followers: [] };
const survivesEdits = State.addFollower('cyber_mastiff');
State.updateFollower(survivesEdits.id, { kind: 'mob', count: 8, livingCount: 5 });
State.updateFollower(survivesEdits.id, { kind: 'individual' });
State.updateFollower(survivesEdits.id, { name: 'Rex' });
State.updateFollower(survivesEdits.id, { notes: 'loyal' });
State.updateFollower(survivesEdits.id, { kind: 'mob' });
check('individual-to-individual edits between mob visits do not clobber remembered numbers',
    { count: survivesEdits.count, livingCount: survivesEdits.livingCount }, { count: 8, livingCount: 5 });

// updateFollower: the count and livingCount restores are independent. A patch that only
// sets livingCount when switching back to mob must still restore count from memory.
State.character = { followers: [] };
const partialRestore = State.addFollower('cyber_mastiff');
State.updateFollower(partialRestore.id, { kind: 'mob', count: 8, livingCount: 5 });
State.updateFollower(partialRestore.id, { kind: 'individual' });
State.updateFollower(partialRestore.id, { kind: 'mob', livingCount: 4 });
check('a patch that only sets livingCount still restores count from memory',
    { count: partialRestore.count, livingCount: partialRestore.livingCount }, { count: 8, livingCount: 4 });

// addFollower: lazily creates character.followers when it is missing entirely
State.character = { followers: [] };
delete State.character.followers;
const lazy = State.addFollower('cyber_mastiff');
check('addFollower lazily creates character.followers when absent',
    Array.isArray(State.character.followers) && State.character.followers[0] === lazy, true);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
