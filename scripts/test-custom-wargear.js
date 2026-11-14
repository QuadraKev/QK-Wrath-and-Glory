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
{
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
}

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

// --- record contract ---
// The fixtures at file scope are for the later sections too.
const cwctx = creatorSandbox({});
load(cwctx, 'creator/js/custom-wargear.js');
const CW = get(cwctx, 'CustomWargear');
const F = (o) => ({ ...CW.emptyForm(), ...o });
const xenotech = F({ name: 'Xenotech Blade', damage: '4', ed: '4', reach: '2', weaponTraits: ['Agonising', 'Rad (2)'] });
const spine = F({ kind: 'augmetic', name: 'Hydraulic Spine', description: 'A salvaged spinal frame bolted to the vertebrae.',
    effect: '+1 Strength, -1 Agility.', bonuses: [{ key: 'strength', value: '1' }, { key: 'agility', value: '-1' }], keywords: ['IMPERIUM'], rarity: 'Rare' });
const ranged = F({ weaponType: 'ranged', name: 'Las', damage: '7', ed: '1', rangeShort: '12', rangeMedium: '24', rangeLong: '36', salvo: '2', reach: '3' });
const armour = F({ kind: 'armor', name: 'Plate', damage: '5', ar: '4', armorTraits: ['Shield'], weaponTraits: ['Rad (2)'] });
const other = F({ kind: 'other', name: 'Lucky Coin', keywords: ['X'] });
const xenotechRecord = CW.buildRecord(xenotech);
const spineRecord = CW.buildRecord(spine);
const rangedRecord = CW.buildRecord(ranged);
const armourRecord = CW.buildRecord(armour);
const otherRecord = CW.buildRecord(other);
const xenotechRecordWithId = { ...xenotechRecord, id: 'custom_k3v9q2xa' };
const spineRecordWithId = { ...spineRecord, id: 'custom_p7d2m0zt' };
{
    const copy = o => JSON.parse(JSON.stringify(o));

    // constants and the empty form
    check('KINDS', CW.KINDS, ['weapon', 'armor', 'augmetic', 'other']);
    check('RARITIES in book order', CW.RARITIES, ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Unique']);
    check('BONUS_KEYS in order', CW.BONUS_KEYS,
        ['strength', 'toughness', 'agility', 'initiative', 'willpower', 'intellect', 'fellowship', 'speed', 'defence', 'resilience']);
    check('BONUS_LABELS', CW.BONUS_KEYS.map(k => CW.BONUS_LABELS[k]),
        ['Strength', 'Toughness', 'Agility', 'Initiative', 'Willpower', 'Intellect', 'Fellowship', 'Speed', 'Defence', 'Resilience']);
    check('emptyForm keys and defaults', canon(CW.emptyForm()), canon({ editIndex: null, kind: 'weapon', weaponType: 'melee', name: '',
        damage: '0', ed: '0', ap: '0', reach: '', rangeShort: '', rangeMedium: '', rangeLong: '', salvo: '1', ar: '0', weaponTraits: [],
        armorTraits: [], effect: '', bonuses: [], keywords: [], description: '', value: '', rarity: '', traitPick: '', traitRating: '',
        typedTrait: '', keywordInput: '' }));

    // buildRecord
    check('Xenotech form builds the §2.4 record', canon(CW.buildRecord(xenotech)), canon({ kind: 'weapon', name: 'Xenotech Blade', type: 'melee', description: '',
        damage: { base: 4, attribute: 'strength', bonus: 0 }, ed: 4, ap: 0, reach: 2, traits: ['Agonising', 'Rad (2)'], keywords: [], source: 'custom' }));
    check('Hydraulic Spine form builds the §2.5 record', canon(spineRecord), canon({ kind: 'augmetic', name: 'Hydraulic Spine', category: 'augmetic',
        description: 'A salvaged spinal frame bolted to the vertebrae.', effect: '+1 Strength, -1 Agility.', bonuses: { strength: 1, agility: -1 },
        keywords: ['IMPERIUM'], rarity: 'Rare', source: 'custom' }));
    check('ranged form gives range, salvo, a null attribute and no reach', canon(rangedRecord), canon({ kind: 'weapon', name: 'Las', type: 'ranged',
        description: '', damage: { base: 7, attribute: null, bonus: 0 }, ed: 1, ap: 0, range: { short: 12, medium: 24, long: 36 }, salvo: 2,
        traits: [], keywords: [], source: 'custom' }));
    const meleeWithRange = CW.buildRecord(F({ name: 'Club', rangeShort: '1', rangeMedium: '2', rangeLong: '3', salvo: '4' }));
    check('melee form with range fields filled gives no range or salvo', ['range', 'salvo'].filter(k => k in meleeWithRange), []);
    check('armour form gives ar and armour traits only', canon(armourRecord), canon({ kind: 'armor', name: 'Plate', description: '', ar: 4,
        traits: ['Shield'], keywords: [], source: 'custom' }));
    check('augmetic with no bonus rows has no bonuses key', 'bonuses' in CW.buildRecord(F({ kind: 'augmetic', name: 'Eye' })), false);
    check('Other form gives category Other, no effect, no keywords, no bonuses', canon(otherRecord), canon({ kind: 'other', name: 'Lucky Coin',
        category: 'Other', description: '', effect: '', keywords: [], source: 'custom' }));
    check('blank value and rarity give no keys', ['value', 'rarity'].filter(k => k in xenotechRecord), []);
    const priced = CW.buildRecord(F({ name: 'Priced', value: '5', rarity: 'Rare' }));
    check('value 5 and rarity Rare are stored', [priced.value, priced.rarity], [5, 'Rare']);
    for (const [label, form] of [['Xenotech', xenotech], ['ranged', ranged], ['armour', armour], ['§2.5', spine], ['Other', other]]) {
        const record = CW.buildRecord(form);
        check(`formFromRecord round trip: ${label}`, canon(CW.buildRecord(CW.formFromRecord(record))), canon(record));
    }
    check('formFromRecord gives the emptyForm keys', Object.keys(CW.formFromRecord(spineRecord)).sort(), Object.keys(CW.emptyForm()).sort());

    // parseIntStrict
    check('parseIntStrict accepts spaces and a sign', [' 3 ', '+3', '-2'].map(v => CW.parseIntStrict(v)), [3, 3, -2]);
    check('parseIntStrict rejects decimals, dice, a Unicode minus, blank and null',
        ['1.5', '1d3', '−2', '', null].map(v => CW.parseIntStrict(v)), [null, null, null, null, null]);

    // validateForm
    const v = form => Object.keys(CW.validateForm(form));
    check('validateForm: empty form needs a name', v(CW.emptyForm()), ['name']);
    check('validateForm: Xenotech is valid', v(xenotech), []);
    for (const damage of ['1.5', '1d3', '31', ''])
        check(`validateForm: damage "${damage}" is invalid`, v({ ...xenotech, damage }), ['damage']);
    check('validateForm: AP -10 is valid', v({ ...xenotech, ap: '-10' }), []);
    check('validateForm: AP -11 is invalid', v({ ...xenotech, ap: '-11' }), ['ap']);
    for (const reach of ['0', '51'])
        check(`validateForm: reach ${reach} is invalid`, v({ ...xenotech, reach }), ['reach']);
    check('validateForm: range 24/12/36 is out of order', v({ ...ranged, rangeShort: '24', rangeMedium: '12' }), ['range']);
    check('validateForm: blank short range is invalid', v({ ...ranged, rangeShort: '' }), ['range']);
    check('validateForm: salvo 21 is invalid', v({ ...ranged, salvo: '21' }), ['salvo']);
    check('validateForm: name of 81 chars is invalid', v({ ...xenotech, name: 'x'.repeat(81) }), ['name']);
    check('validateForm: blank name is invalid', v({ ...xenotech, name: '   ' }), ['name']);
    for (const [label, bonuses] of [['blank key', [{ key: '', value: '1' }]], ['value 0', [{ key: 'strength', value: '0' }]],
        ['value 11', [{ key: 'strength', value: '11' }]], ['repeated key', [{ key: 'strength', value: '1' }, { key: 'strength', value: '2' }]]])
        check(`validateForm: bonus row with ${label} is invalid`, v({ ...spine, bonuses }), ['bonuses']);
    check('validateForm: rank Resilience bonus is valid', v({ ...spine, bonuses: [{ key: 'resilience', value: 'rank' }] }), []);
    check('validateForm: value 31 is invalid', v({ ...xenotech, value: '31' }), ['value']);
    check('validateForm: rarity Legendary is invalid', v({ ...xenotech, rarity: 'Legendary' }), ['rarity']);
    check('validateForm: description of 2001 chars is invalid', v({ ...xenotech, description: 'x'.repeat(2001) }), ['description']);
    check('validateForm: effect of 501 chars is invalid', v({ ...spine, effect: 'x'.repeat(501) }), ['effect']);
    check('validateForm: hidden fields are not validated', v({ ...armour, damage: 'x' }), []);
    check('validateForm: AR 21 is invalid', v({ ...armour, ar: '21' }), ['ar']);
    check('validateForm: 21 traits are invalid', v({ ...xenotech, weaponTraits: Array.from({ length: 21 }, (_, i) => `Trait ${i}`) }), ['traits']);
    check('validateForm: a keyword of 41 chars is invalid', v({ ...xenotech, keywords: ['K'.repeat(41)] }), ['keywords']);

    // traitNames and normalizeTrait
    const sortedNames = list => Object.values(list).map(t => t.name).sort((a, b) => a.localeCompare(b));
    check('traitNames(weapon) is the sorted glossary list', CW.traitNames('weapon'), sortedNames(DATA['glossary.json'].weaponTraits));
    check('traitNames(armor) is the sorted glossary list', CW.traitNames('armor'), sortedNames(DATA['glossary.json'].armorTraits));
    check('normalizeTrait rewrites to the list spelling',
        [CW.normalizeTrait('rad (2)', 'weapon'), CW.normalizeTrait('rad(2)', 'weapon'), CW.normalizeTrait('shield', 'armor')],
        ['Rad (2)', 'Rad (2)', 'Shield']);

    // normalizeEntry
    const xenotechCustom = () => ({ kind: 'weapon', id: 'custom_k3v9q2xa', name: 'Xenotech Blade', type: 'melee', description: '',
        damage: { base: 4, attribute: 'strength', bonus: 0 }, ed: 4, ap: 0, reach: 2, traits: ['Agonising', 'Rad (2)'], keywords: [], source: 'custom' });
    const fix = (custom, extra = {}) => {
        const entry = { id: 'custom_k3v9q2xa', isStarting: false, custom, ...extra };
        const changed = CW.normalizeEntry(entry, new Set());
        return { entry, c: entry.custom, changed };
    };
    // A fixture record with the id of the fix() entry, so that the id alone is not a change.
    const withId = record => ({ ...copy(record), id: 'custom_k3v9q2xa' });
    {
        const normal = { id: 'custom_k3v9q2xa', isStarting: false, custom: xenotechCustom() };
        const before = canon(normal);
        check('normalizeEntry: a normal Xenotech entry returns false', CW.normalizeEntry(normal, new Set()), false);
        check('normalizeEntry: a normal Xenotech entry stays the same', canon(normal), before);
    }
    // buildRecord and normalizeEntry must agree on the record shape.
    for (const [label, record] of [['Xenotech', xenotechRecord], ['§2.5', spineRecord], ['ranged', rangedRecord], ['armour', armourRecord], ['Other', otherRecord]]) {
        const r = fix(withId(record));
        check(`normalizeEntry: the built ${label} record returns false`, r.changed, false);
        check(`normalizeEntry: the built ${label} record stays the same`, canon(r.c), canon(withId(record)));
    }
    {
        const record = CW.buildRecord(F({ name: 'Keyed', keywords: [' a '] }));
        check('buildRecord: form keyword " a " is stored as "A"', record.keywords, ['A']);
        check('normalizeEntry: the built " a " keyword record returns false', fix(withId(record)).changed, false);
    }
    const repaired = (name, r, actual, expected) => {
        check(`normalizeEntry: ${name}`, actual, expected);
        check(`normalizeEntry: ${name} returns true`, r.changed, true);
    };
    let r = fix('oops');
    repaired('custom "oops" becomes an unreadable Other', r, [r.c.kind, r.c.name], ['other', 'Unreadable custom item']);
    r = fix({ ...xenotechCustom(), kind: 'sword' });
    repaired('kind "sword" becomes Other', r, [r.c.kind, r.c.category], ['other', 'Other']);
    r = fix({ ...xenotechCustom(), ed: 99 });
    repaired('ED 99 clamps to 20', r, r.c.ed, 20);
    r = fix({ ...xenotechCustom(), ed: 'abc' });
    repaired('ED "abc" becomes 0', r, r.c.ed, 0);
    r = fix({ ...xenotechCustom(), damage: { base: -5 } });
    repaired('damage base -5 becomes 0', r, r.c.damage, { base: 0, attribute: 'strength', bonus: 0 });
    r = fix({ ...withId(rangedRecord), salvo: -3 });
    repaired('salvo -3 clamps to 0', r, r.c.salvo, 0);
    r = fix({ ...xenotechCustom(), reach: 'x' });
    repaired('reach "x" is removed', r, 'reach' in r.c, false);
    r = fix({ ...xenotechCustom(), value: 99 });
    repaired('value 99 clamps to 30', r, r.c.value, 30);
    r = fix({ ...xenotechCustom(), rarity: 'Mythic' });
    repaired('rarity "Mythic" is removed', r, 'rarity' in r.c, false);
    r = fix({ ...withId(rangedRecord), range: { short: 5 } });
    repaired('ranged range { short: 5 } is removed', r, 'range' in r.c, false);
    r = fix({ ...xenotechCustom(), name: 'n'.repeat(200) });
    repaired('name of 200 chars is cut to 80', r, r.c.name.length, 80);
    r = fix({ ...xenotechCustom(), description: 'd'.repeat(3000) });
    repaired('description of 3000 chars is cut to 2000', r, r.c.description.length, 2000);
    r = fix({ ...xenotechCustom(), keywords: ['imperium', ' Imperium ', 'x'.repeat(50), 7] });
    repaired('keywords are upper-cased, trimmed, cut and de-duplicated', r, r.c.keywords, ['IMPERIUM', 'X'.repeat(40)]);
    r = fix({ ...withId(armourRecord), traits: ['shield', 'Shield', 'bulk (2)'] });
    repaired('armour traits take the list spelling, no duplicates', r, r.c.traits, ['Shield', 'Bulk (2)']);
    r = fix({ ...xenotechCustom(), traits: [' rad (2) '] });
    repaired('weapon trait " rad (2) " becomes "Rad (2)"', r, r.c.traits, ['Rad (2)']);
    r = fix({ ...xenotechCustom(), traits: ['Xenos Venom (2)'] });
    check('normalizeEntry: typed trait "Xenos Venom (2)" stays', r.c.traits, ['Xenos Venom (2)']);
    r = fix({ ...withId(spineRecord), bonuses: { wounds: 1, strength: 0, toughness: 99, agility: 'lots', resilience: 'rank', speed: -2 } });
    repaired('augmetic bonuses keep only valid keys and values', r, r.c.bonuses, { resilience: 'rank', speed: -2 });
    r = fix({ ...withId(spineRecord), bonuses: { wounds: 1 } });
    repaired('augmetic bonuses with no valid key are removed', r, 'bonuses' in r.c, false);
    r = fix({ ...withId(otherRecord), bonuses: { strength: 1 } });
    repaired('bonuses on an Other are removed', r, 'bonuses' in r.c, false);
    r = fix({ ...xenotechCustom(), bonuses: { strength: 1 } });
    repaired('bonuses on a weapon are removed', r, 'bonuses' in r.c, false);
    {
        const used = new Set();
        const first = { id: 'chainsword', isStarting: false, custom: xenotechCustom() };
        const firstChanged = CW.normalizeEntry(first, used);
        const second = { id: first.id, isStarting: false, custom: { ...xenotechCustom(), id: first.id } };
        const reusedId = first.id;
        const secondChanged = CW.normalizeEntry(second, used);
        const idOk = id => /^custom_[a-z0-9]{8}$/.test(id);
        check('normalizeEntry: id "chainsword" gets a new custom_ id', [first.id !== 'chainsword', idOk(first.id), firstChanged], [true, true, true]);
        check('normalizeEntry: a reused id gets a new custom_ id', [second.id !== reusedId, idOk(second.id), secondChanged], [true, true, true]);
        check('normalizeEntry: custom.id equals entry.id', [first.custom.id === first.id, second.custom.id === second.id], [true, true]);
        check('normalizeEntry: usedIds holds both ids', [used.has(first.id), used.has(second.id), used.size], [true, true, 2]);
    }
    for (const [kind, custom] of [['weapon', xenotechCustom()], ['armor', copy(armourRecord)], ['augmetic', copy(spineRecord)], ['other', copy(otherRecord)]]) {
        r = fix(custom, { relic: { name: 'R' }, improvised: { baseId: 'b' } });
        repaired(`relic and improvised are removed from a ${kind}`, r, ['relic' in r.entry, 'improvised' in r.entry], [false, false]);
    }
    r = fix(copy(armourRecord), { upgrades: ['x'], equipped: true });
    repaired('upgrades and equipped are removed from an armour', r, ['upgrades' in r.entry, 'equipped' in r.entry], [false, false]);
    r = fix(xenotechCustom(), { upgrades: ['x'], equipped: true });
    check('normalizeEntry: upgrades and equipped stay on a weapon', [r.entry.upgrades, r.entry.equipped], [['x'], true]);
    {
        const DLc = get(cwctx, 'DataLoader');
        const glossary = DLc.cache['glossary.json'];
        DLc.cache['glossary.json'] = undefined;
        check('with no glossary, traitNames(weapon) is []', CW.traitNames('weapon'), []);
        r = fix({ ...xenotechCustom(), traits: ['rad (2)'] });
        check('with no glossary, trait "rad (2)" stays as typed', r.c.traits, ['rad (2)']);
        DLc.cache['glossary.json'] = glossary;
    }

    // newId
    {
        const used = new Set();
        const ids = [];
        for (let i = 0; i < 50; i++) {
            const id = CW.newId(used);
            ids.push(id);
            used.add(id);
        }
        check('newId: 50 ids match custom_ plus 8 chars', ids.every(id => /^custom_[a-z0-9]{8}$/.test(id)), true);
        check('newId: 50 ids are distinct', new Set(ids).size, 50);
        CW.newId(used);
        check('newId does not add to the set', used.size, 50);

        // Force the first 8 random calls to give the same id as a stored one; newId must try again.
        const ctxMath = get(cwctx, 'Math');
        const realRandom = ctxMath.random;
        let calls = 0;
        ctxMath.random = () => 0;
        const taken = CW.newId(new Set());
        ctxMath.random = () => (calls++ < 8 ? 0 : realRandom());
        const next = CW.newId(new Set([taken]));
        ctxMath.random = realRandom;
        check('newId never returns an id that is in the set', [next !== taken, /^custom_[a-z0-9]{8}$/.test(next)], [true, true]);
    }
}

console.log(failures === 0 ? '\nAll custom wargear checks passed.' : `\n${failures} custom wargear check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
