// Tests for the Custom Wargear feature (issue #33): the DataLoader resolver, the record helpers,
// the State mutators and the consumers of a custom item.
// Run: node scripts/test-custom-wargear.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const readSource = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let failures = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// Deep copy with object keys sorted, so two records compare equal whatever their key order.
function canon(value) {
    if (Array.isArray(value)) return value.map(canon);
    if (value && typeof value === 'object') {
        const out = {};
        for (const key of Object.keys(value).sort()) out[key] = canon(value[key]);
        return out;
    }
    return value;
}

const DATA = {};
for (const f of ['weapons.json', 'armor.json', 'equipment.json', 'glossary.json', 'talents.json', 'weapon-upgrades.json'])
    DATA[f] = readJson(`data/${f}`);

// Runs a source file into a context. A top-level const stays visible to the later files of the context.
function load(ctx, rel) {
    vm.runInContext(readSource(rel), ctx, { filename: rel });
}

// Reads a global (also a const global) out of a context.
function get(ctx, name) {
    return vm.runInContext(name, ctx);
}

// A new context with console plus the given globals, the real data-loader.js and the real data cache.
function creatorSandbox(globals) {
    const ctx = vm.createContext({ console, ...globals });
    load(ctx, 'creator/js/data-loader.js');
    get(ctx, 'DataLoader').cache = DATA;
    return ctx;
}

// --- data guard ---
for (const f of ['weapons.json', 'armor.json', 'equipment.json'])
    check(`no id in ${f} starts with custom_`, DATA[f].some(r => String(r.id).startsWith('custom_')), false);

// --- resolver ---
const rctx = creatorSandbox({ State: { character: { wargear: [] } } });
const DL = get(rctx, 'DataLoader'), RS = get(rctx, 'State');
const ID = 'custom_same0001';
for (const kind of ['weapon', 'armor', 'augmetic', 'other']) {
    const record = { kind, id: ID, name: `A ${kind}` };
    RS.character.wargear = [{ id: 'chainsword', isStarting: false }, { id: ID, isStarting: false, custom: record }];
    check(`getWeapon on a custom ${kind}`, DL.getWeapon(ID), kind === 'weapon' ? record : undefined);
    check(`getArmor on a custom ${kind}`, DL.getArmor(ID), kind === 'armor' ? record : undefined);
    check(`getEquipment on a custom ${kind}`, DL.getEquipment(ID), ['augmetic', 'other'].includes(kind) ? record : undefined);
    check(`getWargearItem returns the stored custom ${kind} object`, DL.getWargearItem(ID) === record, true);
    check(`getAll* never hold the custom ${kind}`,
        [DL.getAllWeapons(), DL.getAllArmor(), DL.getAllEquipment()].some(list => list.includes(record)), false);
}
check('an unknown custom_ id gives undefined', DL.getWargearItem('custom_nothere1'), undefined);
RS.character.wargear = [{ id: 'custom_nocustom', isStarting: false }];
check('a custom_ id on an entry with no custom gives undefined', DL.getWargearItem('custom_nocustom'), undefined);
check('a book id gives the book record', DL.getWeapon('chainsword').name, 'Chainsword');
const noState = creatorSandbox({});
check('with no State, a custom_ id gives undefined', get(noState, 'DataLoader').getWargearItem(ID), undefined);
check('custom source prints "Custom"', DL.formatSourcePage({ source: 'custom' }), 'Custom');

// --- derived stats with custom items ---
{
    const attributes = { strength: 3, toughness: 3, agility: 3, initiative: 3, willpower: 3, intellect: 3, fellowship: 3 };
    const entry = (id, custom) => ({ id, isStarting: false, custom });
    const armour = (id, ar, traits) => entry(id, { kind: 'armor', id, name: `Armour ${ar}`, ar, traits, keywords: [], description: '', source: 'custom' });
    const augmetic = (id, name, bonuses) => entry(id, { kind: 'augmetic', id, name, category: 'augmetic', description: '', effect: '', bonuses, keywords: [], source: 'custom' });
    const other = entry('custom_other0001', { kind: 'other', id: 'custom_other0001', name: 'A Trinket', category: 'Other', description: '', effect: '', keywords: [], source: 'custom' });
    const make = wargear => ({ rank: 3, attributes, skills: {}, talents: [], mutations: [], wargear });
    const sandboxFor = character => {
        const ctx = creatorSandbox({ State: { character } });
        load(ctx, 'creator/js/derived-stats.js');
        return get(ctx, 'DerivedStats');
    };

    {
        const c = make([{ id: 'flak_armour', isStarting: false }, armour('custom_armour001', 5, [])]);
        const DS = sandboxFor(c);
        check('a custom armour with AR 5 is the best armour', DS.getArmorBreakdown(c).bestArmorAR, 5);
    }
    {
        const c = make([armour('custom_shield001', 2, ['Shield'])]);
        const DS = sandboxFor(c);
        check('a custom Shield-trait item counts as shield AR', DS.getArmorBreakdown(c).shieldAR, 2);
    }
    {
        const c = make([augmetic('custom_p7d2m0zt', 'Hydraulic Spine', { strength: 1, agility: -1 })]);
        const DS = sandboxFor(c);
        check('the §2.5 augmetic lists its Strength bonus', DS.getEquipmentBonuses(c).strength, [{ value: 1, source: 'Hydraulic Spine' }]);
        check('the §2.5 augmetic lowers Agility by 1', DS.getEffectiveAttribute(c, 'agility'), 2);
    }
    {
        const c = make([augmetic('custom_rank0001', 'Rank Plate', { resilience: 'rank' })]);
        const DS = sandboxFor(c);
        check('a "rank" Resilience bonus at rank 3 adds 3', DS.getEquipmentBonusTotal(c, 'resilience'), 3);
    }
    {
        const otherOnly = make([other]);
        const DS = sandboxFor(otherOnly);
        check('an Other item adds nothing', JSON.stringify(DS.getEquipmentBonuses(otherOnly)), '{}');
    }
}

console.log(failures === 0 ? '\nAll custom wargear checks passed.' : `\n${failures} custom wargear check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
