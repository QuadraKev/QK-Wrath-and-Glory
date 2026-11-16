// Tests the Ascension tab: the notice for the old ascensionPackages list, the rows for an ascension with no slot
// and for an unknown ascension id, the effective tier with an empty slot, and the lower bound of the tier loop.
// Run: node scripts/test-ascension-tab.js

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
function checkTrue(name, cond, detail) {
    if (!cond) failures++;
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `\n        ${detail || ''}`}`);
}

// A DOM stub. The element 'ascension-content' keeps the last HTML and finds the Remove buttons by a pattern,
// so a test can click them. Any other element is a plain stub.
function makeElement() {
    return {
        style: {}, dataset: {}, value: '', className: '',
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        addEventListener() {}, removeEventListener() {}, appendChild(c) { return c; },
        setAttribute() {}, getAttribute() { return null; }, focus() {},
        querySelector() { return makeElement(); }, querySelectorAll() { return []; }, closest() { return null; },
        innerHTML: '', textContent: ''
    };
}
const content = makeElement();
// The buttons of one render stay the same objects, so a click reaches the handler that bindEvents added.
let html$ = '';
let buttonCache = {};
Object.defineProperty(content, 'innerHTML', {
    get() { return html$; },
    set(v) { html$ = String(v); buttonCache = {}; }
});
content.querySelectorAll = function (sel) {
    if (buttonCache[sel]) return buttonCache[sel];
    const found = [];
    buttonCache[sel] = found;
    const add = (re, withTier) => {
        for (const m of this.innerHTML.matchAll(re)) {
            const btn = makeElement();
            if (withTier) btn.dataset.targetTier = m[1];
            btn.handlers = {};
            btn.addEventListener = (ev, fn) => { btn.handlers[ev] = fn; };
            btn.click = () => btn.handlers.click && btn.handlers.click({ target: btn, currentTarget: btn });
            found.push(btn);
        }
    };
    if (sel === '.btn-remove-ascension') add(/<button[^>]*class="[^"]*btn-remove-ascension[^"]*"[^>]*data-target-tier="([^"]*)"/g, true);
    if (sel === '#btn-clear-legacy-packages') add(/<button[^>]*id="btn-clear-legacy-packages"/g, false);
    return found;
};
const byId = { 'ascension-content': content };
const document = {
    getElementById(id) { return byId[id] || (byId[id] = makeElement()); },
    querySelector() { return makeElement(); }, querySelectorAll() { return []; }, createElement() { return makeElement(); },
    addEventListener() {}, removeEventListener() {}, body: { appendChild(c) { return c; } }
};

const CACHE = {};
for (const f of ['species.json', 'archetypes.json', 'talents.json', 'weapons.json', 'armor.json', 'equipment.json',
    'psychic-powers.json', 'ascension-packages.json', 'backgrounds.json', 'weapon-upgrades.json',
    'injuries-corruption.json', 'keyword-categories.json', 'holy-relics.json', 'glossary.json',
    'threats.json', 'threat-weapons.json'])
    CACHE[f] = readJson(`data/${f}`);

const ctx = vm.createContext({
    console: { log: console.log, error: console.error, info: console.info, warn() {} },
    document,
    window: { getComputedStyle: () => ({ display: 'block' }), addEventListener() {}, removeEventListener() {} },
    MutationObserver: function () { this.observe = () => {}; },
    localStorage: {},
    setTimeout: () => 0,
    clearTimeout: () => {}
});
const load = rel => vm.runInContext(readSource(rel), ctx, { filename: rel });
const get = name => vm.runInContext(name, ctx);
load('creator/js/data-loader.js');
get('DataLoader').cache = CACHE;
for (const f of ['xp-calculator', 'derived-stats', 'prerequisite', 'character-check', 'state', 'improvised-builder',
    'custom-wargear', 'keyword-bonus', 'followers'])
    load(`creator/js/${f}.js`);
load('creator/tabs/ascension-tab.js');

const State = get('State');
const AscensionTab = get('AscensionTab');

const base = { name: 'T', species: { id: 'human', xpCost: 0, subOptions: [] }, archetype: { id: 'imperial_guardsman', xpCost: 0 } };
function loadChar(over) {
    State.loadCharacter(JSON.parse(JSON.stringify({ ...base, ...over })));
}
function renderHtml() {
    content.innerHTML = '';
    AscensionTab.render();
    return content.innerHTML;
}
const pkgEntry = (tier, id) => ({ targetTier: tier, type: 'package', packageId: id, archetypeId: null });
const BFTB = 'Back From The Brink';

// A13: an empty slot does not raise the effective tier.
loadChar({ tier: 1, ascensions: [pkgEntry(2, null)] });
check('A13 empty package slot: effective tier 1', State.getEffectiveTier(), 1);
loadChar({ tier: 1, ascensions: [pkgEntry(2, 'back_from_the_brink')] });
check('A13 chosen package: effective tier 2', State.getEffectiveTier(), 2);
loadChar({ tier: 1, ascensions: [{ targetTier: 2, type: 'archetype', packageId: null, archetypeId: null }] });
check('A13 empty archetype slot: effective tier 1', State.getEffectiveTier(), 1);

// A12: an ascension that no slot shows has a row with a Remove control.
loadChar({ tier: 4, ascensions: [pkgEntry(3, 'back_from_the_brink')] });
let html = renderHtml();
checkTrue('A12 tier 4: block title', html.includes('Ascensions with no slot'), html.slice(0, 300));
checkTrue('A12 tier 4: package name', html.includes(BFTB), html.slice(0, 300));
checkTrue('A12 tier 4: Remove button with tier', /class="[^"]*btn-remove-ascension[^"]*"[^>]*data-target-tier="3"/.test(html), html.slice(0, 600));
checkTrue('A12 tier 4: the slot for tier 5 still shows', html.includes('class="ascension-slot" data-target-tier="5"'), '');
// A custom archetype has the starting tier, so tier 5 has no creation slot.
const CUSTOM = { id: 'custom', xpCost: 0 };
loadChar({ tier: 5, archetype: CUSTOM, ascensions: [pkgEntry(3, 'back_from_the_brink')] });
html = renderHtml();
checkTrue('A12 tier 5: block shows', html.includes('Ascensions with no slot') && html.includes(BFTB), html.slice(0, 300));
checkTrue('A12 tier 5: maximum tier message shows', html.includes('No ascension slots available'), html.slice(0, 600));
loadChar({ tier: 5, archetype: CUSTOM, ascensions: [] });
html = renderHtml();
checkTrue('A12 tier 5 with no entry: no block', !html.includes('Ascensions with no slot'), '');
checkTrue('A12 tier 5 with no entry: message shows', html.includes('No ascension slots available'), '');

// A12: the Remove control goes through State.setAscension and releases the grants.
loadChar({ tier: 4, ascensions: [] });
State.character.talents = [];
State.setAscension(3, { type: 'package', packageId: 'dauntless_reputation', archetypeId: null });
check('A12 grant record: the talent is granted', State.character.talents.some(t => t.id === 'devotees' && t.ascensionGranted), true);
html = renderHtml();
const removeBtns = content.querySelectorAll('.btn-remove-ascension');
check('A12 one Remove button', removeBtns.length, 1);
removeBtns[0].click();
check('A12 Remove: entry gone', State.character.ascensions.length, 0);
check('A12 Remove: granted talent released', State.character.talents.some(t => t.id === 'devotees'), false);
checkTrue('A12 Remove: tab renders again without the block', !content.innerHTML.includes('Ascensions with no slot'), '');

// A1: the notice for the old list.
loadChar({ tier: 1, ascensionPackages: ['back_from_the_brink', 'zz<b>'] });
html = renderHtml();
checkTrue('A1 notice: package name', html.includes(BFTB), html.slice(0, 400));
checkTrue('A1 notice: escaped unknown id', html.includes('zz&lt;b&gt;'), html.slice(0, 400));
checkTrue('A1 notice: no raw markup', !html.includes('zz<b>'), '');
checkTrue('A1 notice: Remove text', html.includes('Remove old package list'), html.slice(0, 400));
checkTrue('A1 notice: class info-box', html.includes('class="info-box"'), '');
checkTrue('A1 render does not write: the list stays', Array.isArray(State.character.ascensionPackages) && State.character.ascensionPackages.length === 2, '');
content.querySelectorAll('#btn-clear-legacy-packages')[0].click();
check('A1 button click: the key is gone', 'ascensionPackages' in State.character, false);
checkTrue('A1 after click: no notice', !content.innerHTML.includes('Remove old package list'), '');
loadChar({ tier: 1, ascensionPackages: ['back_from_the_brink'] });
State.clearLegacyAscensionPackages();
check('A1 setter: the key is gone', 'ascensionPackages' in State.character, false);
loadChar({ tier: 1 });
html = renderHtml();
checkTrue('A1 no list: no notice', !html.includes('Remove old package list'), '');

// B9: a very low tier does not make a huge loop.
loadChar({ tier: 1 });
State.character.tier = -300000;
const t0 = Date.now();
html = renderHtml();
const ms = Date.now() - t0;
checkTrue('B9 render under 500 ms', ms < 500, `${ms} ms`);
const slotCount = (html.match(/class="ascension-slot"/g) || []).length;
checkTrue('B9 at most 6 slots', slotCount <= 6, `${slotCount} slots`);

// Unknown ids: a row with a Remove control.
loadChar({ tier: 2, ascensions: [pkgEntry(3, 'zz')] });
html = renderHtml();
checkTrue('Unknown package: row text', html.includes('Unknown ascension package (zz)'), html.slice(0, 500));
checkTrue('Unknown package: Remove button in the slot', /btn-remove-ascension[^>]*data-target-tier="3"/.test(html), '');
loadChar({ tier: 2, ascensions: [{ targetTier: 3, type: 'archetype', packageId: null, archetypeId: 'zz<i>' }] });
html = renderHtml();
checkTrue('Unknown archetype: row text, escaped', html.includes('Unknown archetype (zz&lt;i&gt;)'), html.slice(0, 500));
content.querySelectorAll('.btn-remove-ascension')[0].click();
check('Unknown archetype Remove: entry gone', State.character.ascensions.length, 0);

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) FAILED.`);
process.exit(failures ? 1 : 0);
