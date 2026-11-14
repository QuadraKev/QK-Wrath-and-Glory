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

// --- display helpers ---
{
    const rw = CW.ratedTraits('weapon'), ra = CW.ratedTraits('armor');
    check('weapon rated traits hold Rad, Rending, Blast, Inflict', ['Rad', 'Rending', 'Blast', 'Inflict'].every(n => rw.includes(n)), true);
    check('weapon rated traits leave out Agonising and Brutal', ['Agonising', 'Brutal'].some(n => rw.includes(n)), false);
    check('armour rated traits hold Bulk, not Shield', [ra.includes('Bulk'), ra.includes('Shield')], [true, false]);
    check('every rated weapon trait is in the weapon list', rw.every(n => CW.traitNames('weapon').includes(n)), true);
    check('every rated armour trait is in the armour list', ra.every(n => CW.traitNames('armor').includes(n)), true);
    check('rated weapon traits are sorted', rw, rw.slice().sort((a, b) => a.localeCompare(b)));
    check('rated armour traits are sorted', ra, ra.slice().sort((a, b) => a.localeCompare(b)));

    check('Xenotech stat line', CW.formatStatLine(xenotechRecord), 'Damage (S) +4 • ED 4 • AP 0 • Range 2m • Agonising, Rad (2)');
    check('ranged stat line', CW.formatStatLine(rangedRecord), 'Damage 7 • ED 1 • AP 0 • Range 12/24/36m • Salvo 2 • -');
    check('ranged stat line with AP -1 and two traits',
        CW.formatStatLine({ ...rangedRecord, ap: -1, traits: ['Rapid Fire (2)'] }), 'Damage 7 • ED 1 • AP -1 • Range 12/24/36m • Salvo 2 • Rapid Fire (2)');
    {
        const noRange = { ...rangedRecord };
        delete noRange.range;
        check('ranged stat line with no range', CW.formatStatLine(noRange), 'Damage 7 • ED 1 • AP 0 • Range - • Salvo 2 • -');
    }
    check('melee stat line with no reach and no traits', CW.formatStatLine(CW.buildRecord(F({ name: 'Club' }))), 'Damage (S) +0 • ED 0 • AP 0 • -');
    check('armour stat line', CW.formatStatLine({ kind: 'armor', ar: 4, traits: ['Shield'] }), 'AR 4 • Shield');
    check('armour record stat line with no traits', CW.formatStatLine({ ...armourRecord, traits: [] }), 'AR 4 • -');
    check('§2.5 augmetic stat line', CW.formatStatLine(spineRecord), '+1 Strength, -1 Agility. • Bonuses: +1 Strength, -1 Agility');
    check('augmetic with an effect and no bonuses', CW.formatStatLine({ kind: 'augmetic', effect: 'Hums.' }), 'Hums.');
    check('augmetic with bonuses and no effect', CW.formatStatLine({ kind: 'augmetic', effect: '', bonuses: { speed: 1 } }), 'Bonuses: +1 Speed');
    check('augmetic with no effect and no bonuses', CW.formatStatLine({ kind: 'augmetic', effect: '' }), '');
    check('Other stat line is empty', CW.formatStatLine(otherRecord), '');

    check('formatBonuses with no bonuses', [CW.formatBonuses(undefined), CW.formatBonuses({})], ['', '']);
    check('integer bonuses print with a sign', CW.formatBonuses({ strength: 1, agility: -1 }), '+1 Strength, -1 Agility');
    check('rank bonuses print as +Rank', CW.formatBonuses({ resilience: 'rank', speed: 'doubleRank' }), '+Rank Resilience, +Double Rank Speed');

    check('typeLabel for the five shapes', [xenotechRecord, rangedRecord, armourRecord, spineRecord, otherRecord].map(r => CW.typeLabel(r)),
        ['Melee Weapon', 'Ranged Weapon', 'Armor', 'Augmetic', 'Other']);

    check('Xenotech text lines', CW.textLines({ ...xenotechRecord, description: 'Line one\nLine two', keywords: ['XENOS'] }), [
        '- Xenotech Blade (Custom)', '    Damage (S) +4 • ED 4 • AP 0 • Range 2m • Agonising, Rad (2)', '    Keywords: XENOS', '    Line one', '    Line two']);
    check('text lines split a CRLF description', CW.textLines({ ...otherRecord, description: 'A\r\nB' }), ['- Lucky Coin (Custom)', '    A', '    B']);
    check('Other text lines with a description', CW.textLines({ ...otherRecord, description: 'Brings luck.' }), ['- Lucky Coin (Custom)', '    Brings luck.']);
    check('Other text lines with no description and no keywords', CW.textLines({ ...otherRecord, keywords: [] }), ['- Lucky Coin (Custom)']);

    // With no glossary, there is no trait list, so no rated trait. Restore the cache even if a check throws.
    // The cache object is DATA itself, so keep the glossary in a local before the removal.
    const cache = get(cwctx, 'DataLoader').cache;
    const glossary = cache['glossary.json'];
    try {
        cache['glossary.json'] = undefined;
        check('with no glossary, ratedTraits(weapon) is []', CW.ratedTraits('weapon'), []);
    } finally {
        cache['glossary.json'] = glossary;
    }
    check('the glossary is back in the cache', CW.ratedTraits('weapon').includes('Rad'), true);
}

