// Tests for the unknown ids in the Wargear, Talents and Powers tabs (spec 9.3, 9.4; bug pass task 12).
// Task 13 adds the Injuries, Background and Species tabs, and the Kroot mutations above the tier (spec 9.3, 9.6).
// A wargear entry, an upgrade, a talent or a power that the data does not have shows as a row "Unknown <kind> (<id>)"
// with a Remove control. A character with no PSYKER keyword sees its stored powers and disciplines.
// The Remove control goes through the real State path. A render never writes into the character.
// Run: node scripts/test-unknown-ids.js

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

// The text of an unknown row has the class unknown-entry-text. The stylesheet wraps a long id through this class.
// A known row never has it. `marked` is true when the tag that holds the text has the class.
const marked = (html, text) => new RegExp('class="(?:[^"]* )?unknown-entry-text(?: [^"]*)?"[^>]*>' + text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(html);

// A DOM stub. Each innerHTML write goes to `written`. A button in the html of an element is found by its class:
// querySelectorAll('.cls') on an element or on the document gives one stub per tag with that class, with its data-* values and its listeners.
// querySelector('.cls') on an element gives one stub for each selector, so a test can reach the listener.
function makeRecordingDocument() {
    const written = [];
    const created = [];
    const found = [];
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
            set innerHTML(v) { html = String(v); written.push(html); },
            get innerHTML() { return html; }
        };
        return el;
    }
    // One stub for each tag of the html that has the class of the selector, with its data-* values.
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
            found.push([sel, stub]);
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
    return { document, written, created, found };
}

const rec = makeRecordingDocument();
function recorded(fn) {
    rec.written.length = 0;
    rec.created.length = 0;
    rec.found.length = 0;
    fn();
    return rec.written.join('');
}

const CACHE = {};
for (const f of ['species.json', 'archetypes.json', 'talents.json', 'weapons.json', 'armor.json', 'equipment.json',
    'psychic-powers.json', 'ascension-packages.json', 'backgrounds.json', 'weapon-upgrades.json',
    'injuries-corruption.json', 'keyword-categories.json', 'holy-relics.json', 'glossary.json'])
    CACHE[f] = readJson(`data/${f}`);

