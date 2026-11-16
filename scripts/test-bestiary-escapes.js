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
            remove() {},
            focus() {},
            select() {},
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
            { type: 'ACTION', name: EVIL, stats: EVIL, description: EVIL, weaponId: EVIL }
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
    const fireThreat = THREATS.find(t => t.id === 'fire_warrior');
    const entries = fireThreat.mobAbilities.concat(fireThreat.mobOptions);
    check('B6: fire_warrior shows the description of each entry', entries.every(e => fire.includes(esc(e.description))), true);
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
    const threat = Object.assign(evilThreat(), { id: 'custom_names', name: NAME });
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

// --- the threat builder (spec section 8, group B) ---
// The builder escapes text with its own DOM helper (it leaves the double quote raw) and each attribute value with escapeAttr.
// A raw value is a raw tag, or a double quote that ends an attribute value.
const RAW_B = html => /<\/?b>/i.test(html) || /="[^"<>]*"Q7/.test(html);

ctx.App = { updateThreatCount() {} };
for (const rel of ['bestiary/js/threat-builder-state.js', 'bestiary/tabs/threat-builder-tab.js']) load(ctx, rel);
const ThreatBuilderState = vm.runInContext('ThreatBuilderState', ctx);
const ThreatBuilderTab = vm.runInContext('ThreatBuilderTab', ctx);

group('B-1', () => {
    DataLoader.injectThreat(evilThreat());
    written.length = 0;
    ThreatBuilderTab.renderTemplateDropdown('', 'sidebar');
    const html = written[written.length - 1];
    check('B-1: the template search holds no raw value', RAW_B(html), false);
    check('B-1: the template search shows the threat', html.includes('class="builder-dropdown-item"'), true);
    DataLoader.removeThreat('custom_' + EVIL);
});

group('B-2', () => {
    ThreatBuilderState.threat = evilThreat();
    ThreatBuilderState.threat.parsedSkills = {
        default: EVIL, awareness: EVIL, passiveAwareness: EVIL, entries: [{ name: 'Athletics', value: EVIL }]
    };
    written.length = 0;
    ThreatBuilderTab.renderEditor();
    const html = written[written.length - 1];
    check('B-2: the editor holds no raw value', RAW_B(html), false);
    check('B-2: the editor shows the skill entry', html.includes('builder-skill-entry'), true);
});

group('B-3', () => {
    const html = ThreatBuilderTab.renderPreviewCard(evilThreat());
    check('B-3: the preview holds no raw value', RAW_B(html), false);
    check('B-3: the preview shows the name', html.includes(ThreatBuilderTab.escapeHtml(EVIL)), true);
});

group('B-4, B-5', () => {
    DataLoader.injectThreat(evilThreat());
    ThreatBuilderState._abilityIndex = null;
    written.length = 0;
    const abilities = ThreatBuilderTab.renderAbilityPickerContent();
    const evilType = ThreatBuilderTab.renderAbilityPickerItems(EVIL, '');
    const bonuses = ThreatBuilderTab.renderBonusPickerContent();
    check('B-4: the ability picker holds no raw value', RAW_B(abilities), false);
    check('B-4: the ability picker shows the ability', abilities.includes('class="ability-picker-item"'), true);
    check('B-4: the ability picker holds no raw type', RAW_B(evilType), false);
    check('B-4: the picker of an odd type shows the ability', evilType.includes('class="ability-picker-item"'), true);
    check('B-5: the bonus picker holds no raw value', RAW_B(bonuses), false);
    check('B-5: the bonus picker shows the bonus', bonuses.includes('class="ability-picker-item"'), true);
    check('B-4, B-5: no description is parsed as HTML', written.some(h => h.includes('<b>"Q7')), false);
    check('B-4, B-5: stripHtml is gone', vm.runInContext('typeof ThreatBuilderTab.stripHtml', ctx), 'undefined');
    DataLoader.removeThreat('custom_' + EVIL);
    ThreatBuilderState._abilityIndex = null;
});

group('B-6', () => {
    written.length = 0;
    ThreatBuilderTab.showInjectModal(EVIL, EVIL);
    const html = written[written.length - 1];
    check('B-6: the modal count is escaped', RAW_B(html), false);
    check('B-6: the modal shows the name', html.includes('inject-modal-name'), true);
});

group('P5', () => {
    ThreatBuilderState.threat = Object.assign(evilThreat(), {
        description: '\nfirst',
        abilities: [{ type: 'ABILITY', name: 'n', description: '\nfirst' }],
        bonuses: [{ name: 'n', description: '\nfirst' }]
    });
    written.length = 0;
    ThreatBuilderTab.renderEditor();
    const html = written[written.length - 1];
    const lines = html.match(/rows="\d+">\n\nfirst<\/textarea>/g) || [];
    check('P5: each builder textarea starts with one line break', lines.length, 3);
    check('P5: the builder has three textareas', (html.match(/<textarea/g) || []).length, 3);
});

