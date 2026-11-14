// Issue #33: every trait on a weapon or armour record must have a Rules Reference entry, so
// that a trait picker can list it and the trait name gets a popup. Each trait of a record in
// data/weapons.json must match the name of an entry in glossary.json weaponTraits, and each
// trait of a record in data/armor.json the name of an entry in armorTraits. A rating in
// parentheses at the end is stripped first ("Rad (3)" -> "Rad").
//
// The allowlists hold the names that stay unmatched on purpose, each with its reason.
//
// Run: node scripts/test-trait-glossary.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
function readJson(rel) {
    return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

const glossary = readJson('data/glossary.json');

const WEAPON_ALLOWLIST = {
    'Agonizing': 'Abundance of Apocrypha prints this spelling of Agonising on these records.',
    'WAAAGH!': 'Church of Steel p. 136 prints Waaagh! in capitals on these records.',
    'Brutal or Reaping': 'Abundance of Apocrypha p. 344 prints a choice of two listed traits.',
    'Special': 'Abundance of Apocrypha p. 378 points to the Special rule of the item, not to a trait.',
    'Mastercrafted': 'Redacted Records II p. 44 prints the Mastercrafted upgrade in the traits column.'
};

const ARMOUR_ALLOWLIST = {
    'Bulky': 'Vow of Absolution and Abundance of Apocrypha print this form of Bulk on these records.',
    'Jump Pack': 'Vow of Absolution p. 72 prints an item of wargear in the Effect line.',
    'Grav-Chute': 'Vow of Absolution p. 72 prints an item of wargear in the Effect line.',
    '+1 Movement': 'Vow of Absolution p. 72 prints an effect, not a trait.',
    '+2 bonus dice to Stealth (A) Tests': 'Vow of Absolution p. 72 prints an effect, not a trait.',
    'Always counts as Braced': 'Aeldari p. 92 prints an effect, not a trait.',
    '+2 Defence': 'Aeldari p. 92 prints no trait for the Holo-Suit. The record holds an effect.',
    '+2 Stealth': 'Aeldari p. 92 prints no trait for the Holo-Suit. The record holds an effect.',
    'Creates partial cover within 10m': 'Aeldari p. 92 prints Special for the Gloom Field. The record holds an effect.'
};

let failures = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function stripRating(trait) {
    return trait.replace(/\s*\([^()]*\)\s*$/, '').trim();
}

function checkList(file, listKey, allowlist) {
    const records = readJson(`data/${file}`);
    const names = new Set(Object.values(glossary[listKey]).map(e => e.name));
    const missing = new Set();
    const used = new Set();
    for (const record of records) {
        for (const trait of record.traits || []) {
            const name = stripRating(trait);
            if (names.has(name)) continue;
            if (Object.prototype.hasOwnProperty.call(allowlist, name)) {
                used.add(name);
                continue;
            }
            missing.add(`${name} (${record.id})`);
        }
    }
    check(`every ${file} trait has a ${listKey} entry`, [...missing], []);
    // An allowlist entry that no record uses any more must go.
    check(`every ${file} allowlist name is still in use`,
        Object.keys(allowlist).filter(n => !used.has(n)), []);
}

check('stripRating removes a rating', stripRating('Rad (3)'), 'Rad');
check('stripRating removes a text rating', stripRating('Mounted (Large)'), 'Mounted');
check('stripRating keeps a name without a rating', stripRating('Paired'), 'Paired');

checkList('weapons.json', 'weaponTraits', WEAPON_ALLOWLIST);
checkList('armor.json', 'armorTraits', ARMOUR_ALLOWLIST);

// The creator's Rules Reference uses the raw key as the entry id for these sections
// (creator/tabs/glossary-tab.js), so a trait key that another section also holds makes one
// entry replace the other. The vehicle sections get a prefixed id, so they cannot collide.
const UNPREFIXED_SECTIONS = ['characterTerms', 'conditions', 'combatTerms', 'terms',
    'weaponTraits', 'armorTraits', 'keywords'];
const KEY_COLLISION_ALLOWLIST = {
    'weaponTraits.arc': 'older collision, not part of #33',
    'weaponTraits.melta': 'older collision, not part of #33',
    'weaponTraits.rad': 'older collision, not part of #33',
    'weaponTraits.two_handed': 'older collision, not part of #33',
    'armorTraits.powered': 'older collision, not part of #33'
};
const collisions = [];
for (const traitSection of ['weaponTraits', 'armorTraits']) {
    for (const key of Object.keys(glossary[traitSection])) {
        const clash = UNPREFIXED_SECTIONS.some(s => s !== traitSection && glossary[s]
            && Object.prototype.hasOwnProperty.call(glossary[s], key));
        if (clash) collisions.push(`${traitSection}.${key}`);
    }
}
check('no trait key repeats a key of another Rules Reference section, except the allowlist',
    collisions.filter(c => !KEY_COLLISION_ALLOWLIST[c]), []);
check('every key collision allowlist entry is still a collision',
    Object.keys(KEY_COLLISION_ALLOWLIST).filter(c => !collisions.includes(c)), []);

// Each script runs in its own context, as a page's <script> tags share one window.
function loadScripts(files, globals) {
    const sandbox = { console: { log() {}, warn() {}, error: console.error }, ...globals };
    vm.createContext(sandbox);
    for (const rel of files) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel });
    }
    return (name) => vm.runInContext(name, sandbox);
}

