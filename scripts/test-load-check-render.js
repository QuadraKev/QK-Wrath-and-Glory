// Tests that a hostile number value cannot reach the page after the real character load (class (b) sites, spec section 8.5).
// Each row puts a hostile value into one field, loads the character through the real State.loadCharacter, renders the site
// and looks for the raw tag. The load check (CharacterCheck.repair) must turn the value into a number before the render.
// Run: node scripts/test-load-check-render.js

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

// A DOM stub. Each element is a stub whose innerHTML setter appends the string to `written`.
// A set of textContent stores the text. A read of innerHTML after that returns the text with only
// & < > escaped, as a browser does (the quote stays raw).
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
            removeEventListener() {},
            appendChild(child) { return child; },
            setAttribute() {},
            getAttribute() { return null; },
            focus() {},
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
        addEventListener() {},
        removeEventListener() {},
        body: { appendChild(child) { return child; } }
    };
    return { document, written };
}

const rec = makeRecordingDocument();

// Clears `written`, runs fn, returns written.join('') plus the returned string.
function recorded(fn) {
    rec.written.length = 0;
    const returned = fn();
    return rec.written.join('') + (typeof returned === 'string' ? returned : '');
}

// Runs a source file into a context. A top-level const stays visible to the later files of the context.
function load(ctx, rel) {
    vm.runInContext(readSource(rel), ctx, { filename: rel });
}

// Reads a global (also a const global) out of a context.
function get(ctx, name) {
    return vm.runInContext(name, ctx);
}

// One context with the real files, in the order of creator/index.html. The data cache holds the files
// that data-loader.js reads at start, and the two threat files that the Followers tab reads on demand.
const CACHE = {};
for (const f of ['species.json', 'archetypes.json', 'talents.json', 'weapons.json', 'armor.json', 'equipment.json',
    'psychic-powers.json', 'ascension-packages.json', 'backgrounds.json', 'weapon-upgrades.json',
    'injuries-corruption.json', 'keyword-categories.json', 'holy-relics.json', 'glossary.json',
    'threats.json', 'threat-weapons.json'])
    CACHE[f] = readJson(`data/${f}`);

const warns = [];
const ctx = vm.createContext({
    console: { log: console.log, error: console.error, info: console.info, warn: (...args) => { warns.push(args.join(' ')); } },
    document: rec.document,
    window: {
        getComputedStyle: () => ({ display: 'block' }),
        addEventListener() {},
        removeEventListener() {}
    },
    MutationObserver: function () { this.observe = () => {}; },
    localStorage: {},
    setTimeout: () => 0,
    clearTimeout: () => {}
});
load(ctx, 'creator/js/data-loader.js');
get(ctx, 'DataLoader').cache = CACHE;
for (const f of ['xp-calculator', 'derived-stats', 'prerequisite', 'character-check', 'state', 'improvised-builder',
    'custom-wargear', 'keyword-bonus', 'followers'])
    load(ctx, `creator/js/${f}.js`);
for (const f of ['ascension', 'archetype', 'stats', 'injuries', 'followers', 'character-sheet'])
    load(ctx, `creator/tabs/${f}-tab.js`);

const State = get(ctx, 'State');
const DataLoader = get(ctx, 'DataLoader');
const DerivedStats = get(ctx, 'DerivedStats');
const CharacterSheetTab = get(ctx, 'CharacterSheetTab');
const StatsTab = get(ctx, 'StatsTab');
const AscensionTab = get(ctx, 'AscensionTab');
const ArchetypeTab = get(ctx, 'ArchetypeTab');
const InjuriesTab = get(ctx, 'InjuriesTab');
const FollowersTab = get(ctx, 'FollowersTab');
const ImprovisedBuilder = get(ctx, 'ImprovisedBuilder');

const EVIL = '<img src=x onerror=alert(1)>';
const base = { name: 'H', species: { id: 'human', xpCost: 0, subOptions: [] }, archetype: { id: 'imperial_guardsman', xpCost: 0 } };

// Loads the hostile character through the real State.loadCharacter (JSON round trip first).
function loadHostile(over) {
    State.loadCharacter(JSON.parse(JSON.stringify({ ...base, ...over })));
}
const noRawTag = html => !html.includes('<img');

// [label, over, render]  render returns the HTML string (or the joined recorded innerHTML)
const B_SINKS = [
    ['attributes on the sheet', { attributes: { strength: EVIL } }, () => CharacterSheetTab.renderAttributes(State.character)],
    ['traits on the sheet', { attributes: { toughness: EVIL }, rank: EVIL }, () => CharacterSheetTab.renderTraits(DerivedStats.getAllDerivedStats(State.character))],
    ['skills on the sheet', { skills: { weaponSkill: EVIL } }, () => CharacterSheetTab.renderSkills(State.character)],
    ['weapon cells on the sheet', { rank: EVIL, attributes: { strength: EVIL }, wargear: [{ id: 'chainsword', isStarting: false, equipped: true }] }, () => CharacterSheetTab.renderWeapons(State.character)],
    ['Ascension card targetTier', { ascensions: [{ targetTier: EVIL, type: 'package', packageId: 'back_from_the_brink', archetypeId: null }] }, () => CharacterSheetTab.renderAscensions(State.character)],
    ['stats tab attributes', { attributes: { agility: EVIL } }, () => recorded(() => StatsTab.renderAttributes())],
    ['stats tab derived stats', { corruption: EVIL, attributes: { willpower: EVIL } }, () => recorded(() => StatsTab.renderDerivedStats())],
    ['stats tab skills', { skills: { awareness: EVIL } }, () => recorded(() => StatsTab.renderSkills())],
    // A string tier builds no slot (ascension-tab.js:27-39), so a tier row cannot fail: no tier row here.
    // The prerequisite text renders only for a slot with a package or an archetype type.
    ['ascension tab package prerequisites', { attributes: { willpower: EVIL }, skills: { persuasion: EVIL }, ascensions: [{ targetTier: 2, type: 'package', packageId: null, archetypeId: null }] }, () => recorded(() => AscensionTab.render())],
    ['ascension tab archetype prerequisites', { attributes: { strength: EVIL }, skills: { athletics: EVIL }, rank: 3, ascensions: [{ targetTier: 4, type: 'archetype', packageId: null, archetypeId: null }] }, () => recorded(() => AscensionTab.render())],
    ['archetype tab tier', { tier: EVIL, archetype: { id: 'custom', xpCost: 0 } }, () => recorded(() => ArchetypeTab.renderCustomConfig())],
    ['injuries tab corruption', { corruption: EVIL }, () => InjuriesTab.renderCorruption(State.character, DataLoader.getInjuriesCorruptionData())],
    ['followers tab counts', { followers: [{ id: 'flw_a', threatId: 'x', name: '', kind: 'mob', count: EVIL, livingCount: EVIL, notes: '' }] }, () => FollowersTab.renderRosterItem(State.character.followers[0], State.character)],
    ['improvised form halfTime and rank', { rank: EVIL, wargear: [{ id: 'improvised_melee_weapon', isStarting: false, improvised: { name: 'L', details: '', halfTime: EVIL, damageRank: true, removeUnwieldy: false, doubleRange: false, traits: [] } }] }, () => recorded(() => { ImprovisedBuilder.open(0); })]
];

for (const [label, over, render] of B_SINKS) {
    loadHostile(over);
    let html = '', threw = false;
    try { html = render(); } catch (e) { threw = e.message; }
    check(`(b) ${label}: no throw`, threw, false);
    check(`(b) ${label}: no raw tag`, noRawTag(html), true);
}

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) FAILED.`);
process.exit(failures ? 1 : 0);
