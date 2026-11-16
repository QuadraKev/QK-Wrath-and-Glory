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
    human();
    State.character.wargear = [{ id: 'no_such', isStarting: true }, { id: 'lasgun', isStarting: false, upgrades: ['zz_up'] }];
    let snapshot = JSON.stringify(State.character);
    let html = recorded(() => WargearTab.renderCurrentWargear());
    check('wargear: the unknown entry shows as Unknown wargear (no_such)', html.includes('Unknown wargear (no_such)'), true);
    check('wargear: the unknown row has a btn-remove-wargear with data-index 0',
        /class="[^"]*btn-remove-wargear[^"]*"[^>]*data-index="0"/.test(html), true);
    check('wargear: the Unknown group has a heading', html.includes('<div class="wargear-group"><h4>Unknown</h4>'), true);
    check('wargear: the Unknown group comes after the Weapons group', html.indexOf('<h4>Weapons</h4>') < html.indexOf('<h4>Unknown</h4>'), true);
    check('wargear: the owned line shows Unknown upgrade (zz_up)', html.includes('Unknown upgrade (zz_up)'), true);
    check('wargear: a render does not write into the character', JSON.stringify(State.character), snapshot);

    html = recorded(() => WargearTab.showUpgradeModal(1));
    check('upgrade modal: shows Unknown upgrade (zz_up)', html.includes('Unknown upgrade (zz_up)'), true);
    check('upgrade modal: the remove button has data-id zz_up', /btn-remove-upgrade[^>]*data-id="zz_up"/.test(html), true);

    {
        const bound = rec.found.find(([sel, b]) => sel === '.btn-remove-upgrade' && b.dataset.id === 'zz_up');
        check('upgrade modal: the remove control is bound', !!bound, true);
        if (bound) await bound[1].listeners.click[0]();
        await flush();
        check('upgrade remove: the upgrade leaves the entry', State.character.wargear[1].upgrades, []);
    }

    // Remove of the unknown wargear: the real handler of the tab, with a talent choice on the lasgun.
    human();
    State.character.wargear = [{ id: 'no_such', isStarting: true }, { id: 'lasgun', isStarting: false }];
    State.character.talents = [{ id: 'trademark_weapon', choice: '1' }];
    recorded(() => WargearTab.renderCurrentWargear());
    {
        const removeBtn = rec.found.find(([sel, b]) => sel === '.btn-remove-wargear' && b.dataset.index === '0');
        check('wargear remove: the control for the unknown row is bound', !!removeBtn, true);
        confirmed = [];
        if (removeBtn) await removeBtn[1].listeners.click[0]();
        await flush();
        check('wargear remove: the confirm names the id', confirmed, ['Remove Unknown wargear (no_such)?']);
        check('wargear remove: the unknown entry is gone', State.character.wargear.map(w => w.id), ['lasgun']);
        check('wargear remove: the talent choice moved with its item', State.character.talents[0].choice, '0');
    }

    // --- Talents ---
    human();
    State.character.talents = ['zz_t', { id: 'zz<b>', ascensionGranted: true }];
    snapshot = JSON.stringify(State.character);
    html = recorded(() => TalentsTab.renderSelected());
    check('talents: Unknown talent (zz_t) shows', html.includes('Unknown talent (zz_t)'), true);
    check('talents: the id is escaped in Unknown talent (zz&lt;b&gt;)', html.includes('Unknown talent (zz&lt;b&gt;)'), true);
    check('talents: no raw tag from the id', html.includes('zz<b>'), false);
    check('talents: two btn-remove buttons, also for the ascension-granted entry', (html.match(/btn-remove"/g) || []).length, 2);
    check('talents: a render does not write into the character', JSON.stringify(State.character), snapshot);
    {
        const items = rec.created.filter(e => e.children['.btn-remove']);
        check('talents: each unknown row binds a remove listener', items.map(e => (e.children['.btn-remove'].listeners.click || []).length), [1, 1]);
        confirmed = [];
        await items[0].children['.btn-remove'].listeners.click[0]();
        await flush();
        check('talents remove: the confirm names the id', confirmed, ['Remove talent zz_t?']);
        check('talents remove: the entry is gone', State.character.talents.map(t => typeof t === 'string' ? t : t.id), ['zz<b>']);
    }

    // --- Powers ---
    human('sanctioned_psyker');
    State.character.psychicPowers = ['smite', 'zz_p'];
    snapshot = JSON.stringify(State.character);
    html = recorded(() => PowersTab.renderSelected());
    check('powers: Unknown power (zz_p) shows', html.includes('Unknown power (zz_p)'), true);
    check('powers: the chip has a remove with data-id zz_p', html.includes('class="power-chip-remove" data-id="zz_p"'), true);
    check('powers: a render does not write into the character', JSON.stringify(State.character), snapshot);
    {
        const chips = rec.created.filter(e => e.children['.power-chip-remove']);
        const unknown = chips.find(e => e.innerHTML.includes('zz_p'));
        check('powers: the unknown chip binds a remove listener', !!unknown, true);
        State.character.freePowers = ['zz_p'];
        confirmed = [];
        if (unknown) await unknown.children['.power-chip-remove'].listeners.click[0]();
        await flush();
        check('powers remove: the confirm names the id', confirmed, ['Remove power zz_p?']);
        check('powers remove: the power leaves the list and the free list',
            [State.character.psychicPowers.includes('zz_p'), State.character.freePowers.includes('zz_p')], [false, false]);
    }

    // A source turned off does not make a power unknown.
    human('sanctioned_psyker');
    State.character.psychicPowers = ['smite'];
    html = recorded(() => PowersTab.renderSelected());
    check('powers: a known power does not show as unknown', html.includes('Unknown power'), false);

    // No PSYKER keyword: the stored power and the stored discipline show, with a remove control.
    human('ganger');
    State.character.psychicPowers = ['smite'];
    State.character.unlockedDisciplines = ['Biomancy'];
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
        check('non-psyker: the discipline remove clears the stored discipline', State.character.unlockedDisciplines, []);
    }

    // Stale free powers of a character with no PSYKER keyword show and can be removed.
    human('ganger');
    State.character.psychicPowers = ['smite'];
    State.character.freePowers = ['smite'];
    recorded(() => PowersTab.render());
    {
        const chip = rec.created.find(e => e.children['.power-chip-remove']);
        check('stale free power: the chip of a non-psyker has a remove control', !!chip, true);
        if (chip) await chip.children['.power-chip-remove'].listeners.click[0]();
        await flush();
        check('stale free power: the remove clears both lists',
            [State.character.psychicPowers, State.character.freePowers], [[], []]);
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
