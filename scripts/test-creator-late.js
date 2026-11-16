// Tests for four late corrections of the bug pass (Task 20).
// 1. Confirm in the optional sub-option window of the Species tab keeps a stored option that the data does not have.
// 2. The sheet shows a talent name as the Talents tab shows it: [Any], [Skill] and the like give way to the choice.
// 3. The sub-faction keyword select of the Archetype tab keeps its place in the page, so the keyboard works.
// 4. The Compendium prints "Skill of your choice +4" for an "any skill" bonus.
// Loads the real files with the real State and the real data.
// Run: node scripts/test-creator-late.js

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

// A DOM stub. Each innerHTML write goes to `written`. An element made by createElement goes to `created`.
// querySelectorAll('.cls') on the document or on an element gives one stub per tag of its html with that class.
function makeRecordingDocument() {
    const created = [];
    const byId = {};
    function makeElement() {
        let html = '';
        const children = {};
        const el = {
            style: {}, dataset: {}, value: '', className: '', listeners: {}, children,
            classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
            addEventListener(type, fn) { (el.listeners[type] = el.listeners[type] || []).push(fn); },
            appendChild(child) { return child; },
            querySelector(sel) { return children[sel] || (children[sel] = makeElement()); },
            querySelectorAll(sel) { return findInHtml(html, sel); },
            closest() { return null; },
            set textContent(v) { html = String(v); },
            get textContent() { return html; },
            set innerHTML(v) { html = String(v); },
            get innerHTML() { return html; }
        };
        return el;
    }
    function findInHtml(html, sel) {
        const cls = sel.replace(/^\./, '');
        const list = [];
        const re = /<(\w+)([^>]*)>/g;
        let m;
        while ((m = re.exec(html))) {
            const attrs = m[2];
            const classMatch = /class="([^"]*)"/.exec(attrs);
            if (!classMatch || !classMatch[1].split(/\s+/).includes(cls)) continue;
            const stub = makeElement();
            const dre = /data-([\w-]+)="([^"]*)"/g;
            let d;
            while ((d = dre.exec(attrs))) {
                const key = d[1].replace(/-(\w)/g, (_, c) => c.toUpperCase());
                stub.dataset[key] = d[2].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
            }
            list.push(stub);
        }
        return list;
    }
    const document = {
        getElementById(id) { return byId[id] || (byId[id] = makeElement()); },
        querySelector() { return makeElement(); },
        querySelectorAll(sel) { return findInHtml(Object.values(byId).map(e => e.innerHTML).join(''), sel); },
        createElement() { const e = makeElement(); created.push(e); return e; },
        addEventListener() {},
        body: { appendChild(child) { return child; } }
    };
    return { document, created, makeElement };
}
const rec = makeRecordingDocument();

const CACHE = {};
for (const f of ['species.json', 'archetypes.json', 'talents.json', 'weapons.json', 'armor.json', 'equipment.json',
    'psychic-powers.json', 'ascension-packages.json', 'backgrounds.json', 'weapon-upgrades.json',
    'injuries-corruption.json', 'keyword-categories.json', 'holy-relics.json', 'glossary.json',
    'threats.json', 'threat-weapons.json'])
    CACHE[f] = readJson(`data/${f}`);

const alerts = [];
const copied = [];
const ctx = vm.createContext({
    console,
    document: rec.document,
    window: { api: { showConfirm: async () => true }, getComputedStyle: () => ({ display: 'block' }), addEventListener() {}, removeEventListener() {} },
    navigator: { clipboard: { writeText: text => { copied.push(text); return { then() {} }; } } },
    alert: msg => { alerts.push(msg); },
    MutationObserver: function () { this.observe = () => {}; },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setTimeout: () => 0, clearTimeout: () => {}
});
const load = rel => vm.runInContext(readSource(rel), ctx, { filename: rel });
const get = name => vm.runInContext(name, ctx);
load('creator/js/data-loader.js');
get('DataLoader').cache = CACHE;
for (const f of ['xp-calculator', 'derived-stats', 'prerequisite', 'character-check', 'state', 'relic-wizard', 'improvised-builder',
    'custom-wargear', 'keyword-bonus', 'followers'])
    load(`creator/js/${f}.js`);
