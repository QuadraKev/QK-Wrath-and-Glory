// Tests for the escapes of the Threats tab, the Copy text and the mob ability lists (spec sections 8 and 9).
// Each check puts a hostile value into each field of a custom threat, renders the view and looks for the raw value.
// Run: node scripts/test-bestiary-escapes.js

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

// Runs one group of checks. A throw is one FAIL, so that the other groups still run.
function group(name, fn) {
    try {
        fn();
    } catch (e) {
        failures++;
        console.log(`FAIL  ${name}: threw ${e && e.message}`);
    }
}

const EVIL = '<b>"Q7\'</b>&';
const RAW = html => /<\/?b>/i.test(html) || html.includes('"Q7');

// The recording document of scripts/test-tab-escapes.js. Each innerHTML set of an element goes to `written`.
function makeRecordingDocument() {
    const written = [];
    const byId = {};
    function makeElement() {
        let html = '';
        let text = null;
        const el = {
            style: {},
            dataset: {},
            value: '',
            className: '',
            classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
            addEventListener() {},
            appendChild(child) { return child; },
            querySelector() { return makeElement(); },
            querySelectorAll() { return []; },
            closest() { return null; },
            set textContent(v) { text = String(v); html = ''; },
            get textContent() { return text === null ? html : text; },
            set innerHTML(v) { html = String(v); text = null; written.push(html); },
            get innerHTML() {
                if (text === null) return html;
                return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            }
        };
        return el;
    }
    const document = {
        getElementById(id) { return byId[id] || (byId[id] = makeElement()); },
        querySelector() { return makeElement(); },
        querySelectorAll() { return []; },
        createElement() { return makeElement(); },
        body: { appendChild(child) { return child; } }
    };
    return { document, written };
}

function load(ctx, rel) {
    vm.runInContext(readSource(rel), ctx, { filename: rel });
}

const GLOSSARY = readJson('data/glossary.json');
const THREATS = readJson('data/threats.json');

// --- context 1: the Threats tab with a Glossary stub ---
const rec = makeRecordingDocument();
const ctx = vm.createContext({
    console,
    document: rec.document,
    Glossary: { enhanceDescriptions() {}, showEntryPopup() {} }
});
for (const rel of ['bestiary/js/data-loader.js', 'bestiary/js/bestiary-check.js',
    'bestiary/tabs/settings-tab.js', 'bestiary/tabs/threats-tab.js']) load(ctx, rel);
const DataLoader = vm.runInContext('DataLoader', ctx);
const ThreatsTab = vm.runInContext('ThreatsTab', ctx);
DataLoader.cache['threats.json'] = JSON.parse(JSON.stringify(THREATS));
DataLoader.cache['threat-weapons.json'] = readJson('data/threat-weapons.json');
DataLoader.cache['glossary.json'] = GLOSSARY;
const written = rec.written;

// A custom threat with the hostile value in each string field and in each number field of spec section 4.5.
function evilThreat() {
    return {
        id: 'custom_' + EVIL,
        name: EVIL,
        source: EVIL,
        page: EVIL,
        size: EVIL,
        quote: EVIL,
        attribution: EVIL,
        description: EVIL,
        defenceNote: EVIL,
        speedNote: EVIL,
        determination: EVIL,
        skills: EVIL,
        threatOptions: EVIL,
        biomorphs: EVIL,
        mobOptions: EVIL,
        mobAbilities: [{ name: EVIL, description: EVIL }],
        keywords: [EVIL],
        tierThreat: { '1': EVIL, [EVIL]: 'T' },
        attributes: { S: EVIL, T: EVIL, A: EVIL, I: EVIL, Wil: EVIL, Int: EVIL, Fel: EVIL },
        resilience: { value: EVIL, note: EVIL },
        defence: EVIL,
        wounds: EVIL,
        speed: EVIL,
        shock: EVIL,
        conviction: EVIL,
        resolve: EVIL,
        abilities: [
            { type: EVIL, name: EVIL, stats: EVIL, description: EVIL },
            { type: 'ACTION', name: EVIL, stats: EVIL, description: EVIL }
        ],
        bonuses: [{ name: EVIL, description: EVIL }]
    };
}

group('T-3..T-8', () => {
    const html = ThreatsTab.renderThreatCard(evilThreat());
    check('T-3..T-8: the card holds no raw value', RAW(html), false);
});

group('T-1', () => {
    DataLoader.injectThreat(evilThreat());
    written.length = 0;
    ThreatsTab.renderThreatList();
    const html = written[written.length - 1];
    check('T-1: the list holds no raw value', RAW(html), false);
    check('T-1: the list shows the threat', html.includes('class="threat-list-item'), true);
    DataLoader.removeThreat('custom_' + EVIL);
});

