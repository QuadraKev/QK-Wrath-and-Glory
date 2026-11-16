// Tests for the render guards (spec 13; bug pass task 19).
// B6: the follower threat card shows each entry of a Mob Abilities or Mob Options list.
// B7: the Wargear browser shows a range that the data stores as text.
// B8: the relic wizard opens a relic whose form is not a form id, and no step throws.
// Run: node scripts/test-render-guards.js

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
// A check that a function does not throw. A throw gives a FAIL line with the message.
function noThrow(name, fn) {
    let result;
    try { result = fn(); } catch (e) { failures++; console.log(`FAIL  ${name}\n        threw ${e.message}`); return undefined; }
    console.log(`PASS  ${name}`);
    return result;
}

// A DOM stub. Each innerHTML write goes to `written`. An element keeps the html that it gets.
function makeElement(written) {
    let html = '';
    const children = {};
    const el = {
        style: {}, dataset: {}, value: '', className: '', children,
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        addEventListener() {}, appendChild(child) { return child; },
        querySelector(sel) { return children[sel] || (children[sel] = makeElement(written)); },
        querySelectorAll() { return []; },
        closest() { return null; },
        set textContent(v) { html = String(v); },
        get textContent() { return html; },
        set innerHTML(v) { html = String(v); written.push(html); },
        get innerHTML() { return html; }
    };
    return el;
}
const written = [];
const byId = {};
const document = {
    getElementById(id) { return byId[id] || (byId[id] = makeElement(written)); },
    querySelector() { return makeElement(written); },
    querySelectorAll() { return []; },
    createElement() { return makeElement(written); },
    addEventListener() {},
    body: { appendChild(child) { return child; } }
};

const CACHE = {};
for (const f of ['species.json', 'archetypes.json', 'talents.json', 'weapons.json', 'armor.json', 'equipment.json',
    'psychic-powers.json', 'ascension-packages.json', 'backgrounds.json', 'weapon-upgrades.json',
    'injuries-corruption.json', 'keyword-categories.json', 'holy-relics.json', 'glossary.json', 'threats.json'])
    CACHE[f] = readJson(`data/${f}`);