group('names (builder)', () => {
    const NAME = 'A & "B" <C>';
    const TEXT = 'A &amp; "B" &lt;C&gt;';
    const ATTR = 'A &amp; &quot;B&quot; &lt;C&gt;';
    const DOUBLE = ['&amp;amp;', '&amp;quot;', '&amp;lt;'];
    const threat = Object.assign(evilThreat(), {
        id: 'custom_names_b', name: NAME, keywords: [NAME], abilities: [{ type: 'ACTION', name: NAME, description: NAME }]
    });
    DataLoader.injectThreat(threat);
    ThreatBuilderState._abilityIndex = null;
    const preview = ThreatBuilderTab.renderPreviewCard(threat);
    written.length = 0;
    ThreatBuilderTab.renderTemplateDropdown('', 'sidebar');
    const search = written[written.length - 1];
    const picker = ThreatBuilderTab.renderAbilityPickerContent();
    ThreatBuilderState.threat = threat;
    written.length = 0;
    ThreatBuilderTab.renderEditor();
    const editor = written[written.length - 1];
    for (const [label, html] of [['the preview', preview], ['the template search', search], ['the ability picker', picker]]) {
        check(`names: ${label} holds the name escaped one time`, html.includes(TEXT), true);
        check(`names: ${label} holds no double escape`, DOUBLE.some(d => html.includes(d)), false);
    }
    check('names: the name input holds the name as an attribute', editor.includes(`data-field="name" value="${ATTR}"`), true);
    check('names: the editor holds no double escape', DOUBLE.some(d => editor.includes(d)), false);
    DataLoader.removeThreat('custom_names_b');
    ThreatBuilderState._abilityIndex = null;
});

// --- the encounter tab: the list, the player rows and the notes boxes (spec section 8, tasks 8) ---
ctx.BottomSheet = { isOpen() { return false; }, open() {}, updateContent() {} };
ctx.VehiclesTab = { renderVehicleCardMini: () => '', bindCardPopups() {} };
for (const rel of ['bestiary/js/encounter-state.js', 'bestiary/tabs/encounter-tab.js']) load(ctx, rel);
const EncounterState = vm.runInContext('EncounterState', ctx);
const EncounterTab = vm.runInContext('EncounterTab', ctx);

function clearEncounterState() {
    EncounterState.individuals = [];
    EncounterState.mobs = [];
    EncounterState.playerCharacters = [];
    EncounterState.vehicles = [];
    EncounterState.encounterOrder = null;
    EncounterState.settings.playerCount = 4;
    EncounterTab.selectedId = null;
    EncounterTab.selectionType = null;
}

// The detail render of one entry, read from the recording document
function renderDetailHtml(type, id) {
    EncounterTab.selectedId = id;
    EncounterTab.selectionType = type;
    const container = rec.document.createElement('div');
    written.length = 0;
    EncounterTab._renderDetailContent(container);
    return written.filter(h => h.includes('notes-textarea')).pop() || '';
}

