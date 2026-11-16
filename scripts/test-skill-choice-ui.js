// Tests the "any skill" choice in the UI: the selects of the archetype detail, the text of the bonus,
// the change handler and the prerequisite of an archetype ascension (spec section 4.4).
// Run: node scripts/test-skill-choice-ui.js

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

const EVIL_IMG = '<img src=x onerror=alert(1)>';

// A DOM stub. A set of textContent stores the text. A read of innerHTML after that returns the text
// with only & < > escaped, as a browser does. The escape helpers of the tabs need this.
function makeElement() {
    let html = '';
    let text = null;
    return {
        style: {}, dataset: {}, value: '', className: '',
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        addEventListener() {}, removeEventListener() {}, appendChild(c) { return c; },
        setAttribute() {}, getAttribute() { return null; }, focus() {},
        querySelector() { return makeElement(); }, querySelectorAll() { return []; }, closest() { return null; },
        set textContent(v) { text = String(v); html = ''; },
        get textContent() { return text === null ? html : text; },
        set innerHTML(v) { html = String(v); text = null; },
        get innerHTML() {
            if (text === null) return html;
            return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }
    };
}
const document = {
    getElementById() { return makeElement(); },
    querySelector() { return makeElement(); }, querySelectorAll() { return []; }, createElement() { return makeElement(); },
    addEventListener() {}, removeEventListener() {}, body: { appendChild(c) { return c; } }
};

const CACHE = {};
for (const f of fs.readdirSync(path.join(ROOT, 'data')).filter(n => n.endsWith('.json')))
    CACHE[f] = readJson(`data/${f}`);

const ctx = vm.createContext({
    console: { log: console.log, error: console.error, info: console.info, warn() {} },
    document,
    window: { getComputedStyle: () => ({ display: 'block' }), addEventListener() {}, removeEventListener() {} },
    MutationObserver: function () { this.observe = () => {}; },
    localStorage: { getItem() { return null; }, setItem() {} },
    setTimeout: () => 0,
    clearTimeout: () => {}
});
const load = rel => vm.runInContext(readSource(rel), ctx, { filename: rel });
const get = name => vm.runInContext(name, ctx);
load('creator/js/data-loader.js');
get('DataLoader').cache = CACHE;
for (const f of ['xp-calculator', 'derived-stats', 'prerequisite', 'character-check', 'state', 'improvised-builder',
    'custom-wargear', 'keyword-bonus', 'followers', 'glossary'])
    load(`creator/js/${f}.js`);
load('creator/tabs/archetype-tab.js');
load('creator/tabs/ascension-tab.js');

const State = get('State');
const DataLoader = get('DataLoader');
const ArchetypeTab = get('ArchetypeTab');
const AscensionTab = get('AscensionTab');

const inquisitor = DataLoader.getArchetype('inquisitor');
const ganger = DataLoader.getArchetype('ganger');
const acolyte = DataLoader.getArchetype('inquisitorial_acolyte');

function freshCharacter(archetypeId, over) {
    const c = State.createNewCharacter();
    Object.assign(c, { species: { id: 'human', xpCost: 0, subOptions: [] }, archetype: { id: archetypeId, xpCost: 0 } }, over || {});
    State.character = c;
    State._skillChoicePrior = {};
    return c;
}
const selectHtml = (html, key) => {
    const m = html.match(new RegExp(`<select[^>]*data-choice-key="${key}"[^>]*>[\\s\\S]*?</select>`));
    return m ? m[0] : '';
};
const optionValues = sel => [...sel.matchAll(/<option value="([^"]*)"/g)].map(m => m[1]);

// --- renderSkillChoices ---
let c = freshCharacter('inquisitor');
let html = ArchetypeTab.renderSkillChoices(inquisitor, c);
const sel1 = selectHtml(html, 'choice1');
const sel2 = selectHtml(html, 'choice2');
checkTrue('Inquisitor: select for choice1 with the class', /class="[^"]*skill-choice-select[^"]*"/.test(sel1), html.slice(0, 400));
checkTrue('Inquisitor: select for choice2 with the class', /class="[^"]*skill-choice-select[^"]*"/.test(sel2), html.slice(0, 400));
check('Inquisitor, no choice: choice1 has 19 options', optionValues(sel1).length, 19);
check('Inquisitor, no choice: choice2 has 19 options', optionValues(sel2).length, 19);
check('First option is the empty value', optionValues(sel1)[0], '');
checkTrue('First option text', sel1.includes('-- Select a skill --'), sel1.slice(0, 200));
checkTrue('Section title', html.includes('Skill of your choice</div>') && html.includes('detail-section'), html.slice(0, 300));
checkTrue('Label with the value', html.includes('Skill of your choice (4)'), html.slice(0, 600));
check('Two keyword-choice divs', (html.match(/class="archetype-keyword-choice"/g) || []).length, 2);