// --- State: add, update, load, custom archetype reset ---
{
    // state.js touches localStorage and the timers through the auto-save, and uses Followers as a
    // bare global, so the sandbox stubs those and runs followers.js first (as in test-notes.js).
    // The console wrapper counts the console.warn calls of a load.
    const store = {};
    const warnings = [];
    const sctx = creatorSandbox({
        console: { log: console.log, error: console.error, warn: (...args) => { warnings.push(args.join(' ')); } },
        localStorage: {
            getItem: k => (k in store ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: k => { delete store[k]; }
        },
        setTimeout: () => 0,
        clearTimeout: () => {}
    });
    load(sctx, 'creator/js/followers.js');
    load(sctx, 'creator/js/custom-wargear.js');
    load(sctx, 'creator/js/state.js');
    const State = get(sctx, 'State'), DL = get(sctx, 'DataLoader');
    const idOk = id => /^custom_[a-z0-9]{8}$/.test(id);
    const copy = o => JSON.parse(JSON.stringify(o));
    const loadWarnings = data => {
        warnings.length = 0;
        State.loadCharacter(data);
        return warnings.length;
    };

    // addCustomItem
    State.character = State.createNewCharacter();
    const i = State.addCustomItem(CW.buildRecord(xenotech));
    const e = State.character.wargear[i];
    check('addCustomItem pushes one entry', State.character.wargear.length, 1);
    check('addCustomItem gives a fresh custom id', /^custom_[a-z0-9]{8}$/.test(e.id) && e.custom.id === e.id && e.isStarting === false, true);
    check('the resolver finds the new item', DL.getWeapon(e.id).name, 'Xenotech Blade');
    const j = State.addCustomItem(CW.buildRecord(xenotech));
    check('two adds give two ids', State.character.wargear[j].id !== e.id, true);

    // updateCustomItem
    const id = e.id;
    e.upgrades = ['x'];
    check('updateCustomItem with a melee record returns true', State.updateCustomItem(i, CW.buildRecord(F({ name: 'Renamed' }))), true);
    check('updateCustomItem keeps the id', [e.id, e.custom.id], [id, id]);
    check('updateCustomItem sets the name', DL.getWeapon(id).name, 'Renamed');
    check('updateCustomItem with the same type keeps the upgrades', e.upgrades, ['x']);
    check('updateCustomItem with a ranged record returns true', State.updateCustomItem(i, CW.buildRecord(ranged)), true);
    check('a type change clears the upgrades', [e.upgrades, e.custom.type, e.id], [[], 'ranged', id]);
    {
        const before = canon(e);
        check('updateCustomItem with an armour record returns false', State.updateCustomItem(i, CW.buildRecord(armour)), false);
        check('a kind change leaves the entry unchanged', canon(e), before);
    }
    check('updateCustomItem with an index out of range returns false',
        [State.updateCustomItem(5, CW.buildRecord(xenotech)), State.updateCustomItem(-1, CW.buildRecord(xenotech))], [false, false]);
    State.addWargear('chainsword');
    check('updateCustomItem on a book entry returns false', State.updateCustomItem(2, CW.buildRecord(xenotech)), false);

    // loadCharacter
    {
        const saved = JSON.parse(JSON.stringify(State.character));
        const count = loadWarnings(JSON.parse(JSON.stringify(saved)));
        check('a save round trip keeps the wargear', canon(State.character.wargear), canon(saved.wargear));
        check('a save round trip logs no warning', count, 0);
    }
    {
        const count = loadWarnings({ wargear: [{ id: 'chainsword' }, { id: 'bad id', custom: 'oops' }, { id: 'custom_x', isStarting: false }] });
        const w = State.character.wargear;
        check('a broken save keeps the entry count', w.length, 3);
        check('a book entry is not changed', w[0], { id: 'chainsword' });
        check('custom "oops" becomes an unreadable item with a new id', [w[1].custom.name, idOk(w[1].id), w[1].custom.id === w[1].id],
            ['Unreadable custom item', true, true]);
        check('a custom_ id with no custom gets an Other record', w[2].custom.kind, 'other');
        check('two repaired entries log two warnings', count, 2);
    }
    {
        const wargear = [null, { id: 'chainsword' }];
        let threw = false;
        try { State.loadCharacter({ wargear }); } catch (err) { threw = true; }
        check('a null entry does not throw and stays', [threw, State.character.wargear], [false, [null, { id: 'chainsword' }]]);
        threw = false;
        try { State.loadCharacter({ wargear: {} }); } catch (err) { threw = true; }
        check('wargear {} does not throw and stays', [threw, State.character.wargear], [false, {}]);
    }
    {
        const first = { id: 'custom_same0001', isStarting: false, custom: { ...copy(xenotechRecord), id: 'custom_same0001' } };
        const second = { id: 'custom_same0001', isStarting: false, custom: { ...copy(xenotechRecord), id: 'custom_same0001' } };
        const count = loadWarnings({ wargear: [first, second] });
        const w = State.character.wargear;
        check('the first holder of a duplicate id keeps it', w[0].id, 'custom_same0001');
        check('the second holder of a duplicate id gets a new id', [w[1].id !== 'custom_same0001', idOk(w[1].id)], [true, true]);
        check('a duplicate id logs one warning', count, 1);
    }

    // setCustomArchetype keeps the custom items and remaps the owned-item talent choices
    State.resetStats = () => {};
    const resetWith = talents => {
        State.character = State.createNewCharacter();
        State.addWargear('chainsword');
        State.addCustomItem(CW.buildRecord(F({ name: 'Custom A' })));
        State.addWargear('flak_armour');
        State.addCustomItem(CW.buildRecord(F({ name: 'Custom B' })));
        State.character.talents = talents;
        State.setCustomArchetype();
    };
    resetWith([{ id: 'trademark_weapon', choice: '3' }, { id: 'armourmonger_aoa', choice: 2 }, { id: 'uncanny', choice: 'Defence' }, 'some_plain_id']);
    check('reset keeps the custom items in order', State.character.wargear.map(w => w.custom.name), ['Custom A', 'Custom B']);
    check('Trademark Weapon on custom B moves to index 1', State.character.talents[0].choice, '1');
    check('Armour-Monger on a book item is cleared', State.character.talents[1].choice, null);
    check('a non-index choice is kept', State.character.talents[2].choice, 'Defence');
    check('a plain talent id is kept', State.character.talents[3], 'some_plain_id');
    check('reset still sets the custom archetype', State.character.archetype, { id: 'custom', xpCost: 0 });
    resetWith([{ id: 'trademark_weapon', choice: 3 }, { id: 'trademark_weapon', choice: '1' }, { id: 'trademark_weapon', choice: null }]);
    check('a numeric choice 3 becomes 1', State.character.talents[0].choice, 1);
    check('a choice on custom A moves to index 0', State.character.talents[1].choice, '0');
    check('an empty choice stays empty', State.character.talents[2].choice, null);
}

// --- text safety: escape helpers and item-text sites ---
// The fixtures at file scope are for the later sections too. The sheet context has no document stub.
const EVIL = '<b>"x\'</b>&';
const SAFE = '&lt;b&gt;&quot;x&#39;&lt;/b&gt;&amp;';
const SAFE_UPPER = '&lt;B&gt;&quot;X&#39;&lt;/B&gt;&amp;';
const RAW_TAG = /<\/?b>/i;
const sheetCharacter = { rank: 1, attributes: { strength: 3, toughness: 3, agility: 3, initiative: 3, willpower: 3, intellect: 3, fellowship: 3 },
    skills: {}, talents: [], mutations: [], wargear: [] };
const sctx = creatorSandbox({
    State: {
        character: sheetCharacter,
        getCharacter: () => sheetCharacter,
        getEquippedWeapons: () => [],
        isWeaponEquipped: () => false,
        getTalentEntry: () => null,
        getKeywords: () => [],
        getEffectiveTier: () => 1,
        isPsyker: () => false,
        hasTalent: () => false
    },
    PrerequisiteChecker: { getCharacterKeywords: () => [] },
    navigator: { clipboard: { writeText: () => ({ then() {} }) } }
});
for (const rel of ['derived-stats.js', 'improvised-builder.js', 'custom-wargear.js'])
    load(sctx, `creator/js/${rel}`);
for (const rel of ['character-sheet-tab.js', 'wargear-tab.js', 'talents-tab.js'])
    load(sctx, `creator/tabs/${rel}`);
{
    const SHEET = get(sctx, 'CharacterSheetTab'), WT = get(sctx, 'WargearTab');
    const SCW = get(sctx, 'CustomWargear'), SDL = get(sctx, 'DataLoader');

    for (const mod of ['CharacterSheetTab', 'WargearTab', 'TalentsTab', 'CustomWargear'])
        check(`${mod}.escapeHtml escapes the five characters`, get(sctx, mod).escapeHtml(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
    check('escapeHtml gives "" for a falsy value', [SHEET.escapeHtml(''), SHEET.escapeHtml(undefined), SHEET.escapeHtml(null)], ['', '', '']);
    check('escapeHtml leaves plain text as it is', SHEET.escapeHtml('Flak Armour 5'), 'Flak Armour 5');
    check('CustomWargear.escapeAttr is escapeHtml', SCW.escapeAttr(`"'<&`), SCW.escapeHtml(`"'<&`));

    // One custom entry per kind. Every text field is EVIL (keywords are upper case after buildRecord).
    const evilForm = o => F({ name: EVIL, description: EVIL, effect: EVIL, keywords: [EVIL], ...o });
    const entryOf = (form, id) => ({ id, isStarting: false, custom: { ...CW.buildRecord(form), id } });
    const sheetWith = wargear => { sheetCharacter.wargear = wargear; return sheetCharacter; };
    const weaponEntry = entryOf(evilForm({ weaponTraits: [EVIL] }), 'custom_evilweap');
    const armourEntry = entryOf(evilForm({ kind: 'armor', ar: '3', armorTraits: [EVIL] }), 'custom_evilarmr');
    const augEntry = entryOf(evilForm({ kind: 'augmetic' }), 'custom_evilaugm');
    // An Other record keeps no effect or keywords, so set them here: the sheet site must escape them all the same.
    const otherEntry = entryOf(evilForm({ kind: 'other' }), 'custom_evilothr');
    otherEntry.custom.effect = EVIL;
    otherEntry.custom.keywords = [EVIL.toUpperCase()];
    check('the EVIL keyword is upper case in the record', weaponEntry.custom.keywords, [EVIL.toUpperCase()]);
    check('the EVIL trait is stored as typed', weaponEntry.custom.traits, [EVIL]);

    const safeAll = (label, html, { keywords = true, effect = false } = {}) => {
        check(`${label} holds the escaped name`, html.includes(SAFE), true);
        if (keywords) check(`${label} holds the escaped keyword`, html.includes(SAFE_UPPER), true);
        check(`${label} holds no raw <b> tag`, RAW_TAG.test(html), false);
    };

    {
        const html = SHEET.renderWeapons(sheetWith([weaponEntry]));
        safeAll('renderWeapons', html);
        check('renderWeapons escapes the trait', html.includes(`<span class="sheet-traits-cell">${SAFE}</span>`), true);
        check('renderWeapons escapes the description', html.includes(`<span class="sheet-item-description">${SAFE}</span>`), true);
        check('renderWeapons keeps the tooltips whole', (html.match(/ title="[^"]*"/g) || []).every(t => !/[<>]/.test(t) && t.endsWith('"')), true);
    }
    {
        const html = SHEET.renderArmor(sheetWith([armourEntry]));
        safeAll('renderArmor', html);
        check('renderArmor escapes the trait', html.includes(`<span class="sheet-traits-cell">${SAFE}</span>`), true);
        check('renderArmor escapes the description', html.includes(`<span class="sheet-item-description">${SAFE}</span>`), true);
    }
    {
        const html = SHEET.renderAugmetics(sheetWith([augEntry]));
        safeAll('renderAugmetics', html);
        check('renderAugmetics escapes the effect', html.includes(`<td class="sheet-equip-effect">${SAFE}</td>`), true);
        check('renderAugmetics escapes the description', html.includes(`<span class="sheet-item-description">${SAFE}</span>`), true);
    }
    {
        const html = SHEET.renderEquipment(sheetWith([otherEntry]));
        safeAll('renderEquipment', html);
        check('renderEquipment escapes the effect', html.includes(`<td class="sheet-equip-effect">${SAFE}</td>`), true);
        check('renderEquipment escapes the description', html.includes(`<span class="sheet-item-description">${SAFE}</span>`), true);
    }
    check('an augmetic with no effect still prints "-"', SHEET.renderAugmetics(sheetWith([entryOf(evilForm({ kind: 'augmetic', effect: '' }), 'custom_noeffect')]))
        .includes('<td class="sheet-equip-effect">-</td>'), true);

    // A book item whose text holds the five characters (the relic branches print the base name too).
    const relic = { name: EVIL, formId: 'x', ownerId: 'x' };
    {
        const book = SDL.getWeapon('whip');
        check('the book Whip renders its name unchanged', SHEET.renderWeapons(sheetWith([{ id: 'whip', isStarting: false }])).includes('>Whip<'), true);
        safeAll('renderWeapons (relic branch)', SHEET.renderWeapons(sheetWith([{ id: 'whip', isStarting: false, relic }])), { keywords: false });
        const saved = book.name;
        book.name = EVIL;
        try {
            safeAll('renderWeapons (book name)', SHEET.renderWeapons(sheetWith([{ id: 'whip', isStarting: false }])), { keywords: false });
            safeAll('renderWeapons (relic base name)', SHEET.renderWeapons(sheetWith([{ id: 'whip', isStarting: false, relic: { ...relic, name: 'Relic' } }])), { keywords: false });
            safeAll('WargearTab.renderOwnedWeapon', WT.renderOwnedWeapon({ ...book, wargearIndex: 0, isStarting: false, upgrades: [] }), { keywords: false });
        } finally { book.name = saved; }
    }
    {
        const flak = { ...SDL.getArmor('flak_armour'), name: EVIL, wargearIndex: 0, isStarting: false };
        safeAll('WargearTab.renderOwnedItem (armour)', WT.renderOwnedItem(flak, 'armor'), { keywords: false });
        const equip = { ...SDL.getEquipment('medi_pack') || SDL.getAllEquipment()[0], name: EVIL, category: EVIL, wargearIndex: 0, isStarting: false };
        const html = WT.renderOwnedItem(equip, 'equipment');
        safeAll('WargearTab.renderOwnedItem (equipment)', html, { keywords: false });
        check('WargearTab.renderOwnedItem escapes the category', html.includes(`<div class="wargear-type">${SAFE}</div>`), true);
        safeAll('WargearTab.renderOwnedWeapon (custom)', WT.renderOwnedWeapon({ ...weaponEntry.custom, wargearIndex: 0, isStarting: false, upgrades: [] }), { keywords: false });
    }
    {
        sheetCharacter.talents = [{ id: 'trademark_weapon', choice: '0' }];
        const html = SHEET.renderTalents(sheetWith([weaponEntry]));
        check('CharacterSheetTab.renderTalents shows the escaped weapon name', html.includes(SAFE), true);
        check('CharacterSheetTab.renderTalents holds no raw <b> tag', RAW_TAG.test(html), false);
        sheetCharacter.talents = [];
    }
    // TalentsTab.renderSelected builds DOM nodes, so run it against a minimal document stub.
    const nodes = [];
    let container, tctx;
    {
        const stub = () => { const n = { className: '', style: {}, children: [], dataset: {}, set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html || ''; },
            appendChild(c) { this.children.push(c); }, addEventListener() {}, querySelector: () => stub(), querySelectorAll: () => [], setAttribute() {}, classList: { add() {}, remove() {} } }; nodes.push(n); return n; };
        container = stub();
        tctx = creatorSandbox({
            State: { character: sheetCharacter, getCharacter: () => sheetCharacter },
            ImprovisedBuilder: { talentProfilesHtml: () => '' },
            Glossary: { enhanceElement() {}, enhance() {} },
            document: { getElementById: () => container, createElement: stub }
        });
        load(tctx, 'creator/tabs/talents-tab.js');
        sheetCharacter.talents = [{ id: 'trademark_weapon', choice: '0' }];
        sheetCharacter.wargear = [weaponEntry];
        get(tctx, 'TalentsTab').renderSelected();
        const html = container.children.map(c => c.innerHTML).join('');
        check('TalentsTab.renderSelected shows the escaped weapon name', html.includes(SAFE), true);
        check('TalentsTab.renderSelected holds no raw <b> tag', RAW_TAG.test(html), false);
        sheetCharacter.talents = [];
        sheetCharacter.wargear = [];
    }
    {
        // A choice name with $& or $1 must show as typed in a talent name that has a [placeholder].
        // No book talent has both a placeholder and an owned-item choice, so give the talent one here.
        const dollarEntry = entryOf(F({ name: 'A$&B$1C' }), 'custom_dollar01');
        const talent = get(tctx, 'DataLoader').getTalent('trademark_weapon');
        const savedName = talent.name;
        talent.name = 'Trademark [Weapon]';
        try {
            sheetCharacter.talents = [{ id: 'trademark_weapon', choice: '0' }];
            sheetCharacter.wargear = [dollarEntry];
            get(tctx, 'TalentsTab').renderSelected();
            const html = container.children.map(c => c.innerHTML).join('');
            check('TalentsTab.renderSelected keeps $& and $1 of a choice name as typed',
                html.includes('<span class="selected-talent-name">Trademark (A$&amp;B$1C) </span>'), true);
        } finally {
            talent.name = savedName;
            sheetCharacter.talents = [];
            sheetCharacter.wargear = [];
        }
    }
}

// --- sheet Range and Salvo, copy as text, Markdown ---
{
    const CS = get(sctx, 'CharacterSheetTab'), DL = get(sctx, 'DataLoader');
    check('reach 2 prints 2m', CS.weaponRangeText({ type: 'melee', reach: 2 }), '2m');
    check('melee range 2 prints 2m', CS.weaponRangeText({ type: 'melee', range: 2 }), '2m');
    check('melee range "2" prints 2m', CS.weaponRangeText({ type: 'melee', range: '2' }), '2m');
    check('melee Thrown text prints as stored', CS.weaponRangeText({ type: 'melee', range: 'Thrown S x 4' }), 'Thrown S x 4');
    check('melee with no range prints -', CS.weaponRangeText({ type: 'melee' }), '-');
    check('melee reach wins over range', CS.weaponRangeText({ type: 'melee', reach: 3, range: 2 }), '3m');
    check('lasgun range', CS.weaponRangeText(DL.getWeapon('lasgun')), '12/24/36m');
    check('ranged range string prints as stored', CS.weaponRangeText({ type: 'ranged', range: 'Thrown S x 4' }), 'Thrown S x 4');
    check('ranged range object with a missing part prints -', CS.weaponRangeText({ type: 'ranged', range: { short: 5, long: 9 } }), '5/-/9m');
    check('ranged with no range prints -', CS.weaponRangeText({ type: 'ranged' }), '-');
    check('lasgun salvo', CS.weaponSalvoText(DL.getWeapon('lasgun')), 'Salvo 2');
    check('a "-" salvo prints nothing', CS.weaponSalvoText({ type: 'ranged', salvo: '-' }), '');
    check('a string salvo prints', CS.weaponSalvoText({ type: 'ranged', salvo: '2' }), 'Salvo 2');
    check('a zero salvo prints', CS.weaponSalvoText({ type: 'ranged', salvo: 0 }), 'Salvo 0');
    check('an empty salvo prints nothing', CS.weaponSalvoText({ type: 'ranged', salvo: '' }), '');
    check('no salvo prints nothing', CS.weaponSalvoText({ type: 'ranged' }), '');
    check('a melee weapon has no salvo line', CS.weaponSalvoText({ type: 'melee', salvo: 2 }), '');

    sheetCharacter.wargear = ['whip', 'greataxe_aoa', 'knife', 'lasgun'].map(id => ({ id, isStarting: false }));
    const cells = CS.renderWeapons(sheetCharacter).match(/<td class="sheet-weapon-range"[^>]*>[\s\S]*?<\/td>/g) || [];
    const cellText = cell => cell.replace(/<[^>]*>/g, '|').replace(/\|+/g, '|').replace(/^\||\|$/g, '');
    check('renderWeapons range cells', cells.map(cellText), ['4m', '2m', 'Thrown S x 4', '12/24/36m|Salvo 2']);
    check('renderWeapons puts the salvo in its own div', cells[3].includes('<div class="sheet-weapon-salvo">Salvo 2</div>'), true);
    check('renderWeapons gives a melee weapon no salvo div', cells.slice(0, 3).some(c => c.includes('sheet-weapon-salvo')), false);

    // A stored range string holding markup must not reach the page as markup.
    {
        const whip = DL.getWeapon('whip');
        const saved = whip.reach;
        whip.reach = '<b>2</b>';
        try {
            sheetCharacter.wargear = [{ id: 'whip', isStarting: false }];
            const cell = (CS.renderWeapons(sheetCharacter).match(/<td class="sheet-weapon-range"[^>]*>[\s\S]*?<\/td>/) || [''])[0];
            check('renderWeapons escapes a range string with <b>', cell.includes('&lt;b&gt;2&lt;/b&gt;') && !RAW_TAG.test(cell), true);
        } finally { whip.reach = saved; }
    }

    // Copy as text
    {
        const copied = [];
        sctx.navigator.clipboard.writeText = text => { copied.push(text); return { then() {} }; };
        sheetCharacter.wargear = [{ id: 'chainsword', isStarting: false }, { id: xenotechRecordWithId.id, isStarting: false, custom: xenotechRecordWithId }];
        CS.copySummary({ innerHTML: '' });
        check('copySummary wrote one text', copied.length, 1);
        const text = copied[0] || '';
        check('copySummary holds the book name then the custom lines',
            text.includes('  Chainsword\n' + CW.textLines(xenotechRecordWithId).join('\n')), true);
        sheetCharacter.wargear = [];
    }

    // Markdown
    {
        const anyFn = new Proxy({}, { get: () => () => ({}) });
        const ioctx = vm.createContext({
            console, DerivedStats: anyFn, PrerequisiteChecker: { getCharacterKeywords: () => [] },
            DataLoader: { getSpecies: () => null, getArchetype: () => null,
                getWargearItem: id => id === xenotechRecordWithId.id ? xenotechRecordWithId : null }
        });
        load(ioctx, 'creator/js/custom-wargear.js');
        load(ioctx, 'creator/js/character-io.js');
        const IO = get(ioctx, 'CharacterIO');
        const md = IO.createCharacterSheet({ rank: 1, attributes: {}, skills: {}, talents: [], psychicPowers: [],
            wargear: [{ id: xenotechRecordWithId.id, isStarting: false, custom: xenotechRecordWithId }] });
        check('createCharacterSheet holds the custom lines',
            md.includes('- Xenotech Blade (Custom)\n    Damage (S) +4 • ED 4 • AP 0 • Range 2m • Agonising, Rad (2)\n'), true);
        check('createCharacterSheet prints the lines of textLines', md.includes(CW.textLines(xenotechRecordWithId).join('\n') + '\n'), true);
    }
}

// --- builder form: form operations, bodyHtml, the Wargear tab card ---
{
    const f = CW.emptyForm();
    check('a list trait with a rating is stored as Name (rating)', [CW.addListTrait(f, 'Rad', ' 2 '), f.weaponTraits], [null, ['Rad (2)']]);
    check('an exact duplicate trait is not added', [CW.addListTrait(f, 'Rad', '2') !== null, f.weaponTraits.length], [true, 1]);
    check('a typed trait matching a list name takes the list spelling', [CW.addTypedTrait(f, 'agonising'), f.weaponTraits[1]], [null, 'Agonising']);
    check('a typed custom trait is kept as typed', [CW.addTypedTrait(f, 'Xenos Venom (2)'), f.weaponTraits[2]], [null, 'Xenos Venom (2)']);
    check('armour traits go to their own list', (() => { const a = { ...CW.emptyForm(), kind: 'armor' }; CW.addTypedTrait(a, 'shield'); return [a.armorTraits, a.weaponTraits]; })(), [['Shield'], []]);
    check('keywords are trimmed, upper-cased and not duplicated', (() => { CW.addKeyword(f, ' xenos '); CW.addKeyword(f, 'Xenos'); return f.keywords; })(), ['XENOS']);
    check('a used bonus key is not offered again', (() => { const g = { ...CW.emptyForm(), kind: 'augmetic', bonuses: [{ key: 'strength', value: '1' }, { key: '', value: '1' }] }; return CW.availableBonusKeys(g, 1).includes('strength'); })(), false);

    // Refusals: each one returns a message and changes nothing, so that Save never changes a chip.
    const refused = (form, list, op) => { const before = JSON.stringify(form[list]); const msg = op(); return [typeof msg === 'string' && msg.length > 0, JSON.stringify(form[list]) === before]; };
    check('a list trait with no trait selected is refused', refused(f, 'weaponTraits', () => CW.addListTrait(f, '', '')), [true, true]);
    check('a list trait that is not in the list is refused', refused(f, 'weaponTraits', () => CW.addListTrait(f, 'Xenos Venom', '')), [true, true]);
    check('a rating of 31 characters is refused', refused(f, 'weaponTraits', () => CW.addListTrait(f, 'Rending', 'x'.repeat(31))), [true, true]);
    check('a rating of 30 characters is added', [CW.addListTrait(f, 'Rending', 'x'.repeat(30)), f.weaponTraits.includes(`Rending (${'x'.repeat(30)})`)], [null, true]);
    check('a blank typed trait is refused', refused(f, 'weaponTraits', () => CW.addTypedTrait(f, '   ')), [true, true]);
    check('a typed trait of 61 characters is refused', refused(f, 'weaponTraits', () => CW.addTypedTrait(f, 'y'.repeat(61))), [true, true]);
    check('a typed trait of 60 characters is added', [CW.addTypedTrait(f, 'y'.repeat(60)), f.weaponTraits.includes('y'.repeat(60))], [null, true]);
    check('a typed trait that repeats a trait after normalizeTrait is refused', refused(f, 'weaponTraits', () => CW.addTypedTrait(f, ' rad (2)')), [true, true]);
    check('a typed trait that repeats a list trait name is refused', refused(f, 'weaponTraits', () => CW.addTypedTrait(f, 'AGONISING')), [true, true]);
    check('the 21st trait is refused', (() => {
        const g = F({ weaponTraits: Array.from({ length: 20 }, (_, i) => `T${i}`) });
        return [...refused(g, 'weaponTraits', () => CW.addTypedTrait(g, 'Another')), ...refused(g, 'weaponTraits', () => CW.addListTrait(g, 'Rad', ''))];
    })(), [true, true, true, true]);
    check('a blank keyword is refused', refused(f, 'keywords', () => CW.addKeyword(f, '  ')), [true, true]);
    check('a keyword that repeats another in a different case is refused with a message', refused(f, 'keywords', () => CW.addKeyword(f, 'xEnOs')), [true, true]);
    check('a keyword of 41 characters is refused', refused(f, 'keywords', () => CW.addKeyword(f, 'k'.repeat(41))), [true, true]);
    check('a keyword whose upper-case form is longer than 40 characters is refused', refused(f, 'keywords', () => CW.addKeyword(f, 'ß'.repeat(21))), [true, true]);
    check('a keyword of 40 characters is added', [CW.addKeyword(f, 'k'.repeat(40)), f.keywords.includes('K'.repeat(40))], [null, true]);
    check('the 21st keyword is refused', (() => {
        const g = F({ keywords: Array.from({ length: 20 }, (_, i) => `K${i}`) });
        return refused(g, 'keywords', () => CW.addKeyword(g, 'NEW'));
    })(), [true, true]);
    check('Save keeps every trait and keyword chip of the form as it shows', (() => {
        const record = CW.buildRecord({ ...f, name: 'Chips' });
        return [record.traits, record.keywords];
    })(), [f.weaponTraits, f.keywords]);

    check('removeTrait removes the chip of the selected kind', (() => {
        const g = F({ weaponTraits: ['A', 'B', 'C'], armorTraits: ['Shield'] });
        CW.removeTrait(g, 1);
        const a = F({ kind: 'armor', weaponTraits: ['A'], armorTraits: ['Shield', 'Bulk (1)'] });
        CW.removeTrait(a, 0);
        return [g.weaponTraits, g.armorTraits, a.armorTraits, a.weaponTraits];
    })(), [['A', 'C'], ['Shield'], ['Bulk (1)'], ['A']]);
    check('removeKeyword removes one keyword', (() => { const g = F({ keywords: ['A', 'B'] }); CW.removeKeyword(g, 0); return g.keywords; })(), ['B']);

    check('addBonusRow adds an empty row with the value 1', (() => { const g = F({ kind: 'augmetic' }); return [CW.addBonusRow(g), g.bonuses]; })(), [null, [{ key: '', value: '1' }]]);
    check('the 11th bonus row is refused', (() => {
        const g = F({ kind: 'augmetic', bonuses: CW.BONUS_KEYS.map(key => ({ key, value: '1' })) });
        return refused(g, 'bonuses', () => CW.addBonusRow(g));
    })(), [true, true]);
    check('removeBonusRow removes one row', (() => {
        const g = F({ kind: 'augmetic', bonuses: [{ key: 'strength', value: '1' }, { key: 'agility', value: '-1' }] });
        CW.removeBonusRow(g, 0);
        return g.bonuses;
    })(), [{ key: 'agility', value: '-1' }]);
    check('availableBonusKeys keeps the key of its own row and the BONUS_KEYS order', (() => {
        const g = F({ kind: 'augmetic', bonuses: [{ key: 'agility', value: '1' }, { key: 'strength', value: '1' }] });
        return [CW.availableBonusKeys(g, 1), CW.availableBonusKeys(g, 0).length];
    })(), [CW.BONUS_KEYS.filter(k => k !== 'agility'), 9]);

    // Edit prefill: the text shows exactly as stored, and a Save with no change stores the same record.
    const tricky = CW.buildRecord(F({ name: 'a"b\'c</textarea>$&', description: '</textarea><b>x</b>', weaponTraits: ['Rad (2)'], keywords: ['XENOS'] }));
    const editHtml = CW.bodyHtml({ ...CW.formFromRecord(tricky), editIndex: 0 });
    check('the edit prefill escapes the name in its value attribute', editHtml.includes('a&quot;b&#39;c&lt;/textarea&gt;$&amp;'), true);
    check('the edit prefill escapes the description in the textarea body', editHtml.includes('&lt;/textarea&gt;&lt;b&gt;x&lt;/b&gt;'), true);
    check('the edit prefill holds no raw </textarea><b>', editHtml.includes('</textarea><b>'), false);
    check('buildRecord(formFromRecord(record)) is the record', canon(CW.buildRecord(CW.formFromRecord(tricky))), canon(tricky));
    check('a chip shows its text escaped', CW.bodyHtml(F({ weaponTraits: [EVIL], keywords: [EVIL.toUpperCase()] })).includes(SAFE) &&
        !RAW_TAG.test(CW.bodyHtml(F({ weaponTraits: [EVIL], keywords: [EVIL.toUpperCase()] }))), true);

    const kindSelect = html => (html.match(/<select[^>]*data-field="kind"[^>]*>/) || [''])[0];
    check('the kind selector of an edit form is disabled', /\bdisabled\b/.test(kindSelect(editHtml)), true);
    check('the kind selector of a create form is not disabled', [kindSelect(CW.bodyHtml(CW.emptyForm())) !== '', /\bdisabled\b/.test(kindSelect(CW.bodyHtml(CW.emptyForm())))], [true, false]);

    const otherHtml = CW.bodyHtml(other), weaponHtml = CW.bodyHtml(xenotech);
    const pickerParts = ['data-field="keywordInput"', 'data-field="traitPick"', 'data-field="typedTrait"'];
    check('a weapon form has the keyword input and the trait picker', pickerParts.map(p => weaponHtml.includes(p)), [true, true, true]);
    check('an Other form has no keyword input and no trait picker', pickerParts.map(p => otherHtml.includes(p)), [false, false, false]);
    check('the rating box shows only for a rated trait', [CW.bodyHtml(F({ traitPick: 'Rad' })).includes('data-field="traitRating"'),
        CW.bodyHtml(F({ traitPick: 'Agonising' })).includes('data-field="traitRating"')], [true, false]);
    check('the trait picker of an armour form offers the armour list', CW.bodyHtml(armour).includes('<option value="Shield"'), true);
    check('a weapon form shows the melee labels', [weaponHtml.includes('Damage: S +'), weaponHtml.includes('Range (m)'), weaponHtml.includes('e.g. -2')], [true, true, true]);
    check('a ranged form shows Short, Medium, Long and Salvo, and no melee range',
        ['data-field="rangeShort"', 'data-field="rangeMedium"', 'data-field="rangeLong"', 'data-field="salvo"', 'data-field="reach"'].map(p => CW.bodyHtml(ranged).includes(p)),
        [true, true, true, true, false]);
    check('an augmetic form has the effect, the bonus rows and no trait picker',
        ['data-field="effect"', 'data-bonus-index="1"', 'data-field="traitPick"'].map(p => CW.bodyHtml(spine).includes(p)), [true, true, false]);
    check('a bonus row in Rank mode has no value box', (() => {
        const html = CW.bodyHtml(F({ kind: 'augmetic', bonuses: [{ key: 'resilience', value: 'rank' }] }));
        return [html.includes('data-bonus-part="value"'), /<option value="rank" selected>/.test(html)];
    })(), [false, true]);
    for (const [label, form] of [['xenotech', xenotech], ['ranged', ranged], ['spine', spine]]) {
        const html = CW.bodyHtml(form);
        check(`bodyHtml of ${label} uses inputmode="numeric" and no type="number"`, [html.includes('inputmode="numeric"'), html.includes('type="number"')], [true, false]);
    }
    check('every data-field of a ranged form has an error span or is a picker box', (() => {
        const html = CW.bodyHtml(ranged);
        const fields = ['name', 'damage', 'ed', 'ap', 'range', 'salvo', 'traits', 'keywords', 'description', 'value', 'rarity'];
        return fields.filter(field => !html.includes(`data-error-for="${field}"`));
    })(), []);
    check('the preview element is in the body', weaponHtml.includes('id="custom-item-preview"'), true);

    // The Wargear tab card and its button.
    const tab = readSource('creator/tabs/wargear-tab.js');
    check('the Wargear tab sets CustomWargear.onSaved', tab.includes('CustomWargear.onSaved = () => this.render();'), true);
    check('the Wargear tab has the Custom Wargear card after the Improvised card',
        [tab.includes('id="btn-build-custom"'), tab.indexOf('${improvisedCtaHtml}') < tab.indexOf('${customCtaHtml}')], [true, true]);
    check('the card button opens the builder', tab.includes('CustomWargear.open()'), true);
}

console.log(failures === 0 ? '\nAll custom wargear checks passed.' : `\n${failures} custom wargear check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