vm.runInContext('var ThreatCard = { render: () => "" }; var Glossary = { enhanceElement() {} };', ctx);
for (const f of ['species', 'archetype', 'talents', 'references', 'character-sheet']) load(`creator/tabs/${f}-tab.js`);

const State = get('State'), DataLoader = get('DataLoader'), KeywordBonus = get('KeywordBonus');
const SpeciesTab = get('SpeciesTab'), ArchetypeTab = get('ArchetypeTab'), TalentsTab = get('TalentsTab');
const ReferencesTab = get('ReferencesTab'), CharacterSheetTab = get('CharacterSheetTab');
State.init({});

const clone = v => JSON.parse(JSON.stringify(v));

(async () => {
    // === Item 1: Confirm in the optional sub-option window ===
    // The Human homeworld is optional. K1 and K2 are options of the data. U is an id that the data does not have. O is another type.
    const K1 = { type: 'homeworld', optionId: 'death_world_aoa' };
    const K2 = { type: 'homeworld', optionId: 'hive_world_aoa' };
    const U = { type: 'homeworld', optionId: 'zz_world' };
    const O = { type: 'zz_other', optionId: 'zz_o' };
    const homeworld = DataLoader.getSpecies('human').subOptions;
    check('the Human sub-option is the optional homeworld', [homeworld.type, homeworld.required], ['homeworld', false]);

    // Stores the list, opens the window, picks one button or none, presses Confirm. Gives the stored list.
    function confirmWith(stored, pickId) {
        State.newCharacter();
        State.setSpecies('human');
        State.character.species.subOptions = clone(stored);
        SpeciesTab.pendingSubOptions = { configs: [homeworld], currentIndex: 0 };
        rec.document.querySelector = () => (pickId ? { dataset: { optionId: pickId } } : null);
        alerts.length = 0;
        SpeciesTab.confirmSubOption();
        rec.document.querySelector = () => rec.makeElement();
        return State.character.species.subOptions;
    }

    // With no unknown entry, each result is the result of the old code (pinned from the old function body).
    check('no unknown entry: nothing picked, nothing stored', confirmWith([], null), []);
    check('no unknown entry: a pick is stored', confirmWith([], K1.optionId), [K1]);
    check('no unknown entry: nothing picked clears the known entry', confirmWith([K1], null), []);
    check('no unknown entry: a pick replaces the known entry', confirmWith([K1], K2.optionId), [K2]);
    check('no unknown entry: nothing picked leaves the other type', confirmWith([O, K1], null), [O]);
    check('no unknown entry: a pick replaces the known entry after another type', confirmWith([O, K1], K2.optionId), [O, K2]);
    check('no unknown entry: a pick goes to the end after another type', confirmWith([O], K1.optionId), [O, K1]);

    // With one unknown entry, it stays in each case, at its place.
    check('unknown entry: nothing picked keeps it', confirmWith([U], null), [U]);
    check('unknown entry: a pick is stored after it', confirmWith([U], K1.optionId), [U, K1]);
    check('unknown entry: nothing picked clears only the known entry (known first)', confirmWith([K1, U], null), [U]);
    check('unknown entry: nothing picked clears only the known entry (unknown first)', confirmWith([U, K1], null), [U]);
    check('unknown entry: a pick replaces the known entry in place (known first)', confirmWith([K1, U], K2.optionId), [K2, U]);
    check('unknown entry: a pick replaces the known entry in place (unknown first)', confirmWith([U, K1], K2.optionId), [U, K2]);
    check('unknown entry: a pick of the same known option changes nothing', confirmWith([U, K1], K1.optionId), [U, K1]);
    check('unknown entry: the other type stays at its place (nothing picked)', confirmWith([O, U, K1], null), [O, U]);
    check('unknown entry: the other type stays at its place (a pick)', confirmWith([O, U, K1], K2.optionId), [O, U, K2]);
    check('unknown entry: a pick goes to the end after the other type and the unknown entry', confirmWith([O, U], K1.optionId), [O, U, K1]);
    check('unknown entry: two unknown entries stay (nothing picked)', confirmWith([U, { type: 'homeworld', optionId: 'zz_two' }, K1], null),
        [U, { type: 'homeworld', optionId: 'zz_two' }]);
    check('unknown entry: no alert for an optional window', alerts, []);

    // The unknown row keeps its Remove control, and the control still deletes the entry.
    confirmWith([U, K1], null);
    rec.created.length = 0;
    SpeciesTab.render();
    {
        const card = rec.created.find(e => e.innerHTML.includes('Unknown sub-option'));
        check('after Confirm the Unknown row shows', !!card && card.innerHTML.includes('Unknown sub-option (zz_world)'), true);
        const removeBtn = card && card.querySelectorAll('.btn-remove-suboption')[0];
        check('after Confirm the unknown row has the Remove control', !!removeBtn && removeBtn.dataset.optionId, 'zz_world');
    }
    State.removeSpeciesSubOption('homeworld', 'zz_world');
    check('the Remove of the unknown entry still deletes it', State.character.species.subOptions, []);

    // === Item 2: the sheet shows the name of a talent as the Talents tab shows it ===
    const HOSTILE_CHOICE = '<img src=x onerror=alert(1)>';
    function talentCharacter(talents) {
        State.newCharacter();
        State.setSpecies('human');
        State.setArchetype('imperial_guardsman');
        State.character.wargear = [{ id: 'knife', isStarting: false }, { id: 'primitive_armour', isStarting: false }];
        State.character.talents = clone(talents);
        return State.character;
    }
    const tabNames = () => {
        rec.created.length = 0;
        TalentsTab.renderSelected();
        return rec.created.map(e => (/<span class="selected-talent-name(?: unknown-entry-text)?">([\s\S]*?)<\/span>/.exec(e.innerHTML) || [])[1])
            .filter(n => n !== undefined).map(n => n.trim());
    };
    const sheetNames = character => [...CharacterSheetTab.renderTalents(character).matchAll(/<span class="sheet-talent-name(?: unknown-entry-text)?">([\s\S]*?)<\/span>/g)].map(m => m[1].trim());
    const copyTalentLines = () => {
        copied.length = 0;
        CharacterSheetTab.copySummary({ innerHTML: '' });
        const lines = (copied[0] || '').split('\n');
        const start = lines.indexOf('TALENTS');
        const out = [];
        for (let i = start + 1; start >= 0 && i < lines.length && lines[i] !== ''; i++) out.push(lines[i]);
        return out;
    };

    const FIXTURES = [
        ['(a) a placeholder with a text choice', { id: 'hatred', choice: 'ORKS' }, 'Hatred (ORKS)'],
        ['(a) a [Skill] placeholder', { id: 'jargon', choice: 'Medicae' }, 'Jargon (Medicae)'],
        ['(a) an [Attribute] placeholder', { id: 'transhuman', choice: 'Strength' }, 'Transhuman (Strength)'],
        ['(a) a number choice for a placeholder', { id: 'hatred', choice: 0 }, 'Hatred (0)'],
        ['(b) a wargear index of a weapon', { id: 'trademark_weapon', choice: '0' }, 'Trademark Weapon (Knife)'],
        ['(b) a number index of a weapon', { id: 'trademark_weapon', choice: 0 }, 'Trademark Weapon (Knife)'],
        ['(b) a wargear index of an armor', { id: 'armourmonger_aoa', choice: '1' }, 'Armour-Monger (Abundance of Apocrypha) (Primitive Armour)'],
        ['(b) a text choice for an owned-item talent', { id: 'trademark_weapon', choice: 'Chainsword' }, 'Trademark Weapon (Chainsword)'],
        ['(c) an index with no item', { id: 'trademark_weapon', choice: '9' }, 'Trademark Weapon (no item selected)'],
        ['(c) an index of an item of the wrong kind', { id: 'trademark_weapon', choice: 1 }, 'Trademark Weapon (no item selected)'],
        ['(c) a null choice of an owned-item talent', { id: 'trademark_weapon', choice: null }, 'Trademark Weapon (no item selected)'],
        ['(d) a talent with no choice', { id: 'binary_chatter' }, 'Binary Chatter'],
        ['(d) an old string entry', 'binary_chatter', 'Binary Chatter'],
        ['(d) a placeholder talent with a null choice', { id: 'hatred', choice: null }, 'Hatred [Any]'],
        ['(e) an unknown talent id', { id: 'zz_no_such' }, 'Unknown talent (zz_no_such)'],
        ['(f) a hostile choice text', { id: 'hatred', choice: HOSTILE_CHOICE }, 'Hatred (&lt;img src=x onerror=alert(1)&gt;)'],
        ['(f) a choice with a replace pattern', { id: 'hatred', choice: '$& $1' }, 'Hatred ($&amp; $1)']
    ];
    for (const [label, entry, expectedName] of FIXTURES) {
        const character = talentCharacter([entry]);
        const tab = tabNames();
        const sheet = sheetNames(character);
        check(`talent ${label}: the Talents tab name`, tab, [expectedName]);
        check(`talent ${label}: the sheet name equals the Talents tab name`, sheet, tab);
    }
    {
        const character = talentCharacter(FIXTURES.map(f => f[1]));
        check('talents: all fixtures in one list, the sheet names equal the Talents tab names', sheetNames(character), tabNames());
        const html = CharacterSheetTab.renderTalents(character);
        const names = sheetNames(character);
        check('talents: no [Any] and no [Skill] on the sheet for a talent with a choice',
            names.filter(n => /Hatred|Jargon|Transhuman/.test(n) && !n.includes('Hatred [Any]')).some(n => /\[/.test(n)), false);
        check('talents: no raw tag from a hostile choice on the sheet', html.includes('<img'), false);
    }
    // The copy text prints the same name, as plain text (no HTML escape).
    {
        talentCharacter([{ id: 'hatred', choice: 'ORKS' }, { id: 'trademark_weapon', choice: '0' }, { id: 'trademark_weapon', choice: '9' },
            { id: 'binary_chatter' }, 'binary_chatter', { id: 'zz_no_such' }, { id: 'hatred', choice: HOSTILE_CHOICE }]);
        check('copy text: the talent lines show the name as the Talents tab shows it', copyTalentLines(), [
            '  Hatred (ORKS)', '  Trademark Weapon (Knife)', '  Trademark Weapon (no item selected)', '  Binary Chatter', '  Binary Chatter',
            '  Unknown talent (zz_no_such)', `  Hatred (${HOSTILE_CHOICE})`]);
    }
    // A character with no placeholder talent: the sheet HTML of a talent row does not change (pinned from the old code).
    {
        const character = talentCharacter([{ id: 'trademark_weapon', choice: '0' }, { id: 'binary_chatter' }]);
        const html = CharacterSheetTab.renderTalents(character);
        check('no placeholder: the name spans of the sheet', [...html.matchAll(/<span class="sheet-talent-name">[\s\S]*?<\/span>/g)].map(m => m[0]),
            ['<span class="sheet-talent-name">Trademark Weapon (Knife)</span>', '<span class="sheet-talent-name">Binary Chatter</span>']);
        check('no placeholder: the Chosen note stays', html.includes('<strong class="sheet-talent-choice">Chosen: Knife</strong>. '), true);
    }

    // === Item 3: the keyword select keeps its place in the page ===
    {
        const archetype = DataLoader.getArchetype('skitarius');
        State.newCharacter();
        State.setSpecies('human');
        State.setArchetype('skitarius');
        const html = ArchetypeTab.renderKeywordChoices(archetype, State.getCharacter());
        const selectTag = (/<select class="keyword-choice-select"[^>]*>/.exec(html) || [''])[0];
        check('keyword select: it has an aria-label with the text of its label', /aria-label="Forge World \(\[FORGE WORLD\]\)"/.test(selectTag), true);
        check('keyword select: the label div keeps its text', html.includes('<div class="ascension-choice-label">Forge World ([FORGE WORLD]):</div>'), true);
        check('keyword select: the class and the options do not change', selectTag.startsWith('<select class="keyword-choice-select"') && html.includes('<option value="MARS">Mars</option>'), true);

        // The handler. The div holds the panel and the custom input. The select must stay: no redraw of the detail.
        const placeholder = '[FORGE WORLD]';
        function makeDiv(panel, customShown) {
            const div = { dataset: { placeholder }, panel, custom: { style: { display: customShown ? 'block' : 'none' }, value: customShown ? 'X' : '' } };
            div.querySelector = sel => {
                if (sel === '.keyword-bonus-panel') return div.panel === null ? null : { remove() { div.panel = null; } };
                if (sel === '.keyword-choice-custom') return div.custom;
                return null;
            };
            div.insertAdjacentHTML = (pos, h) => { div.panel = h; div.pos = pos; };
            return div;
        }
        function bind(div, value) {
            const bound = [];
            const select = { value, dataset: {}, closest: () => div, addEventListener: (ev, fn) => { if (ev === 'change') bound.push(fn); } };
            const detail = { querySelectorAll: sel => (sel.includes('keyword-choice-select') ? [select] : []) };
            ArchetypeTab.bindKeywordChoiceEvents(detail);
            return { select, fn: bound[0] };
        }
        let renders = 0;
        ArchetypeTab.renderDetail = () => { renders++; };
        const panelOf = v => KeywordBonus.renderPanel(v);
        check('keyword select: the panel of MARS is not empty', panelOf('MARS') !== '', true);

        let div = makeDiv('<old panel>', true);
        let h = bind(div, 'MARS');
        h.fn({ target: h.select });
        check('keyword select: a change stores the value', State.getCharacter().archetypeKeywordChoices[placeholder], 'MARS');
        check('keyword select: a change does not draw the detail again', renders, 0);
        check('keyword select: the panel follows the value, in place', div.panel, panelOf('MARS'));
        check('keyword select: the custom input is hidden and empty', [div.custom.style.display, div.custom.value], ['none', '']);

        div = makeDiv(panelOf('MARS'), false);
        h = bind(div, 'AVACHRUS');
        h.fn({ target: h.select });
        check('keyword select: a value with no panel removes the panel', [State.getCharacter().archetypeKeywordChoices[placeholder], div.panel], ['AVACHRUS', null]);

        div = makeDiv(panelOf('MARS'), false);
        h = bind(div, '');
        h.fn({ target: h.select });
        check('keyword select: the first option stores an empty value and removes the panel', [State.getCharacter().archetypeKeywordChoices[placeholder], div.panel, renders], ['', null, 0]);

        // The custom option keeps its old result: an empty value, the custom input shown, no redraw.
        div = makeDiv(null, false);
        h = bind(div, '__custom__');
        h.fn({ target: h.select });
        check('keyword select: Other stores an empty value and shows the custom input', [State.getCharacter().archetypeKeywordChoices[placeholder], div.custom.style.display, renders], ['', 'block', 0]);
    }

    // === Item 4: the Compendium entry of an archetype with an "any skill" bonus ===
    {
        const line = entry => (/<span class="ref-label">Skill Bonuses:<\/span> ([^<]*)<\/div>/.exec(ReferencesTab.renderArchetypeBody(entry)) || [])[1];
        const inquisitor = DataLoader.getArchetype('inquisitor');
        const text = ReferencesTab.renderArchetypeBody(inquisitor);
        check('Compendium: the Inquisitor holds the skill of your choice twice', line(inquisitor), 'Skill of your choice +4, Skill of your choice +4');
        check('Compendium: the Inquisitor entry holds no Choice1', /Choice1|Choice2/.test(text), false);
        check('Compendium: the Acolyte holds the skill of your choice', line(DataLoader.getArchetype('inquisitorial_acolyte')), 'Skill of your choice +2');
        check('Compendium: normal skills print as before', line(DataLoader.getArchetype('skitarius')), 'BallisticSkill +2, Tech +1');
        check('Compendium: a mixed bonus prints each key by its rule', line({ skillBonus: { cunning: 1, choice: 2 } }), 'Cunning +1, Skill of your choice +2');
        check('Compendium: a key that only starts with choice is not a choice key', line({ skillBonus: { choiceful: 1 } }), 'Choiceful +1');
    }

    console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
    process.exit(failures ? 1 : 0);
})();
