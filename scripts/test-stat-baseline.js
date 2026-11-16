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

// --- the attribute side of the baseline ---
const ogryn = build('ganger', c => { c.species = { id: 'ogryn', xpCost: 0 }; c.archetype = { id: null, xpCost: 0 }; });
check('Ogryn with no archetype: the baseline strength is 5', baseline(ogryn).attributes.strength, 5);

const inqAttr = build('inquisitor', c => { c.attributes.intellect = 4; });
check('Inquisitor with intellect 4: decreaseAttribute stops at the free value', State.decreaseAttribute('intellect'), false);
check('Inquisitor with intellect 4: intellect stays 4', inqAttr.attributes.intellect, 4);
lists['attributes-list'] = element();
StatsTab.renderAttributes();
const intellectRow = lists['attributes-list'].children.map(r => r.innerHTML).find(h => h.includes('data-attr="intellect"')) || '';
check('Stats tab: the decrease button of intellect at the free value is disabled', /btn-decrease" data-attr="intellect"[^>]*disabled/.test(intellectRow), true);

// --- the guards of the XP sum, getBaseline and resetStats ---
const odd = build('ganger', c => { c.attributes.strength = Infinity; c.attributes.agility = '9'; c.skills.tech = Infinity; c.skills.pilot = '5'; });
check('Infinity and a string cost no attribute XP', XP.calculateAttributeXP(odd), 0);
check('Infinity and a string cost no skill XP', XP.calculateSkillXP(odd), 0);

// The setter refuses a choice key that is a skill name, so the fixture writes the stored field directly.
const keyIsSkill = build('tech_adept', c => { c.archetypeSkillChoices = { tech: 'insight' }; });
check('A stored choice under a skill-name key gives insight no free value', baseline(keyIsSkill).skills.insight, 0);

const unknownAttr = build('ganger', c => { c.attributes.foo = 3; });
State.resetStats();
check('resetStats keeps an unknown attribute key as stored', unknownAttr.attributes.foo, 3);
check('resetStats leaves no attribute undefined', Object.values(unknownAttr.attributes).every(v => v !== undefined), true);

// --- a change of a parent ---
let notifyCount = 0;
State.addListener(() => { notifyCount++; });
// A new character with the given species and archetype, set through the real setters.
function human(archetypeId) {
    State.newCharacter();
    State.setSpecies('human');
    if (archetypeId) State.setArchetype(archetypeId);
    return State.character;
}
const stats = c => JSON.parse(JSON.stringify({ attributes: c.attributes, skills: c.skills }));

// A6: a click on the selected species or archetype changes nothing
human('imperial_guardsman');
State.increaseAttribute('strength');
let snapshot = JSON.stringify(State.character);
let countBefore = notifyCount;
State.setSpecies('human');
check('A6: setSpecies with the current species changes nothing', JSON.stringify(State.character) === snapshot, true);
check('A6: setSpecies with the current species does not notify', notifyCount, countBefore);
State.setArchetype('imperial_guardsman');
check('A6: setArchetype with the current archetype changes nothing', JSON.stringify(State.character) === snapshot, true);
check('A6: setArchetype with the current archetype does not notify', notifyCount, countBefore);

// A7b and CC7: the custom archetype record stays
human();
State.setCustomArchetype();
State.setCustomArchetypeName('X');
State.addCustomKeyword('scum');
State.setCustomArchetype();
check('A7b: a second setCustomArchetype keeps the name', State.character.customArchetype.name, 'X');
State.setArchetype('ganger');
State.setCustomArchetype();
check('CC7: Custom, Ganger, Custom keeps the name', State.character.customArchetype.name, 'X');
check('CC7: Custom, Ganger, Custom keeps the keywords', State.character.customArchetype.keywords, ['SCUM']);
State.setSpecies('ogryn');
check('CC7: a species change clears the archetype', State.character.archetype.id, null);
check('CC7: a species change keeps the custom record', State.character.customArchetype.name, 'X');

// A4: a change of the archetype gives the free values of the new archetype only
const a = human('tech_adept');
State.setArchetype('ganger');
const spentA = XP.calculateSpentXP(a), statsA = stats(a);
const bChar = human('ganger');
check('A4: tech_adept then Ganger costs the same XP as Ganger', spentA, XP.calculateSpentXP(bChar));
check('A4: tech_adept then Ganger has the stats of Ganger', statsA, stats(bChar));

// A raised value stays after a change of the archetype
human('tech_adept');
State.increaseSkill('tech');
State.setArchetype('ganger');
check('Raised value: tech 4 stays after Ganger', State.character.skills.tech, 4);
check('Raised value: the free scholar goes to 0', State.character.skills.scholar, 0);
check('Raised value: the free intellect goes to 1', State.character.attributes.intellect, 1);

// P3: setCustomArchetype keeps a raised value
human('tech_adept');
State.increaseSkill('tech');
State.setCustomArchetype();
check('P3: Custom gives intellect 1', State.character.attributes.intellect, 1);
check('P3: Custom gives scholar 0', State.character.skills.scholar, 0);
check('P3: Custom keeps tech 4', State.character.skills.tech, 4);

// CC14: the kept custom keywords count only while the archetype is custom
human();
State.setCustomArchetype();
State.addCustomKeyword('psyker');
check('CC14: Custom with the keyword PSYKER is a psyker', State.isPsyker(), true);
State.setArchetype('ganger');
check('CC14: Ganger with a kept PSYKER keyword is no psyker', State.isPsyker(), false);
State.setSpecies('ogryn');
check('CC14: no archetype with a kept PSYKER keyword is no psyker', State.isPsyker(), false);
State.setCustomArchetype();
check('CC14: Custom again is a psyker', State.isPsyker(), true);

// A5: a change of the species gives the free values of the new species
State.newCharacter();
State.setSpecies('ogryn');
State.setSpecies('human');
check('A5: Ogryn then Human: the attribute XP is 0', XP.calculateAttributeXP(State.character), 0);
check('A5: Ogryn then Human: each attribute is 1', Object.values(State.character.attributes).every(v => v === 1), true);

// A species change keeps a raised value under the new maximum
human();
State.increaseAttribute('agility');
State.increaseAttribute('agility');
State.setSpecies('ogryn');
check('Species change: agility 3 stays (Ogryn maximum 7)', State.character.attributes.agility, 3);

// CC2: a species change lowers an attribute to the new maximum
human('ganger');
State.increaseAttribute('intellect');
State.increaseAttribute('intellect');
State.setSpecies('ogryn');
check('CC2: intellect 3 goes to the Ogryn maximum 1', State.character.attributes.intellect, 1);

// F1: a species change clears the archetype through the rebase
human('tech_adept');
State.setSpecies('ogryn');
check('F1: tech_adept then Ogryn: tech is 0', State.character.skills.tech, 0);
check('F1: tech_adept then Ogryn: scholar is 0', State.character.skills.scholar, 0);
check('F1: tech_adept then Ogryn: the skill XP is 0', XP.calculateSkillXP(State.character), 0);

// F1: a second setCustomArchetype changes nothing
human();
State.setCustomArchetype();
State.addWargear('lasgun');
State.addCustomStartingWargear('knife');
snapshot = JSON.stringify(State.character);
countBefore = notifyCount;
State.setCustomArchetype();
check('F1: a second setCustomArchetype changes nothing', JSON.stringify(State.character) === snapshot, true);
check('F1: a second setCustomArchetype does not notify', notifyCount, countBefore);

// F2: a raised value under the new free value goes up to it
human();
State.increaseAttribute('strength');
State.increaseAttribute('strength');
State.setSpecies('ogryn');
check('F2: Human strength 3 then Ogryn: strength is 5', State.character.attributes.strength, 5);
check('F2: Human strength 3 then Ogryn: the attribute XP is 0', XP.calculateAttributeXP(State.character), 0);

// F2: setArchetype clears the stored skill choices
human('inquisitor');
State.character.archetypeSkillChoices = { choice1: 'insight' };
State.setArchetype('ganger');
check('F2: setArchetype clears archetypeSkillChoices', State.character.archetypeSkillChoices, {});

// A2: the "any skill" choice of an archetype is stored, and the chosen skill gets the bonus value
human('inquisitor');
check('A2: the Inquisitor has no choice key in skills', Object.keys(State.character.skills).some(k => k.startsWith('choice')), false);
let before = notifyCount;
check('A2: choice1 to insight is accepted', State.setArchetypeSkillChoice('choice1', 'insight'), true);
check('A2: an accepted choice notifies', notifyCount > before, true);
check('A2: insight is 4', State.character.skills.insight, 4);
before = notifyCount;
check('A2: choice2 to insight is refused (choice1 holds it)', State.setArchetypeSkillChoice('choice2', 'insight'), false);
check('A2: a refused choice does not notify', notifyCount, before);
check('A2: choice2 to scholar is accepted', State.setArchetypeSkillChoice('choice2', 'scholar'), true);
check('A2: scholar is 4', State.character.skills.scholar, 4);
check('A2: the two chosen skills cost no skill XP', XP.calculateSkillXP(State.character), 0);
check('A2: choice1 to medicae is accepted', State.setArchetypeSkillChoice('choice1', 'medicae'), true);
check('A2: insight goes back to 0', State.character.skills.insight, 0);
check('A2: medicae is 4', State.character.skills.medicae, 4);
check('A2: the stored choices', State.character.archetypeSkillChoices, { choice1: 'medicae', choice2: 'scholar' });
check('A2: weaponSkill is no choice key', State.setArchetypeSkillChoice('weaponSkill', 'insight'), false);
check('A2: zz is no skill name', State.setArchetypeSkillChoice('choice1', 'zz'), false);
check('A2: an empty string clears the choice', State.setArchetypeSkillChoice('choice1', ''), true);
check('A2: medicae goes back to 0', State.character.skills.medicae, 0);
human('ganger');
check('A2: Ganger has no choice key', State.setArchetypeSkillChoice('choice1', 'insight'), false);
check('A2: Ganger: a skill name is no choice key', State.setArchetypeSkillChoice('cunning', 'insight'), false);

// A2 (F3): a clear of each key returns true, also the second clear
human('inquisitor');
State.setArchetypeSkillChoice('choice1', 'insight');
State.setArchetypeSkillChoice('choice2', 'scholar');
check('A2: the clear of choice1 returns true', State.setArchetypeSkillChoice('choice1', ''), true);
check('A2: the clear of choice2 returns true', State.setArchetypeSkillChoice('choice2', ''), true);
check('A2: scholar goes back to 0', State.character.skills.scholar, 0);

// A2 (F2): a stored key that is not a key of the archetype does not hold a skill
human('inquisitor');
State.character.archetypeSkillChoices = { weaponSkill: 'insight', foo: 'scholar' };
check('A2: a stored key of no bonus does not block insight', State.setArchetypeSkillChoice('choice2', 'insight'), true);
check('A2: a stored key of no bonus does not block scholar', State.setArchetypeSkillChoice('choice2', 'scholar'), true);

// TC4-1: the value before the choice comes back when the choice moves away
function buyAwareness3() {
    human('inquisitor');
    State.setAdditionalXP('5000');
    State.increaseSkill('awareness'); State.increaseSkill('awareness'); State.increaseSkill('awareness');
}
buyAwareness3();
check('TC4-1: awareness is 3 before the walk', State.character.skills.awareness, 3);
const walkStart = XP.calculateSkillXP(State.character);
check('TC4-1: the walk start costs skill XP', walkStart > 0, true);
for (const s of ['athletics', 'awareness', 'ballisticSkill', 'cunning']) State.setArchetypeSkillChoice('choice1', s);
check('TC4-1: walk: awareness is 3', State.character.skills.awareness, 3);
check('TC4-1: walk: athletics is 0', State.character.skills.athletics, 0);
check('TC4-1: walk: ballisticSkill is 0', State.character.skills.ballisticSkill, 0);
check('TC4-1: walk: cunning is 4', State.character.skills.cunning, 4);
check('TC4-1: walk: the skill XP is the total before the walk', XP.calculateSkillXP(State.character), walkStart);

// A value above the bonus stays when the choice moves away
human('inquisitor');
State.setAdditionalXP('5000');
State.setArchetypeSkillChoice('choice1', 'insight');
State.increaseSkill('insight');
check('TC4-1: insight is 5 while chosen', State.character.skills.insight, 5);
State.setArchetypeSkillChoice('choice1', 'medicae');
check('TC4-1: a value above the bonus stays', State.character.skills.insight, 5);

// A clear gives the kept value back
buyAwareness3();
State.setArchetypeSkillChoice('choice1', 'awareness');
check('TC4-1: awareness is 4 while chosen', State.character.skills.awareness, 4);
State.setArchetypeSkillChoice('choice1', '');
check('TC4-1: the clear gives awareness 3 back', State.character.skills.awareness, 3);

// A selection of the chosen skill again keeps the kept value
buyAwareness3();
State.setArchetypeSkillChoice('choice1', 'awareness');
State.setArchetypeSkillChoice('choice1', 'awareness');
State.setArchetypeSkillChoice('choice1', '');
check('TC4-1: the same skill twice keeps the kept value', State.character.skills.awareness, 3);

// After a load the memory is empty, and the old rule applies
buyAwareness3();
State.setArchetypeSkillChoice('choice1', 'awareness');
State.loadCharacter(JSON.parse(JSON.stringify(State.character)));
check('TC4-1: the memory is empty after a load', State._skillChoicePrior, {});
State.setArchetypeSkillChoice('choice1', 'ballisticSkill');
check('TC4-1: after a load the old skill at the bonus goes to its free value', State.character.skills.awareness, 0);

// The memory is not part of the stored character
buyAwareness3();
State.setArchetypeSkillChoice('choice1', 'awareness');
check('TC4-1: the memory is in no stored field', JSON.stringify(State.character).includes('_skillChoicePrior'), false);

// A new character and a new archetype clear the memory
State.newCharacter();
check('TC4-1: the memory is empty after a new character', State._skillChoicePrior, {});
buyAwareness3();
State.setArchetypeSkillChoice('choice1', 'awareness');
State.setArchetype('inquisitorial_acolyte');
check('TC4-1: the memory is empty after a new archetype', State._skillChoicePrior, {});

// Two keys: a walk on choice2 does not touch the kept value of choice1
buyAwareness3();
State.setArchetypeSkillChoice('choice1', 'awareness');
for (const s of ['athletics', 'cunning', 'medicae']) State.setArchetypeSkillChoice('choice2', s);
check('TC4-1: two keys: awareness stays 4 under choice1', State.character.skills.awareness, 4);
State.setArchetypeSkillChoice('choice1', '');
check('TC4-1: two keys: choice1 still gives awareness 3 back', State.character.skills.awareness, 3);
check('TC4-1: two keys: the walk on choice2 leaves athletics at 0', State.character.skills.athletics, 0);

// TC4-3: a change of the parent gives the kept value back, then empties the memory
const parentChanges = {
    'a new archetype (Ganger)': () => State.setArchetype('ganger'),
    'a new archetype (Acolyte)': () => State.setArchetype('inquisitorial_acolyte'),
    'Custom Archetype': () => State.setCustomArchetype(),
    'a new species': () => State.setSpecies('ogryn')
};
for (const [name, change] of Object.entries(parentChanges)) {
    buyAwareness3();
    State.setArchetypeSkillChoice('choice1', 'awareness');
    change();
    check(`TC4-3: ${name}: awareness is 3`, State.character.skills.awareness, 3);
    check(`TC4-3: ${name}: the memory is empty`, State._skillChoicePrior, {});
}

// TC4-4: Reset Stats empties the memory, so the reset ranks do not come back
buyAwareness3();
State.setArchetypeSkillChoice('choice1', 'awareness');
State.resetStats();
check('TC4-4: the memory is empty after Reset Stats', State._skillChoicePrior, {});
State.setArchetypeSkillChoice('choice1', 'athletics');
check('TC4-4: reset: awareness is at its free value', State.character.skills.awareness, 0);
check('TC4-4: reset: the skill XP holds no cost for awareness', XP.calculateSkillXP(State.character), 0);

// TC4-4: a value that the user decreased while the skill was chosen does not come back
human('inquisitor');
State.setAdditionalXP('5000');
for (let i = 0; i < 5; i++) State.increaseSkill('awareness');
State.setArchetypeSkillChoice('choice1', 'awareness');
check('TC4-4: awareness 5 stays while chosen', State.character.skills.awareness, 5);
State.decreaseSkill('awareness');
check('TC4-4: awareness is 4 after one decrease', State.character.skills.awareness, 4);
State.setArchetypeSkillChoice('choice1', 'athletics');
check('TC4-4: decrease: awareness is 4 after the move', State.character.skills.awareness, 4);
human('inquisitor');
State.setAdditionalXP('5000');
for (let i = 0; i < 6; i++) State.increaseSkill('awareness');
State.setArchetypeSkillChoice('choice1', 'awareness');
State.decreaseSkill('awareness'); State.decreaseSkill('awareness');
check('TC4-4: awareness is 4 after two decreases', State.character.skills.awareness, 4);
State.setArchetypeSkillChoice('choice1', '');
check('TC4-4: decrease: a clear gives awareness 4', State.character.skills.awareness, 4);

console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
process.exit(failures ? 1 : 0);
