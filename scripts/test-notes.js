// Tests for the character `notes` field in creator/js/state.js — the data behind the
// Notes builder step and the editable Notes block on the character sheet.
// Run: node scripts/test-notes.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

let failures = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// state.js is not a pure module: it touches localStorage/setTimeout/clearTimeout via
// notifyListeners -> _scheduleAutoSave, so the sandbox stubs those. It also references
// Followers as a bare global, so followers.js is run into the same context first.
const stateStore = {};
const sandbox = {
    console,
    localStorage: {
        getItem: k => (k in stateStore ? stateStore[k] : null),
        setItem: (k, v) => { stateStore[k] = String(v); },
        removeItem: k => { delete stateStore[k]; }
    },
    // No-op timers: the real ones would leave the auto-save debounce live after the tests.
    setTimeout: () => 0,
    clearTimeout: () => {}
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'creator/js/followers.js'), 'utf8'), sandbox);
// state.js declares `const State`, which does not attach to the sandbox global,
// so evaluate the identifier as a trailing expression to get the object out.
const stateSource = fs.readFileSync(path.join(ROOT, 'creator/js/state.js'), 'utf8');
const State = vm.runInContext(stateSource + '\n;State;', sandbox);

// --- a brand new character starts with empty notes ---
check('createNewCharacter gives an empty notes string', State.createNewCharacter().notes, '');

// --- setNotes stores the text, marks the character dirty, and notifies listeners ---
State.character = State.createNewCharacter();
State.isDirty = false;
State.listeners = [];
const seen = [];
State.addListener((changeType, data, character) => seen.push({ changeType, notes: character.notes }));
State.setNotes('a\nb');
check('setNotes stores multi-line text verbatim', State.character.notes, 'a\nb');
check('setNotes marks the character dirty', State.isDirty, true);
check('setNotes notifies listeners with the "notes" change type', seen, [{ changeType: 'notes', notes: 'a\nb' }]);
State.listeners = [];

// --- loading a save that predates the notes field back-fills an empty string ---
State.character = State.createNewCharacter();
State.loadCharacter({ name: 'Old Save', tier: 1 });
check('loadCharacter back-fills notes when the save has no notes key', State.character.notes, '');
check('loadCharacter of an old save keeps the rest of the data', State.character.name, 'Old Save');

// --- loading a save that has notes keeps them ---
State.loadCharacter({ name: 'Newer Save', notes: 'line one\nline two' });
check('loadCharacter keeps notes when the save has them', State.character.notes, 'line one\nline two');

// --- a save/load round trip through JSON preserves multi-line text ---
const multiline = 'Session 1: met the inquisitor.\n\n  - lead: the hive spire\n  - "quoted" & <tagged> text';
State.character = State.createNewCharacter();
State.setNotes(multiline);
const revived = JSON.parse(JSON.stringify(State.character));
State.character = State.createNewCharacter();
State.loadCharacter(revived);
check('notes survive a JSON.stringify/JSON.parse round trip', State.character.notes, multiline);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
