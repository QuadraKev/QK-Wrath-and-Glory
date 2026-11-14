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

console.log(failures === 0 ? '\nAll trait glossary checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