group('T-2', () => {
    const tiers = { '1': EVIL, '2': 'T', [EVIL]: EVIL };
    check('T-2: tier badges hold no raw value (all tiers)', RAW(ThreatsTab.renderTierBadges(tiers)), false);
    check('T-2: tier badges hold no raw value (one tier)', RAW(ThreatsTab.renderTierBadges(tiers, '1')), false);
});

group('T-9', () => {
    written.length = 0;
    const text = ThreatsTab.buildThreatCopyText(evilThreat());
    check('T-9: the Copy text keeps the description as text', text.includes('  ' + EVIL), true);
    check('T-9: the Copy text keeps the bonus as text', text.includes(EVIL + ': ' + EVIL), true);
    check('T-9: no description reaches innerHTML', written.some(h => h.includes('<b>"Q7')), false);
});

group('B6', () => {
    const necron = ThreatsTab.renderThreatCard(THREATS.find(t => t.id === 'necron_warrior'));
    const esc = v => ThreatsTab.escapeHtml(v);
    check('B6: necron_warrior shows Their Number Is Legion', necron.includes(esc('Their Number Is Legion')), true);
    check('B6: necron_warrior shows no [object Object]', necron.includes('[object Object]'), false);
    const fire = ThreatsTab.renderThreatCard(THREATS.find(t => t.id === 'fire_warrior'));
    const names = ['Focused Fire', "Ta'lissera", 'Eight-Strong Strike Team', 'Sixteen-Strong Strike Team'];
    check('B6: fire_warrior shows the ability names and both strike teams', names.every(n => fire.includes(esc(n))), true);
    check('B6: fire_warrior shows no [object Object]', fire.includes('[object Object]'), false);
    check('B6: the apostrophe is escaped one time', fire.includes('Ta&#39;lissera'), true);
    check('B6: an empty list prints nothing', ThreatsTab.renderTextSection('Mob Abilities', []), '');
    check('B6: an empty string prints nothing', ThreatsTab.renderTextSection('Mob Abilities', ''), '');
    check('B6: a string prints as text', ThreatsTab.renderTextSection('Biomorphs', 'a & b').includes('a &amp; b'), true);
});

group('helper', () => {
    check('helper: escapeHtml(0) is "0"', ThreatsTab.escapeHtml(0), '0');
    check('helper: escapeHtml(null) is ""', ThreatsTab.escapeHtml(null), '');
    check('helper: escapeHtml(undefined) is ""', ThreatsTab.escapeHtml(undefined), '');
    check('helper: escapeHtml escapes the five characters', ThreatsTab.escapeHtml('a"b\'<&>'), 'a&quot;b&#39;&lt;&amp;&gt;');
});

group('names', () => {
    const NAME = 'A & "B" <C>';
    const ESC = 'A &amp; &quot;B&quot; &lt;C&gt;';
    const DOUBLE = ['&amp;amp;', '&amp;quot;', '&amp;lt;'];
    const threat = Object.assign(evilThreat(), { id: 'custom_names', name: NAME, keywords: [NAME] });
    const card = ThreatsTab.renderThreatCard(threat);
    check('names: the card holds the name escaped one time', card.includes(ESC), true);
    check('names: the card holds no double escape', DOUBLE.some(d => card.includes(d)), false);
    DataLoader.injectThreat(threat);
    written.length = 0;
    ThreatsTab.renderThreatList();
    const list = written[written.length - 1];
    check('names: the list holds the name escaped one time', list.includes(ESC), true);
    check('names: the list holds no double escape', DOUBLE.some(d => list.includes(d)), false);
    DataLoader.removeThreat('custom_names');
});

// --- context 2: the real glossary, with no stub (P16) ---
group('glossary', () => {
    const ctx2 = vm.createContext({ console, document: makeRecordingDocument().document });
    load(ctx2, 'bestiary/js/glossary.js');
    const Glossary = vm.runInContext('Glossary', ctx2);
    Glossary.data = GLOSSARY;
    Glossary.termMap = new Map();
    Glossary.buildTermMap();
    const keys = [...Glossary.termMap.keys()].map(k => k.toLowerCase());
    const hits = ['amp', 'lt', 'gt', 'nbsp', 'quot', '39'].filter(w => keys.includes(w));
    check('glossary: no term is amp, lt, gt, nbsp or quot', hits, []);
    check('glossary: the term map holds terms', keys.length > 100, true);
});

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
