// Tests for the known stat names and the one stat baseline in creator/js/xp-calculator.js,
// the stat resets and decreases in creator/js/state.js, and the limits of creator/tabs/stats-tab.js.
// Run: node scripts/test-stat-baseline.js

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

const DATA = {};
for (const f of ['species.json', 'archetypes.json', 'talents.json', 'weapons.json', 'armor.json', 'equipment.json',
    'psychic-powers.json', 'ascension-packages.json', 'backgrounds.json', 'weapon-upgrades.json',
    'injuries-corruption.json', 'keyword-categories.json', 'holy-relics.json', 'glossary.json', 'threats.json'])
    DATA[f] = readJson(`data/${f}`);

// The recording DOM stub: each element keeps the innerHTML that the tab writes, and the container keeps its children.
const lists = {};
function element() {
    return { className: '', innerHTML: '', children: [], appendChild(c) { this.children.push(c); },
        querySelector: () => ({ addEventListener() {} }) };
}
const document = {
    getElementById(id) { return lists[id] || (lists[id] = element()); },
    createElement: () => element()
};

const ctx = vm.createContext({
    console, document, window: { api: {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setTimeout: () => 0, clearTimeout: () => {}
});
for (const f of ['data-loader.js', 'custom-wargear.js', 'character-check.js', 'state.js', 'xp-calculator.js',
    'derived-stats.js', 'prerequisite.js', 'keyword-bonus.js', 'followers.js'])
    vm.runInContext(readSource(`creator/js/${f}`), ctx, { filename: f });
vm.runInContext(readSource('creator/tabs/stats-tab.js'), ctx, { filename: 'stats-tab.js' });
const get = name => vm.runInContext(name, ctx);
const DL = get('DataLoader'), State = get('State'), XP = get('XPCalculator'), StatsTab = get('StatsTab');
DL.cache = DATA;
State.init({});

// A new Human character with the given archetype and direct field writes.
function build(archetypeId, edit) {
    State.newCharacter();
    const c = State.character;
    c.species = { id: 'human', xpCost: 0 };
    c.archetype = { id: archetypeId, xpCost: 0 };
    if (edit) edit(c);
    return c;
}
const noNaN = obj => Object.values(obj).every(v => !Number.isNaN(v));

// --- the known names ---
const fresh = State.createNewCharacter();
check('SKILL_KEYS equals the skill keys of a new character', XP.SKILL_KEYS, Object.keys(fresh.skills));
check('ATTRIBUTE_KEYS equals the attribute keys of a new character', XP.ATTRIBUTE_KEYS, Object.keys(fresh.attributes));

// --- the XP total ---
const ganger = build('ganger', c => {
    c.skills.cunning = 1;
    c.skills.choice1 = 4;
    c.skills.choice2 = 4;
});
check('Ganger with choice1 and choice2 at 4: the skill XP is 0', XP.calculateSkillXP(ganger, DL.getArchetype('ganger')), 0);

const plain = build('ganger');
const withoutFoo = XP.calculateAttributeXP(plain, DL.getArchetype('ganger'));
plain.attributes.foo = 3;
check('An unknown attribute key has no effect on the attribute XP', XP.calculateAttributeXP(plain, DL.getArchetype('ganger')), withoutFoo);

const edge = build('ganger', c => { c.attributes.strength = 13; });
check('Attribute 13 costs as the edge 12', XP.calculateAttributeXP(edge, DL.getArchetype('ganger')),
    XP.ATTRIBUTE_COSTS[12] - XP.ATTRIBUTE_COSTS[1]);
const edgeSkill = build('ganger', c => { c.skills.weaponSkill = 9; });
check('Skill 9 costs as the edge 8', XP.calculateSkillXP(edgeSkill, DL.getArchetype('ganger')),
    XP.SKILL_COSTS[8] - XP.SKILL_COSTS[0]);

// --- getBaseline ---
const inq = build('inquisitor');
check('getBaseline is a function', typeof XP.getBaseline, 'function');
// A missing function reads as an empty baseline, so each later check still runs.
const baseline = c => (typeof XP.getBaseline === 'function' ? XP.getBaseline(c) : { attributes: {}, skills: {} });
let b = baseline(inq);
check('Inquisitor baseline with no choice: intellect', b.attributes.intellect, 4);
check('Inquisitor baseline with no choice: willpower', b.attributes.willpower, 4);
check('Inquisitor baseline with no choice: each skill 0', Object.values(b.skills).every(v => v === 0), true);
check('Inquisitor baseline with no choice: no key choice1 in skills', 'choice1' in b.skills, false);
inq.archetypeSkillChoices = { choice1: 'insight', choice2: 'scholar' };
b = baseline(inq);
check('Inquisitor baseline with two choices: insight', b.skills.insight, 4);
check('Inquisitor baseline with two choices: scholar', b.skills.scholar, 4);
inq.archetypeSkillChoices = { choice1: 'zz' };
b = baseline(inq);
check('Inquisitor baseline with a choice that is no skill: each skill 0', Object.values(b.skills).every(v => v === 0), true);

// --- resetStats ---
const rs = build('inquisitor', c => { c.skills.choice1 = 7; c.skills.insight = 6; });
State.resetStats();
check('resetStats keeps an unknown key', rs.skills.choice1, 7);
check('resetStats sets a known skill to its baseline', rs.skills.insight, 0);
check('resetStats writes no NaN to the skills', noNaN(rs.skills), true);

// --- decreaseSkill ---
const dec = build('inquisitor', c => { c.archetypeSkillChoices = { choice1: 'insight' }; c.skills.insight = 4; });
check('decreaseSkill stops at the chosen free value', State.decreaseSkill('insight'), false);
check('decreaseSkill leaves the chosen skill at 4', dec.skills.insight, 4);

// --- the Stats tab ---
lists['skills-list'] = element();
StatsTab.renderSkills();
const insightRow = lists['skills-list'].children.map(r => r.innerHTML).find(h => h.includes('data-skill="insight"')) || '';
check('Stats tab: the decrease button of the chosen skill is disabled', /btn-decrease" data-skill="insight"[^>]*disabled/.test(insightRow), true);

console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
process.exit(failures ? 1 : 0);