const ctx = vm.createContext({
    console, document,
    window: { api: { showConfirm: async () => true }, addEventListener() {} },
    Glossary: { enhanceElement() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setTimeout: () => 0, clearTimeout: () => {}
});
const load = rel => vm.runInContext(readSource(rel), ctx, { filename: rel });
const get = name => vm.runInContext(name, ctx);
for (const f of ['data-loader', 'xp-calculator', 'derived-stats', 'prerequisite', 'character-check', 'state',
    'relic-wizard', 'improvised-builder', 'custom-wargear', 'keyword-bonus', 'followers', 'threat-card'])
    load(`creator/js/${f}.js`);
get('DataLoader').cache = CACHE;
load('creator/tabs/wargear-tab.js');
const State = get('State'), ThreatCard = get('ThreatCard'), WargearTab = get('WargearTab'), RelicWizard = get('RelicWizard');
State.init({});

const threats = CACHE['threats.json'];
const threatList = Array.isArray(threats) ? threats : (threats.threats || Object.values(threats));

// --- B6: Mob Abilities and Mob Options ---
{
    const necron = threatList.find(t => t.id === 'necron_warrior');
    const html = ThreatCard.render(necron);
    check('B6: the Necron Warrior card shows Their Number Is Legion', html.includes('Their Number Is Legion'), true);
    check('B6: the Necron Warrior card has no [object Object]', html.includes('[object Object]'), false);
    check('B6: the entry shows as a name and a description',
        html.includes('<p><strong>Their Number Is Legion</strong>: If 10 or more Necron Warriors are alive in a Mob'), true);

    const optionsThreat = threatList.find(t => Array.isArray(t.mobOptions));
    const optionsHtml = ThreatCard.render(optionsThreat);
    check('B6: a threat with a Mob Options list shows each entry',
        optionsThreat.mobOptions.every(e => optionsHtml.includes(`<strong>${e.name}</strong>`)), true);
    check('B6: a threat with a Mob Options list has no [object Object]', optionsHtml.includes('[object Object]'), false);

    const stringThreat = threatList.find(t => typeof t.mobAbilities === 'string' && t.mobAbilities);
    check('B6: a threat with a string in Mob Abilities shows the string as before',
        ThreatCard.render(stringThreat).includes(`<div class="threat-text-section" data-glossary-enhance>${stringThreat.mobAbilities}</div>`), true);

    check('B6: renderTextSection gives an empty text for an empty list', ThreatCard.renderTextSection('Mob Abilities', []), '');
    check('B6: renderTextSection gives an empty text for no value', ThreatCard.renderTextSection('Mob Abilities', undefined), '');
    const custom = ThreatCard.renderTextSection('Mob Abilities', [{ name: 'A<b>"', description: 'D<i>&' }]);
    check('B6: the name and the description of an entry are escaped',
        custom.includes('<strong>A&lt;b&gt;&quot;</strong>: D&lt;i&gt;&amp;') && !custom.includes('<b>') && !custom.includes('<i>'), true);
}

// --- B7: a range stored as text ---
{
    const weapons = CACHE['weapons.json'];
    const weaponList = Array.isArray(weapons) ? weapons : weapons.weapons;
    const textRange = weaponList.find(w => w.type === 'ranged' && typeof w.range === 'string' && w.range !== '-');
    const html = WargearTab.renderRangedWeaponsCards([JSON.parse(JSON.stringify(textRange))], {});
    check('B7: the card of a weapon with a text range shows the text', html.includes(`<span>${textRange.range}</span>`), true);
    check('B7: the card has no undefined', html.includes('undefined'), false);

    const objectRange = weaponList.find(w => w.type === 'ranged' && w.range && typeof w.range === 'object');
    const r = objectRange.range;
    check('B7: an object range shows as short/medium/long',
        WargearTab.renderRangedWeaponsCards([JSON.parse(JSON.stringify(objectRange))], {}).includes(`<span>${r.short}/${r.medium}/${r.long}</span>`), true);

    const noRange = Object.assign(JSON.parse(JSON.stringify(objectRange)), { range: null });
    check('B7: no range shows as -', WargearTab.renderRangedWeaponsCards([noRange], {}).includes('<span>-</span>'), true);

    const dash = weaponList.find(w => w.type === 'ranged' && w.range === '-');
    if (dash) check('B7: a range of - in the data shows as -',
        WargearTab.renderRangedWeaponsCards([JSON.parse(JSON.stringify(dash))], {}).includes('undefined'), false);

    const tagged = Object.assign(JSON.parse(JSON.stringify(textRange)), { range: 'S<b>"x' });
    const taggedHtml = WargearTab.renderRangedWeaponsCards([tagged], {});
    check('B7: the range text is escaped', taggedHtml.includes('S&lt;b&gt;&quot;x') && !taggedHtml.includes('S<b>'), true);
}

// --- B8: a relic with a form that is not a form id ---
{
    State.newCharacter();
    State.character.wargear = [{ id: 'flak_armour', isStarting: false,
        relic: { name: 'X', form: 'zz', originalOwner: null, anointment: null, power: null, oddities: [] } }];
    const snapshot = JSON.stringify(State.character);
    noThrow('B8: open(0) with form zz does not throw', () => RelicWizard.open(0));
    check('B8: the wizard holds no selected form', RelicWizard.wizard.formId, null);
    check('B8: the wizard keeps the relic name', RelicWizard.wizard.name, 'X');
    check('B8: the form step shows no selected card', byId['relic-wizard-body'].innerHTML.includes(' selected'), false);
    check('B8: an open does not write into the character', JSON.stringify(State.character), snapshot);

    // The user can select a form.
    noThrow('B8: selectForm on the opened wizard does not throw', () => RelicWizard.selectForm('power_field'));
    check('B8: the user can select a form', RelicWizard.wizard.formId, 'power_field');

    // A form that the wizard holds but the data lacks: each read of the form must not throw.
    Object.assign(RelicWizard.wizard, { formId: 'zz', power: 'p', baseItemId: 'flak_armour', step: 5 });
    check('B8: getSelectedPower gives null for form zz', noThrow('B8: getSelectedPower does not throw', () => RelicWizard.getSelectedPower()), null);
    noThrow('B8: the Relic Power step renders for form zz', () => RelicWizard.renderStep(5));
    noThrow('B8: the Relic Power step binds for form zz', () => RelicWizard.bindStep(5));
    noThrow('B8: the Summary step renders for form zz', () => RelicWizard.renderStep(7));
    RelicWizard.wizard.formId = 'constructor';
    check('B8: getSelectedPower gives null for form constructor', noThrow('B8: constructor does not throw', () => RelicWizard.getSelectedPower()), null);
    noThrow('B8: the Relic Power step renders for form constructor', () => RelicWizard.renderStep(5));
    State.character.wargear[0].relic.form = 'constructor';
    noThrow('B8: open(0) with form constructor does not throw', () => RelicWizard.open(0));
    check('B8: form constructor gives no selected form', RelicWizard.wizard.formId, null);
    RelicWizard.close();
}

// --- A relic with a known form opens and saves as before ---
{
    State.newCharacter();
    const formId = 'power_field';
    const base = RelicWizard.getBaseItemsForForm(formId)[0];
    State.character.wargear = [{ id: base.id, isStarting: false }];
    RelicWizard.onSaved = null;
    RelicWizard.wizard = { editIndex: null, step: 6, name: 'Vow', formId, baseItemId: base.id,
        originalOwner: 'adeptus_mechanicus', anointment: 'heros_panoply', power: null, powerChoice: null,
        oddities: ['oathbound'], baseSearch: '', rollMessage: '', choiceRollMessage: '' };
    // Take the first power of the form, with its choice if it has one.
    const relics = CACHE['holy-relics.json'];
    const entry = relics.powers[relics.forms[formId].powersTable].entries[0];
    RelicWizard.wizard.power = entry.id;
    if (entry.choice) RelicWizard.wizard.powerChoice = 'Vehicle';
    State.character.wargear = [];
    RelicWizard.finish();
    const before = JSON.stringify(State.character.wargear);
    check('known form: the wizard stored one relic with its form', JSON.parse(before)[0].relic.form, formId);

    noThrow('known form: open(0) does not throw', () => RelicWizard.open(0));
    check('known form: the wizard holds the stored form', RelicWizard.wizard.formId, formId);
    for (let step = 0; step < 8; step++) {
        noThrow(`known form: step ${step} renders and binds`, () => { RelicWizard.wizard.step = step; RelicWizard.render(); });
    }
    check('known form: getSelectedPower gives the stored power', RelicWizard.getSelectedPower().id, entry.id);
    RelicWizard.finish();
    check('known form: finish after open leaves the stored overlay as it was', JSON.stringify(State.character.wargear), before);
}

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