c = freshCharacter('inquisitor', { archetypeSkillChoices: { choice1: 'insight' } });
html = ArchetypeTab.renderSkillChoices(inquisitor, c);
check('choice1 = insight: choice2 has no insight option', optionValues(selectHtml(html, 'choice2')).includes('insight'), false);
check('choice1 = insight: choice2 has 18 options', optionValues(selectHtml(html, 'choice2')).length, 18);
checkTrue('choice1 = insight: choice1 shows insight selected', /<option value="insight" selected>Insight<\/option>/.test(selectHtml(html, 'choice1')),
    selectHtml(html, 'choice1').slice(0, 400));

c = freshCharacter('ganger');
check('Ganger: no select', ArchetypeTab.renderSkillChoices(ganger, c), '');

c = freshCharacter('inquisitorial_acolyte');
html = ArchetypeTab.renderSkillChoices(acolyte, c);
check('Acolyte: one select', (html.match(/<select/g) || []).length, 1);
checkTrue('Acolyte: key is choice', selectHtml(html, 'choice') !== '', html.slice(0, 300));

// A stored value from a file: markup, or a skill name that is not real.
c = freshCharacter('inquisitor', { archetypeSkillChoices: { choice1: EVIL_IMG, choice2: 'notaskill' } });
html = ArchetypeTab.renderSkillChoices(inquisitor, c);
check('Hostile stored choice: no raw tag in the HTML', html.includes('<img'), false);
check('Hostile stored choice: no option selected', (html.match(/ selected/g) || []).length, 0);

// --- formatBonuses ---
check('formatBonuses of the Inquisitor', ArchetypeTab.formatBonuses({ choice1: 4, choice2: 4 }, false),
    'Skill of your choice 4, Skill of your choice 4');
check('formatBonuses of the Acolyte', ArchetypeTab.formatBonuses({ choice: 2 }, false), 'Skill of your choice 2');
check('formatBonuses keeps a real skill', ArchetypeTab.formatBonuses({ cunning: 1 }, false), 'Cunning 1');
check('formatBonuses keeps an attribute', ArchetypeTab.formatBonuses({ intellect: 4, willpower: 4 }, true), 'Intellect 4, Willpower 4');

// --- the change handler ---
function bindWith(values) {
    const handlers = [];
    const selects = Object.keys(values).map(key => {
        const s = makeElement();
        s.dataset.choiceKey = key;
        s.value = values[key];
        s.addEventListener = (ev, fn) => { if (ev === 'change') handlers.push({ key, fn, s }); };
        return s;
    });
    const detail = makeElement();
    detail.querySelectorAll = sel => (sel.includes('skill-choice-select') ? selects : []);
    ArchetypeTab.bindSkillChoiceEvents(detail);
    return handlers;
}
let renders = 0;
ArchetypeTab.renderDetail = () => { renders++; };

c = freshCharacter('inquisitor');
let handlers = bindWith({ choice1: 'insight', choice2: 'insight' });
check('Two change handlers bound', handlers.length, 2);
renders = 0;
handlers[0].fn({ target: handlers[0].s });
check('Change: the choice is stored', State.character.archetypeSkillChoices, { choice1: 'insight' });
check('Change: the skill rises to the bonus', State.character.skills.insight, 4);
check('Change: one redraw', renders, 1);
renders = 0;
handlers[1].fn({ target: handlers[1].s });
check('Refused change (skill held by the other key): the store stays', State.character.archetypeSkillChoices, { choice1: 'insight' });
check('Refused change: the select is drawn again', renders, 1);
handlers[0].s.value = '';
renders = 0;
handlers[0].fn({ target: handlers[0].s });
check('Change to the first option: the choice clears', State.character.archetypeSkillChoices.choice1, '');
check('Change to the first option: the skill goes back to 0', State.character.skills.insight, 0);

// --- the prerequisite of an archetype ascension ---
function prereq(skills, ignore) {
    const ch = freshCharacter('imperial_guardsman');
    for (const a of Object.keys(ch.attributes)) ch.attributes[a] = 8;
    Object.assign(ch.skills, skills);
    State.ignorePrerequisites = !!ignore;
    const r = AscensionTab.checkArchetypeAscensionPrereqs(inquisitor, ch);
    State.ignorePrerequisites = false;
    return r;
}
let r = prereq({ insight: 4 });
check('Inquisitor, one skill at 4: not met', r.met, false);
checkTrue('Inquisitor, one skill at 4: text', r.text.includes('Skills of your choice: 2 at 4 (have 1)'), r.text);
checkTrue('Unmet class on the text', /class="ascension-stat-unmet">Skills of your choice/.test(r.text), r.text);
checkTrue('No Choice1 text', !/Choice1/i.test(r.text), r.text);
r = prereq({ insight: 4, scholar: 5 });
check('Inquisitor, two skills at 4 or more: met', r.met, true);
checkTrue('Met text has no (have', !r.text.includes('(have'), r.text);
r = prereq({ insight: 4, scholar: 3 });
check('Inquisitor, 4 and 3: not met', r.met, false);
r = prereq({ insight: 4 }, true);
check('Inquisitor, one skill, prerequisites ignored: met', r.met, true);
r = prereq({ insight: 4, scholar: 4, intimidation: 4 });
check('Three skills at 4: met', r.met, true);

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