let confirmed = [];
const ctx = vm.createContext({
    console,
    document: rec.document,
    window: { api: { showConfirm: async msg => { confirmed.push(msg); return true; } }, addEventListener() {} },
    Glossary: { enhanceElement() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setTimeout: () => 0, clearTimeout: () => {}
});
const load = rel => vm.runInContext(readSource(rel), ctx, { filename: rel });
const get = name => vm.runInContext(name, ctx);
for (const f of ['data-loader', 'xp-calculator', 'derived-stats', 'prerequisite', 'character-check', 'state',
    'relic-wizard', 'improvised-builder', 'custom-wargear', 'keyword-bonus', 'followers'])
    load(`creator/js/${f}.js`);
get('DataLoader').cache = CACHE;
for (const f of ['talents', 'wargear', 'powers', 'injuries', 'background', 'species']) load(`creator/tabs/${f}-tab.js`);
const State = get('State'), WargearTab = get('WargearTab'), TalentsTab = get('TalentsTab'), PowersTab = get('PowersTab');
const InjuriesTab = get('InjuriesTab'), BackgroundTab = get('BackgroundTab'), SpeciesTab = get('SpeciesTab');
State.init({});

function human(archetypeId) {
    State.newCharacter();
    State.setSpecies('human');
    if (archetypeId) State.setArchetype(archetypeId);
    return State.character;
}
const flush = () => new Promise(resolve => setImmediate(resolve));

(async () => {
    // --- Wargear ---
    // The ids hold a tag and a quote. The unknown entry has a known item before and after it.
    const WID = 'no_such<b>"w', UPID = 'zz_up<b>"u', WID_ESC = 'no_such&lt;b&gt;&quot;w', UPID_ESC = 'zz_up&lt;b&gt;&quot;u';
    human();
    State.character.wargear = [{ id: 'lasgun', isStarting: false, upgrades: ['zz_keep', UPID] },
        { id: WID, isStarting: true }, { id: 'laspistol', isStarting: false }];
    let snapshot = JSON.stringify(State.character);
    let html = recorded(() => WargearTab.renderCurrentWargear());
    check('wargear: the unknown entry shows as Unknown wargear (id), escaped', html.includes(`Unknown wargear (${WID_ESC})`), true);
    check('wargear: no raw tag from the id', html.includes('<b>'), false);
    {
        const buttons = rec.found.filter(([sel]) => sel === '.btn-remove-wargear').map(([, b]) => b.dataset.index);
        check('wargear: the unknown row is the last remove button, with data-index 1 (the known items are 0 and 2)', buttons, ['0', '2', '1']);
    }
    check('wargear: the Unknown group has a heading', html.includes('<div class="wargear-group"><h4>Unknown</h4>'), true);
    check('wargear: the Unknown group comes after the Weapons group', html.indexOf('<h4>Weapons</h4>') < html.indexOf('<h4>Unknown</h4>'), true);
    check('wargear: the owned line shows Unknown upgrade (id), escaped', html.includes(`Unknown upgrade (${UPID_ESC})`), true);
    check('wargear: the Unknown wargear text has the mark', marked(html, `Unknown wargear (${WID_ESC})`), true);
    check('wargear: the Unknown upgrade text of the owned line has the mark', marked(html, `Unknown upgrade (${UPID_ESC})`), true);
    check('wargear: three marks only (the unknown item and two unknown upgrades), the known item has none', (html.match(/unknown-entry-text/g) || []).length, 3);
    check('wargear: a render does not write into the character', JSON.stringify(State.character), snapshot);

    html = recorded(() => WargearTab.showUpgradeModal(0));
    check('upgrade modal: shows Unknown upgrade (id), escaped', html.includes(`Unknown upgrade (${UPID_ESC})`), true);
    check('upgrade modal: the Unknown upgrade text has the mark', marked(html, `Unknown upgrade (${UPID_ESC})`), true);
    check('upgrade modal: two marks only (the two unknown upgrades)', (html.match(/unknown-entry-text/g) || []).length, 2);
    check('upgrade modal: no raw tag from the id', html.includes('<b>'), false);
    {
        const ids = rec.found.filter(([sel]) => sel === '.btn-remove-upgrade').map(([, b]) => b.dataset.id);
        check('upgrade modal: the data-id of each remove button reads back as the id', ids, ['zz_keep', UPID]);
        const bound = rec.found.find(([sel, b]) => sel === '.btn-remove-upgrade' && b.dataset.id === UPID);
        check('upgrade modal: the remove control is bound', !!bound, true);
        if (bound) await bound[1].listeners.click[0]();
        await flush();
        check('upgrade remove: only the chosen upgrade leaves the entry', State.character.wargear[0].upgrades, ['zz_keep']);
    }

    // Remove of the unknown wargear: the real handler of the tab, with a talent choice on the last item.
    human();
    State.character.wargear = [{ id: 'lasgun', isStarting: false }, { id: WID, isStarting: true }, { id: 'laspistol', isStarting: false }];
    State.character.talents = [{ id: 'trademark_weapon', choice: '2' }];
    recorded(() => WargearTab.renderCurrentWargear());
    {
        const removeBtn = rec.found.find(([sel, b]) => sel === '.btn-remove-wargear' && b.dataset.index === '1');
        check('wargear remove: the control for the unknown row is bound', !!removeBtn, true);
        confirmed = [];
        if (removeBtn) await removeBtn[1].listeners.click[0]();
        await flush();
        check('wargear remove: the confirm names the id', confirmed, [`Remove Unknown wargear (${WID})?`]);
        check('wargear remove: only the unknown entry is gone', State.character.wargear.map(w => w.id), ['lasgun', 'laspistol']);
        check('wargear remove: the talent choice moved with its item', State.character.talents[0].choice, '1');
    }

    // --- Talents ---
    human();
    State.character.talents = ['zz_t', { id: 'zz<b>', ascensionGranted: true }];
    snapshot = JSON.stringify(State.character);
    html = recorded(() => TalentsTab.renderSelected());
    check('talents: Unknown talent (zz_t) shows', html.includes('Unknown talent (zz_t)'), true);
    check('talents: the id is escaped in Unknown talent (zz&lt;b&gt;)', html.includes('Unknown talent (zz&lt;b&gt;)'), true);
    check('talents: each Unknown talent text has the mark', [marked(html, 'Unknown talent (zz_t)'), marked(html, 'Unknown talent (zz&lt;b&gt;)')], [true, true]);
    check('talents: no raw tag from the id', html.includes('zz<b>'), false);
    check('talents: two btn-remove buttons, also for the ascension-granted entry', (html.match(/btn-remove"/g) || []).length, 2);
    check('talents: a render does not write into the character', JSON.stringify(State.character), snapshot);
    {
        const items = rec.created.filter(e => e.children['.btn-remove']);
        check('talents: each unknown row binds a remove listener', items.map(e => (e.children['.btn-remove'].listeners.click || []).length), [1, 1]);
    }
    // Two entries with the same id: the remove of the second row takes the second entry.
    human();
    State.character.talents = ['zz_t', { id: 'zz_t', choice: 'x' }];
    recorded(() => TalentsTab.renderSelected());
    {
        const items = rec.created.filter(e => e.children['.btn-remove']);
        confirmed = [];
        await items[1].children['.btn-remove'].listeners.click[0]();
        await flush();
        check('talents remove: the confirm names the id', confirmed, ['Remove talent zz_t?']);
        check('talents remove: only the second entry is gone', State.character.talents, ['zz_t']);
    }

    // --- Powers ---
    const PID = 'zz_p<b>"p', PID_ESC = 'zz_p&lt;b&gt;&quot;p';
    human('sanctioned_psyker');
    State.character.psychicPowers = ['smite', PID, 'zz_keep'];
    snapshot = JSON.stringify(State.character);
    html = recorded(() => PowersTab.renderSelected());
    check('powers: Unknown power (id) shows, escaped', html.includes(`Unknown power (${PID_ESC})`), true);
    check('powers: the Unknown power text has the mark', marked(html, `Unknown power (${PID_ESC})`), true);
    check('powers: two marks only (the two unknown powers), Smite has none', (html.match(/unknown-entry-text/g) || []).length, 2);
    check('powers: no raw tag from the id', html.includes('<b>'), false);
    check('powers: the chip has a remove with the escaped data-id', html.includes(`class="power-chip-remove" data-id="${PID_ESC}"`), true);
    check('powers: a render does not write into the character', JSON.stringify(State.character), snapshot);
    {
        const chips = rec.created.filter(e => e.children['.power-chip-remove']);
        const unknown = chips.find(e => e.innerHTML.includes(`Unknown power (${PID_ESC})`));
        check('powers: the unknown chip binds a remove listener', !!unknown, true);
        check('powers: the data-id of the chip reads back as the id', unknown ? unknown.querySelectorAll('.power-chip-remove')[0].dataset.id : null, PID);
        State.character.freePowers = [PID];
        confirmed = [];
        if (unknown) await unknown.children['.power-chip-remove'].listeners.click[0]();
        await flush();
        check('powers remove: the confirm names the id', confirmed, [`Remove power ${PID}?`]);
        check('powers remove: only the chosen power leaves the list, and it leaves the free list',
            [State.character.psychicPowers, State.character.freePowers], [['smite', 'zz_keep'], []]);
    }

    // A source that is turned off does not make an id unknown. The setter is the real one.
    const allSources = State.enabledSources;
    State.setEnabledSources(allSources.filter(s => s !== 'apocrypha'));
    check('source: apocrypha is off', State.isSourceEnabled('apocrypha'), false);
    human('sanctioned_psyker');
    State.character.psychicPowers = ['smite', 'bio_lightning_aoa'];
    html = recorded(() => PowersTab.renderSelected());
    check('powers: a power of a book that is off shows by name', html.includes('Bio-Lightning'), true);
    check('powers: a power of a book that is off does not show as unknown', html.includes('Unknown power'), false);
    check('powers: a power of a book that is off has no mark', html.includes('unknown-entry-text'), false);
    human();
    State.character.wargear = [{ id: 'axe_aoa', isStarting: false }];
    html = recorded(() => WargearTab.renderCurrentWargear());
    check('wargear: an item of a book that is off shows by name', html.includes('Axe'), true);
    check('wargear: an item of a book that is off does not show as unknown', html.includes('Unknown wargear'), false);
    check('wargear: an item of a book that is off has no mark', html.includes('unknown-entry-text'), false);
    human();
    State.character.talents = ['a_taste_for_death_aoa'];
    html = recorded(() => TalentsTab.renderSelected());
    check('talents: a talent of a book that is off shows by name', html.includes('A Taste for Death'), true);
    check('talents: a talent of a book that is off does not show as unknown', html.includes('Unknown talent'), false);
    check('talents: a talent of a book that is off has no mark', html.includes('unknown-entry-text'), false);
    State.setEnabledSources(allSources);

    // No PSYKER keyword: the stored power and the stored discipline show, with a remove control.
    human('ganger');
    State.character.psychicPowers = ['smite'];
    State.character.unlockedDisciplines = ['Telepathy', 'Biomancy'];
    State.ignorePrerequisites = false;
    snapshot = JSON.stringify(State.character);
    html = recorded(() => PowersTab.render());
    check('non-psyker: the info box stays', html.includes('does not have psychic abilities'), true);
    check('non-psyker: the stored power Smite shows', html.includes('Smite'), true);
    check('non-psyker: the chosen discipline chip has data-discipline Biomancy',
        html.includes('class="discipline-chosen-remove" data-discipline="Biomancy"'), true);
    check('non-psyker: a render does not write into the character', JSON.stringify(State.character), snapshot);
    {
        const chips = rec.created.filter(e => e.children['.power-chip-remove']);
        check('non-psyker: the power chip has a remove control', chips.length, 1);
        const chosen = rec.found.find(([sel, b]) => sel === '.discipline-chosen-remove' && b.dataset.discipline === 'Biomancy');
        check('non-psyker: the discipline remove is bound', !!chosen && (chosen[1].listeners.click || []).length, 1);
        if (chosen) chosen[1].listeners.click[0]();
        check('non-psyker: the discipline remove takes only the chosen discipline', State.character.unlockedDisciplines, ['Telepathy']);
    }

    // Stale free powers of a character with no PSYKER keyword show and can be removed.
    human('ganger');
    State.character.psychicPowers = ['smite', 'bio_lightning_aoa'];
    State.character.freePowers = ['bio_lightning_aoa'];
    recorded(() => PowersTab.render());
    {
        const chip = rec.created.find(e => e.children['.power-chip-remove'] && e.innerHTML.includes('Bio-Lightning'));
        check('stale free power: the chip of a non-psyker has a remove control', !!chip, true);
        if (chip) await chip.children['.power-chip-remove'].listeners.click[0]();
        await flush();
        check('stale free power: the remove takes only that power from both lists',
            [State.character.psychicPowers, State.character.freePowers], [['smite'], []]);
    }

    // --- CC8: a psyker archetype with disciplineChoices 0 shows the chosen disciplines ---
    State.newCharacter();
    State.setSpecies('aeldari');
    State.setArchetype('farseer');
    State.character.unlockedDisciplines = ['Biomancy'];
    check('CC8: the farseer has 0 discipline choices', State.getPsykerConfig().disciplineChoices, 0);
    html = recorded(() => PowersTab.render());
    check('CC8: the chosen discipline shows with a remove control',
        html.includes('class="discipline-chosen-remove" data-discipline="Biomancy"'), true);

    // --- Injuries ---
    human();
    State.character.memorableInjuries = [{ id: 'zz_m', escalated: false }];
    State.character.traumaticInjuries = [{ id: 'zz_t', side: null }];
    State.character.mutations = [{ id: 'zz_mu', subChoice: null }];
    snapshot = JSON.stringify(State.character);
    html = recorded(() => InjuriesTab.render());
    check('injuries: Unknown injury (zz_m) shows', html.includes('Unknown injury (zz_m)'), true);
    check('injuries: Unknown injury (zz_t) shows', html.includes('Unknown injury (zz_t)'), true);
    check('injuries: Unknown mutation (zz_mu) shows', html.includes('Unknown mutation (zz_mu)'), true);
    check('injuries: each Unknown text has the mark', [marked(html, 'Unknown injury (zz_m)'), marked(html, 'Unknown injury (zz_t)'), marked(html, 'Unknown mutation (zz_mu)')], [true, true, true]);
    for (const cls of ['memorable-remove', 'traumatic-remove', 'mutation-remove'])
        check(`injuries: ${cls} has data-index 0`, new RegExp(`class="[^"]*${cls}[^"]*"[^>]*data-index="0"`).test(html), true);
    check('injuries: a render does not write into the character', JSON.stringify(State.character), snapshot);
    for (const [cls, key] of [['.memorable-remove', 'memorableInjuries'], ['.traumatic-remove', 'traumaticInjuries'], ['.mutation-remove', 'mutations']]) {
        const btn = rec.found.find(([sel]) => sel === cls);
        check(`injuries: ${cls} is bound`, !!btn, true);
        if (btn) btn[1].listeners.click[0]();
        check(`injuries: ${cls} removes the unknown entry`, State.character[key], []);
    }
    // The id is escaped.
    human();
    State.character.mutations = [{ id: 'zz<b>"', subChoice: null }];
    html = recorded(() => InjuriesTab.render());
    check('injuries: the id is escaped', html.includes('Unknown mutation (zz&lt;b&gt;&quot;)') && !html.includes('zz<b>'), true);
    // The memorable and the traumatic text hold the id escaped one time, and the id does not break the page.
    human();
    State.character.memorableInjuries = [{ id: 'zz<b>"m', escalated: false }];
    State.character.traumaticInjuries = [{ id: 'zz<b>"t', side: null }];
    html = recorded(() => InjuriesTab.render());
    check('injuries: the memorable text shows the id escaped one time', html.includes('Unknown injury (zz&lt;b&gt;&quot;m)'), true);
    check('injuries: the traumatic text shows the id escaped one time', html.includes('Unknown injury (zz&lt;b&gt;&quot;t)'), true);
    check('injuries: no raw tag and no double escape from the injury ids', [html.includes('<b>'), html.includes('&amp;')], [false, false]);

    // --- Background ---
    human();
    State.character.background.origin = { id: 'aeldari_craftworld', bonusType: 'wealth' };
    State.character.background.goal = { id: 'zz_goal', bonusType: null };
    snapshot = JSON.stringify(State.character);
    recorded(() => BackgroundTab.populateSelects());
    html = rec.document.getElementById('origin-select').innerHTML;
    check('background: the origin select has the disabled selected unknown option',
        html.includes('value="aeldari_craftworld" selected disabled'), true);
    check('background: the unknown origin shows its id', html.includes('Unknown origin (aeldari_craftworld)'), true);
    check('background: the unknown option comes after the first option',
        html.indexOf('Select an Origin...') < html.indexOf('Unknown origin'), true);
    check('background: the goal select shows Unknown goal (zz_goal)',
        rec.document.getElementById('goal-select').innerHTML.includes('Unknown goal (zz_goal)'), true);
    check('background: a known stored id does not show as unknown', rec.document.getElementById('accomplishment-select').innerHTML.includes('Unknown'), false);
    check('background: a populate does not write into the character', JSON.stringify(State.character), snapshot);
    {
        // The DOM escape helper needs a stub that escapes as a browser does: & < > escaped, the quote raw.
        const stubCreate = rec.document.createElement;
        rec.document.createElement = () => {
            let text = '';
            return { set textContent(v) { text = String(v); }, get innerHTML() { return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); } };
        };
        State.character.background.origin = { id: 'zz<b>"o', bonusType: null };
        recorded(() => BackgroundTab.populateSelects());
        rec.document.createElement = stubCreate;
        const optHtml = rec.document.getElementById('origin-select').innerHTML;
        const valueAttr = /<option value="([^"]*)" selected disabled>/.exec(optHtml);
        const decoded = valueAttr && valueAttr[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        check('background: the value attribute of the unknown option reads back as the id', decoded, 'zz<b>"o');
        check('background: the option text shows the id escaped one time', optHtml.includes('>Unknown origin (zz&lt;b&gt;"o)</option>'), true);
        check('background: no raw tag and no double escape from the origin id', [optHtml.includes('<b>'), optHtml.includes('&amp;')], [false, false]);
    }
    {
        const known = get('DataLoader').getBackgrounds().origins[0];
        State.character.background.origin = { id: known.id, bonusType: known.bonusType };
        recorded(() => BackgroundTab.populateSelects());
        check('background: a known origin does not show as unknown',
            rec.document.getElementById('origin-select').innerHTML.includes('Unknown origin'), false);
    }

    // --- Species ---
    human();
    State.character.species.subOptions = [{ type: 'discipline', optionId: 'runes_of_fate' }];
    snapshot = JSON.stringify(State.character);
    recorded(() => SpeciesTab.render());
    {
        const btns = rec.found.filter(([sel]) => sel === '.btn-remove-suboption').map(([, b]) => b);
        const card = rec.created.find(e => e.innerHTML.includes('Unknown sub-option'));
        check('species: the Human card shows Unknown sub-option (runes_of_fate)', !!card && card.innerHTML.includes('Unknown sub-option (runes_of_fate)'), true);
        check('species: the Unknown sub-option text has the mark', !!card && marked(card.innerHTML, 'Unknown sub-option (runes_of_fate)'), true);
        check('species: the card has data-option-id runes_of_fate', !!card && card.innerHTML.includes('data-option-id="runes_of_fate"'), true);
        check('species: a render does not write into the character', JSON.stringify(State.character), snapshot);
        check('species: the remove control has data-type discipline', btns.map(b => b.dataset.type), ['discipline']);
        let stopped = false;
        if (btns[0]) btns[0].listeners.click[0]({ stopPropagation() { stopped = true; } });
        check('species: the remove control stops the card click', stopped, true);
        check('species: the remove control clears the stored sub-option', State.character.species.subOptions, []);
    }

    // A known option of a known type does not show as unknown, and an unknown option of a known type does.
    human();
    State.character.species.subOptions = [{ type: 'homeworld', optionId: 'hive_world_aoa' }, { type: 'homeworld', optionId: 'zz_world' }];
    recorded(() => SpeciesTab.render());
    {
        const card = rec.created.find(e => e.innerHTML.includes('card-suboption'));
        check('species: an unknown option of a known type shows', !!card && card.innerHTML.includes('Unknown sub-option (zz_world)'), true);
        check('species: a known option does not show as unknown', !!card && card.innerHTML.includes('Unknown sub-option (hive_world_aoa)'), false);
    }

    // The type and the id of an unknown sub-option are escaped in the text and in the attributes.
    human();
    State.character.species.subOptions = [{ type: 'zz<b>"t', optionId: 'zz<b>"o' }];
    recorded(() => SpeciesTab.render());
    {
        const card = rec.created.find(e => e.innerHTML.includes('Unknown sub-option'));
        const cardHtml = card ? card.innerHTML : '';
        const btn = rec.found.find(([sel]) => sel === '.btn-remove-suboption');
        check('species: the data-type attribute reads back as the type', btn && btn[1].dataset.type, 'zz<b>"t');
        check('species: the data-option-id attribute reads back as the id', btn && btn[1].dataset.optionId, 'zz<b>"o');
        check('species: the text shows the id escaped one time', cardHtml.includes('Unknown sub-option (zz&lt;b&gt;&quot;o)'), true);
        check('species: no raw tag and no double escape from the type and the id', [cardHtml.includes('<b>'), cardHtml.includes('&amp;')], [false, false]);
    }

    // A Human with only an unknown homeworld: the optional line says None and the unknown row shows.
    human();
    State.character.species.subOptions = [{ type: 'homeworld', optionId: 'zz_world' }];
    recorded(() => SpeciesTab.render());
    {
        const card = rec.created.find(e => e.innerHTML.includes('card-suboption'));
        const cardHtml = card ? card.innerHTML : '';
        check('species: only an unknown homeworld gives the None line', /<\/strong> None<\/div>/.test(cardHtml), true);
        check('species: only an unknown homeworld gives the unknown row', cardHtml.includes('Unknown sub-option (zz_world)'), true);
    }

    // An Ogryn has no sub-option config: the stored sub-option shows as unknown, with no change line.
    State.newCharacter();
    State.setSpecies('ogryn');
    State.character.species.subOptions = [{ type: 'homeworld', optionId: 'zz_world' }];
    snapshot = JSON.stringify(State.character);
    recorded(() => SpeciesTab.render());
    {
        const card = rec.created.find(e => e.innerHTML.includes('card-suboption'));
        const cardHtml = card ? card.innerHTML : '';
        check('species: an Ogryn shows the stored sub-option as unknown', cardHtml.includes('Unknown sub-option (zz_world)'), true);
        check('species: an Ogryn card has no change line', cardHtml.includes('card-suboption-change'), false);
        check('species: an Ogryn render does not write into the character', JSON.stringify(State.character), snapshot);
    }

    // A stored unknown mutation counts toward the Tier limit. At Tier 1 the real code adds no Maneater.
    State.newCharacter();
    State.setSpecies('kroot');
    State.character.tier = 1;
    State.character.species.subOptions = [{ type: 'mutation', optionId: 'zz_mu' }];
    check('kroot: one unknown mutation at Tier 1 leaves no room for another', State.canAddMoreKrootMutations(), false);
    SpeciesTab.pendingSubOptions = null;
    SpeciesTab.showSubOptionModal(get('DataLoader').getSpecies('kroot'));
    {
        const maneater = rec.created.find(e => e.dataset.optionId === 'maneater');
        check('kroot: the Maneater button is in the modal', !!maneater, true);
        if (maneater) maneater.listeners.click[0]();
        check('kroot: the attempt to add Maneater adds nothing', State.character.species.subOptions, [{ type: 'mutation', optionId: 'zz_mu' }]);
        SpeciesTab.pendingSubOptions = null;
    }
    // The unknown mutation takes the first place. The two known ones are above the limit and both carry the mark.
    State.character.species.subOptions = [{ type: 'mutation', optionId: 'zz_mu' }, { type: 'mutation', optionId: 'maneater' }, { type: 'mutation', optionId: 'astartes_eater' }];
    recorded(() => SpeciesTab.render());
    {
        const card = rec.created.find(e => e.innerHTML.includes('card-suboption'));
        const cardHtml = card ? card.innerHTML : '';
        check('kroot: an unknown mutation counts toward the tier, so two known rows are above the limit',
            (cardHtml.match(/\(above the limit of Tier 1\)/g) || []).length, 2);
        check('kroot: the unknown mutation shows as unknown', cardHtml.includes('Unknown sub-option (zz_mu)'), true);
    }

    // Kroot, tier 1, three mutations: two are above the limit.
    State.newCharacter();
    State.setSpecies('kroot');
    {
        const krootConfig = [].concat(get('DataLoader').getSpecies('kroot').subOptions).find(c => c.type === 'mutation');
        const ids = krootConfig.options.slice(0, 3).map(o => o.id);
        State.character.tier = 1;
        State.character.species.subOptions = ids.map(optionId => ({ type: 'mutation', optionId }));
        snapshot = JSON.stringify(State.character);
        recorded(() => SpeciesTab.render());
        const btns = rec.found.filter(([sel]) => sel === '.btn-remove-suboption').map(([, b]) => b);
        const card = rec.created.find(e => e.innerHTML.includes('card-suboption'));
        const cardHtml = card ? card.innerHTML : '';
        check('kroot: two rows are above the limit of Tier 1', (cardHtml.match(/\(above the limit of Tier 1\)/g) || []).length, 2);
        check('kroot: the first mutation has no mark', cardHtml.includes(`${krootConfig.options[0].name} (above`), false);
        check('kroot: the second mutation has the mark with its name', cardHtml.includes(`${krootConfig.options[1].name} (above the limit of Tier 1)`), true);
        check('kroot: no row shows as unknown', cardHtml.includes('Unknown sub-option'), false);
        check('kroot: the rows above the limit have no mark', cardHtml.includes('unknown-entry-text'), false);
        check('kroot: a render does not write into the character', JSON.stringify(State.character), snapshot);
        check('kroot: each row above the limit has a remove control', btns.map(b => b.dataset.optionId), ids.slice(1));
        if (btns[0]) btns[0].listeners.click[0]({ stopPropagation() {} });
        check('kroot: the remove control removes the mutation', State.character.species.subOptions.map(o => o.optionId), [ids[0], ids[2]]);
        State.character.tier = 3;
        recorded(() => SpeciesTab.render());
        const card3 = rec.created.find(e => e.innerHTML.includes('card-suboption'));
        check('kroot: at Tier 3 no row is above the limit', card3.innerHTML.includes('above the limit'), false);
    }

    console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
    process.exit(failures ? 1 : 0);
})();