group('N-0', () => {
    check('N-0: escapeHtml escapes the five characters', EncounterTab.escapeHtml('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
    check('N-0: escapeHtml keeps 0', EncounterTab.escapeHtml(0), '0');
    check('N-0: escapeHtml gives an empty string for null and undefined', [EncounterTab.escapeHtml(null), EncounterTab.escapeHtml(undefined)], ['', '']);
});

group('C2', () => {
    clearEncounterState();
    EncounterState.playerCharacters = [{ id: 'pc-1', name: 'Bob "Big" Smith', initiative: null }];
    written.length = 0;
    EncounterTab.renderPlayerCharacterInputs();
    const html = written[written.length - 1];
    check('C2: a player name with quotes stays whole in its value', html.includes('value="Bob &quot;Big&quot; Smith"'), true);
    EncounterState.playerCharacters = [{ id: 'a"b', name: 'X" autofocus onfocus="window.__hit=1', initiative: '1" onfocus="z' }];
    written.length = 0;
    EncounterTab.renderPlayerCharacterInputs();
    const hostile = written[written.length - 1];
    check('C2: a hostile player name stays in its value', RAW_B(hostile) || /" autofocus|" onfocus/.test(hostile), false);
    check('C2: a player id with a quote stays whole in each data-id', (hostile.match(/data-id="a&quot;b"/g) || []).length, 4);
    clearEncounterState();
});

group('N-2', () => {
    clearEncounterState();
    const threat = evilThreat();
    DataLoader.injectThreat(threat);
    const individual = {
        id: EVIL, threatId: threat.id, bonus: EVIL, currentWounds: EVIL, currentShock: EVIL, maxWounds: EVIL, maxShock: EVIL,
        personalRuin: EVIL, mobId: null, initiative: EVIL, notes: EVIL
    };
    const member = { id: 'm1', threatId: threat.id, bonus: 'none', currentWounds: 0, currentShock: 0, maxWounds: 3, maxShock: 0, mobId: EVIL, initiative: null };
    const second = Object.assign({}, member, { id: 'm2' });
    EncounterState.individuals = [individual, member, second];
    EncounterState.mobs = [{ id: EVIL, threatId: threat.id, name: EVIL, initiative: EVIL, notes: EVIL }];
    EncounterState.playerCharacters = [{ id: EVIL, name: EVIL, initiative: EVIL, notes: EVIL }];
    EncounterState.vehicles = [{ id: EVIL, vehicleId: EVIL, wounds: EVIL, initiative: EVIL }];
    const items = EncounterState.getEncounterListItems();
    const byType = {};
    items.forEach(i => { byType[i.type] = i; });
    check('N-2: the list holds the four row types', Object.keys(byType).sort(), ['individual', 'mob', 'player', 'vehicle']);
    const rows = {
        individual: EncounterTab.renderIndividualItem(byType.individual),
        mob: EncounterTab.renderMobItem(byType.mob),
        player: EncounterTab.renderPlayerItem(byType.player),
        vehicle: EncounterTab.renderVehicleItem(byType.vehicle)
    };
    for (const type of Object.keys(rows)) {
        check(`N-2: the ${type} row holds no raw value`, RAW_B(rows[type]), false);
        check(`N-2: the ${type} row holds its data-id escaped`, rows[type].includes('data-id="&lt;b&gt;&quot;Q7&#39;&lt;/b&gt;&amp;"'), true);
    }
    clearEncounterState();
    DataLoader.removeThreat(threat.id);
});

for (const [kind, threatId] of [['player', null], ['individual', 'sly_marbo_aaa'], ['mob', 'astra_militarum_trooper']]) {
    group('C3 ' + kind, () => {
        clearEncounterState();
        const NOTES = '\nHP &lt;5 </textarea> x';
        let id;
        if (kind === 'player') {
            EncounterState.playerCharacters = [{ id: 'pc-1', name: 'Bob', initiative: null, notes: NOTES }];
            id = 'pc-1';
        } else if (kind === 'individual') {
            EncounterState.individuals = [{ id: 'i1', threatId, bonus: 'none', currentWounds: 0, currentShock: 0, maxWounds: 3, maxShock: 0, mobId: null, initiative: null, notes: NOTES }];
            id = 'i1';
        } else {
            const members = ['m1', 'm2'].map(m => ({ id: m, threatId, bonus: 'none', currentWounds: 0, currentShock: 0, maxWounds: 3, maxShock: 0, mobId: 'mob1', initiative: null }));
            EncounterState.individuals = members;
            EncounterState.mobs = [{ id: 'mob1', threatId, name: 'Mob', initiative: null, notes: NOTES }];
            id = 'mob1';
        }
        const html = renderDetailHtml(kind, id);
        check(`C3: ${kind} notes keep their entity text`, html.includes('>\n\nHP &amp;lt;5 &lt;/textarea&gt; x</textarea>'), true);
        clearEncounterState();
    });
}

group('C10', () => {
    clearEncounterState();
    const members = ['m1', 'm2'].map(m => ({ id: m, threatId: 'gone', bonus: 'none', currentWounds: 0, currentShock: 0, maxWounds: 3, maxShock: 0, mobId: 'mob1', initiative: null }));
    EncounterState.individuals = members;
    EncounterState.mobs = [{ id: 'mob1', threatId: 'gone', name: 'M', initiative: null }];
    const item = EncounterState.getEncounterListItems().find(i => i.type === 'mob');
    check('C10: the mob row shows the unknown-threat mark', EncounterTab.renderMobItem(item).includes('M — Unknown threat (gone)'), true);
    clearEncounterState();
});

group('names (encounter rows)', () => {
    const NAME = 'A & "B" <C>';
    const ATTR = 'A &amp; &quot;B&quot; &lt;C&gt;';
    clearEncounterState();
    const threat = Object.assign(evilThreat(), { id: 'custom_names_e', name: NAME });
    DataLoader.injectThreat(threat);
    const members = ['m1', 'm2'].map(m => ({ id: m, threatId: threat.id, bonus: 'none', currentWounds: 0, currentShock: 0, maxWounds: 3, maxShock: 0, mobId: 'mob1', initiative: null }));
    EncounterState.individuals = [
        { id: 'i1', threatId: threat.id, bonus: 'none', currentWounds: 0, currentShock: 0, maxWounds: 3, maxShock: 0, mobId: null, initiative: null }
    ].concat(members);
    EncounterState.mobs = [{ id: 'mob1', threatId: threat.id, name: NAME, initiative: null }];
    const items = EncounterState.getEncounterListItems();
    const rows = [['the individual row', EncounterTab.renderIndividualItem(items.find(i => i.type === 'individual'))],
        ['the mob row', EncounterTab.renderMobItem(items.find(i => i.type === 'mob'))]];
    for (const [label, html] of rows) {
        check(`names: ${label} holds the name escaped one time`, html.includes(ATTR), true);
        check(`names: ${label} holds no double escape`, html.includes('&amp;amp;'), false);
    }
    clearEncounterState();
    DataLoader.removeThreat('custom_names_e');
});

group('P5 (encounter)', () => {
    clearEncounterState();
    EncounterState.playerCharacters = [{ id: 'pc-1', name: 'Bob', initiative: null, notes: 'plain' }];
    const html = renderDetailHtml('player', 'pc-1');
    check('P5: the player notes box starts with one line break', html.includes('placeholder="Add notes...">\nplain</textarea>'), true);
    clearEncounterState();
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