// Both popup engines register a shortened form of a name that ends in "ed" or "ing". For these
// three traits the short forms ("a pair of") are common words, so the engines must skip them.
for (const app of ['creator', 'bestiary']) {
    const Glossary = loadScripts([`${app}/js/glossary.js`], {})('Glossary');
    Glossary.data = glossary;
    Glossary.termMap = new Map();
    Glossary.buildTermMap();
    for (const short of ['pair', 'overwhelm', 'corrupt']) {
        check(`${app} engine does not link the short form "${short}"`, Glossary.termMap.has(short), false);
    }
    for (const name of ['paired', 'overwhelming', 'corrupting']) {
        check(`${app} engine links the trait name "${name}"`, Glossary.termMap.has(name), true);
    }
}

// The creator's Rules Reference source filter: a full Apocrypha book title (Guided cites the
// T'au Empire Adversaries manuscript) counts as the apocrypha source.
let enabledSources = [];
const getCreator = loadScripts(['creator/js/data-loader.js', 'creator/tabs/glossary-tab.js'],
    { State: { isSourceEnabled: (s) => enabledSources.includes(s) } });
const CreatorLoader = getCreator('DataLoader');
const GlossaryTab = getCreator('GlossaryTab');
const guided = { name: 'Guided', description: '', ...glossary.weaponTraits.guided, category: 'weaponTraits' };
const heavy = { name: 'Heavy', description: '', ...glossary.weaponTraits.heavy, category: 'weaponTraits' };
GlossaryTab.allEntries = [guided, heavy];
GlossaryTab.currentCategory = 'all';
GlossaryTab.searchQuery = '';
const shown = () => GlossaryTab.getFilteredEntries().map(e => e.name);
enabledSources = ['core', 'apocrypha'];
check('creator filter keeps Guided while apocrypha is on', shown(), ['Guided', 'Heavy']);
enabledSources = ['core'];
check('creator filter hides Guided while apocrypha is off', shown(), ['Heavy']);
enabledSources = ['apocrypha'];
check('creator filter still hides a core entry while core is off', shown(), ['Guided']);
check('the Guided row still shows the full book title and page 6', CreatorLoader.formatSourcePage(guided),
    "Abundant Apocryphal Adversaries: The T'au Empire (Apocrypha), p. 6");

console.log(failures === 0 ? '\nAll trait glossary checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
